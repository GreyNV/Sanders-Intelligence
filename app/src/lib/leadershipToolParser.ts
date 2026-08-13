import * as XLSX from 'xlsx'
import type { LeadershipToolSnapshot } from '@/types'

type SheetMatrix = unknown[][]

export interface ParsedLeadershipTool {
  cashflow: LeadershipToolSnapshot['cashflow']
  payroll: LeadershipToolSnapshot['payroll']
  pnl: LeadershipToolSnapshot['pnl']
  budget: LeadershipToolSnapshot['budget']
  sales_simulation: LeadershipToolSnapshot['sales_simulation']
  source_meta: Record<string, unknown>
}

export async function parseLeadershipToolFile(file: File): Promise<ParsedLeadershipTool> {
  const buffer = await file.arrayBuffer()
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: false })
  const sheets = Object.fromEntries(
    workbook.SheetNames.map(name => [
      name,
      XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1, raw: true, defval: null }) as SheetMatrix,
    ])
  )

  return parseLeadershipWorkbookSheets(sheets)
}

export function parseLeadershipWorkbookSheets(sheets: Record<string, SheetMatrix>): ParsedLeadershipTool {
  const cashflow = parseCashflow(requiredSheet(sheets, 'Summary_13wks'))
  const payroll = parsePayroll(requiredSheet(sheets, 'Payroll'))
  const pnl = mergePnlDetailAccounts(parsePnl(requiredSheet(sheets, 'PnL')), parseDataPnlSalesRateAccounts(sheets.dataPnL ?? []))
  const budget = parseBudget(sheets.BgtData ?? [])

  return {
    cashflow,
    payroll,
    pnl,
    budget,
    sales_simulation: buildSalesSimulation(pnl),
    source_meta: {
      parsed_at: new Date().toISOString(),
      source_sheets: Object.keys(sheets),
    },
  }
}

function requiredSheet(sheets: Record<string, SheetMatrix>, name: string): SheetMatrix {
  const sheet = sheets[name]
  if (!sheet) throw new Error(`Leadership workbook is missing required sheet: ${name}`)
  return sheet
}

function parseCashflow(sheet: SheetMatrix): LeadershipToolSnapshot['cashflow'] {
  const headerIndex = sheet.findIndex(row => labelAt(row, 0) === 'Week #')
  const weeks = headerIndex < 0
    ? []
    : sheet.slice(headerIndex + 1)
      .filter(row => toNumber(row[0]) !== null)
      .map(row => ({
        week: toNumber(row[0]) ?? 0,
        week_start_date: toIsoDate(row[1]),
        beginning_cash: toNumber(row[2]) ?? 0,
        fixed_outflows: toNumber(row[3]) ?? 0,
        tier_1_vendor_payments: toNumber(row[4]) ?? 0,
        tier_2_vendor_payments: toNumber(row[5]) ?? 0,
        tier_3_vendor_payments: toNumber(row[6]) ?? 0,
        vendor_deposits: toNumber(row[7]) ?? 0,
        total_vendor_payments: toNumber(row[8]) ?? 0,
        total_outflows: toNumber(row[9]) ?? 0,
        ending_cash: toNumber(row[10]) ?? 0,
        ending_cash_vs_floor: toNumber(row[11]) ?? 0,
      }))

  return {
    current_cash_balance: findLabeledNumber(sheet, 'Current Cash Balance'),
    minimum_cash_floor: findLabeledNumber(sheet, 'Minimum Cash Floor'),
    weeks,
  }
}

function parsePayroll(sheet: SheetMatrix): LeadershipToolSnapshot['payroll'] {
  const headerIndex = sheet.findIndex(row => labelAt(row, 0) === 'Department')
  if (headerIndex < 0) return { departments: [] }

  const monthRow = sheet[headerIndex - 1] ?? []
  const departments = sheet.slice(headerIndex + 1)
    .filter(row => labelAt(row, 0).length > 0)
    .map(row => ({
      department: labelAt(row, 0),
      periods: parseGroupedPeriods(row, monthRow, 1),
    }))

  return { departments }
}

function parsePnl(sheet: SheetMatrix): LeadershipToolSnapshot['pnl'] {
  const headerIndex = sheet.findIndex(row => labelAt(row, 0) === 'Account' || labelAt(row, 6) === 'Account')
  if (headerIndex < 0) return { accounts: [] }

  const offset = labelAt(sheet[headerIndex], 0) === 'Account' ? 0 : 6
  const monthRow = sheet[headerIndex - 1] ?? []
  const accounts = sheet.slice(headerIndex + 1)
    .filter(row => labelAt(row, offset).length > 0)
    .map(row => ({
      account: labelAt(row, offset),
      periods: parseGroupedPeriods(row, monthRow, offset + 1),
    }))

  return { accounts }
}

