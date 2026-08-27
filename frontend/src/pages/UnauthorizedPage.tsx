import { Link, useLocation } from 'react-router-dom'
import { ShieldAlert } from 'lucide-react'

export default function UnauthorizedPage() {
  const location = useLocation()
  const from = (location.state as { from?: string } | null)?.from

  const loginHref = from ? `/admin/login?redirect=${encodeURIComponent(from)}` : '/admin/login'

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4 text-center font-sans">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-50">
        <ShieldAlert className="h-7 w-7 text-amber-600" />
      </div>
      <h1 className="mt-5 text-2xl font-semibold text-slate-900">401 — Sign in required</h1>
      <p className="mt-2 max-w-sm text-sm text-slate-500">
        This page is only available to signed-in admins. If you're opening a shared scanner link,
        sign in with your admin account on this device first.
      </p>
      <Link
        to={loginHref}
        className="mt-6 rounded-xl bg-sky-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-sky-700"
      >
        Go to Admin Login
      </Link>
    </div>
  )
}
