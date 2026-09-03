import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import type { InventoryBalanceSettings } from '@/types'
import {
  addMonthsToInventoryPeriod,
  buildInventoryBalanceRows,
  periodMonthFromDate,
  type InventoryBalanceMovementInput,
  type InventoryBalanceRow,
  type InventoryBalanceSalesInput,
} from '@/pages/purchasing/InventoryBalance.helpers'

const PAGE_SIZE = 1000
const ACTIVE_SETTINGS_KEY = 'active'

interface SupabaseErrorLike {
  code?: string
  message?: string
}

interface ReceiptMovementRow {
  observed_at: string | null
  received_value: number | null
}

interface SalesCogsRow {
  sale_date: string | null
  cogs_amount: number | null
  cogs_source: string | null
  source_payload: Record<string, unknown> | null
}

export interface InventoryBalanceData {
  settings: InventoryBalanceSettings | null
  rows: InventoryBalanceRow[]
  selectedRow: InventoryBalanceRow | null
  setupRequired: boolean
  missingCogsRows: number
  receiptMovementCount: number
}

export interface UpdateInventoryBalanceSettingsPayload {
  beginning_period_month: string
  beginning_inventory_value: number
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
    mutationFn: async (payload: UpdateInventoryBalanceSettingsPayload): Promise<InventoryBalanceSettings> => {
      if (!profile || profile.role !== 'admin') throw new Error('Admin role required')

      const row = {
        settings_key: ACTIVE_SETTINGS_KEY,
        beginning_period_month: periodMonthFromDate(payload.beginning_period_month),
        beginning_inventory_value: Math.max(0, Number(payload.beginning_inventory_value || 0)),
        updated_by: profile.id,
        updated_at: new Date().toISOString(),
      }

      const { data, error } = await supabase
        .from('inventory_balance_settings')
        .upsert(row, { onConflict: 'settings_key' })
        .select('*')
        .single()

      if (error) throw error
      return data as InventoryBalanceSettings
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inventory_balance'] })
    },
  })
}

export async function fetchInventoryBalance(
  selectedPeriodMonth: string,
  client: typeof supabase = supabase
): Promise<InventoryBalanceData> {
  try {
    const settings = await fetchSettings(client)
    if (!settings) return emptyInventoryBalance(false)

    const startPeriod = periodMonthFromDate(settings.beginning_period_month)
    const selectedPeriod = periodMonthFromDate(selectedPeriodMonth)
    const clampedSelectedPeriod = selectedPeriod < startPeriod ? startPeriod : selectedPeriod
    const endExclusive = addMonthsToInventoryPeriod(clampedSelectedPeriod, 1)

    const [receiptRows, salesRows] = await Promise.all([
      fetchReceiptRows(client, startPeriod, endExclusive),
      fetchSalesCogsRows(client, startPeriod, endExclusive),
    ])
    const receipts = aggregateReceipts(receiptRows)
    const sales = aggregateSalesCogs(salesRows)
    const rows = buildInventoryBalanceRows({
      settings,
      selectedPeriodMonth: clampedSelectedPeriod,
      receipts,
      sales,
    })
    const selectedRow = rows.find(row => row.period_month === clampedSelectedPeriod) ?? rows[rows.length - 1] ?? null

    return {
      settings,
      rows,
      selectedRow,
      setupRequired: false,
      missingCogsRows: rows.reduce((sum, row) => sum + row.missing_cogs_count, 0),
      receiptMovementCount: receiptRows.length,
    }
  } catch (error) {
    if (isMissingRelationError(error)) return emptyInventoryBalance(true)
    throw error
  }
}

async function fetchSettings(client: typeof supabase): Promise<InventoryBalanceSettings | null> {
  const { data, error } = await client
    .from('inventory_balance_settings')
    .select('*')
    .eq('settings_key', ACTIVE_SETTINGS_KEY)
    .maybeSingle()

  if (error) throw error
  return (data ?? null) as InventoryBalanceSettings | null
}

async function fetchReceiptRows(
  client: typeof supabase,
  startInclusive: string,
  endExclusive: string
): Promise<ReceiptMovementRow[]> {
  const rows: ReceiptMovementRow[] = []
  let from = 0

  while (true) {
    const { data, error } = await client
      .from('po_receipt_movements')
      .select('observed_at,received_value')
      .gte('observed_at', `${startInclusive}T00:00:00Z`)
      .lt('observed_at', `${endExclusive}T00:00:00Z`)
      .order('observed_at', { ascending: true })
      .range(from, from + PAGE_SIZE - 1)

    if (error) throw error
    const page = (data ?? []) as ReceiptMovementRow[]
    rows.push(...page)
    if (page.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }

  return rows
}

async function fetchSalesCogsRows(
  client: typeof supabase,
  startInclusive: string,
  endExclusive: string
): Promise<SalesCogsRow[]> {
  const rows: SalesCogsRow[] = []
  let from = 0

  while (true) {
    const { data, error } = await client
      .from('sales_daily')
      .select('sale_date,cogs_amount,cogs_source,source_payload')
      .gte('sale_date', startInclusive)
      .lt('sale_date', endExclusive)
      .order('sale_date', { ascending: true })
      .range(from, from + PAGE_SIZE - 1)

    if (error) throw error
    const page = (data ?? []) as SalesCogsRow[]
    rows.push(...page)
    if (page.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }

  return rows
}

function aggregateReceipts(rows: ReceiptMovementRow[]): InventoryBalanceMovementInput[] {
  const byPeriod = new Map<string, number>()
  for (const row of rows) {
    if (!row.observed_at) continue
    const period = periodMonthFromDate(row.observed_at)
    byPeriod.set(period, roundMoney((byPeriod.get(period) ?? 0) + Number(row.received_value ?? 0)))
  }
  return Array.from(byPeriod.entries()).map(([period_month, received_value]) => ({ period_month, received_value }))
}

function aggregateSalesCogs(rows: SalesCogsRow[]): InventoryBalanceSalesInput[] {
  const byPeriod = new Map<string, { cogs_amount: number; missing_cogs_count: number }>()
  for (const row of rows) {
    if (!row.sale_date) continue
    const period = periodMonthFromDate(row.sale_date)
    const current = byPeriod.get(period) ?? { cogs_amount: 0, missing_cogs_count: 0 }
    byPeriod.set(period, {
      cogs_amount: roundMoney(current.cogs_amount + Number(row.cogs_amount ?? 0)),
      missing_cogs_count: current.missing_cogs_count + missingCogsCount(row),
    })
  }
  return Array.from(byPeriod.entries()).map(([period_month, value]) => ({ period_month, ...value }))
}

function missingCogsCount(row: SalesCogsRow): number {
  const payloadCount = row.source_payload?.cogs_missing_count
  const parsedPayloadCount = Number(payloadCount ?? 0)
  if (Number.isFinite(parsedPayloadCount) && parsedPayloadCount > 0) return parsedPayloadCount
  return row.cogs_source === 'missing' ? 1 : 0
}

function emptyInventoryBalance(setupRequired: boolean): InventoryBalanceData {
  return {
    settings: null,
    rows: [],
    selectedRow: null,
    setupRequired,
    missingCogsRows: 0,
    receiptMovementCount: 0,
  }
}

function isMissingRelationError(error: unknown): boolean {
  const code = (error as SupabaseErrorLike | null)?.code
  return code === '42P01' || code === 'PGRST205'
}

function roundMoney(value: number): number {
  return Number(Number(value || 0).toFixed(2))
}
