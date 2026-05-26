import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('Vendor View profit summary surface', () => {
  it('renders the approved 30-day total profit column and KPI', () => {
    const source = readFileSync(
      resolve(__dirname, '../pages/purchasing/VendorView.tsx'),
      'utf8',
    )

    expect(source).toContain('totalProfit30d')
    expect(source).toContain('<SortableTh field="totalProfit30d"')
    expect(source).toContain('label="Total Profit (30d)"')
    expect(source).toContain("windowMetrics.hasMetrics ? windowMetrics['30d'].profit : null")
    expect(source).toContain('grid-cols-5')
    expect(source).toContain('row.totalProfit30d === null')
  })
})
