import { Link } from 'react-router-dom'
import { Compass } from 'lucide-react'

export default function NotFoundPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4 text-center font-sans">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-sky-50">
        <Compass className="h-7 w-7 text-sky-600" />
      </div>
      <h1 className="mt-5 text-2xl font-semibold text-slate-900">404 — Page not found</h1>
      <p className="mt-2 max-w-sm text-sm text-slate-500">
        The page you're looking for doesn't exist or may have been moved.
      </p>
      <Link
        to="/"
        className="mt-6 rounded-xl bg-sky-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-sky-700"
      >
        Go Home
      </Link>
    </div>
  )
}
