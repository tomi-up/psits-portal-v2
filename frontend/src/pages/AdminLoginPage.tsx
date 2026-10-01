import { useState, type FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import AuthLayout from '@/components/AuthLayout'
import OtpInput from '@/components/OtpInput'
import { notify } from '@/lib/toast'
import { setAdminSession } from '@/lib/adminAuth'
import { API } from '@/lib/apiBase'

export default function AdminLoginPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const rawRedirect = searchParams.get('redirect')
  // Only ever redirect to a same-app relative path - reject absolute/protocol-relative
  // URLs so a crafted ?redirect= can't send an admin off-site after login.
  const redirectTo = rawRedirect && rawRedirect.startsWith('/') && !rawRedirect.startsWith('//')
    ? rawRedirect
    : '/admin/events'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const [pendingToken, setPendingToken] = useState<string | null>(null)
  const [totpCode, setTotpCode] = useState('')
  const [verifying, setVerifying] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setIsSubmitting(true)

    try {
      const res = await fetch(`${API}/admin/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })

      const data = await res.json()

      if (!res.ok) {
        if (res.status === 429) {
          notify.error('Too many attempts', 'Please wait a bit before trying again.')
        } else {
          notify.error('Sign in failed', data.message || 'Check your email and password.')
        }
        return
      }

      if (data.status === 'MFA_REQUIRED') {
        setPendingToken(data.pending_token)
        return
      }

      setAdminSession(data.access_token, data.admin)
      notify.success('Welcome back', data.admin.display_name)
      navigate(redirectTo, { replace: true })
    } catch {
      notify.error('Network error', 'Could not reach the server. Is the backend running?')
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleVerifyCode(e: FormEvent) {
    e.preventDefault()
    if (totpCode.length !== 6 || !pendingToken) return
    setVerifying(true)

    try {
      const res = await fetch(`${API}/admin/auth/login/verify-mfa`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pending_token: pendingToken, totp_code: totpCode }),
      })
      const data = await res.json()

      if (!res.ok) {
        if (res.status === 429) {
          notify.error('Too many attempts', 'Please wait a bit before trying again.')
        } else {
          notify.error('Incorrect code', data.message || 'Check your authenticator app and try again.')
        }
        setTotpCode('')
        return
      }

      setAdminSession(data.access_token, data.admin)
      notify.success('Welcome back', data.admin.display_name)
      navigate(redirectTo, { replace: true })
    } catch {
      notify.error('Network error', 'Could not reach the server.')
    } finally {
      setVerifying(false)
    }
  }

  if (pendingToken) {
    return (
      <AuthLayout>
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">Enter your code</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Open your authenticator app and enter the 6-digit code for this account.
        </p>

        <form onSubmit={handleVerifyCode} className="mt-8 space-y-4">
          <OtpInput value={totpCode} onChange={setTotpCode} autoFocus />

          <button
            type="submit"
            disabled={verifying || totpCode.length !== 6}
            className="w-full rounded-xl bg-sky-600 py-2.5 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {verifying ? 'Verifying...' : 'Verify'}
          </button>

          <button
            type="button"
            onClick={() => {
              setPendingToken(null)
              setTotpCode('')
            }}
            className="w-full text-center text-sm font-medium text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
          >
            Back to sign in
          </button>
        </form>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout>
      <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">Admin Sign In</h1>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
        Sign in with your officer/admin email and password.
      </p>

      <form onSubmit={handleSubmit} className="mt-8 space-y-4">
        <div>
          <label htmlFor="email" className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
            Email
          </label>
          <input
            id="email"
            type="email"
            required
            autoComplete="username"
            placeholder="usm.psits@admin.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 transition focus:border-sky-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:bg-slate-800"
          />
        </div>

        <div>
          <label htmlFor="password" className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
            Password
          </label>
          <input
            id="password"
            type="password"
            required
            autoComplete="current-password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 transition focus:border-sky-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:bg-slate-800"
          />
        </div>

        <button
          type="submit"
          disabled={isSubmitting || !email || !password}
          className="w-full rounded-xl bg-sky-600 py-2.5 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isSubmitting ? 'Signing in...' : 'Sign In'}
        </button>
      </form>
    </AuthLayout>
  )
}
