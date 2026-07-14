import type { MonthlyStar, NorthStarRow, NorthStarStatus } from '@/types'

export const NORTH_STAR_EDITABLE_FIELDS = [
  'pillar',
  'owner',
  'north_star',
  'plan_value',
  'actual_mtd',
  'forecast',
  'constraint_now',
  'weekly_move',
  'last_week_result',
  'status',
] as const

export type NorthStarEditableField = typeof NORTH_STAR_EDITABLE_FIELDS[number]

export const NORTH_STAR_PROGRESS_FIELDS = [
  'plan_value',
  'actual_mtd',
  'forecast',
  'constraint_now',
  'weekly_move',
  'last_week_result',
  'status',
] as const

export type NorthStarProgressField = typeof NORTH_STAR_PROGRESS_FIELDS[number]

export const STATUS_LABELS: Record<NorthStarStatus, string> = {
  on_plan: 'On track',
  at_risk: 'Off track with a plan',
  off_plan: 'Blocked',
}

export type NorthStarSortField = 'slot_index' | 'owner'
export type NorthStarSortDirection = 'asc' | 'desc'

export interface NorthStarSortState {
  field: NorthStarSortField
  dir: NorthStarSortDirection
}

export function nextNorthStarSort(current: NorthStarSortState, field: NorthStarSortField): NorthStarSortState {
  if (field === 'slot_index') return { field: 'slot_index', dir: 'asc' }
  if (current.field !== field) return { field, dir: 'asc' }
  if (current.dir === 'asc') return { field, dir: 'desc' }
  return { field: 'slot_index', dir: 'asc' }
}

export function sortNorthStarRows(rows: NorthStarDisplayRow[], sort: NorthStarSortState): NorthStarDisplayRow[] {
  return [...rows].sort((a, b) => {
    if (sort.field === 'owner') {
      const leftOwner = a.owner?.trim() ?? ''
      const rightOwner = b.owner?.trim() ?? ''
      const leftMissing = leftOwner.length === 0
      const rightMissing = rightOwner.length === 0

      if (leftMissing !== rightMissing) return leftMissing ? 1 : -1

      const ownerComparison = leftOwner.localeCompare(rightOwner, undefined, { sensitivity: 'base' })
      if (ownerComparison !== 0) return sort.dir === 'asc' ? ownerComparison : -ownerComparison
    }

    return a.slot_index - b.slot_index
  })
}

export const DEFAULT_NORTH_STAR_ROWS = [
  { slot_index: 1, pillar: 'Finance / cash', owner: 'Ryan', north_star: 'NOI >= 7% floor / cash runway' },
  { slot_index: 2, pillar: 'Amazon retail', owner: 'Meilich', north_star: 'NOP -> 85% by Q4' },
  { slot_index: 3, pillar: 'Wholesale', owner: 'Mike / Sam', north_star: '860 -> 1,400 dealers / churn down 31.5%' },
  { slot_index: 4, pillar: 'Cloud9', owner: 'Sam', north_star: 'New group signups / month' },
  { slot_index: 5, pillar: 'Purchasing', owner: 'Ryan', north_star: 'JIT inventory + AI signals' },
  { slot_index: 6, pillar: 'Product / brand', owner: 'Meilich', north_star: 'Roadmap revenue / NESTL + expansion' },
  { slot_index: 7, pillar: 'LOS', owner: 'Meilich', north_star: 'Full ASIN management + expansion' },
  { slot_index: 8, pillar: 'Ops / warehouse', owner: 'Kalmy', north_star: 'OTD / Late-Ship health / OM down' },
]

export interface NorthStarDisplayRow {
  id: string | null
  is_set: boolean
  is_locked: boolean
  source?: 'monthly_star' | 'leadership_tool'
  autoFields?: readonly NorthStarEditableField[]
  chart?: NorthStarSlideChart
  period_month: string
  period_week: string
  slot_index: number
  pillar: string
  owner: string | null
  north_star: string
  plan_value: string | null
  actual_mtd: string | null
  forecast: string | null
  constraint_now: string | null
  weekly_move: string | null
  last_week_result: string | null
  status: NorthStarStatus
}

export interface NorthStarSlideChart {
  kind: 'sales' | 'cash_runway' | 'payroll' | 'pnl'
  valueFormat: 'currency' | 'percent' | 'number'
  points: NorthStarSlideChartPoint[]
  comparisonPoints?: NorthStarSlideChartComparisonPoint[]
  threshold?: number
  benchmarkLabel?: string
}

