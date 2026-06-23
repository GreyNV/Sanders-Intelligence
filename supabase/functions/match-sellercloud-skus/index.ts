import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { buildSkuBridgeInsertRows, summarizeSkuBackfill } from '../_shared/sku-match.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )
    await requireAdminOrService(req, supabase)

    const sourceSkus = await loadUnmatchedSourceSkus(supabase)
    const inventorySkus = await loadLatestInventorySkus(supabase)
    const existing = await loadExistingBridgeKeys(supabase)
    const candidateRows = buildSkuBridgeInsertRows(sourceSkus, inventorySkus)
    const rows = candidateRows.filter(row => {
      const key = bridgeKey(row.source_sku, row.planning_sku, row.match_method)
      return !existing.has(key)
    })

    if (rows.length > 0) {
      const { error } = await supabase.from('sku_bridge').insert(rows)
      if (error) throw error
    }

    let backfilledItems = 0
    for (const row of candidateRows) {
      const { data, error } = await supabase
        .from('po_items')
        .update({ planning_sku: row.planning_sku })
        .eq('source_sku', row.source_sku)
        .is('planning_sku', null)
        .select('id')
      if (error) throw error
      backfilledItems += data?.length ?? 0
    }

    return json({
      insertedBridgeRows: rows.length,
      ...summarizeSkuBackfill({
        beforeUnmatched: sourceSkus.length,
        matchedSourceSkus: candidateRows.length,
        backfilledItems,
      }),
    })
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'SKU matching failed' }, 500)
  }
})

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

async function loadUnmatchedSourceSkus(supabase: ReturnType<typeof createClient>): Promise<string[]> {
  const { data, error } = await supabase
    .from('po_items')
    .select('source_sku')
    .is('planning_sku', null)
    .not('source_sku', 'is', null)
  if (error) throw error
  return Array.from(new Set((data ?? []).map(row => String(row.source_sku ?? '').trim()).filter(Boolean)))
}

async function loadLatestInventorySkus(supabase: ReturnType<typeof createClient>): Promise<string[]> {
  const { data: upload, error: uploadError } = await supabase
    .from('uploads')
    .select('id')
    .eq('status', 'complete')
    .order('uploaded_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (uploadError) throw uploadError
  if (!upload?.id) return []

  const skus: string[] = []
  let from = 0
  const pageSize = 1000
  while (true) {
    const { data, error } = await supabase
      .from('inventory_records')
      .select('product_code')
      .eq('upload_id', upload.id)
      .range(from, from + pageSize - 1)
    if (error) throw error
    const page = data ?? []
    skus.push(...page.map(row => String(row.product_code ?? '').trim()).filter(Boolean))
    if (page.length < pageSize) break
    from += pageSize
  }
  return skus
}

async function loadExistingBridgeKeys(supabase: ReturnType<typeof createClient>): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('sku_bridge')
    .select('source_sku, planning_sku, match_method')
    .eq('source_system', 'seller_cloud')
    .eq('is_active', true)
  if (error) throw error
  return new Set((data ?? []).map(row => bridgeKey(row.source_sku, row.planning_sku, row.match_method)))
}

function bridgeKey(sourceSku: unknown, planningSku: unknown, matchMethod: unknown): string {
  return `${String(sourceSku ?? '').toLowerCase()}|${String(planningSku ?? '').toLowerCase()}|${String(matchMethod ?? '')}`
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

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
