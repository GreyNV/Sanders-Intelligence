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
const DEFAULT_DATE_PARAM_PRESET = 'createdOn'

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
    const endpoint = normalizeEndpoint(Deno.env.get('SELLERCLOUD_SALES_ENDPOINT') ?? DEFAULT_ENDPOINT)
    const token = await getSellerCloudToken(base)
    const { rows, totalResults, pagesFetched } = await fetchSalesRows(base, endpoint, token, options, syncState.startPage, syncState.queryCursor)
    const bridge = await loadSkuBridge(supabase)
    const rowsInWindow = filterRowsBySaleDate(rows, options.dateFrom, options.dateTo)
    const salesRows = aggregateSalesRows(rowsInWindow, bridge, endpoint)

    if (!options.dryRun && salesRows.length > 0) {
      const { error } = await supabase
        .from('sales_daily')
        .upsert(salesRows, { onConflict: 'sale_date,channel,source_sku' })
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
      })
    }

    return json({
      dryRun: options.dryRun,
      synced: salesRows.length,
      sourceRows: rows.length,
      sourceRowsInWindow: rowsInWindow.length,
      endpoint,
      incrementalFrom: syncState.queryCursor,
      dateFrom: options.dateFrom,
      dateTo: options.dateTo,
      dateParamPreset: options.dateParamPreset,
      nextCursor,
      totalResults,
      pagesFetched,
      sourceDateRange: dateRange(rows),
      filteredDateRange: dateRange(rowsInWindow),
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
  dryRun: boolean
}

async function readSyncOptions(req: Request): Promise<SyncOptions> {
  const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {}
  const defaultDate = yesterdayUtcDate()
  const dateFrom = nullableDateText(body.dateFrom) ?? (body.fullRefresh === true ? null : defaultDate)
  const dateTo = nullableDateText(body.dateTo) ?? dateFrom
  return {
    maxPages: clampNumber(body.maxPages, 1, 200, 2),
    pageSize: clampNumber(body.pageSize, 1, 100, 50),
    fullRefresh: body.fullRefresh === true,
    initialLookbackDays: clampNumber(body.initialLookbackDays, 1, 730, DEFAULT_INITIAL_LOOKBACK_DAYS),
    startPage: body.startPage == null ? null : clampNumber(body.startPage, 1, 10000, 1),
    dateFrom,
    dateTo,
    dateParamPreset: nullableText(body.dateParamPreset) ?? Deno.env.get('SELLERCLOUD_SALES_DATE_PARAM_PRESET') ?? DEFAULT_DATE_PARAM_PRESET,
    dryRun: body.dryRun === true,
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
    const pageRows = extractRows(body)
    const rows = flattenSalesRows(pageRows)
    all.push(...rows)
    pagesFetched += 1

    totalResults = Number(body.TotalResults ?? body.totalResults ?? body.TotalCount ?? body.totalCount ?? totalResults)
    if (pageRows.length < options.pageSize || (totalResults > 0 && pageNumber * options.pageSize >= totalResults)) break
  }

  return { rows: all, totalResults, pagesFetched }
}

function applyDateParams(url: URL, options: SyncOptions) {
  if (!options.dateFrom && !options.dateTo) return
  const [fromParam, toParam] = dateParamNames(options.dateParamPreset)
  if (options.dateFrom) url.searchParams.set(fromParam, options.dateFrom)
  if (options.dateTo) url.searchParams.set(toParam, options.dateTo)
}

function dateParamNames(preset: string): [string, string] {
  switch (preset) {
    case 'date':
      return ['model.dateFrom', 'model.dateTo']
    case 'shipDate':
      return ['model.shipDateFrom', 'model.shipDateTo']
    case 'createdOn':
      return ['model.createdOnFrom', 'model.createdOnTo']
    case 'updatedDate':
      return ['model.updatedDateFrom', 'model.updatedDateTo']
    case 'orderDate':
    default:
      return ['model.orderDateFrom', 'model.orderDateTo']
  }
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

function aggregateSalesRows(rows: JsonRecord[], bridge: Map<string, string>, endpoint: string): JsonRecord[] {
  const map = new Map<string, JsonRecord>()
  for (const row of rows) {
    const saleDate = nullableDateOnly(first(row, ['ShipDate', 'shipDate', 'OrderDate', 'orderDate', 'Date', 'date', 'CreatedOn', 'createdOn']))
    const sourceSku = nullableText(first(row, ['ProductID', 'ProductId', 'productId', 'SKU', 'sku', 'Sku']))
    if (!saleDate || !sourceSku) continue
    const channel = nullableText(first(row, ['Channel', 'channel', 'CompanyName', 'companyName', 'Company', 'company'])) ?? 'Unassigned'
    const key = `${saleDate}|${channel}|${sourceSku}`
    const existing = map.get(key) ?? {
      sale_date: saleDate,
      channel,
      source_sku: sourceSku,
      planning_sku: bridge.get(sourceSku.toLowerCase()) ?? null,
      units_sold: 0,
      revenue: 0,
      orders_count: 0,
      source_payload: { endpoint, sample_count: 0 },
      synced_at: new Date().toISOString(),
    }
    existing.units_sold = Number(existing.units_sold) + (nullableNumber(first(row, ['Qty', 'qty', 'Quantity', 'quantity', 'QtySold', 'qtySold'])) ?? 0)
    existing.revenue = Number(existing.revenue) + (nullableNumber(first(row, ['LineTotal', 'lineTotal', 'SubTotal', 'subTotal', 'GrandTotal', 'grandTotal', 'Total', 'total'])) ?? 0)
    existing.orders_count = Number(existing.orders_count) + 1
    existing.source_payload = {
      endpoint,
      sample_count: Number((existing.source_payload as JsonRecord).sample_count ?? 0) + 1,
    }
    map.set(key, existing)
  }
  return Array.from(map.values())
}

function filterRowsBySaleDate(rows: JsonRecord[], dateFrom: string | null, dateTo: string | null): JsonRecord[] {
  if (!dateFrom && !dateTo) return rows
  return rows.filter(row => {
    const saleDate = saleDateOnly(row)
    if (!saleDate) return false
    if (dateFrom && saleDate < dateFrom) return false
    if (dateTo && saleDate > dateTo) return false
    return true
  })
}

function dateRange(rows: JsonRecord[]): { min: string | null; max: string | null } {
  const dates = rows
    .map(saleDateOnly)
    .filter((value): value is string => Boolean(value))
    .sort()
  return {
    min: dates[0] ?? null,
    max: dates.at(-1) ?? null,
  }
}

function saleDateOnly(row: JsonRecord): string | null {
  return nullableDateOnly(first(row, ['ShipDate', 'shipDate', 'OrderDate', 'orderDate', 'Date', 'date', 'CreatedOn', 'createdOn']))
}

function flattenSalesRows(rows: JsonRecord[]): JsonRecord[] {
  const flattened: JsonRecord[] = []
  for (const row of rows) {
    const nested = extractRows(row)
    if (nested.length === 0) {
      flattened.push(row)
      continue
    }
    for (const item of nested) {
      flattened.push({ ...row, ...item })
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

function normalizeEndpoint(endpoint: string): string {
  const trimmed = endpoint.trim()
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`
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
  const number = Number(value)
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
  const date = new Date()
  date.setUTCHours(0, 0, 0, 0)
  date.setUTCDate(date.getUTCDate() - 1)
  return date.toISOString().slice(0, 10)
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
