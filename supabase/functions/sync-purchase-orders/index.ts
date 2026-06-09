import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

type JsonRecord = Record<string, unknown>

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const started = Date.now()
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )
    await requireAdmin(req, supabase)

    const base = (Deno.env.get('SELLERCLOUD_DELTA_BASE') ?? 'https://snc.api.sellercloud.com/rest').replace(/\/$/, '')
    const token = await getSellerCloudToken(base)
    const purchaseOrders = await fetchPurchaseOrders(base, token)

    const orderRows = purchaseOrders.map(toPurchaseOrderRow)
    if (orderRows.length > 0) {
      const { error } = await supabase.from('purchase_orders').upsert(orderRows, { onConflict: 'id' })
      if (error) throw error
    }

    const bridge = await loadSkuBridge(supabase)
    const itemRows: JsonRecord[] = []
    for (const po of purchaseOrders) {
      const poId = Number(first(po, ['ID', 'Id', 'id', 'POID', 'PurchaseOrderID']))
      if (!Number.isFinite(poId)) continue
      const items = await fetchPurchaseOrderItems(base, token, poId)
      itemRows.push(...items.map(item => toPOItemRow(item, poId, bridge)))
    }

    if (itemRows.length > 0) {
      const { error } = await supabase.from('po_items').upsert(itemRows, { onConflict: 'id' })
      if (error) throw error
    }

    return json({ synced: orderRows.length, items: itemRows.length, durationMs: Date.now() - started })
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'PO sync failed' }, 500)
  }
})

async function requireAdmin(req: Request, supabase: ReturnType<typeof createClient>) {
  const token = req.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) throw new Error('Missing bearer token')

  const { data: authData, error: authError } = await supabase.auth.getUser(token)
  if (authError || !authData.user) throw new Error('Invalid bearer token')

  const { data: profile, error } = await supabase
    .from('users')
    .select('role, is_active')
    .eq('id', authData.user.id)
    .single()
  if (error) throw error
  if (!profile?.is_active || profile.role !== 'admin') throw new Error('Admin role required')
}

