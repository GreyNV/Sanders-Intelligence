import { describe, expect, it } from 'vitest'
import { deriveFinancialPercentages, sumExcessValue, type ExcessValueRecord } from '../lib/financialMetrics'

function makeRecord(overrides: Partial<ExcessValueRecord> = {}): ExcessValueRecord {
  return {
    status: 'Ok',
    on_hand_value: 0,
    ...overrides,
  }
}

describe('sumExcessValue', () => {
  it('returns 0 for empty input', () => {
    expect(sumExcessValue([])).toBe(0)
  })

  it('returns 0 when no rows are in excess statuses', () => {
    expect(sumExcessValue([
      makeRecord({ status: 'Ok', on_hand_value: 100 }),
      makeRecord({ status: 'Potential s/o', on_hand_value: 200 }),
      makeRecord({ status: 'Stocked out', on_hand_value: 300 }),
      makeRecord({ status: 'New item', on_hand_value: 400 }),
    ])).toBe(0)
  })

  it('sums on-hand value for Excess stock and Surplus orders only', () => {
    expect(sumExcessValue([
      makeRecord({ status: 'Ok', on_hand_value: 100 }),
      makeRecord({ status: 'Excess stock', on_hand_value: 250 }),
      makeRecord({ status: 'Surplus orders', on_hand_value: 400 }),
      makeRecord({ status: 'Potential s/o', on_hand_value: 800 }),
    ])).toBe(650)
  })

  it('ignores divergent CSV excess_value fields by relying only on on_hand_value', () => {
    const records = [
      { ...makeRecord({ status: 'Excess stock', on_hand_value: 300 }), excess_value: 9999 },
      { ...makeRecord({ status: 'Surplus orders', on_hand_value: 700 }), excess_value: 0 },
    ]

    expect(sumExcessValue(records)).toBe(1000)
  })

  it('treats nullish and non-finite on-hand values as 0', () => {
    expect(sumExcessValue([
      makeRecord({ status: 'Excess stock', on_hand_value: null as unknown as number }),
      makeRecord({ status: 'Surplus orders', on_hand_value: Number.NaN }),
      makeRecord({ status: 'Excess stock', on_hand_value: 125 }),
    ])).toBe(125)
  })

  it('is pure for repeated calls with the same rows', () => {
    const records = [
      makeRecord({ status: 'Excess stock', on_hand_value: 10 }),
      makeRecord({ status: 'Surplus orders', on_hand_value: 20 }),
    ]

    expect(sumExcessValue(records)).toBe(30)
    expect(sumExcessValue(records)).toBe(30)
  })
})

describe('deriveFinancialPercentages', () => {
  it('derives COGS and margin percentages from revenue and profit', () => {
    expect(deriveFinancialPercentages({ revenue: 100, profit: 25 })).toEqual({
      cogsPct: 75,
      marginPct: 25,
    })
  })
})
