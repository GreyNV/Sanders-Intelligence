// Order-level COGS: count each shipped order once, preserving zero costs and credits.
export function summarizeOrderCosts(orders, costs) {
  const costById = new Map(
    costs.map((row) => [String(row.OrderID ?? row.OrderId ?? row.ID), row]),
  )
  const seen = new Set()
  let amount = 0
  let missing = 0
  for (const order of orders) {
    const id = String(order.ID ?? order.OrderID ?? order.OrderId ?? '')
    if (!id || seen.has(id))
      throw new Error('Missing or duplicate order ID in shipment pages')
    seen.add(id)
    const pnl = costById.get(id)
    const raw = pnl?.ItemCostUsd
    if (raw == null || raw === '' || !Number.isFinite(Number(raw))) {
      missing++
      continue
    }
    amount += Number(raw)
  }
  return {
    cogs_amount: Math.round((amount + Number.EPSILON) * 100) / 100,
    order_count: seen.size,
    missing_cost_count: missing,
  }
}
async function mapLimit(values, fn, concurrency = 4) {
  const result = new Array(values.length)
  let cursor = 0
  await Promise.all(
    Array.from({ length: Math.min(concurrency, values.length) }, async () => {
      while (cursor < values.length) {
        const i = cursor++
        result[i] = await fn(values[i])
      }
    }),
  )
  return result
}
export async function fetchDayCosts(
  get,
  post,
  date,
  pageSize = 50,
  progress = () => {},
) {
  async function page(number) {
    const params = new URLSearchParams({
      'model.pageNumber': String(number),
      'model.pageSize': String(pageSize),
      'model.shipFromDate': `${date}T00:00:00`,
      'model.shipToDate': `${date}T23:59:59`,
    })
    const body = await get(`/api/Orders?${params}`)
    if (!Array.isArray(body.Items))
      throw new Error('Unexpected SellerCloud orders response')
    const total = Number(body.TotalResults ?? body.TotalCount)
    if (!Number.isSafeInteger(total) || total < 0)
      throw new Error('Missing SellerCloud result count')
    progress({
      date,
      phase: 'orders',
      page: number,
      rows: body.Items.length,
      total,
    })
    return {
      total,
      items: body.Items.map((row) => ({
        ID: row.ID ?? row.OrderID ?? row.OrderId,
        ShipDate: row.ShipDate,
      })),
    }
  }
  const first = await page(1)
  const effectiveSize = Math.min(pageSize, first.items.length || pageSize)
  const pageCount = Math.ceil(first.total / effectiveSize)
  if (pageCount > 10000) throw new Error('SellerCloud pagination limit reached')
  const rest = await mapLimit(
    Array.from({ length: Math.max(0, pageCount - 1) }, (_, i) => i + 2),
    page,
  )
  if (rest.some((p) => p.total !== first.total))
    throw new Error('Orders changed while paging; rerun this day')
  const orders = [...first.items, ...rest.flatMap((p) => p.items)]
  if (orders.length !== first.total)
    throw new Error('Incomplete SellerCloud page sequence')
  const batches = Array.from(
    { length: Math.ceil(orders.length / 100) },
    (_, i) => orders.slice(i * 100, (i + 1) * 100),
  )
  const costs = (
    await mapLimit(batches, async (batch) => {
      const ids = batch.map((row) => Number(row.ID))
      if (ids.some((id) => !Number.isSafeInteger(id) || id <= 0))
        throw new Error('Invalid SellerCloud order ID')
      const rows = await post('/api/Orders/ProfitAndLoss', { Orders: ids })
      if (!Array.isArray(rows))
        throw new Error('Unexpected SellerCloud P&L response')
      progress({ date, phase: 'costs', orders: ids.length })
      return rows
    })
  ).flat()
  const priced = new Set(costs.filter(row => row.ItemCostUsd != null && row.ItemCostUsd !== '' && Number.isFinite(Number(row.ItemCostUsd))).map(row => String(row.OrderID ?? row.OrderId ?? row.ID)))
  const missingOrderIds = orders.filter(row => !priced.has(String(row.ID))).map(row => row.ID)
  if (missingOrderIds.length) progress({ date, phase: 'missing_costs', order_ids: missingOrderIds })
  return {
    sale_date: date,
    ...summarizeOrderCosts(orders, costs),
    source: 'sellercloud_item_cost_usd',
    fetched_at: new Date().toISOString(),
  }
}
