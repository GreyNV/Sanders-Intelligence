import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from 'https://esm.sh/@supabase/supabase-js@2/cors'
const SYNC_TIME_BUDGET_MS = 100_000
const SELLERCLOUD_REQUEST_TIMEOUT_MS = 20_000
const ORDER_PAGES_PER_RUN = 32
const PNL_BATCHES_PER_RUN = 32
const COGS_SYNC_KEY = 'inventory_cogs_daily'

type CogsProgress = {
  date: string
  phase: 'orders' | 'pnl'
  nextPage: number
  totalOrders: number | null
  orderIds: number[]
  nextPnlBatch: number
  cogsAmount: number
  missingCostCount: number
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    const requestedHeaders = req.headers.get('Access-Control-Request-Headers')
    return new Response('ok', {
      headers: {
        ...corsHeaders,
        'Access-Control-Allow-Headers': requestedHeaders ?? corsHeaders['Access-Control-Allow-Headers'],
      },
    })
  }
  const deadline = Date.now() + SYNC_TIME_BUDGET_MS
  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '')
    const bearer = req.headers.get('Authorization')?.replace('Bearer ', '')
    if (!bearer) throw new Error('Missing bearer token')
    if (bearer !== Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')) {
      const { data: { user }, error } = await supabase.auth.getUser(bearer)
      if (error || !user) throw new Error('Unauthorized')
      const { data: profile } = await supabase.from('users').select('role,is_active').eq('id', user.id).maybeSingle()
      if (!profile?.is_active || !['admin', 'purchasing'].includes(profile.role)) throw new Error('Purchasing role required')
    }

    const { data: settings, error: settingsError } = await supabase.from('inventory_balance_settings').select('beginning_period_month').eq('settings_key', 'active').maybeSingle()
    if (settingsError) throw settingsError
    if (!settings) throw new Error('Set the beginning inventory balance before syncing COGS')
    const from = String(settings.beginning_period_month).slice(0, 10)
    const to = new Date().toISOString().slice(0, 10)
    const existing = new Set<string>()
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await supabase.from('inventory_cogs_daily').select('sale_date').gte('sale_date', from).lte('sale_date', to).order('sale_date').range(offset, offset + 999)
      if (error) throw error
      for (const row of data ?? []) existing.add(String(row.sale_date).slice(0, 10))
      if (!data || data.length < 1000) break
    }
    const missing: string[] = []
    for (let day = from; day <= to; day = addDays(day, 1)) {
      if (!existing.has(day)) missing.push(day)
    }
    const day = missing[0]
    if (!day) return json({ syncedDays: 0, skippedDays: 0, missingDays: 0, remainingDays: 0, processedDates: [] })
    const base = (Deno.env.get('SELLERCLOUD_DELTA_BASE') ?? 'https://snc.api.sellercloud.com/rest').replace(/\/$/, '')
    const token = await getToken(base, deadline)
    const { data: savedProgress, error: progressReadError } = await supabase.from('sync_state').select('state').eq('key', COGS_SYNC_KEY).maybeSingle()
    if (progressReadError) throw progressReadError
    let progress = parseProgress(savedProgress?.state, day)
    if (!progress) progress = { date: day, phase: 'orders', nextPage: 1, totalOrders: null, orderIds: [], nextPnlBatch: 0, cogsAmount: 0, missingCostCount: 0 }

    const fetchOrdersPage = async (page: number) => {
      const params = new URLSearchParams({ 'model.pageNumber': String(page), 'model.pageSize': '50', 'model.shipFromDate': `${day}T00:00:00`, 'model.shipToDate': `${day}T23:59:59` })
      const response = await fetchSellerCloud(`${base}/api/Orders?${params}`, { headers: { Authorization: `Bearer ${token}` } }, `SellerCloud orders page ${page} for ${day}`, deadline)
      if (!response.ok) throw new Error(`SellerCloud orders request failed (${response.status}) for ${day}`)
      const body = await readSellerCloudJson(response, `SellerCloud orders page ${page} response for ${day}`, deadline)
      if (!Array.isArray(body.Items)) throw new Error(`Unexpected SellerCloud orders response for ${day}`)
      const ids = body.Items.map((row: Record<string, unknown>) => Number(row.ID ?? row.OrderID ?? row.OrderId))
      if (ids.some((id: number) => !Number.isSafeInteger(id) || id <= 0)) throw new Error(`Invalid SellerCloud order ID for ${day}`)
      return { ids, total: Number(body.TotalResults ?? body.TotalCount) }
    }

    if (progress.phase === 'orders') {
      if (progress.nextPage === 1) {
        const firstPage = await fetchOrdersPage(1)
        if (!Number.isSafeInteger(firstPage.total) || firstPage.total < 0) throw new Error(`Missing SellerCloud result count for ${day}`)
        progress.totalOrders = firstPage.total
        progress.orderIds.push(...firstPage.ids)
        progress.nextPage = 2
      }
      const totalPages = Math.ceil((progress.totalOrders ?? 0) / 50)
      if (totalPages > 10000) throw new Error(`SellerCloud pagination limit reached for ${day}`)
      const pageCountThisRun = Math.min(ORDER_PAGES_PER_RUN, Math.max(0, totalPages - progress.nextPage + 1))
      const pageNumbers = Array.from({ length: pageCountThisRun }, (_, index) => progress!.nextPage + index)
      for (let offset = 0; offset < pageNumbers.length; offset += 4) {
        const batchPages = pageNumbers.slice(offset, offset + 4)
        if (deadline - Date.now() < 15_000) break
        const pages = await Promise.all(batchPages.map(fetchOrdersPage))
        for (let i = 0; i < pages.length; i++) {
          const page = pages[i]
          if (progress.totalOrders == null) {
            if (!Number.isSafeInteger(page.total) || page.total < 0) throw new Error(`Missing SellerCloud result count for ${day}`)
            progress.totalOrders = page.total
          }
          progress.orderIds.push(...page.ids)
          progress.nextPage = batchPages[i] + 1
        }
      }
      if (progress.orderIds.length >= progress.totalOrders) progress.phase = 'pnl'
    }

    if (progress.phase === 'pnl') {
      const batches: number[][] = []
      for (let offset = 0; offset < progress.orderIds.length; offset += 100) batches.push(progress.orderIds.slice(offset, offset + 100))
      const selected = batches.slice(progress.nextPnlBatch, progress.nextPnlBatch + PNL_BATCHES_PER_RUN)
      for (let offset = 0; offset < selected.length; offset += 4) {
        const batchGroup = selected.slice(offset, offset + 4)
        if (deadline - Date.now() < 15_000) break
        const responses = await Promise.all(batchGroup.map(async (ids) => {
          const response = await fetchSellerCloud(`${base}/api/Orders/ProfitAndLoss`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ Orders: ids }) }, `SellerCloud P&L batch for ${day}`, deadline)
          if (!response.ok) throw new Error(`SellerCloud P&L request failed (${response.status}) for ${day}`)
          const rows = await readSellerCloudJson(response, `SellerCloud P&L response for ${day}`, deadline)
          if (!Array.isArray(rows)) throw new Error(`Unexpected SellerCloud P&L response for ${day}`)
          return { ids, rows: rows as Record<string, unknown>[] }
        }))
        for (const { ids, rows } of responses) {
          const costById = new Map(rows.map(row => [String(row.OrderID ?? row.OrderId ?? row.ID), row.ItemCostUsd]))
          for (const id of ids) {
            const cost = costById.get(String(id))
            if (cost == null || cost === '' || !Number.isFinite(Number(cost))) progress.missingCostCount++
            else progress.cogsAmount += Number(cost)
          }
          progress.nextPnlBatch++
        }
      }
      if (progress.nextPnlBatch >= batches.length) {
        const row = { sale_date: day, cogs_amount: Number(progress.cogsAmount.toFixed(2)), order_count: progress.orderIds.length, missing_cost_count: progress.missingCostCount }
        const { error } = await supabase.from('inventory_cogs_daily').upsert({ ...row, source: 'sellercloud_item_cost_usd', fetched_at: new Date().toISOString() }, { onConflict: 'sale_date' })
        if (error) throw error
        await saveProgress(supabase, day, {})
        return json({ syncedDays: 1, skippedDays: row.order_count === 0 ? 1 : 0, missingDays: missing.length, remainingDays: missing.length - 1, processedDates: [day], inProgress: false })
      }
    }

    await saveProgress(supabase, day, progress)
    const totalPages = progress.totalOrders == null ? null : Math.ceil(progress.totalOrders / 50)
    return json({ syncedDays: 0, skippedDays: 0, missingDays: missing.length, remainingDays: missing.length, processedDates: [], inProgress: true, progress: { date: day, phase: progress.phase, pagesProcessed: Math.min(progress.nextPage - 1, totalPages ?? progress.nextPage - 1), totalPages, ordersCollected: progress.orderIds.length, totalOrders: progress.totalOrders, pnlBatchesProcessed: progress.nextPnlBatch, totalPnlBatches: progress.totalOrders == null ? null : Math.ceil(progress.totalOrders / 100) } })
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'COGS sync failed')
    return json({ error: error instanceof Error ? error.message : 'COGS sync failed' }, 500)
  }
})

