import type { Freshness } from '@/types'

export const MYSQL_REFRESH_MAX_AGE_MS = 36 * 60 * 60 * 1000

export function deriveFreshness(
  uploadedAt: string | null,
  metricsRefreshedAt: string | null,
  now = new Date(),
): Freshness {
  if (!uploadedAt) {
    return { status: 'no_data', date: null, metricsRefreshedAt }
  }

  const uploadIsToday = new Date(uploadedAt).toDateString() === now.toDateString()
  const refreshTime = metricsRefreshedAt ? new Date(metricsRefreshedAt).getTime() : NaN
  const refreshAge = now.getTime() - refreshTime
  const metricsAreRecent =
    Number.isFinite(refreshTime) && refreshAge <= MYSQL_REFRESH_MAX_AGE_MS

  return {
    status: uploadIsToday && metricsAreRecent ? 'fresh' : 'stale',
    date: uploadedAt,
    metricsRefreshedAt,
  }
}
