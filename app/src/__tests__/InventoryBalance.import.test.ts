import { describe, it, expect } from 'vitest'
import { parseReceiptRows } from '../pages/purchasing/InventoryBalance.import'
const row = {
  receipt_id: 'r1',
  received_date: '2026-01-05',
  po_id: '123',
  sku: 'sku',
  quantity: '2',
  unit_cost: '$10.50',
}
describe('dated receipt imports', () => {
  it('preserves real receipt dates, partial receipts and reversals', () => {
    expect(
      parseReceiptRows(
        [row, { ...row, receipt_id: 'r2', quantity: '-1' }],
        '2026-01-01',
        '2026-01-31',
      ).map((r) => r.received_value),
    ).toEqual([21, -10.5])
  })
  it('rejects duplicates, invalid costs and receipts outside the declared window', () => {
    expect(() =>
      parseReceiptRows([row, row], '2026-01-01', '2026-01-31'),
    ).toThrow('duplicate')
    expect(() =>
      parseReceiptRows(
        [{ ...row, unit_cost: 'oops' }],
        '2026-01-01',
        '2026-01-31',
      ),
    ).toThrow('invalid')
    expect(() => parseReceiptRows([row], '2026-02-01', '2026-02-28')).toThrow(
      'outside',
    )
  })
})
