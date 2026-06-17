import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase, supabaseAnonKey, supabaseUrl } from '@/lib/supabase'
import type { POInboundItem, POItem, PurchaseOrder } from '@/types'

const PO_SYNC_TIMEOUT_MS = 120000
const PAGE_SIZE = 1000
const PO_INBOUND_SELECT = `
  *,
  purchase_order:purchase_orders!inner(
    id,
    vendor_id,
    vendor_name,
    po_status,
    shipping_status,
    receiving_status,
    date_ordered,
    expected_delivery_date,
    updated_on,
    is_active
  )
`

export interface PurchaseOrderQueryFilters {
  statuses?: string[]
  dateFrom?: string
  dateTo?: string
  query?: string
}

export function usePurchaseOrders(filters: PurchaseOrderQueryFilters = {}) {
  return useQuery({
    queryKey: ['purchase_orders', filters],
    queryFn: async (): Promise<PurchaseOrder[]> => {
      let query = supabase
        .from('purchase_orders')
        .select('*')
        .eq('is_active', true)
        .order('date_ordered', { ascending: false, nullsFirst: false })
        .limit(500)

      if (filters.statuses?.length) query = query.in('po_status', filters.statuses)
      if (filters.dateFrom) query = query.gte('date_ordered', filters.dateFrom)
      if (filters.dateTo) query = query.lte('date_ordered', `${filters.dateTo}T23:59:59`)

      const { data, error } = await query
      if (error) throw error
      return (data ?? []) as PurchaseOrder[]
    },
    staleTime: 5 * 60 * 1000,
  })
}

export function usePurchaseOrderItems(poId: number | null) {
  return useQuery({
    queryKey: ['po_items', poId],
    enabled: poId != null,
    queryFn: async (): Promise<POItem[]> => {
      if (poId == null) return []
      const { data, error } = await supabase
        .from('po_items')
        .select('*')
        .eq('po_id', poId)
        .order('source_sku')
      if (error) throw error
      return (data ?? []) as POItem[]
    },
    staleTime: 5 * 60 * 1000,
  })
}

export function usePOInboundItems() {
  return useQuery({
    queryKey: ['po_inbound_items'],
    queryFn: () => fetchPOInboundItems(),
    staleTime: 5 * 60 * 1000,
  })
}

export async function fetchPOInboundItems(client: typeof supabase = supabase): Promise<POInboundItem[]> {
  const all: POInboundItem[] = []
  let from = 0

  while (true) {
    const { data, error } = await client
      .from('po_items')
      .select(PO_INBOUND_SELECT)
      .eq('purchase_order.is_active', true)
      .gt('qty_units_open', 0)
      .order('expected_delivery_date', { ascending: true, nullsFirst: false })
      .range(from, from + PAGE_SIZE - 1)

    if (error) throw error
    const page = (data ?? []) as POInboundItem[]
    all.push(...page)
    if (page.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }

  return all
}

export function useSyncPurchaseOrders() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: invokePurchaseOrderSync,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['purchase_orders'] })
      qc.invalidateQueries({ queryKey: ['po_items'] })
    },
  })
}

async function invokePurchaseOrderSync(): Promise<{
  synced: number
  active: number
  items: number
  durationMs: number
  itemFailures?: Array<{ poId: number; error: string }>
}> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Not authenticated')

  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), PO_SYNC_TIMEOUT_MS)

  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/sync-purchase-orders`, {
      method: 'POST',
      headers: {
        apikey: supabaseAnonKey,
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ maxPages: 1, pageSize: 10, includeItems: true, activeOnly: true }),
      signal: controller.signal,
    })

    const body = await response.json().catch(() => ({}))
    if (!response.ok) {
      const message = typeof body.error === 'string' ? body.error : `Purchase order sync failed (${response.status})`
      throw new Error(message)
    }

    return body as { synced: number; active: number; items: number; durationMs: number; itemFailures?: Array<{ poId: number; error: string }> }
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('Purchase order sync timed out after 120 seconds. Try again or reduce the SellerCloud PO batch size.')
    }
    if (error instanceof TypeError) {
      throw new Error('Could not reach the sync-purchase-orders Edge Function. Confirm it is deployed and reachable from this Supabase project.')
    }
    throw error
  } finally {
    window.clearTimeout(timer)
  }
}
