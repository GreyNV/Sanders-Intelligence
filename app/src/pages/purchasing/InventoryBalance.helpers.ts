export interface InventoryBalanceSettingsInput {
  beginning_period_month: string
  beginning_inventory_value: number
}

export interface InventoryBalanceMovementInput {
  period_month: string
  received_value: number
}

export interface InventoryBalanceSalesInput {
  period_month: string
  cogs_amount: number
  missing_cogs_count: number
}

export interface InventoryBalanceInput {
  settings: InventoryBalanceSettingsInput | null
  selectedPeriodMonth: string
  receipts: InventoryBalanceMovementInput[]
  sales: InventoryBalanceSalesInput[]
}

export interface InventoryBalanceRow {
  period_month: string
  first_date: string
  end_date: string
  beginning_inventory_value: number
  po_received_value: number
  cogs_amount: number
  ending_inventory_value: number
  missing_cogs_count: number
}

export function buildInventoryBalanceRows(input: InventoryBalanceInput): InventoryBalanceRow[] {
  if (!input.settings) return []

  const startPeriod = periodMonthFromDate(input.settings.beginning_period_month)
  const selectedPeriod = periodMonthFromDate(input.selectedPeriodMonth)
  const endPeriod = selectedPeriod < startPeriod ? startPeriod : selectedPeriod
  const receiptByMonth = sumByPeriod(input.receipts, row => row.received_value)
  const salesByMonth = sumSalesByPeriod(input.sales)
  const rows: InventoryBalanceRow[] = []
  let beginning = roundMoney(input.settings.beginning_inventory_value)

  for (const period_month of monthRange(startPeriod, endPeriod)) {
    const poReceived = roundMoney(receiptByMonth.get(period_month) ?? 0)
    const sales = salesByMonth.get(period_month) ?? { cogs_amount: 0, missing_cogs_count: 0 }
    const cogs = roundMoney(sales.cogs_amount)
    const ending = roundMoney(beginning + poReceived - cogs)

    rows.push({
      period_month,
      first_date: period_month,
      end_date: inventoryBalanceMonthEnd(period_month),
      beginning_inventory_value: beginning,
      po_received_value: poReceived,
      cogs_amount: cogs,
      ending_inventory_value: ending,
      missing_cogs_count: sales.missing_cogs_count,
    })

    beginning = ending
  }

  return rows
}

export function inventoryBalanceMonthEnd(periodMonth: string): string {
  const start = periodDate(periodMonth)
  const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0))
  return formatDate(end)
}

export function addMonthsToInventoryPeriod(periodMonth: string, offset: number): string {
  const start = periodDate(periodMonth)
  start.setUTCMonth(start.getUTCMonth() + offset)
  return formatDate(start)
}

export function periodMonthFromDate(value: string): string {
  const parsed = new Date(`${String(value).slice(0, 10)}T00:00:00Z`)
  if (!Number.isFinite(parsed.getTime())) return value
  return formatDate(new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), 1)))
}

export function parseInventoryMoney(value: string): number {
  const trimmed = value.trim()
  const isWrappedNegative = trimmed.startsWith('(') && trimmed.endsWith(')')
  const normalized = trimmed.replace(/[$,\s()]/g, '')
  const parsed = Number(normalized)
  if (!Number.isFinite(parsed)) return 0
  return isWrappedNegative ? -parsed : parsed
}

function monthRange(startPeriod: string, endPeriod: string): string[] {
  const months: string[] = []
  const cursor = periodDate(startPeriod)
  const end = periodDate(endPeriod)

  while (cursor <= end) {
    months.push(formatDate(cursor))
    cursor.setUTCMonth(cursor.getUTCMonth() + 1)
  }

  return months
}

function sumByPeriod<T extends { period_month: string }>(
  rows: T[],
  value: (row: T) => number
): Map<string, number> {
  const byPeriod = new Map<string, number>()
  for (const row of rows) {
    const period = periodMonthFromDate(row.period_month)
    byPeriod.set(period, roundMoney((byPeriod.get(period) ?? 0) + Number(value(row) ?? 0)))
  }
  return byPeriod
}

function sumSalesByPeriod(rows: InventoryBalanceSalesInput[]) {
  const byPeriod = new Map<string, { cogs_amount: number; missing_cogs_count: number }>()
  for (const row of rows) {
    const period = periodMonthFromDate(row.period_month)
    const current = byPeriod.get(period) ?? { cogs_amount: 0, missing_cogs_count: 0 }
    byPeriod.set(period, {
      cogs_amount: roundMoney(current.cogs_amount + Number(row.cogs_amount ?? 0)),
      missing_cogs_count: current.missing_cogs_count + Number(row.missing_cogs_count ?? 0),
    })
  }
  return byPeriod
}

function periodDate(periodMonth: string): Date {
  return new Date(`${periodMonth.slice(0, 10)}T00:00:00Z`)
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function roundMoney(value: number): number {
  return Number(Number(value || 0).toFixed(2))
}
