import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import type { ParsedLeadershipTool } from '@/lib/leadershipToolParser'
import type { LeadershipToolSnapshot } from '@/types'

export function useLeadershipSnapshot() {
  return useQuery({
    queryKey: ['leadership_tool_snapshot', 'current'],
    queryFn: async (): Promise<LeadershipToolSnapshot | null> => {
      const { data, error } = await supabase
        .from('leadership_tool_snapshot')
        .select('*')
        .eq('snapshot_key', 'current')
        .maybeSingle()

      if (error) {
        if ((error as { code?: string }).code === '42P01') return null
        throw error
      }

      return data as LeadershipToolSnapshot | null
    },
    staleTime: 5 * 60 * 1000,
  })
}

export function useReplaceLeadershipSnapshot() {
  const qc = useQueryClient()
  const { profile } = useAuth()

  return useMutation({
    mutationFn: async ({ filename, parsed }: { filename: string; parsed: ParsedLeadershipTool }) => {
      if (!profile || profile.role !== 'admin') throw new Error('Admin role required')

      const { data, error } = await supabase
        .from('leadership_tool_snapshot')
        .upsert({
          snapshot_key: 'current',
          filename,
          uploaded_by: profile.id,
          uploaded_at: new Date().toISOString(),
          cashflow: parsed.cashflow,
          payroll: parsed.payroll,
          pnl: parsed.pnl,
          sales_simulation: parsed.sales_simulation,
          source_meta: parsed.source_meta,
        }, { onConflict: 'snapshot_key' })
        .select('*')
        .single()

      if (error) throw error
      return data as LeadershipToolSnapshot
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['leadership_tool_snapshot', 'current'] })
    },
  })
}
