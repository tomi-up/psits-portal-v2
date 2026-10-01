import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ShieldCheck, ShieldOff, KeyRound } from 'lucide-react'
import Sidebar, { MobileMenuButton } from '@/components/Sidebar'
import AdminProfileMenu from '@/components/AdminProfileMenu'
import OtpInput from '@/components/OtpInput'
import { getAdminSidebarItems } from '@/lib/adminNav'
import { notify } from '@/lib/toast'
import { adminFetch, getAdminToken, setAdminSession, type AdminSummary } from '@/lib/adminAuth'
import { API } from '@/lib/apiBase'

export default function AdminSettingsPage() {
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)
  const [admin, setAdmin] = useState<AdminSummary | null>(null)
  const [loading, setLoading] = useState(true)

  // Enrollment
  const [enrolling, setEnrolling] = useState(false)
  const [qrImage, setQrImage] = useState<string | null>(null)
  const [manualKey, setManualKey] = useState('')
  const [setupToken, setSetupToken] = useState('')
  const [confirmCode, setConfirmCode] = useState('')
  const [confirming, setConfirming] = useState(false)

  // Reset
  const [resetOpen, setResetOpen] = useState(false)
  const [resetPassword, setResetPassword] = useState('')
  const [resetting, setResetting] = useState(false)

  // Change password
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [changingPassword, setChangingPassword] = useState(false)

  useEffect(() => {
    void loadStatus()
  }, [])

  async function loadStatus() {
    setLoading(true)
    try {
      const res = await adminFetch(`${API}/admin/auth/me`)
      if (res.ok) {
        const data = await res.json()
        setAdmin(data)
        const token = getAdminToken()
        if (token) setAdminSession(token, data)
      }
    } catch {
      notify.error('Network error', 'Could not load your account status.')
    } finally {
      setLoading(false)
    }
  }

  async function startEnrollment() {
    setEnrolling(true)
    setConfirmCode('')
    try {
      const res = await adminFetch(`${API}/admin/auth/mfa/enroll`, { method: 'POST' })
      if (!res.ok) {
        notify.error('Could not start setup', 'Please try again.')
        setEnrolling(false)
        return
      }
      const data = await res.json()
      setQrImage(data.qr_code_image)
      setManualKey(data.manual_entry_key)
      setSetupToken(data.setup_token)
    } catch {
      notify.error('Network error', 'Could not reach the server.')
      setEnrolling(false)
    }
  }

  function cancelEnrollment() {
    setEnrolling(false)
    setQrImage(null)
    setManualKey('')
    setSetupToken('')
    setConfirmCode('')
  }

  async function confirmEnrollment() {
    if (confirmCode.length !== 6) return
    setConfirming(true)
    try {
      const res = await adminFetch(`${API}/admin/auth/mfa/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ setup_token: setupToken, totp_code: confirmCode }),
      })
      const data = await res.json()
      if (!res.ok) {
        notify.error('Incorrect code', data.detail || 'Check your authenticator app and try again.')
        setConfirmCode('')
        return
      }
      notify.success('2FA enabled', 'You will need a code from your authenticator app to sign in from now on.')
      cancelEnrollment()
      await loadStatus()
    } catch {
      notify.error('Network error', 'Could not reach the server.')
    } finally {
      setConfirming(false)
    }
  }

  async function handleReset() {
    if (!resetPassword) return
    setResetting(true)
    try {
      const res = await adminFetch(`${API}/admin/auth/mfa/reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: resetPassword }),
      })
      const data = await res.json()
      if (!res.ok) {
        notify.error('Could not turn off 2FA', data.detail || 'Incorrect password.')
        return
      }
      notify.success('2FA turned off', 'This account no longer requires a code to sign in.')
      setResetOpen(false)
      setResetPassword('')
      await loadStatus()
    } catch {
      notify.error('Network error', 'Could not reach the server.')
    } finally {
      setResetting(false)
    }
  }

  async function handleChangePassword() {
    if (newPassword.length < 8) {
      notify.error('Password too short', 'New password must be at least 8 characters.')
      return
    }
    if (newPassword !== confirmPassword) {
      notify.error("Passwords don't match", 'Re-enter the new password to confirm.')
      return
    }

    setChangingPassword(true)
    try {
      const res = await adminFetch(`${API}/admin/auth/change-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
      })
      const data = await res.json()
      if (!res.ok) {
        notify.error('Could not change password', data.detail || 'Please try again.')
        return
      }
      notify.success('Password changed', 'Use your new password next time you sign in.')
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } catch {
      notify.error('Network error', 'Could not reach the server.')
    } finally {
      setChangingPassword(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 font-sans">
      <Sidebar
        title="PSITS Admin"
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        items={getAdminSidebarItems('settings', navigate, () => navigate('/admin/events'))}
      />

      <div className="lg:pl-64">
        <header className="flex items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-6 py-4 lg:px-10">
          <div className="flex items-center gap-3">
            <MobileMenuButton onClick={() => setMenuOpen(true)} />
            <div>
              <h1 className="text-lg font-semibold text-slate-900 dark:text-white">Settings</h1>
              <p className="text-sm text-slate-500 dark:text-slate-400">Manage your admin account</p>
            </div>
          </div>
          <AdminProfileMenu />
        </header>

        <main className="px-6 py-8 lg:px-10">
          <div className="mx-auto max-w-xl space-y-6">
            <div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Two-Factor Authentication</h2>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                Require a code from an authenticator app in addition to your password.
              </p>
            </div>

            {loading ? (
              <div className="h-24 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />
            ) : (
              <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5">
                <div className="flex items-center gap-3">
                  {admin?.mfa_enabled ? (
                    <ShieldCheck className="h-8 w-8 text-emerald-600 dark:text-emerald-400" />
                  ) : (
                    <ShieldOff className="h-8 w-8 text-slate-400" />
                  )}
                  <div>
                    <p className="text-sm font-semibold text-slate-900 dark:text-white">
                      Two-factor authentication is {admin?.mfa_enabled ? 'ON' : 'OFF'}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {admin?.mfa_enabled
                        ? "You'll be asked for a code from your authenticator app every time you sign in."
                        : 'Add an extra step to login using an authenticator app (Google Authenticator, Authy, etc).'}
                    </p>
                  </div>
                </div>

                {!admin?.mfa_enabled && !enrolling && (
                  <button
                    onClick={startEnrollment}
                    className="mt-4 flex items-center gap-1.5 rounded-lg bg-sky-600 px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-sky-700"
                  >
                    <KeyRound className="h-4 w-4" />
                    Set Up 2FA
                  </button>
                )}

                {admin?.mfa_enabled && (
                  <button
                    onClick={() => setResetOpen(true)}
                    className="mt-4 rounded-lg border border-rose-200 dark:border-rose-900 bg-white dark:bg-slate-900 px-3.5 py-2 text-sm font-semibold text-rose-600 dark:text-rose-400 transition hover:bg-rose-50 dark:hover:bg-rose-950/30"
                  >
                    Turn Off 2FA
                  </button>
                )}
              </div>
            )}

            {enrolling && qrImage && (
              <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5">
                <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Scan this QR code</h2>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Open your authenticator app and scan this code, or enter the key manually.
                </p>

                <div className="mt-4 flex justify-center">
                  <img src={qrImage} alt="2FA QR code" className="h-48 w-48 rounded-lg border border-slate-200 dark:border-slate-700" />
                </div>

                <div className="mt-3 rounded-lg bg-slate-50 dark:bg-slate-800 px-3 py-2 text-center">
                  <p className="text-[10px] uppercase tracking-wide text-slate-400 dark:text-slate-500">Manual entry key</p>
                  <p className="mt-0.5 font-mono text-sm text-slate-700 dark:text-slate-300 break-all">{manualKey}</p>
                </div>

                <div className="mt-5">
                  <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
                    Enter the 6-digit code to confirm
                  </label>
                  <OtpInput value={confirmCode} onChange={setConfirmCode} />
                </div>

                <div className="mt-4 flex gap-2">
                  <button
                    onClick={confirmEnrollment}
                    disabled={confirming || confirmCode.length !== 6}
                    className="flex-1 rounded-lg bg-sky-600 py-2 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:opacity-50"
                  >
                    {confirming ? 'Confirming...' : 'Confirm & Enable'}
                  </button>
                  <button
                    onClick={cancelEnrollment}
                    className="rounded-lg border border-slate-200 dark:border-slate-700 px-4 py-2 text-sm font-semibold text-slate-600 dark:text-slate-300 transition hover:bg-slate-50 dark:hover:bg-slate-800"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            <div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Password</h2>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                Change the password you sign in with.
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5">
              <div className="space-y-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
                    Current Password
                  </label>
                  <input
                    type="password"
                    autoComplete="current-password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white transition focus:border-sky-500 focus:bg-white dark:focus:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
                    New Password
                  </label>
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white transition focus:border-sky-500 focus:bg-white dark:focus:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
                  />
                  <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">At least 8 characters.</p>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
                    Confirm New Password
                  </label>
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white transition focus:border-sky-500 focus:bg-white dark:focus:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
                  />
                </div>
                <button
                  onClick={handleChangePassword}
                  disabled={changingPassword || !currentPassword || !newPassword || !confirmPassword}
                  className="w-full rounded-lg bg-sky-600 py-2 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:opacity-50"
                >
                  {changingPassword ? 'Changing...' : 'Change Password'}
                </button>
              </div>
            </div>
          </div>
        </main>
      </div>

      {resetOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
          onClick={() => setResetOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-white dark:bg-slate-900 p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Turn off 2FA?</h3>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Confirm your password to turn off two-factor authentication for this account. Use this
              before handing the account to whoever actually owns it, so they can set up their own
              authenticator instead of sharing yours.
            </p>

            <div className="mt-4">
              <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">Password</label>
              <input
                type="password"
                autoFocus
                value={resetPassword}
                onChange={(e) => setResetPassword(e.target.value)}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white transition focus:border-sky-500 focus:bg-white dark:focus:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
              />
            </div>

            <button
              onClick={handleReset}
              disabled={resetting || !resetPassword}
              className="mt-4 w-full rounded-lg bg-rose-600 py-2 text-sm font-semibold text-white transition hover:bg-rose-700 disabled:opacity-50"
            >
              {resetting ? 'Turning off...' : 'Turn Off 2FA'}
            </button>
            <button
              onClick={() => {
                setResetOpen(false)
                setResetPassword('')
              }}
              className="mt-2 w-full rounded-lg border border-slate-200 dark:border-slate-700 py-2 text-sm font-semibold text-slate-600 dark:text-slate-300 transition hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
