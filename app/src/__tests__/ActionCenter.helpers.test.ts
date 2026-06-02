import { describe, expect, it } from 'vitest'
import { getVisibleOverstockRows, groupRecordsByVendorCategory, sortActionCenterRecords } from '../pages/purchasing/ActionCenter.helpers'
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

describe('Action Center helpers', () => {
  it('sorts rows without mutating the source array order', () => {
    const rows = [
      makeRecord({ product_code: 'A', days_on_hand: 20 }),
      makeRecord({ product_code: 'B', days_on_hand: 5 }),
      makeRecord({ product_code: 'C', days_on_hand: 10 }),
    ]

    const sorted = sortActionCenterRecords(rows, { field: 'days_on_hand', dir: 'asc' })

    expect(sorted.map(r => r.product_code)).toEqual(['B', 'C', 'A'])
    expect(rows.map(r => r.product_code)).toEqual(['A', 'B', 'C'])
  })

  it('groups by vendor and category without mutating record order inside groups', () => {
    const rows = [
      makeRecord({ product_code: 'A', supplier_description: 'Vendor A', category_name: 'Hardware' }),
      makeRecord({ product_code: 'B', supplier_description: 'Vendor A', category_name: 'Hardware' }),
      makeRecord({ product_code: 'C', supplier_description: 'Vendor A', category_name: 'Bedding' }),
    ]

    const grouped = groupRecordsByVendorCategory(rows)

    expect(grouped).toHaveLength(1)
    expect(grouped[0].records.map(r => r.product_code)).toEqual(['A', 'B', 'C'])
    expect(grouped[0].categories[0].records.map(r => r.product_code)).toEqual(['A', 'B'])
  })

  it('caps each overstock sub-table after splitting by open order state', () => {
    const rows = [
      ...Array.from({ length: 101 }, (_, i) => makeRecord({ product_code: `OPEN-${i}`, on_order: 1, excess_value: 200 - i })),
      ...Array.from({ length: 101 }, (_, i) => makeRecord({ product_code: `NONE-${i}`, on_order: 0, excess_value: 100 - i })),
    ]

    const result = getVisibleOverstockRows(
      rows,
      { sort: { field: 'excess_value', dir: 'desc' }, vendor: '', category: '' },
      { sort: { field: 'excess_value', dir: 'desc' }, vendor: '', category: '' },
    )

    expect(result.withOrders).toHaveLength(100)
    expect(result.noOrders).toHaveLength(100)
    expect(result.withOrders[0].product_code).toBe('OPEN-0')
    expect(result.noOrders[0].product_code).toBe('NONE-0')
  })

  it('applies overstock filters independently per sub-table', () => {
    const rows = [
      makeRecord({ product_code: 'OPEN-A', on_order: 1, supplier_description: 'Vendor A', category_name: 'Hardware' }),
      makeRecord({ product_code: 'OPEN-B', on_order: 1, supplier_description: 'Vendor B', category_name: 'Hardware' }),
      makeRecord({ product_code: 'NONE-A', on_order: 0, supplier_description: 'Vendor A', category_name: 'Hardware' }),
      makeRecord({ product_code: 'NONE-B', on_order: 0, supplier_description: 'Vendor B', category_name: 'Hardware' }),
    ]

    const result = getVisibleOverstockRows(
      rows,
      { sort: { field: 'product_code', dir: 'asc' }, vendor: 'Vendor A', category: '' },
      { sort: { field: 'product_code', dir: 'asc' }, vendor: '', category: '' },
    )

    expect(result.withOrders.map(r => r.product_code)).toEqual(['OPEN-A'])
    expect(result.noOrders.map(r => r.product_code)).toEqual(['NONE-A', 'NONE-B'])
  })

  it('groups a production-sized fixture quickly enough for first render', () => {
    const rows = Array.from({ length: 12000 }, (_, index) => makeRecord({
      id: `row-${index}`,
      product_code: `SKU-${index}`,
      supplier_description: `Vendor ${index % 100}`,
      category_name: `Category ${index % 20}`,
    }))
    const started = performance.now()

    const grouped = groupRecordsByVendorCategory(rows)

    expect(grouped).toHaveLength(100)
    expect(performance.now() - started).toBeLessThan(250)
  })
})
