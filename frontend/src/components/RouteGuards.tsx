import { Navigate, Outlet } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'

function LoadingScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50">
      <p className="text-sm text-slate-500">Loading...</p>
    </div>
  )
}

/** Requires a session AND a linked profile. Redirects to /login or /activate otherwise. */
export function RequireAuth() {
  const { isInitialized, session, profile } = useAuthStore()

  if (!isInitialized) return <LoadingScreen />
  if (!session) return <Navigate to="/login" replace />
  if (!profile) return <Navigate to="/activate" replace />

  return <Outlet />
}

/** Requires a session but NOT yet a profile (the activation step itself). */
export function RequireSessionNoProfile() {
  const { isInitialized, session, profile } = useAuthStore()

  if (!isInitialized) return <LoadingScreen />
  if (!session) return <Navigate to="/login" replace />
  if (profile) return <Navigate to="/" replace />

  return <Outlet />
}

/** Public-only pages (login/signup). Redirects fully authenticated users to the dashboard. */
export function RequireGuest() {
  const { isInitialized, session, profile } = useAuthStore()

  if (!isInitialized) return <LoadingScreen />
  if (session && profile) return <Navigate to="/" replace />

  return <Outlet />
}
