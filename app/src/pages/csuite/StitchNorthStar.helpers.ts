import { fmtCurrency } from '@/lib/utils'
import type { LeadershipToolSnapshot, MonthlyStar, NorthStarStatus, SalesDaily } from '@/types'
import type { MonthlyStarInput, MonthlyStarMetrics, NorthStarDisplayRow, NorthStarEditableField, NorthStarSlideChart } from './NorthStar.helpers'
import { NORTH_STAR_EDITABLE_FIELDS, addMonthsToPeriod, formatMonthlyStarDragChannelNotes, formatPeriodMonth, nextNorthStarSlot } from './NorthStar.helpers'

export const STITCH_ALL_PILLARS_TAB = '__all__'
export const STITCH_UNASSIGNED_OWNER = 'Unassigned'
export const MONTHLY_STAR_FINANCE_PILLAR = 'Finance metrics'
export const MONTHLY_STAR_FINANCE_NORTH_STAR = 'Monthly sales target / MTD pace'
export const STITCH_AUTO_FINANCE_FIELDS = ['plan_value', 'actual_mtd', 'forecast'] as const satisfies readonly NorthStarEditableField[]
export const MONTHLY_STAR_PRESENTATION_OVERRIDE_STORAGE_KEY = 'sanders:stitch-monthly-star-presentation-overrides:v1'
export const STITCH_AUTO_ROW_OVERRIDE_STORAGE_KEY = 'sanders:stitch-auto-row-overrides:v1'

type StitchOverrideStorage = Pick<Storage, 'getItem' | 'setItem'>
export type StitchAutoRowOverrideSource = 'monthly_star' | 'leadership_tool'
export type StitchAutoRowOverrideValue = string | NorthStarStatus
export type StitchAutoRowOverrideMap = Record<string, Partial<Record<NorthStarEditableField, StitchAutoRowOverrideValue>>>
export type StitchAutoRowOverrideSourceVersions = Partial<Record<StitchAutoRowOverrideSource, string>>

interface StoredStitchAutoRowOverrideSource {
  sourceVersion: string
  rows: StitchAutoRowOverrideMap
}

type StoredStitchAutoRowOverrideMap = Record<string, Partial<Record<StitchAutoRowOverrideSource, StoredStitchAutoRowOverrideSource>>>

export interface MonthlyStarPresentationOverrides {
  status?: NorthStarStatus
  last_week_result?: string
}

export interface StitchPillarTab {
  id: string
  label: string
  count: number
}

export interface StitchOwnerDeck {
  owner: string
  rows: NorthStarDisplayRow[]
}

export function readMonthlyStarPresentationOverrides(
  periodMonth: string,
  storage: StitchOverrideStorage | null = browserLocalStorage()
): MonthlyStarPresentationOverrides {
  if (!storage) return {}
  return sanitizeMonthlyStarPresentationOverrides(readMonthlyStarPresentationOverrideMap(storage)[periodMonth])
}

export function writeMonthlyStarPresentationOverrides(
  periodMonth: string,
  overrides: MonthlyStarPresentationOverrides,
  storage: StitchOverrideStorage | null = browserLocalStorage()
): void {
  if (!storage) return
  const overrideMap = readMonthlyStarPresentationOverrideMap(storage)
  const existing = sanitizeMonthlyStarPresentationOverrides(overrideMap[periodMonth])
  overrideMap[periodMonth] = sanitizeMonthlyStarPresentationOverrides({ ...existing, ...overrides })
  storage.setItem(MONTHLY_STAR_PRESENTATION_OVERRIDE_STORAGE_KEY, JSON.stringify(overrideMap))
}

export function stitchAutoRowOverrideKey(row: Pick<NorthStarDisplayRow, 'source' | 'north_star'> & { chart?: Pick<NorthStarSlideChart, 'kind'> | null }): string {
  const source = row.source ?? 'persisted'
  const identity = row.chart?.kind ?? normalizeTabId(row.north_star)
  return `${source}:${identity}`
}

export function stitchSlideHtmlKey(row: Pick<NorthStarDisplayRow, 'id' | 'source' | 'slot_index' | 'pillar' | 'north_star'> & { chart?: Pick<NorthStarSlideChart, 'kind'> | null }): string {
  if (row.id) return `row:${row.id}`
  if (row.source === 'monthly_star' || row.source === 'leadership_tool') return `auto:${stitchAutoRowOverrideKey(row)}`
  return `slot:${row.slot_index}:${normalizeTabId(row.pillar)}:${normalizeTabId(row.north_star)}`
}

