import fs from 'node:fs'
import path from 'node:path'
import mysql from 'mysql2/promise'
import { createClient } from '@supabase/supabase-js'

const PAGE_SIZE = 1000

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) return

  for (const rawLine of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue

    const idx = line.indexOf('=')
    if (idx < 0) continue

    const key = line.slice(0, idx).trim()
    let value = line.slice(idx + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    if (value !== '') process.env[key] = value
  }
}

function env(...names) {
  for (const name of names) {
    if (process.env[name]) return process.env[name]
  }
  return undefined
}

function norm(value) {
  return String(value ?? '').trim().toLowerCase()
}

function compact(value) {
  return norm(value).replace(/[^a-z0-9]/g, '')
}

function stripKnownPrefix(value) {
  let current = norm(value)
  for (let i = 0; i < 3; i += 1) {
    const next = current.replace(/^(?:wm|vpo|vp|vc|vds|v|vend)[-_]+/i, '')
    if (next === current) break
    current = next
  }
  return current
}

function money(value) {
  return Number(value || 0).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  })
}

function pct(part, total) {
  return total ? `${((part / total) * 100).toFixed(2)}%` : '0.00%'
}

function addMapSet(map, key, value) {
  if (!key || !value) return
  if (!map.has(key)) map.set(key, new Set())
  map.get(key).add(value)
}

async function fetchLatestInventoryRows(supabase) {
  const { data: upload, error: uploadError } = await supabase
    .from('uploads')
    .select('id, uploaded_at, filename, row_count, status')
    .eq('status', 'complete')
    .order('uploaded_at', { ascending: false })
    .limit(1)
    .single()

  if (uploadError) throw uploadError

  const rows = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from('inventory_records')
      .select('product_code,on_hand_value')
      .eq('upload_id', upload.id)
      .range(from, from + PAGE_SIZE - 1)

    if (error) throw error
    rows.push(...(data || []))
    if (!data || data.length < PAGE_SIZE) break
  }

  return { upload, rows }
}

function buildSupabaseSkuIndexes(rows) {
  const bySku = new Map()
  const normToSku = new Map()
  const compactToSku = new Map()

  for (const row of rows) {
    const sku = String(row.product_code || '').trim()
    if (!sku) continue

    bySku.set(sku, (bySku.get(sku) || 0) + Number(row.on_hand_value || 0))
    addMapSet(normToSku, norm(sku), sku)
    addMapSet(compactToSku, compact(sku), sku)
  }

  return { bySku, normToSku, compactToSku }
}

function supMatchForKey(key, indexes) {
  if (indexes.normToSku.has(key)) return { kind: 'exact', skus: indexes.normToSku.get(key) }

  const compactKey = compact(key)
  if (indexes.compactToSku.has(compactKey)) return { kind: 'compact', skus: indexes.compactToSku.get(compactKey) }

  return null
}

async function loadEvidence(conn) {
  const [standard] = await conn.execute(`
    select sku, standard_sku
    from standard_sku
    where sku is not null
      and standard_sku is not null
      and trim(sku) <> ''
      and trim(standard_sku) <> ''
  `)

  const [shadow] = await conn.execute(`
    select sku, shadow_of
    from seller_cloud_shadow_of_sku
    where sku is not null
      and shadow_of is not null
      and trim(sku) <> ''
      and trim(shadow_of) <> ''
      and sku <> shadow_of
  `)

  const [box] = await conn.execute(`
    select sku, parent_sku
    from seller_cloud_sku_box_qty_and_item_label
    where sku is not null
      and parent_sku is not null
      and trim(sku) <> ''
      and trim(parent_sku) <> ''
  `)

  const maps = {
    standard_sku: new Map(),
    shadow_of_sku: new Map(),
    box_parent_sku: new Map(),
  }

  for (const row of standard) addMapSet(maps.standard_sku, norm(row.sku), norm(row.standard_sku))
  for (const row of shadow) addMapSet(maps.shadow_of_sku, norm(row.sku), norm(row.shadow_of))
  for (const row of box) addMapSet(maps.box_parent_sku, norm(row.sku), norm(row.parent_sku))

  return {
    maps,
    sizes: {
      standard_sku: standard.length,
      seller_cloud_shadow_of_sku: shadow.length,
      seller_cloud_sku_box_qty_and_item_label: box.length,
    },
  }
}

function classifyProfitSku(profitSku, indexes, evidenceMaps) {
  const direct = norm(profitSku)
  const stripped = stripKnownPrefix(direct)

  let match = supMatchForKey(direct, indexes)
  if (match) return { tier: `direct_${match.kind}`, source: 'direct', ...match }

  if (stripped !== direct) {
    match = supMatchForKey(stripped, indexes)
    if (match) return { tier: `channel_prefix_strip_${match.kind}`, source: 'channel_prefix_strip', target: stripped, ...match }
  }

  const evidenceOrder = [
    ['seller_cloud_shadow_of_sku', evidenceMaps.shadow_of_sku],
    ['standard_sku', evidenceMaps.standard_sku],
    ['seller_cloud_sku_box_qty_and_item_label', evidenceMaps.box_parent_sku],
  ]

  for (const [source, map] of evidenceOrder) {
    for (const key of new Set([direct, stripped])) {
      const targets = map.get(key)
      if (!targets) continue

      for (const target of targets) {
        match = supMatchForKey(target, indexes)
        if (match) return { tier: `${source}_${match.kind}`, source, target, ...match }
      }
    }
  }

  return null
}

