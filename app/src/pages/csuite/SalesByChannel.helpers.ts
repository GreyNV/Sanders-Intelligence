export const ADD_MAPPING_CHANNEL = 'Add mapping'

export type SalesChannelStatus = 'on_track' | 'needs_lift' | 'no_goal' | 'add_mapping'
export type SalesByChannelSortKey = 'channel' | 'mtd_revenue' | 'goal_amount' | 'projected_month_end' | 'daily_lift' | 'status'
export type SalesByChannelSortDirection = 'asc' | 'desc'

export interface SalesByChannelSortConfig {
  key: SalesByChannelSortKey
  direction: SalesByChannelSortDirection
}

export interface SalesByChannelSalesRow {
  sale_date: string
  raw_company: string | null
  raw_channel: string | null
  channel: string | null
  revenue: number
  orders_count?: number | null
}

export interface SalesChannelMappingInput {
  sellercloud_company: string
  sellercloud_channel: string
  normalized_company: string | null
  normalized_channel: string | null
  qb_channel: string
  is_active: boolean
}

export interface SalesChannelGoalInput {
  period_month: string
  qb_channel: string
  goal_amount: number
}

export interface SalesByChannelRow {
  channel: string
  mtd_revenue: number
  ly_mtd_revenue: number
  yoy_delta: number
  goal_amount: number | null
  daily_pace: number
  projected_month_end: number
  remaining_to_goal: number | null
  daily_needed: number | null
  daily_lift: number | null
  status: SalesChannelStatus
  requires_mapping: boolean
}

export interface UnmappedSalesChannelPair {
  sellercloud_company: string
  sellercloud_channel: string
  normalized_company: string
  normalized_channel: string
  mtd_revenue: number
  ly_mtd_revenue: number
  row_count: number
  orders_count: number
}

export interface SalesByChannelResult {
  period_month: string
  rows: SalesByChannelRow[]
  unmappedSourcePairs: UnmappedSalesChannelPair[]
}

export function normalizeSalesChannelValue(value: unknown): string {
  return String(value ?? '').trim().replace(/\s+/g, ' ').toLowerCase()
}

export function mappingKey(company: unknown, channel: unknown): string {
  return `${normalizeSalesChannelValue(company)}|${normalizeSalesChannelValue(channel)}`
}

export function deriveSalesByChannel({
  periodMonth,
  rows,
  previousYearRows,
  mappings,
  goals,
  daysElapsed,
  daysRemaining,
}: {
  periodMonth: string
  rows: SalesByChannelSalesRow[]
  previousYearRows: SalesByChannelSalesRow[]
  mappings: SalesChannelMappingInput[]
  goals: SalesChannelGoalInput[]
  daysElapsed: number
  daysRemaining: number
}): SalesByChannelResult {
  const mappingByKey = activeMappingIndex(mappings)
  const goalsByChannel = new Map(
    goals
      .filter(goal => goal.period_month === periodMonth)
      .map(goal => [normalizeSalesChannelValue(goal.qb_channel), Number(goal.goal_amount ?? 0)])
  )
  const byChannel = new Map<string, SalesByChannelRow>()
  const unmappedByKey = new Map<string, UnmappedSalesChannelPair>()

  for (const row of rows) {
    const source = sourcePair(row)
    const mapping = mappingByKey.get(mappingKey(source.company, source.channel))
    const channel = mapping?.qb_channel || ADD_MAPPING_CHANNEL
    const aggregate = ensureChannelRow(byChannel, channel, goalsByChannel, daysElapsed, daysRemaining)
    aggregate.mtd_revenue = roundCurrency(aggregate.mtd_revenue + Number(row.revenue || 0))

    if (!mapping) {
      const unmapped = ensureUnmappedPair(unmappedByKey, source.company, source.channel)
      unmapped.mtd_revenue = roundCurrency(unmapped.mtd_revenue + Number(row.revenue || 0))
      unmapped.row_count += 1
      unmapped.orders_count += Number(row.orders_count ?? 0)
    }
  }

  for (const row of previousYearRows) {
    const source = sourcePair(row)
    const mapping = mappingByKey.get(mappingKey(source.company, source.channel))
    const channel = mapping?.qb_channel || ADD_MAPPING_CHANNEL
    const aggregate = ensureChannelRow(byChannel, channel, goalsByChannel, daysElapsed, daysRemaining)
    aggregate.ly_mtd_revenue = roundCurrency(aggregate.ly_mtd_revenue + Number(row.revenue || 0))

    if (!mapping) {
      const unmapped = ensureUnmappedPair(unmappedByKey, source.company, source.channel)
      unmapped.ly_mtd_revenue = roundCurrency(unmapped.ly_mtd_revenue + Number(row.revenue || 0))
    }
  }

  const outputRows = Array.from(byChannel.values()).map(row => finalizeChannelRow(row, daysElapsed, daysRemaining))
  const unmappedSourcePairs = Array.from(unmappedByKey.values())
    .filter(pair => pair.mtd_revenue > 0 || pair.ly_mtd_revenue > 0)
    .sort((a, b) => a.sellercloud_company.localeCompare(b.sellercloud_company) || a.sellercloud_channel.localeCompare(b.sellercloud_channel))

  return {
    period_month: periodMonth,
    rows: outputRows.sort(compareChannelRows),
    unmappedSourcePairs,
  }
}

export function sortSalesByChannelRows(rows: SalesByChannelRow[], sort: SalesByChannelSortConfig): SalesByChannelRow[] {
  return [...rows].sort((a, b) => {
    if (a.requires_mapping !== b.requires_mapping) return a.requires_mapping ? 1 : -1

    const compared = compareBySortKey(a, b, sort)
    if (compared !== 0) return compared
    return a.channel.localeCompare(b.channel)
  })
}

