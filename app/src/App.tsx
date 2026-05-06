import { Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { useEffect, useRef } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { supabase, initialUrlAuthType } from '@/lib/supabase'
import Login from '@/pages/Login'
import ResetPassword from '@/pages/ResetPassword'
import AppShell from '@/components/layout/AppShell'
import ActionCenter from '@/pages/purchasing/ActionCenter'
import InventoryBrowser from '@/pages/purchasing/InventoryBrowser'
import InboundPipeline from '@/pages/purchasing/InboundPipeline'
import ExecutiveSummary from '@/pages/csuite/ExecutiveSummary'
import DepartmentOverview from '@/pages/csuite/DepartmentOverview'
import TasksPage from '@/pages/tasks/TasksPage'
import UsersPage from '@/pages/admin/UsersPage'
import UploadsPage from '@/pages/admin/UploadsPage'
import LoadingSpinner from '@/components/ui/LoadingSpinner'

/**
 * Handles auth redirects for two flows:
 *
 * 1. New user invite (type=invite)
 *    Supabase processes and REMOVES the #access_token hash inside createClient(),
 *    which runs at module-import time — before any React component mounts.
 *    We capture the hash type in supabase.ts (initialUrlAuthType) before that
 *    happens, and use it here to redirect to the set-password page.
 *
 * 2. Password recovery (type=recovery)
 *    Supabase fires a PASSWORD_RECOVERY auth event, which we catch below.
 */
function AuthRedirectHandler() {
  const navigate = useNavigate()
  useEffect(() => {
    // Invite: use the pre-captured type (hash is already gone by now)
    if (initialUrlAuthType === 'invite') {
      navigate('/reset-password?mode=invite', { replace: true })
    }

    // Recovery: Supabase fires a dedicated auth event we can listen for
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        navigate('/reset-password', { replace: true })
      }
    })
    return () => subscription.unsubscribe()
  }, [navigate])
  return null
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth()
  if (loading) return <div className="flex h-screen items-center justify-center"><LoadingSpinner size="lg" /></div>
  if (!session) return <Navigate to="/login" replace />
  return <>{children}</>
}

/** Detects deactivated-user state (session exists, auth resolved, no profile) and signs out. */
function useDeactivatedSignOut() {
  const { profile, loading, session, signOut } = useAuth()
  const signingOut = useRef(false)
  useEffect(() => {
    if (!loading && session && !profile && !signingOut.current) {
      signingOut.current = true
      signOut()
    }
  }, [loading, session, profile, signOut])
}

function RoleGuard({ allow, children }: { allow: string[]; children: React.ReactNode }) {
  const { profile, loading } = useAuth()
  useDeactivatedSignOut()
  // Show spinner while profile is in-flight rather than returning null (blank page).
  // If loading=false + profile=null + session, useDeactivatedSignOut fires signOut().
  if (loading || !profile) return <div className="flex h-screen items-center justify-center"><LoadingSpinner size="lg" /></div>
  if (!allow.includes(profile.role)) return <Navigate to="/" replace />
  return <>{children}</>
}

/** Redirect to the right home page based on role */
function HomeRedirect() {
  const { profile, loading } = useAuth()
  useDeactivatedSignOut()
  // Keep showing spinner until profile is confirmed — prevents a premature
  // navigate-to-login when loading=false but profile hasn't arrived yet.
  if (loading || !profile) return <div className="flex h-screen items-center justify-center"><LoadingSpinner size="lg" /></div>
  if (profile.role === 'csuite') return <Navigate to="/executive" replace />
  if (profile.role === 'admin')  return <Navigate to="/purchasing/action-center" replace />
  return <Navigate to="/purchasing/action-center" replace />
}

export default function App() {
  const { session } = useAuth()

  return (
    <>
      <AuthRedirectHandler />
      <Routes>
        <Route path="/login" element={session ? <Navigate to="/" replace /> : <Login />} />
        <Route path="/reset-password" element={<ResetPassword />} />

        <Route element={<RequireAuth><AppShell /></RequireAuth>}>
          <Route index element={<HomeRedirect />} />

          {/* Purchasing */}
          <Route path="/purchasing/action-center" element={
            <RoleGuard allow={['admin', 'purchasing']}><ActionCenter /></RoleGuard>
          } />
          <Route path="/purchasing/inventory" element={
            <RoleGuard allow={['admin', 'purchasing']}><InventoryBrowser /></RoleGuard>
          } />
          <Route path="/purchasing/inbound" element={
            <RoleGuard allow={['admin', 'purchasing']}><InboundPipeline /></RoleGuard>
          } />

          {/* C-Suite */}
          <Route path="/executive" element={
            <RoleGuard allow={['admin', 'csuite']}><ExecutiveSummary /></RoleGuard>
          } />
          <Route path="/executive/departments" element={
            <RoleGuard allow={['admin', 'csuite']}><DepartmentOverview /></RoleGuard>
          } />

          {/* Tasks — accessible to all roles */}
          <Route path="/tasks" element={<TasksPage />} />

          {/* Admin */}
          <Route path="/admin/users" element={
            <RoleGuard allow={['admin']}><UsersPage /></RoleGuard>
          } />
          <Route path="/admin/uploads" element={
            <RoleGuard allow={['admin', 'purchasing']}><UploadsPage /></RoleGuard>
          } />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  )
}
