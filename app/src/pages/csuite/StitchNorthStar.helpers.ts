import { fmtCurrency } from '@/lib/utils'
import type { LeadershipToolSnapshot, NorthStarStatus } from '@/types'
import type { MonthlyStarInput, MonthlyStarMetrics, NorthStarDisplayRow, NorthStarEditableField } from './NorthStar.helpers'
import { formatMonthlyStarDragChannelNotes, nextNorthStarSlot } from './NorthStar.helpers'

export const STITCH_ALL_PILLARS_TAB = '__all__'
export const STITCH_UNASSIGNED_OWNER = 'Unassigned'
export const MONTHLY_STAR_FINANCE_PILLAR = 'Finance metrics'
export const MONTHLY_STAR_FINANCE_NORTH_STAR = 'Monthly sales target / MTD pace'
export const STITCH_AUTO_FINANCE_FIELDS = ['plan_value', 'actual_mtd', 'forecast'] as const satisfies readonly NorthStarEditableField[]

export interface StitchPillarTab {
  id: string
  label: string
  count: number
}

export interface StitchOwnerDeck {
  owner: string
  rows: NorthStarDisplayRow[]
}

export function buildStitchFinanceMetricRow(
  rows: NorthStarDisplayRow[],
  input: MonthlyStarInput & { period_month: string },
  metrics: MonthlyStarMetrics,
  currentWeek: string
): NorthStarDisplayRow {
  const existing = rows.find(row => normalizeTabId(row.pillar) === normalizeTabId(MONTHLY_STAR_FINANCE_PILLAR))
  const financeOwner = rows.find(row => normalizeTabId(row.pillar) === 'finance / cash')?.owner?.trim() || 'Ryan'

  return {
    id: existing?.id ?? null,
    is_set: Boolean(existing?.id),
    is_locked: existing?.is_locked ?? false,
    source: 'monthly_star',
    autoFields: STITCH_AUTO_FINANCE_FIELDS,
    period_month: input.period_month,
    period_week: existing?.period_week ?? currentWeek,
    slot_index: existing?.slot_index ?? nextNorthStarSlot(rows),
    pillar: existing?.pillar?.trim() || MONTHLY_STAR_FINANCE_PILLAR,
    owner: existing?.owner ?? financeOwner,
    north_star: existing?.north_star?.trim() || MONTHLY_STAR_FINANCE_NORTH_STAR,
    plan_value: fmtCurrency(input.target_sales),
    actual_mtd: fmtCurrency(input.mtd_actual),
    forecast: fmtCurrency(metrics.projectedMonthEnd),
    constraint_now: existing?.constraint_now ?? defaultFinanceConstraint(input, metrics),
    weekly_move: existing?.weekly_move ?? defaultFinanceWeeklyMove(metrics),
    last_week_result: existing?.last_week_result ?? defaultFinanceLastWeek(metrics),
    status: existing?.status ?? (metrics.onTrack ? 'on_plan' : 'at_risk'),
  }
}

export function mergeStitchFinanceMetricRow(rows: NorthStarDisplayRow[], financeRow: NorthStarDisplayRow): NorthStarDisplayRow[] {
  return mergeStitchFinanceRows(rows, [financeRow])
}

export function mergeStitchFinanceRows(rows: NorthStarDisplayRow[], financeRows: NorthStarDisplayRow[]): NorthStarDisplayRow[] {
  const replacements = new Map(financeRows.map(row => [generatedRowKey(row), row]))
  let replaced = false

  const merged = rows.map(row => {
    const replacement = replacements.get(generatedRowKey(row))
    if (!replacement) return row
    replaced = true
    replacements.delete(generatedRowKey(row))
    return replacement
  })

  return replaced ? [...merged, ...replacements.values()] : [...rows, ...financeRows]
}

export function isStitchAutoFinanceField(row: NorthStarDisplayRow, field: NorthStarEditableField): boolean {
  return row.source === 'monthly_star' && Boolean(row.autoFields?.includes(field))
}

export function buildLeadershipFinanceRows(
  rows: NorthStarDisplayRow[],
  snapshot: Pick<LeadershipToolSnapshot, 'cashflow' | 'payroll' | 'pnl' | 'sales_simulation'> | null,
  periodMonth: string,
  currentWeek: string
): NorthStarDisplayRow[] {
  if (!snapshot) return []

  const startSlot = nextNorthStarSlot(rows)
  return [
    buildCashRunwayRow(snapshot, periodMonth, currentWeek, startSlot),
    buildPayrollRow(snapshot, periodMonth, currentWeek, startSlot + 1),
    buildPnlRow(snapshot, periodMonth, currentWeek, startSlot + 2),
  ]
}

