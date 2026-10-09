import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const MAX_DAYS_PER_RUN = 7

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
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
    const targetDays = missing.slice(0, MAX_DAYS_PER_RUN)
    const base = (Deno.env.get('SELLERCLOUD_DELTA_BASE') ?? 'https://snc.api.sellercloud.com/rest').replace(/\/$/, '')
    const token = await getToken(base)
    let skippedDays = 0
    for (const day of targetDays) {
      const row = await fetchDayCosts(base, token, day)
      if (row.order_count === 0) skippedDays++
      const { error } = await supabase.from('inventory_cogs_daily').upsert({ ...row, source: 'sellercloud_item_cost_usd', fetched_at: new Date().toISOString() }, { onConflict: 'sale_date' })
      if (error) throw error
    }
    return json({ syncedDays: targetDays.length, skippedDays, missingDays: missing.length, remainingDays: Math.max(0, missing.length - targetDays.length), processedDates: targetDays })
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'COGS sync failed' }, 500)
  }
})

async function getToken(base: string) {
  const response = await fetch(`${base}/api/token`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ Username: Deno.env.get('SELLERCLOUD_USERNAME'), Password: Deno.env.get('SELLERCLOUD_PASSWORD') }) })
  if (!response.ok) throw new Error(`SellerCloud authentication failed (${response.status})`)
  const result = await response.json()
  const token = result.access_token ?? result.AccessToken
  if (!token) throw new Error('SellerCloud returned no access token')
  return token as string
}

async function fetchDayCosts(base: string, token: string, day: string) {
  const orders: Record<string, unknown>[] = []
  let total = 0
  for (let page = 1; page <= 10000; page++) {
    const params = new URLSearchParams({ 'model.pageNumber': String(page), 'model.pageSize': '50', 'model.shipFromDate': `${day}T00:00:00`, 'model.shipToDate': `${day}T23:59:59` })
    const response = await fetch(`${base}/api/Orders?${params}`, { headers: { Authorization: `Bearer ${token}` } })
    if (!response.ok) throw new Error(`SellerCloud orders request failed (${response.status}) for ${day}`)
    const body = await response.json()
    if (!Array.isArray(body.Items)) throw new Error(`Unexpected SellerCloud orders response for ${day}`)
    total = Number(body.TotalResults ?? body.TotalCount)
    if (!Number.isSafeInteger(total) || total < 0) throw new Error(`Missing SellerCloud result count for ${day}`)
    orders.push(...body.Items)
    if (orders.length >= total) break
    if (page === 10000) throw new Error(`SellerCloud pagination limit reached for ${day}`)
  }
  const costs: Record<string, unknown>[] = []
  for (let offset = 0; offset < orders.length; offset += 100) {
    const ids = orders.slice(offset, offset + 100).map(row => Number(row.ID ?? row.OrderID ?? row.OrderId))
    if (ids.some(id => !Number.isSafeInteger(id) || id <= 0)) throw new Error(`Invalid SellerCloud order ID for ${day}`)
    const response = await fetch(`${base}/api/Orders/ProfitAndLoss`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ Orders: ids }) })
    if (!response.ok) throw new Error(`SellerCloud P&L request failed (${response.status}) for ${day}`)
    const rows = await response.json()
    if (!Array.isArray(rows)) throw new Error(`Unexpected SellerCloud P&L response for ${day}`)
    costs.push(...rows)
  }
  const costById = new Map(costs.map(row => [String(row.OrderID ?? row.OrderId ?? row.ID), row.ItemCostUsd]))
  let amount = 0
  let missing = 0
  for (const order of orders) {
    const id = String(order.ID ?? order.OrderID ?? order.OrderId)
    const cost = costById.get(id)
    if (cost == null || cost === '' || !Number.isFinite(Number(cost))) missing++
    else amount += Number(cost)
  }
  return { sale_date: day, cogs_amount: Number(amount.toFixed(2)), order_count: orders.length, missing_cost_count: missing }
}

function addDays(day: string, amount: number) {
  const date = new Date(`${day}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + amount)
  return date.toISOString().slice(0, 10)
}
function json(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }) }
