import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { User as SupabaseUser, Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { AppUser } from '@/types'

type ProfileStatus = 'idle' | 'loading' | 'ready' | 'missing' | 'error'

interface AuthContextType {
  session: Session | null
  supabaseUser: SupabaseUser | null
  profile: AppUser | null
  profileStatus: ProfileStatus
  profileError: string | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | null>(null)

function withTimeout<T>(promise: PromiseLike<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      window.setTimeout(() => reject(new Error(`${label} timed out. Check your connection and try again.`)), ms)
    }),
  ])
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [supabaseUser, setSupabaseUser] = useState<SupabaseUser | null>(null)
  const [profile, setProfile] = useState<AppUser | null>(null)
  const [profileStatus, setProfileStatus] = useState<ProfileStatus>('idle')
  const [profileError, setProfileError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  async function loadProfile(userId: string) {
    setProfileStatus(current => current === 'ready' ? current : 'loading')
    setProfileError(null)

    try {
      const { data, error } = await withTimeout(
        supabase
          .from('users')
          .select('*')
          .eq('id', userId)
          .eq('is_active', true)
          .single(),
        8000,
        'Profile load'
      )

      if (!error && data) {
        setProfile(data as AppUser)
        setProfileStatus('ready')
        return
      }

      if (error?.code === 'PGRST116') {
        setProfile(null)
        setProfileStatus('missing')
        return
      }

      throw error ?? new Error('Profile was not returned.')
    } catch (err) {
      setProfile(current => {
        if (current) {
          setProfileStatus('ready')
          return current
        }
        setProfileStatus('error')
        return null
      })
      setProfileError(err instanceof Error ? err.message : 'Failed to load profile.')
    }
  }

  async function refreshProfile() {
    if (supabaseUser) await loadProfile(supabaseUser.id)
  }

  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) return { error: error.message }
    return { error: null }
  }

  async function signOut() {
    setSession(null)
    setSupabaseUser(null)
    setProfile(null)
    setProfileStatus('idle')
    setProfileError(null)

    try {
      await withTimeout(supabase.auth.signOut(), 3000, 'Sign out')
    } catch {
      // Local auth state is already cleared, so logout never leaves the UI stuck.
    }
  }

  useEffect(() => {
    let initialized = false

    const safetyTimer = window.setTimeout(() => {
      if (!initialized) {
        initialized = true
        setLoading(false)
      }
    }, 8000)

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, nextSession) => {
        if (!initialized) {
          setSession(nextSession)
          setSupabaseUser(nextSession?.user ?? null)

          try {
            if (nextSession?.user) {
              await loadProfile(nextSession.user.id)
            } else {
              setProfile(null)
              setProfileStatus('idle')
              setProfileError(null)
            }
          } finally {
            initialized = true
            window.clearTimeout(safetyTimer)
            setLoading(false)
          }
          return
        }

        setSession(nextSession)
        setSupabaseUser(nextSession?.user ?? null)

        if (nextSession?.user) {
          await loadProfile(nextSession.user.id)
        } else if (event === 'SIGNED_OUT') {
          setProfile(null)
          setProfileStatus('idle')
          setProfileError(null)
        }
      }
    )

    return () => {
      subscription.unsubscribe()
      window.clearTimeout(safetyTimer)
    }
  }, [])

  return (
    <AuthContext.Provider value={{
      session,
      supabaseUser,
      profile,
      profileStatus,
      profileError,
      loading,
      signIn,
      signOut,
      refreshProfile,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
