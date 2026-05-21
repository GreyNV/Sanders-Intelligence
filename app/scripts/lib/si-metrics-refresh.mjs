import fs from 'node:fs'
import path from 'node:path'
import mysql from 'mysql2/promise'
import { createClient } from '@supabase/supabase-js'

const PAGE_SIZE = 1000
const UPSERT_SIZE = 500

export function loadLocalEnv(cwd = process.cwd()) {
  for (const name of ['.env', '.env.vercel.local', '.env.vercel.dev.local']) {
    const filePath = path.join(cwd, name)
    if (!fs.existsSync(filePath)) continue

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

function addMapSet(map, key, value) {
  if (!key || !value) return
  if (!map.has(key)) map.set(key, new Set())
  map.get(key).add(value)
}

function toNumber(value) {
  return Number(value || 0)
}

function isoDate(value) {
  return new Date(value).toISOString().slice(0, 10)
}

function addDays(dateString, days) {
  const date = new Date(`${dateString}T00:00:00.000Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

function makeSupabaseClient() {
  const supabaseUrl = env('VITE_SUPABASE_URL', 'SUPABASE_URL')
  const supabaseKey = env('SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SERVICE_KEY')
  if (!supabaseUrl || !supabaseKey) throw new Error('Missing Supabase URL or service role key')

  return createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } })
}

async function makeMysqlConnection() {
  const host = env('SI_MYSQL_HOST', 'MYSQL_HOST')
  const user = env('SI_MYSQL_USER', 'MYSQL_USER')
  const database = env('SI_MYSQL_DATABASE', 'MYSQL_DATABASE')
  if (!host || !user || !database) throw new Error('Missing MySQL connection variables')

  return mysql.createConnection({
    host,
    port: Number(env('SI_MYSQL_PORT', 'MYSQL_PORT') || 3306),
    user,
    password: env('SI_MYSQL_PASSWORD', 'MYSQL_PASSWORD'),
    database,
    ssl: env('SI_MYSQL_SSL', 'MYSQL_SSL') === 'true' ? { rejectUnauthorized: false } : undefined,
  })
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
      .select('product_code')
      .eq('upload_id', upload.id)
      .range(from, from + PAGE_SIZE - 1)

    if (error) throw error
    rows.push(...(data || []))
    if (!data || data.length < PAGE_SIZE) break
  }

  return { upload, rows }
}

function buildPlanningSkuIndexes(rows) {
  const normToSku = new Map()
  const compactToSku = new Map()

  for (const row of rows) {
    const sku = String(row.product_code || '').trim()
    if (!sku) continue
    addMapSet(normToSku, norm(sku), sku)
    addMapSet(compactToSku, compact(sku), sku)
  }

  return { normToSku, compactToSku, count: normToSku.size }
}

function matchPlanningSkuByKey(key, indexes) {
  if (indexes.normToSku.has(key)) {
    return { planningSku: [...indexes.normToSku.get(key)][0], method: 'direct', confidence: 1 }
  }

  const compactKey = compact(key)
  if (indexes.compactToSku.has(compactKey) && indexes.compactToSku.get(compactKey).size === 1) {
    return { planningSku: [...indexes.compactToSku.get(compactKey)][0], method: 'compact_canonical', confidence: 0.82 }
  }

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
    seller_cloud_shadow_of_sku: new Map(),
    seller_cloud_sku_box_qty_and_item_label: new Map(),
  }

  for (const row of shadow) addMapSet(maps.seller_cloud_shadow_of_sku, norm(row.sku), norm(row.shadow_of))
  for (const row of standard) addMapSet(maps.standard_sku, norm(row.sku), norm(row.standard_sku))
  for (const row of box) addMapSet(maps.seller_cloud_sku_box_qty_and_item_label, norm(row.sku), norm(row.parent_sku))

  return {
    maps,
    sizes: {
      standard_sku: standard.length,
      seller_cloud_shadow_of_sku: shadow.length,
      seller_cloud_sku_box_qty_and_item_label: box.length,
    },
  }
}

function resolvePlanningSku(sourceSku, indexes, evidenceMaps) {
  const direct = norm(sourceSku)
  const stripped = stripKnownPrefix(direct)

  let match = matchPlanningSkuByKey(direct, indexes)
  if (match) return match

  if (stripped !== direct) {
    match = matchPlanningSkuByKey(stripped, indexes)
    if (match) return { ...match, method: match.method === 'direct' ? 'channel_prefix_strip' : match.method, confidence: Math.min(match.confidence, 0.94) }
  }

  for (const method of ['seller_cloud_shadow_of_sku', 'standard_sku', 'seller_cloud_sku_box_qty_and_item_label']) {
    for (const key of new Set([direct, stripped])) {
      const targets = evidenceMaps[method].get(key)
      if (!targets) continue

      for (const target of targets) {
        match = matchPlanningSkuByKey(target, indexes)
        if (match) return { ...match, method, confidence: method === 'seller_cloud_shadow_of_sku' ? 0.98 : 0.92 }
      }
    }
  }

  return null
}

async function fetchProfitRows(conn, metricDate) {
  const start30 = addDays(metricDate, -29)

  const [rows] = await conn.execute(`
    select
      lower(trim(coalesce(nullif(original_shadow_sku, ''), sku))) as source_sku,
      sum(case when date(ship_date) = ? then qty_sold else 0 end) as units_today,
      sum(case when date(ship_date) = ? then sub_total else 0 end) as revenue_today,
      sum(case when date(ship_date) = ? then accrual_profit else 0 end) as accrual_profit_today,
      sum(case when date(ship_date) = ? then cash_profit else 0 end) as cash_profit_today,
      sum(case when date(ship_date) >= date_sub(?, interval 6 day) then qty_sold else 0 end) as units_7d,
      sum(case when date(ship_date) >= date_sub(?, interval 6 day) then sub_total else 0 end) as revenue_7d,
      sum(case when date(ship_date) >= date_sub(?, interval 6 day) then accrual_profit else 0 end) as accrual_profit_7d,
      sum(case when date(ship_date) >= date_sub(?, interval 6 day) then cash_profit else 0 end) as cash_profit_7d,
      sum(qty_sold) as units_30d,
      sum(sub_total) as revenue_30d,
      sum(accrual_profit) as accrual_profit_30d,
      sum(cash_profit) as cash_profit_30d
    from seller_cloud_product_profit_and_loss
    where date(ship_date) between ? and ?
      and coalesce(nullif(original_shadow_sku, ''), sku) is not null
      and trim(coalesce(nullif(original_shadow_sku, ''), sku)) <> ''
    group by source_sku
  `, [
    metricDate,
    metricDate,
    metricDate,
    metricDate,
    metricDate,
    metricDate,
    metricDate,
    metricDate,
    start30,
    metricDate,
  ])

  return rows
}

async function fetchPriceRows(conn) {
  const [sellerCloud] = await conn.execute(`
    select
      lower(trim(sku)) as source_sku,
      max(date) as price_date,
      avg(nullif(coalesce(nullif(site_price, 0), nullif(amazon_price, 0), nullif(store_price, 0), nullif(wholesale_price, 0)), 0)) as price
    from seller_cloud_warehouse_inventory
    where date = (select max(date) from seller_cloud_warehouse_inventory where date <= current_date())
      and sku is not null
      and trim(sku) <> ''
      and coalesce(nullif(site_price, 0), nullif(amazon_price, 0), nullif(store_price, 0), nullif(wholesale_price, 0)) is not null
    group by source_sku
  `)

  const [fba] = await conn.execute(`
    select
      lower(trim(sku)) as source_sku,
      date(max(sync_date_time)) as price_date,
      avg(nullif(coalesce(nullif(price, 0), nullif(buy_box_price, 0), nullif(business_price, 0), nullif(sale_price, 0)), 0)) as price
    from fba_inventory_price_details
    where date(sync_date_time) = (select max(date(sync_date_time)) from fba_inventory_price_details where date(sync_date_time) <= current_date())
      and sku is not null
      and trim(sku) <> ''
      and coalesce(nullif(price, 0), nullif(buy_box_price, 0), nullif(business_price, 0), nullif(sale_price, 0)) is not null
    group by source_sku
  `)

  const [walmart] = await conn.execute(`
    select
      lower(trim(sku)) as source_sku,
      max(sync_date) as price_date,
      avg(nullif(coalesce(nullif(price, 0), nullif(buy_box_item_price, 0), nullif(msrp, 0)), 0)) as price
    from walmart_item_catalog
    where sync_date = (select max(sync_date) from walmart_item_catalog where sync_date <= current_date())
      and sku is not null
      and trim(sku) <> ''
      and coalesce(nullif(price, 0), nullif(buy_box_item_price, 0), nullif(msrp, 0)) is not null
    group by source_sku
  `)

  const [wayfair] = await conn.execute(`
    select
      lower(trim(sku)) as source_sku,
      current_date() as price_date,
      avg(nullif(retail_price, 0)) as price
    from wayfair_item
    where sku is not null
      and trim(sku) <> ''
      and retail_price is not null
      and retail_price > 0
    group by source_sku
  `)

  return [
    ...sellerCloud.map(row => ({ ...row, source: 'seller_cloud_warehouse_inventory' })),
    ...fba.map(row => ({ ...row, source: 'fba_inventory_price_details' })),
    ...walmart.map(row => ({ ...row, source: 'walmart_item_catalog' })),
    ...wayfair.map(row => ({ ...row, source: 'wayfair_item' })),
  ].filter(row => Number(row.price || 0) > 0)
}

async function upsertInChunks(supabase, table, rows) {
  for (let i = 0; i < rows.length; i += UPSERT_SIZE) {
    const chunk = rows.slice(i, i + UPSERT_SIZE)
    const { error } = await supabase.from(table).upsert(chunk)
    if (error) throw error
  }
}

function aggregateProfitMetrics(rows, indexes, evidenceMaps, metricDate) {
  const byPlanningSku = new Map()
  let matchedRows = 0

  for (const row of rows) {
    const match = resolvePlanningSku(row.source_sku, indexes, evidenceMaps)
    if (!match) continue
    matchedRows += 1

    if (!byPlanningSku.has(match.planningSku)) {
      byPlanningSku.set(match.planningSku, {
        planning_sku: match.planningSku,
        metric_date: metricDate,
        units_today: 0,
        revenue_today: 0,
        accrual_profit_today: 0,
        cash_profit_today: 0,
        units_7d: 0,
        revenue_7d: 0,
        accrual_profit_7d: 0,
        cash_profit_7d: 0,
        units_30d: 0,
        revenue_30d: 0,
        accrual_profit_30d: 0,
        cash_profit_30d: 0,
        matched_source_skus: 0,
        match_methods: new Set(),
        sourceSkus: new Set(),
      })
    }

    const metric = byPlanningSku.get(match.planningSku)
    metric.units_today += toNumber(row.units_today)
    metric.revenue_today += toNumber(row.revenue_today)
    metric.accrual_profit_today += toNumber(row.accrual_profit_today)
    metric.cash_profit_today += toNumber(row.cash_profit_today)
    metric.units_7d += toNumber(row.units_7d)
    metric.revenue_7d += toNumber(row.revenue_7d)
    metric.accrual_profit_7d += toNumber(row.accrual_profit_7d)
    metric.cash_profit_7d += toNumber(row.cash_profit_7d)
    metric.units_30d += toNumber(row.units_30d)
    metric.revenue_30d += toNumber(row.revenue_30d)
    metric.accrual_profit_30d += toNumber(row.accrual_profit_30d)
    metric.cash_profit_30d += toNumber(row.cash_profit_30d)
    metric.sourceSkus.add(row.source_sku)
    metric.match_methods.add(match.method)
  }

  return {
    rows: [...byPlanningSku.values()].map(({ sourceSkus, match_methods, ...metric }) => ({
      ...metric,
      matched_source_skus: sourceSkus.size,
      match_methods: [...match_methods].sort(),
      refreshed_at: new Date().toISOString(),
    })),
    matchedRows,
  }
}

function aggregatePriceMetrics(rows, indexes, evidenceMaps) {
  const byPlanningSku = new Map()
  let matchedRows = 0

  for (const row of rows) {
    const match = resolvePlanningSku(row.source_sku, indexes, evidenceMaps)
    if (!match) continue

    const price = Number(row.price || 0)
    if (!Number.isFinite(price) || price <= 0) continue
    matchedRows += 1

    if (!byPlanningSku.has(match.planningSku)) {
      byPlanningSku.set(match.planningSku, {
        planning_sku: match.planningSku,
        prices: [],
        sources: new Set(),
        dates: [],
      })
    }

    const metric = byPlanningSku.get(match.planningSku)
    metric.prices.push(price)
    metric.sources.add(row.source)
    metric.dates.push(isoDate(row.price_date))
  }

  return {
    rows: [...byPlanningSku.values()].map(metric => {
      const prices = metric.prices.sort((a, b) => a - b)
      const avg = prices.reduce((sum, value) => sum + value, 0) / prices.length

      return {
        planning_sku: metric.planning_sku,
        price_date: metric.dates.sort().at(-1),
        selling_price: avg,
        price_min: prices[0],
        price_max: prices.at(-1),
        price_avg: avg,
        price_source: [...metric.sources].sort().join(', '),
        price_source_count: metric.sources.size,
        refreshed_at: new Date().toISOString(),
      }
    }),
    matchedRows,
  }
}

export async function refreshSiMetrics({ dryRun = false } = {}) {
  const supabase = makeSupabaseClient()
  const conn = await makeMysqlConnection()

  try {
    const { upload, rows: inventoryRows } = await fetchLatestInventoryRows(supabase)
    const indexes = buildPlanningSkuIndexes(inventoryRows)
    const evidence = await loadEvidence(conn)

    const [[maxDateRow]] = await conn.execute(`
      select max(date(ship_date)) as metric_date
      from seller_cloud_product_profit_and_loss
      where date(ship_date) <= current_date()
    `)
    const metricDate = isoDate(maxDateRow.metric_date)

    const profitSourceRows = await fetchProfitRows(conn, metricDate)
    const priceSourceRows = await fetchPriceRows(conn)

    const profit = aggregateProfitMetrics(profitSourceRows, indexes, evidence.maps, metricDate)
    const price = aggregatePriceMetrics(priceSourceRows, indexes, evidence.maps)

    if (!dryRun) {
      await upsertInChunks(supabase, 'sku_profit_metrics', profit.rows)
      await upsertInChunks(supabase, 'sku_price_metrics', price.rows)
    }

    return {
      dryRun,
      latestUpload: upload,
      metricDate,
      planningSkuCount: indexes.count,
      evidenceTableSizes: evidence.sizes,
      profit: {
        sourceRows: profitSourceRows.length,
        matchedSourceRows: profit.matchedRows,
        materializedRows: profit.rows.length,
      },
      price: {
        sourceRows: priceSourceRows.length,
        matchedSourceRows: price.matchedRows,
        materializedRows: price.rows.length,
      },
    }
  } finally {
    await conn.end()
  }
}
