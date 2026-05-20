import type { InventoryRecord, InventoryStatus } from '@/types'
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

export interface SkuSelectorSortState {
  field: SkuSelectorSortField
  dir: 'asc' | 'desc'
}

interface SkuSelectorFilters {
  vendor?: string
  status?: string | string[]
  category?: string
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

export function filterSkuSelectorRows(
  records: InventoryRecord[],
  query: string,
  filters: SkuSelectorFilters = {}
): InventoryRecord[] {
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

export function sortSkuSelectorRows(
  records: InventoryRecord[],
  sort: SkuSelectorSortState,
  selectedSkuCodes: Set<string>
): InventoryRecord[] {
  const direction = sort.dir === 'asc' ? 1 : -1

  return [...records].sort((a, b) => {
    const primary = compareSkuSelectorField(a, b, sort.field) * direction
    if (primary !== 0) return primary

    const selectedCmp = Number(selectedSkuCodes.has(b.product_code)) - Number(selectedSkuCodes.has(a.product_code))
    if (selectedCmp !== 0) return selectedCmp

    return a.product_code.localeCompare(b.product_code)
  })
}

function compareSkuSelectorField(
  a: InventoryRecord,
  b: InventoryRecord,
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
