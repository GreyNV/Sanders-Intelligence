import { describe, it, expect } from 'vitest'
// @ts-expect-error shared Node module
import { summarizeOrderCosts, fetchDayCosts } from '../../scripts/lib/inventory-cogs.mjs'

describe('inventory COGS backfill', () => {
  it('uses each order once, preserves zero and negative costs, and flags missing values', () => {
    expect(
      summarizeOrderCosts(
        [{ ID: 1 }, { ID: 2 }, { ID: 3 }, { ID: 4 }],
        [
          { OrderID: 1, OrderCostUsd: 100 },
          { OrderID: 2, OrderCostUsd: 0 },
          { OrderID: 3, OrderCostUsd: -20 },
        ],
      ),
    ).toEqual({ cogs_amount: 80, order_count: 4, missing_cost_count: 1 })
    expect(() => summarizeOrderCosts([{ ID: 1 }, { ID: 1 }], [])).toThrow(
      'duplicate',
    )
  })
  it('refuses to certify a partial page sequence', async () => {
    let calls = 0
    const get = async () =>
      ++calls === 1
        ? { Items: [{ ID: 1 }], TotalResults: 3 }
        : { Items: [], TotalResults: 3 }
    await expect(
      fetchDayCosts(get, async () => [], '2026-01-01', 1),
    ).rejects.toThrow('Incomplete')
  })
  it('records confirmed zero-order days', async () => {
    const result = await fetchDayCosts(
      async () => ({ Items: [], TotalResults: 0 }),
      async () => [],
      '2026-01-01',
    )
    expect(result).toMatchObject({
      sale_date: '2026-01-01',
      cogs_amount: 0,
      order_count: 0,
      missing_cost_count: 0,
    })
  })
})
