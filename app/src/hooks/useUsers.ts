import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { AppUser, UserRole } from '@/types'

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
