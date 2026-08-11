import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import type { StitchPresenterOrderRow } from '@/types'

export interface UpdateStitchPresenterOrderPayload {
  presenters: Array<{
    owner_key: string
    owner_name: string
    sort_index: number
  }>
}

export function useStitchPresenterOrder() {
  return useQuery({
    queryKey: ['stitch_presenter_order'],
    queryFn: async (): Promise<StitchPresenterOrderRow[]> => {
      const { data, error } = await supabase
        .from('stitch_presenter_order')
        .select('*')
        .order('sort_index', { ascending: true })
        .order('owner_name', { ascending: true })

      if (error) {
        if (isMissingRelationError(error)) return []
        throw error
      }

      return (data ?? []) as StitchPresenterOrderRow[]
    },
    staleTime: 5 * 60 * 1000,
  })
}

export function useUpdateStitchPresenterOrder() {
  const qc = useQueryClient()
  const { profile } = useAuth()

  return useMutation({
    mutationFn: async (payload: UpdateStitchPresenterOrderPayload): Promise<StitchPresenterOrderRow[]> => {
      if (!profile || profile.role !== 'admin') throw new Error('Admin role required')

      const rows = payload.presenters
        .filter(entry => entry.owner_key.trim() && entry.owner_name.trim())
        .map((entry, index) => ({
          owner_key: entry.owner_key.trim().toLowerCase(),
          owner_name: entry.owner_name.trim(),
          sort_index: index,
          updated_by: profile.id,
          updated_at: new Date().toISOString(),
        }))

      if (rows.length === 0) return []

      const { data, error } = await supabase
        .from('stitch_presenter_order')
        .upsert(rows, { onConflict: 'owner_key' })
        .select('*')
        .order('sort_index', { ascending: true })

      if (error) throw error
      return (data ?? []) as StitchPresenterOrderRow[]
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['stitch_presenter_order'] })
    },
  })
}

function isMissingRelationError(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code
  return code === '42P01' || code === 'PGRST205'
}
