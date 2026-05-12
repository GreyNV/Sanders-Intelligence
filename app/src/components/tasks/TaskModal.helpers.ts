import type { InventoryRecord } from '@/types'
import { fmtCurrency, fmtNumber } from '@/lib/utils'

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

export function filterSkuSelectorRows(records: InventoryRecord[], query: string): InventoryRecord[] {
  const q = query.trim().toLowerCase()
  if (!q) return records

  return records.filter(r =>
    r.product_code.toLowerCase().includes(q) ||
    r.description.toLowerCase().includes(q) ||
    r.supplier_description.toLowerCase().includes(q) ||
    r.brand_name.toLowerCase().includes(q) ||
    r.category_name.toLowerCase().includes(q)
  )
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
