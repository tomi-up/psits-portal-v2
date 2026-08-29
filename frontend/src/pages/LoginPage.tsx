import { useCallback, useState, type FormEvent } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import AuthLayout from '@/components/AuthLayout'
import GoogleSignInButton from '@/components/GoogleSignInButton'
import TurnstileWidget from '@/components/TurnstileWidget'
import { notify } from '@/lib/toast'
import { API } from '@/lib/apiBase'

export default function LoginPage() {
  const navigate = useNavigate()

  const [googleIdToken, setGoogleIdToken] = useState<string | null>(null)
  const [needsStudentIdFor, setNeedsStudentIdFor] = useState<string | null>(null) // holds the Google email once binding is needed
  const [bindingStudentId, setBindingStudentId] = useState('')
  const [isGoogleSubmitting, setIsGoogleSubmitting] = useState(false)

  const [turnstileToken, setTurnstileToken] = useState<string | null>(null)
  const [turnstileKey, setTurnstileKey] = useState(0) // bump to force a fresh widget/token after each attempt
  const [bindError, setBindError] = useState<string | null>(null)
  const [loginError, setLoginError] = useState<string | null>(null)

  const [agreedToTerms, setAgreedToTerms] = useState(false)
  const [showTerms, setShowTerms] = useState(false)

  const submitGoogleLogin = useCallback(async (idToken: string, boundStudentId?: string) => {
    if (!turnstileToken) {
      const message = 'Please complete the human verification check first.'
      if (boundStudentId) setBindError(message)
      else setLoginError(message)
      return
    }

    setIsGoogleSubmitting(true)
    if (boundStudentId) setBindError(null)
    else setLoginError(null)

    try {
      const res = await fetch(`${API}/student-auth/google-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id_token: idToken,
          student_id: boundStudentId || null,
          turnstile_token: turnstileToken,
        }),
      })
      const data = await res.json()

      if (!res.ok) {
        if (boundStudentId) {
          // Failure is specific to the ID they just typed - keep them on the
          // bind form so they can correct it, instead of bouncing them all
          // the way back to the initial Google button.
          setBindError(data.detail || 'Could not link this account. Please try again.')
        } else {
          setLoginError(data.detail || 'Please try again.')
          setGoogleIdToken(null)
          setNeedsStudentIdFor(null)
        }
        return
      }

      if (data.status === 'NEEDS_STUDENT_ID') {
        setGoogleIdToken(idToken)
        setNeedsStudentIdFor(data.email)
        return
      }

      setBindError(null)
      setLoginError(null)
      localStorage.setItem('access_token', data.access_token)
      localStorage.setItem('user', JSON.stringify(data.user))
      notify.success('Welcome back', `Signed in as ${data.user.name}`)
      navigate('/dashboard', { replace: true })
    } catch {
      const message = 'Could not reach the server. Please check your connection and try again.'
      if (boundStudentId) setBindError(message)
      else setLoginError(message)
    } finally {
      setIsGoogleSubmitting(false)
      // Turnstile tokens are single-use - force a fresh check for the next attempt.
      setTurnstileToken(null)
      setTurnstileKey((k) => k + 1)
    }
  }, [navigate, turnstileToken])

  function handleBindStudentId(e: FormEvent) {
    e.preventDefault()
    if (!googleIdToken) return
    void submitGoogleLogin(googleIdToken, bindingStudentId)
  }

  if (needsStudentIdFor) {
    return (
      <AuthLayout>
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">Link your Google account</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          First time signing in with{' '}
          <span className="font-medium text-slate-700 dark:text-slate-300">{needsStudentIdFor}</span>. Enter your
          Student ID once to link it to your account.
        </p>

        {bindError && (
          <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-400">
            {bindError}
          </div>
        )}

        <form onSubmit={handleBindStudentId} className="mt-6 space-y-4">
          <div>
            <label htmlFor="bindStudentId" className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
              Student ID
            </label>
            <input
              id="bindStudentId"
              type="text"
              required
              autoComplete="username"
              placeholder="22-42998"
              value={bindingStudentId}
              onChange={(e) => {
                setBindingStudentId(e.target.value.toUpperCase())
                setBindError(null)
              }}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 transition focus:border-sky-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:bg-slate-800"
            />
          </div>

          <TurnstileWidget key={turnstileKey} onToken={setTurnstileToken} />

          <button
            type="submit"
            disabled={isGoogleSubmitting || !bindingStudentId || !turnstileToken}
            className="w-full rounded-xl bg-sky-600 py-2.5 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isGoogleSubmitting ? 'Linking...' : 'Link account'}
          </button>

          <button
            type="button"
            onClick={() => {
              setNeedsStudentIdFor(null)
              setGoogleIdToken(null)
              setBindingStudentId('')
              setBindError(null)
            }}
            className="w-full text-center text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
          >
            Cancel
          </button>
        </form>
      </AuthLayout>
    )
  }

  const canSignIn = Boolean(turnstileToken) && agreedToTerms

  return (
    <AuthLayout>
      <Link
        to="/"
        className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 transition hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Home
      </Link>

      <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">Sign in to PSITS Portal</h1>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Continue with your Google account to sign in.</p>

      {loginError && (
        <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-400">
          {loginError}
        </div>
      )}

      <div className={`mt-6 transition ${canSignIn ? '' : 'pointer-events-none opacity-40'}`}>
        <GoogleSignInButton onCredential={submitGoogleLogin} />
      </div>

      <div className="mt-4">
        <TurnstileWidget key={turnstileKey} onToken={setTurnstileToken} />
      </div>

      <label className="mt-4 flex items-start gap-2.5 text-sm text-slate-600 dark:text-slate-400">
        <input
          type="checkbox"
          checked={agreedToTerms}
          onChange={(e) => setAgreedToTerms(e.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-sky-600 focus:ring-sky-500 dark:border-slate-600 dark:bg-slate-800"
        />
        <span>
          I agree to the{' '}
          <button
            type="button"
            onClick={() => setShowTerms(true)}
            className="font-medium text-sky-600 underline-offset-2 hover:underline dark:text-sky-400"
          >
            Terms & Agreement
          </button>
        </span>
      </label>

      {!canSignIn && agreedToTerms && (
        <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">
          Complete the verification check above to continue.
        </p>
      )}

      {showTerms && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
          onClick={() => setShowTerms(false)}
        >
          <div
            className="max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl dark:bg-slate-900"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Terms & Agreement</h2>
            <div className="mt-4 space-y-3 text-sm leading-6 text-slate-600 dark:text-slate-400">
              <p>
                By signing in to the PSITS-USM Portal, you agree to the following:
              </p>
              <p>
                <span className="font-medium text-slate-800 dark:text-slate-200">Information we collect.</span> Your
                Student ID, name, and the email/profile photo from your Google account, used only to verify your
                identity and link your portal account.
              </p>
              <p>
                <span className="font-medium text-slate-800 dark:text-slate-200">How it's used.</span> Attendance
                records (event check-in/check-out times), membership fee balances and payment reference numbers you
                submit, and excuse/sanction requests you file - all used solely for PSITS-USM's own membership and
                attendance record-keeping.
              </p>
              <p>
                <span className="font-medium text-slate-800 dark:text-slate-200">Who can see it.</span> Only PSITS-USM
                officers/admins reviewing membership records. Your data is never sold or shared with outside parties.
              </p>
              <p>
                <span className="font-medium text-slate-800 dark:text-slate-200">Your responsibility.</span> Keep your
                Google account secure - anyone signed into it can act as you on this portal (submit payments, excuse
                requests, etc.). Report any suspicious activity to a PSITS-USM officer immediately.
              </p>
              <p>
                <span className="font-medium text-slate-800 dark:text-slate-200">Account activity.</span> Sign-ins and
                key actions (registrations, payment submissions, sanction settlements) are logged for audit purposes.
              </p>
            </div>
            <button
              onClick={() => setShowTerms(false)}
              className="mt-6 w-full rounded-lg bg-sky-600 py-2 text-sm font-semibold text-white transition hover:bg-sky-700"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </AuthLayout>
  )
}