async function getSellerCloudToken(base: string): Promise<string> {
  const username = Deno.env.get('SELLERCLOUD_USERNAME')
  const password = Deno.env.get('SELLERCLOUD_PASSWORD')
  if (!username || !password) throw new Error('SellerCloud credentials are not configured')

  const response = await fetch(`${base}/api/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ Username: username, Password: password }),
  })
  if (!response.ok) throw new Error(`SellerCloud auth failed (${response.status})`)
  const body = await response.json()
  const token = body.access_token ?? body.AccessToken ?? body.token
  if (!token) throw new Error('SellerCloud token response did not include an access token')
  return String(token)
}

async function fetchPurchaseOrders(base: string, token: string): Promise<JsonRecord[]> {
  const all: JsonRecord[] = []
  const pageSize = 100

  for (let pageNumber = 1; pageNumber <= 100; pageNumber += 1) {
    const url = new URL(`${base}/api/purchaseorders`)
    url.searchParams.set('pageNumber', String(pageNumber))
    url.searchParams.set('pageSize', String(pageSize))

    const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
    if (!response.ok) throw new Error(`SellerCloud PO fetch failed (${response.status})`)
    const body = await response.json()
    const rows = extractRows(body)
    all.push(...rows)

    const total = Number(body.TotalResults ?? body.totalResults ?? body.TotalCount ?? body.totalCount ?? 0)
    if (rows.length < pageSize || (total > 0 && all.length >= total)) break
  }

  return all
}

async function fetchPurchaseOrderItems(base: string, token: string, poId: number): Promise<JsonRecord[]> {
  const response = await fetch(`${base}/api/PurchaseOrders/${poId}/Items`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!response.ok) throw new Error(`SellerCloud PO item fetch failed for ${poId} (${response.status})`)
  const body = await response.json()
  return extractRows(body)
}

async function loadSkuBridge(supabase: ReturnType<typeof createClient>): Promise<Map<string, string>> {
  const { data, error } = await supabase
    .from('sku_bridge')
    .select('source_sku, planning_sku, source_system, is_active')
    .eq('is_active', true)
  if (error) throw error

  const bridge = new Map<string, string>()
  for (const row of data ?? []) {
    if (!row.source_sku || !row.planning_sku) continue
    const sourceSystem = String(row.source_system ?? '')
    if (!sourceSystem.includes('seller_cloud')) continue
    bridge.set(String(row.source_sku).toLowerCase(), String(row.planning_sku))
  }
  return bridge
}

function extractRows(body: unknown): JsonRecord[] {
  if (Array.isArray(body)) return body as JsonRecord[]
  if (!body || typeof body !== 'object') return []
  const record = body as JsonRecord
  for (const key of ['Items', 'items', 'Results', 'results', 'Data', 'data']) {
    if (Array.isArray(record[key])) return record[key] as JsonRecord[]
  }
  return []
}

function toPurchaseOrderRow(po: JsonRecord): JsonRecord {
  const id = Number(first(po, ['ID', 'Id', 'id', 'POID', 'PurchaseOrderID']))
  return {
    id,
    purchase_title: nullableText(first(po, ['PurchaseTitle', 'purchaseTitle', 'Title'])),
    vendor_id: nullableNumber(first(po, ['VendorID', 'VendorId', 'vendorId'])),
    po_status: String(first(po, ['POStatus', 'PoStatus', 'Status', 'po_status']) ?? 'Unknown'),
    payment_status: nullableText(first(po, ['PaymentStatus', 'paymentStatus'])),
    shipping_status: nullableText(first(po, ['ShippingStatus', 'shippingStatus'])),
    receiving_status: nullableText(first(po, ['ReceivingStatus', 'receivingStatus'])),
    date_ordered: nullableDate(first(po, ['DateOrdered', 'dateOrdered'])),
    expected_delivery_date: nullableDate(first(po, ['ExpectedDeliveryDate', 'expectedDeliveryDate'])),
    created_on: nullableDate(first(po, ['CreatedOn', 'createdOn'])),
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
    synced_at: new Date().toISOString(),
  }
}

function toPOItemRow(item: JsonRecord, poId: number, bridge: Map<string, string>): JsonRecord {
  const sourceSku = String(first(item, ['ProductID', 'ProductId', 'productId', 'SKU', 'sku']) ?? '')
  return {
    id: Number(first(item, ['ID', 'Id', 'id'])),
    po_id: poId,
    source_sku: sourceSku,
    planning_sku: bridge.get(sourceSku.toLowerCase()) ?? null,
    product_name: nullableText(first(item, ['ProductName', 'productName'])),
    qty_units_ordered: nullableNumber(first(item, ['QtyUnitsOrdered', 'qtyUnitsOrdered'])),
    qty_units_per_case: nullableNumber(first(item, ['QtyUnitsPerCase', 'qtyUnitsPerCase'])),
    unit_price: nullableNumber(first(item, ['UnitPrice', 'unitPrice'])),
    case_price: nullableNumber(first(item, ['CasePrice', 'casePrice'])),
    discount_type: nullableText(first(item, ['DiscountType', 'discountType'])),
    discount_value: nullableNumber(first(item, ['DiscountValue', 'discountValue'])),
    expected_delivery_date: nullableDate(first(item, ['ExpectedDeliveryDate', 'expectedDeliveryDate'])),
  }
}

function first(record: JsonRecord, keys: string[]): unknown {
  for (const key of keys) {
    if (record[key] != null) return record[key]
  }
  return null
}

function nullableText(value: unknown): string | null {
  return value == null || value === '' ? null : String(value)
}

function nullableNumber(value: unknown): number | null {
  if (value == null || value === '') return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function nullableBoolean(value: unknown): boolean | null {
  if (value == null) return null
  if (typeof value === 'boolean') return value
  return String(value).toLowerCase() === 'true'
}

function nullableDate(value: unknown): string | null {
  if (value == null || value === '') return null
  const date = new Date(String(value))
  return Number.isFinite(date.getTime()) ? date.toISOString() : null
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