function parseDataPnlSalesRateAccounts(sheet: SheetMatrix): LeadershipToolSnapshot['pnl']['accounts'] {
  const header = sheet[0] ?? []
  const periodIndex = findPreferredHeaderIndex(header, ['Period', 'Month', 'Date'])
  const accountIndex = findPreferredHeaderIndex(header, ['Account'])
  const classIndex = findPreferredHeaderIndex(header, ['Class'])
  const isTotalIndex = findPreferredHeaderIndex(header, ['IsTotalRow'])
  const sectionIndex = findPreferredHeaderIndex(header, ['Section'])
  const amountCyIndex = findPreferredHeaderIndex(header, ['AmountCY', 'AmountCYRaw'])
  const amountLyIndex = findPreferredHeaderIndex(header, ['AmountLY', 'AmountLYRaw'])

  if ([periodIndex, accountIndex, classIndex, isTotalIndex, sectionIndex, amountCyIndex, amountLyIndex].some(index => index < 0)) {
    return []
  }

  const categoryPeriods = new Map<string, Map<string, { current_year: number; last_year: number }>>()

  for (const row of sheet.slice(1)) {
    if (!toBoolean(row[isTotalIndex]) || normalizeLabel(String(row[classIndex] ?? '')) !== 'total') continue
    if (normalizeLabel(String(row[sectionIndex] ?? '')) !== 'expense') continue

    const category = salesRateCategoryForAccount(String(row[accountIndex] ?? ''))
    const month = toIsoMonth(row[periodIndex])
    const currentYear = toNumber(row[amountCyIndex])
    const lastYear = toNumber(row[amountLyIndex])
    if (!category || !month || (currentYear === null && lastYear === null)) continue

    const periods = categoryPeriods.get(category) ?? new Map<string, { current_year: number; last_year: number }>()
    const existing = periods.get(month) ?? { current_year: 0, last_year: 0 }
    periods.set(month, {
      current_year: existing.current_year + (currentYear ?? 0),
      last_year: existing.last_year + (lastYear ?? 0),
    })
    categoryPeriods.set(category, periods)
  }

  return ['Advertising', 'Commission', 'Shipping']
    .map(account => ({
      account,
      periods: [...(categoryPeriods.get(account)?.entries() ?? [])]
        .map(([month, values]) => ({
          month,
          current_year: values.current_year,
          last_year: values.last_year,
          difference_pct: null,
        }))
        .filter(period => period.current_year !== 0 || period.last_year !== 0)
        .sort((left, right) => left.month.localeCompare(right.month)),
    }))
    .filter(account => account.periods.length > 0)
}

function mergePnlDetailAccounts(
  pnl: LeadershipToolSnapshot['pnl'],
  detailAccounts: LeadershipToolSnapshot['pnl']['accounts']
): LeadershipToolSnapshot['pnl'] {
  if (detailAccounts.length === 0) return pnl

  const detailNames = new Set(detailAccounts.map(account => normalizeLabel(account.account)))
  return {
    accounts: [
      ...pnl.accounts.filter(account => !detailNames.has(normalizeLabel(account.account))),
      ...detailAccounts,
    ],
  }
}

function salesRateCategoryForAccount(account: string): 'Advertising' | 'Commission' | 'Shipping' | null {
  const normalizedAccount = normalizeLabel(account)
  if (normalizedAccount.includes('advertising')) return 'Advertising'
  if (normalizedAccount.includes('commission')) return 'Commission'
  if (normalizedAccount.includes('shipping') || normalizedAccount.includes('freight')) return 'Shipping'
  return null
}

function parseBudget(sheet: SheetMatrix): LeadershipToolSnapshot['budget'] {
  const header = sheet[0] ?? []
  const monthIndex = findPreferredHeaderIndex(header, ['Period Month', 'Month', 'Date', 'Period'])
  const salesIndex = findPreferredHeaderIndex(header, ['Budgeted Sales', 'Budget Sales', 'Sales', 'Income'])
  const accountIndex = findPreferredHeaderIndex(header, ['Account'])
  const sectionIndex = findPreferredHeaderIndex(header, ['Section'])
  const budgetAmountIndex = findPreferredHeaderIndex(header, ['Budget Amount', 'Budget'])

  if (monthIndex < 0) return { sales: [] }

  if (accountIndex >= 0 && budgetAmountIndex >= 0) {
    return parseTransactionBudget(sheet.slice(1), {
      monthIndex,
      accountIndex,
      sectionIndex,
      amountIndex: budgetAmountIndex,
    })
  }

  if (salesIndex < 0) return { sales: [] }

  const sales = sheet.slice(1)
    .map(row => ({
      month: toIsoMonth(row[monthIndex]),
      budgeted_sales: toNumber(row[salesIndex]) ?? 0,
    }))
    .filter(row => row.month.length > 0 && row.budgeted_sales > 0)

  return { sales }
}

