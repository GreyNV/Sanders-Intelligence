import type { HistoricalStatementMonth } from './financeHistoricalStatements'

export interface GrowthScenarioMonth {
  month: string
  priorYearIncome: number | null
  goalSales: number | null
  goalNoi: number | null
  goalNoiPct: number | null
}

/**
 * Compare the existing budget-fulfillment forecast with a separate 30% growth
 * goal. The cost rate and fixed run rate must be those from that forecast;
 * neither a missing baseline nor missing costs are treated as zero.
 */
export function buildGrowthScenario(
  forecastMonths: string[],
  history: HistoricalStatementMonth[],
  variableCostPct: number | null,
  monthlyFixedCosts: number | null,
  growthRate = 0.3,
): GrowthScenarioMonth[] {
  const historyByMonth = new Map(history.map(row => [row.month, row]))
  return forecastMonths.map(month => {
    const match = /^(\d{4})-(\d{2})-01$/.exec(month)
    const priorMonth = match ? `${Number(match[1]) - 1}-${match[2]}-01` : ''
    const priorYearIncome = historyByMonth.get(priorMonth)?.income ?? null
    const goalSales = priorYearIncome !== null && priorYearIncome > 0 && Number.isFinite(growthRate) && growthRate > -1
      ? priorYearIncome * (1 + growthRate) : null
    const goalNoi = goalSales !== null && variableCostPct !== null && monthlyFixedCosts !== null &&
      Number.isFinite(variableCostPct) && Number.isFinite(monthlyFixedCosts) && monthlyFixedCosts >= 0
      ? goalSales * (1 - variableCostPct) - monthlyFixedCosts : null
    return {
      month,
      priorYearIncome,
      goalSales,
      goalNoi,
      goalNoiPct: goalNoi !== null && goalSales !== null && goalSales > 0 ? goalNoi / goalSales : null,
    }
  })
}
