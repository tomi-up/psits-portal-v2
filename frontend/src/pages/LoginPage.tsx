import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import AuthLayout from '@/components/AuthLayout'
import OtpInput from '@/components/OtpInput'
import { notify } from '@/lib/toast'
import { API } from '@/lib/apiBase'

export default function LoginPage() {
  const navigate = useNavigate()
  const [studentId, setStudentId] = useState('')
  const [code, setCode] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setIsSubmitting(true)

    try {
      const res = await fetch(`${API}/student-auth/student-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          student_id: studentId,
          authenticator_code: code,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        notify.error('Sign in failed', data.detail || 'Check your Student ID and code.')
        return
      }

      localStorage.setItem('access_token', data.access_token)
      localStorage.setItem('user', JSON.stringify(data.user))
      notify.success('Welcome back', `Signed in as ${data.user.name}`)
      navigate('/dashboard', { replace: true })
    } catch {
      notify.error('Network error', 'Could not reach the server. Is the backend running?')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <AuthLayout>
      <h1 className="text-2xl font-semibold text-slate-900">Sign in to PSITS Portal</h1>
      <p className="mt-1 text-sm text-slate-500">
        Enter your Student ID and authenticator code to continue.
      </p>

      <form onSubmit={handleSubmit} className="mt-8 space-y-4">
        <div>
          <label htmlFor="studentId" className="mb-1 block text-sm font-medium text-slate-700">
            Student ID
          </label>
          <input
            id="studentId"
            type="text"
            required
            autoComplete="username"
            placeholder="22-42998"
            value={studentId}
            onChange={(e) => setStudentId(e.target.value.toUpperCase())}
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 transition focus:border-sky-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-500/20"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Authenticator Code</label>
          <OtpInput value={code} onChange={setCode} />
        </div>

        <button
          type="submit"
          disabled={isSubmitting || !studentId || code.length !== 6}
          className="w-full rounded-xl bg-sky-600 py-2.5 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isSubmitting ? 'Signing in...' : 'Sign In'}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-slate-500">
        Not yet activated?{' '}
        <Link to="/activate-new" className="font-medium text-sky-600 hover:text-sky-700">
          Activate your account
        </Link>
      </p>
    </AuthLayout>
  )
}
