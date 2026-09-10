import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import type { NorthStarStatus, StitchAutoRowOverride } from '@/types'
import type { NorthStarEditableField } from '@/pages/csuite/NorthStar.helpers'
import type {
  StitchAutoRowOverrideMap,
  StitchAutoRowOverrideSource,
  StitchAutoRowOverrideSourceVersions,
} from '@/pages/csuite/StitchNorthStar.helpers'

export interface UpsertStitchAutoRowOverridePayload {
  period_month: string
  source: StitchAutoRowOverrideSource
  source_version: string
  row_key: string
  field_name: NorthStarEditableField
  field_value: string | NorthStarStatus
}

export interface SeedStitchAutoRowOverridesPayload {
  period_month: string
  source_versions: StitchAutoRowOverrideSourceVersions
  overrides: StitchAutoRowOverrideMap
}

export function useStitchAutoRowOverrides(periodMonth: string) {
  return useQuery({
    queryKey: ['stitch_auto_row_overrides', periodMonth],
    queryFn: async (): Promise<StitchAutoRowOverride[]> => {
      const { data, error } = await supabase
        .from('stitch_auto_row_overrides')
        .select('*')
        .eq('period_month', periodMonth)
        .order('source', { ascending: true })
        .order('row_key', { ascending: true })
        .order('field_name', { ascending: true })

      if (error) {
        if (isMissingRelationError(error)) return []
        throw error
      }

      return (data ?? []) as StitchAutoRowOverride[]
    },
    staleTime: 2 * 60 * 1000,
  })
}

export function useUpsertStitchAutoRowOverride() {
  const qc = useQueryClient()
  const { profile } = useAuth()

  return useMutation({
    mutationFn: async (payload: UpsertStitchAutoRowOverridePayload): Promise<StitchAutoRowOverride> => {
      if (!profile?.is_active || !['admin', 'csuite'].includes(profile.role)) {
        throw new Error('BPR role required')
      }

      const row = {
        period_month: payload.period_month,
        source: payload.source,
        source_version: payload.source_version.trim(),
        row_key: payload.row_key.trim(),
        field_name: payload.field_name,
        field_value: String(payload.field_value),
        updated_by: profile.id,
        updated_at: new Date().toISOString(),
      }

      const { data, error } = await supabase
        .from('stitch_auto_row_overrides')
        .upsert(row, { onConflict: 'period_month,source,row_key,field_name' })
        .select('*')
        .single()

      if (error) throw error
      return data as StitchAutoRowOverride
    },
    onSuccess: (_data, payload) => {
      qc.invalidateQueries({ queryKey: ['stitch_auto_row_overrides', payload.period_month] })
    },
  })
}

export function useSeedStitchAutoRowOverrides() {
  const qc = useQueryClient()
  const { profile } = useAuth()

  return useMutation({
    mutationFn: async (payload: SeedStitchAutoRowOverridesPayload): Promise<void> => {
      if (!profile?.is_active || !['admin', 'csuite'].includes(profile.role)) {
        throw new Error('BPR role required')
      }

      const updatedAt = new Date().toISOString()
      const rows = Object.entries(payload.overrides).flatMap(([rowKey, fields]) => {
        const source = stitchAutoRowOverrideSourceFromKey(rowKey)
        const sourceVersion = source ? payload.source_versions[source] : undefined
        if (!source || !sourceVersion) return []

        return Object.entries(fields).map(([fieldName, fieldValue]) => ({
          period_month: payload.period_month,
          source,
          source_version: sourceVersion,
          row_key: rowKey,
          field_name: fieldName,
          field_value: String(fieldValue),
          updated_by: profile.id,
          updated_at: updatedAt,
        }))
      })

      if (rows.length === 0) return

      const { error } = await supabase
        .from('stitch_auto_row_overrides')
        .upsert(rows, {
          onConflict: 'period_month,source,row_key,field_name',
          ignoreDuplicates: true,
        })

      if (error) throw error
    },
    onSuccess: (_data, payload) => {
      qc.invalidateQueries({ queryKey: ['stitch_auto_row_overrides', payload.period_month] })
    },
  })
}

function stitchAutoRowOverrideSourceFromKey(rowKey: string): StitchAutoRowOverrideSource | null {
  if (rowKey.startsWith('monthly_star:')) return 'monthly_star'
  if (rowKey.startsWith('leadership_tool:')) return 'leadership_tool'
  return null
}

function isMissingRelationError(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code
  return code === '42P01' || code === 'PGRST205'
}
