import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { basename, dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const root = resolve(scriptDir, '..')
const repoRoot = resolve(root, '..')
const require = createRequire(import.meta.url)
const XLSX = require('xlsx')

export const DEFAULT_MAPPING_FILE = resolve(repoRoot, 'supabase/seed-data/sales-channel-mappings/Mappingd.xlsx')

const COMPANY_HEADERS = [
  'sellercloud company',
  'sellercloud company name',
  'sc company',
  'company',
  'company name',
  'companyname',
]

const CHANNEL_HEADERS = [
  'sellercloud channel',
  'sellercloud channel counterpart',
  'sc channel',
  'sc counterpart',
  'source channel',
  'channel',
]

const QB_CHANNEL_HEADERS = [
  'qb channel',
  'qb chanel',
  'qb sales channel',
  'quickbooks channel',
  'quickbooks chanel',
  'cogs class',
  'cogs',
  'actual channel',
  'actual chanel',
  'channel qb',
]

export function normalizeSalesChannelValue(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ').toLowerCase()
}

export function buildMappingRows(rows, sourceFile) {
  const headers = Array.from(new Set(rows.flatMap(row => Object.keys(row))))
  const columns = resolveMappingColumns(headers)
  const mappingsByKey = new Map()

  for (const row of rows) {
    const sellercloudCompany = cleanText(row[columns.company])
    const sellercloudChannel = cleanText(row[columns.channel])
    const qbChannel = cleanText(row[columns.qbChannel])
    if (!sellercloudCompany && !sellercloudChannel && !qbChannel) continue
    if (!sellercloudCompany || !sellercloudChannel || !qbChannel) {
      throw new Error(`Missing required mapping fields in ${sourceFile}`)
    }

    const normalizedCompany = normalizeSalesChannelValue(sellercloudCompany)
    const normalizedChannel = normalizeSalesChannelValue(sellercloudChannel)
    const key = `${normalizedCompany}|${normalizedChannel}`
    const existing = mappingsByKey.get(key)
    if (existing) {
      if (normalizeSalesChannelValue(existing.qb_channel) !== normalizeSalesChannelValue(qbChannel)) {
        throw new Error(`Conflicting QB channels for ${sellercloudCompany} / ${sellercloudChannel}`)
      }
      continue
    }

    mappingsByKey.set(key, {
      sellercloud_company: sellercloudCompany,
      sellercloud_channel: sellercloudChannel,
      normalized_company: normalizedCompany,
      normalized_channel: normalizedChannel,
      qb_channel: qbChannel,
      is_active: true,
      source_file: sourceFile,
      notes: cleanText(row.Notes ?? row.notes) || null,
    })
  }

  return Array.from(mappingsByKey.values())
}

export function readMappingFile(filePath) {
  const workbook = XLSX.readFile(filePath, { cellDates: false })
  const sheetName = workbook.SheetNames[0]
  if (!sheetName) throw new Error(`No sheets found in ${filePath}`)
  return XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '' })
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const filePath = args.file ?? args._[0] ?? DEFAULT_MAPPING_FILE

  const absolutePath = resolve(filePath)
  const mappings = buildMappingRows(readMappingFile(absolutePath), basename(absolutePath))
  console.log(`Prepared ${mappings.length} sales channel mappings from ${absolutePath}`)

  if (!args.apply) {
    console.log('Dry run only. Re-run with --apply to upsert mappings into Supabase.')
    console.log(JSON.stringify(mappings.slice(0, 5), null, 2))
    return
  }

  const env = loadEnv([
    resolve(root, '.env'),
    resolve(root, '.env.local'),
    resolve(root, '.env.vercel.local'),
    resolve(root, '.env.vercel.dev.local'),
  ])
  const url = nonEmpty(env.VITE_SUPABASE_URL)
  const key = nonEmpty(env.SUPABASE_SERVICE_ROLE_KEY) ?? nonEmpty(env.SUPABASE_SERVICE_KEY)
  if (!url || !key) throw new Error('Missing VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY/SUPABASE_SERVICE_KEY')

  const supabase = createClient(url, key)
  const { error } = await supabase
    .from('sales_channel_mappings')
    .upsert(mappings, { onConflict: 'normalized_company,normalized_channel' })
  if (error) throw error

  console.log(`Upserted ${mappings.length} sales channel mappings.`)
}

function resolveMappingColumns(headers) {
  return {
    company: requireHeader(headers, COMPANY_HEADERS, 'SellerCloud Company'),
    channel: requireHeader(headers, CHANNEL_HEADERS, 'SellerCloud Channel'),
    qbChannel: requireHeader(headers, QB_CHANNEL_HEADERS, 'QB Channel'),
  }
}

function requireHeader(headers, aliases, label) {
  const normalizedAliases = new Set(aliases.map(normalizeHeader))
  const exact = headers.find(header => normalizedAliases.has(normalizeHeader(header)))
  if (exact) return exact

  const partial = headers.find(header => {
    const normalized = normalizeHeader(header)
    return aliases.some(alias => {
      const normalizedAlias = normalizeHeader(alias)
      return normalized.includes(normalizedAlias) && normalizedAlias !== 'channel'
    })
  })
  if (partial) return partial

  throw new Error(`Missing ${label} column. Found: ${headers.join(', ')}`)
}

function normalizeHeader(value) {
  return String(value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function cleanText(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ')
}

function loadEnv(files) {
  const values = {}
  for (const file of files) {
    if (!existsSync(file)) continue
    for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
      const match = line.match(/^\s*([^#=]+)\s*=\s*(.*)\s*$/)
      if (!match) continue
      const name = match[1].trim()
      const value = match[2].trim().replace(/^"|"$/g, '')
      if (value || !(name in values)) values[name] = value
    }
  }
  return values
}

function parseArgs(values) {
  const parsed = { _: [] }
  for (const value of values) {
    if (value === '--apply') {
      parsed.apply = true
      continue
    }

    const match = value.match(/^--([^=]+)=(.*)$/)
    if (match) {
      parsed[match[1]] = match[2]
      continue
    }

    parsed._.push(value)
  }
  return parsed
}

function nonEmpty(value) {
  return value && value.trim() ? value.trim() : null
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
}
