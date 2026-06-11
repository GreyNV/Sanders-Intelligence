export default async function handler(request, response) {
  if (request.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    response.status(401).json({ error: 'Unauthorized' })
    return
  }

  if (request.method !== 'GET' && request.method !== 'POST') {
    response.status(405).json({ error: 'Method not allowed' })
    return
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceKey) {
    response.status(500).json({ ok: false, error: 'Supabase service configuration is missing' })
    return
  }

  try {
    const syncResponse = await fetch(`${supabaseUrl}/functions/v1/sync-purchase-orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({
        maxPages: 4,
        pageSize: 10,
        includeItems: true,
        activeOnly: true,
      }),
    })

    const body = await syncResponse.json().catch(() => ({}))
    if (!syncResponse.ok) {
      response.status(syncResponse.status).json({
        ok: false,
        error: body.error || `Purchase order sync failed (${syncResponse.status})`,
      })
      return
    }

    response.status(200).json({ ok: true, ...body })
  } catch (error) {
    response.status(500).json({ ok: false, error: error.message })
  }
}
