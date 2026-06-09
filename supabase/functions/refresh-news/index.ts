import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const DEFAULT_QUERY = '(logistics OR freight OR shipping OR port OR imports OR exports OR supply chain)'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const started = Date.now()
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )
    await requireAdmin(req, supabase)

    const url = new URL('https://api.gdeltproject.org/api/v2/doc/doc')
    url.searchParams.set('query', DEFAULT_QUERY)
    url.searchParams.set('mode', 'artlist')
    url.searchParams.set('format', 'json')
    url.searchParams.set('sort', 'datedesc')
    url.searchParams.set('maxrecords', '25')

    const response = await fetch(url)
    if (!response.ok) throw new Error(`GDELT refresh failed (${response.status})`)
    const body = await response.json()
    const articles = Array.isArray(body.articles) ? body.articles : []
    const rows = normalizeArticles(articles)

    if (rows.length > 0) {
      const { error } = await supabase.from('news_items').upsert(rows, { onConflict: 'id' })
      if (error) throw error
    }

    return json({ synced: rows.length, durationMs: Date.now() - started })
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'News refresh failed' }, 500)
  }
})

async function requireAdmin(req: Request, supabase: ReturnType<typeof createClient>) {
  const token = req.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) throw new Error('Missing bearer token')

  const { data: authData, error: authError } = await supabase.auth.getUser(token)
  if (authError || !authData.user) throw new Error('Invalid bearer token')

  const { data: profile, error } = await supabase
    .from('users')
    .select('role, is_active')
    .eq('id', authData.user.id)
    .single()
  if (error) throw error
  if (!profile?.is_active || profile.role !== 'admin') throw new Error('Admin role required')
}

function normalizeArticles(articles: Array<Record<string, unknown>>) {
  const seen = new Set<string>()
  return articles.flatMap(article => {
    const url = String(article.url ?? '')
    const title = String(article.title ?? '')
    if (!url || !title || seen.has(url)) return []
    seen.add(url)

    return [{
      id: stableNewsId(url),
      provider: 'gdelt',
      title,
      source: article.domain ? String(article.domain) : null,
      url,
      published_at: parseGdeltSeenDate(article.seendate),
      snippet: article.sourceCountry ? `Source country: ${article.sourceCountry}` : null,
      query: DEFAULT_QUERY,
    }]
  })
}

function parseGdeltSeenDate(value: unknown): string | null {
  if (!value) return null
  const text = String(value)
  const compact = text.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z?$/)
  if (compact) return `${compact[1]}-${compact[2]}-${compact[3]}T${compact[4]}:${compact[5]}:${compact[6]}Z`

  const parsed = new Date(text)
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null
}

function stableNewsId(url: string): string {
  let hash = 0
  for (let index = 0; index < url.length; index += 1) {
    hash = ((hash << 5) - hash + url.charCodeAt(index)) | 0
  }
  return `gdelt-${Math.abs(hash)}`
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