function activeMappingIndex(mappings: SalesChannelMappingInput[]): Map<string, SalesChannelMappingInput> {
  const index = new Map<string, SalesChannelMappingInput>()
  for (const mapping of mappings) {
    if (!mapping.is_active) continue
    const company = mapping.normalized_company || mapping.sellercloud_company
    const channel = mapping.normalized_channel || mapping.sellercloud_channel
    index.set(mappingKey(company, channel), mapping)
  }
  return index
}

function sourcePair(row: SalesByChannelSalesRow): { company: string; channel: string } {
  const company = cleanSourceValue(row.raw_company) || 'Unassigned'
  const channel = cleanSourceValue(row.raw_channel) || cleanSourceValue(row.channel) || 'Unassigned'
  return { company, channel }
}

function cleanSourceValue(value: unknown): string {
  return String(value ?? '').trim().replace(/\s+/g, ' ')
}

function ensureChannelRow(
  byChannel: Map<string, SalesByChannelRow>,
  channel: string,
  goalsByChannel: Map<string, number>,
  daysElapsed: number,
  daysRemaining: number
): SalesByChannelRow {
  const existing = byChannel.get(channel)
  if (existing) return existing

  const goal = channel === ADD_MAPPING_CHANNEL ? null : goalsByChannel.get(normalizeSalesChannelValue(channel)) ?? null
  const row: SalesByChannelRow = {
    channel,
    mtd_revenue: 0,
    ly_mtd_revenue: 0,
    yoy_delta: 0,
    goal_amount: goal,
    daily_pace: 0,
    projected_month_end: 0,
    remaining_to_goal: goal,
    daily_needed: goal == null ? null : safeDivide(goal, Math.max(1, daysElapsed + daysRemaining)),
    daily_lift: goal == null ? null : 0,
    status: channel === ADD_MAPPING_CHANNEL ? 'add_mapping' : goal == null ? 'no_goal' : 'needs_lift',
    requires_mapping: channel === ADD_MAPPING_CHANNEL,
  }
  byChannel.set(channel, row)
  return row
}

function ensureUnmappedPair(
  unmappedByKey: Map<string, UnmappedSalesChannelPair>,
  company: string,
  channel: string
): UnmappedSalesChannelPair {
  const key = mappingKey(company, channel)
  const existing = unmappedByKey.get(key)
  if (existing) return existing

  const row = {
    sellercloud_company: company,
    sellercloud_channel: channel,
    normalized_company: normalizeSalesChannelValue(company),
    normalized_channel: normalizeSalesChannelValue(channel),
    mtd_revenue: 0,
    ly_mtd_revenue: 0,
    row_count: 0,
    orders_count: 0,
  }
  unmappedByKey.set(key, row)
  return row
}

function finalizeChannelRow(row: SalesByChannelRow, daysElapsed: number, daysRemaining: number): SalesByChannelRow {
  const elapsed = Math.max(0, daysElapsed)
  const remaining = Math.max(0, daysRemaining)
  const dailyPace = elapsed > 0 ? row.mtd_revenue / elapsed : 0
  const projectedMonthEnd = row.mtd_revenue + dailyPace * remaining
  const remainingToGoal = row.goal_amount == null ? null : Math.max(0, row.goal_amount - row.mtd_revenue)
  const dailyNeeded = remainingToGoal == null ? null : remaining > 0 ? remainingToGoal / remaining : remainingToGoal
  const dailyLift = dailyNeeded == null ? null : Math.max(0, dailyNeeded - dailyPace)

  return {
    ...row,
    yoy_delta: roundCurrency(row.mtd_revenue - row.ly_mtd_revenue),
    daily_pace: roundCurrency(dailyPace),
    projected_month_end: roundCurrency(projectedMonthEnd),
    remaining_to_goal: remainingToGoal == null ? null : roundCurrency(remainingToGoal),
    daily_needed: dailyNeeded == null ? null : roundCurrency(dailyNeeded),
    daily_lift: dailyLift == null ? null : roundCurrency(dailyLift),
    status: row.requires_mapping
      ? 'add_mapping'
      : row.goal_amount == null ? 'no_goal' : projectedMonthEnd >= row.goal_amount ? 'on_track' : 'needs_lift',
  }
}

function compareChannelRows(a: SalesByChannelRow, b: SalesByChannelRow): number {
  if (a.requires_mapping !== b.requires_mapping) return a.requires_mapping ? 1 : -1
  return a.channel.localeCompare(b.channel)
}

function compareBySortKey(a: SalesByChannelRow, b: SalesByChannelRow, sort: SalesByChannelSortConfig): number {
  if (sort.key === 'channel') return directionalCompare(a.channel.localeCompare(b.channel), sort.direction)
  if (sort.key === 'status') return directionalCompare(a.status.localeCompare(b.status), sort.direction)
  return compareNullableNumbers(numericSortValue(a, sort.key), numericSortValue(b, sort.key), sort.direction)
}

function numericSortValue(row: SalesByChannelRow, key: SalesByChannelSortKey): number | null {
  if (key === 'channel' || key === 'status') return null
  return row[key]
}

function compareNullableNumbers(a: number | null, b: number | null, direction: SalesByChannelSortDirection): number {
  if (a == null && b == null) return 0
  if (a == null) return 1
  if (b == null) return -1
  return directionalCompare(a - b, direction)
}

function directionalCompare(value: number, direction: SalesByChannelSortDirection): number {
  return direction === 'asc' ? value : -value
}

function safeDivide(value: number, denominator: number): number {
  return denominator > 0 ? value / denominator : 0
}

function roundCurrency(value: number): number {
  return Number(value.toFixed(2))
}
