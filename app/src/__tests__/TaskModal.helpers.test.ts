import { describe, expect, it } from 'vitest'
import {
  buildVendorTaskDescription,
  filterSkuSelectorRows,
  sortSkuSelectorRows,
} from '../components/tasks/TaskModal.helpers'
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
    recommended_order: 1,
    recommended_order_value: 1,
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

describe('vendor order SKU selection helpers', () => {
  it('builds the vendor task description from only the selected SKUs', () => {
    const selected = [
      makeRecord({ product_code: 'KEEP-1', description: 'Kept Item', days_on_hand: 3, recommended_order: 10, recommended_order_value: 100 }),
    ]

    const description = buildVendorTaskDescription('Vendor A', selected)

    expect(description).toContain('Vendor: Vendor A')
    expect(description).toContain('At-Risk SKUs (1):')
    expect(description).toContain('KEEP-1')
    expect(description).not.toContain('REMOVE-1')
  })

  it('filters selector rows by sku, description, vendor, brand, and category', () => {
    const rows = [
      makeRecord({ product_code: 'ABC-1', description: 'Quilt Set', supplier_description: 'Linen Choice-A', brand_name: 'Clara Clark', category_name: 'Bedding' }),
      makeRecord({ product_code: 'XYZ-2', description: 'Towel Pack', supplier_description: 'Bath Vendor', brand_name: 'SoftCo', category_name: 'Bath' }),
    ]

    expect(filterSkuSelectorRows(rows, 'quilt').map(r => r.product_code)).toEqual(['ABC-1'])
    expect(filterSkuSelectorRows(rows, 'softco').map(r => r.product_code)).toEqual(['XYZ-2'])
    expect(filterSkuSelectorRows(rows, 'bedding').map(r => r.product_code)).toEqual(['ABC-1'])
  })

  it('filters selector rows by vendor, status, and category together', () => {
    const rows = [
      makeRecord({ product_code: 'KEEP', supplier_description: 'Acme', status: 'Stocked out', category_name: 'Hardware' }),
      makeRecord({ product_code: 'SKIP-VENDOR', supplier_description: 'Bravo', status: 'Stocked out', category_name: 'Hardware' }),
      makeRecord({ product_code: 'SKIP-STATUS', supplier_description: 'Acme', status: 'Ok', category_name: 'Hardware' }),
      makeRecord({ product_code: 'SKIP-CAT', supplier_description: 'Acme', status: 'Stocked out', category_name: 'Bedding' }),
    ]

    expect(filterSkuSelectorRows(rows, '', {
      vendor: 'Acme',
      status: 'Stocked out',
      category: 'Hardware',
    }).map(r => r.product_code)).toEqual(['KEEP'])
  })

  it('sorts selector rows by primary sort before selected-row grouping', () => {
    const rows = [
      makeRecord({ product_code: 'LOW-SELECTED', recommended_order_value: 10 }),
      makeRecord({ product_code: 'HIGH-UNSELECTED', recommended_order_value: 100 }),
      makeRecord({ product_code: 'MID-SELECTED', recommended_order_value: 50 }),
    ]
    const selected = new Set(['LOW-SELECTED', 'MID-SELECTED'])

    expect(sortSkuSelectorRows(rows, { field: 'recommended_order_value', dir: 'desc' }, selected).map(r => r.product_code))
      .toEqual(['HIGH-UNSELECTED', 'MID-SELECTED', 'LOW-SELECTED'])
  })

  it('sorts selector status by severity order', () => {
    const rows = [
      makeRecord({ product_code: 'OK', status: 'Ok' }),
      makeRecord({ product_code: 'STOCKOUT', status: 'Stocked out' }),
      makeRecord({ product_code: 'EXCESS', status: 'Excess stock' }),
      makeRecord({ product_code: 'POTENTIAL', status: 'Potential s/o' }),
    ]

    expect(sortSkuSelectorRows(rows, { field: 'status', dir: 'asc' }, new Set()).map(r => r.product_code))
      .toEqual(['OK', 'EXCESS', 'POTENTIAL', 'STOCKOUT'])
  })
})
