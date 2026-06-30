export const config = {
  maxDuration: 300,
}

const PAGE_SIZE = 50
const PAGES_PER_CALL = 20
const MAX_TOTAL_PAGES = 240

export default async function handler(request, response) {
  if (request.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    response.status(401).json({ error: 'Unauthorized' })
    return
  }

  if (request.method !== 'GET' && request.method !== 'POST') {
    response.status(405).json({ error: 'Method not allowed' })
    return
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceKey) {
    response.status(500).json({ ok: false, error: 'Supabase service configuration is missing' })
    return
  }

  try {
    const result = await syncSalesInChunks(supabaseUrl, serviceKey)
    response.status(200).json({ ok: true, ...result })
  } catch (error) {
    response.status(500).json({ ok: false, error: error.message })
  }
}

async function syncSalesInChunks(supabaseUrl, serviceKey) {
  let startPage = 1
  let totalResults = 0
  const totals = {
    synced: 0,
    sourceRows: 0,
    sourceRowsInWindow: 0,
    revenue: 0,
    units: 0,
    ordersCount: 0,
    pagesFetched: 0,
    calls: 0,
  }
  let lastBody = {}

  while (startPage <= MAX_TOTAL_PAGES) {
    const body = await invokeSalesSync(supabaseUrl, serviceKey, {
      startPage,
      maxPages: PAGES_PER_CALL,
      pageSize: PAGE_SIZE,
      dateParamPreset: 'shipDate',
      saleDatePreset: 'shipDate',
      replaceDate: startPage === 1,
    })

    lastBody = body
    totals.calls += 1
    totals.synced += Number(body.synced ?? 0)
    totals.sourceRows += Number(body.sourceRows ?? 0)
    totals.sourceRowsInWindow += Number(body.sourceRowsInWindow ?? 0)
    totals.revenue += Number(body.revenue ?? 0)
    totals.units += Number(body.units ?? 0)
    totals.ordersCount += Number(body.ordersCount ?? 0)
    totals.pagesFetched += Number(body.pagesFetched ?? 0)
    totalResults = Number(body.totalResults ?? totalResults)

    const pagesFetched = Number(body.pagesFetched ?? 0)
    if (pagesFetched < PAGES_PER_CALL) break
    if (totalResults > 0 && (startPage + pagesFetched - 1) * PAGE_SIZE >= totalResults) break

    startPage += pagesFetched
  }

  return {
    ...lastBody,
    ...totals,
    revenue: Number(totals.revenue.toFixed(2)),
    totalResults,
    chunked: true,
    complete: totalResults === 0 || totals.pagesFetched * PAGE_SIZE >= totalResults,
  }
}

async function invokeSalesSync(supabaseUrl, serviceKey, payload) {
  const syncResponse = await fetch(`${supabaseUrl}/functions/v1/sync-sales`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
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
