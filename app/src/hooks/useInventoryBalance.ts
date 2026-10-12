import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import type { InventoryBalanceSettings } from '@/types'
import {
  buildInventoryBalanceRows,
  inventoryBalanceMonthEnd,
  periodMonthFromDate,
} from '@/pages/purchasing/InventoryBalance.helpers'

export interface InventoryCoverageMonth {
  period_month: string
  po_received_value: number
  cogs_amount: number
  missing_cogs_count: number
  receipt_count: number
  receipt_covered_days: number
  cogs_covered_days: number
  expected_days: number
  observed_receipt_value: number
}
export function useInventoryBalance(periodMonth: string) {
  return useQuery({
    queryKey: ['inventory_balance', periodMonth],
    queryFn: () => fetchInventoryBalance(periodMonth),
    staleTime: 5 * 60 * 1000,
  })
}
export function useUpdateInventoryBalanceSettings() {
  const qc = useQueryClient()
  const { profile } = useAuth()
  return useMutation({
    mutationFn: async (payload: {
      beginning_period_month: string
      beginning_inventory_value: number
    }) => {
      if (!profile || profile.role !== 'admin')
        throw new Error('Admin role required')
      const month = periodMonthFromDate(payload.beginning_period_month)
      const current = periodMonthFromDate(new Date().toISOString())
      if (
        !/^\d{4}-\d{2}-01$/.test(month) ||
        !Number.isFinite(Date.parse(month)) ||
        month > current
      )
        throw new Error('Choose a valid opening month no later than this month')
      if (
        !Number.isFinite(payload.beginning_inventory_value) ||
        payload.beginning_inventory_value < 0
      )
        throw new Error('Enter a valid non-negative opening value')
      const { data, error } = await supabase
        .from('inventory_balance_settings')
        .upsert(
          {
            settings_key: 'active',
            beginning_period_month: month,
            beginning_inventory_value: payload.beginning_inventory_value,
            updated_by: profile.id,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'settings_key' },
        )
        .select('*')
        .single()
      if (error) throw error
      return data as InventoryBalanceSettings
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['inventory_balance'] }),
  })
}

export function useSyncMissingInventoryCogs() {
  const qc = useQueryClient()
  const [progress, setProgress] = useState<{ date: string; phase: 'orders' | 'pnl'; pagesProcessed: number; totalPages: number | null; ordersCollected: number; totalOrders: number | null; pnlBatchesProcessed: number; totalPnlBatches: number | null } | null>(null)
  const mutation = useMutation({
    mutationFn: async () => {
      let result: { syncedDays: number; skippedDays: number; missingDays: number; remainingDays: number; inProgress?: boolean; progress?: NonNullable<typeof progress> } | undefined
      for (let attempt = 0; attempt < 20; attempt++) {
        const { data, error } = await supabase.functions.invoke('sync-inventory-cogs')
        if (error) {
          const context = (error as Error & { context?: unknown }).context
          if (context && typeof context === 'object' && 'clone' in context && typeof context.clone === 'function') {
            const response = context as Response
            const body = await response.clone().json().catch(() => null)
            if (typeof body?.error === 'string') throw new Error(body.error)
          }
          throw error
        }
        if (data?.error) throw new Error(data.error)
        result = data as typeof result
        setProgress(data?.inProgress ? data.progress ?? null : null)
        if (!data?.inProgress) return result!
      }
      if (!result) throw new Error('COGS sync returned no progress')
      return result
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['inventory_balance'] }),
  })
  return { ...mutation, progress }
}
export async function fetchInventoryBalance(
  selectedMonth: string,
  client: typeof supabase = supabase,
) {
  const empty = {
    settings: null as InventoryBalanceSettings | null,
    rows: [] as ReturnType<typeof buildInventoryBalanceRows>,
    selectedRow: null as
      ReturnType<typeof buildInventoryBalanceRows>[number] | null,
    coverage: [] as InventoryCoverageMonth[],
    setupRequired: false,
    missingCogsRows: 0,
    receiptMovementCount: 0,
  }
  try {
    const { data: settings, error } = await client
      .from('inventory_balance_settings')
      .select('*')
      .eq('settings_key', 'active')
      .maybeSingle()
    if (error) throw error
    if (!settings) return empty
    const start = periodMonthFromDate(settings.beginning_period_month)
    const end =
      selectedMonth < start ? start : periodMonthFromDate(selectedMonth)
    if (Date.parse(end) - Date.parse(start) > 3660 * 86400000)
      throw new Error(
        'Opening month must be within ten years of the selected month',
      )
    // Bound each aggregation to one month: long histories can exceed the
    // database statement timeout even though each monthly query succeeds.
    const coverage: InventoryCoverageMonth[] = []
    for (let month = start; month <= end;) {
      const { data, error: totalsError } = await client.rpc(
        'inventory_balance_months',
        { p_from: month, p_to: inventoryBalanceMonthEnd(month) },
      )
      if (totalsError) throw totalsError
      coverage.push(...((data ?? []) as InventoryCoverageMonth[]))
      const next = new Date(`${month}T00:00:00Z`)
      next.setUTCMonth(next.getUTCMonth() + 1)
      month = next.toISOString().slice(0, 10)
    }
    const rows = buildInventoryBalanceRows({
      settings,
      selectedPeriodMonth: end,
      receipts: coverage.map((r) => ({
        period_month: r.period_month,
        received_value: Number(r.po_received_value),
      })),
      sales: coverage.map((r) => ({
        period_month: r.period_month,
        cogs_amount: Number(r.cogs_amount),
        missing_cogs_count: Number(r.missing_cogs_count),
      })),
    })
    return {
      settings: settings as InventoryBalanceSettings,
      rows,
      selectedRow: rows.find((r) => r.period_month === end) ?? null,
      coverage,
      setupRequired: false,
      missingCogsRows: rows.reduce((n, r) => n + r.missing_cogs_count, 0),
      receiptMovementCount: coverage.reduce(
        (n, r) => n + Number(r.receipt_count),
        0,
      ),
    }
  } catch (error) {
    if (
      ['42P01', 'PGRST205', 'PGRST202'].includes(
        (error as { code?: string }).code ?? '',
      )
    )
      return { ...empty, setupRequired: true }
    throw error
  }
}
