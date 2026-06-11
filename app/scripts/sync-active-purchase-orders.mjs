import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const SC_ENV_PATH = process.env.SC_ENV_PATH || 'D:/Sanders/purchasing-automation/.env'
const APP_ENV_PATH = process.env.APP_ENV_PATH || resolve(process.cwd(), '.env.vercel.local')
const PAGE_SIZE = Number(process.env.SC_PO_PAGE_SIZE || 50)
const ITEM_CONCURRENCY = Number(process.env.SC_PO_ITEM_CONCURRENCY || 4)

function loadEnv(path) {
  const env = {}
  for (const rawLine of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#') || !line.includes('=')) continue
    const [key, ...parts] = line.split('=')
    env[key.trim()] = parts.join('=').trim().replace(/^["']|["']$/g, '')
  }
  return env
}

function mergeNonEmpty(...envs) {
  const merged = {}
  for (const env of envs) {
    for (const [key, value] of Object.entries(env)) {
      if (value !== '') merged[key] = value
    }
  }
  return merged
}

const scEnv = loadEnv(SC_ENV_PATH)
const appEnv = mergeNonEmpty(loadEnv(resolve(process.cwd(), '.env')), loadEnv(APP_ENV_PATH))
const supabaseUrl = appEnv.VITE_SUPABASE_URL
const serviceKey = appEnv.SUPABASE_SERVICE_KEY || appEnv.SUPABASE_SERVICE_ROLE_KEY
const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })

const PO_SYNC_KEY = 'sellercloud_purchase_orders'

const PURCHASE_ORDER_STATUSES = { 0: 'Saved', 1: 'Ordered', 2: 'Pending', 3: 'Received', 4: 'Cancelled', 5: 'Completed' }
const SHIPPING_STATUSES = { 0: 'Not Shipped', 1: 'Shipped', 2: 'Delivered' }
const RECEIVING_STATUSES = { 0: 'Not Received', 1: 'Partially Received', 2: 'Received' }
const PAYMENT_STATUSES = { 0: 'Unknown', 10: 'Unpaid' }

function first(record, keys) {
  for (const key of keys) if (record?.[key] != null) return record[key]
  return null
}

