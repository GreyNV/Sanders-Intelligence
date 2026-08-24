export const config = {
  maxDuration: 300,
}

const PAGE_SIZE = 50
const PAGES_PER_CALL = 10
const MAX_TOTAL_PAGES = 240
const CRON_PROGRESS_KEY = 'sellercloud_sales_cron_progress'
const CRON_DURATION_BUDGET_MS = 240_000
const MIN_NEXT_CHUNK_BUDGET_MS = 75_000
const DEFAULT_BUSINESS_TIME_ZONE = 'America/New_York'

export default async function handler(request, response) {
  if (request.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    response.status(401).json({ error: 'Unauthorized' })
    return
  }

  if (request.method !== 'GET' && request.method !== 'POST') {
    response.status(405).json({ error: 'Method not allowed' })
    return
  }

  const body = await readJsonBody(request)
  const supabaseUrl = process.env.VITE_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceKey) {
    response.status(500).json({ ok: false, error: 'Supabase service configuration is missing' })
    return
  }

  try {
    const result = await syncSalesInChunks(supabaseUrl, serviceKey, {
      date: requestOption(request, body, 'date') ?? requestOption(request, body, 'dateFrom'),
      force: booleanOption(requestOption(request, body, 'force')),
    })
    response.status(200).json({ ok: true, ...result })
  } catch (error) {
    response.status(500).json({ ok: false, error: error.message })
  }
}

async function syncSalesInChunks(supabaseUrl, serviceKey, options = {}) {
  const started = Date.now()
  const targetDate = nullableDateText(options.date) ?? businessDateOffset(-1, process.env.SELLERCLOUD_SALES_TIME_ZONE || DEFAULT_BUSINESS_TIME_ZONE)
  const savedProgress = await loadCronProgress(supabaseUrl, serviceKey)
  const progress = savedProgress?.date === targetDate && !options.force
    ? savedProgress
    : initialProgress(targetDate)

  if (progress.complete && !options.force) {
    return {
      targetDate,
      skipped: true,
      chunked: true,
      complete: true,
      reason: 'date already completed',
      ...normalizeTotals(progress.totals),
      totalResults: Number(progress.totalResults ?? 0),
      nextPage: null,
    }
  }

  let startPage = Math.max(1, Number(progress.nextPage ?? 1))
  let totalResults = Number(progress.totalResults ?? 0)
  const totals = normalizeTotals(progress.totals)
  let lastBody = progress.lastBody ?? {}

  while (startPage <= MAX_TOTAL_PAGES && hasTimeForAnotherChunk(started)) {
    const body = await invokeSalesSync(supabaseUrl, serviceKey, {
      dateFrom: targetDate,
      dateTo: targetDate,
      startPage,
      maxPages: PAGES_PER_CALL,
      pageSize: PAGE_SIZE,
      dateParamPreset: 'shipDate',
      saleDatePreset: 'shipDate',
      replaceDate: startPage === 1,
    })

    lastBody = body
    addToTotals(totals, body)
    totalResults = Number(body.totalResults ?? totalResults)

    const pagesFetched = Number(body.pagesFetched ?? 0)
    if (pagesFetched <= 0) throw new Error('Sales sync returned no fetched pages')

    const complete = pagesFetched < PAGES_PER_CALL ||
      (totalResults > 0 && (startPage + pagesFetched - 1) * PAGE_SIZE >= totalResults)

    if (complete) {
      await saveCronProgress(supabaseUrl, serviceKey, {
        date: targetDate,
        nextPage: null,
        complete: true,
        totals,
        totalResults,
        lastBody,
        completedAt: new Date().toISOString(),
      })

      return {
        ...lastBody,
        ...totals,
        revenue: Number(totals.revenue.toFixed(2)),
        targetDate,
        totalResults,
        nextPage: null,
        chunked: true,
        complete: true,
        durationMs: Date.now() - started,
      }
    }

    startPage += pagesFetched
    await saveCronProgress(supabaseUrl, serviceKey, {
      date: targetDate,
      nextPage: startPage,
      complete: false,
      totals,
      totalResults,
      lastBody,
      updatedAt: new Date().toISOString(),
    })
  }

  return {
    ...lastBody,
    ...totals,
    revenue: Number(totals.revenue.toFixed(2)),
    targetDate,
    totalResults,
    nextPage: startPage <= MAX_TOTAL_PAGES ? startPage : null,
    chunked: true,
    complete: false,
    durationMs: Date.now() - started,
  }
}

