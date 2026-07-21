import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

type JsonRecord = Record<string, unknown>
const SALES_SYNC_KEY = 'sellercloud_sales'
const DEFAULT_INITIAL_LOOKBACK_DAYS = 45
const DEFAULT_ENDPOINT = '/api/Orders'
const CURSOR_OVERLAP_MINUTES = 5
const DEFAULT_DATE_PARAM_PRESET = 'shipDate'
const DEFAULT_SALE_DATE_PRESET = 'shipDate'
const DEFAULT_BUSINESS_TIME_ZONE = 'America/New_York'
const ORDER_SOURCE_BY_ID: Record<string, string> = {
  '0': 'Local_Store',
  '1': 'eBayOrder',
  '2': 'eBaySingleItem',
  '3': 'Yahoo',
  '4': 'Amazon',
  '5': 'PriceGrabber',
  '6': 'Website',
  '7': 'Buy',
  '12': 'NewEggMall',
  '15': 'Magento',
  '16': 'QuickBooks',
  '17': 'RMS',
  '18': 'Cart32',
  '19': 'Sears',
  '20': 'FBA',
  '21': 'Wholesale',
  '22': 'Overstock',
  '23': 'NewEggdotcom',
  '24': 'Etsy',
  '25': 'Bonanza',
  '26': 'PriceFalls',
  '27': 'Wayfair',
  '28': 'UnbeatableSale',
  '29': 'VendorCentral',
  '30': 'Hayneedle',
  '31': 'SmartBargains',
  '32': 'uBid',
  '33': 'ATGStores',
  '34': 'StacksAndStacks',
  '35': 'Sharkstores',
  '36': 'BestBuy',
  '37': 'Kohls',
  '38': 'Staples',
  '39': 'OneStopPlus',
  '40': 'Meijer',
  '41': 'Sonsi',
  '42': 'Walmart',
  '43': 'HSN',
  '44': 'NewEgg_Business',
  '45': 'KMart',
  '46': 'Wish',
  '47': 'SPRichards',
  '48': 'FingerHut',
  '49': 'Groupon',
  '50': 'Walmart_Marketplace',
  '51': 'ShopHQ',
  '52': 'PriceMinister',
  '53': 'GS',
  '54': 'DrugStore',
  '55': 'MercadoLibre',
  '56': 'JET',
  '57': 'ElevenMain',
  '58': 'SearsVendor',
  '59': 'Choxi',
  '60': 'TradeMe',
  '61': 'Tanga',
  '62': 'Target',
  '63': 'GrouponMarketplace',
  '64': 'Reverb',
  '65': 'BedBathAndBeyond',
  '66': 'Dropship_Central',
  '67': 'DSW',
  '68': 'Houzz',
  '69': 'Gilt',
  '70': 'BestBuyDS',
  '71': 'TopHatter',
  '72': 'HomeDepot',
  '73': 'MassGenie',
  '74': 'Cdiscount',
  '75': 'GrouponGateway',
  '76': 'SBN',
  '77': 'GoogleExpress',
  '78': 'Target_Plus',
  '79': 'WFS',
}

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

    const base = stripTrailingSlash(Deno.env.get('SELLERCLOUD_DELTA_BASE') ?? 'https://snc.api.sellercloud.com/rest')
    const endpoint = normalizeEndpoint(Deno.env.get('SELLERCLOUD_SALES_ENDPOINT') ?? DEFAULT_ENDPOINT)
    const token = await getSellerCloudToken(base)
    const { rows, totalResults, pagesFetched } = await fetchSalesRows(base, endpoint, token, options, syncState.startPage, syncState.queryCursor)
    const bridge = await loadSkuBridge(supabase)
    const rowsInWindow = filterRowsBySaleDate(rows, options)
    let salesRows = aggregateSalesRows(rowsInWindow, bridge, endpoint, options)
    const synced = salesRows.length
    const revenue = sumField(salesRows, 'revenue')
    const units = sumField(salesRows, 'units_sold')
    const ordersCount = sumField(salesRows, 'orders_count')

    if (!options.dryRun && options.replaceDate && options.dateFrom && options.dateFrom === options.dateTo) {
      const { error } = await supabase
        .from('sales_daily')
        .delete()
        .eq('sale_date', options.dateFrom)
      if (error) throw error
    }

    if (!options.dryRun && salesRows.length > 0) {
      if (shouldMergeSalesRowsWithExisting(options)) {
        salesRows = await mergeSalesRowsWithExisting(supabase, salesRows)
      }

      const { error } = await supabase
        .from('sales_daily')
        .upsert(salesRows, { onConflict: 'sale_date,raw_company,raw_channel,source_sku' })
      if (error) throw error
    }

    const nextCursor = newestCursor(rows) ?? syncState.storedCursor ?? new Date().toISOString()
    if (!options.dryRun) {
      await saveSyncState(supabase, nextCursor, {
        totalResults,
        pagesFetched,
        endpoint,
        queryCursor: syncState.queryCursor,
        dateFrom: options.dateFrom,
        dateTo: options.dateTo,
        dateParamPreset: options.dateParamPreset,
        saleDatePreset: options.saleDatePreset,
      })
    }

    return json({
      dryRun: options.dryRun,
      replaceDate: options.replaceDate,
      synced,
      sourceRows: rows.length,
      sourceRowsInWindow: rowsInWindow.length,
      revenue,
      units,
      ordersCount,
      endpoint,
      incrementalFrom: syncState.queryCursor,
      dateFrom: options.dateFrom,
      dateTo: options.dateTo,
      dateParamPreset: options.dateParamPreset,
      saleDatePreset: options.saleDatePreset,
      nextCursor,
      totalResults,
      pagesFetched,
      sourceDateRange: dateRange(rows, options),
      filteredDateRange: dateRange(rowsInWindow, options),
      durationMs: Date.now() - started,
    })
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Sales sync failed' }, 500)
  }
})

