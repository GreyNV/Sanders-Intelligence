import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { Task, TaskFormValues, TaskStatus } from '@/types'

async function fetchTasks(role: string, department: string | null): Promise<Task[]> {
  let query = supabase
    .from('tasks')
    .select(`
      *,
      assignee:assigned_to(name, email),
      creator:created_by(name, email)
    `)
    .order('created_at', { ascending: false })

  // purchasing users only see their dept; csuite/admin see all
  if (role === 'purchasing' && department) {
    query = query.eq('department', department)
  }

  const { data, error } = await query
  if (error) throw error
  return (data ?? []) as unknown as Task[]
}

export function useTasks() {
  const { profile } = useAuth()
  return useQuery({
    queryKey: ['tasks', profile?.role, profile?.department],
    queryFn: () => fetchTasks(profile?.role ?? 'purchasing', profile?.department ?? null),
    enabled: !!profile,
  })
}

export function useCreateTask() {
  const qc = useQueryClient()
  const { profile } = useAuth()

  return useMutation({
    mutationFn: async (values: TaskFormValues) => {
      const { error } = await supabase.from('tasks').insert({
        title:       values.title,
        description: values.description || null,
        priority:    values.priority,
        due_date:    values.due_date || null,
        assigned_to: values.assigned_to || null,
        sku_code:    values.sku_code || null,
        department:  values.department || profile?.department || 'purchasing',
        created_by:  profile!.id,
        status:      'todo',
        source:      'manual',
      })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
  })
}

export function useUpdateTaskStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: TaskStatus }) => {
      const { error } = await supabase
        .from('tasks')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
  })
}

export function useUpdateTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, values }: { id: string; values: Partial<TaskFormValues> }) => {
      const { error } = await supabase
        .from('tasks')
        .update({
          title:       values.title,
          description: values.description ?? null,
          priority:    values.priority,
          due_date:    values.due_date ?? null,
          assigned_to: values.assigned_to ?? null,
          sku_code:    values.sku_code ?? null,
          department:  values.department,
          updated_at:  new Date().toISOString(),
        })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
  })
}

export function useDeleteTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('tasks').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
  })
}
