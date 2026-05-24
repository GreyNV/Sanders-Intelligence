import { describe, expect, it } from 'vitest'
import { buildVendorWindowMetrics, getVendorSkuRows, getVendorViewAtRiskSkus } from '../pages/purchasing/VendorView.helpers'
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

describe('Vendor View at-risk SKU helpers', () => {
  it('uses the same at-risk status definition for displayed counts and vendor tasks', () => {
    const rows = [
      makeRecord({ product_code: 'COUNT-1', status: 'Potential s/o', recommended_order: 0 }),
      makeRecord({ product_code: 'COUNT-2', status: 'Stocked out', recommended_order: 0 }),
      makeRecord({ product_code: 'SKIP-1', status: 'Ok', recommended_order: 10 }),
      makeRecord({ product_code: 'SKIP-2', status: 'Excess stock', recommended_order: 5 }),
    ]

    expect(getVendorViewAtRiskSkus(rows).map(r => r.product_code)).toEqual(['COUNT-1', 'COUNT-2'])
  })

  it('filters and sorts expanded vendor SKU rows', () => {
    const rows = [
      makeRecord({ product_code: 'BBB-2', description: 'Blue Sheet', category_name: 'Bedding', status: 'Ok', days_on_hand: 30, recommended_order: 0 }),
      makeRecord({ product_code: 'AAA-1', description: 'Amber Quilt', category_name: 'Quilts', status: 'Stocked out', days_on_hand: 0, recommended_order: 12 }),
      makeRecord({ product_code: 'CCC-3', description: 'Cotton Towel', category_name: 'Bath', status: 'Potential s/o', days_on_hand: 5, recommended_order: 4 }),
    ]

    expect(getVendorSkuRows(rows, 'quilt', { field: 'product_code', dir: 'asc' }).map(r => r.product_code)).toEqual(['AAA-1'])
    expect(getVendorSkuRows(rows, '', { field: 'recommended_order', dir: 'desc' }).map(r => r.product_code)).toEqual(['AAA-1', 'CCC-3', 'BBB-2'])
    expect(getVendorSkuRows(rows, '', { field: 'recommended_order_value', dir: 'desc' }).map(r => r.product_code)).toEqual(['BBB-2', 'AAA-1', 'CCC-3'])
  })

  it('filters expanded vendor SKU rows by status and category before sorting', () => {
    const rows = [
      makeRecord({ product_code: 'KEEP', category_name: 'Hardware', status: 'Stocked out', recommended_order_value: 80 }),
      makeRecord({ product_code: 'SKIP-STATUS', category_name: 'Hardware', status: 'Ok', recommended_order_value: 100 }),
      makeRecord({ product_code: 'SKIP-CAT', category_name: 'Bedding', status: 'Stocked out', recommended_order_value: 120 }),
    ]

    expect(getVendorSkuRows(rows, '', { field: 'recommended_order_value', dir: 'desc' }, {
      status: 'Stocked out',
      category: 'Hardware',
    }).map(r => r.product_code)).toEqual(['KEEP'])
  })

  it('builds vendor COGS, margin, and average selling price by metric window', () => {
    const rows = [
      makeRecord({ product_code: 'SKU-1' }),
      makeRecord({ product_code: 'SKU-2' }),
    ]
    const profitBySku = new Map([
      ['SKU-1', {
        units_today: 2,
        revenue_today: 100,
        accrual_profit_today: 30,
        units_7d: 4,
        revenue_7d: 200,
        accrual_profit_7d: 80,
        units_30d: 10,
        revenue_30d: 500,
        accrual_profit_30d: 125,
      }],
      ['SKU-2', {
        units_today: 3,
        revenue_today: 150,
        accrual_profit_today: 60,
        units_7d: 6,
        revenue_7d: 300,
        accrual_profit_7d: 90,
        units_30d: 20,
        revenue_30d: 800,
        accrual_profit_30d: 240,
      }],
    ])

    const metrics = buildVendorWindowMetrics(rows, profitBySku)

    expect(metrics.today.avgSellingPrice).toBe(50)
    expect(metrics.today.cogsPct).toBe(64)
    expect(metrics.today.marginPct).toBe(36)
    expect(metrics['7d'].avgSellingPrice).toBe(50)
    expect(metrics['7d'].cogsPct).toBe(66)
    expect(metrics['7d'].marginPct).toBe(34)
    expect(metrics['30d'].avgSellingPrice).toBeCloseTo(43.3333)
    expect(metrics['30d'].cogsPct).toBeCloseTo(71.9231)
    expect(metrics['30d'].marginPct).toBeCloseTo(28.0769)
    expect(metrics.hasMetrics).toBe(true)
  })

  it('treats missing profit metrics as zero and returns null for zero revenue or units', () => {
    const rows = [
      makeRecord({ product_code: 'ZERO' }),
      makeRecord({ product_code: 'MISSING' }),
    ]
    const profitBySku = new Map([
      ['ZERO', {
        units_today: 0,
        revenue_today: 0,
        accrual_profit_today: -5,
        units_7d: 0,
        revenue_7d: 120,
        accrual_profit_7d: 30,
        units_30d: 6,
        revenue_30d: 0,
        accrual_profit_30d: 0,
      }],
    ])

    const metrics = buildVendorWindowMetrics(rows, profitBySku)

    expect(metrics.today.cogsPct).toBeNull()
    expect(metrics.today.marginPct).toBeNull()
    expect(metrics.today.avgSellingPrice).toBeNull()
    expect(metrics['7d'].cogsPct).toBe(75)
    expect(metrics['7d'].marginPct).toBe(25)
    expect(metrics['7d'].avgSellingPrice).toBeNull()
    expect(metrics['30d'].cogsPct).toBeNull()
    expect(metrics['30d'].marginPct).toBeNull()
    expect(metrics['30d'].avgSellingPrice).toBe(0)
    expect(metrics.hasMetrics).toBe(true)
  })

  it('reports no metrics when no vendor SKU has a profit metric row', () => {
    const metrics = buildVendorWindowMetrics([
      makeRecord({ product_code: 'MISSING' }),
    ], new Map())

    expect(metrics.hasMetrics).toBe(false)
    expect(metrics.today.cogsPct).toBeNull()
    expect(metrics.today.marginPct).toBeNull()
    expect(metrics['7d'].avgSellingPrice).toBeNull()
    expect(metrics['30d'].cogsPct).toBeNull()
  })
})
