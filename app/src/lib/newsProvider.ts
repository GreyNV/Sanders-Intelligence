export const DEFAULT_NEWS_QUERY = '("supply chain" OR "container shipping" OR "freight rates" OR "port congestion" OR "customs clearance" OR "ocean freight")'
const LOGISTICS_PATTERNS = [
  /ocean freight/i,
  /container shipping/i,
  /freight rate/i,
  /port congestion/i,
  /customs clearance/i,
  /\bimport logistics\b/i,
  /\bexport logistics\b/i,
  /\blogistics\b/i,
  /\bshipping\b/i,
  /\bfreight\b/i,
  /\bports?\b/i,
]

export interface GdeltArticle {
  url?: string
  title?: string
  seendate?: string
  domain?: string
  sourceCountry?: string
  socialimage?: string
}

export interface NormalizedNewsArticle {
  id: string
  provider: 'gdelt'
  title: string
  source: string | null
  url: string
  published_at: string | null
  snippet: string | null
  query: string
}

export function buildGdeltDocUrl(query = DEFAULT_NEWS_QUERY, maxRecords = 25): string {
  const params = new URLSearchParams({
    query,
    mode: 'artlist',
    format: 'json',
    sort: 'datedesc',
    maxrecords: String(maxRecords),
  })
  return `https://api.gdeltproject.org/api/v2/doc/doc?${params.toString()}`
}

export function normalizeGdeltArticles(
  articles: GdeltArticle[],
  query = DEFAULT_NEWS_QUERY
): NormalizedNewsArticle[] {
  const seen = new Set<string>()

  return articles.flatMap(article => {
    if (!article.url || !article.title) return []
    if (seen.has(article.url)) return []
    const searchable = `${article.title} ${article.domain ?? ''}`
    if (!LOGISTICS_PATTERNS.some(pattern => pattern.test(searchable))) return []
    seen.add(article.url)

    return [{
      id: stableNewsId(article.url),
      provider: 'gdelt' as const,
      title: article.title,
      source: article.domain ?? null,
      url: article.url,
      published_at: parseGdeltSeenDate(article.seendate),
      snippet: article.sourceCountry ? `Source country: ${article.sourceCountry}` : null,
      query,
    }]
  })
}

export function parseGdeltSeenDate(value?: string): string | null {
  if (!value) return null
  const compact = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z?$/)
  if (compact) {
    return `${compact[1]}-${compact[2]}-${compact[3]}T${compact[4]}:${compact[5]}:${compact[6]}Z`
  }

  const parsed = new Date(value)
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null
}

export function stableNewsId(url: string): string {
  let hash = 0
  for (let index = 0; index < url.length; index += 1) {
    hash = ((hash << 5) - hash + url.charCodeAt(index)) | 0
  }
  return `gdelt-${Math.abs(hash)}`
}
