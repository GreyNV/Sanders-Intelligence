import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import { monthlyStarSalesWindows } from '@/pages/csuite/NorthStar.helpers'
import {
  deriveSalesByChannel,
  normalizeSalesChannelValue,
  type SalesByChannelResult,
  type SalesByChannelSalesRow,
} from '@/pages/csuite/SalesByChannel.helpers'
import type { SalesChannelGoal, SalesChannelMapping } from '@/types'

export interface UpdateSalesChannelGoalPayload {
  period_month: string
  qb_channel: string
  goal_amount: number
}

export interface UpsertSalesChannelMappingPayload {
  id?: string
  sellercloud_company: string
  sellercloud_channel: string
  qb_channel: string
  is_active?: boolean
  source_file?: string | null
  notes?: string | null
}

export function useSalesByChannel(periodMonth: string) {
  return useQuery({
    queryKey: ['sales_by_channel', periodMonth],
    queryFn: async (): Promise<SalesByChannelResult> => {
      const windows = monthlyStarSalesWindows(periodMonth)
      const [currentRows, previousYearRows, mappings, goals] = await Promise.all([
        fetchSalesDailyRange(windows.currentStart, windows.currentEndExclusive),
        fetchSalesDailyRange(windows.previousStart, windows.previousEndExclusive),
        fetchSalesChannelMappings(),
        fetchSalesChannelGoals(periodMonth),
      ])

      return deriveSalesByChannel({
        periodMonth,
        rows: currentRows,
        previousYearRows,
        mappings,
        goals,
        daysElapsed: Math.max(1, windows.daysElapsed),
        daysRemaining: windows.daysRemaining,
      })
    },
    staleTime: 5 * 60 * 1000,
  })
}

export function useSalesChannelMappings() {
  return useQuery({
    queryKey: ['sales_channel_mappings'],
    queryFn: fetchSalesChannelMappings,
    staleTime: 5 * 60 * 1000,
  })
}

export function useUpdateSalesChannelGoal() {
  const qc = useQueryClient()
  const { profile } = useAuth()

  return useMutation({
    mutationFn: async (payload: UpdateSalesChannelGoalPayload): Promise<SalesChannelGoal> => {
      if (!profile || profile.role !== 'admin') throw new Error('Admin role required')
      const row = {
        period_month: payload.period_month,
        qb_channel: payload.qb_channel.trim(),
        goal_amount: payload.goal_amount,
        updated_by: profile.id,
        updated_at: new Date().toISOString(),
      }
      const { data, error } = await supabase
        .from('sales_channel_goals')
        .upsert(row, { onConflict: 'period_month,qb_channel' })
        .select('*')
        .single()
      if (error) throw error
      return data as SalesChannelGoal
    },
    onSuccess: (_data, payload) => {
      qc.invalidateQueries({ queryKey: ['sales_by_channel', payload.period_month] })
      qc.invalidateQueries({ queryKey: ['sales_channel_goals', payload.period_month] })
    },
  })
}

export function useUpsertSalesChannelMapping() {
  const qc = useQueryClient()
  const { profile } = useAuth()

  return useMutation({
    mutationFn: async (payload: UpsertSalesChannelMappingPayload): Promise<SalesChannelMapping> => {
      if (!profile || profile.role !== 'admin') throw new Error('Admin role required')
      const sellercloudCompany = payload.sellercloud_company.trim()
      const sellercloudChannel = payload.sellercloud_channel.trim()
      const qbChannel = payload.qb_channel.trim()

      if (!sellercloudCompany || !sellercloudChannel || !qbChannel) {
        throw new Error('SellerCloud company, SellerCloud channel, and QB channel are required')
      }

      const row = {
        sellercloud_company: sellercloudCompany,
        sellercloud_channel: sellercloudChannel,
        normalized_company: normalizeSalesChannelValue(sellercloudCompany),
        normalized_channel: normalizeSalesChannelValue(sellercloudChannel),
        qb_channel: qbChannel,
        is_active: payload.is_active ?? true,
        source_file: payload.source_file?.trim() || 'admin',
        notes: payload.notes?.trim() || null,
        updated_by: profile.id,
        updated_at: new Date().toISOString(),
      }

      const query = payload.id
        ? supabase
            .from('sales_channel_mappings')
            .update(row)
            .eq('id', payload.id)
        : supabase
            .from('sales_channel_mappings')
            .upsert(row, { onConflict: 'normalized_company,normalized_channel' })

      const { data, error } = await query.select('*').single()

      if (error) throw error
      return data as SalesChannelMapping
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sales_channel_mappings'] })
      qc.invalidateQueries({ queryKey: ['sales_by_channel'] })
    },
  })
}

async function fetchSalesDailyRange(startInclusive: string, endExclusive: string): Promise<SalesByChannelSalesRow[]> {
  const rows: SalesByChannelSalesRow[] = []
  let from = 0
  const pageSize = 1000

  while (true) {
    const { data, error } = await supabase
      .from('sales_daily')
      .select('sale_date,raw_company,raw_channel,channel,revenue,orders_count')
      .gte('sale_date', startInclusive)
      .lt('sale_date', endExclusive)
      .order('sale_date', { ascending: true })
      .range(from, from + pageSize - 1)

    if (error) {
      if ((error as { code?: string }).code === '42P01') return []
      throw error
    }
    const page = (data ?? []) as SalesByChannelSalesRow[]
    rows.push(...page)
    if (page.length < pageSize) break
    from += pageSize
  }

  return rows
}

async function fetchSalesChannelMappings(): Promise<SalesChannelMapping[]> {
  const rows: SalesChannelMapping[] = []
  let from = 0
  const pageSize = 1000

  while (true) {
    const { data, error } = await supabase
      .from('sales_channel_mappings')
      .select('*')
      .order('qb_channel', { ascending: true })
      .range(from, from + pageSize - 1)

    if (error) {
      if ((error as { code?: string }).code === '42P01') return []
      throw error
    }
    const page = (data ?? []) as SalesChannelMapping[]
    rows.push(...page)
    if (page.length < pageSize) break
    from += pageSize
  }

  return rows
}

async function fetchSalesChannelGoals(periodMonth: string): Promise<SalesChannelGoal[]> {
  const { data, error } = await supabase
    .from('sales_channel_goals')
    .select('*')
    .eq('period_month', periodMonth)
    .order('qb_channel', { ascending: true })

  if (error) {
    if ((error as { code?: string }).code === '42P01') return []
    throw error
  }
  return (data ?? []) as SalesChannelGoal[]
}
