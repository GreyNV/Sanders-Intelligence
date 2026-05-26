import type { InventoryRecord, InventoryStatus } from '@/types'
import { deriveFinancialPercentages } from '@/lib/financialMetrics'
import { fmtCurrency, fmtNumber } from '@/lib/utils'

export const SKU_SELECTOR_STATUS_OPTIONS: InventoryStatus[] = [
  'Ok',
  'Excess stock',
  'Surplus orders',
  'Potential s/o',
  'Stocked out',
  'New item',
]

export type SkuSelectorSortField =
  | 'product_code'
  | 'description'
  | 'supplier_description'
  | 'category_name'
  | 'status'
  | 'on_hand'
  | 'days_on_hand'
  | 'recommended_order'
  | 'recommended_order_value'
  | 'marginPct'

export interface SkuSelectorSortState {
  field: SkuSelectorSortField
  dir: 'asc' | 'desc'
}

interface SkuSelectorFilters {
  vendor?: string
  status?: string | string[]
  category?: string
}

interface SkuSelectorProfitMetric {
  revenue_30d?: number | null
  accrual_profit_30d?: number | null
}

export type SkuSelectorRow = InventoryRecord & {
  marginPct: number | null
}

const STATUS_SEVERITY: Record<string, number> = {
  'Ok': 0,
  'New item': 1,
  'Surplus orders': 2,
  'Excess stock': 3,
  'Potential s/o': 4,
  'Stocked out': 5,
}

export function buildVendorTaskDescription(vendor: string, skus: InventoryRecord[]): string {
  if (!vendor || skus.length === 0) return ''

  const lines = [
    `Vendor: ${vendor}`,
    `At-Risk SKUs (${skus.length}):`,
    ...skus.map(r =>
      `- ${r.product_code} - ${r.description} | Days OH: ${r.days_on_hand}d | Rec. Order: ${fmtNumber(r.recommended_order)} units (${fmtCurrency(r.recommended_order_value)})`
    ),
  ]

  return lines.join('\n')
}

export function filterSkuSelectorRows<T extends InventoryRecord>(
  records: T[],
  query: string,
  filters: SkuSelectorFilters = {}
): T[] {
  const q = query.trim().toLowerCase()
  const statuses = Array.isArray(filters.status) ? filters.status : filters.status ? [filters.status] : []

  return records.filter(r =>
    (!filters.vendor || r.supplier_description === filters.vendor) &&
    (statuses.length === 0 || statuses.includes(r.status)) &&
    (!filters.category || r.category_name === filters.category) &&
    (!q ||
      r.product_code.toLowerCase().includes(q) ||
      r.description.toLowerCase().includes(q) ||
      r.supplier_description.toLowerCase().includes(q) ||
      r.brand_name.toLowerCase().includes(q) ||
      r.category_name.toLowerCase().includes(q)
    )
  )
}

export function buildSkuSelectorRows(
  records: InventoryRecord[],
  profitBySku?: ReadonlyMap<string, SkuSelectorProfitMetric>
): SkuSelectorRow[] {
  return records.map(record => {
    const profit = profitBySku?.get(record.product_code)

    return {
      ...record,
      marginPct: deriveFinancialPercentages({
        revenue: profit?.revenue_30d ?? 0,
        profit: profit?.accrual_profit_30d ?? 0,
      }).marginPct,
    }
  })
}

export function sortSkuSelectorRows<T extends InventoryRecord & { marginPct?: number | null }>(
  records: T[],
  sort: SkuSelectorSortState,
  selectedSkuCodes: Set<string>
): T[] {
  const direction = sort.dir === 'asc' ? 1 : -1

  return [...records].sort((a, b) => {
    const missingValueOrder = compareMissingValues(a, b, sort.field)
    if (missingValueOrder !== 0) return missingValueOrder

    const primary = compareSkuSelectorField(a, b, sort.field) * direction
    if (primary !== 0) return primary

    const selectedCmp = Number(selectedSkuCodes.has(b.product_code)) - Number(selectedSkuCodes.has(a.product_code))
    if (selectedCmp !== 0) return selectedCmp

    return a.product_code.localeCompare(b.product_code)
  })
}

function compareSkuSelectorField(
  a: InventoryRecord & { marginPct?: number | null },
  b: InventoryRecord & { marginPct?: number | null },
  field: SkuSelectorSortField
): number {
  if (field === 'status') {
    return (STATUS_SEVERITY[a.status] ?? 99) - (STATUS_SEVERITY[b.status] ?? 99)
  }

  const av = a[field]
  const bv = b[field]

  if (typeof av === 'number' && typeof bv === 'number') return av - bv
  return String(av).localeCompare(String(bv))
}

function compareMissingValues(
  a: InventoryRecord & { marginPct?: number | null },
  b: InventoryRecord & { marginPct?: number | null },
  field: SkuSelectorSortField
): number {
  const av = a[field]
  const bv = b[field]
  const aMissing = av == null
  const bMissing = bv == null

  if (aMissing && bMissing) return 0
  if (aMissing) return 1
  if (bMissing) return -1
  return 0
}

export function dedupeInventoryRecords(records: InventoryRecord[]): InventoryRecord[] {
  const seen = new Set<string>()
  const unique: InventoryRecord[] = []

  for (const record of records) {
    if (seen.has(record.product_code)) continue
    seen.add(record.product_code)
    unique.push(record)
  }

  return unique
}
