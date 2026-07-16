import { describe, expect, it } from 'vitest'
import { computeMonthlyStarMetrics, mergeNorthStarRows } from '../pages/csuite/NorthStar.helpers'
import {
  MONTHLY_STAR_FINANCE_PILLAR,
  STITCH_AUTO_FINANCE_FIELDS,
  STITCH_ALL_PILLARS_TAB,
  buildLeadershipFinanceRows,
  buildOwnerSlideDeck,
  buildStitchFinanceMetricRow,
  buildStitchPillarTabs,
  filterRowsByPillar,
  leadershipToolOverrideSourceVersion,
  mergeStitchFinanceMetricRow,
  monthlyStarOverrideSourceVersion,
  readMonthlyStarPresentationOverrides,
  readStitchAutoRowOverrides,
  scaledChartDomain,
  stitchAutoRowOverrideKey,
  writeMonthlyStarPresentationOverrides,
  writeStitchAutoRowOverride,
} from '../pages/csuite/StitchNorthStar.helpers'

describe('Stitch North Star helpers', () => {
  it('builds project tabs from existing pillar names in slot order', () => {
    const rows = mergeNorthStarRows([], '2026-07-01', '2026-07-05')

    expect(buildStitchPillarTabs(rows).slice(0, 4)).toEqual([
      { id: STITCH_ALL_PILLARS_TAB, label: 'All', count: 8 },
      { id: 'finance / cash', label: 'Finance / cash', count: 1 },
      { id: 'amazon retail', label: 'Amazon retail', count: 1 },
      { id: 'wholesale', label: 'Wholesale', count: 1 },
    ])
  })

  it('filters rows by the selected pillar tab without introducing a project field', () => {
    const rows = mergeNorthStarRows([], '2026-07-01', '2026-07-05')

    expect(filterRowsByPillar(rows, STITCH_ALL_PILLARS_TAB)).toHaveLength(rows.length)
    expect(filterRowsByPillar(rows, 'wholesale').map(row => row.pillar)).toEqual(['Wholesale'])
  })

  it('builds editable presentation decks per owner and splits shared owners', () => {
    const rows = mergeNorthStarRows([], '2026-07-01', '2026-07-05')
    const decks = buildOwnerSlideDeck(rows)

    expect(decks.map(deck => deck.owner)).toContain('Mike')
    expect(decks.map(deck => deck.owner)).toContain('Sam')
    expect(decks.find(deck => deck.owner === 'Sam')?.rows.map(row => row.pillar)).toEqual(['Wholesale', 'Cloud9'])
    expect(decks.find(deck => deck.owner === 'Ryan')?.rows.map(row => row.pillar)).toEqual(['Finance / cash', 'Purchasing'])
  })

  it('adds a generated finance metrics pillar from live Monthly Star data', () => {
    const rows = mergeNorthStarRows([], '2026-07-01', '2026-07-05')
    const monthlyInput = {
      period_month: '2026-07-01',
      target_sales: 8500000,
      mtd_actual: 843000,
      ly_mtd_actual: 1462000,
      days_elapsed: 8,
      days_remaining: 23,
      dragging_channel_notes: null,
      channel_deltas: [
        { channel: 'Direct Retail', delta: -120000 },
        { channel: 'Wholesale', delta: 40000 },
      ],
    }
    const monthlyMetrics = computeMonthlyStarMetrics(monthlyInput)

    const financeRow = buildStitchFinanceMetricRow(rows, monthlyInput, monthlyMetrics, '2026-07-05')
    const stitchedRows = mergeStitchFinanceMetricRow(rows, financeRow)

    expect(financeRow).toMatchObject({
      pillar: MONTHLY_STAR_FINANCE_PILLAR,
      owner: 'Ryan',
      north_star: 'Monthly sales target / MTD pace',
      plan_value: '$8,500,000',
      actual_mtd: '$843,000',
      forecast: '$3,266,625',
      status: 'at_risk',
      source: 'monthly_star',
      autoFields: STITCH_AUTO_FINANCE_FIELDS,
    })
    expect(stitchedRows).toHaveLength(9)
    expect(buildStitchPillarTabs(stitchedRows).find(tab => tab.label === MONTHLY_STAR_FINANCE_PILLAR)).toMatchObject({ count: 1 })
    expect(buildOwnerSlideDeck(stitchedRows).find(deck => deck.owner === 'Ryan')?.rows.map(row => row.pillar)).toContain(MONTHLY_STAR_FINANCE_PILLAR)
  })

  it('keeps Monthly Star finance data owned by Ryan with daily lift and lift percent', () => {
    const rows = mergeNorthStarRows([], '2026-07-01', '2026-07-05')
    const monthlyInput = {
      period_month: '2026-07-01',
      target_sales: 8500000,
      mtd_actual: 843000,
      ly_mtd_actual: 1462000,
      days_elapsed: 8,
      days_remaining: 23,
      dragging_channel_notes: null,
      channel_deltas: [],
    }
    const monthlyMetrics = computeMonthlyStarMetrics(monthlyInput)

    const financeRow = buildStitchFinanceMetricRow(rows, monthlyInput, monthlyMetrics, '2026-07-05')

    expect(financeRow.owner).toBe('Ryan')
    expect(financeRow.constraint_now).toContain('daily lift')
    expect(financeRow.constraint_now).toContain('%')
  })

  it('persists Monthly Star presentation status and comment overrides by month', () => {
    const storage = createMemoryStorage()

    writeMonthlyStarPresentationOverrides('2026-07-01', { status: 'off_plan', last_week_result: 'Discuss channel drag.' }, storage)
    writeMonthlyStarPresentationOverrides('2026-08-01', { status: 'on_plan', last_week_result: 'August is clean.' }, storage)
    writeMonthlyStarPresentationOverrides('2026-07-01', { last_week_result: '' }, storage)

    expect(readMonthlyStarPresentationOverrides('2026-07-01', storage)).toEqual({
      status: 'off_plan',
      last_week_result: '',
    })
    expect(readMonthlyStarPresentationOverrides('2026-08-01', storage)).toEqual({
      status: 'on_plan',
      last_week_result: 'August is clean.',
    })
  })

  it('persists auto-populated row overrides until that source data changes', () => {
    const storage = createMemoryStorage()
    const monthlyKey = stitchAutoRowOverrideKey({ source: 'monthly_star', chart: { kind: 'sales' }, north_star: 'Edited sales title' })
    const payrollKey = stitchAutoRowOverrideKey({ source: 'leadership_tool', chart: { kind: 'payroll' }, north_star: 'Edited payroll title' })

    writeStitchAutoRowOverride('2026-07-01', 'monthly_star', 'sales-sync-a', monthlyKey, 'status', 'off_plan', storage)
    writeStitchAutoRowOverride('2026-07-01', 'monthly_star', 'sales-sync-a', monthlyKey, 'last_week_result', 'Sales comment survives refresh.', storage)
    writeStitchAutoRowOverride('2026-07-01', 'leadership_tool', 'leadership-upload-a', payrollKey, 'forecast', 'Projected payroll override', storage)

    expect(readStitchAutoRowOverrides('2026-07-01', { monthly_star: 'sales-sync-a', leadership_tool: 'leadership-upload-a' }, storage)).toEqual({
      [monthlyKey]: {
        status: 'off_plan',
        last_week_result: 'Sales comment survives refresh.',
      },
      [payrollKey]: {
        forecast: 'Projected payroll override',
      },
    })
    expect(readStitchAutoRowOverrides('2026-07-01', { monthly_star: 'sales-sync-b', leadership_tool: 'leadership-upload-a' }, storage)).toEqual({
      [payrollKey]: {
        forecast: 'Projected payroll override',
      },
    })
    expect(readStitchAutoRowOverrides('2026-07-01', { monthly_star: 'sales-sync-a', leadership_tool: 'leadership-upload-b' }, storage)).toEqual({
      [monthlyKey]: {
        status: 'off_plan',
        last_week_result: 'Sales comment survives refresh.',
      },
    })
  })

  it('versions Monthly Star overrides from sync data and leadership overrides from workbook uploads', () => {
    const firstSalesVersion = monthlyStarOverrideSourceVersion(
      '2026-07-01',
      { updated_at: '2026-07-02T00:00:00Z' },
      {
        current: [{ synced_at: '2026-07-08T12:00:00Z', revenue: 100 }],
        previousYear: [{ synced_at: '2026-07-08T12:00:00Z', revenue: 75 }],
      }
    )
    const secondSalesVersion = monthlyStarOverrideSourceVersion(
      '2026-07-01',
      { updated_at: '2026-07-02T00:00:00Z' },
      {
        current: [{ synced_at: '2026-07-09T12:00:00Z', revenue: 100 }],
        previousYear: [{ synced_at: '2026-07-08T12:00:00Z', revenue: 75 }],
      }
    )

    expect(firstSalesVersion).not.toEqual(secondSalesVersion)
    expect(leadershipToolOverrideSourceVersion({ uploaded_at: '2026-07-09T15:00:00Z', filename: 'Weekly Reporting Tool.xlsm' }))
      .not.toEqual(leadershipToolOverrideSourceVersion({ uploaded_at: '2026-07-10T15:00:00Z', filename: 'Weekly Reporting Tool.xlsm' }))
  })

  it('builds Ryan finance rows from the latest leadership snapshot', () => {
    const rows = mergeNorthStarRows([], '2026-07-01', '2026-07-05')
    const snapshot = {
      cashflow: {
        current_cash_balance: 4247564.99,
        minimum_cash_floor: 600000,
        weeks: [
          { week: 1, week_start_date: '2026-07-06', beginning_cash: 4247564.99, fixed_outflows: 75531.34, tier_1_vendor_payments: 100000, tier_2_vendor_payments: 200000, tier_3_vendor_payments: 300000, vendor_deposits: 0, total_vendor_payments: 600000, total_outflows: 675531.34, ending_cash: 3389535.39, ending_cash_vs_floor: 2789535.39 },
          { week: 13, week_start_date: '2026-09-28', beginning_cash: 100000, fixed_outflows: 75531.34, tier_1_vendor_payments: 100000, tier_2_vendor_payments: 200000, tier_3_vendor_payments: 300000, vendor_deposits: 0, total_vendor_payments: 600000, total_outflows: 675531.34, ending_cash: -415916.26, ending_cash_vs_floor: -831511.25 },
        ],
      },
      payroll: {
        departments: [
          { department: 'Finance', periods: [{ month: '2026-06-01', current_year: 29124.42, last_year: 13775.3, difference_pct: 1.11425 }] },
          { department: 'Grand Total', periods: [{ month: '2026-06-01', current_year: 120000, last_year: 100000, difference_pct: 0.2 }] },
        ],
      },
      pnl: {
        accounts: [
          { account: 'Grand Total', periods: [{ month: '2026-06-01', current_year: 1034278.45, last_year: 149182.34, difference_pct: 5.933 }] },
        ],
      },
      sales_simulation: {
        noi_benchmark_pct: 0.09,
        latest_income: 8632172.09,
        latest_noi: 1034278.45,
        latest_noi_pct: 0.1198,
        sales_needed_for_benchmark: 0,
      },
    }

    const financeRows = buildLeadershipFinanceRows(rows, snapshot, '2026-07-01', '2026-07-05')

    expect(financeRows).toHaveLength(3)
    expect(financeRows.every(row => row.owner === 'Ryan')).toBe(true)
    expect(financeRows.map(row => row.pillar)).toEqual(['Finance metrics', 'Finance metrics', 'Finance metrics'])
    expect(financeRows.map(row => row.north_star)).toEqual(['13-week cash runway', 'Payroll by department', 'PnL / 9% NOI'])
  })

  it('uses current-month payroll actuals and projects the month from elapsed weeks', () => {
    const rows = mergeNorthStarRows([], '2026-07-01', '2026-07-05')
    const snapshot = baseLeadershipSnapshot({
      payroll: {
        departments: [
          {
            department: 'Admin',
            periods: [
              { month: '2026-03-01', current_year: 30559.1, last_year: 2779.8, difference_pct: 9.993 },
              { month: '2026-06-01', current_year: 41834.53, last_year: 4211.84, difference_pct: 0.893 },
              { month: '2026-07-01', current_year: 21215.36, last_year: 25610.3, difference_pct: -0.17 },
            ],
          },
          {
            department: 'Finance',
            periods: [
              { month: '2026-03-01', current_year: 31307.17, last_year: 16657.59, difference_pct: 0.88 },
              { month: '2026-06-01', current_year: 29124.42, last_year: 13775.3, difference_pct: 1.11425 },
              { month: '2026-07-01', current_year: 9114.58, last_year: 18243.2, difference_pct: -0.1 },
            ],
          },
          {
            department: 'Grand Total',
            periods: [
              { month: '2026-03-01', current_year: 722092.59, last_year: 890805.73, difference_pct: -0.19 },
              { month: '2026-06-01', current_year: 465785.91, last_year: 660523.3, difference_pct: -0.29 },
              { month: '2026-07-01', current_year: 215451.78, last_year: 872844.62, difference_pct: -0.75 },
            ],
          },
        ],
      },
    })

    const financeRows = buildLeadershipFinanceRows(rows, snapshot, '2026-07-01', '2026-07-12')
    const payroll = financeRows.find(row => row.north_star === 'Payroll by department')

    expect(payroll).toMatchObject({
      actual_mtd: 'Admin: -17.0%',
      forecast: 'Projected Grand Total $359,086',
      last_week_result: 'July payroll actual is $215,452; projected from 3 of 5 weeks.',
      status: 'on_plan',
    })
    expect(payroll?.actual_mtd).not.toContain('111.4%')
    expect(payroll?.forecast).not.toContain('$465,786')
    expect(payroll?.chart?.comparisonPoints).toEqual([
      { label: 'Admin', currentValue: 21215.36, previousValue: 25610.3 },
      { label: 'Finance', currentValue: 9114.58, previousValue: 18243.2 },
    ])
  })

  it('uses last year same-month NOI as the PnL forecast', () => {
    const rows = mergeNorthStarRows([], '2026-07-01', '2026-07-05')
    const snapshot = baseLeadershipSnapshot({
      pnl: {
        accounts: [
          {
            account: 'Income',
            periods: [
              { month: '2026-07-01', current_year: 100000, last_year: 9748455.74, difference_pct: -0.98 },
              { month: '2026-06-01', current_year: 1000000, last_year: 7173126.82, difference_pct: 0.2 },
              { month: '2026-05-01', current_year: 900000, last_year: 8066699.22, difference_pct: -0.18 },
              { month: '2026-04-01', current_year: 800000, last_year: 6308999.67, difference_pct: 0.13 },
            ],
          },
          {
            account: 'COGS',
            periods: [
              { month: '2026-07-01', current_year: -45000, last_year: -4686318.65, difference_pct: -1 },
              { month: '2026-06-01', current_year: -500000, last_year: -3450107.77, difference_pct: 0.28 },
              { month: '2026-05-01', current_year: -450000, last_year: -4122906.83, difference_pct: -0.21 },
              { month: '2026-04-01', current_year: -400000, last_year: -3135669.65, difference_pct: 0.16 },
            ],
          },
          {
            account: 'Expense',
            periods: [
              { month: '2026-07-01', current_year: -100000, last_year: -4746361.54, difference_pct: -0.88 },
              { month: '2026-06-01', current_year: -300000, last_year: -3493851.69, difference_pct: -0.1 },
              { month: '2026-05-01', current_year: -280000, last_year: -3933963.9, difference_pct: -0.21 },
              { month: '2026-04-01', current_year: -260000, last_year: -3439448.72, difference_pct: -0.04 },
            ],
          },
          {
            account: 'Grand Total',
            periods: [
              { month: '2026-07-01', current_year: -10871.01, last_year: 261911.23, difference_pct: -1.04 },
              { month: '2026-06-01', current_year: 100000, last_year: 149182.34, difference_pct: 5.933 },
              { month: '2026-05-01', current_year: 254726.02, last_year: -39413.19, difference_pct: -7.46 },
              { month: '2026-04-01', current_year: 188049.36, last_year: 532664.26, difference_pct: -0.65 },
            ],
          },
        ],
      },
    })

    const financeRows = buildLeadershipFinanceRows(rows, snapshot, '2026-07-01', '2026-07-05')
    const pnl = financeRows.find(row => row.north_star === 'PnL / 9% NOI')

    expect(pnl).toMatchObject({
      actual_mtd: '10.0% NOI',
      forecast: '$261,911 forecast NOI',
      last_week_result: 'June NOI was $100,000 on income of $1,000,000.',
      constraint_now: "Last year's same-month NOI was 2.7%, below the 9.0% benchmark.",
      status: 'at_risk',
    })
    expect(pnl?.forecast).not.toContain('to benchmark')
    expect(pnl?.forecast).not.toContain('end-of-month NOI')
    expect(pnl?.actual_mtd).not.toBe('-10.9% NOI')
    expect(pnl?.chart?.points.map(point => point.label)).toEqual(['Last month', 'Forecast', 'Benchmark'])
    expect(pnl?.chart?.points.find(point => point.label === 'Forecast')?.value).toBeCloseTo(0.0269, 4)
  })

  it('adds graph payloads for Ryan finance presentation slides', () => {
    const rows = mergeNorthStarRows([], '2026-07-01', '2026-07-05')
    const monthlyInput = {
      period_month: '2026-07-01',
      target_sales: 8500000,
      mtd_actual: 843000,
      ly_mtd_actual: 1462000,
      days_elapsed: 8,
      days_remaining: 23,
      dragging_channel_notes: null,
      channel_deltas: [],
    }
    const monthlyMetrics = computeMonthlyStarMetrics(monthlyInput)
    const financeRow = buildStitchFinanceMetricRow(rows, monthlyInput, monthlyMetrics, '2026-07-05')
    const leadershipRows = buildLeadershipFinanceRows([...rows, financeRow], baseLeadershipSnapshot(), '2026-07-01', '2026-07-05')
    const financeRows = [financeRow, ...leadershipRows]

    expect(financeRows.map(row => row.chart?.kind)).toEqual(['sales', 'cash_runway', 'payroll', 'pnl'])
    expect(financeRows.every(row => row.chart?.points.length)).toBe(true)
    expect(financeRows.find(row => row.north_star === '13-week cash runway')?.chart?.threshold).toBe(600000)
    expect(financeRows.find(row => row.north_star === 'Payroll by department')?.chart?.comparisonPoints?.length).toBeGreaterThan(0)
  })

  it('scales chart domains around the presented min and max values', () => {
    expect(scaledChartDomain([100, 102, 104])).toEqual({ min: 99.6, max: 104.4 })
    expect(scaledChartDomain([250, 250])).toEqual({ min: 225, max: 275 })
  })
})

