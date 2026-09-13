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
    const { data, error: totalsError } = await client.rpc(
      'inventory_balance_months',
      { p_from: start, p_to: inventoryBalanceMonthEnd(end) },
    )
    if (totalsError) throw totalsError
    const coverage = (data ?? []) as InventoryCoverageMonth[]
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
