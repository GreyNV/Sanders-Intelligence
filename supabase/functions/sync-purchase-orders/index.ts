import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

type JsonRecord = Record<string, unknown>
const PO_SYNC_KEY = 'sellercloud_purchase_orders'
const DEFAULT_INITIAL_LOOKBACK_DAYS = 30
const DEFAULT_SCAN_PAGES = 2
const CURSOR_OVERLAP_MINUTES = 5

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const started = Date.now()
  try {
    const options = await readSyncOptions(req)
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )
    await requireAdminOrService(req, supabase)
    const syncState = await getSyncState(supabase, options)

    const base = (Deno.env.get('SELLERCLOUD_DELTA_BASE') ?? 'https://snc.api.sellercloud.com/rest').replace(/\/$/, '')
    const token = await getSellerCloudToken(base)
    const { rows: purchaseOrders, totalResults, pagesFetched } = await fetchPurchaseOrders(base, token, options, syncState.startPage, syncState.queryCursor)

    const orderRows = uniqueRowsById(purchaseOrders.map(toPurchaseOrderRow))
    if (orderRows.length > 0) {
      const { error } = await supabase.from('purchase_orders').upsert(orderRows, { onConflict: 'id' })
      if (error) throw error
    }

    const bridge = await loadSkuBridge(supabase)
    const itemRows: JsonRecord[] = []
    const itemFailures: Array<{ poId: number; error: string }> = []
    const activePurchaseOrders = options.activeOnly
      ? purchaseOrders.filter(isActivePurchaseOrder)
      : purchaseOrders

    if (options.includeItems) {
      for (const po of activePurchaseOrders) {
        const poId = Number(first(po, ['ID', 'Id', 'id', 'POID', 'PurchaseOrderID']))
        if (!Number.isFinite(poId)) continue
        try {
          const items = await fetchPurchaseOrderItems(base, token, poId)
          itemRows.push(...items.map((item, index) => toPOItemRow(item, poId, bridge, index)))
        } catch (error) {
          itemFailures.push({ poId, error: error instanceof Error ? error.message : 'PO item fetch failed' })
        }
      }
    }

    if (itemRows.length > 0) {
      const { error } = await supabase.from('po_items').upsert(itemRows, { onConflict: 'id' })
      if (error) throw error
    }

    const nextPage = deriveNextPage(syncState.startPage, pagesFetched, totalResults, options.pageSize)
    const observedCursor = maxIsoDate([
      syncState.observedCursor,
      newestCursor(orderRows),
      syncState.storedCursor,
    ])
    const isCompleteBatch = nextPage === 1
    const nextCursor = isCompleteBatch
      ? observedCursor ?? syncState.storedCursor ?? new Date().toISOString()
      : syncState.storedCursor ?? observedCursor ?? new Date().toISOString()
    await saveSyncState(supabase, nextCursor, {
      totalResults,
      nextPage,
      lastPagesFetched: pagesFetched,
      pendingIncremental: !isCompleteBatch,
      queryCursor: syncState.queryCursor,
      observedCursor,
    })

    return json({
      synced: orderRows.length,
      active: activePurchaseOrders.length,
      items: itemRows.length,
      itemFailures,
      incrementalFrom: syncState.queryCursor,
      nextCursor,
      syncMode: syncState.queryCursor ? 'incremental_updated_on' : 'baseline_scan',
      startPage: syncState.startPage,
      nextPage,
      totalResults,
      complete: isCompleteBatch,
      durationMs: Date.now() - started,
    })
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'PO sync failed' }, 500)
  }
})

interface SyncOptions {
  includeItems: boolean
  maxPages: number
  pageSize: number
  fullRefresh: boolean
  initialLookbackDays: number
  activeOnly: boolean
  startPage: number | null
  useScanCursor: boolean
}

async function readSyncOptions(req: Request): Promise<SyncOptions> {
  const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {}
  const pageSize = clampNumber(body.pageSize, 1, 50, 50)
  const maxPages = clampNumber(body.maxPages, 1, 200, DEFAULT_SCAN_PAGES)

  return {
    includeItems: body.includeItems !== false,
    maxPages,
    pageSize,
    fullRefresh: body.fullRefresh === true,
    initialLookbackDays: clampNumber(body.initialLookbackDays, 1, 365, DEFAULT_INITIAL_LOOKBACK_DAYS),
    activeOnly: body.activeOnly !== false,
    startPage: body.startPage == null ? null : clampNumber(body.startPage, 1, 10000, 1),
    useScanCursor: body.useScanCursor === true,
  }
}