async function getToken(base: string, deadline: number) {
  const response = await fetchSellerCloud(`${base}/api/token`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ Username: Deno.env.get('SELLERCLOUD_USERNAME'), Password: Deno.env.get('SELLERCLOUD_PASSWORD') }) }, 'SellerCloud authentication', deadline)
  if (!response.ok) throw new Error(`SellerCloud authentication failed (${response.status})`)
  const result = await readSellerCloudJson(response, 'SellerCloud authentication response', deadline)
  const token = result.access_token ?? result.AccessToken
  if (!token) throw new Error('SellerCloud returned no access token')
  return token as string
}

function parseProgress(value: unknown, day: string): CogsProgress | null {
  if (!value || typeof value !== 'object') return null
  const state = value as Partial<CogsProgress>
  if (state.date !== day || !['orders', 'pnl'].includes(String(state.phase)) || !Array.isArray(state.orderIds)) return null
  return {
    date: day,
    phase: state.phase as CogsProgress['phase'],
    nextPage: Number(state.nextPage) || 1,
    totalOrders: state.totalOrders == null ? null : Number(state.totalOrders),
    orderIds: state.orderIds.map(Number),
    nextPnlBatch: Number(state.nextPnlBatch) || 0,
    cogsAmount: Number(state.cogsAmount) || 0,
    missingCostCount: Number(state.missingCostCount) || 0,
  }
}