export function buildStitchPillarTabs(rows: NorthStarDisplayRow[]): StitchPillarTab[] {
  const tabs = new Map<string, StitchPillarTab>()

  for (const row of rows) {
    const label = row.pillar.trim() || 'Untitled pillar'
    const id = normalizeTabId(label)
    const existing = tabs.get(id)

    if (existing) {
      existing.count += 1
    } else {
      tabs.set(id, { id, label, count: 1 })
    }
  }

  return [{ id: STITCH_ALL_PILLARS_TAB, label: 'All', count: rows.length }, ...tabs.values()]
}

export function filterRowsByPillar(rows: NorthStarDisplayRow[], selectedPillar: string): NorthStarDisplayRow[] {
  if (selectedPillar === STITCH_ALL_PILLARS_TAB) return rows
  return rows.filter(row => normalizeTabId(row.pillar) === selectedPillar)
}

export function buildOwnerSlideDeck(rows: NorthStarDisplayRow[]): StitchOwnerDeck[] {
  const decks = new Map<string, NorthStarDisplayRow[]>()

  for (const row of rows) {
    for (const owner of splitOwners(row.owner)) {
      const ownerRows = decks.get(owner) ?? []
      ownerRows.push(row)
      decks.set(owner, ownerRows)
    }
  }

  return [...decks.entries()]
    .sort(([left], [right]) => {
      if (left === STITCH_UNASSIGNED_OWNER) return 1
      if (right === STITCH_UNASSIGNED_OWNER) return -1
      return left.localeCompare(right, undefined, { sensitivity: 'base' })
    })
    .map(([owner, ownerRows]) => ({
      owner,
      rows: [...ownerRows].sort((a, b) => a.slot_index - b.slot_index),
    }))
}

export function splitOwners(owner: string | null): string[] {
  const owners = (owner ?? '')
    .split(/\s*(?:\/|,|&|\band\b)\s*/i)
    .map(value => value.trim())
    .filter(Boolean)

  return owners.length > 0 ? owners : [STITCH_UNASSIGNED_OWNER]
}

function normalizeTabId(value: string): string {
  return value.trim().toLowerCase() || 'untitled pillar'
}

function generatedRowKey(row: NorthStarDisplayRow): string {
  return `${normalizeTabId(row.pillar)}:${normalizeTabId(row.north_star)}`
}

function defaultFinanceConstraint(input: MonthlyStarInput, metrics: MonthlyStarMetrics): string {
  const notes = input.dragging_channel_notes?.trim() || formatMonthlyStarDragChannelNotes(input.channel_deltas)
  const lift = Math.max(0, metrics.dailyNeeded - metrics.dailyPace)
  const liftPct = metrics.liftNeededPct === null ? null : `${Math.max(0, metrics.liftNeededPct).toFixed(1)}%`
  const liftText = `daily lift ${fmtCurrency(lift)}${liftPct ? ` (${liftPct})` : ''}`
  if (notes) return `${liftText}; dragging channels: ${notes}`
  if (metrics.onTrack) return `Sales pace is on track to monthly target; ${liftText}.`
  return `Projected sales are short of target by ${fmtCurrency(metrics.remainingToTarget)}; ${liftText}.`
}

function defaultFinanceWeeklyMove(metrics: MonthlyStarMetrics): string {
  if (metrics.onTrack) return `Protect projected close at ${fmtCurrency(metrics.projectedMonthEnd)}.`
  return `Close the ${fmtCurrency(metrics.remainingToTarget)} gap; daily need is ${fmtCurrency(metrics.dailyNeeded)}.`
}

function defaultFinanceLastWeek(metrics: MonthlyStarMetrics): string {
  if (metrics.yoyPct === null) return `MTD sales are ${fmtCurrency(metrics.yoyDelta)} versus last year.`
  return `MTD sales are ${fmtCurrency(metrics.yoyDelta)} versus last year (${metrics.yoyPct.toFixed(1)}%).`
}

function buildCashRunwayRow(
  snapshot: Pick<LeadershipToolSnapshot, 'cashflow'>,
  periodMonth: string,
  currentWeek: string,
  slotIndex: number
): NorthStarDisplayRow {
  const lastWeek = snapshot.cashflow.weeks[snapshot.cashflow.weeks.length - 1]
  const breachWeek = snapshot.cashflow.weeks.find(week => week.ending_cash_vs_floor < 0)

  return generatedLeadershipRow({
    periodMonth,
    currentWeek,
    slotIndex,
    northStar: '13-week cash runway',
    plan: `Cash floor ${fmtCurrency(snapshot.cashflow.minimum_cash_floor ?? 0)}`,
    actual: `Current ${fmtCurrency(snapshot.cashflow.current_cash_balance ?? 0)}`,
    forecast: lastWeek ? `Week ${lastWeek.week}: ${fmtCurrency(lastWeek.ending_cash)}` : 'No runway rows',
    constraint: breachWeek ? `Cash falls below floor in week ${breachWeek.week}.` : 'Cash remains above floor across 13 weeks.',
    move: breachWeek ? 'Pull forward cash actions before the floor breach.' : 'Maintain vendor payment discipline.',
    result: lastWeek ? `13-week ending cash vs floor: ${fmtCurrency(lastWeek.ending_cash_vs_floor)}.` : null,
    status: breachWeek ? 'off_plan' : 'on_plan',
  })
}

