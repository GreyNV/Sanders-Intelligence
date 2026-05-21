import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

const PAGE_SIZE = 1000

export interface SkuProfitMetric {
  planning_sku: string
  metric_date: string
  units_today: number
  revenue_today: number
  accrual_profit_today: number
  cash_profit_today: number
  units_7d: number
  revenue_7d: number
  accrual_profit_7d: number
  cash_profit_7d: number
  units_30d: number
  revenue_30d: number
  accrual_profit_30d: number
  cash_profit_30d: number
  matched_source_skus: number
  match_methods: string[]
  refreshed_at: string
}

export interface SkuPriceMetric {
  planning_sku: string
  price_date: string
  selling_price: number | null
  price_min: number | null
  price_max: number | null
  price_avg: number | null
  price_source: string | null
  price_source_count: number
  refreshed_at: string
}

export interface SkuMetricBundle {
  profitBySku: Map<string, SkuProfitMetric>
  priceBySku: Map<string, SkuPriceMetric>
}

async function fetchAll<T>(table: string): Promise<T[]> {
  const all: T[] = []
  let from = 0

  while (true) {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .range(from, from + PAGE_SIZE - 1)

    if (error) {
      if (error.code === '42P01') return []
      throw error
    }
    if (!data || data.length === 0) break

    all.push(...(data as T[]))
    if (data.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }

  return all
}

function bySku<T extends { planning_sku: string }>(rows: T[]): Map<string, T> {
  return new Map(rows.map(row => [row.planning_sku, row]))
}

async function fetchSkuMetrics(): Promise<SkuMetricBundle> {
  const [profitRows, priceRows] = await Promise.all([
    fetchAll<SkuProfitMetric>('sku_profit_metrics'),
    fetchAll<SkuPriceMetric>('sku_price_metrics'),
  ])

  return {
    profitBySku: bySku(profitRows),
    priceBySku: bySku(priceRows),
  }
}

export function useSkuMetrics() {
  return useQuery({
    queryKey: ['sku_metrics'],
    queryFn: fetchSkuMetrics,
    staleTime: 10 * 60 * 1000,
  })
}