async function getSyncState(
  supabase: ReturnType<typeof createClient>,
  options: SyncOptions
): Promise<{ queryCursor: string | null; storedCursor: string | null; observedCursor: string | null; startPage: number }> {
  if (options.fullRefresh) return { queryCursor: null, storedCursor: null, observedCursor: null, startPage: options.startPage ?? 1 }

  const { data, error } = await supabase
    .from('sync_state')
    .select('cursor_value, state')
    .eq('key', PO_SYNC_KEY)
    .maybeSingle()

  if (error) throw error
  const state = isRecord(data?.state) ? data.state : {}
  if (data?.cursor_value) {
    const storedCursor = new Date(String(data.cursor_value)).toISOString()
    const pendingIncremental = state.pendingIncremental === true || Number(state.nextPage) > 1
    return {
      queryCursor: withCursorOverlap(storedCursor),
      storedCursor,
      observedCursor: nullableDate(state.observedCursor),
      startPage: options.startPage ?? (pendingIncremental ? clampNumber(state.nextPage, 1, 10000, 1) : 1),
    }
  }

  const initial = new Date()
  initial.setDate(initial.getDate() - options.initialLookbackDays)
  const initialCursor = initial.toISOString()
  return { queryCursor: initialCursor, storedCursor: initialCursor, observedCursor: initialCursor, startPage: options.startPage ?? 1 }
}

async function saveSyncState(supabase: ReturnType<typeof createClient>, cursor: string, state: JsonRecord) {
  const { error } = await supabase
    .from('sync_state')
    .upsert({
      key: PO_SYNC_KEY,
      cursor_value: cursor,
      last_successful_sync_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      state,
      last_error: null,
    }, { onConflict: 'key' })
  if (error) throw error
}

