import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import type { StitchSlideHtmlBlock, StitchSlideHtmlViewMode } from '@/types'
import type { HistoricalChannelStatement, HistoricalStatementMonth } from '@/lib/financeHistoricalStatements'
import { readFinanceMilestoneInputs, type FinanceMilestoneInputs } from '@/lib/financeDeckGenerator'
import { mergeFinanceLeadershipHistory, readFinanceLeadershipHistory, type FinanceLeadershipHistory } from '@/lib/financeLeadershipHistory'
import type { ParsedLeadershipTool } from '@/lib/leadershipToolParser'
import type { FinanceLeadershipDetails } from '@/lib/financeLeadershipDetails'

export const RYAN_FINANCE_BASELINE_PERIOD = '2000-01-01'
export const RYAN_FINANCE_BASELINE_KEY = 'internal:ryan-finance-baseline'
export const RYAN_FINANCE_MILESTONES_KEY = 'internal:ryan-finance-milestones'
export const RYAN_FINANCE_LEADERSHIP_KEY = 'internal:ryan-finance-leadership-history'
export interface RyanFinanceBaseline { history: HistoricalStatementMonth[]; channelHistory: HistoricalChannelStatement[] }

async function fetchFinanceLeadershipRecord():Promise<{history:FinanceLeadershipHistory;updatedAt:string}|null> {
  const {data,error}=await supabase.from('stitch_slide_html_blocks').select('html_code,updated_at')
    .eq('period_month',RYAN_FINANCE_BASELINE_PERIOD).eq('slide_key',RYAN_FINANCE_LEADERSHIP_KEY).maybeSingle()
  if(error)throw error
  if(!data)return null
  if(!data.html_code)throw new Error('Saved Finance Leadership history is empty. Refresh and try again.')
  const history=readFinanceLeadershipHistory(data.html_code)
  if(!history||typeof data.updated_at!=='string')throw new Error('Saved Finance Leadership history could not be read. Refresh and try again.')
  return {history,updatedAt:data.updated_at}
}

export function useRyanFinanceLeadership() {
  return useQuery({queryKey:['stitch_slide_html_blocks','ryan-finance-leadership'],queryFn:async()=>(await fetchFinanceLeadershipRecord())?.history??null,staleTime:5*60*1000})
}

/** Fetch again before each upload, then merge overlapping values and save the result. */
export function useSaveRyanFinanceLeadership() {
  const qc=useQueryClient(), {profile}=useAuth()
  return useMutation({
    mutationFn:async (incoming:{filename:string;parsed:ParsedLeadershipTool;details:FinanceLeadershipDetails})=>{
      if(!profile?.is_active||profile.role!=='admin')throw new Error('Admin role required')
      // Compare the database version so concurrent uploads cannot silently erase history.
      for(let attempt=0;attempt<3;attempt++){
        const existing=await fetchFinanceLeadershipRecord()
        const savedTime=existing?Date.parse(existing.updatedAt):0
        const history=mergeFinanceLeadershipHistory(existing?.history??null,incoming,new Date(Math.max(Date.now(),Number.isFinite(savedTime)?savedTime+1:0)).toISOString())
        const payload={period_month:RYAN_FINANCE_BASELINE_PERIOD,slide_key:RYAN_FINANCE_LEADERSHIP_KEY,view_mode:'fields',html_code:JSON.stringify(history),updated_by:profile.id,updated_at:history.uploadedAt}
        const result=existing
          ? await supabase.from('stitch_slide_html_blocks').update(payload).eq('period_month',RYAN_FINANCE_BASELINE_PERIOD).eq('slide_key',RYAN_FINANCE_LEADERSHIP_KEY).eq('updated_at',existing.updatedAt).select('id').maybeSingle()
          : await supabase.from('stitch_slide_html_blocks').insert(payload).select('id').maybeSingle()
        if(result.error){if(!existing&&result.error.code==='23505')continue;throw result.error}
        if(result.data)return history
      }
      throw new Error('Finance history changed during upload. Please retry the upload.')
    },
    onSuccess:history=>{qc.setQueryData(['stitch_slide_html_blocks','ryan-finance-leadership'],history)},
  })
}

export function useRyanFinanceMilestones() {
  return useQuery({
    queryKey:['stitch_slide_html_blocks','ryan-finance-milestones'],
    queryFn:async ():Promise<FinanceMilestoneInputs|null>=>{
      const {data,error}=await supabase.from('stitch_slide_html_blocks').select('html_code')
        .eq('period_month',RYAN_FINANCE_BASELINE_PERIOD).eq('slide_key',RYAN_FINANCE_MILESTONES_KEY).maybeSingle()
      if(error){if(isMissingRelationError(error))return null;throw error}
      if(!data?.html_code)return null
      const result=readFinanceMilestoneInputs(data.html_code)
      if(!result)throw new Error('Saved Finance milestones could not be read.')
      return result
    },
    staleTime:5*60*1000,
  })
}

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
        qc.invalidateQueries({ queryKey: ['stitch_slide_html_blocks', 'ryan-finance-milestones'] }),
      ])
    },
  })
}

function isMissingRelationError(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code
  return code === '42P01' || code === 'PGRST205'
}