async function invokeSalesSync(supabaseUrl, serviceKey, payload) {
  const syncResponse = await fetch(`${supabaseUrl}/functions/v1/sync-sales`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
    },
    body: JSON.stringify(payload),
  })

  const body = await syncResponse.json().catch(() => ({}))
  if (!syncResponse.ok) {
    throw new Error(body.error || `Sales sync failed (${syncResponse.status})`)
  }
  return body
}

async function loadCronProgress(supabaseUrl, serviceKey) {
  const response = await fetch(`${stripTrailingSlash(supabaseUrl)}/rest/v1/sync_state?select=state&key=eq.${encodeURIComponent(CRON_PROGRESS_KEY)}`, {
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
    },
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Failed to load sales cron progress (${response.status}): ${text}`)
  }

  const rows = await response.json()
  const state = Array.isArray(rows) ? rows[0]?.state : null
  return state && typeof state === 'object' ? state : null
}

async function saveCronProgress(supabaseUrl, serviceKey, state) {
  const now = new Date().toISOString()
  const response = await fetch(`${stripTrailingSlash(supabaseUrl)}/rest/v1/sync_state?on_conflict=key`, {
    method: 'POST',
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates',
    },
    body: JSON.stringify({
      key: CRON_PROGRESS_KEY,
      cursor_value: state.date,
      last_successful_sync_at: now,
      updated_at: now,
      state,
      last_error: null,
    }),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Failed to save sales cron progress (${response.status}): ${text}`)
  }
}

function initialProgress(date) {
  return {
    date,
    nextPage: 1,
    complete: false,
    totals: normalizeTotals(),
  }
}

function normalizeTotals(value = {}) {
  return {
    synced: Number(value.synced ?? 0),
    sourceRows: Number(value.sourceRows ?? 0),
    sourceRowsInWindow: Number(value.sourceRowsInWindow ?? 0),
    revenue: Number(value.revenue ?? 0),
    units: Number(value.units ?? 0),
    ordersCount: Number(value.ordersCount ?? 0),
    pagesFetched: Number(value.pagesFetched ?? 0),
    calls: Number(value.calls ?? 0),
  }
}

function addToTotals(totals, body) {
  totals.calls += 1
  totals.synced += Number(body.synced ?? 0)
  totals.sourceRows += Number(body.sourceRows ?? 0)
  totals.sourceRowsInWindow += Number(body.sourceRowsInWindow ?? 0)
  totals.revenue += Number(body.revenue ?? 0)
  totals.units += Number(body.units ?? 0)
  totals.ordersCount += Number(body.ordersCount ?? 0)
  totals.pagesFetched += Number(body.pagesFetched ?? 0)
}

function hasTimeForAnotherChunk(started) {
  return Date.now() - started < CRON_DURATION_BUDGET_MS - MIN_NEXT_CHUNK_BUDGET_MS
}

async function readJsonBody(request) {
  if (request.method !== 'POST') return {}

  const chunks = []
  for await (const chunk of request) chunks.push(Buffer.from(chunk))
  if (chunks.length === 0) return {}

  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    return {}
  }
}

function requestOption(request, body, name) {
  if (body?.[name] != null) return body[name]
  const url = new URL(request.url || '/', `https://${request.headers.host || 'localhost'}`)
  return url.searchParams.get(name)
}

function booleanOption(value) {
  return value === true || value === 'true' || value === '1'
}

function nullableDateText(value) {
  if (!value) return null
  const text = String(value).slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null
}

function businessDateOffset(offsetDays, timeZone) {
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

function stripTrailingSlash(value) {
  return value.endsWith('/') ? value.slice(0, -1) : value
}
