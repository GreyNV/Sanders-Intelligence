import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { POItem, PurchaseOrder } from '@/types'

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

export function useSyncPurchaseOrders() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('sync-purchase-orders')
      if (error) throw error
      return data as { synced: number; items: number; durationMs: number }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['purchase_orders'] })
      qc.invalidateQueries({ queryKey: ['po_items'] })
    },
  })
}
