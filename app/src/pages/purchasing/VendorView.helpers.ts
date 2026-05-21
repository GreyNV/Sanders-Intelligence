import type { InventoryRecord } from '@/types'

export type VendorSkuSortState = {
  field: keyof Pick<InventoryRecord, 'product_code' | 'description' | 'category_name' | 'on_hand' | 'days_on_hand' | 'recommended_order' | 'recommended_order_value' | 'status'>
  dir: 'asc' | 'desc'
}

interface VendorSkuFilters {
  status?: string | string[]
  category?: string
}

export type VendorMetricWindow = 'today' | '7d' | '30d'

export interface VendorWindowMetric {
  revenue: number
  profit: number
  units: number
  cogsPct: number | null
  avgSellingPrice: number | null
}

export interface VendorWindowMetrics {
  today: VendorWindowMetric
  '7d': VendorWindowMetric
  '30d': VendorWindowMetric
  hasMetrics: boolean
}

type ProfitMetricLike = Partial<Record<
  | 'units_today'
  | 'revenue_today'
  | 'accrual_profit_today'
  | 'units_7d'
  | 'revenue_7d'
  | 'accrual_profit_7d'
  | 'units_30d'
  | 'revenue_30d'
  | 'accrual_profit_30d',
  number
>>

export function isVendorViewAtRiskSku(record: InventoryRecord): boolean {
  return record.status === 'Potential s/o' || record.status === 'Stocked out'
}

export function getVendorViewAtRiskSkus(records: InventoryRecord[]): InventoryRecord[] {
  return records.filter(isVendorViewAtRiskSku)
}

export function getVendorSkuRows(
  records: InventoryRecord[],
  query: string,
  sort: VendorSkuSortState | null,
  filters: VendorSkuFilters = {}
): InventoryRecord[] {
  const q = query.trim().toLowerCase()
  const statuses = Array.isArray(filters.status) ? filters.status : filters.status ? [filters.status] : []
  const filtered = records.filter(record =>
    (statuses.length === 0 || statuses.includes(record.status)) &&
    (!filters.category || record.category_name === filters.category) &&
    (!q ||
      record.product_code.toLowerCase().includes(q) ||
      record.description.toLowerCase().includes(q) ||
      record.category_name.toLowerCase().includes(q) ||
      record.status.toLowerCase().includes(q)
    )
  )

  return [...filtered].sort((a, b) => {
    if (!sort) return compareDefaultVendorSkuRows(a, b)

    const av = a[sort.field]
    const bv = b[sort.field]
    const direction = sort.dir === 'asc' ? 1 : -1

    if (typeof av === 'string' || typeof bv === 'string') {
      return String(av).localeCompare(String(bv)) * direction
    }

    return (Number(av) - Number(bv)) * direction
  })
}

export function buildVendorWindowMetrics(
  records: InventoryRecord[],
  profitBySku: Map<string, ProfitMetricLike>
): VendorWindowMetrics {
  const windows: VendorMetricWindow[] = ['today', '7d', '30d']
  const totals: Record<VendorMetricWindow, { revenue: number; profit: number; units: number }> = {
    today: { revenue: 0, profit: 0, units: 0 },
    '7d': { revenue: 0, profit: 0, units: 0 },
    '30d': { revenue: 0, profit: 0, units: 0 },
  }
  let hasMetrics = false

  for (const record of records) {
    const metric = profitBySku.get(record.product_code)
    if (!metric) continue
    hasMetrics = true

    for (const window of windows) {
      totals[window].units += Number(metric[`units_${window}`] ?? 0)
      totals[window].revenue += Number(metric[`revenue_${window}`] ?? 0)
      totals[window].profit += Number(metric[`accrual_profit_${window}`] ?? 0)
    }
  }

  return {
    today: deriveWindowMetric(totals.today),
    '7d': deriveWindowMetric(totals['7d']),
    '30d': deriveWindowMetric(totals['30d']),
    hasMetrics,
  }
}

function deriveWindowMetric(total: { revenue: number; profit: number; units: number }): VendorWindowMetric {
  return {
    ...total,
    cogsPct: total.revenue > 0 ? ((total.revenue - total.profit) / total.revenue) * 100 : null,
    avgSellingPrice: total.units > 0 ? total.revenue / total.units : null,
  }
}

function compareDefaultVendorSkuRows(a: InventoryRecord, b: InventoryRecord): number {
  const aRisk = isVendorViewAtRiskSku(a) ? 0 : 1
  const bRisk = isVendorViewAtRiskSku(b) ? 0 : 1
  if (aRisk !== bRisk) return aRisk - bRisk
  return a.days_on_hand - b.days_on_hand
}
