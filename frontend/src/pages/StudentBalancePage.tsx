import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Wallet, QrCode } from 'lucide-react'
import { notify } from '@/lib/toast'
import { confirmAction } from '@/lib/confirm'
import Sidebar from '@/components/Sidebar'
import StudentHeader from '@/components/StudentHeader'
import EmptyState from '@/components/EmptyState'
import { getStudentSidebarItems } from '@/lib/studentNav'
import { studentFetch } from '@/lib/studentAuth'
import { API } from '@/lib/apiBase'

interface PaymentItem {
  id: string
  reference_number: string
  amount: number
  status: 'PENDING' | 'APPROVED' | 'REJECTED'
  rejection_reason: string | null
  created_at: string
}

interface FeeItem {
  id: string
  school_year: string
  semester: string
  amount_due: number
  amount_paid: number
  balance: number
  status: 'PAID' | 'PARTIAL' | 'UNPAID'
  payments: PaymentItem[]
}

function semesterLabel(semester: string) {
  return semester === '1ST' ? '1st Semester' : semester === '2ND' ? '2nd Semester' : semester
}

function peso(amount: number) {
  return `₱${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export default function StudentBalancePage() {
  const navigate = useNavigate()
  const [studentId, setStudentId] = useState<string | null>(null)
  const [studentName, setStudentName] = useState<string | null>(null)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [totalBalance, setTotalBalance] = useState(0)
  const [fees, setFees] = useState<FeeItem[]>([])
  const [termFilter, setTermFilter] = useState('ALL')
  const [qrImageUrl, setQrImageUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  const [payFee, setPayFee] = useState<FeeItem | null>(null)
  const [refNumber, setRefNumber] = useState('')
  const [amount, setAmount] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    const stored = localStorage.getItem('user')
    if (!stored) {
      navigate('/login', { replace: true })
      return
    }
    const user = JSON.parse(stored)
    setStudentId(user.student_id)
    setStudentName(user.name ?? null)
    setAvatarUrl(user.avatar_url ?? null)
  }, [navigate])

  useEffect(() => {
    if (!studentId) return
    void loadBalance()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId])

  async function loadBalance(isRefresh = false) {
    if (isRefresh) setRefreshing(true)
    else setLoading(true)
    try {
      const [balRes, qrRes] = await Promise.all([
        studentFetch(`${API}/balance/`),
        studentFetch(`${API}/balance/qr`),
      ])
      if (balRes.ok) {
        const data = await balRes.json()
        setTotalBalance(data.total_balance)
        setFees(data.fees)
      }
      if (qrRes.ok) setQrImageUrl((await qrRes.json()).qr_image_url)
    } catch {
      notify.error('Network error', 'Could not load your balance.')
    } finally {
      if (isRefresh) setRefreshing(false)
      else setLoading(false)
    }
  }

  const termOptions = Array.from(new Set(fees.map((f) => `${f.school_year}|${f.semester}`)))
    .sort()
    .reverse()
    .map((key) => {
      const [schoolYear, semester] = key.split('|')
      return { value: key, label: `${semesterLabel(semester)} ${schoolYear}` }
    })

  const filteredFees = termFilter === 'ALL' ? fees : fees.filter((f) => `${f.school_year}|${f.semester}` === termFilter)

  function openPayForm(fee: FeeItem) {
    setPayFee(fee)
    setRefNumber('')
    setAmount(String(fee.balance))
  }

  async function handleSubmitPayment() {
    if (!payFee) return
    if (!refNumber.trim()) {
      notify.error('Reference number required', 'Please enter the reference number from your payment.')
      return
    }
    const amountNum = Number(amount)
    if (!amountNum || amountNum <= 0) {
      notify.error('Invalid amount', 'Please enter how much you paid.')
      return
    }

    setSubmitting(true)
    try {
      const res = await studentFetch(`${API}/balance/${payFee.id}/pay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reference_number: refNumber.trim(), amount: amountNum }),
      })
      if (!res.ok) {
        const err = await res.json()
        notify.error('Could not submit', err.detail || 'Please try again.')
        return
      }
      notify.success('Submitted', 'Your payment is pending admin review.')
      setPayFee(null)
      await loadBalance()
    } catch {
      notify.error('Network error', 'Could not reach the server.')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleLogout() {
    const confirmed = await confirmAction({
      title: 'Sign out?',
      text: "You'll need your Student ID and authenticator code to sign in again.",
      confirmText: 'Sign out',
      danger: true,
    })
    if (!confirmed) return

    localStorage.removeItem('access_token')
    localStorage.removeItem('user')
    navigate('/login', { replace: true })
  }

  if (!studentId) return null

  return (
    <div className="min-h-screen bg-slate-50 font-sans dark:bg-slate-950">
      <Sidebar
        title="PSITS Portal"
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        items={getStudentSidebarItems('balance', navigate)}
      />

      <div className="lg:pl-64">
        <StudentHeader
          title="Balance"
          subtitle="View your membership dues and submit payments"
          onMenuOpen={() => setMenuOpen(true)}
          onMenuClose={() => setMenuOpen(false)}
          onRefresh={() => loadBalance(true)}
          refreshing={refreshing}
          loading={loading}
          studentName={studentName}
          avatarUrl={avatarUrl}
          onLogout={handleLogout}
        />

        <main className="px-6 py-8 lg:px-10">
          <div className="mb-6 flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400">
              <Wallet className="h-5 w-5" />
            </span>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Total Outstanding Balance
              </p>
              <p className="text-2xl font-semibold text-slate-900 dark:text-white">
                {loading ? '...' : peso(totalBalance)}
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between gap-3 border-b border-slate-100 p-4 dark:border-slate-800">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Membership Dues</h2>
              <select
                value={termFilter}
                onChange={(e) => setTermFilter(e.target.value)}
                className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-600 focus:border-sky-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
              >
                <option value="ALL">All Terms</option>
                {termOptions.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>

            {loading ? (
              <div className="space-y-3 p-5">
                <div className="h-4 w-full animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
                <div className="h-4 w-full animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
              </div>
            ) : filteredFees.length === 0 ? (
              <EmptyState
                title={fees.length === 0 ? 'No membership dues on record yet.' : 'No dues for this term.'}
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-slate-100 bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-400">
                    <tr>
                      <th className="px-5 py-3">School Year</th>
                      <th className="px-5 py-3">Semester</th>
                      <th className="px-5 py-3">Amount Due</th>
                      <th className="px-5 py-3">Amount Paid</th>
                      <th className="px-5 py-3">Status</th>
                      <th className="px-5 py-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredFees.map((fee) => {
                      const latestPayment = fee.payments[0]
                      const hasPending = latestPayment?.status === 'PENDING'
                      return (
                        <tr key={fee.id} className="border-b border-slate-50 last:border-0 dark:border-slate-800/60">
                          <td className="px-5 py-3 text-slate-700 dark:text-slate-300">{fee.school_year}</td>
                          <td className="px-5 py-3 text-slate-700 dark:text-slate-300">
                            {semesterLabel(fee.semester)}
                          </td>
                          <td className="px-5 py-3 text-slate-700 dark:text-slate-300">{peso(fee.amount_due)}</td>
                          <td className="px-5 py-3 text-slate-700 dark:text-slate-300">{peso(fee.amount_paid)}</td>
                          <td className="px-5 py-3">
                            {fee.status === 'PAID' ? (
                              <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
                                Paid
                              </span>
                            ) : fee.status === 'PARTIAL' ? (
                              <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 dark:bg-amber-950/40 dark:text-amber-400">
                                Partial
                              </span>
                            ) : (
                              <span className="rounded-full bg-rose-50 px-2.5 py-1 text-xs font-medium text-rose-700 dark:bg-rose-950/40 dark:text-rose-400">
                                Unpaid
                              </span>
                            )}
                          </td>
                          <td className="px-5 py-3 text-right">
                            {fee.status === 'PAID' ? (
                              <span className="text-xs text-slate-400 dark:text-slate-500">—</span>
                            ) : hasPending ? (
                              <span className="rounded-lg bg-sky-50 px-3 py-1.5 text-xs font-medium text-sky-700 dark:bg-sky-950/40 dark:text-sky-400">
                                Pending review
                              </span>
                            ) : (
                              <button
                                onClick={() => openPayForm(fee)}
                                className="rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-sky-700"
                              >
                                Pay
                              </button>
                            )}
                            {latestPayment?.status === 'REJECTED' && !hasPending && (
                              <p className="mt-1 max-w-[180px] text-right text-[11px] italic text-rose-500">
                                Rejected: {latestPayment.rejection_reason}
                              </p>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </main>
      </div>

      {payFee && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
          onClick={() => setPayFee(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl dark:bg-slate-900"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Pay Membership Fee</h3>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              {semesterLabel(payFee.semester)} - {payFee.school_year} · Balance: {peso(payFee.balance)}
            </p>

            <div className="mt-4 flex flex-col items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800">
              {qrImageUrl ? (
                <img src={qrImageUrl} alt="Payment QR code" className="h-48 w-48 rounded-lg object-contain" />
              ) : (
                <div className="flex h-48 w-48 flex-col items-center justify-center gap-2 rounded-lg bg-slate-100 text-slate-400 dark:bg-slate-700 dark:text-slate-500">
                  <QrCode className="h-8 w-8" />
                  <p className="text-center text-xs">QR code not set up yet</p>
                </div>
              )}
              <p className="text-center text-xs text-slate-500 dark:text-slate-400">
                Scan to pay, then enter your reference number and amount below.
              </p>
            </div>

            <div className="mt-4 space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
                  Reference Number
                </label>
                <input
                  type="text"
                  value={refNumber}
                  onChange={(e) => setRefNumber(e.target.value)}
                  placeholder="e.g. GCash reference number"
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 transition focus:border-sky-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">Amount</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 transition focus:border-sky-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              </div>
              <button
                onClick={handleSubmitPayment}
                disabled={submitting}
                className="w-full rounded-lg bg-sky-600 py-2 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:opacity-50"
              >
                {submitting ? 'Submitting...' : 'Submit Payment'}
              </button>
            </div>

            <button
              onClick={() => setPayFee(null)}
              className="mt-3 w-full rounded-lg border border-slate-200 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
