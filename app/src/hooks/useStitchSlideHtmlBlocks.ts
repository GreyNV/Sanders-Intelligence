import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import type { StitchSlideHtmlBlock, StitchSlideHtmlViewMode } from '@/types'
import type { HistoricalChannelStatement, HistoricalStatementMonth } from '@/lib/financeHistoricalStatements'

export const RYAN_FINANCE_BASELINE_PERIOD = '2000-01-01'
export const RYAN_FINANCE_BASELINE_KEY = 'internal:ryan-finance-baseline'
export interface RyanFinanceBaseline { history: HistoricalStatementMonth[]; channelHistory: HistoricalChannelStatement[] }

/** Historical source rows are stored independently of any generated deck. */
export function useRyanFinanceBaseline() {
  return useQuery({
    queryKey:['stitch_slide_html_blocks','ryan-finance-baseline'],
    queryFn:async ():Promise<RyanFinanceBaseline|null> => {
      const {data,error}=await supabase.from('stitch_slide_html_blocks').select('html_code')
        .eq('period_month',RYAN_FINANCE_BASELINE_PERIOD).eq('slide_key',RYAN_FINANCE_BASELINE_KEY).maybeSingle()
      if(error) { if(isMissingRelationError(error)) return null; throw error }
      if(!data?.html_code) return null
      try {
        const parsed=JSON.parse(data.html_code) as Partial<RyanFinanceBaseline>
        if(!Array.isArray(parsed.history)||!Array.isArray(parsed.channelHistory)) throw new Error('invalid')
        const valid=(row:{month?:unknown;income?:unknown})=>typeof row.month==='string'&&(row.income===null||(typeof row.income==='number'&&Number.isFinite(row.income)))
        if(!parsed.history.every(valid)||!parsed.channelHistory.every(row=>valid(row)&&typeof row.channel==='string')) throw new Error('invalid')
        return {history:parsed.history,channelHistory:parsed.channelHistory}
      } catch { throw new Error('The saved Finance historical inputs could not be read. Re-upload the statements to replace them.') }
    },
    staleTime:5*60*1000,
  })
}

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

/** Most recent Ryan deck, used to carry historical baselines and milestone answers forward. */
export function useLatestRyanFinanceDeck(periodMonth: string) {
  return useQuery({
    queryKey: ['stitch_slide_html_blocks', 'ryan-latest', periodMonth],
    queryFn: async (): Promise<StitchSlideHtmlBlock | null> => {
      const { data, error } = await supabase.from('stitch_slide_html_blocks').select('*')
        .eq('slide_key', 'custom:ryan-html-deck').lte('period_month', periodMonth)
        .order('period_month', { ascending: false }).limit(1).maybeSingle()
      if (error) {
        if (isMissingRelationError(error)) return null
        throw error
      }
      return data as StitchSlideHtmlBlock | null
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
    onSuccess: async (_data, payload) => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['stitch_slide_html_blocks', payload.period_month] }),
        qc.invalidateQueries({ queryKey: ['stitch_slide_html_blocks', 'ryan-latest'] }),
        qc.invalidateQueries({ queryKey: ['stitch_slide_html_blocks', 'ryan-finance-baseline'] }),
      ])
    },
  })
}

function isMissingRelationError(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code
  return code === '42P01' || code === 'PGRST205'
}
