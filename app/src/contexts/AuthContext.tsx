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

    if (error || !data) {
      setProfile(null)
    } else {
      setProfile(data as AppUser)
    }
  }

  async function refreshProfile() {
    if (supabaseUser) await loadProfile(supabaseUser.id)
  }

  useEffect(() => {
    // Use onAuthStateChange as the single source of truth.
    // It fires immediately with INITIAL_SESSION on mount, then again on
    // SIGNED_IN / SIGNED_OUT / TOKEN_REFRESHED etc.
    // We keep loading=true until the first event fully resolves (including profile fetch).
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        // TOKEN_REFRESHED / USER_UPDATED fire silently in the background (e.g. on tab focus).
        // Do NOT set loading=true for these — it unmounts the AppShell and can break routing.
        if (event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
          setSession(session)
          setSupabaseUser(session?.user ?? null)
          if (session?.user) await loadProfile(session.user.id)
          return
        }

        // For INITIAL_SESSION, SIGNED_IN, SIGNED_OUT: gate routing behind loading=true
        // so RequireAuth / HomeRedirect never see a half-resolved auth state.
        setLoading(true)
        setSession(session)
        setSupabaseUser(session?.user ?? null)
        if (session?.user) {
          await loadProfile(session.user.id)
        } else {
          setProfile(null)
        }
        setLoading(false)
      }
    )

    return () => subscription.unsubscribe()
  }, [])

  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) return { error: error.message }
    return { error: null }
  }

  async function signOut() {
    await supabase.auth.signOut()
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
