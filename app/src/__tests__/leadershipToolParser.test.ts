import { describe, expect, it } from 'vitest'
import { parseLeadershipWorkbookSheets } from '../lib/leadershipToolParser'

describe('leadership tool parser', () => {
  it('parses Summary_13wks cashflow rows 18 through 30', () => {
    const sheets = {
      Summary_13wks: [
        ['Current Cash Balance', 4247564.99],
        ['Minimum Cash Floor', 600000],
        [],
        [],
        [],
        [],
        [],
        [],
        [],
        [],
        [],
        [],
        [],
        [],
        [],
        [],
        ['Week #', 'Week Start Date', 'Beginning Cash', 'Fixed Outflows', 'Tier 1 Vendor Pmts', 'Tier 2 Vendor Pmts', 'Tier 3 Vendor Pmts', 'Vendor Deposits', 'Total Vendor Pmts', 'Total Outflows', 'Ending Cash', 'Ending Cash vs Floor'],
        [1, '2026-07-06', 4247564.99, 75531.34, 100000, 200000, 300000, 0, 600000, 675531.34, 3389535.39, 2789535.39],
        [2, '2026-07-13', 3389535.39, 75531.34, 100000, 200000, 300000, 0, 600000, 675531.34, 2714004.05, 2114004.05],
      ],
      Payroll: [],
      PnL: [],
    }

    const parsed = parseLeadershipWorkbookSheets(sheets)

    expect(parsed.cashflow.current_cash_balance).toBe(4247564.99)
    expect(parsed.cashflow.minimum_cash_floor).toBe(600000)
    expect(parsed.cashflow.weeks).toHaveLength(2)
    expect(parsed.cashflow.weeks[0]).toMatchObject({
      week: 1,
      week_start_date: '2026-07-06',
      ending_cash: 3389535.39,
      ending_cash_vs_floor: 2789535.39,
    })
  })

  it('parses Payroll department rows from row 10 onward', () => {
    const sheets = {
      Summary_13wks: [],
      Payroll: [
        ['IsPayroll', true],
        ['IsTotalRow', false],
        [],
        ['Column Labels'],
        [2026],
        ['Qtr1'],
        ['Mar', null, null, 'Jun'],
        [46082, null, null, 46174],
        ['Department', 'This Year, $', 'Last Year, $', 'Difference, %', 'This Year, $', 'Last Year, $', 'Difference, %'],
        ['Finance', 31307.17, 16657.59, 0.87945, 29124.42, 13775.3, 1.11425],
        ['Grand Total', 100000, 90000, 0.11111, 120000, 100000, 0.2],
      ],
      PnL: [],
    }

    const parsed = parseLeadershipWorkbookSheets(sheets)

    expect(parsed.payroll.departments[0]).toMatchObject({
      department: 'Finance',
      periods: [
        { month: '2026-03-01', current_year: 31307.17, last_year: 16657.59, difference_pct: 0.87945 },
        { month: '2026-06-01', current_year: 29124.42, last_year: 13775.3, difference_pct: 1.11425 },
      ],
    })
  })

  it('parses PnL Grand Total as NOI and computes the 9 percent benchmark gap', () => {
    const sheets = {
      Summary_13wks: [],
      Payroll: [],
      PnL: [
        [],
        [],
        [],
        [],
        [],
        [],
        [],
        [],
        [],
        [],
        [null, '2026'],
        [null, '2026-06-01'],
        ['Account', 'Current Year, $', 'Last Year, $', 'Difference, %'],
        ['Income', 8632172.09, 7173126.82, 0.2034],
        ['COGS', -4407472.32, -3450107.77, 0.2774],
        ['Expense', -3149694.59, -3493851.69, -0.0985],
        ['Other Income', 103551.32, 3549.66, 28.1721],
        ['Other Expense', -144278.05, -83534.68, 0.7271],
        ['Grand Total', 1034278.45, 149182.34, 5.933],
      ],
    }

    const parsed = parseLeadershipWorkbookSheets(sheets)

    expect(parsed.pnl.accounts.find(row => row.account === 'Grand Total')?.periods[0].current_year).toBe(1034278.45)
    expect(parsed.sales_simulation.noi_benchmark_pct).toBe(0.09)
    expect(parsed.sales_simulation.latest_noi_pct).toBeCloseTo(0.1198, 4)
    expect(parsed.sales_simulation.sales_needed_for_benchmark).toBe(0)
  })
})
