export const config = {
  maxDuration: 60,
}

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    response.status(405).json({ error: 'Method not allowed' })
    return
  }

  const supabaseUrl = stripTrailingSlash(process.env.VITE_SUPABASE_URL || '')
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY
  const serviceKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !anonKey || !serviceKey) {
    response.status(500).json({ error: 'Supabase service configuration is missing' })
    return
  }

  try {
    const token = bearerToken(request.headers.authorization)
    const user = await requireAdmin(supabaseUrl, anonKey, serviceKey, token)
    const body = typeof request.body === 'object' && request.body ? request.body : {}
    const dateFrom = requiredDate(body.dateFrom, 'dateFrom')
    const dateTo = requiredDate(body.dateTo, 'dateTo')
    if (dateTo < dateFrom) throw new Error('dateTo must be on or after dateFrom')

    const totals = await salesTotalsForDate(supabaseUrl, serviceKey, dateTo)
    const now = new Date().toISOString()
    const state = {
      date: dateTo,
      nextPage: null,
      complete: true,
      totals: {
        calls: 0,
        units: totals.units,
        synced: totals.rows,
        revenue: totals.revenue,
        sourceRows: totals.orders,
        ordersCount: totals.orders,
        pagesFetched: 0,
        sourceRowsInWindow: totals.orders,
      },
      totalResults: nonNegativeNumber(body.finalDateOrders),
      completedAt: now,
      reportUpload: {
        filename: safeFilename(body.filename),
        dateFrom,
        dateTo,
        reportRevenue: finiteNumber(body.reportRevenue),
        reportRows: nonNegativeNumber(body.reportRows),
        finalizedBy: user.id,
      },
    }

    const checkpointResponse = await fetch(`${supabaseUrl}/rest/v1/sync_state?on_conflict=key`, {
      method: 'POST',
      headers: serviceHeaders(serviceKey, 'resolution=merge-duplicates,return=representation'),
      body: JSON.stringify({
        key: 'sellercloud_sales_cron_progress',
        cursor_value: `${dateTo}T00:00:00Z`,
        last_successful_sync_at: now,
        updated_at: now,
        state,
        last_error: null,
      }),
    })
    if (!checkpointResponse.ok) {
      throw new Error(`Could not finalize sales checkpoint: ${await checkpointResponse.text()}`)
    }

    response.setHeader('Cache-Control', 'no-store')
    response.status(200).json({ ok: true, date: dateTo, totals })
  } catch (error) {
    response.status(error?.statusCode || 400).json({ error: error instanceof Error ? error.message : 'Could not finalize sales sync' })
  }
}

async function requireAdmin(supabaseUrl, anonKey, serviceKey, token) {
  const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { apikey: anonKey, Authorization: `Bearer ${token}` },
  })
  if (!userResponse.ok) throw httpError(401, 'Invalid or expired session')
  const user = await userResponse.json()

  const profileResponse = await fetch(`${supabaseUrl}/rest/v1/users?select=role,is_active&id=eq.${encodeURIComponent(user.id)}&limit=1`, {
    headers: serviceHeaders(serviceKey),
  })
  if (!profileResponse.ok) throw new Error(`Could not verify admin profile: ${await profileResponse.text()}`)
  const profile = (await profileResponse.json())[0]
  if (!profile?.is_active || profile.role !== 'admin') throw httpError(403, 'Admin role required')
  return user
}

async function salesTotalsForDate(supabaseUrl, serviceKey, date) {
  let offset = 0
  let revenue = 0
  let orders = 0
  let units = 0
  let rows = 0

  while (true) {
    const query = `${supabaseUrl}/rest/v1/sales_daily?select=revenue,orders_count,units_sold&sale_date=eq.${date}&offset=${offset}&limit=1000`
    const result = await fetch(query, { headers: serviceHeaders(serviceKey) })
    if (!result.ok) throw new Error(`Could not verify saved sales: ${await result.text()}`)
    const page = await result.json()
    for (const row of page) {
      revenue += Number(row.revenue || 0)
      orders += Number(row.orders_count || 0)
      units += Number(row.units_sold || 0)
    }
    rows += page.length
    if (page.length < 1000) break
    offset += 1000
  }

  return { revenue: roundCurrency(revenue), orders, units, rows }
}

function serviceHeaders(serviceKey, prefer) {
  return {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
    ...(prefer ? { Prefer: prefer } : {}),
  }
}

function bearerToken(value) {
  const token = String(value || '').replace(/^Bearer\s+/i, '').trim()
  if (!token) throw httpError(401, 'Missing bearer token')
  return token
}

function requiredDate(value, name) {
  const text = String(value || '')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw new Error(`${name} must be YYYY-MM-DD`)
  return text
}

function safeFilename(value) {
  return String(value || 'SellerCloud sales report.xlsx').replace(/[\r\n]/g, ' ').slice(0, 255)
}

function finiteNumber(value) {
  const number = Number(value)
  if (!Number.isFinite(number)) throw new Error('Report totals are invalid')
  return number
}

function nonNegativeNumber(value) {
  const number = finiteNumber(value)
  if (number < 0) throw new Error('Report counts cannot be negative')
  return number
}

function roundCurrency(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

function stripTrailingSlash(value) {
  return value.endsWith('/') ? value.slice(0, -1) : value
}

function httpError(statusCode, message) {
  const error = new Error(message)
  error.statusCode = statusCode
  return error
}
