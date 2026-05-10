import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string
const REQUEST_TIMEOUT_MS = 15000

if (!url || !key) {
  throw new Error('Missing Supabase env vars. Copy .env.example to .env and fill in your project credentials.')
}

const hash = typeof window !== 'undefined' ? window.location.hash : ''
const search = typeof window !== 'undefined' ? window.location.search : ''
const hashParams = new URLSearchParams(hash.slice(1))
const queryParams = new URLSearchParams(search)

export const initialUrlAuthType: string | null =
  hashParams.get('type') ?? queryParams.get('type') ?? null

const timeoutFetch: typeof fetch = async (input, init) => {
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  init?.signal?.addEventListener('abort', () => controller.abort(), { once: true })

  try {
    return await fetch(input, { ...init, signal: controller.signal })
  } finally {
    window.clearTimeout(timer)
  }
}

export const supabase = createClient(url, key, {
  global: {
    fetch: timeoutFetch,
  },
  auth: {
    // Bypass navigator.locks to avoid auth initialization stalls when a tab holds the lock.
    lock: async <R>(_name: string, _acquireTimeout: number, fn: () => Promise<R>): Promise<R> => fn(),
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})
