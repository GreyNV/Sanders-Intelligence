import { describe, expect, it } from 'vitest'
import type { POItem, PurchaseOrder } from '../types'
import {
  buildPurchaseOrderHref,
  countUnmatchedPOItems,
  filterPurchaseOrders,
  formatPOStatus,
  parsePurchaseOrderParam,
  poLineTotal,
  poStatusVariant,
  sortPurchaseOrders,
  summarizePurchaseOrders,
} from '../pages/purchasing/PurchaseOrders.helpers'

const baseOrder: PurchaseOrder = {
  id: 100,
  purchase_title: 'June Freight PO',
  vendor_id: 44,
  vendor_name: 'Acme Vendor',
  po_status: 'Ordered',
  po_status_code: 1,
  payment_status: null,
  payment_status_code: null,
  shipping_status: null,
  shipping_status_code: 0,
  receiving_status: 'PartiallyReceived',
  receiving_status_code: 1,
  is_active: true,
  date_ordered: '2026-06-10T12:00:00Z',
  expected_delivery_date: '2026-07-01T12:00:00Z',
  created_on: '2026-06-09T12:00:00Z',
  shipped_on: null,
  grand_total: 2500,
  order_total: 2400,
  tax_total: 0,
  shipping_total: 100,
  unit_counts: 120,
  warehouse_id: 1,
  company_id: 1,
  memo: 'import container',
  tracking_numbers: null,
  approved: true,
  cancelled_po_id: null,
  updated_on: '2026-06-10T12:30:00Z',
  synced_at: '2026-06-10T13:00:00Z',
}

describe('PurchaseOrders.helpers', () => {
  it('formats and maps known statuses', () => {
    expect(formatPOStatus('PartiallyReceived')).toBe('Partially Received')
    expect(poStatusVariant('Ordered')).toBe('info')
    expect(poStatusVariant('Pending')).toBe('warning')
    expect(poStatusVariant('Cancelled')).toBe('danger')
  })

  it('computes PO line totals and unmatched item counts', () => {
    const items: POItem[] = [
      { id: 1, po_id: 100, source_sku: 'SC-1', planning_sku: 'SKU-1', product_name: null, qty_units_ordered: 10, qty_units_received: 0, qty_units_open: 10, qty_units_per_case: null, unit_price: 2.5, case_price: null, discount_type: null, discount_value: null, expected_delivery_date: null, receiving_status: null, receiving_status_code: null },
      { id: 2, po_id: 100, source_sku: 'SC-2', planning_sku: null, product_name: null, qty_units_ordered: 5, qty_units_received: 0, qty_units_open: 5, qty_units_per_case: null, unit_price: 3, case_price: null, discount_type: null, discount_value: null, expected_delivery_date: null, receiving_status: null, receiving_status_code: null },
    ]

    expect(poLineTotal(items[0])).toBe(25)
    expect(countUnmatchedPOItems(items)).toBe(1)
  })

  it('builds and parses purchase order deep links', () => {
    expect(buildPurchaseOrderHref(12345)).toBe('/purchasing/purchase-orders?po=12345')
    expect(parsePurchaseOrderParam('12345')).toBe(12345)
    expect(parsePurchaseOrderParam('not-a-po')).toBeNull()
    expect(parsePurchaseOrderParam('-1')).toBeNull()
  })

  it('filters by status, search, and date range', () => {
    const orders = [
      baseOrder,
      { ...baseOrder, id: 101, purchase_title: 'Old PO', po_status: 'Received', date_ordered: '2026-05-01T12:00:00Z' },
    ]

    const filtered = filterPurchaseOrders(orders, {
      query: 'freight',
      statuses: ['Ordered'],
      dateFrom: '2026-06-01',
      dateTo: '2026-06-30',
    })

    expect(filtered.map(order => order.id)).toEqual([100])
  })

  it('sorts null values last and summarizes filtered orders', () => {
    const orders = [
      baseOrder,
      { ...baseOrder, id: 101, grand_total: null, unit_counts: null, po_status: 'Received' },
      { ...baseOrder, id: 102, grand_total: 100, unit_counts: 5, po_status: 'Completed' },
    ]

    expect(sortPurchaseOrders(orders, { field: 'grand_total', dir: 'asc' }).map(order => order.id)).toEqual([102, 100, 101])
    expect(summarizePurchaseOrders(orders)).toEqual({
      total: 3,
      ordered: 1,
      received: 2,
      units: 125,
      value: 2600,
    })
  })
})
