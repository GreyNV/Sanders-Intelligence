import * as XLSX from 'xlsx'
import { parseLeadershipWorkbookSheets, type ParsedLeadershipTool } from './leadershipToolParser'

type Matrix = unknown[][]
export interface FinanceChannelMonth { month: string; channel: string; income: number | null; grossMargin: number | null; operatingMargin: number | null }
export interface FinanceClassBudget { month: string; channel: string; budget: number | null; actual: number | null; variance: number | null }
export interface FinanceCashWeek { week: number; date: string | null; endingCash: number | null; vsFloor: number | null }
export interface FinancePayrollMonth { month: string; payroll: number | null }
export interface FinanceLeadershipDetails { channels: FinanceChannelMonth[]; classBudgets: FinanceClassBudget[]; cashWeeks: FinanceCashWeek[]; payrollTotals: FinancePayrollMonth[] }
/** Budget class name (normalized) -> actual class name, explicitly confirmed by Ryan. */
export type FinanceClassMappings = Record<string, string>

const text = (v: unknown) => String(v ?? '').trim()
const normalize = (v: unknown) => text(v).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
export const normalizeFinanceClassName = (value: string) => normalize(value)
const number = (v: unknown): number | null => {
  if (v === null || v === undefined || text(v) === '') return null
  const n = typeof v === 'number' ? v : Number(text(v).replace(/[$,\s]/g, ''))
  return Number.isFinite(n) ? n : null
}
const month = (v: unknown): string | null => {
  if (typeof v === 'number') {
    const d = XLSX.SSF.parse_date_code(v)
    return d ? `${d.y}-${String(d.m).padStart(2, '0')}-01` : null
  }
  if (v instanceof Date && !Number.isNaN(v.getTime())) return `${v.getUTCFullYear()}-${String(v.getUTCMonth() + 1).padStart(2, '0')}-01`
  const match = /^(\d{4})-(\d{2})/.exec(text(v))
  return match ? `${match[1]}-${match[2]}-01` : null
}
const index = (header: unknown[], label: string) => header.findIndex(v => normalize(v) === normalize(label))