async function requireAdminOrService(req: Request, supabase: ReturnType<typeof createClient>) {
  const token = req.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) throw new Error('Missing bearer token')

  if (token === Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')) return
  if (jwtRole(token) === 'service_role') return

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

async function fetchPurchaseOrders(
  base: string,
  token: string,
  options: SyncOptions,
  startPage: number,
  updatedOnFrom: string | null
): Promise<{ rows: JsonRecord[]; totalResults: number; pagesFetched: number }> {
  const all: JsonRecord[] = []
  const { pageSize, maxPages } = options
  let totalResults = 0
  let pagesFetched = 0

  for (let offset = 0; offset < maxPages; offset += 1) {
    const pageNumber = startPage + offset
    const url = new URL(`${base}/api/PurchaseOrders`)
    url.searchParams.set('model.pageNumber', String(pageNumber))
    url.searchParams.set('model.pageSize', String(pageSize))
    if (updatedOnFrom) url.searchParams.set('model.updatedDateFrom', updatedOnFrom)

    const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
    if (!response.ok) throw new Error(`SellerCloud PO fetch failed (${response.status})`)
    const body = await response.json()
    const rows = extractRows(body)
    all.push(...rows)
    pagesFetched += 1

    totalResults = Number(body.TotalResults ?? body.totalResults ?? body.TotalCount ?? body.totalCount ?? totalResults)
    if (rows.length < pageSize || (totalResults > 0 && pageNumber * pageSize >= totalResults)) break
  }

  return { rows: all, totalResults, pagesFetched }
}

async function fetchPurchaseOrderItems(base: string, token: string, poId: number): Promise<JsonRecord[]> {
  const response = await fetch(`${base}/api/PurchaseOrders/${poId}`, {
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
  const id = Number(first(po, ['ID', 'Id', 'id', 'POID', 'POId', 'PurchaseOrderID']))
  const poStatusCode = nullableNumber(first(po, ['PurchaseOrderStatus', 'POStatusCode', 'StatusCode']))
  const shippingStatusCode = nullableNumber(first(po, ['PurchaseOrdersShippingStatus', 'ShippingStatusCode']))
  const receivingStatusCode = nullableNumber(first(po, ['ReceivingStatus', 'ReceivingStatusCode']))
  const paymentStatusCode = nullableNumber(first(po, ['PaymentStatus', 'PaymentStatusCode']))
  return {
    id,
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
    synced_at: new Date().toISOString(),
    updated_on: nullableDate(first(po, ['UpdatedOn', 'updatedOn', 'UpdatedDate', 'updatedDate', 'LastUpdatedOn', 'lastUpdatedOn', 'LastRevisedOn', 'lastRevisedOn'])),
  }
}

function toPOItemRow(item: JsonRecord, poId: number, bridge: Map<string, string>, index: number): JsonRecord {
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

const PURCHASE_ORDER_STATUSES: Record<number, string> = {
  0: 'Saved',
  1: 'Ordered',
  2: 'Pending',
  3: 'Received',
  4: 'Cancelled',
  5: 'Completed',
}

const SHIPPING_STATUSES: Record<number, string> = {
  0: 'Not Shipped',
  1: 'Shipped',
  2: 'Delivered',
}

const RECEIVING_STATUSES: Record<number, string> = {
  0: 'Not Received',
  1: 'Partially Received',
  2: 'Received',
}

const PAYMENT_STATUSES: Record<number, string> = {
  0: 'Unknown',
  10: 'Unpaid',
}

function isActivePurchaseOrder(po: JsonRecord): boolean {
  const poStatusCode = nullableNumber(first(po, ['PurchaseOrderStatus', 'POStatusCode', 'StatusCode']))
  const receivingStatusCode = nullableNumber(first(po, ['ReceivingStatus', 'ReceivingStatusCode']))
  const cancelledPoId = nullableNumber(first(po, ['CancelledPOID', 'CancelledPOId', 'cancelledPoId']))

  return poStatusCode === 1
    && (receivingStatusCode === 0 || receivingStatusCode === 1)
    && (cancelledPoId == null || cancelledPoId === 0)
}

function statusText(code: number | null, labels: Record<number, string>, fallback: unknown): string {
  if (code != null && labels[code]) return labels[code]
  if (fallback != null && fallback !== '') return String(fallback)
  if (code != null) return String(code)
  return 'Unknown'
}

function deriveNextPage(startPage: number, pagesFetched: number, totalResults: number, pageSize: number): number {
  if (totalResults <= 0 || pagesFetched <= 0) return startPage
  const pageCount = Math.max(1, Math.ceil(totalResults / pageSize))
  const nextPage = startPage + pagesFetched
  return nextPage > pageCount ? 1 : nextPage
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function uniqueRowsById(rows: JsonRecord[]): JsonRecord[] {
  return Array.from(new Map(rows.map(row => [row.id, row])).values())
}

function jwtRole(token: string): string | null {
  try {
    const payload = token.split('.')[1]
    if (!payload) return null
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/')
    const parsed = JSON.parse(atob(normalized))
    return typeof parsed.role === 'string' ? parsed.role : null
  } catch {
    return null
  }
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const number = Number(value)
  if (!Number.isFinite(number)) return fallback
  return Math.min(max, Math.max(min, Math.floor(number)))
}

function newestCursor(orderRows: JsonRecord[]): string | null {
  return orderRows
    .map(row => nullableDate(row.updated_on))
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1)
}

function withCursorOverlap(cursor: string): string {
  const date = new Date(cursor)
  if (!Number.isFinite(date.getTime())) return new Date().toISOString()
  date.setMinutes(date.getMinutes() - CURSOR_OVERLAP_MINUTES)
  return date.toISOString()
}

function maxIsoDate(values: Array<string | null>): string | null {
  return values
    .filter((value): value is string => Boolean(value))
    .map(value => nullableDate(value))
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1) ?? null
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
  const text = String(value)
  const normalized = hasTimeZone(text) ? text : `${text}Z`
  const date = new Date(normalized)
  return Number.isFinite(date.getTime()) ? date.toISOString() : null
}

function hasTimeZone(value: string): boolean {
  return /(?:z|[+-]\d{2}:?\d{2})$/i.test(value)
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
