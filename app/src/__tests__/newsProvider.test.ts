import { describe, expect, it } from 'vitest'
import {
  buildGdeltDocUrl,
  normalizeGdeltArticles,
  parseGdeltSeenDate,
  stableNewsId,
} from '../lib/newsProvider'

describe('newsProvider', () => {
  it('builds a GDELT DOC artlist URL', () => {
    const url = buildGdeltDocUrl('ports', 10)

    expect(url).toContain('api.gdeltproject.org/api/v2/doc/doc')
    expect(url).toContain('query=ports')
    expect(url).toContain('mode=artlist')
    expect(url).toContain('format=json')
    expect(url).toContain('maxrecords=10')
  })

  it('normalizes GDELT articles and removes duplicates', () => {
    const rows = normalizeGdeltArticles([
      { url: 'https://example.com/a', title: 'Port congestion eases', domain: 'example.com', seendate: '20260609T120000Z', sourceCountry: 'US' },
      { url: 'https://example.com/a', title: 'Duplicate', domain: 'example.com' },
      { url: '', title: 'No URL' },
    ], 'ports')

    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      id: stableNewsId('https://example.com/a'),
      provider: 'gdelt',
      title: 'Port congestion eases',
      source: 'example.com',
      published_at: '2026-06-09T12:00:00Z',
      snippet: 'Source country: US',
      query: 'ports',
    })
  })

  it('parses compact and ISO-like dates', () => {
    expect(parseGdeltSeenDate('20260609T120000Z')).toBe('2026-06-09T12:00:00Z')
    expect(parseGdeltSeenDate('2026-06-09T12:00:00Z')).toBe('2026-06-09T12:00:00.000Z')
    expect(parseGdeltSeenDate('bad')).toBeNull()
  })
})
