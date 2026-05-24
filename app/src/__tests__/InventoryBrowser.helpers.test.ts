import { describe, expect, it } from 'vitest'
import { buildInventoryRows, sortInventoryRows } from '../pages/purchasing/InventoryBrowser.helpers'
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

describe('Inventory Browser metric rows', () => {
  it('enriches rows with display metrics and 30-day COGS percentage', () => {
    const [row] = buildInventoryRows([makeRecord({ product_code: 'SKU-1' })], {
      profitBySku: new Map([['SKU-1', {
        accrual_profit_today: 10,
        accrual_profit_7d: 25,
        accrual_profit_30d: 40,
        revenue_30d: 100,
      }]]),
      priceBySku: new Map([['SKU-1', { selling_price: 17.5, price_source: 'erp' }]]),
    })

    expect(row.sellingPrice).toBe(17.5)
    expect(row.priceSource).toBe('erp')
    expect(row.profitToday).toBe(10)
    expect(row.profit7d).toBe(25)
    expect(row.profit30d).toBe(40)
    expect(row.cogsPct).toBe(60)
  })

  it('uses null for unavailable price, profit, and COGS metrics', () => {
    const [row] = buildInventoryRows([makeRecord({ product_code: 'MISSING' })], {
      profitBySku: new Map(),
      priceBySku: new Map(),
    })

    expect(row.sellingPrice).toBeNull()
    expect(row.priceSource).toBeNull()
    expect(row.profitToday).toBeNull()
    expect(row.profit7d).toBeNull()
    expect(row.profit30d).toBeNull()
    expect(row.cogsPct).toBeNull()
  })

  it('sorts derived numeric values with unavailable metrics last in both directions', () => {
    const rows = buildInventoryRows([
      makeRecord({ product_code: 'MISSING' }),
      makeRecord({ product_code: 'LOW' }),
      makeRecord({ product_code: 'HIGH' }),
    ], {
      profitBySku: new Map([
        ['LOW', { accrual_profit_30d: 10, revenue_30d: 100 }],
        ['HIGH', { accrual_profit_30d: 80, revenue_30d: 100 }],
      ]),
      priceBySku: new Map(),
    })

    expect(sortInventoryRows(rows, 'profit30d', true).map(row => row.product_code))
      .toEqual(['LOW', 'HIGH', 'MISSING'])
    expect(sortInventoryRows(rows, 'profit30d', false).map(row => row.product_code))
      .toEqual(['HIGH', 'LOW', 'MISSING'])
  })

  it('sorts 30-day COGS values while leaving missing revenue last', () => {
    const rows = buildInventoryRows([
      makeRecord({ product_code: 'MISSING' }),
      makeRecord({ product_code: 'LOW-COGS' }),
      makeRecord({ product_code: 'HIGH-COGS' }),
    ], {
      profitBySku: new Map([
        ['LOW-COGS', { accrual_profit_30d: 80, revenue_30d: 100 }],
        ['HIGH-COGS', { accrual_profit_30d: 25, revenue_30d: 100 }],
      ]),
      priceBySku: new Map(),
    })

    expect(sortInventoryRows(rows, 'cogsPct', true).map(row => row.product_code))
      .toEqual(['LOW-COGS', 'HIGH-COGS', 'MISSING'])
  })
})