interface SyncOptions {
  maxPages: number
  pageSize: number
  fullRefresh: boolean
  initialLookbackDays: number
  startPage: number | null
  dateFrom: string | null
  dateTo: string | null
  dateParamPreset: string
  saleDatePreset: string
  dryRun: boolean
  replaceDate: boolean
}

async function readSyncOptions(req: Request): Promise<SyncOptions> {
  const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {}
  const defaultDate = yesterdayUtcDate()
  const dateFrom = nullableDateText(body.dateFrom) ?? (body.fullRefresh === true ? null : defaultDate)
  const dateTo = nullableDateText(body.dateTo) ?? dateFrom
  return {
    maxPages: clampNumber(body.maxPages, 1, 200, 2),
    pageSize: clampNumber(body.pageSize, 1, 50, 50),
    fullRefresh: body.fullRefresh === true,
    initialLookbackDays: clampNumber(body.initialLookbackDays, 1, 730, DEFAULT_INITIAL_LOOKBACK_DAYS),
    startPage: body.startPage == null ? null : clampNumber(body.startPage, 1, 10000, 1),
    dateFrom,
    dateTo,
    dateParamPreset: nullableText(body.dateParamPreset) ?? Deno.env.get('SELLERCLOUD_SALES_DATE_PARAM_PRESET') ?? DEFAULT_DATE_PARAM_PRESET,
    saleDatePreset: nullableText(body.saleDatePreset) ?? Deno.env.get('SELLERCLOUD_SALES_DATE_BASIS') ?? DEFAULT_SALE_DATE_PRESET,
    dryRun: body.dryRun === true,
    replaceDate: body.replaceDate === true,
  }
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

async function getSyncState(
  supabase: ReturnType<typeof createClient>,
  options: SyncOptions
): Promise<{ queryCursor: string | null; storedCursor: string | null; startPage: number }> {
  if (options.dateFrom || options.dateTo) return { queryCursor: null, storedCursor: null, startPage: options.startPage ?? 1 }
  if (options.fullRefresh) return { queryCursor: null, storedCursor: null, startPage: options.startPage ?? 1 }

  const { data, error } = await supabase
    .from('sync_state')
    .select('cursor_value')
    .eq('key', SALES_SYNC_KEY)
    .maybeSingle()
  if (error) throw error
  if (data?.cursor_value) {
    const storedCursor = new Date(String(data.cursor_value)).toISOString()
    return { queryCursor: withCursorOverlap(storedCursor), storedCursor, startPage: options.startPage ?? 1 }
  }

  const initial = new Date()
  initial.setDate(initial.getDate() - options.initialLookbackDays)
  const initialCursor = initial.toISOString()
  return { queryCursor: initialCursor, storedCursor: initialCursor, startPage: options.startPage ?? 1 }
}

async function saveSyncState(supabase: ReturnType<typeof createClient>, cursor: string, state: JsonRecord) {
  const { error } = await supabase
    .from('sync_state')
    .upsert({
      key: SALES_SYNC_KEY,
      cursor_value: cursor,
      last_successful_sync_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      state,
      last_error: null,
    }, { onConflict: 'key' })
  if (error) throw error
}

async function getSellerCloudToken(base: string): Promise<string> {
  const username = Deno.env.get('SELLERCLOUD_USERNAME')
  const password = Deno.env.get('SELLERCLOUD_PASSWORD')
  if (!username || !password) throw new Error('SellerCloud credentials are not configured')

  let lastError: Error | null = null
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    const response = await fetch(`${base}/api/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ Username: username, Password: password }),
    })
    if (response.ok) {
      const body = await response.json()
      const token = body.access_token ?? body.AccessToken ?? body.token
      if (!token) throw new Error('SellerCloud token response did not include an access token')
      return String(token)
    }

    lastError = new Error(`SellerCloud auth failed (${response.status})`)
    if (![429, 500, 502, 503, 504].includes(response.status)) break
    await sleep(1000 * attempt * attempt)
  }
  throw lastError ?? new Error('SellerCloud auth failed')
}

async function fetchSalesRows(
  base: string,
  endpoint: string,
  token: string,
  options: SyncOptions,
  startPage: number,
  updatedOnFrom: string | null
): Promise<{ rows: JsonRecord[]; totalResults: number; pagesFetched: number }> {
  const all: JsonRecord[] = []
  let totalResults = 0
  let pagesFetched = 0

  for (let offset = 0; offset < options.maxPages; offset += 1) {
    const pageNumber = startPage + offset
    const url = new URL(`${base}${endpoint}`)
    url.searchParams.set('model.pageNumber', String(pageNumber))
    url.searchParams.set('model.pageSize', String(options.pageSize))
    if (updatedOnFrom) url.searchParams.set('model.updatedDateFrom', updatedOnFrom)
    applyDateParams(url, options)

    const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
    if (!response.ok) throw new Error(`SellerCloud sales fetch failed (${response.status})`)
    const body = await response.json()
    let pageRows = extractRows(body)
    pageRows = await enrichOrdersWithProfitAndLoss(base, token, pageRows)
    pageRows = await enrichOrdersWithCurrencyRates(base, token, pageRows)
    const rows = flattenSalesRows(pageRows)
    all.push(...rows)
    pagesFetched += 1

    totalResults = Number(body.TotalResults ?? body.totalResults ?? body.TotalCount ?? body.totalCount ?? totalResults)
    if (pageRows.length < options.pageSize || (totalResults > 0 && pageNumber * options.pageSize >= totalResults)) break
  }

  return { rows: all, totalResults, pagesFetched }
}

async function enrichOrdersWithProfitAndLoss(base: string, token: string, orders: JsonRecord[]): Promise<JsonRecord[]> {
  const candidates = orders.filter(needsProfitAndLoss)
  const orderIds = candidates
    .map(order => nullableText(first(order, ['ID', 'Id', 'OrderID', 'OrderId', 'orderID', 'orderId'])))
    .filter((value): value is string => Boolean(value))
  if (orderIds.length === 0) return orders

  const profitAndLoss = new Map<string, JsonRecord>()
  for (let index = 0; index < orderIds.length; index += 100) {
    const batch = orderIds.slice(index, index + 100).map(Number).filter(value => Number.isFinite(value))
    if (batch.length === 0) continue

    const response = await fetch(`${base}/api/Orders/ProfitAndLoss`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ Orders: batch }),
    })
    if (!response.ok) throw new Error(`SellerCloud P&L fetch failed (${response.status})`)

    const rows = await response.json()
    if (!Array.isArray(rows)) continue
    for (const row of rows) {
      const orderId = nullableText(first(row, ['OrderID', 'OrderId', 'orderID', 'orderId', 'ID', 'Id']))
      if (orderId) profitAndLoss.set(orderId, row)
    }
  }

  return orders.map(order => {
    const orderId = nullableText(first(order, ['ID', 'Id', 'OrderID', 'OrderId', 'orderID', 'orderId']))
    const pnl = orderId ? profitAndLoss.get(orderId) : null
    return pnl ? { ...order, ProfitAndLoss: pnl, ...profitAndLossFields(pnl) } : order
  })
}

function needsProfitAndLoss(order: JsonRecord): boolean {
  const grandTotal = nullableNumber(first(order, ['GrandTotal', 'grandTotal']))
  if (grandTotal != null && grandTotal > 0) return false

  const detailGrandTotal = nullableNumber(first(order, ['DetailGrandTotal', 'detailGrandTotal']))
  if (detailGrandTotal != null && detailGrandTotal > 0) return false

  return !orderHasPositiveLineRevenue(order)
}

function orderHasPositiveLineRevenue(order: JsonRecord): boolean {
  const items = extractRows(order)
  if (items.length === 0) return hasPositiveLineRevenue(order)
  return items.some(item => hasPositiveLineRevenue(item))
}

function profitAndLossFields(row: JsonRecord): JsonRecord {
  const fields: JsonRecord = {}
  for (const key of [
    'OrderCost',
    'OrderCostUsd',
    'ProfitLoss',
    'ProfitLossUsd',
    'Payments',
    'PaymentsUsd',
  ]) {
    if (row[key] != null) fields[key] = row[key]
  }
  return fields
}

function applyDateParams(url: URL, options: SyncOptions) {
  if (!options.dateFrom && !options.dateTo) return
  const [fromParam, toParam] = dateParamNames(options.dateParamPreset)
  const [fromValue, toValue] = dateParamValues(options)
  if (fromValue) url.searchParams.set(fromParam, fromValue)
  if (toValue) url.searchParams.set(toParam, toValue)
}

function dateParamNames(preset: string): [string, string] {
  switch (preset) {
    case 'date':
      return ['model.dateFrom', 'model.dateTo']
    case 'shipDate':
      return ['model.shipFromDate', 'model.shipToDate']
    case 'shippingDate':
      return ['model.shipFromDate', 'model.shipToDate']
    case 'purchaseOrdersShippingDate':
      return ['model.PurchaseOrdersShippingDateFrom', 'model.PurchaseOrdersShippingDateTo']
    case 'createdOn':
      return ['model.createdOnFrom', 'model.createdOnTo']
    case 'updatedDate':
      return ['model.updatedDateFrom', 'model.updatedDateTo']
    case 'orderDate':
    default:
      return ['model.orderFromDate', 'model.orderToDate']
  }
}

function dateParamValues(options: Pick<SyncOptions, 'dateFrom' | 'dateTo' | 'dateParamPreset'>): [string | null, string | null] {
  if (options.dateParamPreset === 'shipDate' || options.dateParamPreset === 'shippingDate') {
    return [
      options.dateFrom ? startOfDayDateTime(options.dateFrom) : null,
      options.dateTo ? endOfDayDateTime(options.dateTo) : null,
    ]
  }
  return [options.dateFrom, options.dateTo]
}

async function enrichOrdersWithCurrencyRates(base: string, token: string, orders: JsonRecord[]): Promise<JsonRecord[]> {
  const enriched = [...orders]
  const candidates = enriched
    .filter(order => needsCurrencyRate(order))
    .map(order => nullableText(first(order, ['ID', 'Id', 'OrderID', 'OrderId', 'orderID', 'orderId'])))
    .filter((value): value is string => Boolean(value))

  if (candidates.length === 0) return enriched

  const rates = new Map<string, number>()
  const details = new Map<string, JsonRecord>()
  let cursor = 0
  const concurrency = 6
  async function worker() {
    while (cursor < candidates.length) {
      const orderId = candidates[cursor++]
      const detail = await fetchOrderDetail(base, token, orderId)
      const orderDetails = isRecord(detail.OrderDetails) ? detail.OrderDetails : {}
      const rate = nullableNumber(first(orderDetails, ['CurrencyRateToUSD', 'currencyRateToUsd']))
      if (rate != null && rate > 0) rates.set(orderId, rate)
      details.set(orderId, detail)
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker))

  return enriched.map(order => {
    const orderId = nullableText(first(order, ['ID', 'Id', 'OrderID', 'OrderId', 'orderID', 'orderId']))
    const rate = orderId ? rates.get(orderId) : null
    const detail = orderId ? details.get(orderId) : null
    if (!rate && !detail) return order

    const totalInfo = detail && isRecord(detail.TotalInfo) ? detail.TotalInfo : {}
    const detailSubTotal = nullableNumber(first(totalInfo, ['SubTotal', 'subTotal']))
    const detailGrandTotal = nullableNumber(first(totalInfo, ['GrandTotal', 'grandTotal']))
    const detailTax = nullableNumber(first(totalInfo, ['Tax', 'tax']))
    const orderItems = detail ? extractRows(detail) : []
    return {
      ...order,
      ...(rate ? { CurrencyRateToUSD: rate } : {}),
      ...(detailSubTotal != null && detailSubTotal > 0 ? { DetailSubTotal: detailSubTotal } : {}),
      ...(detailGrandTotal != null && detailGrandTotal > 0 ? { DetailGrandTotal: detailGrandTotal } : {}),
      ...(detailTax != null && detailTax > 0 ? { DetailTax: detailTax } : {}),
      ...(orderItems.length > 0 ? { Items: orderItems } : {}),
    }
  })
}

function needsCurrencyRate(order: JsonRecord): boolean {
  if (needsZeroRevenueDetail(order)) return true
  if (nullableNumber(first(order, ['CurrencyRateToUSD', 'currencyRateToUsd'])) != null) return false
  const company = nullableText(first(order, ['CompanyName', 'companyName', 'Company', 'company']))?.toLowerCase() ?? ''
  return company.includes('fba mx') || company.includes('amazon canada')
}

function needsZeroRevenueDetail(order: JsonRecord): boolean {
  const grandTotal = nullableNumber(first(order, ['GrandTotal', 'grandTotal']))
  if (grandTotal != null && grandTotal > 0) return false
  if (!isAmazonEuOrder(order)) return false
  const items = extractRows(order)
  return items.length > 0 && items.every(item => (nullableNumber(first(item, ['LineTotal', 'lineTotal'])) ?? 0) === 0)
}

async function fetchOrderDetail(base: string, token: string, orderId: string): Promise<JsonRecord> {
  const response = await fetch(`${base}/api/Orders/${encodeURIComponent(orderId)}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!response.ok) throw new Error(`SellerCloud order detail fetch failed for ${orderId} (${response.status})`)
  return await response.json()
}

async function loadSkuBridge(supabase: ReturnType<typeof createClient>): Promise<Map<string, string>> {
  const bridge = new Map<string, string>()
  let from = 0
  const pageSize = 1000

  while (true) {
    const { data, error } = await supabase
      .from('sku_bridge')
      .select('source_sku, planning_sku, source_system, is_active')
      .eq('is_active', true)
      .range(from, from + pageSize - 1)
    if (error) throw error

    const page = data ?? []
    for (const row of page) {
      if (!row.source_sku || !row.planning_sku) continue
      const sourceSystem = String(row.source_system ?? '')
      if (!sourceSystem.includes('seller_cloud')) continue
      bridge.set(String(row.source_sku).toLowerCase(), String(row.planning_sku))
    }
    if (page.length < pageSize) break
    from += pageSize
  }

  return bridge
}

function shouldMergeSalesRowsWithExisting(options: SyncOptions): boolean {
  return Boolean(
    options.startPage &&
    options.startPage > 1 &&
    options.dateFrom &&
    options.dateFrom === options.dateTo
  )
}

async function mergeSalesRowsWithExisting(
  supabase: ReturnType<typeof createClient>,
  salesRows: JsonRecord[]
): Promise<JsonRecord[]> {
  const saleDates = Array.from(new Set(salesRows.map(row => nullableText(row.sale_date)).filter((value): value is string => Boolean(value))))
  if (saleDates.length === 0) return salesRows

  const existingRows: JsonRecord[] = []
  let from = 0
  const pageSize = 1000
  while (true) {
    const { data, error } = await supabase
      .from('sales_daily')
      .select('sale_date,raw_company,raw_channel,channel,source_sku,units_sold,revenue,orders_count,source_payload')
      .in('sale_date', saleDates)
      .range(from, from + pageSize - 1)
    if (error) throw error

    const page = (data ?? []) as JsonRecord[]
    existingRows.push(...page)
    if (page.length < pageSize) break
    from += pageSize
  }

  const existingByKey = new Map(existingRows.map(row => [salesRowKey(row), row]))
  return salesRows.map(row => {
    const existing = existingByKey.get(salesRowKey(row))
    if (!existing) return row

    return {
      ...row,
      units_sold: Number(existing.units_sold ?? 0) + Number(row.units_sold ?? 0),
      revenue: Number((Number(existing.revenue ?? 0) + Number(row.revenue ?? 0)).toFixed(2)),
      orders_count: Number(existing.orders_count ?? 0) + Number(row.orders_count ?? 0),
      source_payload: mergedSourcePayload(existing.source_payload, row.source_payload),
    }
  })
}

function salesRowKey(row: JsonRecord): string {
  return [
    nullableText(row.sale_date) ?? '',
    nullableText(row.raw_company) ?? 'Unassigned',
    nullableText(row.raw_channel) ?? nullableText(row.channel) ?? 'Unassigned',
    nullableText(row.source_sku) ?? '',
  ].join('|')
}

function mergedSourcePayload(existingPayload: unknown, nextPayload: unknown): JsonRecord {
  const existing = isRecord(existingPayload) ? existingPayload : {}
  const next = isRecord(nextPayload) ? nextPayload : {}
  return {
    ...next,
    sample_count: Number(existing.sample_count ?? 0) + Number(next.sample_count ?? 0),
    chunk_merged: true,
  }
}

function aggregateSalesRows(rows: JsonRecord[], bridge: Map<string, string>, endpoint: string, options: SyncOptions): JsonRecord[] {
  const map = new Map<string, JsonRecord>()
  const orderRevenue = orderRevenueAllocations(rows)
  for (const row of rows) {
    const saleDate = saleDateOnly(row, options)
    const sourceSku = nullableText(first(row, ['ProductID', 'ProductId', 'productId', 'SKU', 'sku', 'Sku']))
    if (!saleDate || !sourceSku) continue
    const rawCompany = nullableText(first(row, ['CompanyName', 'companyName', 'Company', 'company'])) ?? 'Unassigned'
    const rawChannel = sellerCloudChannel(row)
    const channel = rawChannel
    const key = `${saleDate}|${rawCompany}|${rawChannel}|${sourceSku}`
    const existing = map.get(key) ?? {
      sale_date: saleDate,
      raw_company: rawCompany,
      raw_channel: rawChannel,
      channel,
      source_sku: sourceSku,
      planning_sku: bridge.get(sourceSku.toLowerCase()) ?? null,
      units_sold: 0,
      revenue: 0,
      orders_count: 0,
      source_payload: { endpoint, sellercloud_company: rawCompany, sellercloud_channel: rawChannel, sample_count: 0 },
      synced_at: new Date().toISOString(),
    }
    existing.units_sold = Number(existing.units_sold) + (nullableNumber(first(row, ['Qty', 'qty', 'Quantity', 'quantity', 'QtySold', 'qtySold'])) ?? 0)
    existing.revenue = Number(existing.revenue) + revenueForRow(row, orderRevenue)
    existing.orders_count = Number(existing.orders_count) + 1
    existing.source_payload = {
      endpoint,
      sellercloud_company: rawCompany,
      sellercloud_channel: rawChannel,
      sample_count: Number((existing.source_payload as JsonRecord).sample_count ?? 0) + 1,
    }
    map.set(key, existing)
  }
  return Array.from(map.values())
}

function sellerCloudChannel(row: JsonRecord): string {
  const raw = nullableText(first(row, [
    'Channel',
    'channel',
    'OrderSource',
    'orderSource',
    'OrderSourceName',
    'orderSourceName',
    'Source',
    'source',
  ]))
  if (!raw) return 'Unassigned'
  return ORDER_SOURCE_BY_ID[raw] ?? raw
}

interface OrderRevenueGroup {
  count: number
  lineTotal: number
  allocationBasis: number
  lineTaxTotal: number
  orderRevenue: number | null
}

interface ReportOrderTotal {
  amount: number
  applyCurrencyRate: boolean
}

function orderRevenueAllocations(rows: JsonRecord[]): Map<string, OrderRevenueGroup> {
  const groups = new Map<string, OrderRevenueGroup>()
  for (const row of rows) {
    const orderId = orderKey(row)
    if (!orderId) continue
    const group = groups.get(orderId) ?? { count: 0, lineTotal: 0, allocationBasis: 0, lineTaxTotal: 0, orderRevenue: null }
    group.count += 1
    group.lineTotal += lineRevenueTotal(row)
    group.allocationBasis += lineRevenueBasis(row)
    group.lineTaxTotal += Math.max(0, nullableNumber(first(row, ['LineTaxTotal', 'lineTaxTotal'])) ?? 0)
    const reportTotal = reportGrandTotal(row)
    const currencyRate = reportTotal?.applyCurrencyRate
      ? nullableNumber(first(row, ['CurrencyRateToUSD', 'currencyRateToUsd'])) ?? 1
      : 1
    if (reportTotal != null) group.orderRevenue = Math.max(0, reportTotal.amount * currencyRate)
    groups.set(orderId, group)
  }
  return groups
}

function revenueForRow(row: JsonRecord, orderRevenueGroups: Map<string, OrderRevenueGroup>): number {
  const orderId = orderKey(row)
  const group = orderId ? orderRevenueGroups.get(orderId) : null
  const lineTotal = lineRevenueTotal(row)
  const allocationBasis = lineRevenueBasis(row)
  const allocatedOrderRevenue = group?.orderRevenue ?? (group ? group.lineTotal + group.lineTaxTotal : null)
  if (allocatedOrderRevenue != null) {
    if (group?.orderRevenue != null && group.allocationBasis > 0) return (allocationBasis / group.allocationBasis) * allocatedOrderRevenue
    if (group?.lineTotal && group.lineTotal > 0) return (lineTotal / group.lineTotal) * allocatedOrderRevenue
    if (group?.count && group.count > 0) return allocatedOrderRevenue / group.count
  }
  return nullableNumber(first(row, ['LineTotal', 'lineTotal', 'SubTotal', 'subTotal', 'GrandTotal', 'grandTotal', 'Total', 'total'])) ?? 0
}

function reportGrandTotal(row: JsonRecord): ReportOrderTotal | null {
  const grandTotal = nullableNumber(first(row, ['GrandTotal', 'grandTotal']))
  if (grandTotal != null && grandTotal > 0) return { amount: grandTotal, applyCurrencyRate: true }

  const detailGrandTotal = nullableNumber(first(row, ['DetailGrandTotal', 'detailGrandTotal']))
  if (detailGrandTotal != null && detailGrandTotal > 0) return { amount: detailGrandTotal, applyCurrencyRate: true }

  const pnlUsdNet = sumPositiveFields(row, [
    ['OrderCostUsd', 'orderCostUsd'],
    ['ProfitLossUsd', 'profitLossUsd'],
  ])
  if (pnlUsdNet != null) return { amount: pnlUsdNet, applyCurrencyRate: false }

  const pnlLocalNet = sumPositiveFields(row, [
    ['OrderCost', 'orderCost'],
    ['ProfitLoss', 'profitLoss'],
  ])
  if (pnlLocalNet != null) return { amount: pnlLocalNet, applyCurrencyRate: false }

  const detailSubTotal = nullableNumber(first(row, ['DetailSubTotal', 'detailSubTotal']))
  if (detailSubTotal != null && detailSubTotal > 0 && isAmazonEuOrder(row)) return { amount: detailSubTotal, applyCurrencyRate: true }
  if ((grandTotal != null || detailGrandTotal != null) && !hasPositiveLineRevenue(row)) return { amount: 0, applyCurrencyRate: false }
  return null
}

function hasPositiveLineRevenue(row: JsonRecord): boolean {
  return lineRevenueTotal(row) > 0 ||
    lineRevenueBasis(row) > 0 ||
    (nullableNumber(first(row, ['LineTaxTotal', 'lineTaxTotal'])) ?? 0) > 0
}

function sumPositiveFields(row: JsonRecord, keys: [string, string][]): number | null {
  const values = keys.map(([pascalKey, camelKey]) => nullableNumber(first(row, [pascalKey, camelKey])))
  if (values.some(value => value == null)) return null
  const sum = values.reduce((total, value) => total + (value ?? 0), 0)
  return sum > 0 ? sum : null
}

function isAmazonEuOrder(row: JsonRecord): boolean {
  return nullableText(first(row, ['CompanyName', 'companyName', 'Company', 'company']))?.toLowerCase().includes('amazon eu') ?? false
}

function lineRevenueBasis(row: JsonRecord): number {
  const lineTotal = lineRevenueTotal(row)
  if (lineTotal > 0) return lineTotal
  const qty = nullableNumber(first(row, ['Qty', 'qty', 'Quantity', 'quantity', 'QtySold', 'qtySold'])) ?? 0
  const adjusted = nullableNumber(first(row, ['AdjustedSitePrice', 'adjustedSitePrice'])) ?? 0
  if (adjusted > 0 && qty > 0) return adjusted * qty
  const sitePrice = nullableNumber(first(row, ['SitePrice', 'sitePrice'])) ?? 0
  if (sitePrice > 0 && qty > 0) return sitePrice * qty
  return 0
}

function lineRevenueTotal(row: JsonRecord): number {
  const lineTotal = nullableNumber(first(row, ['LineTotal', 'lineTotal']))
  return lineTotal != null && lineTotal > 0 ? lineTotal : 0
}

function orderKey(row: JsonRecord): string | null {
  return nullableText(first(row, ['OrderID', 'OrderId', 'orderID', 'orderId', 'ID', 'Id', 'id']))
}

function filterRowsBySaleDate(rows: JsonRecord[], options: SyncOptions): JsonRecord[] {
  const { dateFrom, dateTo } = options
  if (!dateFrom && !dateTo) return rows
  return rows.filter(row => {
    const saleDate = saleDateOnly(row, options)
    if (!saleDate) return false
    if (dateFrom && saleDate < dateFrom) return false
    if (dateTo && saleDate > dateTo) return false
    return true
  })
}

function dateRange(rows: JsonRecord[], options: Pick<SyncOptions, 'saleDatePreset'>): { min: string | null; max: string | null } {
  const dates = rows
    .map(row => saleDateOnly(row, options))
    .filter((value): value is string => Boolean(value))
    .sort()
  return {
    min: dates[0] ?? null,
    max: dates.at(-1) ?? null,
  }
}

function saleDateOnly(row: JsonRecord, options: Pick<SyncOptions, 'saleDatePreset'>): string | null {
  switch (options.saleDatePreset) {
    case 'createdOn':
      return nullableDateOnly(first(row, ['CreatedOn', 'createdOn']))
    case 'orderDate':
      return nullableDateOnly(first(row, ['OrderDate', 'orderDate', 'Date', 'date']))
    case 'shipDate':
      return nullableDateOnly(first(row, ['ShipDate', 'shipDate']))
    case 'lifecycle':
    default:
      return nullableDateOnly(first(row, ['ShipDate', 'shipDate', 'OrderDate', 'orderDate', 'Date', 'date', 'CreatedOn', 'createdOn']))
  }
}

function sumField(rows: JsonRecord[], field: string): number {
  return Number(rows.reduce((sum, row) => sum + Number(row[field] ?? 0), 0).toFixed(2))
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function flattenSalesRows(rows: JsonRecord[]): JsonRecord[] {
  const flattened: JsonRecord[] = []
  for (const row of rows) {
    const nested = extractRows(row)
    if (nested.length === 0) {
      flattened.push(row)
      continue
    }
    const orderId = first(row, ['OrderID', 'OrderId', 'orderID', 'orderId', 'ID', 'Id', 'id'])
    for (const item of nested) {
      flattened.push({ ...row, ...item, OrderID: first(item, ['OrderID', 'OrderId', 'orderID', 'orderId']) ?? orderId })
    }
  }
  return flattened
}

function extractRows(body: unknown): JsonRecord[] {
  if (Array.isArray(body)) return body as JsonRecord[]
  if (!body || typeof body !== 'object') return []
  const record = body as JsonRecord
  for (const key of ['Items', 'items', 'OrderItems', 'orderItems', 'Results', 'results', 'Data', 'data']) {
    if (Array.isArray(record[key])) return record[key] as JsonRecord[]
  }
  return []
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function normalizeEndpoint(endpoint: string): string {
  const trimmed = endpoint.trim()
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`
}

function stripTrailingSlash(value: string): string {
  return value.endsWith('/') ? value.slice(0, -1) : value
}

function newestCursor(rows: JsonRecord[]): string | null {
  return rows
    .map(row => nullableDate(first(row, ['UpdatedOn', 'updatedOn', 'UpdatedDate', 'updatedDate', 'LastUpdatedOn', 'lastUpdatedOn', 'ShipDate', 'shipDate', 'OrderDate', 'orderDate'])))
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

function nullableDateText(value: unknown): string | null {
  const date = nullableDateOnly(value)
  return date
}

function nullableNumber(value: unknown): number | null {
  if (value == null || value === '') return null
  const normalized = typeof value === 'string'
    ? value.replace(/[$,\s]/g, '').match(/-?\d+(?:\.\d+)?/)?.[0]
    : value
  if (normalized == null || normalized === '') return null
  const number = Number(normalized)
  return Number.isFinite(number) ? number : null
}

function nullableDateOnly(value: unknown): string | null {
  const iso = nullableDate(value)
  return iso ? iso.slice(0, 10) : null
}

function nullableDate(value: unknown): string | null {
  if (value == null || value === '') return null
  const text = String(value)
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(text)
    ? `${text}T00:00:00Z`
    : hasTimeZone(text) ? text : `${text}Z`
  const date = new Date(normalized)
  return Number.isFinite(date.getTime()) ? date.toISOString() : null
}

function startOfDayDateTime(value: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00` : value
}

function endOfDayDateTime(value: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T23:59:59` : value
}

function hasTimeZone(value: string): boolean {
  return /(?:z|[+-]\d{2}:?\d{2})$/i.test(value)
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const number = Number(value)
  if (!Number.isFinite(number)) return fallback
  return Math.min(max, Math.max(min, Math.floor(number)))
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

function withCursorOverlap(cursor: string): string {
  const date = new Date(cursor)
  if (!Number.isFinite(date.getTime())) return new Date().toISOString()
  date.setMinutes(date.getMinutes() - CURSOR_OVERLAP_MINUTES)
  return date.toISOString()
}

function yesterdayUtcDate(): string {
  return offsetBusinessDate(-1, Deno.env.get('SELLERCLOUD_SALES_TIME_ZONE') ?? DEFAULT_BUSINESS_TIME_ZONE)
}

function offsetBusinessDate(offsetDays: number, timeZone: string): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  const parts = Object.fromEntries(formatter.formatToParts(new Date()).map(part => [part.type, part.value]))
  const anchor = new Date(`${parts.year}-${parts.month}-${parts.day}T00:00:00Z`)
  anchor.setUTCDate(anchor.getUTCDate() + offsetDays)
  return anchor.toISOString().slice(0, 10)
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
