export interface RevenueProfitMetric {
  revenue: number
  profit: number
  units?: number
}

export interface FinancialPercentages {
  cogsPct: number | null
  marginPct: number | null
}

export function deriveFinancialPercentages(metric: RevenueProfitMetric): FinancialPercentages {
  if (metric.revenue <= 0 || !Number.isFinite(metric.revenue) || !Number.isFinite(metric.profit)) {
    return { cogsPct: null, marginPct: null }
  }

  return {
    cogsPct: ((metric.revenue - metric.profit) / metric.revenue) * 100,
    marginPct: (metric.profit / metric.revenue) * 100,
  }
}
