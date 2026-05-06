import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { InventoryRecord } from '@/types'

/** Fetch the id + timestamp of the latest successful upload */
async function fetchLatestUploadMeta() {
  const { data } = await supabase
    .from('uploads')
    .select('id, uploaded_at, row_count')
    .eq('status', 'complete')
    .order('uploaded_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return data
}

/** Fetch ALL inventory records for the latest upload, paginating past Supabase's 1000-row cap */
async function fetchInventoryRecords(): Promise<InventoryRecord[]> {
  const meta = await fetchLatestUploadMeta()
  if (!meta) return []

  const PAGE_SIZE = 1000
  const all: InventoryRecord[] = []
  let from = 0

  while (true) {
    const { data, error } = await supabase
      .from('inventory_records')
      .select('*')
      .eq('upload_id', meta.id)
      .range(from, from + PAGE_SIZE - 1)

    if (error) throw error
    if (!data || data.length === 0) break
    all.push(...(data as InventoryRecord[]))
    if (data.length < PAGE_SIZE) break   // last page
    from += PAGE_SIZE
  }

  return all
}

/** Fetch all inventory records for a specific upload_id (used for CSV download) */
export async function fetchInventoryForUpload(uploadId: string): Promise<InventoryRecord[]> {
  const PAGE_SIZE = 1000
  const all: InventoryRecord[] = []
  let from = 0
  while (true) {
    const { data, error } = await supabase
      .from('inventory_records')
      .select('*')
      .eq('upload_id', uploadId)
      .range(from, from + PAGE_SIZE - 1)
    if (error) throw error
    if (!data || data.length === 0) break
    all.push(...(data as InventoryRecord[]))
    if (data.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }
  return all
}

export function useInventory() {
  return useQuery({
    queryKey: ['inventory', 'latest'],
    queryFn: fetchInventoryRecords,
    staleTime: 5 * 60 * 1000,
  })
}

/** Derived: at-risk items — Potential s/o and Stocked out, with a recommended order */
export function useAtRiskItems() {
  const { data: records = [], ...rest } = useInventory()
  return {
    ...rest,
    data: records.filter(r =>
      (r.status === 'Potential s/o' || r.status === 'Stocked out') && r.recommended_order > 0
    ),
  }
}

/** Derived: items with backorders */
export function useBackorderItems() {
  const { data: records = [], ...rest } = useInventory()
  return {
    ...rest,
    data: records.filter(r => r.unsatisfied_customer_orders_units > 0),
  }
}

/** Derived: items on order (inbound pipeline) */
export function useInboundItems() {
  const { data: records = [], ...rest } = useInventory()
  return {
    ...rest,
    data: records.filter(r => r.on_order > 0),
  }
}

/** Summary KPIs computed from the full record set */
export function useInventoryKPIs() {
  const { data: records = [], isLoading } = useInventory()

  const totalOnHandValue    = records.reduce((s, r) => s + r.on_hand_value, 0)
  const totalUnits          = records.reduce((s, r) => s + r.on_hand, 0)
  // At-risk bucket: both Potential s/o and Stocked out need purchasing action
  const atRisk              = records.filter(r => r.status === 'Potential s/o' || r.status === 'Stocked out')
  // Excess bucket: Excess stock + Surplus orders (over-ordered or over-stocked)
  const excess              = records.filter(r => r.status === 'Excess stock' || r.status === 'Surplus orders')
  const ok                  = records.filter(r => r.status === 'Ok')
  const newItems            = records.filter(r => r.status === 'New item')
  const backorderItems      = records.filter(r => r.unsatisfied_customer_orders_units > 0)
  const totalBackorderValue = backorderItems.reduce((s, r) => s + r.unsatisfied_customer_orders_value, 0)
  const excessValue         = excess.reduce((s, r) => s + r.excess_value, 0)
  const recOrderValue       = atRisk.reduce((s, r) => s + r.recommended_order_value, 0)

  const activeSkus = records.filter(r => r.average_sales > 0 || r.on_hand > 0).length
  const fillRate   = activeSkus > 0 ? ((ok.length / activeSkus) * 100) : 0

  return {
    isLoading,
    totalOnHandValue,
    totalUnits,
    atRiskCount:    atRisk.length,
    excessCount:    excess.length,
    okCount:        ok.length,
    newItemCount:   newItems.length,
    backorderCount: backorderItems.length,
    totalBackorderValue,
    excessValue,
    recOrderValue,
    fillRate,
    totalSkus: records.length,
    activeSkus,
  }
}
