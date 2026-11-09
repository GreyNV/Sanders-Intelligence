import { describe, expect, it } from 'vitest'
import { cashFloorStatus, parseWarehouseBudgetSheets } from '@/lib/financeWarehouseBudget'

describe('warehouse budget import', () => {
  it('uses budget minus actual and resolves Jan 27 using the workbook headings', () => {
    const rows = parseWarehouseBudgetSheets({
      'Budget Source': [['Account', 'Include in Budget', 'Apr 26', 'Jan 27']],
      'Variance Table': [
        ['Section', 'Account', 'Status', 'Month', 'Budget', 'Actual'],
        ['Warehouse Expenses', 'Rent', 'Matched', new Date('2026-01-27T00:00:00Z'), 100, 125],
        ['Warehouse Expenses', 'Rent', 'Missing Budget', new Date('2026-04-26T00:00:00Z'), 0, 25],
        ['Warehouse Expenses', 'Repair', 'Missing in Actuals', new Date('2026-04-26T00:00:00Z'), 50, 0],
      ],
    })
    expect(rows[0]).toMatchObject({ month: '2027-01-01', variance: -25 })
    expect(rows[1]).toMatchObject({ month: '2026-04-01', budget: null, variance: null })
    expect(rows[2]).toMatchObject({ month: '2026-04-01', actual: null, variance: null })
  })

  it('distinguishes negative cash from a positive balance below the floor', () => {
    expect(cashFloorStatus(800000, 200000)).toBe('green')
    expect(cashFloorStatus(100000, -500000)).toBe('yellow')
    expect(cashFloorStatus(-1, -600001)).toBe('red')
    expect(cashFloorStatus(-1, null)).toBe('red')
    expect(cashFloorStatus(1, null)).toBe('pending')
    expect(cashFloorStatus(null, 0)).toBe('pending')
  })

  it('interprets Excel serial headings without a time-zone shift', () => {
    const serial=Math.round((Date.UTC(2026,0,27)-Date.UTC(1899,11,30))/86400000)
    const rows=parseWarehouseBudgetSheets({
      'Budget Source':[['Account','Jan 26','Jan 27']],
      'Variance Table':[['Section','Account','Status','Month','Budget','Actual'],['Expense','Rent','Matched',serial,100,120]],
    })
    expect(rows[0]).toMatchObject({month:'2027-01-01',budget:100,actual:120,variance:-20})
  })
})
