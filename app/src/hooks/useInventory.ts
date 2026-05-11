import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { InventoryRecord } from '@/types'

// ─── Trend types ──────────────────────────────────────────────────────────────
export interface UploadTrendPoint {
  uploadId: string
  date: string          // ISO
  label: string         // e.g. "May 7"
  totalValue: number
  atRiskCount: number
  excessValue: number
  fillRate: number
  totalRecOrderValue: number
  totalSkus: number
}

interface InventoryKPIs {
  isLoading: boolean
  totalOnHandValue: number
  totalUnits: number
  atRiskCount: number
  excessCount: number
  okCount: number
  newItemCount: number
  backorderCount: number
  totalBackorderValue: number
  excessValue: number
  recOrderValue: number
  fillRate: number
  totalSkus: number
  activeSkus: number
}

interface InventoryAnalysis {
  records: InventoryRecord[]
  atRiskItems: InventoryRecord[]
  backorderItems: InventoryRecord[]
  excessItems: InventoryRecord[]
  inboundItems: InventoryRecord[]
  kpis: InventoryKPIs
}

export function analyzeInventory(records: InventoryRecord[], isLoading: boolean): InventoryAnalysis {
  const atRiskItems: InventoryRecord[] = []
  const backorderItems: InventoryRecord[] = []
  const excessItems: InventoryRecord[] = []
  const inboundItems: InventoryRecord[] = []

  let totalOnHandValue = 0
  let totalUnits = 0
  let okCount = 0
  let newItemCount = 0
  let totalBackorderValue = 0
  let excessValue = 0
  let recOrderValue = 0
  let activeSkus = 0
  let atRiskCount = 0

  for (const record of records) {
    totalOnHandValue += record.on_hand_value
    totalUnits += record.on_hand

    if (record.average_sales > 0 || record.on_hand > 0) activeSkus += 1
    if (record.status === 'Ok') okCount += 1
    if (record.status === 'New item') newItemCount += 1

    const isAtRisk = record.status === 'Potential s/o' || record.status === 'Stocked out'
    const isExcess = record.status === 'Excess stock' || record.status === 'Surplus orders'

    if (isAtRisk) {
      atRiskCount += 1
      recOrderValue += record.recommended_order_value
      if (record.recommended_order > 0) atRiskItems.push(record)
    }

    if (isExcess) {
      excessValue += record.excess_value
      excessItems.push(record)
    }

    if (record.unsatisfied_customer_orders_units > 0) {
      totalBackorderValue += record.unsatisfied_customer_orders_value
      backorderItems.push(record)
    }

    if (record.on_order > 0) {
      inboundItems.push(record)
    }
  }

  return {
    records,
    atRiskItems,
    backorderItems,
    excessItems,
    inboundItems,
    kpis: {
      isLoading,
      totalOnHandValue,
      totalUnits,
      atRiskCount,
      excessCount: excessItems.length,
      okCount,
      newItemCount,
      backorderCount: backorderItems.length,
      totalBackorderValue,
      excessValue,
      recOrderValue,
      fillRate: activeSkus > 0 ? (okCount / activeSkus) * 100 : 0,
      totalSkus: records.length,
      activeSkus,
    },
  }
}

async function fetchInventoryTrends(): Promise<UploadTrendPoint[]> {
  // 1. Get last 20 complete uploads, oldest first
  const { data: uploads, error: upErr } = await supabase
    .from('uploads')
    .select('id, uploaded_at')
    .eq('status', 'complete')
    .order('uploaded_at', { ascending: true })
    .limit(20)

  if (upErr || !uploads || uploads.length < 1) return []

  // 2. For each upload fetch only the columns needed for KPI aggregation
  const PAGE_SIZE = 1000
  const results: UploadTrendPoint[] = await Promise.all(
    uploads.map(async (upload) => {
      type Row = { status: string; on_hand_value: number; excess_value: number; recommended_order_value: number; average_sales: number }
      const all: Row[] = []
      let from = 0
      while (true) {
        const { data, error } = await supabase
          .from('inventory_records')
          .select('status, on_hand_value, excess_value, recommended_order_value, average_sales')
          .eq('upload_id', upload.id)
          .range(from, from + PAGE_SIZE - 1)
        if (error || !data || data.length === 0) break
        all.push(...(data as Row[]))
        if (data.length < PAGE_SIZE) break
        from += PAGE_SIZE
      }

      const totalValue    = all.reduce((s, r) => s + r.on_hand_value, 0)
      const atRiskCount   = all.filter(r => r.status === 'Potential s/o' || r.status === 'Stocked out').length
      const excessValue   = all.reduce((s, r) => s + r.excess_value, 0)
      const totalRecVal   = all.reduce((s, r) => s + r.recommended_order_value, 0)
      const totalSkus     = all.length
      const activeSkus    = all.filter(r => r.average_sales > 0 || r.on_hand_value > 0).length
      const okCount       = all.filter(r => r.status === 'Ok').length
      const fillRate      = activeSkus > 0 ? (okCount / activeSkus) * 100 : 0

      return {
        uploadId:          upload.id,
        date:              upload.uploaded_at as string,
        label:             new Date(upload.uploaded_at as string).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        totalValue,
        atRiskCount,
        excessValue,
        fillRate,
        totalRecOrderValue: totalRecVal,
        totalSkus,
      }
    })
  )

  return results
}

export function useInventoryTrends() {
  return useQuery({
    queryKey: ['inventory', 'trends'],
    queryFn:  fetchInventoryTrends,
    staleTime: 10 * 60 * 1000,
  })
}

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

export function useInventoryAnalysis() {
  const query = useInventory()
  const records = query.data ?? []
  const analysis = useMemo(() => analyzeInventory(records, query.isLoading), [records, query.isLoading])

  return {
    ...query,
    data: analysis,
  }
}

/** Derived: at-risk items — Potential s/o and Stocked out, with a recommended order */
export function useAtRiskItems() {
  const { data: analysis, ...rest } = useInventoryAnalysis()
  return {
    ...rest,
    data: analysis.atRiskItems,
  }
}

/** Derived: items with backorders */
export function useBackorderItems() {
  const { data: analysis, ...rest } = useInventoryAnalysis()
  return {
    ...rest,
    data: analysis.backorderItems,
  }
}

/** Derived: excess items — Excess stock and Surplus orders */
export function useExcessItems() {
  const { data: analysis, ...rest } = useInventoryAnalysis()
  return {
    ...rest,
    data: analysis.excessItems,
  }
}

/** Derived: items on order (inbound pipeline) */
export function useInboundItems() {
  const { data: analysis, ...rest } = useInventoryAnalysis()
  return {
    ...rest,
    data: analysis.inboundItems,
  }
}

/** Summary KPIs computed from the full record set */
export function useInventoryKPIs() {
  const { data: analysis } = useInventoryAnalysis()
  return analysis.kpis
}
