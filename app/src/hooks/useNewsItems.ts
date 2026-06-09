import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { NewsItem } from '@/types'

export function useNewsItems(search = '') {
  return useQuery({
    queryKey: ['news_items', { search }],
    queryFn: async (): Promise<NewsItem[]> => {
      let query = supabase
        .from('news_items')
        .select('*')
        .order('published_at', { ascending: false, nullsFirst: false })
        .limit(100)

      const q = search.trim()
      if (q) query = query.or(`title.ilike.%${q}%,source.ilike.%${q}%,snippet.ilike.%${q}%`)

      const { data, error } = await query
      if (error) throw error
      return (data ?? []) as NewsItem[]
    },
    staleTime: 10 * 60 * 1000,
  })
}

export function useRefreshNews() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('refresh-news')
      if (error) throw error
      return data as { synced: number; durationMs: number }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['news_items'] }),
  })
}