function buildPayrollRow(
  snapshot: Pick<LeadershipToolSnapshot, 'payroll'>,
  periodMonth: string,
  currentWeek: string,
  slotIndex: number
): NorthStarDisplayRow {
  const departments = snapshot.payroll.departments.filter(department => department.department !== 'Grand Total')
  const largestVariance = departments
    .map(department => ({ department, period: department.periods[0] }))
    .filter(item => item.period)
    .sort((a, b) => Math.abs(b.period.difference_pct ?? 0) - Math.abs(a.period.difference_pct ?? 0))[0]
  const total = snapshot.payroll.departments.find(department => department.department === 'Grand Total')?.periods[0]
  const variancePct = largestVariance?.period.difference_pct ?? null

  return generatedLeadershipRow({
    periodMonth,
    currentWeek,
    slotIndex,
    northStar: 'Payroll by department',
    plan: 'Payroll variance controlled by department',
    actual: largestVariance ? `${largestVariance.department.department}: ${formatPct(variancePct)}` : 'No payroll rows',
    forecast: total ? `Grand Total ${fmtCurrency(total.current_year)}` : 'Grand Total unavailable',
    constraint: largestVariance ? `${largestVariance.department.department} is the largest payroll variance.` : 'Payroll data has not been uploaded.',
    move: largestVariance ? `Review ${largestVariance.department.department} payroll drivers.` : 'Upload the leadership tool to refresh payroll.',
    result: total ? `Latest payroll total is ${fmtCurrency(total.current_year)}.` : null,
    status: variancePct !== null && variancePct > 0.25 ? 'at_risk' : 'on_plan',
  })
}

function buildPnlRow(
  snapshot: Pick<LeadershipToolSnapshot, 'pnl' | 'sales_simulation'>,
  periodMonth: string,
  currentWeek: string,
  slotIndex: number
): NorthStarDisplayRow {
  const simulation = snapshot.sales_simulation
  const noiPct = simulation.latest_noi_pct
  const needsSales = simulation.sales_needed_for_benchmark !== null && simulation.sales_needed_for_benchmark > 0

  return generatedLeadershipRow({
    periodMonth,
    currentWeek,
    slotIndex,
    northStar: 'PnL / 9% NOI',
    plan: `${formatPct(simulation.noi_benchmark_pct)} NOI benchmark`,
    actual: `${formatPct(noiPct)} NOI`,
    forecast: needsSales ? `${fmtCurrency(simulation.sales_needed_for_benchmark ?? 0)} to benchmark` : 'At / above benchmark',
    constraint: needsSales ? 'NOI is below the 9% benchmark.' : 'NOI is at or above the 9% benchmark.',
    move: needsSales ? 'Simulate sales and margin actions to close the NOI gap.' : 'Protect gross margin and expense discipline.',
    result: `Latest NOI is ${fmtCurrency(simulation.latest_noi)} on income of ${fmtCurrency(simulation.latest_income)}.`,
    status: needsSales ? 'at_risk' : 'on_plan',
  })
}

function generatedLeadershipRow({
  periodMonth,
  currentWeek,
  slotIndex,
  northStar,
  plan,
  actual,
  forecast,
  constraint,
  move,
  result,
  status,
}: {
  periodMonth: string
  currentWeek: string
  slotIndex: number
  northStar: string
  plan: string
  actual: string
  forecast: string
  constraint: string
  move: string
  result: string | null
  status: NorthStarStatus
}): NorthStarDisplayRow {
  return {
    id: null,
    is_set: false,
    is_locked: false,
    source: 'leadership_tool',
    period_month: periodMonth,
    period_week: currentWeek,
    slot_index: slotIndex,
    pillar: MONTHLY_STAR_FINANCE_PILLAR,
    owner: 'Ryan',
    north_star: northStar,
    plan_value: plan,
    actual_mtd: actual,
    forecast,
    constraint_now: constraint,
    weekly_move: move,
    last_week_result: result,
    status,
  }
}

function formatPct(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return 'n/a'
  return `${(value * 100).toFixed(1)}%`
}
