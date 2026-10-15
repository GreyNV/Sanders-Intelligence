import * as XLSX from 'xlsx'

type SheetMatrix = unknown[][]

export interface SalesReportDay {
  sale_date: string
  revenue: number
  orders: number
}

export interface ParsedSalesReport {
  filename: string
  dateFrom: string
  dateTo: string
  rowCount: number
  totalRevenue: number
  daily: SalesReportDay[]
}

export async function parseSalesReportFile(file: File): Promise<ParsedSalesReport> {
  const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true })
  const preferredName = workbook.SheetNames.find(name => ['table', 'report'].includes(name.trim().toLowerCase()))
  const sheetName = preferredName ?? workbook.SheetNames[0]
  if (!sheetName) throw new Error('The workbook does not contain a worksheet.')

  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
    header: 1,
    raw: true,
    defval: null,
  }) as SheetMatrix

  return parseSalesReportRows(rows, file.name)
}

export function parseSalesReportRows(rows: SheetMatrix, filename = 'SellerCloud sales report.xlsx'): ParsedSalesReport {
  const headerIndex = rows.slice(0, 20).findIndex(row => {
    const labels = row.map(value => normalizeLabel(String(value ?? '')))
    return labels.includes('ship date') && labels.includes('grand total') && labels.includes('order')
  })
  if (headerIndex < 0) {
    throw new Error('This does not look like a SellerCloud Sales by Date Range export. Required columns: Order #, Ship Date, and Grand Total.')
  }

  const header = rows[headerIndex]
  const shipDateIndex = findHeader(header, ['Ship Date', 'ShipDate'])
  const grandTotalIndex = findHeader(header, ['Grand Total', 'GrandTotal'])
  const orderIndex = findHeader(header, ['Order #', 'Order'])
  if ([shipDateIndex, grandTotalIndex, orderIndex].some(index => index < 0)) {
    throw new Error('The SellerCloud report is missing Order #, Ship Date, or Grand Total.')
  }

  const daily = new Map<string, { revenue: number; orders: number }>()
  let rowCount = 0
  let totalRevenue = 0

  for (const row of rows.slice(headerIndex + 1)) {
    if (row[orderIndex] == null || String(row[orderIndex]).trim() === '') continue
    const saleDate = toIsoDate(row[shipDateIndex])
    if (!saleDate) throw new Error(`A sales row has an invalid Ship Date near row ${headerIndex + rowCount + 2}.`)
    const revenue = toNumber(row[grandTotalIndex])
    if (revenue === null) throw new Error(`A sales row has an invalid Grand Total near row ${headerIndex + rowCount + 2}.`)

    const value = daily.get(saleDate) ?? { revenue: 0, orders: 0 }
    value.revenue += revenue
    value.orders += 1
    daily.set(saleDate, value)
    totalRevenue += revenue
    rowCount += 1
  }

  if (rowCount === 0) throw new Error('The SellerCloud report contains no sales rows.')

  const orderedDays = [...daily.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([sale_date, value]) => ({
      sale_date,
      revenue: roundCurrency(value.revenue),
      orders: value.orders,
    }))

  return {
    filename,
    dateFrom: orderedDays[0].sale_date,
    dateTo: orderedDays[orderedDays.length - 1]?.sale_date ?? orderedDays[0].sale_date,
    rowCount,
    totalRevenue: roundCurrency(totalRevenue),
    daily: orderedDays,
  }
}

function findHeader(row: unknown[], labels: string[]): number {
  const wanted = new Set(labels.map(normalizeLabel))
  return row.findIndex(value => wanted.has(normalizeLabel(String(value ?? ''))))
}

function normalizeLabel(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value.replace(/[$,\s]/g, ''))
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function toIsoDate(value: unknown): string | null {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value.toISOString().slice(0, 10)
  if (typeof value === 'number') {
    const parsed = XLSX.SSF.parse_date_code(value)
    return parsed ? isoDate(parsed.y, parsed.m, parsed.d) : null
  }
  if (typeof value !== 'string') return null

  const text = value.trim()
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return isoDate(Number(iso[1]), Number(iso[2]), Number(iso[3]))
  const us = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (us) return isoDate(Number(us[3]), Number(us[1]), Number(us[2]))
  return null
}

function isoDate(year: number, month: number, day: number): string | null {
  const value = new Date(Date.UTC(year, month - 1, day))
  if (value.getUTCFullYear() !== year || value.getUTCMonth() !== month - 1 || value.getUTCDate() !== day) return null
  return value.toISOString().slice(0, 10)
}

function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}
