export interface HistoricalReceipt {
  receipt_id: string
  received_date: string
  po_id: string
  source_sku: string
  quantity: number
  unit_cost: number
  received_value: number
}
const normalize = (row: Record<string, unknown>) =>
  Object.fromEntries(
    Object.entries(row).map(([key, value]) => [
      key.toLowerCase().replace(/[^a-z0-9]/g, ''),
      value,
    ]),
  )
const present = (value: unknown) =>
  value !== undefined && value !== null && value !== ''
export function isSellerCloudReceiptExport(row: Record<string, unknown>) {
  const r = normalize(row)
  return 'receivedon' in r && 'receivesessionid' in r && 'qtyreceived' in r
}
function receiptTimestamp(value: unknown): string {
  // Excel Date cells represent local wall-clock dates, decoded by SheetJS as UTC.
  const text =
    value instanceof Date
      ? value.toISOString().replace(/Z$/, '')
      : String(value ?? '').trim()
  const match = text.match(
    /^(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,7}))?)?$/,
  )
  if (
    !match ||
    !Number.isFinite(Date.parse(match[1])) ||
    new Date(match[1]).toISOString().slice(0, 10) !== match[1] ||
    Number(match[2] ?? 0) > 23 ||
    Number(match[3] ?? 0) > 59 ||
    Number(match[4] ?? 0) > 59
  ) {
    throw new Error(
      'invalid received date; use the original SellerCloud date or YYYY-MM-DD',
    )
  }
  const fraction = (match[5] ?? '').replace(/0+$/, '')
  return `${match[1]}T${match[2] ?? '00'}:${match[3] ?? '00'}:${match[4] ?? '00'}${fraction ? '.' + fraction : ''}`
}
const aliases: Record<string, string[]> = {
  receipt_id: ['receiptid', 'receivingid', 'arrivalid'],
  received_date: ['receiveddate', 'datereceived', 'date', 'receivedon'],
  po_id: ['poid', 'purchaseorderid', 'purchaseordernumber', 'po'],
  source_sku: ['sku', 'productid', 'sourcesku'],
  quantity: ['quantity', 'qtyreceived', 'quantityreceived'],
  unit_cost: ['unitcost', 'unitprice', 'cost'],
}
export function parseReceiptRows(
  rows: Record<string, unknown>[],
  from: string,
  to: string,
): HistoricalReceipt[] {
  if (!rows.length) throw new Error('The export contains no receipt rows')
  if (rows.length > 50000)
    throw new Error('Import at most 50,000 rows at a time')
  const ids = new Set<string>()
  return rows.map((row, index) => {
    try {
      const r = normalize(row)
      const native = isSellerCloudReceiptExport(row)
      const get = (field: string) =>
        aliases[field].map((key) => r[key]).find(present)
      const text = (field: string) => String(get(field) ?? '').trim()
      const numeric = (value: unknown, field: string) => {
        const raw = String(value ?? '')
          .trim()
          .replace(/[$,\s]/g, '')
          .replace(/^\((.*)\)$/, '-$1')
        if (!raw || !Number.isFinite(Number(raw)))
          throw new Error(`invalid ${field}`)
        return Number(raw)
      }
      const timestamp = receiptTimestamp(get('received_date'))
      const received_date = timestamp.slice(0, 10),
        po_id = text('po_id'),
        source_sku = text('source_sku')
      let receipt_id = text('receipt_id')
      if (native) {
        const session = String(r.receivesessionid ?? '').trim()
        const warehouse = String(r.warehousename ?? '').trim()
        if (!session || !warehouse)
          throw new Error('receiving session and warehouse are required')
        if (
          String(r.currencycode ?? '')
            .trim()
            .toUpperCase() !== 'USD'
        )
          throw new Error('only USD SellerCloud receipts are supported')
        // Stable across reordered/repeated exports; sessions can contain multiple SKUs.
        receipt_id =
          'sc:' +
          JSON.stringify([po_id, session, source_sku, timestamp, warehouse])
      }
      if (!receipt_id || !po_id || !source_sku)
        throw new Error('receipt ID, PO ID, and SKU are required')
      if (ids.has(receipt_id)) throw new Error('duplicate receipt ID')
      ids.add(receipt_id)
      if (received_date < from || received_date > to)
        throw new Error('received date is outside the declared export range')
      const quantity = numeric(get('quantity'), 'quantity')
      let unit_cost = numeric(get('unit_cost'), 'unit cost')
      if (native) {
        // Prefer SellerCloud's final discounted price; never convert USD using its zero exchange-rate placeholder.
        if (present(r.adjustedpriceaftermultidiscount))
          unit_cost = numeric(
            r.adjustedpriceaftermultidiscount,
            'adjusted price',
          )
        else if (present(r.discountedprice))
          unit_cost = numeric(r.discountedprice, 'discounted price')
        else if (
          present(r.unitdiscount) &&
          numeric(r.unitdiscount, 'unit discount') !== 0
        )
          throw new Error(
            'discounted price is required for a discounted receipt',
          )
        if (present(r.extracostperunit))
          unit_cost += numeric(r.extracostperunit, 'extra cost per unit')
      }
      if (unit_cost < 0)
        throw new Error(
          'unit cost cannot be negative; use a negative quantity for reversals',
        )
      return {
        receipt_id,
        received_date,
        po_id,
        source_sku,
        quantity,
        unit_cost,
        received_value:
          Math.round((quantity * unit_cost + Number.EPSILON) * 100) / 100,
      }
    } catch (error) {
      throw new Error(
        `Row ${index + 2}: ${error instanceof Error ? error.message : 'invalid receipt'}`,
      )
    }
  })
}
export function prepareReceiptImport(
  source: Record<string, unknown>[],
  from: string,
  to: string,
  today: string,
) {
  const native = source.length > 0 && isSellerCloudReceiptExport(source[0])
  // Validate every source row, including today's rows, before excluding the incomplete day.
  const parsed = parseReceiptRows(
    source,
    from,
    native && to < today ? today : to,
  )
  const excludedToday =
    native && to < today
      ? parsed.filter((r) => r.received_date === today).length
      : 0
  const rows = parsed.filter(
    (r) => !(native && to < today && r.received_date === today),
  )
  if (rows.some((r) => r.received_date > to))
    throw new Error('Received date is outside the declared export range')
  if (!rows.length)
    throw new Error('No receipts fall within the selected completed-day range')
  return {
    rows,
    native,
    excludedToday,
    zeroCost: rows.filter((r) => r.unit_cost === 0).length,
    reversals: rows.filter((r) => r.quantity < 0).length,
  }
}