function nullableNumber(value) {
  if (value == null || value === '') return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function nullableText(value) {
  return value == null || value === '' ? null : String(value)
}

function nullableBoolean(value) {
  if (value == null) return null
  if (typeof value === 'boolean') return value
  return String(value).toLowerCase() === 'true'
}

function nullableDate(value) {
  if (value == null || value === '') return null
  const date = new Date(String(value))
  return Number.isFinite(date.getTime()) && date.getUTCFullYear() > 1901 ? date.toISOString() : null
}

function statusText(code, labels, fallback) {
  if (code != null && labels[code]) return labels[code]
  if (fallback != null && fallback !== '') return String(fallback)
  if (code != null) return String(code)
  return 'Unknown'
}

function rows(body) {
  if (Array.isArray(body)) return body
  for (const key of ['Items', 'items', 'Results', 'results', 'Data', 'data']) {
    if (Array.isArray(body?.[key])) return body[key]
  }
  return []
}

function isActivePurchaseOrder(po) {
  const poStatusCode = nullableNumber(first(po, ['PurchaseOrderStatus', 'POStatusCode', 'StatusCode']))
  const receivingStatusCode = nullableNumber(first(po, ['ReceivingStatus', 'ReceivingStatusCode']))
  const cancelledPoId = nullableNumber(first(po, ['CancelledPOID', 'CancelledPOId', 'cancelledPoId']))
  return poStatusCode === 1
    && (receivingStatusCode === 0 || receivingStatusCode === 1)
    && (cancelledPoId == null || cancelledPoId === 0)
}

function toPurchaseOrderRow(po) {
  const poStatusCode = nullableNumber(first(po, ['PurchaseOrderStatus', 'POStatusCode', 'StatusCode']))
  const shippingStatusCode = nullableNumber(first(po, ['PurchaseOrdersShippingStatus', 'ShippingStatusCode']))
  const receivingStatusCode = nullableNumber(first(po, ['ReceivingStatus', 'ReceivingStatusCode']))
  const paymentStatusCode = nullableNumber(first(po, ['PaymentStatus', 'PaymentStatusCode']))
  return {
    id: Number(first(po, ['ID', 'Id', 'id', 'POID', 'POId', 'PurchaseOrderID'])),
    purchase_title: nullableText(first(po, ['PurchaseTitle', 'purchaseTitle', 'Title'])),
    vendor_id: nullableNumber(first(po, ['VendorID', 'VendorId', 'vendorId'])),
    vendor_name: nullableText(first(po, ['VendorName', 'DisplayName', 'vendorName'])),
    po_status: statusText(poStatusCode, PURCHASE_ORDER_STATUSES, first(po, ['POStatus', 'PoStatus', 'Status', 'po_status'])),
    po_status_code: poStatusCode,
    payment_status: statusText(paymentStatusCode, PAYMENT_STATUSES, null),
    payment_status_code: paymentStatusCode,
    shipping_status: statusText(shippingStatusCode, SHIPPING_STATUSES, first(po, ['ShippingStatus', 'shippingStatus'])),
    shipping_status_code: shippingStatusCode,
    receiving_status: statusText(receivingStatusCode, RECEIVING_STATUSES, null),
    receiving_status_code: receivingStatusCode,
    is_active: isActivePurchaseOrder(po),
    date_ordered: nullableDate(first(po, ['DateOrdered', 'dateOrdered'])),
    expected_delivery_date: nullableDate(first(po, ['ExpectedDeliveryDate', 'expectedDeliveryDate'])),
    created_on: nullableDate(first(po, ['CreatedOn', 'createdOn'])),
    shipped_on: nullableDate(first(po, ['ShippedOn', 'shippedOn'])),
    grand_total: nullableNumber(first(po, ['GrandTotal', 'grandTotal'])),
    order_total: nullableNumber(first(po, ['OrderTotal', 'orderTotal'])),
    tax_total: nullableNumber(first(po, ['TaxTotal', 'taxTotal'])),
    shipping_total: nullableNumber(first(po, ['ShippingTotal', 'shippingTotal'])),
    unit_counts: nullableNumber(first(po, ['UnitCounts', 'unitCounts'])),
    warehouse_id: nullableNumber(first(po, ['WarehouseID', 'WarehouseId', 'warehouseId'])),
    company_id: nullableNumber(first(po, ['CompanyID', 'CompanyId', 'companyId'])),
    memo: nullableText(first(po, ['Memo', 'memo'])),
    tracking_numbers: first(po, ['TrackingNumbers', 'trackingNumbers']) ?? null,
    approved: nullableBoolean(first(po, ['PurchaseOrdersApproved', 'Approved', 'approved'])),
    cancelled_po_id: nullableNumber(first(po, ['CancelledPOID', 'CancelledPOId', 'cancelledPoId'])),
    updated_on: nullableDate(first(po, ['UpdatedOn', 'updatedOn', 'UpdatedDate', 'updatedDate', 'LastUpdatedOn', 'lastUpdatedOn', 'LastRevisedOn', 'lastRevisedOn'])),
    synced_at: new Date().toISOString(),
  }
}

function toPOItemRow(item, poId, bridge, index) {
  const sourceSku = String(first(item, ['ProductID', 'ProductId', 'productId', 'SKU', 'sku']) ?? '')
  const rawId = Number(first(item, ['ID', 'Id', 'id']))
  const qtyOrdered = nullableNumber(first(item, ['QtyUnitsOrdered', 'QtyOrdered', 'qtyUnitsOrdered', 'quantity']))
  const qtyReceived = nullableNumber(first(item, ['QtyUnitsReceived', 'QtyReceived', 'qtyUnitsReceived']))
  const receivingStatusCode = nullableNumber(first(item, ['ReceivingStatus', 'ReceivingStatusCode']))
  return {
    id: Number.isFinite(rawId) && rawId > 0 ? rawId : poId * 100000 + index,
    po_id: poId,
    source_sku: sourceSku,
    planning_sku: bridge.get(sourceSku.toLowerCase()) ?? null,
    product_name: nullableText(first(item, ['ProductName', 'productName'])),
    qty_units_ordered: qtyOrdered,
    qty_units_received: qtyReceived,
    qty_units_open: qtyOrdered == null ? null : Math.max(0, qtyOrdered - Number(qtyReceived ?? 0)),
    qty_units_per_case: nullableNumber(first(item, ['QtyUnitsPerCase', 'qtyUnitsPerCase'])),
    unit_price: nullableNumber(first(item, ['UnitPrice', 'unitPrice'])),
    case_price: nullableNumber(first(item, ['CasePrice', 'casePrice'])),
    discount_type: nullableText(first(item, ['DiscountType', 'discountType'])),
    discount_value: nullableNumber(first(item, ['DiscountValue', 'discountValue'])),
    expected_delivery_date: nullableDate(first(item, ['ExpectedDeliveryDate', 'expectedDeliveryDate'])),
    receiving_status: statusText(receivingStatusCode, RECEIVING_STATUSES, null),
    receiving_status_code: receivingStatusCode,
  }
}

async function getSellerCloudToken() {
  const base = scEnv.SELLERCLOUD_DELTA_BASE.replace(/\/$/, '')
  const response = await fetch(`${base}/api/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ Username: scEnv.SELLERCLOUD_USERNAME, Password: scEnv.SELLERCLOUD_PASSWORD }),
  })
  if (!response.ok) throw new Error(`SellerCloud auth failed (${response.status})`)
  const body = await response.json()
  const token = body.access_token || body.AccessToken || body.token || body.Token
  if (!token) throw new Error('SellerCloud token response did not include a token')
  return token
}

async function scGet(path, token) {
  const base = scEnv.SELLERCLOUD_DELTA_BASE.replace(/\/$/, '')
  const response = await fetch(`${base}${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  })
  if (!response.ok) throw new Error(`SellerCloud GET ${path} failed (${response.status})`)
  return response.json()
}

async function loadSkuBridge() {
  const bridge = new Map()
  let from = 0
  while (true) {
    const { data, error } = await supabase
      .from('sku_bridge')
      .select('source_sku, planning_sku, source_system, is_active')
      .eq('is_active', true)
      .range(from, from + 999)
    if (error) throw error
    for (const row of data ?? []) {
      if (!row.source_sku || !row.planning_sku) continue
      if (!String(row.source_system ?? '').includes('seller_cloud')) continue
      bridge.set(String(row.source_sku).toLowerCase(), String(row.planning_sku))
    }
    if (!data || data.length < 1000) break
    from += 1000
  }
  return bridge
}

async function upsertInBatches(table, data, onConflict, batchSize = 500) {
  for (let index = 0; index < data.length; index += batchSize) {
    const chunk = data.slice(index, index + batchSize)
    const { error } = await supabase.from(table).upsert(chunk, { onConflict })
    if (error) throw error
  }
}

function uniqueById(rows) {
  return Array.from(new Map(rows.map(row => [row.id, row])).values())
}

async function mapLimit(values, limit, mapper) {
  const results = []
  let cursor = 0
  async function worker() {
    while (cursor < values.length) {
      const index = cursor
      cursor += 1
      results[index] = await mapper(values[index], index)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, values.length) }, worker))
  return results
}

