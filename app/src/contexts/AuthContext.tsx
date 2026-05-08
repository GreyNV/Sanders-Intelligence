import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { User as SupabaseUser, Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { AppUser } from '@/types'

interface AuthContextType {
  session: Session | null
  supabaseUser: SupabaseUser | null
  profile: AppUser | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession]           = useState<Session | null>(null)
  const [supabaseUser, setSupabaseUser] = useState<SupabaseUser | null>(null)
  const [profile, setProfile]           = useState<AppUser | null>(null)
  const [loading, setLoading]           = useState(true)

  async function loadProfile(userId: string) {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .eq('is_active', true)
      .single()

    if (!error && data) {
      setProfile(data as AppUser)
    } else if (error?.code === 'PGRST116') {
      // PGRST116 = no rows returned — user is deactivated or removed.
      // Clear profile so RoleGuard/HomeRedirect can detect and sign them out.
      setProfile(null)
    }
    // Any other error (network, timeout, etc.): keep existing profile —
    // transient failures must not blank the page. Profile is only explicitly
    // cleared on SIGNED_OUT or confirmed deactivation (PGRST116).
  }

  async function refreshProfile() {
    if (supabaseUser) await loadProfile(supabaseUser.id)
  }

  useEffect(() => {
    // loading=true is ONLY used for the initial page load.
    // After the first auth event resolves, loading is set to false and never raised again.
    // Subsequent events (SIGNED_IN on login, TOKEN_REFRESHED on tab focus, etc.) update
    // state silently — RoleGuard and HomeRedirect handle the brief profile=null window
    // with a spinner rather than a navigation.
    //
    // This prevents the freeze: if any event fires on tab switch and loadProfile hangs,
    // the UI keeps showing the last known state instead of locking behind loading=true.

    let initialized = false

    // Safety valve — if auth doesn't resolve within 8 s (e.g. lock contention in a
    // weird browser state), unblock the UI so the user isn't stuck on a spinner forever.
    const safetyTimer = setTimeout(() => {
      if (!initialized) {
        initialized = true
        setLoading(false)
      }
    }, 8000)

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!initialized) {
          // ── First event (INITIAL_SESSION) ──────────────────────────────────
          // Gate the UI while we resolve the initial auth state.
          setSession(session)
          setSupabaseUser(session?.user ?? null)
          try {
            if (session?.user) {
              await loadProfile(session.user.id)
            } else {
              setProfile(null)
            }
          } finally {
            // Always unblock, even if loadProfile threw or timed out.
            initialized = true
            clearTimeout(safetyTimer)
            setLoading(false)
          }
          return
        }

        // ── All subsequent events ──────────────────────────────────────────
        // Update state silently — never set loading=true after initial load.
        setSession(session)
        setSupabaseUser(session?.user ?? null)

        if (session?.user) {
          await loadProfile(session.user.id)
        } else if (event === 'SIGNED_OUT') {
          // Explicit sign-out only — clear profile so RequireAuth redirects to login.
          setProfile(null)
        }
        // Any other no-session event: keep existing profile to avoid blank pages.
      }
    )

    return () => {
      subscription.unsubscribe()
      clearTimeout(safetyTimer)
    }
  }, [])

  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) return { error: error.message }
    return { error: null }
  }

  async function signOut() {
    try {
      await supabase.auth.signOut()
    } catch {
      // Ignore Supabase errors — clear local state unconditionally
      // so the user is never stuck on a page after clicking Sign Out.
    }
    setSession(null)
    setSupabaseUser(null)
    setProfile(null)
  }

  return (
    <AuthContext.Provider value={{ session, supabaseUser, profile, loading, signIn, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
