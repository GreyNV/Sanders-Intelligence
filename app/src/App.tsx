import { Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { lazy, Suspense, useEffect, useRef } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { supabase, initialUrlAuthType } from '@/lib/supabase'
import AppShell from '@/components/layout/AppShell'
import LoadingSpinner from '@/components/ui/LoadingSpinner'

const Login = lazy(() => import('@/pages/Login'))
const ResetPassword = lazy(() => import('@/pages/ResetPassword'))
const ActionCenter = lazy(() => import('@/pages/purchasing/ActionCenter'))
const InventoryBrowser = lazy(() => import('@/pages/purchasing/InventoryBrowser'))
const InboundPipeline = lazy(() => import('@/pages/purchasing/InboundPipeline'))
const VendorView = lazy(() => import('@/pages/purchasing/VendorView'))
const PurchaseOrders = lazy(() => import('@/pages/purchasing/PurchaseOrders'))
const NewsFeed = lazy(() => import('@/pages/purchasing/NewsFeed'))
const ExecutiveSummary = lazy(() => import('@/pages/csuite/ExecutiveSummary'))
const DepartmentOverview = lazy(() => import('@/pages/csuite/DepartmentOverview'))
const NorthStar = lazy(() => import('@/pages/csuite/NorthStar'))
const TasksPage = lazy(() => import('@/pages/tasks/TasksPage'))
const TodayView = lazy(() => import('@/pages/work/TodayView'))
const UsersPage = lazy(() => import('@/pages/admin/UsersPage'))
const UploadsPage = lazy(() => import('@/pages/admin/UploadsPage'))

function RouteLoader() {
  return <div className="flex h-screen items-center justify-center"><LoadingSpinner size="lg" /></div>
}

function AuthRedirectHandler() {
  const navigate = useNavigate()

  useEffect(() => {
    if (initialUrlAuthType === 'invite') {
      navigate('/reset-password?mode=invite', { replace: true })
    }

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

  if (loading) {
    return <div className="flex h-screen items-center justify-center"><LoadingSpinner size="lg" /></div>
  }
  if (!session) return <Navigate to="/login" replace />
  return <>{children}</>
}

function useDeactivatedSignOut() {
  const { profile, profileStatus, loading, session, signOut } = useAuth()
  const signingOut = useRef(false)

  useEffect(() => {
    if (!loading && session && !profile && profileStatus === 'missing' && !signingOut.current) {
      signingOut.current = true
      signOut()
    }
  }, [loading, session, profile, profileStatus, signOut])
}

function ProfileGateFallback() {
  const { profileStatus, profileError, refreshProfile, signOut } = useAuth()

  if (profileStatus === 'error') {
    return (
      <div className="flex h-screen items-center justify-center bg-bg px-4">
        <div className="card max-w-md text-center py-10">
          <div className="text-text1 font-semibold mb-2">Could not load your profile</div>
          <div className="text-text2 text-sm mb-5">
            {profileError ?? 'Please try again, or sign out and back in.'}
          </div>
          <div className="flex justify-center gap-3">
            <button className="btn-secondary" onClick={refreshProfile}>Retry</button>
            <button className="btn-primary" onClick={signOut}>Sign out</button>
          </div>
        </div>
      </div>
    )
  }

  return <div className="flex h-screen items-center justify-center"><LoadingSpinner size="lg" /></div>
}

function RoleGuard({ allow, children }: { allow: string[]; children: React.ReactNode }) {
  const { profile, loading } = useAuth()
  useDeactivatedSignOut()

  if (loading || !profile) return <ProfileGateFallback />
  if (!allow.includes(profile.role)) return <Navigate to="/" replace />
  return <>{children}</>
}

function HomeRedirect() {
  const { profile, loading } = useAuth()
  useDeactivatedSignOut()

  if (loading || !profile) return <ProfileGateFallback />
  if (profile.role === 'csuite') return <Navigate to="/executive" replace />
  if (profile.role === 'admin') return <Navigate to="/purchasing/action-center" replace />
  return <Navigate to="/purchasing/action-center" replace />
}

export default function App() {
  const { session } = useAuth()

  return (
    <Suspense fallback={<RouteLoader />}>
      <AuthRedirectHandler />
      <Routes>
        <Route path="/login" element={session ? <Navigate to="/" replace /> : <Login />} />
        <Route path="/reset-password" element={<ResetPassword />} />

        <Route element={<RequireAuth><AppShell /></RequireAuth>}>
          <Route index element={<HomeRedirect />} />

          <Route path="/purchasing/action-center" element={
            <RoleGuard allow={['admin', 'purchasing']}><ActionCenter /></RoleGuard>
          } />
          <Route path="/purchasing/inventory" element={
            <RoleGuard allow={['admin', 'purchasing']}><InventoryBrowser /></RoleGuard>
          } />
          <Route path="/purchasing/inbound" element={
            <RoleGuard allow={['admin', 'purchasing']}><InboundPipeline /></RoleGuard>
          } />
          <Route path="/purchasing/vendors" element={
            <RoleGuard allow={['admin', 'purchasing']}><VendorView /></RoleGuard>
          } />
          <Route path="/purchasing/purchase-orders" element={
            <RoleGuard allow={['admin', 'purchasing']}><PurchaseOrders /></RoleGuard>
          } />
          <Route path="/purchasing/news-feed" element={
            <RoleGuard allow={['admin', 'purchasing']}><NewsFeed /></RoleGuard>
          } />

          <Route path="/executive" element={
            <RoleGuard allow={['admin', 'csuite']}><ExecutiveSummary /></RoleGuard>
          } />
          <Route path="/executive/departments" element={
            <RoleGuard allow={['admin', 'csuite']}><DepartmentOverview /></RoleGuard>
          } />
          <Route path="/executive/north-star" element={
            <RoleGuard allow={['admin', 'csuite']}><NorthStar /></RoleGuard>
          } />

          <Route path="/tasks" element={
            <RoleGuard allow={['admin', 'purchasing', 'csuite']}><TasksPage /></RoleGuard>
          } />
          <Route path="/today" element={
            <RoleGuard allow={['admin', 'purchasing', 'csuite']}><TodayView /></RoleGuard>
          } />
          <Route path="/daily" element={<Navigate to="/today" replace />} />

          <Route path="/admin/users" element={
            <RoleGuard allow={['admin']}><UsersPage /></RoleGuard>
          } />
          <Route path="/admin/uploads" element={
            <RoleGuard allow={['admin', 'purchasing']}><UploadsPage /></RoleGuard>
          } />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  )
}
