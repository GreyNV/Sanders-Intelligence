import { describe, expect, it } from 'vitest'
import { parseSalesReportRows } from '@/lib/salesReportParser'

describe('SellerCloud sales report upload', () => {
  it('extracts the ship-date range and reconciled daily totals', () => {
    const report = parseSalesReportRows([
      ['Order #', 'Ship Date', 'Channel', 'Grand Total'],
      [1001, '2026-10-01 10:30:00', 'Website', 10.25],
      [1002, '2026-10-01 11:30:00', 'Amazon', 20],
      [1003, '10/02/2026', 'Website', '$30.50'],
    ], 'sales.xlsx')

    expect(report).toMatchObject({
      filename: 'sales.xlsx',
      dateFrom: '2026-10-01',
      dateTo: '2026-10-02',
      rowCount: 3,
      totalRevenue: 60.75,
      daily: [
        { sale_date: '2026-10-01', revenue: 30.25, orders: 2 },
        { sale_date: '2026-10-02', revenue: 30.5, orders: 1 },
      ],
    })
  })

  it('rejects workbooks without SellerCloud report columns', () => {
    expect(() => parseSalesReportRows([['Date', 'Amount'], ['2026-10-01', 10]]))
      .toThrow(/required columns/i)
  })

  it('accepts compact SellerCloud column names from SalesByDateRange exports', () => {
    const report = parseSalesReportRows([
      ['Order #', 'OrderDate', 'ShipDate', 'GrandTotal'],
      [1001, '10/01/2026', '2026-09-30T23:09:00.607Z', 65],
    ], 'sales.xlsx', { dateFrom: '2026-10-01', dateTo: '2026-10-21' })

    expect(report).toMatchObject({
      dateFrom: '2026-10-01',
      dateTo: '2026-10-21',
      rowCount: 1,
      totalRevenue: 65,
    })
  })
})
