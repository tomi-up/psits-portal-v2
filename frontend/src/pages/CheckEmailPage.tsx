import { Link } from 'react-router-dom'

export default function CheckEmailPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="card w-full max-w-sm text-center">
        <h1 className="mb-2 text-xl font-semibold text-slate-950">Check your email</h1>
        <p className="mb-6 text-sm text-slate-500">
          We sent you a confirmation link. Click it, then come back and sign in to finish
          activating your account.
        </p>
        <Link to="/login" className="btn-secondary w-full py-2">
          Back to sign in
        </Link>
      </div>
    </div>
  )
}
