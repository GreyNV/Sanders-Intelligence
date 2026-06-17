import type { MonthlyStar, NorthStarRow, NorthStarStatus } from '@/types'

export const STATUS_LABELS: Record<NorthStarStatus, string> = {
  on_plan: 'On plan',
  at_risk: 'At risk',
  off_plan: 'Off plan',
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
  period_month: string
  period_week: string
  slot_index: number
  pillar: string
  owner: string | null
  north_star: string
  constraint_now: string | null
  weekly_move: string | null
  last_week_result: string | null
  status: NorthStarStatus
}

export interface MonthlyStarInput {
  target_sales: number
  mtd_actual: number
  ly_mtd_actual: number
  days_elapsed: number
  days_remaining: number
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

export function periodMonth(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`
}

export function periodWeek(date = new Date()): string {
  const start = new Date(date)
  start.setHours(0, 0, 0, 0)
  start.setDate(start.getDate() - start.getDay())
  return `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`
}

export function mergeNorthStarRows(
  rows: NorthStarRow[],
  currentMonth: string,
  currentWeek: string
): NorthStarDisplayRow[] {
  return DEFAULT_NORTH_STAR_ROWS.map(defaultRow => {
    const saved = rows.find(row => row.slot_index === defaultRow.slot_index)
    return {
      id: saved?.id ?? null,
      is_set: Boolean(saved),
      is_locked: saved?.is_locked ?? false,
      period_month: saved?.period_month ?? currentMonth,
      period_week: saved?.period_week ?? currentWeek,
      slot_index: defaultRow.slot_index,
      pillar: saved?.pillar ?? defaultRow.pillar,
      owner: saved?.owner ?? defaultRow.owner,
      north_star: saved?.north_star ?? defaultRow.north_star,
      constraint_now: saved?.constraint_now ?? null,
      weekly_move: saved?.weekly_move ?? null,
      last_week_result: saved?.last_week_result ?? null,
      status: saved?.status ?? 'on_plan',
    }
  })
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
    draggingChannels: input.channel_deltas
      .filter(channel => Number(channel.delta) < 0)
      .sort((a, b) => a.delta - b.delta),
  }
}

export function defaultMonthlyStar(currentMonth: string): MonthlyStarInput & { period_month: string } {
  const now = new Date()
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  return {
    period_month: currentMonth,
    target_sales: 9000000,
    mtd_actual: 0,
    ly_mtd_actual: 0,
    days_elapsed: Math.max(1, now.getDate()),
    days_remaining: Math.max(0, daysInMonth - now.getDate()),
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
    channel_deltas: Array.isArray(star.channel_deltas) ? star.channel_deltas : [],
  }
}
