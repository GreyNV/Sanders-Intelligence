import { describe, expect, it } from 'vitest'
import {
  buildInventoryBalanceRows,
  inventoryBalanceMonthEnd,
  parseInventoryMoney,
} from '../pages/purchasing/InventoryBalance.helpers'

describe('InventoryBalance.helpers', () => {
  it('rolls monthly inventory balances forward from receipts and COGS', () => {
    expect(buildInventoryBalanceRows({
      settings: { beginning_period_month: '2026-04-01', beginning_inventory_value: 1000 },
      selectedPeriodMonth: '2026-06-01',
      receipts: [
        { period_month: '2026-04-01', received_value: 250 },
        { period_month: '2026-05-01', received_value: 500 },
        { period_month: '2026-06-01', received_value: -50 },
      ],
      sales: [
        { period_month: '2026-04-01', cogs_amount: 100, missing_cogs_count: 0 },
        { period_month: '2026-05-01', cogs_amount: 200, missing_cogs_count: 1 },
        { period_month: '2026-06-01', cogs_amount: 25, missing_cogs_count: 0 },
      ],
    })).toEqual([
      {
        period_month: '2026-04-01',
        first_date: '2026-04-01',
        end_date: '2026-04-30',
        beginning_inventory_value: 1000,
        po_received_value: 250,
        cogs_amount: 100,
        ending_inventory_value: 1150,
        missing_cogs_count: 0,
      },
      {
        period_month: '2026-05-01',
        first_date: '2026-05-01',
        end_date: '2026-05-31',
        beginning_inventory_value: 1150,
        po_received_value: 500,
        cogs_amount: 200,
        ending_inventory_value: 1450,
        missing_cogs_count: 1,
      },
      {
        period_month: '2026-06-01',
        first_date: '2026-06-01',
        end_date: '2026-06-30',
        beginning_inventory_value: 1450,
        po_received_value: -50,
        cogs_amount: 25,
        ending_inventory_value: 1375,
        missing_cogs_count: 0,
      },
    ])
  })

  it('returns an empty rollforward before an opening balance exists', () => {
    expect(buildInventoryBalanceRows({
      settings: null,
      selectedPeriodMonth: '2026-06-01',
      receipts: [{ period_month: '2026-06-01', received_value: 500 }],
      sales: [{ period_month: '2026-06-01', cogs_amount: 100, missing_cogs_count: 0 }],
    })).toEqual([])
  })

  it('formats the last day for each month in UTC', () => {
    expect(inventoryBalanceMonthEnd('2026-02-01')).toBe('2026-02-28')
    expect(inventoryBalanceMonthEnd('2028-02-01')).toBe('2028-02-29')
  })

  it('parses admin-entered money values safely', () => {
    expect(parseInventoryMoney('$1,234.56')).toBe(1234.56)
    expect(parseInventoryMoney('bad value')).toBe(0)
  })
})

