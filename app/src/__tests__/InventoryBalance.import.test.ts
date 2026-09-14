import { describe, it, expect } from 'vitest'
import {
  prepareReceiptImport,
  parseReceiptRows,
} from '../pages/purchasing/InventoryBalance.import'
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

const sc = {
  'PO#': 123,
  ProductID: 'SKU-1',
  QtyReceived: 2,
  ReceivedOn: '2026-01-05 15:58:21.280000',
  ReceiveSessionID: 456,
  WarehouseName: 'Main',
  UnitPrice: 12,
  DiscountedPrice: '10.5',
  AdjustedPriceAfterMultiDiscount: 10,
  ExtraCostPerUnit: 0.5,
  CurrencyRateToUSD: 0,
  'Currency Code': 'USD',
}
describe('original SellerCloud Inventory Arrivals export', () => {
  it('uses final discounted USD costs and extra costs despite a zero FX placeholder', () => {
    const [r] = parseReceiptRows([sc], '2026-01-01', '2026-01-31')
    expect(r).toMatchObject({
      received_date: '2026-01-05',
      po_id: '123',
      source_sku: 'SKU-1',
      unit_cost: 10.5,
      received_value: 21,
    })
  })
  it('keeps IDs stable when exports are reordered and distinguishes lines in a session', () => {
    const other = { ...sc, ProductID: 'SKU-2', QtyReceived: -1 }
    const a = parseReceiptRows([sc, other], '2026-01-01', '2026-01-31')
    const b = parseReceiptRows([other, sc], '2026-01-01', '2026-01-31')
    expect(a[0].receipt_id).toBe(b[1].receipt_id)
    expect(a[1].receipt_id).not.toBe(a[0].receipt_id)
    expect(a[1].received_value).toBe(-10.5)
    expect(() =>
      parseReceiptRows([sc, sc], '2026-01-01', '2026-01-31'),
    ).toThrow('duplicate')
  })
  it('accepts Excel date cells without moving the receipt day', () => {
    const [r] = parseReceiptRows(
      [{ ...sc, ReceivedOn: new Date('2026-01-05T00:00:00.000Z') }],
      '2026-01-01',
      '2026-01-31',
    )
    expect(r.received_date).toBe('2026-01-05')
  })
  it('preserves genuine zero cost and reports today separately', () => {
    const preview = prepareReceiptImport(
      [
        { ...sc, AdjustedPriceAfterMultiDiscount: 0, ExtraCostPerUnit: 0 },
        { ...sc, ReceivedOn: '2026-09-14 12:00:00' },
      ],
      '2026-01-01',
      '2026-09-13',
      '2026-09-14',
    )
    expect(preview.rows).toHaveLength(1)
    expect(preview.zeroCost).toBe(1)
    expect(preview.excludedToday).toBe(1)
  })
  it('rejects unsupported currencies, missing identity, invalid dates and unselected past dates', () => {
    for (const patch of [
      { 'Currency Code': 'CAD' },
      { ReceiveSessionID: '' },
      { ReceivedOn: '2026-02-30 12:00:00' },
    ]) {
      expect(() =>
        parseReceiptRows([{ ...sc, ...patch }], '2026-01-01', '2026-09-13'),
      ).toThrow()
    }
    expect(() =>
      prepareReceiptImport(
        [{ ...sc, ReceivedOn: '2026-09-12 12:00:00' }],
        '2026-01-01',
        '2026-09-10',
        '2026-09-14',
      ),
    ).toThrow('outside')
  })
})
