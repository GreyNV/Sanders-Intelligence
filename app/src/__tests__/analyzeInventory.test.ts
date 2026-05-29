import { describe, it, expect } from 'vitest'
import { analyzeInventory } from '../hooks/useInventory'
import type { InventoryRecord } from '../types'

// ─── Test fixture ─────────────────────────────────────────────────────────────

function makeRecord(overrides: Partial<InventoryRecord> = {}): InventoryRecord {
  return {
    id: 'test-id',
    upload_id: 'upload-1',
    warehouse: 'WH1',
    product_code: 'TEST-001',
    description: 'Test Product',
    supplier_code: 'SUP-01',
    supplier_description: 'Test Vendor',
    brand_code: 'BR-01',
    brand_name: 'Test Brand',
    category_code: 'CAT-01',
    category_name: 'Test Category',
    on_hand: 100,
    days_on_hand: 30,
    cost_price: 10,
    on_hand_value: 1000,
    classification: 'A',
    velocity: 'H',
    status: 'Ok',
    status_units: 0,
    status_value: 0,
    excess_units: 0,
    excess_value: 0,
    recommended_order: 0,
    recommended_order_value: 0,
    recommended_order_days: 0,
    age: 0,
    average_sales: 30,
    average_forecasted_sales: 30,
    lt_days: 14,
    on_order: 0,
    back_orders: 0,
    total_customer_orders: 10,
    unsatisfied_customer_orders_units: 0,
    unsatisfied_customer_orders_value: 0,
    moq: 1,
    order_multiples: 1,
    selling_price: 20,
    ...overrides,
  }
}

// ─── Empty dataset ────────────────────────────────────────────────────────────

describe('analyzeInventory — empty dataset', () => {
  it('returns empty arrays for all item lists', () => {
    const result = analyzeInventory([], false)
    expect(result.atRiskItems).toHaveLength(0)
    expect(result.backorderItems).toHaveLength(0)
    expect(result.excessItems).toHaveLength(0)
    expect(result.inboundItems).toHaveLength(0)
    expect(result.records).toHaveLength(0)
  })

  it('returns zero KPIs', () => {
    const { kpis } = analyzeInventory([], false)
    expect(kpis.totalOnHandValue).toBe(0)
    expect(kpis.totalUnits).toBe(0)
    expect(kpis.atRiskCount).toBe(0)
    expect(kpis.excessCount).toBe(0)
    expect(kpis.fillRate).toBe(0)
    expect(kpis.totalSkus).toBe(0)
  })
})

// ─── At-risk classification ───────────────────────────────────────────────────

describe('analyzeInventory — at-risk items', () => {
  it('includes "Potential s/o" items with recommended_order > 0 in atRiskItems', () => {
    const r = makeRecord({ status: 'Potential s/o', recommended_order: 50, recommended_order_value: 500 })
    const { atRiskItems, kpis } = analyzeInventory([r], false)
    expect(atRiskItems).toHaveLength(1)
    expect(kpis.atRiskCount).toBe(1)
    expect(kpis.recOrderValue).toBe(500)
  })

  it('includes "Stocked out" items with recommended_order > 0 in atRiskItems', () => {
    const r = makeRecord({ status: 'Stocked out', recommended_order: 10, recommended_order_value: 100 })
    const { atRiskItems } = analyzeInventory([r], false)
    expect(atRiskItems).toHaveLength(1)
  })

  it('excludes "Potential s/o" items with recommended_order = 0 from atRiskItems', () => {
    // Still counted in atRiskCount KPI but not shown in the action table
    const r = makeRecord({ status: 'Potential s/o', recommended_order: 0 })
    const { atRiskItems, kpis } = analyzeInventory([r], false)
    expect(atRiskItems).toHaveLength(0)
    expect(kpis.atRiskCount).toBe(1) // counted in KPI regardless
  })

  it('does NOT include "Ok" items in atRiskItems', () => {
    const r = makeRecord({ status: 'Ok' })
    const { atRiskItems } = analyzeInventory([r], false)
    expect(atRiskItems).toHaveLength(0)
  })

  it('accumulates recOrderValue across multiple at-risk records', () => {
    const records = [
      makeRecord({ id: '1', status: 'Potential s/o', recommended_order: 10, recommended_order_value: 100 }),
      makeRecord({ id: '2', status: 'Stocked out',   recommended_order: 20, recommended_order_value: 200 }),
    ]
    const { kpis } = analyzeInventory(records, false)
    expect(kpis.recOrderValue).toBe(300)
  })
})

