import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  renameSync,
} from 'node:fs'
import { resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { fetchDayCosts } from './lib/inventory-cogs.mjs'
import { sellerCloudReader } from './lib/sellercloud-reader.mjs'
const args = Object.fromEntries(
  process.argv.slice(2).map((value) => value.replace(/^--/, '').split('=')),
)
const appRoot = resolve(import.meta.dirname, '..')
const env = { ...process.env }
for (const file of [
  resolve(args.envDir || appRoot, '.env'),
  resolve(args.envDir || appRoot, '.env.vercel.local'),
  args.scEnv || 'D:/Sanders/purchasing-automation/.env',
]) {
  if (!existsSync(file)) continue
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([^#=]+)\s*=\s*(.*?)\s*$/)
    if (match) {
      const value = match[2].replace(/^["']|["']$/g, '')
      if (value) env[match[1].trim()] = value
    }
  }
}
const from = args.from || `${new Date().getUTCFullYear()}-01-01`
const to = args.to || new Date(Date.now() - 86400000).toISOString().slice(0, 10)
if (
  ![from, to].every(
    (d) =>
      /^\d{4}-\d{2}-\d{2}$/.test(d) &&
      new Date(d).toISOString().slice(0, 10) === d,
  ) ||
  from > to
)
  throw new Error('Invalid date range')
const cacheDir = resolve(
  args.cache || resolve(appRoot, '.inventory-cogs-cache'),
)
mkdirSync(cacheDir, { recursive: true })
const sc = sellerCloudReader(env)
const db =
  args.apply === 'true'
    ? createClient(
        env.VITE_SUPABASE_URL,
        env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY,
        { auth: { persistSession: false } },
      )
    : null
for (
  let date = from;
  date <= to;
  date = new Date(Date.parse(date) + 86400000).toISOString().slice(0, 10)
) {
  const file = resolve(cacheDir, `${date}.json`)
  let row
  if (existsSync(file) && args.refresh !== 'true')
    row = JSON.parse(readFileSync(file, 'utf8'))
  else {
    row = await fetchDayCosts(
      (path) => sc(path),
      (path, body) => sc(path, body),
      date,
      50,
      (event) => console.log(JSON.stringify(event)),
    )
    writeFileSync(`${file}.tmp`, JSON.stringify(row))
    renameSync(`${file}.tmp`, file)
  }
  if (row.sale_date !== date || row.source !== 'sellercloud_profit_loss_usd' || !Number.isFinite(row.cogs_amount) || !Number.isInteger(row.order_count) || !Number.isInteger(row.missing_cost_count) || row.missing_cost_count < 0 || row.missing_cost_count > row.order_count) throw new Error(`Invalid cached daily COGS for ${date}`)
  if (db) {
    const { error } = await db
      .from('inventory_cogs_daily')
      .upsert(row, { onConflict: 'sale_date' })
    if (error) throw error
  }
  console.log(JSON.stringify({ ...row, applied: Boolean(db) }))
}