function parseTransactionBudget(
  rows: SheetMatrix,
  indexes: {
    monthIndex: number
    accountIndex: number
    sectionIndex: number
    amountIndex: number
  }
): LeadershipToolSnapshot['budget'] {
  const salesByMonth = new Map<string, number>()

  for (const row of rows) {
    const month = toIsoMonth(row[indexes.monthIndex])
    const account = normalizeLabel(String(row[indexes.accountIndex] ?? ''))
    const section = indexes.sectionIndex >= 0 ? normalizeLabel(String(row[indexes.sectionIndex] ?? '')) : ''
    const amount = toNumber(row[indexes.amountIndex])

    if (!month || account !== 'sales' || (section && section !== 'income') || amount === null) continue
    salesByMonth.set(month, (salesByMonth.get(month) ?? 0) + amount)
  }

  return {
    sales: [...salesByMonth.entries()]
      .map(([month, budgeted_sales]) => ({ month, budgeted_sales }))
      .filter(row => row.budgeted_sales > 0)
      .sort((left, right) => left.month.localeCompare(right.month)),
  }
}

function parseGroupedPeriods(row: unknown[], monthRow: unknown[], startIndex: number) {
  const periods: Array<{ month: string; current_year: number; last_year: number; difference_pct: number | null }> = []

  for (let index = startIndex; index < row.length; index += 3) {
    const currentYear = toNumber(row[index])
    const lastYear = toNumber(row[index + 1])
    if (currentYear === null && lastYear === null) continue

    periods.push({
      month: toIsoMonth(monthRow[index]) || toIsoMonth(monthRow[index - 1]),
      current_year: currentYear ?? 0,
      last_year: lastYear ?? 0,
      difference_pct: toNumber(row[index + 2]),
    })
  }

  return periods
}

function findHeaderIndex(row: unknown[], labels: string[]): number {
  const normalizedLabels = new Set(labels.map(normalizeLabel))
  return row.findIndex(value => normalizedLabels.has(normalizeLabel(String(value ?? ''))))
}

function findPreferredHeaderIndex(row: unknown[], labels: string[]): number {
  for (const label of labels) {
    const index = findHeaderIndex(row, [label])
    if (index >= 0) return index
  }
  return -1
}

function buildSalesSimulation(pnl: LeadershipToolSnapshot['pnl']): LeadershipToolSnapshot['sales_simulation'] {
  const income = pnl.accounts.find(row => row.account === 'Income')?.periods[0]?.current_year ?? 0
  const noi = pnl.accounts.find(row => row.account === 'Grand Total')?.periods[0]?.current_year ?? 0
  const latestNoiPct = income > 0 ? noi / income : null
  const benchmarkNoi = income * 0.09

  return {
    noi_benchmark_pct: 0.09,
    latest_income: income,
    latest_noi: noi,
    latest_noi_pct: latestNoiPct,
    sales_needed_for_benchmark: latestNoiPct !== null && noi >= benchmarkNoi ? 0 : benchmarkNoi - noi,
  }
}

function findLabeledNumber(sheet: SheetMatrix, label: string): number | null {
  const row = sheet.find(candidate => labelAt(candidate, 0) === label)
  return row ? toNumber(row[1]) : null
}

function labelAt(row: unknown[], index: number): string {
  return String(row[index] ?? '').trim()
}

function normalizeLabel(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ')
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value.replace(/[$,%\s,]/g, ''))
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function toBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0
  if (typeof value === 'string') return value.trim().toLowerCase() === 'true'
  return false
}

function toIsoDate(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  if (typeof value === 'number') return excelSerialToDate(value).toISOString().slice(0, 10)
  if (typeof value === 'string') return value.slice(0, 10)
  return ''
}

function toIsoMonth(value: unknown): string {
  if (value instanceof Date) return `${value.toISOString().slice(0, 7)}-01`
  if (typeof value === 'number') {
    const date = excelSerialToDate(value)
    return `${date.toISOString().slice(0, 7)}-01`
  }
  if (typeof value === 'string' && /^\d{4}-\d{2}/.test(value)) return `${value.slice(0, 7)}-01`
  return ''
}

function excelSerialToDate(serial: number): Date {
  const parsed = XLSX.SSF.parse_date_code(serial)
  if (!parsed) return new Date(Number.NaN)
  return new Date(Date.UTC(parsed.y, parsed.m - 1, parsed.d))
}
