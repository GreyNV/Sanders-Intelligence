import { createClient } from '@supabase/supabase-js'

const url  = import.meta.env.VITE_SUPABASE_URL  as string
const key  = import.meta.env.VITE_SUPABASE_ANON_KEY as string

if (!url || !key) {
  throw new Error(
    'Missing Supabase env vars. Copy .env.example → .env and fill in your project credentials.'
  )
}

// ─── Capture the URL auth type BEFORE createClient() clears the hash ──────────
// Supabase processes and removes the #access_token hash during initialisation,
// which happens synchronously inside createClient().  By the time any React
// component mounts, the hash is gone.  We read it here — at module-import time —
// so AuthRedirectHandler can still detect invite / recovery flows.
//
// Supports both hash-fragment format  (#access_token=…&type=invite)
// and query-param format              (?type=invite&code=…)  used by PKCE flow.
const _hash   = typeof window !== 'undefined' ? window.location.hash  : ''
const _search = typeof window !== 'undefined' ? window.location.search : ''
const _hp = new URLSearchParams(_hash.slice(1))
const _qp = new URLSearchParams(_search)
export const initialUrlAuthType: string | null =
  _hp.get('type') ?? _qp.get('type') ?? null
// ──────────────────────────────────────────────────────────────────────────────

export const supabase = createClient(url, key, {
  auth: {
    // Bypass navigator.locks — prevents NavigatorLockAcquireTimeoutError that
    // blocks auth initialisation when the lock is held by another operation.
    lock: async <R>(_name: string, _acquireTimeout: number, fn: () => Promise<R>): Promise<R> => fn(),
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})
