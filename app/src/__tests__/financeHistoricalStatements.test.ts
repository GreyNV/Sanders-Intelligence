import { describe, expect, it } from 'vitest'
import { parseHistoricalClassStatement, parseHistoricalCompanyStatement } from '@/lib/financeHistoricalStatements'

describe('historical finance statement imports', () => {
  it('uses income statement totals and preserves missing values', () => {
    const result = parseHistoricalCompanyStatement([
      ['', 'Nov 25', 'Dec 25', 'TOTAL'],
      ['Total Income', 100, 120, 220],
      ['Total COGS', 40, 50, 90],
      ['Total Expense', 45, null, 45],
      ['Net Ordinary Income', 15, 20, 35],
      ['Net Income', 14, 19, 33],
    ])
    expect(result).toHaveLength(2)
    expect(result[0]).toMatchObject({ month: '2025-11-01', income: 100, ordinaryIncome: 15 })
    expect(result[1].expenses).toBeNull()
  })

  it('uses class totals instead of double-counting child classes', () => {
    const result = parseHistoricalClassStatement([
      ['', '(Amazon)', '(Amazon)', 'Total Amazon', 'Wholesale', 'TOTAL'],
      ['Total Income', 60, 40, 100, 200, 300],
      ['Total COGS', 20, 20, 40, 100, 140],
      ['Total Expense', 20, 20, 40, 80, 120],
      ['Net Ordinary Income', 20, 0, 20, 20, 40],
    ], '2026-01-01')
    expect(result.map(row => [row.channel, row.income])).toEqual([['Amazon', 100], ['Wholesale', 200]])
  })

  it('prefers a class subtotal even if a same-named standalone column appears first', () => {
    const result = parseHistoricalClassStatement([
      ['', 'Amazon', '(Amazon)', 'Total Amazon', 'TOTAL'],
      ['Total Income', 30, 70, 100, 100],
      ['Net Ordinary Income', 3, 7, 10, 10],
    ], '2026-01-01')
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ channel: 'Amazon', income: 100 })
  })

  it('rejects ambiguous duplicate months and duplicate class columns', () => {
    expect(() => parseHistoricalCompanyStatement([['', 'Nov 25', 'Nov 25'], ['Total Income', 1, 2], ['Net Ordinary Income', 1, 2]])).toThrow('more than once')
    expect(() => parseHistoricalClassStatement([['', 'Amazon', 'Amazon', 'Total Walmart', 'TOTAL'], ['Total Income', 1, 2], ['Net Ordinary Income', 1, 2]], '2026-01-01')).toThrow('multiple columns')
  })

  it('rejects a file missing the required accounting totals', () => {
    expect(() => parseHistoricalCompanyStatement([['', 'Nov 25'], ['Sales', 100]])).toThrow('missing')
  })
})
