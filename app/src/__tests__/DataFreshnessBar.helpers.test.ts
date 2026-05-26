import { describe, expect, it } from 'vitest'
import { deriveFreshness } from '../components/layout/DataFreshnessBar.helpers'

describe('deriveFreshness', () => {
  const now = new Date('2026-05-26T12:00:00Z')

  it('reports fresh when todays upload has a recent MySQL metrics refresh', () => {
    expect(
      deriveFreshness('2026-05-26T02:00:00Z', '2026-05-26T03:00:00Z', now),
    ).toEqual({
      status: 'fresh',
      date: '2026-05-26T02:00:00Z',
      metricsRefreshedAt: '2026-05-26T03:00:00Z',
    })
  })

  it('reports stale when the MySQL metrics refresh is older than 36 hours', () => {
    expect(
      deriveFreshness('2026-05-26T02:00:00Z', '2026-05-24T23:59:59Z', now).status,
    ).toBe('stale')
  })

  it('reports stale when no MySQL metrics refresh is available', () => {
    expect(deriveFreshness('2026-05-26T02:00:00Z', null, now).status).toBe('stale')
  })

  it('reports no data when no inventory upload exists', () => {
    expect(deriveFreshness(null, '2026-05-26T03:00:00Z', now).status).toBe('no_data')
  })
})
