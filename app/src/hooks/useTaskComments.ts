import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import type { TaskActivityEvent, TaskComment, TaskCommentKind } from '@/types'

export function useTaskComments(taskId: string | null | undefined) {
  return useQuery({
    queryKey: ['task_comments', taskId],
    enabled: !!taskId,
    queryFn: async (): Promise<TaskComment[]> => {
      const { data, error } = await supabase
        .from('task_comments')
        .select('*, author:author_id(name, email)')
        .eq('task_id', taskId)
        .order('created_at', { ascending: true })
      if (error) throw error
      return (data ?? []) as unknown as TaskComment[]
    },
  })
}

export function useTaskCommentCounts(taskIds: string[]) {
  const uniqueIds = Array.from(new Set(taskIds)).sort()

  return useQuery({
    queryKey: ['task_comment_counts', uniqueIds],
    enabled: uniqueIds.length > 0,
    queryFn: async (): Promise<Map<string, number>> => {
      const { data, error } = await supabase
        .from('task_comments')
        .select('task_id')
        .in('task_id', uniqueIds)
      if (error) throw error

      const counts = new Map<string, number>()
      for (const row of data ?? []) {
        counts.set(row.task_id, (counts.get(row.task_id) ?? 0) + 1)
      }
      return counts
    },
  })
}

export function useTaskActivityEvents(taskId: string | null | undefined) {
  return useQuery({
    queryKey: ['task_activity_events', taskId],
    enabled: !!taskId,
    queryFn: async (): Promise<TaskActivityEvent[]> => {
      const { data, error } = await supabase
        .from('task_activity_events')
        .select('*, actor:actor_id(name, email)')
        .eq('task_id', taskId)
        .order('created_at', { ascending: true })
      if (error) throw error
      return (data ?? []) as unknown as TaskActivityEvent[]
    },
  })
}

export function useAddTaskComment() {
  const qc = useQueryClient()
  const { profile } = useAuth()

  return useMutation({
    mutationFn: async ({ task_id, body, kind = 'comment' }: {
      task_id: string
      body: string
      kind?: TaskCommentKind
    }) => {
      const trimmed = body.trim()
      if (!trimmed) return
      const { error } = await supabase.from('task_comments').insert({
        task_id,
        author_id: profile!.id,
        body: trimmed,
        kind,
      })
      if (error) throw error
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['task_comments', variables.task_id] })
      qc.invalidateQueries({ queryKey: ['task_comment_counts'] })
    },
  })
}
