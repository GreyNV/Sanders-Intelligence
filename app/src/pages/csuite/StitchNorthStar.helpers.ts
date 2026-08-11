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
  ownerKey: string
  owner: string
  rows: NorthStarDisplayRow[]
}

export interface StitchPresenterOrderEntry {
  owner_key: string
  owner_name: string
  sort_index: number
}

export interface StitchPayrollSalesContext {
  currentMonthProjectedSales?: number | null
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
  snapshot: LeadershipFinanceSnapshot | null,
  periodMonth: string,
  currentWeek: string,
  payrollSalesContext: StitchPayrollSalesContext = {}
): NorthStarDisplayRow[] {
  if (!snapshot) return []

  const startSlot = nextNorthStarSlot(rows)
  return [
    buildCashRunwayRow(snapshot, periodMonth, currentWeek, startSlot),
    buildPayrollRow(snapshot, periodMonth, currentWeek, startSlot + 1, payrollSalesContext),
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

export function buildOwnerSlideDeck(rows: NorthStarDisplayRow[], presenterOrder: StitchPresenterOrderEntry[] = []): StitchOwnerDeck[] {
  const decks = new Map<string, NorthStarDisplayRow[]>()

  for (const row of rows) {
    for (const owner of splitOwners(row.owner)) {
      const ownerRows = decks.get(owner) ?? []
      ownerRows.push(row)
      decks.set(owner, ownerRows)
    }
  }

  const defaultDecks = [...decks.entries()]
    .sort(defaultOwnerSort)
    .map(([owner, ownerRows]) => ({
      ownerKey: stitchPresenterOrderKey(owner),
      owner,
      rows: [...ownerRows].sort((a, b) => a.slot_index - b.slot_index),
    }))
  const defaultIndexByKey = new Map(defaultDecks.map((deck, index) => [deck.ownerKey, index]))
  const orderIndexByKey = buildPresenterOrderIndex(presenterOrder)

  return [...defaultDecks].sort((left, right) => {
    const leftOrder = orderIndexByKey.get(left.ownerKey)
    const rightOrder = orderIndexByKey.get(right.ownerKey)

    if (leftOrder !== undefined && rightOrder !== undefined) return leftOrder - rightOrder
    if (leftOrder !== undefined) return -1
    if (rightOrder !== undefined) return 1

    return (defaultIndexByKey.get(left.ownerKey) ?? 0) - (defaultIndexByKey.get(right.ownerKey) ?? 0)
  })
}

export function stitchPresenterOrderKey(owner: string): string {
  return normalizeTabId(owner)
}

export function moveStitchPresenterOrder(
  decks: StitchOwnerDeck[],
  ownerKey: string,
  direction: -1 | 1
): StitchPresenterOrderEntry[] {
  const currentIndex = decks.findIndex(deck => deck.ownerKey === ownerKey)
  const nextIndex = currentIndex + direction

  if (currentIndex < 0 || nextIndex < 0 || nextIndex >= decks.length) {
    return presenterOrderPayload(decks)
  }

  const reorderedDecks = [...decks]
  const [deck] = reorderedDecks.splice(currentIndex, 1)
  reorderedDecks.splice(nextIndex, 0, deck)

  return presenterOrderPayload(reorderedDecks)
}

export function splitOwners(owner: string | null): string[] {
  const owners = (owner ?? '')
    .split(/\s*(?:\/|,|&|\band\b)\s*/i)
    .map(value => value.trim())
    .filter(Boolean)

  return owners.length > 0 ? owners : [STITCH_UNASSIGNED_OWNER]
}

function presenterOrderPayload(decks: StitchOwnerDeck[]): StitchPresenterOrderEntry[] {
  return decks.map((deck, sortIndex) => ({
    owner_key: deck.ownerKey,
    owner_name: deck.owner,
    sort_index: sortIndex,
  }))
}

function defaultOwnerSort([left]: [string, NorthStarDisplayRow[]], [right]: [string, NorthStarDisplayRow[]]): number {
  if (left === STITCH_UNASSIGNED_OWNER) return 1
  if (right === STITCH_UNASSIGNED_OWNER) return -1
  return left.localeCompare(right, undefined, { sensitivity: 'base' })
}

function buildPresenterOrderIndex(presenterOrder: StitchPresenterOrderEntry[]): Map<string, number> {
  const indexByKey = new Map<string, number>()
  const sortedOrder = [...presenterOrder]
    .filter(entry => entry.owner_key.trim() && Number.isFinite(entry.sort_index))
    .sort((left, right) => left.sort_index - right.sort_index)

  for (const entry of sortedOrder) {
    const key = entry.owner_key.trim().toLowerCase()
    if (!indexByKey.has(key)) indexByKey.set(key, indexByKey.size)
  }

  return indexByKey
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
  snapshot: Pick<LeadershipToolSnapshot, 'payroll' | 'pnl'>,
  periodMonth: string,
  currentWeek: string,
  slotIndex: number,
  salesContext: StitchPayrollSalesContext
): NorthStarDisplayRow {
  const weekProgress = monthWeekProgress(periodMonth, currentWeek)
  const projectionFactor = weekProgress.totalWeeks / weekProgress.elapsedWeeks
  const lastMonth = addMonthsToPeriod(periodMonth, -1)
  const currentMonthLabel = formatShortMonth(periodMonth)
  const lastMonthLabel = formatShortMonth(lastMonth)
  const departments = snapshot.payroll.departments.filter(department => department.department !== 'Grand Total')
  const totalDepartment = snapshot.payroll.departments.find(department => department.department === 'Grand Total') ?? null
  const income = findPnlAccount(snapshot, 'Income')
  const payrollPies = [
    buildPayrollPie(departments, totalDepartment, income, lastMonth, 'current_year', `${lastMonthLabel} this year`),
    buildPayrollPie(departments, totalDepartment, income, lastMonth, 'last_year', `${lastMonthLabel} last year`),
    buildPayrollPie(
      departments,
      totalDepartment,
      income,
      periodMonth,
      'current_year',
      `Projected ${currentMonthLabel} this year`,
      projectionFactor,
      salesContext.currentMonthProjectedSales
    ),
    buildPayrollPie(departments, totalDepartment, income, periodMonth, 'last_year', `${currentMonthLabel} last year`),
  ]
  const lastMonthThisYear = payrollPies[0]
  const lastMonthLastYear = payrollPies[1]
  const currentMonthThisYear = payrollPies[2]
  const currentMonthLastYear = payrollPies[3]
  const comparisonPoints = departments
    .map(department => ({ department: department.department, period: findExactPeriod(department.periods, periodMonth) }))
    .filter(hasPeriod)
    .map(item => ({
      label: item.department,
      currentValue: roundChartNumber(item.period.current_year * projectionFactor),
      previousValue: roundChartNumber(item.period.last_year),
    }))
  const isPayrollSalesRisk =
    currentMonthThisYear.payrollToSalesPct !== null &&
    currentMonthLastYear.payrollToSalesPct !== null &&
    currentMonthThisYear.payrollToSalesPct > currentMonthLastYear.payrollToSalesPct
  const actual = lastMonthThisYear.payrollToSalesPct !== null && lastMonthLastYear.payrollToSalesPct !== null
    ? `${lastMonthLabel} payroll was ${formatPct(lastMonthThisYear.payrollToSalesPct)} of sales vs ${formatPct(lastMonthLastYear.payrollToSalesPct)} LY`
    : `${lastMonthLabel} payroll/sales unavailable`
  const forecast = currentMonthThisYear.payrollToSalesPct !== null
    ? `Projected ${currentMonthLabel} payroll is ${formatPct(currentMonthThisYear.payrollToSalesPct)} of projected sales`
    : `Projected ${currentMonthLabel} payroll/sales unavailable`
  const constraint = currentMonthThisYear.payrollToSalesPct !== null && currentMonthLastYear.payrollToSalesPct !== null
    ? isPayrollSalesRisk
      ? `Projected ${currentMonthLabel} payroll/sales is above LY ${formatPct(currentMonthLastYear.payrollToSalesPct)}.`
      : `Projected ${currentMonthLabel} payroll/sales is at or below LY ${formatPct(currentMonthLastYear.payrollToSalesPct)}.`
    : 'Payroll or sales data is missing from the leadership tool.'
  const move = currentMonthThisYear.payrollToSalesPct !== null
    ? 'Use department mix and sales projection to adjust payroll before month end.'
    : 'Upload the leadership tool to refresh payroll and sales.'
  const result = currentMonthThisYear.salesTotal !== null
    ? `Projected ${currentMonthLabel} payroll is ${fmtCurrency(currentMonthThisYear.payrollTotal)} on projected sales of ${fmtCurrency(currentMonthThisYear.salesTotal)}.`
    : null

  return generatedLeadershipRow({
    periodMonth,
    currentWeek,
    slotIndex,
    northStar: 'Payroll by department',
    plan: 'Payroll as % of sales by department',
    actual,
    forecast,
    constraint,
    move,
    result,
    status: isPayrollSalesRisk ? 'at_risk' : 'on_plan',
    chart: {
      kind: 'payroll',
      valueFormat: 'currency',
      points: currentMonthThisYear.points,
      comparisonPoints,
      payrollPies,
    },
  })
}

type LeadershipPeriodValueKey = 'current_year' | 'last_year'
type LeadershipPayrollDepartmentRow = LeadershipToolSnapshot['payroll']['departments'][number]
type LeadershipPnlAccountRow = LeadershipToolSnapshot['pnl']['accounts'][number]
type LeadershipBudgetSalesRow = LeadershipToolSnapshot['budget']['sales'][number]
type LeadershipFinanceSnapshot = Pick<LeadershipToolSnapshot, 'cashflow' | 'payroll' | 'pnl' | 'sales_simulation'> & Partial<Pick<LeadershipToolSnapshot, 'budget'>>
type LeadershipPnlSnapshot = Pick<LeadershipToolSnapshot, 'pnl' | 'sales_simulation'> & Partial<Pick<LeadershipToolSnapshot, 'budget'>>

function buildPayrollPie(
  departments: LeadershipPayrollDepartmentRow[],
  totalDepartment: LeadershipPayrollDepartmentRow | null,
  income: LeadershipPnlAccountRow | null,
  periodMonth: string,
  valueKey: LeadershipPeriodValueKey,
  title: string,
  projectionFactor = 1,
  salesTotalOverride?: number | null
): NonNullable<NorthStarSlideChart['payrollPies']>[number] {
  const departmentPeriods = departments
    .map(department => ({ department, period: findExactPeriod(department.periods, periodMonth) }))
    .filter(hasPeriod)
  const points = departmentPeriods
    .map(item => ({
      label: item.department.department,
      value: roundChartNumber(item.period[valueKey] * projectionFactor),
    }))
  const totalPeriod = findExactPeriod(totalDepartment?.periods ?? [], periodMonth)
  const payrollTotalSource = totalPeriod?.[valueKey] ?? departmentPeriods.reduce((sum, item) => sum + item.period[valueKey], 0)
  const payrollTotal = roundChartNumber(payrollTotalSource * projectionFactor)
  const salesPeriod = findExactPeriod(income?.periods ?? [], periodMonth)
  const projectedSalesTotal = positiveChartNumber(salesTotalOverride)
  const salesTotal = projectedSalesTotal ?? (salesPeriod ? roundChartNumber(salesPeriod[valueKey] * projectionFactor) : null)

  return {
    title,
    periodMonth,
    projected: projectionFactor !== 1,
    payrollTotal,
    salesTotal,
    payrollToSalesPct: salesTotal !== null && salesTotal > 0 ? payrollTotal / salesTotal : null,
    points,
  }
}

function positiveChartNumber(value: number | null | undefined): number | null {
  if (value === null || value === undefined || !Number.isFinite(value) || value <= 0) return null
  return roundChartNumber(value)
}

function buildPnlRow(
  snapshot: LeadershipPnlSnapshot,
  periodMonth: string,
  currentWeek: string,
  slotIndex: number
): NorthStarDisplayRow {
  const benchmarkPct = snapshot.sales_simulation.noi_benchmark_pct || 0.09
  const forecastPath = buildPnlForecastPath(snapshot, benchmarkPct, periodMonth)
  const largestGapMonth = forecastPath.months
    .filter(month => month.salesGap !== null && month.salesGap > 0)
    .sort((left, right) => (right.salesGap ?? 0) - (left.salesGap ?? 0))[0] ?? null

  return generatedLeadershipRow({
    periodMonth,
    currentWeek,
    slotIndex,
    northStar: 'PnL / 9% NOI',
    plan: forecastPath.requiredMonthlySales > 0
      ? `${formatPct(benchmarkPct)} NOI requires ${fmtCurrency(forecastPath.requiredMonthlySales)} monthly sales`
      : `${formatPct(benchmarkPct)} NOI sales requirement needs expense data`,
    actual: pnlActualText(snapshot, forecastPath.latestFullMonth ?? forecastPath.latestActualMonth),
    forecast: pnlForecastSummary(forecastPath),
    constraint: pnlForecastConstraintText(forecastPath, benchmarkPct),
    move: largestGapMonth
      ? `Close the ${fmtCurrency(largestGapMonth.salesGap ?? 0)} ${largestGapMonth.label} sales gap to reach ${formatPct(benchmarkPct)} NOI.`
      : forecastPath.dataStatus === 'ready'
        ? `Protect budget-adjusted sales pace above ${formatPct(benchmarkPct)} NOI.`
        : 'Re-upload the Leadership Tool so BgtData can populate the 12-month NOI forecast.',
    result: pnlForecastResultText(forecastPath),
    status: forecastPath.dataStatus === 'ready' && forecastPath.belowTargetCount === 0 ? 'on_plan' : 'at_risk',
    chart: {
      kind: 'pnl',
      valueFormat: 'percent',
      benchmarkLabel: `${formatPct(benchmarkPct)} benchmark`,
      points: forecastPath.months.map(month => ({
        label: month.label,
        value: month.noiPct ?? benchmarkPct,
        benchmark: benchmarkPct,
        tone: month.status === 'on_plan' ? 'success' : 'danger',
      })),
      pnlForecast: forecastPath,
    },
  })
}

function buildPnlForecastPath(
  snapshot: Pick<LeadershipToolSnapshot, 'pnl'> & Partial<Pick<LeadershipToolSnapshot, 'budget'>>,
  benchmarkPct: number,
  periodMonth: string
): NonNullable<NorthStarSlideChart['pnlForecast']> {
  const income = findPnlAccount(snapshot, 'Income')
  const cogs = findPnlAccount(snapshot, 'COGS')
  const expense = findPnlAccount(snapshot, 'Expense')
  const latestActualMonth = latestActualIncomeMonth(income?.periods ?? []) ?? periodMonth
  const budgetRows = snapshot.budget?.sales ?? []
  const expenseBaseMonths = previousMonths(latestActualMonth, 4)
  const expenseValues = expenseBaseMonths.map(month => {
    const cogsValue = findExactPeriod(cogs?.periods ?? [], month)?.current_year ?? null
    const expenseValue = findExactPeriod(expense?.periods ?? [], month)?.current_year ?? null
    if (cogsValue === null && expenseValue === null) return null
    return (cogsValue ?? 0) + (expenseValue ?? 0)
  }).filter((value): value is number => value !== null)
  const populatedExpenseBaseMonths = expenseBaseMonths.filter(month => {
    const cogsValue = findExactPeriod(cogs?.periods ?? [], month)?.current_year ?? null
    const expenseValue = findExactPeriod(expense?.periods ?? [], month)?.current_year ?? null
    return cogsValue !== null || expenseValue !== null
  })
  const monthlyExpenseRunRate = expenseValues.length
    ? Math.abs(expenseValues.reduce((sum, value) => sum + value, 0)) / expenseValues.length
    : 0
  const requiredMonthlySales = monthlyExpenseRunRate > 0 && Number.isFinite(monthlyExpenseRunRate)
    ? monthlyExpenseRunRate / (1 - benchmarkPct)
    : 0
  const forecastStart = addMonthsToPeriod(latestActualMonth, 1)
  const forecastMonths = Array.from({ length: 12 }, (_, index) => addMonthsToPeriod(forecastStart, index))
  const latestFullMonth = latestFullNoiMonth(snapshot, latestActualMonth) ?? populatedExpenseBaseMonths[populatedExpenseBaseMonths.length - 1] ?? null
  const base = {
    benchmarkPct,
    latestActualMonth,
    latestFullMonth,
    expenseBaseMonths: populatedExpenseBaseMonths,
    monthlyExpenseRunRate: roundChartNumber(monthlyExpenseRunRate),
    annualExpenseRunRate: roundChartNumber(monthlyExpenseRunRate * 12),
    requiredMonthlySales: roundChartNumber(requiredMonthlySales),
  }

  if (monthlyExpenseRunRate <= 0 || !Number.isFinite(monthlyExpenseRunRate)) {
    return buildUnavailablePnlForecast({
      ...base,
      dataStatus: 'missing_expenses',
      warning: 'COGS + Expense data is missing for the full-month expense base.',
      months: forecastMonths,
    })
  }

  if (budgetRows.length === 0) {
    return buildUnavailablePnlForecast({
      ...base,
      dataStatus: 'missing_budget',
      warning: 'BgtData sales budget is missing from the current Leadership snapshot; re-upload the Leadership Tool now that budget parsing is live.',
      months: forecastMonths,
    })
  }

  const budgetByMonth = new Map(budgetRows.map(row => [row.month, row]))
  const budgetFulfillment = budgetFulfillmentPct(income?.periods ?? [], budgetByMonth, latestActualMonth)
  if (budgetFulfillment === null || budgetFulfillment <= 0) {
    return buildUnavailablePnlForecast({
      ...base,
      dataStatus: 'missing_budget_actuals',
      warning: 'Budget fulfillment cannot be calculated because no full months have both Income and BgtData sales budget.',
      months: forecastMonths,
    })
  }

  const months = forecastMonths.map(month => {
    const budgetSource = budgetForForecastMonth(month, budgetByMonth)
    const budgetedSales = budgetSource?.budgeted_sales ?? null
    if (budgetedSales === null || budgetedSales <= 0) {
      return buildUnavailablePnlForecastMonth(month, roundChartNumber(monthlyExpenseRunRate), roundChartNumber(requiredMonthlySales))
    }
    const forecastedSales = roundChartNumber(budgetedSales * budgetFulfillment)
    const noi = roundChartNumber(forecastedSales - monthlyExpenseRunRate)
    const noiPct = forecastedSales > 0 ? noi / forecastedSales : null
    const salesGap = Math.max(0, requiredMonthlySales - forecastedSales)
    const status: 'on_plan' | 'at_risk' = noiPct !== null && noiPct >= benchmarkPct ? 'on_plan' : 'at_risk'

    return {
      month,
      label: formatShortMonth(month),
      budgetSourceMonth: budgetSource?.month ?? month,
      budgetedSales,
      forecastedSales,
      expenses: roundChartNumber(monthlyExpenseRunRate),
      requiredSales: roundChartNumber(requiredMonthlySales),
      noi,
      noiPct,
      salesGap: roundChartNumber(salesGap),
      status,
    }
  })
  const missingForecastBudget = months.some(month => month.forecastedSales === null)
  if (missingForecastBudget) {
    return {
      ...buildUnavailablePnlForecast({
        ...base,
        dataStatus: 'missing_budget',
        warning: 'BgtData sales budget does not cover all 12 forecast months or the prior-year budget pattern.',
        months: forecastMonths,
      }),
      budgetFulfillmentPct: budgetFulfillment,
      months,
    }
  }

  const forecastSalesTotal = months.reduce((sum, month) => sum + (month.forecastedSales ?? 0), 0)
  const forecastNoiTotal = months.reduce((sum, month) => sum + (month.noi ?? 0), 0)
  const forecastNoiPct = forecastSalesTotal > 0 ? forecastNoiTotal / forecastSalesTotal : null
  const totalSalesGap = months.reduce((sum, month) => sum + (month.salesGap ?? 0), 0)
  const belowTargetCount = months.filter(month => month.status === 'at_risk').length

  return {
    dataStatus: 'ready',
    warning: null,
    benchmarkPct,
    latestActualMonth,
    latestFullMonth,
    expenseBaseMonths: populatedExpenseBaseMonths,
    monthlyExpenseRunRate: roundChartNumber(monthlyExpenseRunRate),
    annualExpenseRunRate: roundChartNumber(monthlyExpenseRunRate * 12),
    requiredMonthlySales: roundChartNumber(requiredMonthlySales),
    budgetFulfillmentPct: budgetFulfillment,
    forecastSalesTotal: roundChartNumber(forecastSalesTotal),
    forecastNoiTotal: roundChartNumber(forecastNoiTotal),
    forecastNoiPct,
    totalSalesGap: roundChartNumber(totalSalesGap),
    belowTargetCount,
    months,
  }
}

function buildUnavailablePnlForecast({
  dataStatus,
  warning,
  months,
  benchmarkPct,
  latestActualMonth,
  latestFullMonth,
  expenseBaseMonths,
  monthlyExpenseRunRate,
  annualExpenseRunRate,
  requiredMonthlySales,
}: {
  dataStatus: NonNullable<NorthStarSlideChart['pnlForecast']>['dataStatus']
  warning: string
  months: string[]
  benchmarkPct: number
  latestActualMonth: string
  latestFullMonth: string | null
  expenseBaseMonths: string[]
  monthlyExpenseRunRate: number
  annualExpenseRunRate: number
  requiredMonthlySales: number
}): NonNullable<NorthStarSlideChart['pnlForecast']> {
  return {
    dataStatus,
    warning,
    benchmarkPct,
    latestActualMonth,
    latestFullMonth,
    expenseBaseMonths,
    monthlyExpenseRunRate,
    annualExpenseRunRate,
    requiredMonthlySales,
    budgetFulfillmentPct: null,
    forecastSalesTotal: null,
    forecastNoiTotal: null,
    forecastNoiPct: null,
    totalSalesGap: null,
    belowTargetCount: 0,
    months: months.map(month => buildUnavailablePnlForecastMonth(month, monthlyExpenseRunRate, requiredMonthlySales)),
  }
}

function buildUnavailablePnlForecastMonth(month: string, expenses: number, requiredSales: number): NonNullable<NorthStarSlideChart['pnlForecast']>['months'][number] {
  return {
    month,
    label: formatShortMonth(month),
    budgetSourceMonth: null,
    budgetedSales: null,
    forecastedSales: null,
    expenses,
    requiredSales,
    noi: null,
    noiPct: null,
    salesGap: null,
    status: 'at_risk',
  }
}

function latestActualIncomeMonth(periods: Array<{ month: string; current_year: number }>): string | null {
  const months = periods
    .filter(period => period.month && period.current_year > 0)
    .map(period => period.month)
    .sort()
  return months[months.length - 1] ?? null
}

function previousMonths(month: string, count: number): string[] {
  return Array.from({ length: count }, (_, index) => addMonthsToPeriod(month, -(count - index)))
}

function budgetFulfillmentPct(
  incomePeriods: Array<{ month: string; current_year: number }>,
  budgetByMonth: Map<string, LeadershipBudgetSalesRow>,
  latestActualMonth: string
): number | null {
  const totals = incomePeriods
    .filter(period => period.month < latestActualMonth && period.current_year > 0)
    .reduce((sum, period) => {
      const budgetedSales = budgetByMonth.get(period.month)?.budgeted_sales ?? 0
      if (budgetedSales <= 0) return sum
      return {
        actual: sum.actual + period.current_year,
        budget: sum.budget + budgetedSales,
      }
    }, { actual: 0, budget: 0 })

  return totals.budget > 0 ? totals.actual / totals.budget : null
}

function budgetForForecastMonth(month: string, budgetByMonth: Map<string, LeadershipBudgetSalesRow>): LeadershipBudgetSalesRow | null {
  return budgetByMonth.get(month) ?? budgetByMonth.get(addMonthsToPeriod(month, -12)) ?? null
}

function latestActualNoiPct(snapshot: Pick<LeadershipToolSnapshot, 'pnl'>, month: string): number | null {
  const income = findExactPeriod(findPnlAccount(snapshot, 'Income')?.periods ?? [], month)
  const noi = findExactPeriod(findPnlAccount(snapshot, 'Grand Total', 'NOI')?.periods ?? [], month)
  return income && income.current_year > 0 && noi ? noi.current_year / income.current_year : null
}

function latestFullNoiMonth(snapshot: Pick<LeadershipToolSnapshot, 'pnl'>, latestActualMonth: string): string | null {
  const incomePeriods = findPnlAccount(snapshot, 'Income')?.periods ?? []
  const noiPeriods = findPnlAccount(snapshot, 'Grand Total', 'NOI')?.periods ?? []
  const months = incomePeriods
    .filter(period => period.month < latestActualMonth && period.current_year > 0 && findExactPeriod(noiPeriods, period.month))
    .map(period => period.month)
    .sort()
  return months[months.length - 1] ?? null
}

function pnlActualText(snapshot: Pick<LeadershipToolSnapshot, 'pnl'>, month: string | null): string {
  if (!month) return 'Full-month NOI unavailable'
  const actualNoiPct = latestActualNoiPct(snapshot, month)
  const monthLabel = formatShortMonth(month)
  return actualNoiPct === null ? `${monthLabel} NOI unavailable` : `${monthLabel} NOI was ${formatPct(actualNoiPct)}`
}

function pnlForecastSummary(forecast: NonNullable<NorthStarSlideChart['pnlForecast']>): string {
  if (forecast.dataStatus === 'ready') return `12-month forecast NOI is ${formatPct(forecast.forecastNoiPct)}`
  if (forecast.dataStatus === 'missing_expenses') return '12-month forecast needs COGS + Expense data'
  if (forecast.dataStatus === 'missing_budget_actuals') return '12-month forecast needs actual/budget overlap'
  return '12-month forecast needs BgtData sales budget'
}

function pnlForecastConstraintText(forecast: NonNullable<NorthStarSlideChart['pnlForecast']>, benchmarkPct: number): string {
  if (forecast.dataStatus !== 'ready') return forecast.warning ?? '12-month NOI forecast data is incomplete.'
  const belowTargetText = `${forecast.belowTargetCount} of ${forecast.months.length} months are below the ${formatPct(benchmarkPct)} NOI target`
  return `${belowTargetText}; total sales gap is ${fmtCurrency(forecast.totalSalesGap ?? 0)}.`
}

function pnlForecastResultText(forecast: NonNullable<NorthStarSlideChart['pnlForecast']>): string {
  const expenseBase = `Expense base uses ${formatMonthRange(forecast.expenseBaseMonths)}`
  if (forecast.dataStatus === 'ready') return `${expenseBase}; budget fulfillment is ${formatPct(forecast.budgetFulfillmentPct)}.`
  return `${expenseBase}; budget fulfillment is unavailable until BgtData is parsed.`
}

function formatMonthRange(months: string[]): string {
  if (months.length === 0) return 'no months'
  if (months.length === 1) return formatShortMonth(months[0])
  return `${formatShortMonth(months[0])}-${formatShortMonth(months[months.length - 1])}`
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
  const exactMatch = snapshot.pnl.accounts.find(account => normalizedLabels.includes(account.account.toLowerCase()))
  if (exactMatch) return exactMatch

  return snapshot.pnl.accounts.find(account => {
    const normalizedAccount = account.account.toLowerCase()
    return normalizedLabels.some(label => normalizedAccount.includes(label))
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
