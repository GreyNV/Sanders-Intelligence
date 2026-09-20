import { describe, it, expect } from 'vitest'
import { fetchInventoryBalance } from '../hooks/useInventoryBalance'
function client(start = '2026-01-01') {
  const query = {
    select: () => query,
    eq: () => query,
    maybeSingle: async () => ({
      data: { beginning_period_month: start, beginning_inventory_value: 1000 },
      error: null,
    }),
  }
  return {
    from: () => query,
    rpc: async () => ({
      data: [
        {
          period_month: start,
          po_received_value: 200,
          cogs_amount: 150,
          missing_cogs_count: 1,
          receipt_count: 2,
          receipt_covered_days: 0,
          cogs_covered_days: 31,
          expected_days: 31,
          observed_receipt_value: 200,
        },
      ],
      error: null,
    }),
  }
}
describe('inventory balance history', () => {
  it('rolls up server totals and retains coverage independently of the opening balance', async () => {
    const result = await fetchInventoryBalance('2026-01-01', client() as never)
    expect(result.selectedRow?.ending_inventory_value).toBe(1050)
    expect(result.coverage[0].receipt_covered_days).toBe(0)
    expect(result.missingCogsRows).toBe(1)
  })
  it('supports moving the opening month forward or back without mutating history', async () => {
    for (const month of ['2026-03-01', '2026-01-01']) {
      const result = await fetchInventoryBalance(month, client(month) as never)
      expect(result.rows[0].period_month).toBe(month)
      expect(result.rows[0].beginning_inventory_value).toBe(1000)
    }
  })
  it('reports a missing aggregation function as setup required', async () => {
    const mock = {
      ...client(),
      rpc: async () => ({ data: null, error: { code: 'PGRST202' } }),
    }
    expect(
      (await fetchInventoryBalance('2026-01-01', mock as never)).setupRequired,
    ).toBe(true)
  })
})

it('bounds history requests to individual months and combines their balances', async () => {
  const ranges: Array<{ p_from: string; p_to: string }> = []
  const mock = { ...client(), rpc: async (_name: string, range: { p_from: string; p_to: string }) => {
    ranges.push(range)
    return { data: [{ period_month: range.p_from, po_received_value: 200, cogs_amount: 150, missing_cogs_count: 0, receipt_count: 1, receipt_covered_days: 28, cogs_covered_days: 28, expected_days: 28, observed_receipt_value: 0 }], error: null }
  } }
  const result = await fetchInventoryBalance('2026-03-01', mock as never)
  expect(ranges).toEqual([
    { p_from: '2026-01-01', p_to: '2026-01-31' },
    { p_from: '2026-02-01', p_to: '2026-02-28' },
    { p_from: '2026-03-01', p_to: '2026-03-31' },
  ])
  expect(result.selectedRow?.ending_inventory_value).toBe(1150)
})