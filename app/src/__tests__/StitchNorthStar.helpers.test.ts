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
  mergeStitchFinanceMetricRow,
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
})