// ─── Excess classification ────────────────────────────────────────────────────

describe('analyzeInventory — excess items', () => {
  it('includes "Excess stock" items in excessItems', () => {
    const r = makeRecord({ status: 'Excess stock', on_hand_value: 2400, excess_value: 2000 })
    const { excessItems, kpis } = analyzeInventory([r], false)
    expect(excessItems).toHaveLength(1)
    expect(kpis.excessValue).toBe(2400)
    expect(kpis.excessCount).toBe(1)
  })

  it('includes "Surplus orders" items in excessItems', () => {
    const r = makeRecord({ status: 'Surplus orders', excess_value: 1500 })
    const { excessItems } = analyzeInventory([r], false)
    expect(excessItems).toHaveLength(1)
  })

  it('accumulates excessValue across multiple excess records', () => {
    const records = [
      makeRecord({ id: '1', status: 'Excess stock',   on_hand_value: 1800, excess_value: 1000 }),
      makeRecord({ id: '2', status: 'Surplus orders', on_hand_value: 700, excess_value: 500 }),
    ]
    const { kpis } = analyzeInventory(records, false)
    expect(kpis.excessValue).toBe(2500)
    expect(kpis.excessCount).toBe(2)
  })

  it('uses on-hand value for excessValue even when the CSV excess_value column differs', () => {
    const records = [
      makeRecord({ id: '1', status: 'Excess stock', on_hand_value: 3000, excess_value: 0 }),
      makeRecord({ id: '2', status: 'Surplus orders', on_hand_value: 2000, excess_value: 100 }),
    ]
    const { kpis } = analyzeInventory(records, false)

    expect(kpis.excessValue).toBe(5000)
  })

  it('does NOT include "Ok" items in excessItems', () => {
    const r = makeRecord({ status: 'Ok' })
    const { excessItems } = analyzeInventory([r], false)
    expect(excessItems).toHaveLength(0)
  })
})

// ─── Backorder classification ─────────────────────────────────────────────────

describe('analyzeInventory — backorder items', () => {
  it('includes items with unsatisfied_customer_orders_units > 0 in backorderItems', () => {
    const r = makeRecord({
      unsatisfied_customer_orders_units: 5,
      unsatisfied_customer_orders_value: 250,
    })
    const { backorderItems, kpis } = analyzeInventory([r], false)
    expect(backorderItems).toHaveLength(1)
    expect(kpis.backorderCount).toBe(1)
    expect(kpis.totalBackorderValue).toBe(250)
  })

  it('excludes items with unsatisfied_customer_orders_units = 0', () => {
    const r = makeRecord({ unsatisfied_customer_orders_units: 0 })
    const { backorderItems } = analyzeInventory([r], false)
    expect(backorderItems).toHaveLength(0)
  })

  it('a single item can be both at-risk AND a backorder', () => {
    const r = makeRecord({
      status: 'Potential s/o',
      recommended_order: 20,
      recommended_order_value: 200,
      unsatisfied_customer_orders_units: 3,
      unsatisfied_customer_orders_value: 150,
    })
    const { atRiskItems, backorderItems } = analyzeInventory([r], false)
    expect(atRiskItems).toHaveLength(1)
    expect(backorderItems).toHaveLength(1)
  })
})

// ─── Inbound classification ───────────────────────────────────────────────────

describe('analyzeInventory — inbound items', () => {
  it('includes items with on_order > 0 in inboundItems', () => {
    const r = makeRecord({ on_order: 100 })
    const { inboundItems } = analyzeInventory([r], false)
    expect(inboundItems).toHaveLength(1)
  })

  it('excludes items with on_order = 0', () => {
    const r = makeRecord({ on_order: 0 })
    const { inboundItems } = analyzeInventory([r], false)
    expect(inboundItems).toHaveLength(0)
  })
})

// ─── KPI aggregation ─────────────────────────────────────────────────────────