export interface NorthStarSlideChartPoint {
  label: string
  value: number
  secondaryValue?: number
  benchmark?: number
  tone?: 'success' | 'danger' | 'accent'
}

export interface NorthStarSlideChartComparisonPoint {
  label: string
  currentValue: number
  previousValue: number
}

export interface MonthlyStarInput {
  target_sales: number
  mtd_actual: number
  ly_mtd_actual: number
  days_elapsed: number
  days_remaining: number
  dragging_channel_notes: string | null
  channel_deltas: Array<{ channel: string; delta: number }>
}

export interface MonthlyStarMetrics {
  yoyDelta: number
  yoyPct: number | null
  dailyPace: number
  projectedMonthEnd: number
  remainingToTarget: number
  dailyNeeded: number
  liftNeededPct: number | null
  onTrack: boolean
  draggingChannels: Array<{ channel: string; delta: number }>
}

export interface MonthlyStarSalesRow {
  sale_date: string
  channel: string | null
  revenue: number
}

export interface MonthlyStarSalesWindows {
  currentStart: string
  currentEndExclusive: string
  previousStart: string
  previousEndExclusive: string
  daysElapsed: number
  daysRemaining: number
}

export const MONTHLY_STAR_TIME_ZONE = 'America/New_York'
export const MONTHLY_STAR_DRAG_CHANNEL_LIMIT = 3

