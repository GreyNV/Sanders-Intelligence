import type { InventoryRecord } from '@/types'

export function isVendorViewAtRiskSku(record: InventoryRecord): boolean {
  return record.status === 'Potential s/o' || record.status === 'Stocked out'
}

export function getVendorViewAtRiskSkus(records: InventoryRecord[]): InventoryRecord[] {
  return records.filter(isVendorViewAtRiskSku)
}