export function monthlyStarOverrideSourceVersion(
  periodMonth: string,
  monthlyStar: Pick<MonthlyStar, 'updated_at'> | null,
  salesRows?: {
    current?: Array<Pick<SalesDaily, 'synced_at' | 'revenue'>>
    previousYear?: Array<Pick<SalesDaily, 'synced_at' | 'revenue'>>
  } | null
): string {
  const currentRows = salesRows?.current ?? []
  const previousRows = salesRows?.previousYear ?? []
  const allSalesRows = [...currentRows, ...previousRows]

  return [
    'monthly_star',
    periodMonth,
    monthlyStar?.updated_at ?? 'no-monthly-star',
    latestSyncedAt(allSalesRows) ?? 'no-sales-sync',
    currentRows.length,
    roundVersionNumber(sumRevenue(currentRows)),
    previousRows.length,
    roundVersionNumber(sumRevenue(previousRows)),
  ].join('|')
}

export function leadershipToolOverrideSourceVersion(snapshot: Pick<LeadershipToolSnapshot, 'uploaded_at' | 'filename'> | null | undefined): string {
  return ['leadership_tool', snapshot?.uploaded_at ?? 'no-upload', snapshot?.filename ?? 'no-file'].join('|')
}

export function readStitchAutoRowOverrides(
  periodMonth: string,
  sourceVersions: StitchAutoRowOverrideSourceVersions,
  storage: StitchOverrideStorage | null = browserLocalStorage()
): StitchAutoRowOverrideMap {
  if (!storage) return {}
  const overrideMap = readStitchAutoRowOverrideMap(storage)
  const periodOverrides = overrideMap[periodMonth]
  if (!periodOverrides) return {}

  const result: StitchAutoRowOverrideMap = {}
  for (const source of stitchAutoRowOverrideSources()) {
    const expectedSourceVersion = sourceVersions[source]
    const sourceOverrides = periodOverrides[source]
    if (!expectedSourceVersion || !sourceOverrides || sourceOverrides.sourceVersion !== expectedSourceVersion) continue
    Object.assign(result, sanitizeStitchAutoRowOverrideRows(sourceOverrides.rows))
  }

  return result
}

export function writeStitchAutoRowOverride(
  periodMonth: string,
  source: StitchAutoRowOverrideSource,
  sourceVersion: string,
  rowKey: string,
  field: NorthStarEditableField,
  value: StitchAutoRowOverrideValue,
  storage: StitchOverrideStorage | null = browserLocalStorage()
): void {
  if (!storage) return

  const overrideMap = readStitchAutoRowOverrideMap(storage)
  const periodOverrides = overrideMap[periodMonth] ?? {}
  const existingSourceOverrides = sanitizeStoredStitchAutoRowOverrideSource(periodOverrides[source])
  const sourceRows = existingSourceOverrides?.sourceVersion === sourceVersion ? existingSourceOverrides.rows : {}
  const existingRowOverrides = sourceRows[rowKey] ?? {}

  periodOverrides[source] = {
    sourceVersion,
    rows: {
      ...sourceRows,
      [rowKey]: sanitizeStitchAutoRowOverrideRow({
        ...existingRowOverrides,
        [field]: value,
      }),
    },
  }
  overrideMap[periodMonth] = periodOverrides
  storage.setItem(STITCH_AUTO_ROW_OVERRIDE_STORAGE_KEY, JSON.stringify(overrideMap))
}

export function scaledChartDomain(values: number[]): { min: number; max: number } {
  const finiteValues = values.filter(value => Number.isFinite(value))
  if (finiteValues.length === 0) return { min: 0, max: 1 }

  const min = Math.min(...finiteValues)
  const max = Math.max(...finiteValues)
  const spread = max - min
  const padding = spread > 0 ? spread * 0.1 : Math.max(1, Math.abs(max) * 0.1)

  return {
    min: roundChartNumber(min - padding),
    max: roundChartNumber(max + padding),
  }
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
    chart: {
      kind: 'sales',
      valueFormat: 'currency',
      points: [
        { label: 'MTD', value: input.mtd_actual },
        { label: 'Projected', value: metrics.projectedMonthEnd },
        { label: 'Target', value: input.target_sales },
      ],
    },
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
    chart: {
      kind: 'cash_runway',
      valueFormat: 'currency',
      threshold: snapshot.cashflow.minimum_cash_floor ?? 0,
      benchmarkLabel: 'Cash floor',
      points: snapshot.cashflow.weeks.map(week => ({
        label: `W${week.week}`,
        value: week.ending_cash,
        benchmark: snapshot.cashflow.minimum_cash_floor ?? 0,
        tone: week.ending_cash >= (snapshot.cashflow.minimum_cash_floor ?? 0) ? 'success' : 'danger',
      })),
    },
  })
}

