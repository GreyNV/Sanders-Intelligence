import type { InventoryRecord } from '@/types'

export type VendorSkuSortState = {
  field: keyof Pick<InventoryRecord, 'product_code' | 'description' | 'category_name' | 'on_hand' | 'days_on_hand' | 'recommended_order' | 'status'>
  dir: 'asc' | 'desc'
}

export function isVendorViewAtRiskSku(record: InventoryRecord): boolean {
  return record.status === 'Potential s/o' || record.status === 'Stocked out'
}

export function getVendorViewAtRiskSkus(records: InventoryRecord[]): InventoryRecord[] {
  return records.filter(isVendorViewAtRiskSku)
}

export function getVendorSkuRows(
  records: InventoryRecord[],
  query: string,
  sort: VendorSkuSortState | null
): InventoryRecord[] {
  const q = query.trim().toLowerCase()
  const filtered = q
    ? records.filter(record =>
      record.product_code.toLowerCase().includes(q) ||
      record.description.toLowerCase().includes(q) ||
      record.category_name.toLowerCase().includes(q) ||
      record.status.toLowerCase().includes(q)
    )
    : records

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

function compareDefaultVendorSkuRows(a: InventoryRecord, b: InventoryRecord): number {
  const aRisk = isVendorViewAtRiskSku(a) ? 0 : 1
  const bRisk = isVendorViewAtRiskSku(b) ? 0 : 1
  if (aRisk !== bRisk) return aRisk - bRisk
  return a.days_on_hand - b.days_on_hand
}
