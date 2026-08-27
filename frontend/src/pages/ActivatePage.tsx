import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { isAxiosError } from 'axios'
import { api, type ApiErrorBody } from '@/lib/api'
import { useAuthStore } from '@/stores/authStore'

export default function ActivatePage() {
  const navigate = useNavigate()
  const refreshProfile = useAuthStore((s) => s.refreshProfile)
  const signOut = useAuthStore((s) => s.signOut)

  const [studentId, setStudentId] = useState('')
  const [lastName, setLastName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setIsSubmitting(true)

    try {
      await api.post('/auth/activate', { student_id: studentId, last_name: lastName })
      await refreshProfile()
      navigate('/', { replace: true })
    } catch (err) {
      if (isAxiosError<ApiErrorBody>(err) && err.response?.data?.message) {
        setError(err.response.data.message)
      } else {
        setError('Activation failed. Please try again.')
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="card w-full max-w-sm">
        <h1 className="mb-1 text-xl font-semibold text-slate-950">Activate your account</h1>
        <p className="mb-6 text-sm text-slate-500">
          Enter your student ID and last name exactly as they appear on the roster.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="studentId" className="mb-1 block text-sm font-medium text-slate-700">
              Student ID
            </label>
            <input
              id="studentId"
              type="text"
              required
              placeholder="22-12345"
              pattern="\d{2}-\d{5}"
              title="Format: 22-12345"
              value={studentId}
              onChange={(e) => setStudentId(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
            />
          </div>

          <div>
            <label htmlFor="lastName" className="mb-1 block text-sm font-medium text-slate-700">
              Last name
            </label>
            <input
              id="lastName"
              type="text"
              required
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button type="submit" disabled={isSubmitting} className="btn-primary w-full py-2 disabled:opacity-60">
            {isSubmitting ? 'Activating...' : 'Activate account'}
          </button>
        </form>

        <button
          onClick={() => void signOut()}
          className="mt-6 w-full text-center text-sm text-slate-500 hover:text-slate-700"
        >
          Sign out and use a different account
        </button>
      </div>
    </div>
  )
}
