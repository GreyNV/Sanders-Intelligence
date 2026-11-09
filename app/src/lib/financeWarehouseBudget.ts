import * as XLSX from 'xlsx'

export interface WarehouseVariance {
  month: string
  section: string
  account: string
  budget: number | null
  actual: number | null
  /** Negative means actual expenditure exceeded budget. */
  variance: number | null
}

const MONTHS: Record<string, string> = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
}

function monthHeading(value: unknown): string | null {
  const match = /^([a-z]{3})\s+(\d{2})$/i.exec(String(value ?? '').trim())
  return match && MONTHS[match[1].toLowerCase()] ? `20${match[2]}-${MONTHS[match[1].toLowerCase()]}-01` : null
}

function numeric(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const result = typeof value === 'number' ? value : Number(String(value).replace(/[$,\s]/g, ''))
  return Number.isFinite(result) ? result : null
}

/**
 * The sample workbook stores a heading such as "Jan 27" in its variance table
 * as an Excel date for Jan 27, 2026, not January 2027. Match its month and day
 * back to the authoritative Budget Source headings instead of trusting the year.
 */
function varianceMonth(value: unknown, availableMonths: string[]): string | null {
  const direct = monthHeading(value)
  if (direct) return availableMonths.includes(direct) ? direct : null
  let date: Date | null = value instanceof Date ? value : null
  if (!date && typeof value === 'number') {
    const parsed = XLSX.SSF.parse_date_code(value)
    if (parsed) date = new Date(Date.UTC(parsed.y, parsed.m - 1, parsed.d))
  }
  if (!date || Number.isNaN(date.getTime())) return null
  const m = String(date.getUTCMonth() + 1).padStart(2, '0')
  const literal = `${date.getUTCFullYear()}-${m}-01`
  const encoded = `20${String(date.getUTCDate()).padStart(2, '0')}-${m}-01`
  if (availableMonths.includes(encoded)) return encoded
  return availableMonths.includes(literal) ? literal : null
}

export function parseWarehouseBudgetSheets(sheets: Record<string, unknown[][]>): WarehouseVariance[] {
  const source = sheets['Budget Source']
  const table = sheets['Variance Table']
  if (!source || !table) throw new Error('Warehouse workbook must contain Budget Source and Variance Table sheets.')
  const headings = source.find(row => String(row[0] ?? '').trim() === 'Account' && row.some(monthHeading))
  const availableMonths = headings?.map(monthHeading).filter((m): m is string => Boolean(m)) ?? []
  if (!availableMonths.length) throw new Error('Warehouse workbook has no recognized budget months.')
  const header = table.findIndex(row => String(row[0] ?? '').trim() === 'Section' && String(row[1] ?? '').trim() === 'Account')
  if (header < 0) throw new Error('Warehouse variance table is missing its headers.')
  const rows = table.slice(header + 1).flatMap(row => {
    const section = String(row[0] ?? '').trim()
    const account = String(row[1] ?? '').trim()
    const status = String(row[2] ?? '').toLowerCase()
    const month = varianceMonth(row[3], availableMonths)
    if (!section || !account || !month) return []
    const budget = /missing.*budget/.test(status) ? null : numeric(row[4])
    const actual = /missing.*actual/.test(status) ? null : numeric(row[5])
    return [{ month, section, account, budget, actual, variance: budget !== null && actual !== null ? budget - actual : null }]
  })
  if (!rows.length) throw new Error('Warehouse workbook contains no usable variance rows.')
  return rows
}

export async function parseWarehouseBudgetFile(file: File): Promise<WarehouseVariance[]> {
  // Read Excel serial dates directly: converting to Date can shift the encoded
  // day (which represents the budget year) across time zones.
  const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: false })
  const sheets = Object.fromEntries(workbook.SheetNames.map(name => [name,
    XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1, raw: true, defval: null }) as unknown[][],
  ]))
  return parseWarehouseBudgetSheets(sheets)
}

/** Column L is already the projected ending-cash difference from the floor. */
export function cashFloorStatus(endingCash: number | null, endingCashVsFloor: number | null): 'green' | 'yellow' | 'red' | 'pending' {
  if (endingCash === null || !Number.isFinite(endingCash)) return 'pending'
  if (endingCash < 0) return 'red'
  if (endingCashVsFloor === null || !Number.isFinite(endingCashVsFloor)) return 'pending'
  return endingCashVsFloor >= 0 ? 'green' : 'yellow'
}
