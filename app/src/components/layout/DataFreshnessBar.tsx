import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { fmtDate, isToday } from '@/lib/utils'
import { AlertTriangle, CheckCircle, Upload } from 'lucide-react'
import { Freshness } from '@/types'

async function fetchFreshness(): Promise<Freshness> {
  const { data } = await supabase
    .from('uploads')
    .select('uploaded_at')
    .eq('status', 'complete')
    .order('uploaded_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!data) return { status: 'no_data', date: null }
  return {
    status: isToday(data.uploaded_at) ? 'fresh' : 'stale',
    date: data.uploaded_at,
  }
}

export default function DataFreshnessBar() {
  const { data: freshness } = useQuery({
    queryKey: ['freshness'],
    queryFn: fetchFreshness,
    refetchInterval: 60_000,
  })

  if (!freshness) return null

  if (freshness.status === 'fresh') {
    return (
      <div className="flex items-center gap-2 px-4 py-2 bg-success/10 border-b border-success/20 text-success text-xs font-medium">
        <CheckCircle size={13} />
        Data current as of {fmtDate(freshness.date!)}
      </div>
    )
  }

  if (freshness.status === 'stale') {
    return (
      <div className="flex items-center gap-2 px-4 py-2 bg-danger/10 border-b border-danger/20 text-danger text-xs font-medium">
        <AlertTriangle size={13} />
        ⚠ Outdated! Last updated on: {fmtDate(freshness.date!)} — please upload today's report.
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2 px-4 py-2 bg-warning/10 border-b border-warning/20 text-warning text-xs font-medium">
      <Upload size={13} />
      No data loaded yet. Upload the fullreport.csv to get started.
    </div>
  )
}
