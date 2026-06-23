import type { InventoryRecord } from '@/types'

export type ActionCenterSortDir = 'asc' | 'desc'

export interface ActionCenterSortState {
  field: string
  dir: ActionCenterSortDir
}

export function shouldShowActionCenterTableLoading({
  isLoading,
  inventoryRowsSettling,
}: {
  isLoading: boolean
  inventoryRowsSettling: boolean
}): boolean {
  return isLoading || inventoryRowsSettling
}

export interface RecordCategoryGroup {
  category: string
  records: InventoryRecord[]
}

export interface RecordVendorGroup {
  vendor: string
  records: InventoryRecord[]
  categories: RecordCategoryGroup[]
}

export function sortActionCenterRecords(
  records: InventoryRecord[],
  sort: ActionCenterSortState
): InventoryRecord[] {
  return [...records].sort((a, b) => {
    const av = (a as unknown as Record<string, unknown>)[sort.field]
    const bv = (b as unknown as Record<string, unknown>)[sort.field]

    if (typeof av === 'number' && typeof bv === 'number') {
      return sort.dir === 'asc' ? av - bv : bv - av
    }

    return sort.dir === 'asc'
      ? String(av).localeCompare(String(bv))
      : String(bv).localeCompare(String(av))
  })
}

export function groupRecordsByVendorCategory(records: InventoryRecord[]): RecordVendorGroup[] {
  const vendorMap = new Map<string, Map<string, InventoryRecord[]>>()

  for (const record of records) {
    const vendor = record.supplier_description || 'Unknown vendor'
    const category = record.category_name || 'Uncategorized'
    if (!vendorMap.has(vendor)) vendorMap.set(vendor, new Map())
    const categoryMap = vendorMap.get(vendor)!
    if (!categoryMap.has(category)) categoryMap.set(category, [])
    categoryMap.get(category)!.push(record)
  }

  return Array.from(vendorMap.entries()).map(([vendor, categoryMap]) => {
    const categories = Array.from(categoryMap.entries()).map(([category, groupRecords]) => ({
      category,
      records: groupRecords,
    }))

    return {
      vendor,
      records: categories.flatMap(group => group.records),
      categories,
    }
  })
}

export function getVisibleOverstockRows(
  records: InventoryRecord[],
  withOrdersView: ActionCenterTableView,
  noOrdersView: ActionCenterTableView,
  limit = 100
): { withOrders: InventoryRecord[]; noOrders: InventoryRecord[] } {
  return {
    withOrders: getVisibleActionCenterRows(records.filter(r => r.on_order > 0), withOrdersView, limit),
    noOrders: getVisibleActionCenterRows(records.filter(r => r.on_order === 0), noOrdersView, limit),
  }
}

export interface ActionCenterTableView {
  sort: ActionCenterSortState
  vendor: string
  category: string
}

export function getVisibleActionCenterRows(
  records: InventoryRecord[],
  view: ActionCenterTableView,
  limit: number
): InventoryRecord[] {
  let rows = records
  if (view.vendor) rows = rows.filter(r => r.supplier_description === view.vendor)
  if (view.category) rows = rows.filter(r => r.category_name === view.category)

  return sortActionCenterRecords(rows, view.sort).slice(0, limit)
}