export function parseFinanceLeadershipDetails(sheets: Record<string, Matrix>): FinanceLeadershipDetails {
  const view = sheets['Monthly view by Class']
  const pnl = sheets.dataPnL
  const budget = sheets.BgtData
  if (!view || !pnl || !budget) throw new Error('Leadership Tool requires Monthly view by Class, dataPnL and BgtData sheets.')
  const hi = view.findIndex(row => normalize(row[0]) === 'parent class')
  if (hi < 1) throw new Error('Monthly view by Class is missing its column headers.')
  const channels: FinanceChannelMonth[] = []
  const heads = view[hi]
  const months = view[hi - 1]
  const groups = heads.flatMap((v, i) => normalize(v) === 'total income' && month(months[i]) ? [{ start: i, month: month(months[i])! }] : [])
  for (const row of view.slice(hi + 1)) {
    const channel = text(row[0])
    if (!channel || /^grand total$/i.test(channel)) continue
    for (const group of groups) {
      const offset = heads.slice(group.start, group.start + 7).findIndex(v => normalize(v) === 'operating margin current year')
      const grossOffset = heads.slice(group.start, group.start + 7).findIndex(v => normalize(v) === 'profit margin current year')
      channels.push({ month: group.month, channel, income: number(row[group.start]), grossMargin: grossOffset < 0 ? null : number(row[group.start + grossOffset]), operatingMargin: offset < 0 ? null : number(row[group.start + offset]) })
    }
  }

  const bh = budget[0] ?? [], ph = pnl[0] ?? []
  const bi = { month: index(bh, 'Month'), channel: index(bh, 'Landing Class'), fallback: index(bh, 'Class'), section: index(bh, 'Section'), amount: index(bh, 'Budget Amount') }
  const pi = { month: index(ph, 'Period'), channel: index(ph, 'Parent Class'), section: index(ph, 'Section'), amount: index(ph, 'AmountCY'), total: index(ph, 'IsTotalRow') }
  if ([bi.month, bi.fallback, bi.section, bi.amount, pi.month, pi.channel, pi.section, pi.amount, pi.total].some(v => v < 0)) {
    throw new Error('Leadership Tool is missing columns required for class budget comparison.')
  }
  const values = new Map<string, { month: string; channel: string; budget: number | null; actual: number | null }>()
  function add(m: string, channel: string, field: 'actual' | 'budget', amount: number) {
    const k = `${m}|${normalize(channel)}`
    const existing = values.get(k) ?? { month: m, channel, budget: null, actual: null }
    existing[field] = (existing[field] ?? 0) + amount
    values.set(k, existing)
  }
  for (const row of budget.slice(1)) {
    const m = month(row[bi.month]), c = text(row[bi.channel]) || text(row[bi.fallback]), n = number(row[bi.amount])
    if (m && c && n !== null && normalize(row[bi.section]) === 'expense') add(m, c, 'budget', n)
  }
  for (const row of pnl.slice(1)) {
    const m = month(row[pi.month]), c = text(row[pi.channel]), n = number(row[pi.amount])
    const total = row[pi.total] === true || normalize(row[pi.total]) === 'true' || row[pi.total] === 1
    if (m && c && n !== null && !total && normalize(row[pi.section]) === 'expense') add(m, c, 'actual', n)
  }
  const classBudgets = [...values.values()].map(v => {
    // Workbook expenses are signed as negative amounts; convert to positive spend.
    const budgetValue = v.budget === null ? null : -v.budget
    const actualValue = v.actual === null ? null : -v.actual
    return { month: v.month, channel: v.channel, budget: budgetValue, actual: actualValue, variance: budgetValue !== null && actualValue !== null ? budgetValue - actualValue : null }
  })
  const cash = sheets.Summary_13wks ?? []
  const cashHeader = cash.findIndex(row => normalize(row[0]) === 'week')
  const cashWeeks: FinanceCashWeek[] = cashHeader < 0 ? [] : cash.slice(cashHeader + 1).flatMap(row => {
    const week = number(row[0])
    if (week === null || !Number.isInteger(week) || week < 1 || week > 13) return []
    const code = typeof row[1] === 'number' ? XLSX.SSF.parse_date_code(row[1]) : null
    const date = code ? `${code.y}-${String(code.m).padStart(2, '0')}-${String(code.d).padStart(2, '0')}` : row[1] instanceof Date ? row[1].toISOString().slice(0, 10) : null
    return [{ week, date, endingCash: number(row[10]), vsFloor: number(row[11]) }]
  })
  // Keep the current-year value nullable: a missing current value alongside a
  // prior-year value must not become zero payroll in a forecast.
  const payroll = sheets.Payroll ?? []
  const payrollHeader = payroll.findIndex(row => normalize(row[0]) === 'department')
  const payrollTotal = payrollHeader < 0 ? undefined : payroll.slice(payrollHeader + 1).find(row => normalize(row[0]) === 'grand total')
  const payrollTotals: FinancePayrollMonth[] = []
  if (payrollHeader > 0 && payrollTotal) {
    const payrollMonths = payroll[payrollHeader - 1]
    for (let i = 1; i < payrollTotal.length; i += 3) {
      const m = month(payrollMonths[i]) ?? month(payrollMonths[i - 1])
      if (m) payrollTotals.push({ month: m, payroll: number(payrollTotal[i]) })
    }
  }
  return { channels, classBudgets, cashWeeks, payrollTotals }
}

