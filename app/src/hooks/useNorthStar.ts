import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import type { MonthlyStar, NorthStarRow, NorthStarStatus } from '@/types'

export interface UpdateNorthStarRowPayload {
  id: string | null
  is_locked?: boolean
  period_month: string
  period_week: string
  slot_index: number
  pillar: string
  owner: string | null
  north_star: string
  constraint_now: string | null
  weekly_move: string | null
  last_week_result: string | null
  status: NorthStarStatus
}

export interface UpdateMonthlyStarPayload {
  id: string | null
  period_month: string
  target_sales: number
  mtd_actual: number
  ly_mtd_actual: number
  days_elapsed: number
  days_remaining: number
  channel_deltas: Array<{ channel: string; delta: number }>
}

export function useNorthStarRows() {
  return useQuery({
    queryKey: ['north_star_rows'],
    queryFn: async (): Promise<NorthStarRow[]> => {
      const { data, error } = await supabase
        .from('north_star_rows')
        .select('*')
        .order('slot_index')
      if (error) throw error
      return (data ?? []) as NorthStarRow[]
    },
  })
}

export function useMonthlyStar(periodMonth: string) {
  return useQuery({
    queryKey: ['monthly_star', periodMonth],
    queryFn: async (): Promise<MonthlyStar | null> => {
      const { data, error } = await supabase
        .from('monthly_star')
        .select('*')
        .eq('period_month', periodMonth)
        .maybeSingle()
      if (error) throw error
      return data as MonthlyStar | null
    },
  })
}

export function useUpdateNorthStarRow() {
  const qc = useQueryClient()
  const { profile } = useAuth()

  return useMutation({
    mutationFn: async (payload: UpdateNorthStarRowPayload) => {
      if (!profile || profile.role !== 'admin') throw new Error('Admin role required')
      const previous = payload.id ? await fetchCurrentNorthStarRow(payload.id) : null

      if (previous) {
        await insertRowHistory(previous, payload, profile.id)
      }

      const row = {
        period_month: payload.period_month,
        period_week: payload.period_week,
        slot_index: payload.slot_index,
        pillar: payload.pillar,
        owner: payload.owner,
        north_star: payload.north_star,
        constraint_now: payload.constraint_now,
        weekly_move: payload.weekly_move,
        last_week_result: payload.last_week_result,
        status: payload.status,
        is_locked: payload.is_locked ?? true,
        updated_by: profile.id,
        updated_at: new Date().toISOString(),
      }

      const query = payload.id
        ? supabase.from('north_star_rows').update(row).eq('id', payload.id).select('*').single()
        : supabase.from('north_star_rows').upsert(row, { onConflict: 'slot_index' }).select('*').single()

      const { data, error } = await query
      if (error) throw error
      return data as NorthStarRow
    },
    onSuccess: data => {
      qc.invalidateQueries({ queryKey: ['north_star_rows'] })
    },
  })
}

export function useUpdateMonthlyStar() {
  const qc = useQueryClient()
  const { profile } = useAuth()

  return useMutation({
    mutationFn: async (payload: UpdateMonthlyStarPayload) => {
      if (!profile || profile.role !== 'admin') throw new Error('Admin role required')
      const previous = payload.id ? await fetchCurrentMonthlyStar(payload.id) : null

      if (previous) {
        await insertMonthlyHistory(previous, payload, profile.id)
      }

      const row = {
        period_month: payload.period_month,
        target_sales: payload.target_sales,
        mtd_actual: payload.mtd_actual,
        ly_mtd_actual: payload.ly_mtd_actual,
        days_elapsed: payload.days_elapsed,
        days_remaining: payload.days_remaining,
        channel_deltas: payload.channel_deltas,
        updated_by: profile.id,
        updated_at: new Date().toISOString(),
      }

      const query = payload.id
        ? supabase.from('monthly_star').update(row).eq('id', payload.id).select('*').single()
        : supabase.from('monthly_star').upsert(row, { onConflict: 'period_month' }).select('*').single()

      const { data, error } = await query
      if (error) throw error
      return data as MonthlyStar
    },
    onSuccess: data => {
      qc.invalidateQueries({ queryKey: ['monthly_star', data.period_month] })
    },
  })
}

async function fetchCurrentNorthStarRow(id: string): Promise<NorthStarRow | null> {
  const { data, error } = await supabase.from('north_star_rows').select('*').eq('id', id).maybeSingle()
  if (error) throw error
  return data as NorthStarRow | null
}

async function fetchCurrentMonthlyStar(id: string): Promise<MonthlyStar | null> {
  const { data, error } = await supabase.from('monthly_star').select('*').eq('id', id).maybeSingle()
  if (error) throw error
  return data as MonthlyStar | null
}

async function insertRowHistory(previous: NorthStarRow, next: UpdateNorthStarRowPayload, userId: string) {
  const rows = [
    historyRecord(previous.id, 'north_star', previous.north_star, next.north_star, userId, previous.period_week),
    historyRecord(previous.id, 'constraint_now', previous.constraint_now, next.constraint_now, userId, previous.period_week),
    historyRecord(previous.id, 'weekly_move', previous.weekly_move, next.weekly_move, userId, previous.period_week),
    historyRecord(previous.id, 'last_week_result', previous.last_week_result, next.last_week_result, userId, previous.period_week),
    historyRecord(previous.id, 'status', previous.status, next.status, userId, previous.period_week),
  ].filter(row => row.old_value !== row.new_value)

  if (rows.length === 0) return
  const { error } = await supabase.from('north_star_history').insert(rows)
  if (error) throw error
}

async function insertMonthlyHistory(previous: MonthlyStar, next: UpdateMonthlyStarPayload, userId: string) {
  const rows = [
    monthlyHistoryRecord(previous.id, 'target_sales', previous.target_sales, next.target_sales, userId, previous.period_month),
    monthlyHistoryRecord(previous.id, 'mtd_actual', previous.mtd_actual, next.mtd_actual, userId, previous.period_month),
    monthlyHistoryRecord(previous.id, 'ly_mtd_actual', previous.ly_mtd_actual, next.ly_mtd_actual, userId, previous.period_month),
    monthlyHistoryRecord(previous.id, 'days_elapsed', previous.days_elapsed, next.days_elapsed, userId, previous.period_month),
    monthlyHistoryRecord(previous.id, 'days_remaining', previous.days_remaining, next.days_remaining, userId, previous.period_month),
    monthlyHistoryRecord(previous.id, 'channel_deltas', previous.channel_deltas, next.channel_deltas, userId, previous.period_month),
  ].filter(row => row.old_value !== row.new_value)

  if (rows.length === 0) return
  const { error } = await supabase.from('monthly_star_history').insert(rows)
  if (error) throw error
}

function historyRecord(rowId: string, field: string, oldValue: unknown, newValue: unknown, userId: string, periodWeek: string) {
  return {
    row_id: rowId,
    field_name: field,
    old_value: valueToText(oldValue),
    new_value: valueToText(newValue),
    edited_by: userId,
    period_week: periodWeek,
  }
}

function monthlyHistoryRecord(monthlyStarId: string, field: string, oldValue: unknown, newValue: unknown, userId: string, periodMonth: string) {
  return {
    monthly_star_id: monthlyStarId,
    field_name: field,
    old_value: valueToText(oldValue),
    new_value: valueToText(newValue),
    edited_by: userId,
    period_month: periodMonth,
  }
}

function valueToText(value: unknown): string | null {
  if (value == null) return null
  if (typeof value === 'string') return value
  return JSON.stringify(value)
}