export function periodMonth(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`
}

export function addMonthsToPeriod(periodMonth: string, offset: number): string {
  const start = new Date(`${periodMonth}T00:00:00Z`)
  start.setUTCMonth(start.getUTCMonth() + offset)
  return formatDate(start)
}

export function formatPeriodMonth(periodMonth: string): string {
  const start = new Date(`${periodMonth}T00:00:00Z`)
  return new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(start)
}

export function periodWeek(date = new Date()): string {
  const start = new Date(date)
  start.setHours(0, 0, 0, 0)
  start.setDate(start.getDate() - start.getDay())
  return `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`
}

export function monthlyStarSalesWindows(periodMonth: string, today = new Date()): MonthlyStarSalesWindows {
  const currentStart = new Date(`${periodMonth}T00:00:00Z`)
  const monthEnd = new Date(Date.UTC(currentStart.getUTCFullYear(), currentStart.getUTCMonth() + 1, 1))
  const todayStart = new Date(`${businessDate(today, MONTHLY_STAR_TIME_ZONE)}T00:00:00Z`)

  const isCurrentMonth =
    currentStart.getUTCFullYear() === todayStart.getUTCFullYear() &&
    currentStart.getUTCMonth() === todayStart.getUTCMonth()
  const currentEndExclusive = isCurrentMonth ? maxDate(currentStart, todayStart) : monthEnd
  const daysElapsed = daysBetween(currentStart, currentEndExclusive)
  const daysRemaining = Math.max(0, daysBetween(currentEndExclusive, monthEnd))
  const previousStart = new Date(Date.UTC(currentStart.getUTCFullYear() - 1, currentStart.getUTCMonth(), 1))
  const previousEndExclusive = new Date(previousStart)
  previousEndExclusive.setUTCDate(previousStart.getUTCDate() + daysElapsed)

  return {
    currentStart: formatDate(currentStart),
    currentEndExclusive: formatDate(currentEndExclusive),
    previousStart: formatDate(previousStart),
    previousEndExclusive: formatDate(previousEndExclusive),
    daysElapsed,
    daysRemaining,
  }
}

export function mergeNorthStarRows(
  rows: NorthStarRow[],
  currentMonth: string,
  currentWeek: string
): NorthStarDisplayRow[] {
  if (rows.length > 0) {
    return [...rows]
      .sort((a, b) => a.slot_index - b.slot_index)
      .map(row => ({
        id: row.id,
        is_set: true,
        is_locked: row.is_locked,
        period_month: row.period_month,
        period_week: row.period_week,
        slot_index: row.slot_index,
        pillar: row.pillar,
        owner: row.owner,
        north_star: row.north_star,
        plan_value: row.plan_value,
        actual_mtd: row.actual_mtd,
        forecast: row.forecast,
        constraint_now: row.constraint_now,
        weekly_move: row.weekly_move,
        last_week_result: row.last_week_result,
        status: row.status,
      }))
  }

  return DEFAULT_NORTH_STAR_ROWS.map(defaultRow => {
    return {
      id: null,
      is_set: false,
      is_locked: false,
      period_month: currentMonth,
      period_week: currentWeek,
      slot_index: defaultRow.slot_index,
      pillar: defaultRow.pillar,
      owner: defaultRow.owner,
      north_star: defaultRow.north_star,
      plan_value: null,
      actual_mtd: null,
      forecast: null,
      constraint_now: null,
      weekly_move: null,
      last_week_result: null,
      status: 'on_plan',
    }
  })
}

export function nextNorthStarSlot(rows: NorthStarDisplayRow[]): number {
  const used = new Set(rows.map(row => row.slot_index))
  for (let slot = 1; slot <= 50; slot += 1) {
    if (!used.has(slot)) return slot
  }
  return rows.length + 1
}

export function createNorthStarDraftRow(
  rows: NorthStarDisplayRow[],
  currentMonth: string,
  currentWeek: string
): NorthStarDisplayRow {
  return {
    id: null,
    is_set: false,
    is_locked: false,
    period_month: currentMonth,
    period_week: currentWeek,
    slot_index: nextNorthStarSlot(rows),
    pillar: 'New pillar',
    owner: null,
    north_star: '',
    plan_value: null,
    actual_mtd: null,
    forecast: null,
    constraint_now: null,
    weekly_move: null,
    last_week_result: null,
    status: 'on_plan',
  }
}

export function buildNorthStarUpdatePayload(
  row: NorthStarDisplayRow,
  field: NorthStarEditableField,
  value: string | NorthStarStatus
) {
  const textValue = typeof value === 'string' ? value.trim() : value
  const next = { ...row, [field]: textValue }
  return {
    id: row.id,
    is_locked: true,
    period_month: row.period_month,
    period_week: row.period_week,
    slot_index: row.slot_index,
    pillar: next.pillar.trim() || 'Untitled pillar',
    owner: normalizeNullableText(next.owner),
    north_star: next.north_star.trim(),
    plan_value: normalizeNullableText(next.plan_value),
    actual_mtd: normalizeNullableText(next.actual_mtd),
    forecast: normalizeNullableText(next.forecast),
    constraint_now: normalizeNullableText(next.constraint_now),
    weekly_move: normalizeNullableText(next.weekly_move),
    last_week_result: normalizeNullableText(next.last_week_result),
    status: next.status,
  }
}

export function computeMonthlyStarMetrics(input: MonthlyStarInput): MonthlyStarMetrics {
  const daysElapsed = Math.max(0, Number(input.days_elapsed || 0))
  const daysRemaining = Math.max(0, Number(input.days_remaining || 0))
  const dailyPace = daysElapsed > 0 ? input.mtd_actual / daysElapsed : 0
  const projectedMonthEnd = input.mtd_actual + dailyPace * daysRemaining
  const remainingToTarget = Math.max(0, input.target_sales - input.mtd_actual)
  const dailyNeeded = daysRemaining > 0 ? remainingToTarget / daysRemaining : remainingToTarget
  const yoyDelta = input.mtd_actual - input.ly_mtd_actual
  const yoyPct = input.ly_mtd_actual > 0 ? (yoyDelta / input.ly_mtd_actual) * 100 : null
  const liftNeededPct = dailyPace > 0 ? ((dailyNeeded - dailyPace) / dailyPace) * 100 : null

  return {
    yoyDelta,
    yoyPct,
    dailyPace,
    projectedMonthEnd,
    remainingToTarget,
    dailyNeeded,
    liftNeededPct,
    onTrack: projectedMonthEnd >= input.target_sales,
    draggingChannels: topDraggingChannels(input.channel_deltas),
  }
}

export function topDraggingChannels(channels: Array<{ channel: string; delta: number }>): Array<{ channel: string; delta: number }> {
  return channels
    .filter(channel => Number(channel.delta) < 0)
    .sort((a, b) => a.delta - b.delta)
    .slice(0, MONTHLY_STAR_DRAG_CHANNEL_LIMIT)
}

export function formatMonthlyStarDragChannelNotes(channels: Array<{ channel: string; delta: number }>): string {
  return topDraggingChannels(channels).map(channel => `${channel.channel}: ${channel.delta}`).join('\n')
}

export function deriveMonthlyStarFromSalesRows({
  periodMonth,
  targetSales,
  rows,
  previousYearRows,
  daysElapsed,
  daysRemaining,
}: {
  periodMonth: string
  targetSales: number
  rows: MonthlyStarSalesRow[]
  previousYearRows: MonthlyStarSalesRow[]
  daysElapsed: number
  daysRemaining: number
}): MonthlyStarInput & { period_month: string } {
  const currentPeriod = periodMonth.slice(0, 7)
  const currentRows = rows.filter(row => row.sale_date.slice(0, 7) === currentPeriod)
  const mtdByChannel = sumRevenueByChannel(currentRows)
  const lyByChannel = sumRevenueByChannel(previousYearRows)
  const channels = Array.from(new Set([...mtdByChannel.keys(), ...lyByChannel.keys()])).sort()

  return {
    period_month: periodMonth,
    target_sales: targetSales,
    mtd_actual: sumMapValues(mtdByChannel),
    ly_mtd_actual: sumMapValues(lyByChannel),
    days_elapsed: daysElapsed,
    days_remaining: daysRemaining,
    dragging_channel_notes: null,
    channel_deltas: channels.map(channel => ({
      channel,
      delta: Number(((mtdByChannel.get(channel) ?? 0) - (lyByChannel.get(channel) ?? 0)).toFixed(2)),
    })),
  }
}

function normalizeNullableText(value: string | null): string | null {
  const trimmed = (value ?? '').trim()
  return trimmed || null
}

function sumRevenueByChannel(rows: MonthlyStarSalesRow[]): Map<string, number> {
  const map = new Map<string, number>()
  for (const row of rows) {
    const channel = (row.channel || 'Unassigned').trim() || 'Unassigned'
    map.set(channel, (map.get(channel) ?? 0) + Number(row.revenue || 0))
  }
  return map
}

function sumMapValues(map: Map<string, number>): number {
  return Number(Array.from(map.values()).reduce((sum, value) => sum + value, 0).toFixed(2))
}

export function buildNorthStarProgressPayload(
  row: NorthStarDisplayRow,
  field: NorthStarProgressField,
  value: string | NorthStarStatus
) {
  const textValue = typeof value === 'string' ? value.trim() : value
  const next = { ...row, [field]: textValue }
  return {
    id: row.id,
    plan_value: normalizeNullableText(next.plan_value),
    actual_mtd: normalizeNullableText(next.actual_mtd),
    forecast: normalizeNullableText(next.forecast),
    constraint_now: normalizeNullableText(next.constraint_now),
    weekly_move: normalizeNullableText(next.weekly_move),
    last_week_result: normalizeNullableText(next.last_week_result),
    status: next.status,
  }
}

export function isNorthStarProgressField(field: NorthStarEditableField): field is NorthStarProgressField {
  return (NORTH_STAR_PROGRESS_FIELDS as readonly string[]).includes(field)
}

function maxDate(a: Date, b: Date): Date {
  return a > b ? new Date(a) : new Date(b)
}

function daysBetween(start: Date, end: Date): number {
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 86_400_000))
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function businessDate(date: Date, timeZone: string): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(date).map(part => [part.type, part.value])
  )
  return `${parts.year}-${parts.month}-${parts.day}`
}

export function defaultMonthlyStar(currentMonth: string): MonthlyStarInput & { period_month: string } {
  const now = new Date()
  const windows = monthlyStarSalesWindows(currentMonth, now)
  return {
    period_month: currentMonth,
    target_sales: 9000000,
    mtd_actual: 0,
    ly_mtd_actual: 0,
    days_elapsed: Math.max(1, windows.daysElapsed),
    days_remaining: windows.daysRemaining,
    dragging_channel_notes: null,
    channel_deltas: [],
  }
}

export function monthlyStarToInput(star: MonthlyStar | null, currentMonth: string): MonthlyStarInput & { period_month: string } {
  if (!star) return defaultMonthlyStar(currentMonth)
  return {
    period_month: star.period_month,
    target_sales: Number(star.target_sales ?? 0),
    mtd_actual: Number(star.mtd_actual ?? 0),
    ly_mtd_actual: Number(star.ly_mtd_actual ?? 0),
    days_elapsed: Number(star.days_elapsed ?? 0),
    days_remaining: Number(star.days_remaining ?? 0),
    dragging_channel_notes: star.dragging_channel_notes ?? null,
    channel_deltas: Array.isArray(star.channel_deltas) ? star.channel_deltas : [],
  }
}
