import { describe, expect, it } from 'vitest'
import { buildTopRiskSuppliers, buildWeeklyHealthPoints, getIsoWeekKey } from '../pages/csuite/ExecutiveSummary.helpers'
import type { InventoryRecord } from '../types'

function makeRecord(overrides: Partial<InventoryRecord>): InventoryRecord {
  return {
    id: 'id',
    upload_id: 'upload',
    warehouse: 'WH',
    product_code: 'SKU-1',
    description: 'Widget',
    supplier_code: 'SUP',
    supplier_description: 'Vendor A',
    brand_code: 'BR',
    brand_name: 'Brand',
    category_code: 'CAT',
    category_name: 'Category',
    on_hand: 0,
    days_on_hand: 0,
    cost_price: 1,
    on_hand_value: 0,
    classification: 'A',
    velocity: 'H',
    status: 'Potential s/o',
    status_units: 0,
    status_value: 0,
    excess_units: 0,
    excess_value: 0,
    recommended_order: 0,
    recommended_order_value: 0,
    recommended_order_days: 0,
    age: 0,
    average_sales: 0,
    average_forecasted_sales: 0,
    lt_days: 0,
    on_order: 0,
    back_orders: 0,
    total_customer_orders: 0,
    unsatisfied_customer_orders_units: 0,
    unsatisfied_customer_orders_value: 0,
    moq: 1,
    order_multiples: 1,
    selling_price: 1,
    ...overrides,
  }
}

describe('Executive Summary weekly health helpers', () => {
  it('builds ISO week keys from Monday-based weeks', () => {
    expect(getIsoWeekKey('2026-05-11T12:00:00Z')).toBe('2026-W20')
    expect(getIsoWeekKey('2026-05-17T12:00:00Z')).toBe('2026-W20')
    expect(getIsoWeekKey('2026-05-18T12:00:00Z')).toBe('2026-W21')
  })

  it('averages multiple uploads within the same ISO week before computing percentages', () => {
    const weekly = buildWeeklyHealthPoints([
      {
        uploadId: 'a',
        date: '2026-05-11T12:00:00Z',
        label: 'May 11',
        totalValue: 100,
        okValue: 80,
        healthExcessValue: 10,
        atRiskValue: 10,
        newItemValue: 0,
        atRiskCount: 1,
        excessValue: 5,
        fillRate: 80,
        totalRecOrderValue: 10,
        totalSkus: 4,
      },
      {
        uploadId: 'b',
        date: '2026-05-13T12:00:00Z',
        label: 'May 13',
        totalValue: 300,
        okValue: 120,
        healthExcessValue: 120,
        atRiskValue: 60,
        newItemValue: 0,
        atRiskCount: 1,
        excessValue: 5,
        fillRate: 80,
        totalRecOrderValue: 10,
        totalSkus: 4,
      },
      {
        uploadId: 'c',
        date: '2026-05-18T12:00:00Z',
        label: 'May 18',
        totalValue: 200,
        okValue: 100,
        healthExcessValue: 50,
        atRiskValue: 25,
        newItemValue: 25,
        atRiskCount: 1,
        excessValue: 5,
        fillRate: 80,
        totalRecOrderValue: 10,
        totalSkus: 4,
      },
    ], 12)

    const firstWeek = weekly.find(point => point.weekKey === '2026-W20')

    expect(weekly).toHaveLength(2)
    expect(firstWeek?.okValue).toBe(100)
    expect(firstWeek?.excessValue).toBe(65)
    expect(firstWeek?.atRiskValue).toBe(35)
    expect(firstWeek?.okPct).toBe(50)
    expect(firstWeek?.excessPct).toBe(32.5)
    expect(firstWeek?.atRiskPct).toBe(17.5)
  })
})

describe('Executive Summary top risk supplier helpers', () => {
  it('uses stocked at-risk SKUs for lowest days on hand instead of stockout zeroes', () => {
    const rows = [
      makeRecord({ product_code: 'SO', status: 'Stocked out', days_on_hand: 0, recommended_order_value: 100 }),
      makeRecord({ product_code: 'P1', status: 'Potential s/o', days_on_hand: 12, recommended_order_value: 200 }),
      makeRecord({ product_code: 'P2', status: 'Potential s/o', days_on_hand: 8, recommended_order_value: 50 }),
    ]

    expect(buildTopRiskSuppliers(rows)[0].minDaysOnHand).toBe(8)
  })

  it('keeps fill rate within 100% when OK SKUs are otherwise inactive', () => {
    const rows = [
      makeRecord({ product_code: 'OK-1', status: 'Ok', average_sales: 0, on_hand: 0 }),
      makeRecord({ product_code: 'OK-2', status: 'Ok', average_sales: 0, on_hand: 0 }),
      makeRecord({ product_code: 'RISK', status: 'Potential s/o', average_sales: 1, on_hand: 0, recommended_order_value: 100 }),
    ]

    expect(buildTopRiskSuppliers(rows)[0].fillRate).toBeLessThanOrEqual(100)
    expect(buildTopRiskSuppliers(rows)[0].fillRate).toBeCloseTo((2 / 3) * 100)
  })
})