async function main() {
  const started = Date.now()
  const token = await getSellerCloudToken()
  const bridge = await loadSkuBridge()
  const headers = []
  let totalResults = 0

  for (let page = 1; page < 10000; page += 1) {
    const body = await scGet(`/api/PurchaseOrders?pageNumber=${page}&pageSize=${PAGE_SIZE}`, token)
    const pageRows = rows(body)
    totalResults = Number(body.TotalResults || body.TotalCount || totalResults)
    headers.push(...pageRows)
    if (page % 10 === 0 || pageRows.length === 0) {
      console.log(JSON.stringify({ phase: 'headers', page, fetched: headers.length, totalResults }))
    }
    if (pageRows.length === 0 || (totalResults > 0 && headers.length >= totalResults)) break
  }

  const orderRows = uniqueById(headers.map(toPurchaseOrderRow).filter(row => Number.isFinite(row.id)))
  const activeRows = orderRows.filter(row => row.is_active)
  await upsertInBatches('purchase_orders', orderRows, 'id')
  console.log(JSON.stringify({ phase: 'orders_upserted', headers: orderRows.length, active: activeRows.length }))

  const itemResults = await mapLimit(activeRows, ITEM_CONCURRENCY, async (order, index) => {
    try {
      const body = await scGet(`/api/PurchaseOrders/${order.id}`, token)
      const itemRows = rows(body)
        .map((item, itemIndex) => toPOItemRow(item, order.id, bridge, itemIndex))
        .filter(row => row.source_sku)
      if ((index + 1) % 25 === 0) {
        console.log(JSON.stringify({ phase: 'items', activeProcessed: index + 1, activeTotal: activeRows.length }))
      }
      return { orderId: order.id, itemRows }
    } catch (error) {
      return { orderId: order.id, error: error instanceof Error ? error.message : String(error), itemRows: [] }
    }
  })

  const itemRows = itemResults.flatMap(result => result.itemRows)
  await upsertInBatches('po_items', itemRows, 'id')
  const failures = itemResults.filter(result => result.error)

  const newestCursor = orderRows
    .map(row => row.updated_on)
    .filter(Boolean)
    .sort()
    .at(-1) || new Date().toISOString()
  await supabase.from('sync_state').upsert({
    key: PO_SYNC_KEY,
    cursor_value: newestCursor,
    last_successful_sync_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    state: { nextPage: 1, totalResults, baselineHeaders: orderRows.length, baselineActive: activeRows.length },
    last_error: failures.length ? `${failures.length} item fetch failures` : null,
  }, { onConflict: 'key' })

  console.log(JSON.stringify({
    phase: 'done',
    headers: orderRows.length,
    active: activeRows.length,
    items: itemRows.length,
    failures: failures.length,
    durationMs: Date.now() - started,
    activeSampleIds: activeRows.slice(0, 10).map(row => row.id),
  }))
  if (failures.length) {
    console.log(JSON.stringify({ phase: 'failures', sample: failures.slice(0, 10) }))
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
