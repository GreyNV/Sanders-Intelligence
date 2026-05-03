import { createClient } from '@supabase/supabase-js'

const url  = import.meta.env.VITE_SUPABASE_URL  as string
const key  = import.meta.env.VITE_SUPABASE_ANON_KEY as string

if (!url || !key) {
  throw new Error(
    'Missing Supabase env vars. Copy .env.example → .env and fill in your project credentials.'
  )
}

export const supabase = createClient(url, key, {
  auth: {
    // Bypass the navigator.locks API — avoids NavigatorLockAcquireTimeoutError
    // when multiple auth operations race on startup. Safe for single-tab use.
    lock: async <R>(_name: string, _acquireTimeout: number, fn: () => Promise<R>): Promise<R> => fn(),
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
})
