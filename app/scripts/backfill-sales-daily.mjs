import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const statePath = resolve(root, '.sales-backfill-state.json')

const env = loadEnv([
  resolve(root, '.env'),
  resolve(root, '.env.local'),
  resolve(root, '.env.vercel.local'),
  resolve(root, '.env.vercel.dev.local'),
])

const args = parseArgs(process.argv.slice(2))
const from = requireArg(args.from, '--from')
const to = requireArg(args.to, '--to')
const maxPages = numberArg(args.maxPages, 20)
const pageSize = numberArg(args.pageSize, 50)
const dateParamPreset = args.dateParamPreset ?? 'shipDate'
const saleDatePreset = args.saleDatePreset ?? 'shipDate'
const url = nonEmpty(env.VITE_SUPABASE_URL)
const key = nonEmpty(env.SUPABASE_SERVICE_ROLE_KEY) ?? nonEmpty(env.SUPABASE_SERVICE_KEY)

if (!url || !key) {
  throw new Error('Missing VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY/SUPABASE_SERVICE_KEY')
}

const state = loadState()
const dates = eachDate(from, to)

for (const date of dates) {
  const stateKey = `${dateParamPreset}:${saleDatePreset}:${date}`
  if (state.completed?.[stateKey] && args.resume !== 'false') {
    console.log(`skip date=${date} status=completed`)
    continue
  }

  let startPage = Math.max(1, Number(state.inProgress?.[stateKey]?.nextPage ?? 1))
  let totalSynced = 0
  let totalSourceRows = 0
  let calls = 0

  while (true) {
    const result = await invokeSync({
      dateFrom: date,
      dateTo: date,
      dateParamPreset,
      saleDatePreset,
      maxPages,
      pageSize,
      startPage,
      replaceDate: startPage === 1,
    })

    calls += 1
    totalSynced += Number(result.synced ?? 0)
    totalSourceRows += Number(result.sourceRows ?? 0)
    console.log(
      `date=${date} startPage=${startPage} pages=${result.pagesFetched} source=${result.sourceRows} inWindow=${result.sourceRowsInWindow} synced=${result.synced}`,
    )

    if (Number(result.pagesFetched ?? 0) < maxPages) break

    startPage += maxPages
    state.inProgress ??= {}
    state.inProgress[stateKey] = { nextPage: startPage, updatedAt: new Date().toISOString() }
    saveState(state)
  }

  state.completed ??= {}
  state.completed[stateKey] = {
    calls,
    totalSynced,
    totalSourceRows,
    completedAt: new Date().toISOString(),
  }
  if (state.inProgress) delete state.inProgress[stateKey]
  saveState(state)
  console.log(`done date=${date} calls=${calls} source=${totalSourceRows} synced=${totalSynced}`)
}

async function invokeSync(body) {
  const response = await fetch(`${url}/functions/v1/sync-sales`, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  const text = await response.text()
  if (!response.ok) throw new Error(`sync-sales failed (${response.status}): ${text}`)
  return JSON.parse(text)
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
  const parsed = {}
  for (const value of values) {
    const match = value.match(/^--([^=]+)=(.*)$/)
    if (match) parsed[match[1]] = match[2]
  }
  return parsed
}

function requireArg(value, name) {
  if (!value) throw new Error(`Missing ${name}`)
  return value
}

function numberArg(value, fallback) {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

function nonEmpty(value) {
  return value && value.trim() ? value.trim() : null
}

function loadState() {
  if (!existsSync(statePath)) return { completed: {}, inProgress: {} }
  return JSON.parse(readFileSync(statePath, 'utf8'))
}

function saveState(state) {
  writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`)
}

function eachDate(from, to) {
  const dates = []
  const current = new Date(`${from}T00:00:00Z`)
  const end = new Date(`${to}T00:00:00Z`)
  while (current <= end) {
    dates.push(current.toISOString().slice(0, 10))
    current.setUTCDate(current.getUTCDate() + 1)
  }
  return dates
}
