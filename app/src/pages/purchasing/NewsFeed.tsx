import { useMemo, useState } from 'react'
import { AlertTriangle, ExternalLink, Newspaper, RefreshCw, Search } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useNewsItems, useRefreshNews } from '@/hooks/useNewsItems'
import { fmtDateTime } from '@/lib/utils'
import { PageLoader } from '@/components/ui/LoadingSpinner'

export default function NewsFeed() {
  const { profile } = useAuth()
  const [search, setSearch] = useState('')
  const { data: news = [], isLoading, error } = useNewsItems(search)
  const refreshNews = useRefreshNews()

  const latestPublished = useMemo(() => {
    const first = news.find(item => item.published_at)
    return first?.published_at ?? null
  }, [news])

  if (isLoading) return <PageLoader />
  if (error) return (
    <div className="card text-center py-16">
      <AlertTriangle size={32} className="text-danger mx-auto mb-3" />
      <div className="text-text1 font-semibold">Failed to load news feed</div>
      <div className="text-text2 text-sm mt-1">{(error as Error)?.message ?? 'Try refreshing the page.'}</div>
    </div>
  )

  return (
    <div>
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-text1 flex items-center gap-2">
            <Newspaper size={20} className="text-accent" /> Logistics News
          </h1>
          <p className="text-text2 text-sm mt-0.5">
            Cached import, export, freight, and supply-chain coverage from GDELT.
          </p>
        </div>
        {profile?.role === 'admin' && (
          <button
            onClick={() => refreshNews.mutate()}
            disabled={refreshNews.isPending}
            className="btn-primary text-xs"
            title="Refresh logistics news from GDELT"
          >
            <RefreshCw size={13} className={refreshNews.isPending ? 'animate-spin' : ''} />
            {refreshNews.isPending ? 'Refreshing' : 'Refresh'}
          </button>
        )}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text2" />
          <input
            className="input w-full pl-8 text-sm"
            placeholder="Search articles, sources, topics..."
            value={search}
            onChange={event => setSearch(event.target.value)}
          />
        </div>
        <span className="text-xs text-text2">
          {news.length} article{news.length === 1 ? '' : 's'}
          {latestPublished ? ` - latest ${fmtDateTime(latestPublished)}` : ''}
        </span>
      </div>

      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>Article</th>
              <th>Source</th>
              <th>Published</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {news.length === 0 ? (
              <tr>
                <td colSpan={4} className="py-10 text-center text-text2">
                  No logistics news cached yet. Admins can refresh the feed from GDELT.
                </td>
              </tr>
            ) : news.map(item => (
              <tr key={item.id}>
                <td className="max-w-[620px]">
                  <div className="font-medium text-text1">{item.title}</div>
                  {item.snippet && <div className="text-xs text-text2 mt-1">{item.snippet}</div>}
                </td>
                <td className="text-xs text-text2">{item.source ?? item.provider}</td>
                <td className="text-xs text-text2 whitespace-nowrap">
                  {item.published_at ? fmtDateTime(item.published_at) : 'Unknown'}
                </td>
                <td className="text-right">
                  <a className="btn-ghost text-xs py-1 px-2" href={item.url} target="_blank" rel="noreferrer">
                    <ExternalLink size={12} /> Open
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
