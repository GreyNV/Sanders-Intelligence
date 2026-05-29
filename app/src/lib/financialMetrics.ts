import type { InventoryRecord } from '@/types'

export interface RevenueProfitMetric {
  revenue: number
  profit: number
  units?: number
}

export type ExcessValueRecord = Pick<InventoryRecord, 'status' | 'on_hand_value'>

export interface FinancialPercentages {
  cogsPct: number | null
  marginPct: number | null
}

export function sumExcessValue(records: readonly ExcessValueRecord[]): number {
  return records.reduce((total, record) => {
    if (record.status !== 'Excess stock' && record.status !== 'Surplus orders') {
      return total
    }

    const value = Number(record.on_hand_value ?? 0)
    return Number.isFinite(value) ? total + value : total
  }, 0)
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
