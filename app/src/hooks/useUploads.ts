import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Upload } from '@/types'

export function useUploads() {
  return useQuery({
    queryKey: ['uploads'],
    queryFn: async (): Promise<Upload[]> => {
      const { data, error } = await supabase
        .from('uploads')
        .select('*, uploader:uploaded_by(name, email)')
        .order('uploaded_at', { ascending: false })
        .limit(50)
      if (error) throw error
      return (data ?? []) as unknown as Upload[]
    },
  })
}

/** Upload a CSV file to the Edge Function */
export function useUploadCSV() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (file: File) => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Not authenticated')

      const formData = new FormData()
      formData.append('file', file)

      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/upload-csv`
      const res = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: formData,
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `Upload failed (${res.status})`)
      }
      return res.json()
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['uploads'] })
      qc.invalidateQueries({ queryKey: ['inventory'] })
      qc.invalidateQueries({ queryKey: ['freshness'] })
    },
  })
}