async function main() {
  loadEnv(path.join(process.cwd(), '.env'))
  loadEnv(path.join(process.cwd(), '.env.vercel.local'))
  loadEnv(path.join(process.cwd(), '.env.vercel.dev.local'))

  const supabaseUrl = env('VITE_SUPABASE_URL', 'SUPABASE_URL')
  const supabaseKey = env('SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SERVICE_KEY')
  if (!supabaseUrl || !supabaseKey) throw new Error('Missing Supabase URL or service role key')

  const conn = await mysql.createConnection({
    host: env('SI_MYSQL_HOST', 'MYSQL_HOST'),
    port: Number(env('SI_MYSQL_PORT', 'MYSQL_PORT') || 3306),
    user: env('SI_MYSQL_USER', 'MYSQL_USER'),
    password: env('SI_MYSQL_PASSWORD', 'MYSQL_PASSWORD'),
    database: env('SI_MYSQL_DATABASE', 'MYSQL_DATABASE'),
    ssl: env('SI_MYSQL_SSL', 'MYSQL_SSL') === 'true' ? { rejectUnauthorized: false } : undefined,
  })

  const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } })

  try {
    const { upload, rows } = await fetchLatestInventoryRows(supabase)
    const indexes = buildSupabaseSkuIndexes(rows)
    const evidence = await loadEvidence(conn)

    const [profitRows] = await conn.execute(`
      select
        lower(trim(coalesce(nullif(original_shadow_sku, ''), sku))) as profit_sku,
        count(*) as row_count,
        sum(qty_sold) as qty_sold,
        sum(sub_total) as revenue,
        sum(accrual_profit) as accrual_profit
      from seller_cloud_product_profit_and_loss
      where ship_date >= date_sub(current_date(), interval 30 day)
        and ship_date <= current_date()
        and coalesce(nullif(original_shadow_sku, ''), sku) is not null
        and trim(coalesce(nullif(original_shadow_sku, ''), sku)) <> ''
      group by profit_sku
    `)

    const tiers = new Map()
    const matchedSupabaseSkus = new Set()
    const topEvidenceMatches = []
    const unmatched = []

    let totalRevenue = 0
    let totalProfit = 0
    let matchedRevenue = 0
    let matchedProfit = 0
    let matchedProfitSkuRows = 0

    for (const row of profitRows) {
      const revenue = Number(row.revenue || 0)
      const profit = Number(row.accrual_profit || 0)
      totalRevenue += revenue
      totalProfit += profit

      const match = classifyProfitSku(row.profit_sku, indexes, evidence.maps)
      if (!match) {
        unmatched.push({ row, revenue, profit })
        continue
      }

      matchedProfitSkuRows += 1
      matchedRevenue += revenue
      matchedProfit += profit

      if (!tiers.has(match.tier)) tiers.set(match.tier, { rows: 0, revenue: 0, profit: 0, supabaseSkus: new Set() })
      const tier = tiers.get(match.tier)
      tier.rows += 1
      tier.revenue += revenue
      tier.profit += profit

      for (const sku of match.skus) {
        tier.supabaseSkus.add(sku)
        matchedSupabaseSkus.add(sku)
      }

      if (!match.source.startsWith('direct') && match.source !== 'channel_prefix_strip') {
        topEvidenceMatches.push({ row, revenue, profit, match })
      }
    }

    const output = {
      upload,
      evidenceTableSizes: evidence.sizes,
      profitSkuCount: profitRows.length,
      matchedProfitSkuRows,
      matchedProfitSkuPct: pct(matchedProfitSkuRows, profitRows.length),
      matchedSupabaseSkus: matchedSupabaseSkus.size,
      matchedSupabaseSkuPct: pct(matchedSupabaseSkus.size, indexes.bySku.size),
      totalRevenue: money(totalRevenue),
      matchedRevenue: money(matchedRevenue),
      matchedRevenuePct: pct(matchedRevenue, totalRevenue),
      totalAccrualProfit: money(totalProfit),
      matchedAccrualProfit: money(matchedProfit),
      matchedAccrualProfitPct: pct(matchedProfit, totalProfit),
      tiers: [...tiers.entries()]
        .map(([tierName, tier]) => ({
          tier: tierName,
          profitSkuRows: tier.rows,
          revenue: money(tier.revenue),
          accrualProfit: money(tier.profit),
          supabaseSkus: tier.supabaseSkus.size,
        }))
        .sort((a, b) => b.profitSkuRows - a.profitSkuRows),
      topEvidenceTableMatches: topEvidenceMatches
        .sort((a, b) => Math.abs(b.profit) - Math.abs(a.profit))
        .slice(0, 20)
        .map(({ row, revenue, profit, match }) => ({
          profitSku: row.profit_sku,
          source: match.source,
          target: match.target,
          matchedSkus: [...match.skus].slice(0, 5),
          revenue: money(revenue),
          accrualProfit: money(profit),
        })),
      topUnmatchedProfit: unmatched
        .sort((a, b) => Math.abs(b.profit) - Math.abs(a.profit))
        .slice(0, 20)
        .map(({ row, revenue, profit }) => ({
          profitSku: row.profit_sku,
          strippedSku: stripKnownPrefix(row.profit_sku),
          revenue: money(revenue),
          accrualProfit: money(profit),
          rowCount: Number(row.row_count || 0),
        })),
    }

    console.log(JSON.stringify(output, null, 2))
  } finally {
    await conn.end()
  }
}

main().catch((error) => {
  console.error(error.message)
  process.exit(1)
})
