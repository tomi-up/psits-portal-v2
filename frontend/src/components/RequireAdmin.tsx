import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { getAdminToken } from '@/lib/adminAuth'

/** Gate for /admin/* and /scanner/* routes. The token's validity is enforced
 * server-side on every request (adminFetch redirects to /admin/login on a
 * 401); this guard covers the case where there's obviously no session yet -
 * e.g. opening a shared scanner link on a device nobody has logged into. */
export default function RequireAdmin() {
  const location = useLocation()
  const token = getAdminToken()

  if (!token) {
    return <Navigate to="/401" state={{ from: location.pathname }} replace />
  }

  return <Outlet />
}