describe('analyzeInventory — KPI aggregation', () => {
  it('sums totalOnHandValue across all records', () => {
    const records = [
      makeRecord({ id: '1', on_hand_value: 1000 }),
      makeRecord({ id: '2', on_hand_value: 500 }),
    ]
    const { kpis } = analyzeInventory(records, false)
    expect(kpis.totalOnHandValue).toBe(1500)
  })

  it('sums totalUnits (on_hand) across all records', () => {
    const records = [
      makeRecord({ id: '1', on_hand: 100 }),
      makeRecord({ id: '2', on_hand: 50 }),
    ]
    const { kpis } = analyzeInventory(records, false)
    expect(kpis.totalUnits).toBe(150)
  })

  it('counts okCount for status = "Ok"', () => {
    const records = [
      makeRecord({ id: '1', status: 'Ok' }),
      makeRecord({ id: '2', status: 'Ok' }),
      makeRecord({ id: '3', status: 'Excess stock' }),
    ]
    const { kpis } = analyzeInventory(records, false)
    expect(kpis.okCount).toBe(2)
  })

  it('counts newItemCount for status = "New item"', () => {
    const r = makeRecord({ status: 'New item' })
    const { kpis } = analyzeInventory([r], false)
    expect(kpis.newItemCount).toBe(1)
  })

  it('totalSkus equals total record count', () => {
    const records = [
      makeRecord({ id: '1' }),
      makeRecord({ id: '2' }),
      makeRecord({ id: '3' }),
    ]
    const { kpis } = analyzeInventory(records, false)
    expect(kpis.totalSkus).toBe(3)
  })

  it('fillRate = okCount / activeSkus * 100', () => {
    // 2 OK, 1 At-Risk → 3 active (all have average_sales > 0) → 66.67%
    const records = [
      makeRecord({ id: '1', status: 'Ok',          average_sales: 10 }),
      makeRecord({ id: '2', status: 'Ok',          average_sales: 10 }),
      makeRecord({ id: '3', status: 'Potential s/o', average_sales: 10, recommended_order: 5, recommended_order_value: 50 }),
    ]
    const { kpis } = analyzeInventory(records, false)
    expect(kpis.fillRate).toBeCloseTo(66.67, 1)
  })

  it('fillRate = 0 when no active SKUs', () => {
    const r = makeRecord({ average_sales: 0, on_hand: 0 })
    const { kpis } = analyzeInventory([r], false)
    expect(kpis.fillRate).toBe(0)
  })

  it('passes isLoading through to kpis.isLoading', () => {
    expect(analyzeInventory([], true).kpis.isLoading).toBe(true)
    expect(analyzeInventory([], false).kpis.isLoading).toBe(false)
  })
})

// ─── Mixed scenario ───────────────────────────────────────────────────────────

describe('analyzeInventory — mixed real-world scenario', () => {
  it('correctly routes 5 records to the right buckets', () => {
    const records = [
      makeRecord({ id: '1', status: 'Ok',            on_hand_value: 1000 }),
      makeRecord({ id: '2', status: 'Potential s/o', on_hand_value: 200, recommended_order: 50, recommended_order_value: 500 }),
      makeRecord({ id: '3', status: 'Excess stock',  on_hand_value: 3000, excess_value: 1500 }),
      makeRecord({ id: '4', status: 'Stocked out',   on_hand_value: 0,    recommended_order: 100, recommended_order_value: 1000,
                   unsatisfied_customer_orders_units: 10, unsatisfied_customer_orders_value: 500 }),
      makeRecord({ id: '5', status: 'Ok',            on_hand: 0, on_hand_value: 0, average_sales: 0 }), // inactive SKU
    ]
    const { atRiskItems, backorderItems, excessItems, inboundItems, kpis } = analyzeInventory(records, false)

    expect(atRiskItems).toHaveLength(2)   // Potential s/o + Stocked out (both have rec_order > 0)
    expect(excessItems).toHaveLength(1)   // Excess stock
    expect(backorderItems).toHaveLength(1) // Stocked out with unsatisfied orders
    expect(inboundItems).toHaveLength(0)  // none have on_order > 0

    expect(kpis.totalSkus).toBe(5)
    expect(kpis.atRiskCount).toBe(2)
    expect(kpis.excessCount).toBe(1)
    expect(kpis.backorderCount).toBe(1)
    expect(kpis.totalOnHandValue).toBe(4200)
    expect(kpis.recOrderValue).toBe(1500)
    expect(kpis.excessValue).toBe(3000)
    expect(kpis.totalBackorderValue).toBe(500)

    // activeSkus = records 1-4 (record 5 has average_sales=0 AND on_hand=0 so inactive)
    expect(kpis.activeSkus).toBe(4)
    // okCount = 2 (records 1 and 5), fillRate = 2/4 * 100 = 50%
    // Wait — record 5 has status='Ok' AND is inactive. okCount counts status, activeSkus counts activity.
    // okCount=2, activeSkus=4 → fillRate = 50
    expect(kpis.okCount).toBe(2)
    expect(kpis.fillRate).toBeCloseTo(50, 0)
  })
})
