import type { POItem, POStatus, PurchaseOrder } from '@/types'

export type PurchaseOrderSortField =
  | 'id'
  | 'purchase_title'
  | 'vendor_id'
  | 'po_status'
  | 'date_ordered'
  | 'expected_delivery_date'
  | 'grand_total'
  | 'receiving_status'
  | 'unit_counts'

export interface PurchaseOrderFilters {
  query: string
  statuses: string[]
  dateFrom: string
  dateTo: string
}

export interface PurchaseOrderSortState {
  field: PurchaseOrderSortField
  dir: 'asc' | 'desc'
}

export function formatPOStatus(status: POStatus): string {
  if (!status) return 'Unknown'
  return String(status).replace(/([a-z])([A-Z])/g, '$1 $2')
}

export function poStatusVariant(status: POStatus): 'ok' | 'done' | 'info' | 'warning' | 'danger' | 'neutral' {
  if (status === 'Received' || status === 'Completed') return 'done'
  if (status === 'Ordered') return 'info'
  if (status === 'Pending') return 'warning'
  if (status === 'Cancelled') return 'danger'
  if (status === 'Saved') return 'neutral'
  return 'neutral'
}

export function poLineTotal(item: POItem): number | null {
  if (item.qty_units_ordered == null || item.unit_price == null) return null
  return item.qty_units_ordered * item.unit_price
}

export function countUnmatchedPOItems(items: POItem[]): number {
  return items.filter(item => !item.planning_sku).length
}

export function filterPurchaseOrders(
  orders: PurchaseOrder[],
  filters: PurchaseOrderFilters
): PurchaseOrder[] {
  const q = filters.query.trim().toLowerCase()
  return orders.filter(order => {
    if (filters.statuses.length > 0 && !filters.statuses.includes(order.po_status)) return false
    if (filters.dateFrom && (!order.date_ordered || order.date_ordered.slice(0, 10) < filters.dateFrom)) return false
    if (filters.dateTo && (!order.date_ordered || order.date_ordered.slice(0, 10) > filters.dateTo)) return false
    if (!q) return true

    return [
      order.id,
      order.purchase_title,
      order.vendor_id,
      order.po_status,
      order.payment_status,
      order.shipping_status,
      order.receiving_status,
      order.memo,
    ].some(value => String(value ?? '').toLowerCase().includes(q))
  })
}

export function sortPurchaseOrders(
  orders: PurchaseOrder[],
  sort: PurchaseOrderSortState
): PurchaseOrder[] {
  return [...orders].sort((a, b) => {
    const av = a[sort.field]
    const bv = b[sort.field]

    if (av == null && bv == null) return 0
    if (av == null) return 1
    if (bv == null) return -1

    const direction = sort.dir === 'asc' ? 1 : -1
    if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * direction

    return String(av).localeCompare(String(bv)) * direction
  })
}

export function summarizePurchaseOrders(orders: PurchaseOrder[]) {
  return {
    total: orders.length,
    ordered: orders.filter(order => order.po_status === 'Ordered').length,
    received: orders.filter(order => order.po_status === 'Received' || order.po_status === 'Completed').length,
    units: orders.reduce((sum, order) => sum + Number(order.unit_counts ?? 0), 0),
    value: orders.reduce((sum, order) => sum + Number(order.grand_total ?? 0), 0),
  }
}