async function saveProgress(supabase: ReturnType<typeof createClient>, day: string, state: CogsProgress | Record<string, never>) {
  const { error } = await supabase.from('sync_state').upsert({ key: COGS_SYNC_KEY, cursor_value: day, updated_at: new Date().toISOString(), state, last_error: null }, { onConflict: 'key' })
  if (error) throw error
}

async function fetchSellerCloud(url: string, init: RequestInit, description: string, deadline: number) {
  const remainingMs = deadline - Date.now()
  if (remainingMs <= 0) throw new Error('COGS sync reached its time budget; click again to continue')
  const timeoutMs = Math.min(SELLERCLOUD_REQUEST_TIMEOUT_MS, remainingMs)
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort()
        reject(new Error(`${description} timed out after ${Math.ceil(timeoutMs / 1000)} seconds`))
      }, timeoutMs)
    })
    return await Promise.race([
      fetch(url, { ...init, signal: controller.signal }),
      timeout,
    ])
  } catch (error) {
    throw error
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
}

async function readSellerCloudJson(response: Response, description: string, deadline: number) {
  const remainingMs = deadline - Date.now()
  if (remainingMs <= 0) throw new Error('COGS sync reached its time budget; click again to continue')
  const timeoutMs = Math.min(SELLERCLOUD_REQUEST_TIMEOUT_MS, remainingMs)
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`${description} timed out after ${Math.ceil(timeoutMs / 1000)} seconds`)),
        timeoutMs,
      )
    })
    return await Promise.race([response.json(), timeout])
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
}

function addDays(day: string, amount: number) {
  const date = new Date(`${day}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + amount)
  return date.toISOString().slice(0, 10)
}
function json(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }) }