function buildPayrollRow(
  snapshot: Pick<LeadershipToolSnapshot, 'payroll'>,
  periodMonth: string,
  currentWeek: string,
  slotIndex: number
): NorthStarDisplayRow {
  const targetMonth = periodMonth
  const weekProgress = monthWeekProgress(periodMonth, currentWeek)
  const departments = snapshot.payroll.departments.filter(department => department.department !== 'Grand Total')
  const largestVariance = departments
    .map(department => ({ department, period: findPeriodForMonth(department.periods, targetMonth) }))
    .filter(hasPeriod)
    .sort((a, b) => Math.abs(b.period.difference_pct ?? 0) - Math.abs(a.period.difference_pct ?? 0))[0]
  const total = findPeriodForMonth(snapshot.payroll.departments.find(department => department.department === 'Grand Total')?.periods ?? [], targetMonth)
  const variancePct = largestVariance?.period.difference_pct ?? null
  const resultMonth = formatShortMonth(total?.month || largestVariance?.period.month || targetMonth)
  const chartPoints = departments
    .map(department => ({ department: department.department, period: findPeriodForMonth(department.periods, targetMonth) }))
    .filter(hasPeriod)
    .sort((a, b) => Math.abs(b.period.current_year) - Math.abs(a.period.current_year))
    .map(item => ({ label: item.department, value: item.period.current_year }))
  const comparisonPoints = departments
    .map(department => ({ department: department.department, period: findPeriodForMonth(department.periods, targetMonth) }))
    .filter(hasPeriod)
    .map(item => ({ label: item.department, currentValue: item.period.current_year, previousValue: item.period.last_year }))
  const projectedTotal = total ? (total.current_year / weekProgress.elapsedWeeks) * weekProgress.totalWeeks : null

  return generatedLeadershipRow({
    periodMonth,
    currentWeek,
    slotIndex,
    northStar: 'Payroll by department',
    plan: 'Payroll variance controlled by department',
    actual: largestVariance ? `${largestVariance.department.department}: ${formatPct(variancePct)}` : 'No payroll rows',
    forecast: projectedTotal !== null ? `Projected Grand Total ${fmtCurrency(projectedTotal)}` : 'Grand Total unavailable',
    constraint: largestVariance ? `${largestVariance.department.department} is the largest payroll variance.` : 'Payroll data has not been uploaded.',
    move: largestVariance ? `Review ${largestVariance.department.department} payroll drivers.` : 'Upload the leadership tool to refresh payroll.',
    result: total ? `${resultMonth} payroll actual is ${fmtCurrency(total.current_year)}; projected from ${weekProgress.elapsedWeeks} of ${weekProgress.totalWeeks} weeks.` : null,
    status: variancePct !== null && variancePct > 0.25 ? 'at_risk' : 'on_plan',
    chart: {
      kind: 'payroll',
      valueFormat: 'currency',
      points: chartPoints,
      comparisonPoints,
    },
  })
}

