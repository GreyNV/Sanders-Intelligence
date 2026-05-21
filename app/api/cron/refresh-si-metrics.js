import { refreshSiMetrics } from '../../scripts/lib/si-metrics-refresh.mjs'

export default async function handler(request, response) {
  if (request.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    response.status(401).json({ error: 'Unauthorized' })
    return
  }

  if (request.method !== 'GET' && request.method !== 'POST') {
    response.status(405).json({ error: 'Method not allowed' })
    return
  }

  try {
    const result = await refreshSiMetrics()
    response.status(200).json({ ok: true, ...result })
  } catch (error) {
    response.status(500).json({ ok: false, error: error.message })
  }
}
