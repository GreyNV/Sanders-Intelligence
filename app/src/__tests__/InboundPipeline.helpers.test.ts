import { describe, expect, it } from 'vitest'
import type { POInboundItem } from '../types'
import {
  buildInboundMonthBuckets,
  filterInboundItems,
  inboundDaysUntil,
  sortInboundItems,
} from '../pages/purchasing/InboundPipeline.helpers'

function makeItem(overrides: Partial<POInboundItem>): POInboundItem {
  return {
    id: 1,
    po_id: 100,
    source_sku: 'SC-1',
    planning_sku: 'SKU-1',
    product_name: 'Widget',
    qty_units_ordered: 10,
    qty_units_received: 0,
    qty_units_open: 10,
    unit_price: 2,
    expected_delivery_date: '2026-07-01T00:00:00Z',
    receiving_status: 'NotReceived',
    receiving_status_code: 0,
    purchase_order: {
      id: 100,
      vendor_id: 1,
      vendor_name: 'Vendor A',
      po_status: 'Ordered',
      shipping_status: 'Not Shipped',
      receiving_status: 'NotReceived',
      date_ordered: '2026-06-01T00:00:00Z',
      expected_delivery_date: '2026-07-01T00:00:00Z',
      updated_on: '2026-06-01T00:00:00Z',
      is_active: true,
    },
    ...overrides,
  }
}

describe('InboundPipeline helpers', () => {
  const today = new Date('2026-06-17T12:00:00Z')

  it('filters by vendor, receiving status, arrival window, and search text', () => {
    const rows = [
      makeItem({ id: 1, po_id: 501, planning_sku: 'ABC-1', expected_delivery_date: '2026-06-25T00:00:00Z' }),
      makeItem({ id: 2, planning_sku: 'XYZ-2', purchase_order: { ...makeItem({}).purchase_order!, vendor_name: 'Vendor B' } }),
      makeItem({ id: 3, planning_sku: 'ABC-3', receiving_status: 'Received' }),
      makeItem({ id: 4, planning_sku: 'ABC-4', expected_delivery_date: '2026-08-20T00:00:00Z' }),
    ]

    const filtered = filterInboundItems(rows, {
      search: '501',
      vendorFilter: 'Vendor A',
      statuses: ['NotReceived'],
      arrival: 'near',
      today,
    })

    expect(filtered.map(row => row.id)).toEqual([1])
  })

  it('sorts by derived SKU and numeric values', () => {
    const rows = [
      makeItem({ id: 1, planning_sku: 'B', qty_units_open: 2 }),
      makeItem({ id: 2, planning_sku: 'A', qty_units_open: 10 }),
    ]

    expect(sortInboundItems(rows, { field: 'sku', dir: 'asc' }).map(row => row.id)).toEqual([2, 1])
    expect(sortInboundItems(rows, { field: 'qty_units_open', dir: 'desc' }).map(row => row.id)).toEqual([2, 1])
  })

  it('computes day offsets from a stable baseline', () => {
    expect(inboundDaysUntil('2026-06-18T00:00:00Z', today)).toBe(1)
    expect(inboundDaysUntil('2026-06-16T00:00:00Z', today)).toBe(-1)
    expect(inboundDaysUntil(null, today)).toBeNull()
  })

  it('groups months, fills empty months, preserves No ETA, and clamps old outliers', () => {
    const rows = [
      makeItem({ id: 1, planning_sku: 'A', qty_units_open: 3, expected_delivery_date: '2026-07-01T00:00:00Z' }),
      makeItem({ id: 2, planning_sku: 'B', qty_units_open: 4, expected_delivery_date: '2026-09-01T00:00:00Z' }),
      makeItem({
        id: 3,
        planning_sku: 'C',
        qty_units_open: 5,
        expected_delivery_date: null,
        purchase_order: { ...makeItem({}).purchase_order!, expected_delivery_date: null },
      }),
      makeItem({ id: 4, planning_sku: 'D', qty_units_open: 6, expected_delivery_date: '2024-01-01T00:00:00Z' }),
    ]

    expect(buildInboundMonthBuckets(rows, today)).toEqual([
      { month: 'Older', units: 6, skus: 1 },
      { month: 'Jul 2026', units: 3, skus: 1 },
      { month: 'Aug 2026', units: 0, skus: 0 },
      { month: 'Sep 2026', units: 4, skus: 1 },
      { month: 'No ETA', units: 5, skus: 1 },
    ])
  })
})
