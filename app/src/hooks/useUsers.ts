import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { AppUser, AutomationConfig, UserRole } from '@/types'

export function useUsers() {
  return useQuery({
    queryKey: ['users'],
    queryFn: async (): Promise<AppUser[]> => {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .order('name')
      if (error) throw error
      return (data ?? []) as AppUser[]
    },
  })
}

/** Invite a new user — calls Edge Function which uses service role */
export function useInviteUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: {
      email: string; name: string; role: UserRole; department: string | null
    }) => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Not authenticated')

      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/invite-user`
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? 'Invite failed')
      }
      return res.json()
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  })
}

export function useUpdateUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<AppUser> & { id: string }) => {
      const { error } = await supabase.from('users').update(updates).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  })
}

export function useAutomationConfig() {
  return useQuery({
    queryKey: ['automation_config'],
    queryFn: async (): Promise<AutomationConfig | null> => {
      const { data, error } = await supabase.rpc('get_automation_config')
      if (error) throw error
      return (data?.[0] ?? null) as AutomationConfig | null
    },
  })
}

export function useSetDefaultAutoAssignee() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (userId: string | null) => {
      const { error } = await supabase.rpc('set_default_auto_assignee', { p_user_id: userId })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['automation_config'] })
      qc.invalidateQueries({ queryKey: ['tasks'] })
    },
  })
}
