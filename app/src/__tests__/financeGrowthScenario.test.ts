import { describe, expect, it } from 'vitest'
import { buildGrowthScenario } from '@/lib/financeGrowthScenario'

describe('30% income goal scenario', () => {
  it('applies growth to the matching prior-year month and the forecast cost assumptions', () => {
    const [result] = buildGrowthScenario(['2026-11-01'], [{ month: '2025-11-01', income: 1000, cogs: null, expenses: null, ordinaryIncome: null, netIncome: null }], 0.6, 300)
    expect(result.goalSales).toBe(1300)
    expect(result.goalNoi).toBe(220)
    expect(result.goalNoiPct).toBeCloseTo(220 / 1300)
  })

  it('leaves unavailable cost inputs and historical months pending', () => {
    const [noCosts, noPriorYear] = buildGrowthScenario(['2026-11-01', '2026-12-01'], [{ month: '2025-11-01', income: 1000, cogs: null, expenses: null, ordinaryIncome: null, netIncome: null }], null, 300)
    expect(noCosts.goalSales).toBe(1300)
    expect(noCosts.goalNoi).toBeNull()
    expect(noPriorYear.goalSales).toBeNull()
  })
})
