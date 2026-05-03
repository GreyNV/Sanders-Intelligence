/**
 * Sanders Intelligence — CSV Upload Edge Function
 *
 * POST /functions/v1/upload-csv
 * Content-Type: multipart/form-data  (field name: "file")
 * Authorization: Bearer <user JWT>
 *
 * Validates the file, bulk-inserts all inventory records,
 * and creates an entry in the uploads table.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
}

// Expected CSV column headers (order-independent matching)
const REQUIRED_COLS = [
  'warehouse', 'Product code', 'Description',
  'Supplier code', 'Supplier description', 'On hand', 'Status',
]

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    // ── Auth ──────────────────────────────────────────────────────────────────
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Unauthorized' }, 401)

    const supabaseUrl  = Deno.env.get('SUPABASE_URL')!
    const serviceKey   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const anonKey      = Deno.env.get('SUPABASE_ANON_KEY')!

    // Verify the calling user's JWT
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user }, error: authError } = await userClient.auth.getUser()
    if (authError || !user) return json({ error: 'Unauthorized' }, 401)

    // Check role (admin or purchasing)
    const admin = createClient(supabaseUrl, serviceKey)
    const { data: profile } = await admin
      .from('users')
      .select('role, id')
      .eq('id', user.id)
      .single()

    if (!profile || !['admin', 'purchasing'].includes(profile.role)) {
      return json({ error: 'Insufficient permissions' }, 403)
    }

    // ── Parse multipart ───────────────────────────────────────────────────────
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    if (!file) return json({ error: 'No file provided' }, 400)
    if (!file.name.toLowerCase().endsWith('.csv')) {
      return json({ error: 'File must be a .csv' }, 400)
    }

    const csvText = await file.text()
    const lines   = csvText.split('\n').map(l => l.trim()).filter(Boolean)
    if (lines.length < 2) return json({ error: 'CSV is empty or has no data rows' }, 400)

    // ── Parse headers ─────────────────────────────────────────────────────────
    const rawHeaders = parseCSVLine(lines[0])

    // Validate required columns exist
    const missing = REQUIRED_COLS.filter(
      col => !rawHeaders.some(h => h.toLowerCase() === col.toLowerCase())
    )
    if (missing.length > 0) {
      return json({ error: `Missing required columns: ${missing.join(', ')}` }, 400)
    }

    // ── Create upload record ──────────────────────────────────────────────────
    const { data: uploadRow, error: uploadErr } = await admin
      .from('uploads')
      .insert({
        uploaded_by: profile.id,
        filename:    file.name,
        status:      'processing',
      })
      .select('id')
      .single()

    if (uploadErr || !uploadRow) {
      return json({ error: 'Failed to create upload record' }, 500)
    }

    const uploadId = uploadRow.id

    // ── Parse rows & map to schema ────────────────────────────────────────────
    const col = (name: string) => rawHeaders.findIndex(h => h.toLowerCase() === name.toLowerCase())

    const records = []
    for (let i = 1; i < lines.length; i++) {
      const vals = parseCSVLine(lines[i])
      if (vals.length < 5) continue   // skip malformed/empty rows

      records.push({
        upload_id:                          uploadId,
        warehouse:                          vals[col('warehouse')] ?? '',
        product_code:                       vals[col('Product code')] ?? '',
        description:                        vals[col('Description')] ?? '',
        supplier_code:                      vals[col('Supplier code')] ?? '',
        supplier_description:               vals[col('Supplier description')] ?? '',
        brand_code:                         vals[col('Brand Code')] ?? '',
        brand_name:                         vals[col('Brand Name')] ?? '',
        category_code:                      vals[col('Category Code')] ?? '',
        category_name:                      vals[col('Category Name')] ?? '',
        on_hand:                            parseNum(vals[col('On hand')]),
        days_on_hand:                       parseNum(vals[col('Days on hand')]),
        cost_price:                         parseNum(vals[col('Cost price')]),
        on_hand_value:                      parseNum(vals[col('On hand value')]),
        classification:                     vals[col('Classification')] ?? '',
        velocity:                           vals[col('Velocity')] ?? '',
        status:                             vals[col('Status')] ?? '',
        status_units:                       parseNum(vals[col('Status units')]),
        status_value:                       parseNum(vals[col('Status value')]),
        excess_units:                       parseNum(vals[col('Excess units')]),
        excess_value:                       parseNum(vals[col('Excess Value')]),
        recommended_order:                  parseNum(vals[col('Recommended order')]),
        recommended_order_value:            parseNum(vals[col('Recommended order value')]),
        recommended_order_days:             parseNum(vals[col('Recommended order days')]),
        age:                                parseNum(vals[col('Age')]),
        average_sales:                      parseNum(vals[col('Average sales')]),
        average_forecasted_sales:           parseNum(vals[col('Average forecasted sales')]),
        lt_days:                            parseNum(vals[col('LT days')]),
        on_order:                           parseNum(vals[col('On order')]),
        back_orders:                        parseNum(vals[col('Back orders')]),
        total_customer_orders:              parseNum(vals[col('Total customer orders')]),
        unsatisfied_customer_orders_units:  parseNum(vals[col('Unsatisfied customer orders units')]),
        unsatisfied_customer_orders_value:  parseNum(vals[col('Unsatisfied customer orders value')]),
        moq:                                parseNum(vals[col('MOQ')]) || 1,
        order_multiples:                    parseNum(vals[col('Order Multiples')]) || 1,
        selling_price:                      parseNum(vals[col('Selling price')]),
      })
    }

    // ── Bulk insert in batches of 500 ─────────────────────────────────────────
    const BATCH = 500
    let inserted = 0
    for (let i = 0; i < records.length; i += BATCH) {
      const batch = records.slice(i, i + BATCH)
      const { error: insErr } = await admin.from('inventory_records').insert(batch)
      if (insErr) {
        // Mark upload as failed and bail
        await admin.from('uploads').update({ status: 'failed', notes: insErr.message }).eq('id', uploadId)
        return json({ error: 'Insert failed: ' + insErr.message }, 500)
      }
      inserted += batch.length
    }

    // ── Mark upload complete ──────────────────────────────────────────────────
    await admin.from('uploads').update({ status: 'complete', row_count: inserted }).eq('id', uploadId)

    return json({ success: true, uploadId, rowCount: inserted }, 200)

  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal error'
    return json({ error: message }, 500)
  }
})

// ── Helpers ──────────────────────────────────────────────────────────────────

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

function parseNum(s: string | undefined): number {
  if (!s) return 0
  const n = parseFloat(s.replace(/,/g, ''))
  return isNaN(n) ? 0 : n
}

/** Basic CSV line parser that handles quoted fields */
function parseCSVLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++ }
      else inQuotes = !inQuotes
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim())
      current = ''
    } else {
      current += ch
    }
  }
  result.push(current.trim())
  return result
}
