import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import AuthLayout from '@/components/AuthLayout'
import OtpInput from '@/components/OtpInput'
import { notify } from '@/lib/toast'
import { API } from '@/lib/apiBase'

type Step = 'verify' | 'confirm' | 'success' | 'already-activated'

export default function ActivationPage() {
  const navigate = useNavigate()
  const [step, setStep] = useState<Step>('verify')
  const [loading, setLoading] = useState(false)

  // Step 1: Verify
  const [studentId, setStudentId] = useState('')
  const [lastName, setLastName] = useState('')

  // Step 2: Enroll MFA
  const [qrCodeImage, setQrCodeImage] = useState('')
  const [manualKey, setManualKey] = useState('')
  const [setupToken, setSetupToken] = useState('')

  // Step 3: Confirm
  const [totpCode, setTotpCode] = useState('')

  useEffect(() => {
    if (step !== 'already-activated') return
    const timer = setTimeout(() => navigate('/login', { replace: true }), 2500)
    return () => clearTimeout(timer)
  }, [step, navigate])

  const handleVerify = async () => {
    setLoading(true)

    try {
      const verifyRes = await fetch(`${API}/student-auth/student-activate/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          student_id: studentId,
          last_name: lastName,
        }),
      })

      if (!verifyRes.ok) {
        const err = await verifyRes.json()
        if (verifyRes.status === 409) {
          notify.info('Already activated', 'Taking you to sign in...')
          setStep('already-activated')
          return
        }
        notify.error('Verification failed', err.detail || 'Check your Student ID and Last Name.')
        return
      }

      const verifyData = await verifyRes.json()

      // Immediately generate the QR code so the student can scan it right away
      const enrollRes = await fetch(`${API}/student-auth/student-activate/enroll-mfa`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          activation_token: verifyData.activation_token,
          student_id: studentId,
        }),
      })

      if (!enrollRes.ok) {
        const err = await enrollRes.json()
        notify.error('Could not generate QR code', err.detail)
        return
      }

      const enrollData = await enrollRes.json()
      setQrCodeImage(enrollData.qr_code_image)
      setManualKey(enrollData.manual_entry_key)
      setSetupToken(enrollData.setup_token)
      setStep('confirm')
    } catch {
      notify.error('Network error', 'Could not reach the server. Is the backend running?')
    } finally {
      setLoading(false)
    }
  }

  const handleConfirmMFA = async () => {
    if (totpCode.length !== 6) {
      notify.warning('Incomplete code', 'Enter all 6 digits from your authenticator.')
      return
    }

    setLoading(true)

    try {
      const res = await fetch(`${API}/student-auth/student-activate/confirm-mfa`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          setup_token: setupToken,
          totp_code: totpCode,
          student_id: studentId,
          last_name: lastName,
        }),
      })

      if (!res.ok) {
        const err = await res.json()
        notify.error('Confirmation failed', err.detail || 'That code did not work.')
        return
      }

      notify.success('Account activated', `Welcome, ${studentId}!`)
      setStep('success')
    } catch {
      notify.error('Network error', 'Could not reach the server. Is the backend running?')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthLayout forceLight tagline="Activate your student account to check in at PSITS events with a QR code.">
      {/* STEP 1: VERIFY IDENTITY */}
      {step === 'verify' && (
        <>
          <h1 className="text-2xl font-semibold text-slate-900">Activate your account</h1>
          <p className="mt-1 text-sm text-slate-500">
            Enter your Student ID and Last Name to get started.
          </p>

          <div className="mt-8 space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Student ID</label>
              <input
                type="text"
                value={studentId}
                onChange={(e) => setStudentId(e.target.value.toUpperCase())}
                placeholder="22-42998"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 transition focus:border-sky-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-500/20"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Last Name</label>
              <input
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Maylo"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 transition focus:border-sky-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-500/20"
              />
            </div>

            <button
              onClick={handleVerify}
              disabled={loading || !studentId || !lastName}
              className="w-full rounded-xl bg-sky-600 py-2.5 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? 'Verifying...' : 'Verify Identity'}
            </button>
          </div>

          <p className="mt-6 text-center text-sm text-slate-500">
            Already activated?{' '}
            <Link to="/login" className="font-medium text-sky-600 hover:text-sky-700">
              Sign in
            </Link>
          </p>
        </>
      )}

      {/* ALREADY ACTIVATED */}
      {step === 'already-activated' && (
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-2xl text-emerald-600">
            ✓
          </div>
          <h2 className="text-xl font-semibold text-slate-900">Already activated</h2>
          <p className="mt-2 text-sm text-slate-500">
            {studentId} is already active. Redirecting you to sign in...
          </p>
          <Link
            to="/login"
            className="mt-6 block w-full rounded-xl bg-sky-600 py-2.5 text-sm font-semibold text-white transition hover:bg-sky-700"
          >
            Go to Sign In Now
          </Link>
        </div>
      )}

      {/* STEP 2: CONFIRM MFA */}
      {step === 'confirm' && (
        <>
          <h1 className="text-2xl font-semibold text-slate-900">Set up your authenticator</h1>
          <p className="mt-1 text-sm text-slate-500">
            Scan the QR code with Google Authenticator (or any TOTP app), then enter the 6-digit
            code it shows.
          </p>

          <div className="mt-6 rounded-xl border border-slate-100 bg-slate-50 p-4 text-center">
            {qrCodeImage && (
              <img
                src={qrCodeImage}
                alt="Authenticator QR code"
                className="mx-auto rounded-lg border border-slate-200 bg-white p-2"
                width={200}
                height={200}
              />
            )}

            <div className="mt-4 border-t border-slate-200 pt-4 text-left">
              <p className="mb-2 text-xs font-medium text-slate-500">Can't scan? Enter manually:</p>
              <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-xs text-slate-700 break-all">
                {manualKey}
              </div>
            </div>
          </div>

          <div className="mt-4">
            <label className="mb-1 block text-sm font-medium text-slate-700">6-digit code</label>
            <OtpInput value={totpCode} onChange={setTotpCode} />
          </div>

          <button
            onClick={handleConfirmMFA}
            disabled={loading || totpCode.length !== 6}
            className="mt-4 w-full rounded-xl bg-sky-600 py-2.5 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? 'Verifying...' : 'Confirm & Activate'}
          </button>

          <button
            onClick={() => setStep('verify')}
            className="mt-2 w-full rounded-xl border border-slate-200 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
          >
            Back
          </button>
        </>
      )}

      {/* STEP 3: SUCCESS */}
      {step === 'success' && (
        <div>
          <div className="text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-2xl text-emerald-600">
              ✓
            </div>
            <h2 className="text-xl font-semibold text-slate-900">Account activated</h2>
            <p className="mt-1 text-sm text-slate-500">Welcome, {studentId}!</p>
          </div>

          <Link
            to="/login"
            className="mt-6 block w-full rounded-xl bg-sky-600 py-2.5 text-center text-sm font-semibold text-white transition hover:bg-sky-700"
          >
            Go to Sign In
          </Link>
        </div>
      )}
    </AuthLayout>
  )
}
