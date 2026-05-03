/**
 * Sanders Intelligence — Invite User Edge Function
 *
 * POST /functions/v1/invite-user
 * Body: { email, name, role, department }
 * Authorization: Bearer <admin JWT>
 *
 * Creates a Supabase auth user (which triggers handle_new_user to create
 * the public.users row), then updates role/department/name.
 * The new user receives a magic-link invite email from Supabase.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Unauthorized' }, 401)

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const anonKey     = Deno.env.get('SUPABASE_ANON_KEY')!

    // Verify caller is admin
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user }, error: authError } = await userClient.auth.getUser()
    if (authError || !user) return json({ error: 'Unauthorized' }, 401)

    const admin = createClient(supabaseUrl, serviceKey)
    const { data: callerProfile } = await admin
      .from('users').select('role').eq('id', user.id).single()
    if (!callerProfile || callerProfile.role !== 'admin') {
      return json({ error: 'Admin only' }, 403)
    }

    const { email, name, role, department } = await req.json()
    if (!email || !name || !role) return json({ error: 'email, name and role are required' }, 400)

    // Invite the user (sends email with magic link)
    const { data: inviteData, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(email, {
      data: { name, role, department },
    })
    if (inviteErr) return json({ error: inviteErr.message }, 400)

    // Update the public.users row (trigger may have already created it)
    await admin.from('users')
      .update({ name, role, department })
      .eq('id', inviteData.user.id)

    return json({ success: true, userId: inviteData.user.id }, 200)

  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'Internal error' }, 500)
  }
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}