function buildPnlRow(
  snapshot: Pick<LeadershipToolSnapshot, 'pnl' | 'sales_simulation'>,
  periodMonth: string,
  currentWeek: string,
  slotIndex: number
): NorthStarDisplayRow {
  const benchmarkPct = snapshot.sales_simulation.noi_benchmark_pct || 0.09
  const actualMonth = addMonthsToPeriod(periodMonth, -1)
  const income = findPnlAccount(snapshot, 'Income')
  const grandTotal = findPnlAccount(snapshot, 'Grand Total', 'NOI')
  const actualIncome = findPeriodForMonth(income?.periods ?? [], actualMonth)
  const actualNoi = findPeriodForMonth(grandTotal?.periods ?? [], actualMonth)
  const actualNoiPct = actualIncome && actualIncome.current_year > 0 && actualNoi ? actualNoi.current_year / actualIncome.current_year : snapshot.sales_simulation.latest_noi_pct
  const forecastIncome = findPeriodForMonth(income?.periods ?? [], periodMonth)
  const forecastNoi = findPeriodForMonth(grandTotal?.periods ?? [], periodMonth)
  const forecastNoiValue = forecastNoi?.last_year ?? null
  const forecastIncomeValue = forecastIncome?.last_year ?? null
  const forecastNoiPct = forecastIncomeValue && forecastIncomeValue > 0 && forecastNoiValue !== null ? forecastNoiValue / forecastIncomeValue : null
  const needsAction = forecastNoiPct === null || forecastNoiPct < benchmarkPct
  const actualMonthLabel = formatShortMonth(actualNoi?.month || actualIncome?.month || actualMonth)
  const forecastMonthLabel = formatShortMonth(forecastNoi?.month || forecastIncome?.month || periodMonth)
  const benchmarkLabel = formatPct(benchmarkPct)

  return generatedLeadershipRow({
    periodMonth,
    currentWeek,
    slotIndex,
    northStar: 'PnL / 9% NOI',
    plan: `${benchmarkLabel} NOI benchmark`,
    actual: `${formatPct(actualNoiPct)} NOI`,
    forecast: forecastNoiValue !== null ? `${fmtCurrency(forecastNoiValue)} forecast NOI` : 'Last year NOI unavailable',
    constraint: pnlForecastConstraint(forecastNoiPct, benchmarkLabel, needsAction),
    move: needsAction ? `Use last year's ${forecastMonthLabel} NOI baseline to define margin actions.` : `Use last year's ${forecastMonthLabel} NOI baseline and protect margin discipline.`,
    result: actualNoi && actualIncome ? `${actualMonthLabel} NOI was ${fmtCurrency(actualNoi.current_year)} on income of ${fmtCurrency(actualIncome.current_year)}.` : null,
    status: needsAction ? 'at_risk' : 'on_plan',
    chart: {
      kind: 'pnl',
      valueFormat: 'percent',
      benchmarkLabel: `${benchmarkLabel} benchmark`,
      points: [
        { label: 'Last month', value: actualNoiPct ?? 0, benchmark: benchmarkPct },
        { label: 'Forecast', value: forecastNoiPct ?? 0, benchmark: benchmarkPct },
        { label: 'Benchmark', value: benchmarkPct, benchmark: benchmarkPct },
      ],
    },
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
  chart,
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
  chart?: NorthStarSlideChart
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
    chart,
  }
}

function formatPct(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return 'n/a'
  return `${(value * 100).toFixed(1)}%`
}

function findPeriodForMonth<T extends { month: string }>(periods: T[], month: string): T | null {
  return findExactPeriod(periods, month) ?? (periods
    .filter(period => period.month && period.month < month)
    .sort((left, right) => right.month.localeCompare(left.month))[0] ?? periods[0] ?? null)
}

function findExactPeriod<T extends { month: string }>(periods: T[], month: string): T | null {
  const periodKey = month.slice(0, 7)
  return periods.find(period => period.month === month || period.month.slice(0, 7) === periodKey) ?? null
}

function findPnlAccount(snapshot: Pick<LeadershipToolSnapshot, 'pnl'>, ...labels: string[]) {
  const normalizedLabels = labels.map(label => label.toLowerCase())
  return snapshot.pnl.accounts.find(account => {
    const normalizedAccount = account.account.toLowerCase()
    return normalizedLabels.some(label => normalizedAccount === label || normalizedAccount.includes(label))
  }) ?? null
}

function hasPeriod<T extends { period: unknown }>(item: T): item is T & { period: NonNullable<T['period']> } {
  return Boolean(item.period)
}

function formatShortMonth(periodMonth: string): string {
  return formatPeriodMonth(periodMonth).split(' ')[0]
}

function monthWeekProgress(periodMonth: string, currentWeek: string): { elapsedWeeks: number; totalWeeks: number } {
  const monthStart = new Date(`${periodMonth}T00:00:00Z`)
  const nextMonthStart = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 1))
  const currentWeekStart = new Date(`${currentWeek}T00:00:00Z`)
  const currentWeekEnd = new Date(currentWeekStart)
  currentWeekEnd.setUTCDate(currentWeekEnd.getUTCDate() + 7)

  const daysInMonth = daysBetween(monthStart, nextMonthStart)
  const elapsedDays = Math.min(daysInMonth, Math.max(1, daysBetween(monthStart, currentWeekEnd)))
  const totalWeeks = Math.max(1, Math.ceil(daysInMonth / 7))
  const elapsedWeeks = Math.min(totalWeeks, Math.max(1, Math.ceil(elapsedDays / 7)))

  return { elapsedWeeks, totalWeeks }
}

function daysBetween(start: Date, end: Date): number {
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 86_400_000))
}

function roundChartNumber(value: number): number {
  return Number(value.toFixed(2))
}

function browserLocalStorage(): StitchOverrideStorage | null {
  if (typeof window === 'undefined') return null
  return window.localStorage
}

