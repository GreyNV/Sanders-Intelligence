import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'

export type DismissActionType = 'at_risk' | 'backorder' | 'overstock'

export interface DismissedAction {
  id: string
  product_code: string
  action_type: DismissActionType
  dismissed_by: string
  dismissed_until: string | null   // ISO date, null = permanent
  reason: string | null
  created_at: string
}

/** Fetch all currently-active dismissals (permanent + not-yet-expired snoozes) */
export function useDismissedActions() {
  return useQuery({
    queryKey: ['dismissed_actions'],
    queryFn: async (): Promise<DismissedAction[]> => {
      const today = new Date().toISOString().slice(0, 10)
      const { data, error } = await supabase
        .from('dismissed_actions')
        .select('*')
        // include permanent (dismissed_until = null) and future snoozes
        .or(`dismissed_until.is.null,dismissed_until.gt.${today}`)
      if (error) throw error
      return (data ?? []) as DismissedAction[]
    },
    staleTime: 2 * 60 * 1000,
  })
}

/** Returns a Set of product_codes dismissed for the given action type */
export function useDismissedSet(actionType: DismissActionType) {
  const { data: dismissed = [] } = useDismissedActions()
  return new Set(
    dismissed
      .filter(d => d.action_type === actionType)
      .map(d => d.product_code)
  )
}

export function useDismissAction() {
  const qc = useQueryClient()
  const { profile } = useAuth()

  return useMutation({
    mutationFn: async ({
      product_code,
      action_type,
      dismissed_until,
      reason,
    }: {
      product_code: string
      action_type: DismissActionType
      dismissed_until: string | null   // ISO date string or null for permanent
      reason?: string
    }) => {
      const { error } = await supabase.from('dismissed_actions').insert({
        product_code,
        action_type,
        dismissed_by:    profile!.id,
        dismissed_until: dismissed_until ?? null,
        reason:          reason ?? null,
      })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['dismissed_actions'] }),
  })
}

export function useRestoreAction() {
  const qc = useQueryClient()
  const { profile } = useAuth()

  return useMutation({
    mutationFn: async ({ product_code, action_type }: { product_code: string; action_type: DismissActionType }) => {
      // Admins can delete any; others only their own (enforced by RLS)
      let query = supabase
        .from('dismissed_actions')
        .delete()
        .eq('product_code', product_code)
        .eq('action_type', action_type)

      // Non-admins: add own-user filter (RLS also enforces this, belt + suspenders)
      if (profile?.role !== 'admin') {
        query = query.eq('dismissed_by', profile!.id)
      }

      const { error } = await query
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['dismissed_actions'] }),
  })
}
