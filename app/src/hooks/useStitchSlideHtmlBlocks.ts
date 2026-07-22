import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import type { StitchSlideHtmlBlock, StitchSlideHtmlViewMode } from '@/types'

export interface UpsertStitchSlideHtmlBlockPayload {
  period_month: string
  slide_key: string
  view_mode: StitchSlideHtmlViewMode
  html_code: string
}

export function useStitchSlideHtmlBlocks(periodMonth: string) {
  return useQuery({
    queryKey: ['stitch_slide_html_blocks', periodMonth],
    queryFn: async (): Promise<StitchSlideHtmlBlock[]> => {
      const { data, error } = await supabase
        .from('stitch_slide_html_blocks')
        .select('*')
        .eq('period_month', periodMonth)
        .order('slide_key', { ascending: true })

      if (error) {
        if (isMissingRelationError(error)) return []
        throw error
      }

      return (data ?? []) as StitchSlideHtmlBlock[]
    },
    staleTime: 5 * 60 * 1000,
  })
}

export function useUpsertStitchSlideHtmlBlock() {
  const qc = useQueryClient()
  const { profile } = useAuth()

  return useMutation({
    mutationFn: async (payload: UpsertStitchSlideHtmlBlockPayload): Promise<StitchSlideHtmlBlock> => {
      if (!profile?.is_active || !['admin', 'csuite'].includes(profile.role)) {
        throw new Error('BPR role required')
      }

      const row = {
        period_month: payload.period_month,
        slide_key: payload.slide_key.trim(),
        view_mode: payload.view_mode,
        html_code: payload.html_code,
        updated_by: profile.id,
        updated_at: new Date().toISOString(),
      }

      const { data, error } = await supabase
        .from('stitch_slide_html_blocks')
        .upsert(row, { onConflict: 'period_month,slide_key' })
        .select('*')
        .single()

      if (error) throw error
      return data as StitchSlideHtmlBlock
    },
    onSuccess: (_data, payload) => {
      qc.invalidateQueries({ queryKey: ['stitch_slide_html_blocks', payload.period_month] })
    },
  })
}

function isMissingRelationError(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code
  return code === '42P01' || code === 'PGRST205'
}
