import type { InventoryRecord } from '@/types'
import { deriveFinancialPercentages } from '@/lib/financialMetrics'

interface InventoryProfitMetric {
  accrual_profit_today?: number | null
  accrual_profit_7d?: number | null
  accrual_profit_30d?: number | null
  revenue_30d?: number | null
}

interface InventoryPriceMetric {
  selling_price?: number | null
  price_source?: string | null
}

export interface InventoryMetricMaps {
  profitBySku: ReadonlyMap<string, InventoryProfitMetric>
  priceBySku: ReadonlyMap<string, InventoryPriceMetric>
}

export type InventoryRow = InventoryRecord & {
  sellingPrice: number | null
  priceSource: string | null
  profitToday: number | null
  profit7d: number | null
  profit30d: number | null
  cogsPct: number | null
}

export type InventorySortKey = keyof InventoryRow

export function buildInventoryRows(
  records: InventoryRecord[],
  metrics?: InventoryMetricMaps
): InventoryRow[] {
  return records.map(record => {
    const profit = metrics?.profitBySku.get(record.product_code)
    const price = metrics?.priceBySku.get(record.product_code)

    return {
      ...record,
      sellingPrice: finiteOrNull(price?.selling_price),
      priceSource: price?.price_source ?? null,
      profitToday: finiteOrNull(profit?.accrual_profit_today),
      profit7d: finiteOrNull(profit?.accrual_profit_7d),
      profit30d: finiteOrNull(profit?.accrual_profit_30d),
      cogsPct: deriveFinancialPercentages({
        revenue: finiteOrNull(profit?.revenue_30d) ?? 0,
        profit: finiteOrNull(profit?.accrual_profit_30d) ?? 0,
      }).cogsPct,
    }
  })
}

export function sortInventoryRows(
  rows: InventoryRow[],
  key: InventorySortKey,
  ascending: boolean
): InventoryRow[] {
  return [...rows].sort((a, b) => {
    const av = a[key]
    const bv = b[key]
    const aMissing = av == null
    const bMissing = bv == null

    if (aMissing && bMissing) return 0
    if (aMissing) return 1
    if (bMissing) return -1

    const direction = ascending ? 1 : -1
    if (typeof av === 'number' && typeof bv === 'number') {
      return (av - bv) * direction
    }
    return String(av).localeCompare(String(bv)) * direction
  })
}

export function buildSortedOptionList(values: Array<string | null | undefined>, allLabel = 'All'): string[] {
  return [allLabel, ...Array.from(new Set(values)).filter((value): value is string => !!value).sort()]
}

function finiteOrNull(value: number | null | undefined): number | null {
  return value != null && Number.isFinite(value) ? value : null
}
