import { Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
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

/** Listens for PASSWORD_RECOVERY auth events and redirects to the reset page */
function AuthRedirectHandler() {
  const navigate = useNavigate()
  useEffect(() => {
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

function RoleGuard({ allow, children }: { allow: string[]; children: React.ReactNode }) {
  const { profile } = useAuth()
  if (!profile) return null
  if (!allow.includes(profile.role)) return <Navigate to="/" replace />
  return <>{children}</>
}

/** Redirect to the right home page based on role */
function HomeRedirect() {
  const { profile, loading } = useAuth()
  if (loading) return <div className="flex h-screen items-center justify-center"><LoadingSpinner size="lg" /></div>
  if (!profile) return <Navigate to="/login" replace />
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
