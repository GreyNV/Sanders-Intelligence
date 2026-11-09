import * as XLSX from 'xlsx'

/** Historical figures supplied for seasonality, before any growth assumption. */
export interface HistoricalStatementMonth {
  month: string
  income: number | null
  cogs: number | null
  expenses: number | null
  ordinaryIncome: number | null
  netIncome: number | null
}

export interface HistoricalChannelStatement extends HistoricalStatementMonth {
  channel: string
}

type Matrix = unknown[][]

const clean = (value: unknown) => String(value ?? '').trim()
const key = (value: unknown) => clean(value).toLowerCase().replace(/\s+/g, ' ')

function numberAt(row: unknown[] | undefined, index: number): number | null {
  const value = row?.[index]
  if (value === null || value === undefined || clean(value) === '') return null
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  const raw = clean(value).replace(/[$,\s]/g, '')
  const negative = /^\(.*\)$/.test(raw)
  const parsed = Number(negative ? raw.slice(1, -1) : raw)
  return Number.isFinite(parsed) ? (negative ? -parsed : parsed) : null
}

function findRow(rows: Matrix, label: string): unknown[] | undefined {
  return rows.find(row => key(row[0]) === label)
}

function statementAt(rows: Matrix, month: string, column: number): HistoricalStatementMonth {
  return {
    month,
    income: numberAt(findRow(rows, 'total income'), column),
    cogs: numberAt(findRow(rows, 'total cogs'), column),
    expenses: numberAt(findRow(rows, 'total expense'), column),
    ordinaryIncome: numberAt(findRow(rows, 'net ordinary income'), column),
    netIncome: numberAt(findRow(rows, 'net income'), column),
  }
}

const MONTHS: Record<string, string> = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
}

export function assertUniqueHistoricalMonths(rows: HistoricalStatementMonth[]): void {
  const seen = new Set<string>()
  for (const row of rows) {
    if (seen.has(row.month)) throw new Error(`The historical company statement contains the month ${row.month} more than once.`)
    seen.add(row.month)
  }
}

/** Parses the company income-statement export with e.g. "Nov 25" column headings. */
export function parseHistoricalCompanyStatement(rows: Matrix): HistoricalStatementMonth[] {
  const header = rows.find(row => row.some(value => /^[a-z]{3}\s+\d{2}$/i.test(clean(value))))
  if (!header) throw new Error('The historical income statement is missing monthly column headings.')
  if (!findRow(rows, 'total income') || !findRow(rows, 'net ordinary income')) {
    throw new Error('The historical income statement is missing Total Income or Net Ordinary Income.')
  }
  const parsed = header.flatMap((value, index) => {
    const match = /^([a-z]{3})\s+(\d{2})$/i.exec(clean(value))
    const month = match && MONTHS[match[1].toLowerCase()]
    return month && match ? [statementAt(rows, `20${match[2]}-${month}-01`, index)] : []
  }).sort((a, b) => a.month.localeCompare(b.month))
  assertUniqueHistoricalMonths(parsed)
  return parsed
}

/**
 * Parses a single month's QuickBooks class export. Parent-class subtotal columns
 * replace their children so FBA/FBM and their total are never counted twice.
 */
export function parseHistoricalClassStatement(rows: Matrix, month: string): HistoricalChannelStatement[] {
  if (!/^\d{4}-\d{2}-01$/.test(month)) throw new Error('A valid statement month is required.')
  const header = rows.find(row => row.some(value => key(value) === 'total') && row.some(value => /^total\s+.+/i.test(clean(value))))
  if (!header || !findRow(rows, 'total income') || !findRow(rows, 'net ordinary income')) {
    throw new Error('The class statement is missing class headings, Total Income or Net Ordinary Income.')
  }
  const columns = new Map<string, { channel: string; index: number; subtotal: boolean }>()
  header.forEach((value, index) => {
    const name = clean(value)
    if (!name || key(name) === 'total' || /^\(.*\)$/.test(name) || /^\d+$/.test(name)) return
    const channel = name.replace(/^total\s+/i, '').trim()
    const normalized = key(channel)
    if (!normalized) return
    const subtotal = /^total\s+/i.test(name)
    const existing = columns.get(normalized)
    if (existing && existing.subtotal === subtotal) throw new Error(`The class statement contains multiple columns for ${channel}.`)
    if (!existing || subtotal) columns.set(normalized, { channel, index, subtotal })
  })
  return [...columns.values()].map(({ channel, index }) => ({ ...statementAt(rows, month, index), channel }))
}

/** QuickBooks exports in the supplied set use Windows-1252; newer files may be UTF-8. */
export async function readHistoricalCsv(file: File): Promise<Matrix> {
  const bytes = await file.arrayBuffer()
  let text: string
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes) }
  catch { text = new TextDecoder('windows-1252').decode(bytes) }
  const workbook = XLSX.read(text, { type: 'string', raw: true })
  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  if (!sheet) throw new Error(`No worksheet was found in ${file.name}.`)
  return XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: null }) as Matrix
}
