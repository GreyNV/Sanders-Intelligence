import { describe, expect, it } from 'vitest'
import { getVendorViewAtRiskSkus } from '../pages/purchasing/VendorView.helpers'
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
})