/** Apply only explicit budget-to-actual mappings, rejecting ambiguous merges. */
export function applyFinanceClassMappings(rows: FinanceClassBudget[], mappings: FinanceClassMappings): FinanceClassBudget[] {
  const entries=Object.entries(mappings).filter(([,target])=>target.trim())
  if (!entries.length) return rows
  const actualNames=new Set(rows.filter(r=>r.actual!==null).map(r=>normalize(r.channel)))
  const budgetNames=new Set(rows.filter(r=>r.budget!==null).map(r=>normalize(r.channel)))
  const targets=new Set<string>()
  const redirects=new Map<string,string>()
  for (const [source,target] of entries) {
    const budgetKey=normalize(source),actualKey=normalize(target)
    if (!budgetNames.has(budgetKey) || !actualNames.has(actualKey)) throw new Error(`A saved class match (${source} → ${target}) is not present in the uploaded workbook. Review class matches.`)
    if (targets.has(actualKey)) throw new Error(`More than one budget class maps to ${target}. Review class matches.`)
    targets.add(actualKey);redirects.set(budgetKey,target.trim())
  }
  const result=new Map<string,FinanceClassBudget>(), budgetSources=new Map<string,string>()
  const get=(month:string,channel:string)=>{
    const key=`${month}|${normalize(channel)}`
    const row=result.get(key) ?? {month,channel,budget:null,actual:null,variance:null}
    result.set(key,row)
    return {key,row}
  }
  for (const row of rows) {
    if (row.actual!==null) get(row.month,row.channel).row.actual=row.actual
    if (row.budget!==null) {
      const original=normalize(row.channel),target=redirects.get(original)??row.channel,{key,row:out}=get(row.month,target)
      const existing=budgetSources.get(key)
      if (existing && existing!==original) throw new Error(`Multiple budget classes would be combined for ${target} in ${row.month}. Review class matches.`)
      budgetSources.set(key,original);out.budget=row.budget
    }
  }
  return [...result.values()].map(row=>({...row,variance:row.budget!==null&&row.actual!==null?row.budget-row.actual:null}))
}

/**
 * The shared Leadership parser uses zero for a blank current-year cell when
 * a prior-year value exists. For Finance forecasts, omit those periods so a
 * missing income, cost, or NOI actual cannot be mistaken for a real zero.
 */
export function parseFinanceLeadershipWorkbookSheets(sheets: Record<string, Matrix>): { parsed: ParsedLeadershipTool; details: FinanceLeadershipDetails } {
  const parsed = parseLeadershipWorkbookSheets(sheets)
  const sheet = sheets.PnL ?? []
  const header = sheet.findIndex(row => normalize(row[0]) === 'account' || normalize(row[6]) === 'account')
  if (header > 0) {
    const offset = normalize(sheet[header][0]) === 'account' ? 0 : 6
    const months = sheet[header-1], missing = new Map<string, Set<string>>()
    const tracked = new Set(['income','cogs','expense','grand total','noi'])
    for (const row of sheet.slice(header+1)) {
      const account = normalize(row[offset])
      if (!tracked.has(account)) continue
      for (let i=offset+1; i<row.length; i+=3) {
        const period = month(months[i]) ?? month(months[i-1])
        if (period && number(row[i]) === null) {
          const periods = missing.get(account) ?? new Set<string>()
          periods.add(period)
          missing.set(account,periods)
        }
      }
    }
    parsed.pnl = { ...parsed.pnl, accounts: parsed.pnl.accounts.map(account => ({
      ...account, periods:account.periods.filter(period => !missing.get(normalize(account.account))?.has(period.month)),
    })) }
  }
  return { parsed, details: parseFinanceLeadershipDetails(sheets) }
}

export async function readFinanceLeadershipWorkbook(file: File): Promise<{ parsed: ParsedLeadershipTool; details: FinanceLeadershipDetails }> {
  const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: false })
  const sheets = Object.fromEntries(['Monthly view by Class', 'dataPnL', 'BgtData', 'Summary_13wks', 'Payroll', 'PnL'].filter(name => workbook.Sheets[name]).map(name => [name,
    XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1, raw: true, defval: null }) as Matrix,
  ]))
  return parseFinanceLeadershipWorkbookSheets(sheets)
}