function createMemoryStorage() {
  const values = new Map<string, string>()
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value)
    },
  }
}

function baseLeadershipSnapshot(overrides: Partial<Parameters<typeof buildLeadershipFinanceRows>[1]> = {}) {
  return {
    cashflow: {
      current_cash_balance: 4247564.99,
      minimum_cash_floor: 600000,
      weeks: [
        { week: 1, week_start_date: '2026-07-06', beginning_cash: 4247564.99, fixed_outflows: 75531.34, tier_1_vendor_payments: 100000, tier_2_vendor_payments: 200000, tier_3_vendor_payments: 300000, vendor_deposits: 0, total_vendor_payments: 600000, total_outflows: 675531.34, ending_cash: 3389535.39, ending_cash_vs_floor: 2789535.39 },
        { week: 13, week_start_date: '2026-09-28', beginning_cash: 100000, fixed_outflows: 75531.34, tier_1_vendor_payments: 100000, tier_2_vendor_payments: 200000, tier_3_vendor_payments: 300000, vendor_deposits: 0, total_vendor_payments: 600000, total_outflows: 675531.34, ending_cash: -415916.26, ending_cash_vs_floor: -831511.25 },
      ],
    },
    payroll: {
      departments: [
        { department: 'Admin', periods: [{ month: '2026-07-01', current_year: 21215.36, last_year: 25610.3, difference_pct: -0.17162 }] },
        { department: 'Finance', periods: [{ month: '2026-07-01', current_year: 9114.58, last_year: 18243.2, difference_pct: -0.50039 }] },
        { department: 'Grand Total', periods: [{ month: '2026-07-01', current_year: 215451.78, last_year: 872844.62, difference_pct: -0.75316 }] },
      ],
    },
    pnl: {
      accounts: [
        {
          account: 'Income',
          periods: [
            { month: '2026-07-01', current_year: 149930.81, last_year: 9748455.74, difference_pct: -0.98 },
            { month: '2026-06-01', current_year: 8632172.09, last_year: 7173126.82, difference_pct: 0.2 },
          ],
        },
        { account: 'COGS', periods: [{ month: '2026-06-01', current_year: -4407472.32, last_year: -3450107.77, difference_pct: 0.28 }] },
        { account: 'Expense', periods: [{ month: '2026-07-01', current_year: -550205.49, last_year: -4746361.54, difference_pct: -0.88 }] },
        {
          account: 'Grand Total',
          periods: [
            { month: '2026-07-01', current_year: -10871.01, last_year: 261911.23, difference_pct: -1.04 },
            { month: '2026-06-01', current_year: 1034278.45, last_year: 149182.34, difference_pct: 5.933 },
          ],
        },
      ],
    },
    sales_simulation: {
      noi_benchmark_pct: 0.09,
      latest_income: 8632172.09,
      latest_noi: 1034278.45,
      latest_noi_pct: 0.1198,
      sales_needed_for_benchmark: 0,
    },
    ...overrides,
  }
}