function readMonthlyStarPresentationOverrideMap(storage: StitchOverrideStorage): Record<string, MonthlyStarPresentationOverrides> {
  const raw = storage.getItem(MONTHLY_STAR_PRESENTATION_OVERRIDE_STORAGE_KEY)
  if (!raw) return {}

  try {
    const parsed = JSON.parse(raw)
    return typeof parsed === 'object' && parsed !== null ? parsed : {}
  } catch {
    return {}
  }
}

function sanitizeMonthlyStarPresentationOverrides(value: unknown): MonthlyStarPresentationOverrides {
  if (typeof value !== 'object' || value === null) return {}
  const candidate = value as MonthlyStarPresentationOverrides
  const sanitized: MonthlyStarPresentationOverrides = {}

  if (candidate.status === 'on_plan' || candidate.status === 'at_risk' || candidate.status === 'off_plan') {
    sanitized.status = candidate.status
  }
  if (typeof candidate.last_week_result === 'string') {
    sanitized.last_week_result = candidate.last_week_result
  }

  return sanitized
}

function readStitchAutoRowOverrideMap(storage: StitchOverrideStorage): StoredStitchAutoRowOverrideMap {
  const raw = storage.getItem(STITCH_AUTO_ROW_OVERRIDE_STORAGE_KEY)
  if (!raw) return {}

  try {
    const parsed = JSON.parse(raw)
    return typeof parsed === 'object' && parsed !== null ? parsed : {}
  } catch {
    return {}
  }
}

function sanitizeStoredStitchAutoRowOverrideSource(value: unknown): StoredStitchAutoRowOverrideSource | null {
  if (typeof value !== 'object' || value === null) return null
  const candidate = value as StoredStitchAutoRowOverrideSource
  if (typeof candidate.sourceVersion !== 'string') return null

  return {
    sourceVersion: candidate.sourceVersion,
    rows: sanitizeStitchAutoRowOverrideRows(candidate.rows),
  }
}

function sanitizeStitchAutoRowOverrideRows(value: unknown): StitchAutoRowOverrideMap {
  if (typeof value !== 'object' || value === null) return {}

  const sanitized: StitchAutoRowOverrideMap = {}
  for (const [rowKey, rowOverrides] of Object.entries(value as Record<string, unknown>)) {
    if (typeof rowKey !== 'string' || rowKey.trim().length === 0) continue
    const sanitizedRow = sanitizeStitchAutoRowOverrideRow(rowOverrides)
    if (Object.keys(sanitizedRow).length > 0) {
      sanitized[rowKey] = sanitizedRow
    }
  }

  return sanitized
}

function sanitizeStitchAutoRowOverrideRow(value: unknown): Partial<Record<NorthStarEditableField, StitchAutoRowOverrideValue>> {
  if (typeof value !== 'object' || value === null) return {}

  const allowedFields = new Set<NorthStarEditableField>(NORTH_STAR_EDITABLE_FIELDS)
  const sanitized: Partial<Record<NorthStarEditableField, StitchAutoRowOverrideValue>> = {}
  for (const [field, fieldValue] of Object.entries(value as Record<string, unknown>)) {
    if (!allowedFields.has(field as NorthStarEditableField)) continue
    if (field === 'status') {
      if (fieldValue === 'on_plan' || fieldValue === 'at_risk' || fieldValue === 'off_plan') {
        sanitized.status = fieldValue
      }
      continue
    }
    if (typeof fieldValue === 'string') {
      sanitized[field as NorthStarEditableField] = fieldValue
    }
  }

  return sanitized
}

function stitchAutoRowOverrideSources(): StitchAutoRowOverrideSource[] {
  return ['monthly_star', 'leadership_tool']
}

function latestSyncedAt(rows: Array<Pick<SalesDaily, 'synced_at'>>): string | null {
  const syncedDates = rows
    .map(row => row.synced_at)
    .filter((value): value is string => typeof value === 'string' && value.length > 0)
    .sort()
  return syncedDates.length > 0 ? syncedDates[syncedDates.length - 1] : null
}

function sumRevenue(rows: Array<Pick<SalesDaily, 'revenue'>>): number {
  return rows.reduce((sum, row) => sum + Number(row.revenue ?? 0), 0)
}

function roundVersionNumber(value: number): string {
  return Number.isFinite(value) ? value.toFixed(2) : '0.00'
}

function pnlForecastConstraint(forecastNoiPct: number | null, benchmarkLabel: string, needsAction: boolean): string {
  if (forecastNoiPct === null) return "Last year's same-month NOI is unavailable."
  const comparison = needsAction ? 'below' : 'at or above'
  return `Last year's same-month NOI was ${formatPct(forecastNoiPct)}, ${comparison} the ${benchmarkLabel} benchmark.`
}
