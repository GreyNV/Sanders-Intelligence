import { describe, expect, it } from 'vitest'
import { fetchPOInboundItems } from '../hooks/usePurchaseOrders'
import type { POInboundItem } from '../types'

function makeInboundItem(id: number): POInboundItem {
  return {
    id,
    po_id: 1000 + id,
    source_sku: `SC-${id}`,
    planning_sku: `SKU-${id}`,
    product_name: `Item ${id}`,
    qty_units_ordered: 10,
    qty_units_received: 0,
    qty_units_open: 10,
    unit_price: 2,
    expected_delivery_date: '2026-07-01T00:00:00Z',
    receiving_status: 'NotReceived',
    receiving_status_code: 0,
    purchase_order: {
      id: 1000 + id,
      vendor_id: 1,
      vendor_name: 'Vendor',
      po_status: 'Ordered',
      shipping_status: 'Not Shipped',
      receiving_status: 'NotReceived',
      date_ordered: '2026-06-01T00:00:00Z',
      expected_delivery_date: '2026-07-01T00:00:00Z',
      updated_on: '2026-06-01T00:00:00Z',
      is_active: true,
    },
  }
}

function makeClient(pages: POInboundItem[][]) {
  const ranges: Array<[number, number]> = []
  const query = {
    select: () => query,
    eq: () => query,
    gt: () => query,
    order: () => query,
    range: async (from: number, to: number) => {
      ranges.push([from, to])
      return { data: pages.shift() ?? [], error: null }
    },
  }

  return {
    ranges,
    from: () => query,
  }
}

describe('fetchPOInboundItems', () => {
  it('concatenates multiple Supabase pages past the default 1000 row cap', async () => {
    const firstPage = Array.from({ length: 1000 }, (_, index) => makeInboundItem(index + 1))
    const secondPage = Array.from({ length: 3 }, (_, index) => makeInboundItem(1001 + index))
    const client = makeClient([firstPage, secondPage])

    const rows = await fetchPOInboundItems(client as never)

    expect(rows).toHaveLength(1003)
    expect(rows[0].id).toBe(1)
    expect(rows[1002].id).toBe(1003)
    expect(client.ranges).toEqual([[0, 999], [1000, 1999]])
  })
})
