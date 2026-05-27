import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, CheckCircle, Upload } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { fmtDate, fmtDateTime } from '@/lib/utils'
import type { Freshness } from '@/types'
import { deriveFreshness } from './DataFreshnessBar.helpers'

async function fetchFreshness(): Promise<Freshness> {
  const [{ data: upload }, { data: metricsRefresh }] = await Promise.all([
    supabase
      .from('uploads')
      .select('uploaded_at')
      .eq('status', 'complete')
      .order('uploaded_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('sku_profit_metrics')
      .select('refreshed_at')
      .order('refreshed_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  return deriveFreshness(
    upload?.uploaded_at ?? null,
    metricsRefresh?.refreshed_at ?? null,
  )
}

export default function DataFreshnessBar() {
  const { data: freshness } = useQuery({
    queryKey: ['freshness'],
    queryFn: fetchFreshness,
    refetchInterval: 60_000,
  })

  if (!freshness) return null

  const metricsRefreshLabel = freshness.metricsRefreshedAt
    ? fmtDateTime(freshness.metricsRefreshedAt)
    : 'unavailable'

  if (freshness.status === 'fresh') {
    return (
      <div className="flex flex-wrap items-center gap-2 px-4 py-2 bg-success/10 border-b border-success/20 text-success text-xs font-medium">
        <CheckCircle size={13} />
        Data current as of {fmtDate(freshness.date!)}. MySQL metrics refreshed {metricsRefreshLabel}.
      </div>
    )
  }

  if (freshness.status === 'stale') {
    return (
      <div className="flex flex-wrap items-center gap-2 px-4 py-2 bg-danger/10 border-b border-danger/20 text-danger text-xs font-medium">
        <AlertTriangle size={13} />
        Outdated! Last upload: {fmtDate(freshness.date!)}. MySQL metrics refreshed: {metricsRefreshLabel}.
      </div>
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-2 px-4 py-2 bg-warning/10 border-b border-warning/20 text-warning text-xs font-medium">
      <Upload size={13} />
      No data loaded yet. MySQL metrics refreshed: {metricsRefreshLabel}.
    </div>
  )
}
