import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, X, RefreshCw, QrCode } from 'lucide-react'
import { notify } from '@/lib/toast'
import { confirmAction, confirmActionWithReason } from '@/lib/confirm'
import Sidebar, { MobileMenuButton } from '@/components/Sidebar'
import AdminProfileMenu from '@/components/AdminProfileMenu'
import { getAdminSidebarItems } from '@/lib/adminNav'
import EmptyState from '@/components/EmptyState'
import { adminFetch } from '@/lib/adminAuth'
import { API } from '@/lib/apiBase'

interface PaymentRow {
  id: string
  student_id: string
  student_name: string
  school_year: string
  semester: string
  reference_number: string
  amount: number
  status: 'PENDING' | 'APPROVED' | 'REJECTED'
  rejection_reason: string | null
  created_at: string
  reviewed_at: string | null
}

interface BalanceRow {
  fee_id: string
  student_id: string
  student_name: string
  school_year: string
  semester: string
  amount_due: number
  amount_paid: number
  balance: number
  status: 'PAID' | 'PARTIAL' | 'UNPAID'
}

type StatusFilter = 'PENDING' | 'ALL'
type TabView = 'submissions' | 'balances'

const REJECTION_REASONS = [
  'Invalid reference number',
  'Amount does not match',
  'Duplicate submission',
  'Proof of payment unclear',
  'Other',
]

function semesterLabel(semester: string) {
  return semester === '1ST' ? '1st Sem' : semester === '2ND' ? '2nd Sem' : semester
}

function peso(amount: number) {
  return `₱${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export default function AdminPaymentsPage() {
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)
  const [payments, setPayments] = useState<PaymentRow[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('PENDING')
  const [actingOn, setActingOn] = useState<string | null>(null)

  const [qrImageUrl, setQrImageUrl] = useState('')
  const [savingQr, setSavingQr] = useState(false)

  const [tab, setTab] = useState<TabView>('submissions')
  const [balances, setBalances] = useState<BalanceRow[]>([])
  const [balancesLoading, setBalancesLoading] = useState(true)
  const [recordFor, setRecordFor] = useState<BalanceRow | null>(null)
  const [recordAmount, setRecordAmount] = useState('')
  const [recordNote, setRecordNote] = useState('')
  const [recording, setRecording] = useState(false)

  useEffect(() => {
    void loadPayments()
    void loadQrSetting()
    void loadBalances()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter])

  async function loadPayments(isRefresh = false) {
    if (isRefresh) setRefreshing(true)
    else setLoading(true)
    try {
      const query = statusFilter === 'ALL' ? '' : `?status_filter=${statusFilter}`
      const res = await adminFetch(`${API}/officer/payments/${query}`)
      if (res.ok) setPayments((await res.json()).payments)
    } catch {
      notify.error('Network error', 'Could not load payments.')
    } finally {
      if (isRefresh) setRefreshing(false)
      else setLoading(false)
    }
  }

  async function loadQrSetting() {
    try {
      const res = await adminFetch(`${API}/officer/settings/payment-qr`)
      if (res.ok) setQrImageUrl((await res.json()).qr_image_url ?? '')
    } catch {
      // Non-critical - the form just starts blank.
    }
  }

  async function loadBalances() {
    setBalancesLoading(true)
    try {
      const res = await adminFetch(`${API}/officer/balances/`)
      if (res.ok) setBalances((await res.json()).balances)
    } catch {
      notify.error('Network error', 'Could not load student balances.')
    } finally {
      setBalancesLoading(false)
    }
  }

  function openRecordForm(row: BalanceRow) {
    setRecordFor(row)
    setRecordAmount(String(row.balance))
    setRecordNote('')
  }

  async function handleRecordPayment() {
    if (!recordFor) return
    const amountNum = Number(recordAmount)
    if (!amountNum || amountNum <= 0) {
      notify.error('Invalid amount', 'Please enter how much was paid.')
      return
    }

    setRecording(true)
    try {
      const res = await adminFetch(`${API}/officer/balances/${recordFor.fee_id}/record-payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: amountNum, note: recordNote.trim() || null }),
      })
      if (!res.ok) {
        const err = await res.json()
        notify.error('Could not record payment', err.detail || 'Please try again.')
        return
      }
      notify.success('Recorded', `${peso(amountNum)} applied to ${recordFor.student_name}'s balance.`)
      setRecordFor(null)
      await loadBalances()
    } catch {
      notify.error('Network error', 'Could not reach the server.')
    } finally {
      setRecording(false)
    }
  }

  async function handleSaveQr() {
    setSavingQr(true)
    try {
      const res = await adminFetch(`${API}/officer/settings/payment-qr`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ qr_image_url: qrImageUrl.trim() }),
      })
      if (!res.ok) {
        notify.error('Could not save', 'Please try again.')
        return
      }
      notify.success('Saved', 'Payment QR code updated for all students.')
    } catch {
      notify.error('Network error', 'Could not reach the server.')
    } finally {
      setSavingQr(false)
    }
  }

  async function handleApprove(p: PaymentRow) {
    const confirmed = await confirmAction({
      title: `Approve ${p.student_name}'s payment?`,
      text: `${peso(p.amount)} will be applied to their ${semesterLabel(p.semester)} ${p.school_year} balance.`,
      confirmText: 'Approve',
    })
    if (!confirmed) return

    setActingOn(p.id)
    try {
      const res = await adminFetch(`${API}/officer/payments/${p.id}/approve`, { method: 'PUT' })
      if (!res.ok) {
        const err = await res.json()
        notify.error('Could not approve', err.detail || 'Please try again.')
        return
      }
      notify.success('Approved', `${peso(p.amount)} applied to ${p.student_name}'s balance.`)
      await Promise.all([loadPayments(), loadBalances()])
    } catch {
      notify.error('Network error', 'Could not reach the server.')
    } finally {
      setActingOn(null)
    }
  }

  async function handleReject(p: PaymentRow) {
    const reason = await confirmActionWithReason({
      title: `Reject ${p.student_name}'s payment?`,
      text: 'Select a reason - this will be shown to the student.',
      confirmText: 'Reject',
      reasons: REJECTION_REASONS,
    })
    if (!reason) return

    setActingOn(p.id)
    try {
      const res = await adminFetch(`${API}/officer/payments/${p.id}/reject`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      })
      if (!res.ok) {
        const err = await res.json()
        notify.error('Could not reject', err.detail || 'Please try again.')
        return
      }
      notify.success('Rejected', `${p.student_name}'s payment has been rejected.`)
      await loadPayments()
    } catch {
      notify.error('Network error', 'Could not reach the server.')
    } finally {
      setActingOn(null)
    }
  }

  const sorted = useMemo(
    () => [...payments].sort((a, b) => b.created_at.localeCompare(a.created_at)),
    [payments]
  )

  return (
    <div className="min-h-screen bg-slate-50 font-sans">
      <Sidebar
        title="PSITS Admin"
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        items={getAdminSidebarItems('payments', navigate, () => navigate('/admin/events'))}
      />

      <div className="lg:pl-64">
        <header className="flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-6 py-4 lg:px-10">
          <div className="flex items-center gap-3">
            <MobileMenuButton onClick={() => setMenuOpen(true)} />
            <div>
              <h1 className="text-lg font-semibold text-slate-900">Membership Ledger</h1>
              <p className="text-sm text-slate-500">Review student payment submissions</p>
            </div>
          </div>
          <AdminProfileMenu />
        </header>

        <main className="px-6 py-8 lg:px-10">
          <div className="mb-6 rounded-xl border border-slate-200 bg-white p-5">
            <div className="flex items-center gap-2">
              <QrCode className="h-4 w-4 text-slate-500" />
              <h2 className="text-sm font-semibold text-slate-900">Payment QR Code</h2>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              The image URL shown to students when they pay their membership fee.
            </p>
            <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
              <input
                type="text"
                value={qrImageUrl}
                onChange={(e) => setQrImageUrl(e.target.value)}
                placeholder="https://... QR code image URL"
                className="flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 transition focus:border-sky-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-500/20"
              />
              <button
                onClick={handleSaveQr}
                disabled={savingQr}
                className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:opacity-50"
              >
                {savingQr ? 'Saving...' : 'Save'}
              </button>
            </div>
            {qrImageUrl && (
              <img src={qrImageUrl} alt="Payment QR preview" className="mt-3 h-32 w-32 rounded-lg object-contain" />
            )}
          </div>

          <div className="mb-4 flex gap-2">
            <button
              onClick={() => setTab('submissions')}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                tab === 'submissions'
                  ? 'bg-slate-900 text-white'
                  : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              Submissions
            </button>
            <button
              onClick={() => setTab('balances')}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                tab === 'balances'
                  ? 'bg-slate-900 text-white'
                  : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              Student Balances
            </button>
          </div>

          {tab === 'submissions' && (
          <div className="rounded-xl border border-slate-200 bg-white">
            <div className="flex items-center justify-between gap-3 border-b border-slate-100 p-4">
              <div className="flex gap-2">
                <button
                  onClick={() => setStatusFilter('PENDING')}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                    statusFilter === 'PENDING'
                      ? 'bg-sky-600 text-white'
                      : 'border border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  Pending
                </button>
                <button
                  onClick={() => setStatusFilter('ALL')}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                    statusFilter === 'ALL'
                      ? 'bg-sky-600 text-white'
                      : 'border border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  All
                </button>
              </div>
              <button
                onClick={() => loadPayments(true)}
                disabled={refreshing || loading}
                title="Refresh"
                className="rounded-lg border border-slate-200 p-2 text-slate-500 transition hover:bg-slate-50 disabled:opacity-50"
              >
                <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
              </button>
            </div>

            {loading ? (
              <div className="space-y-3 p-5">
                <div className="h-4 w-full animate-pulse rounded bg-slate-100" />
                <div className="h-4 w-full animate-pulse rounded bg-slate-100" />
                <div className="h-4 w-2/3 animate-pulse rounded bg-slate-100" />
              </div>
            ) : sorted.length === 0 ? (
              <EmptyState
                title={statusFilter === 'PENDING' ? 'No pending payments.' : 'No payments have been submitted.'}
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-slate-100 bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-5 py-3">Student</th>
                      <th className="px-5 py-3">Term</th>
                      <th className="px-5 py-3">Reference #</th>
                      <th className="px-5 py-3">Amount</th>
                      <th className="px-5 py-3">Submitted</th>
                      <th className="px-5 py-3">Status</th>
                      <th className="px-5 py-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sorted.map((p) => (
                      <tr key={p.id} className="border-b border-slate-50 last:border-0">
                        <td className="px-5 py-3">
                          <p className="font-medium text-slate-900">{p.student_name}</p>
                          <p className="text-xs text-slate-400">{p.student_id}</p>
                        </td>
                        <td className="px-5 py-3 text-slate-700">
                          {semesterLabel(p.semester)} {p.school_year}
                        </td>
                        <td className="px-5 py-3 text-slate-600">{p.reference_number}</td>
                        <td className="px-5 py-3 font-medium text-slate-900">{peso(p.amount)}</td>
                        <td className="px-5 py-3 text-slate-500">
                          {new Date(p.created_at).toLocaleDateString(undefined, { dateStyle: 'medium' })}
                        </td>
                        <td className="px-5 py-3">
                          {p.status === 'PENDING' ? (
                            <span className="rounded-full bg-sky-50 px-2.5 py-1 text-xs font-medium text-sky-700">
                              Pending
                            </span>
                          ) : p.status === 'APPROVED' ? (
                            <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
                              Approved
                            </span>
                          ) : (
                            <span className="rounded-full bg-rose-50 px-2.5 py-1 text-xs font-medium text-rose-700">
                              Rejected
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-3">
                          {p.status === 'PENDING' ? (
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={() => handleApprove(p)}
                                disabled={actingOn === p.id}
                                title="Approve"
                                className="rounded-lg bg-emerald-600 p-2 text-white transition hover:bg-emerald-700 disabled:opacity-50"
                              >
                                <Check className="h-3.5 w-3.5" />
                              </button>
                              <button
                                onClick={() => handleReject(p)}
                                disabled={actingOn === p.id}
                                title="Reject"
                                className="rounded-lg bg-rose-600 p-2 text-white transition hover:bg-rose-700 disabled:opacity-50"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          ) : (
                            <div className="text-right text-xs text-slate-400">
                              {p.reviewed_at && (
                                <p>{new Date(p.reviewed_at).toLocaleDateString(undefined, { dateStyle: 'medium' })}</p>
                              )}
                              {p.rejection_reason && (
                                <p className="mt-0.5 italic text-rose-500">{p.rejection_reason}</p>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          )}

          {tab === 'balances' && (
          <div className="rounded-xl border border-slate-200 bg-white">
            <div className="flex items-center justify-between gap-3 border-b border-slate-100 p-4">
              <p className="text-sm text-slate-500">Record a payment directly - e.g. cash paid in person.</p>
              <button
                onClick={() => loadBalances()}
                disabled={balancesLoading}
                title="Refresh"
                className="rounded-lg border border-slate-200 p-2 text-slate-500 transition hover:bg-slate-50 disabled:opacity-50"
              >
                <RefreshCw className={`h-4 w-4 ${balancesLoading ? 'animate-spin' : ''}`} />
              </button>
            </div>

            {balancesLoading ? (
              <div className="space-y-3 p-5">
                <div className="h-4 w-full animate-pulse rounded bg-slate-100" />
                <div className="h-4 w-full animate-pulse rounded bg-slate-100" />
                <div className="h-4 w-2/3 animate-pulse rounded bg-slate-100" />
              </div>
            ) : balances.length === 0 ? (
              <EmptyState title="No membership dues on record yet." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-slate-100 bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-5 py-3">Student</th>
                      <th className="px-5 py-3">Term</th>
                      <th className="px-5 py-3">Due</th>
                      <th className="px-5 py-3">Paid</th>
                      <th className="px-5 py-3">Balance</th>
                      <th className="px-5 py-3">Status</th>
                      <th className="px-5 py-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {balances.map((row) => (
                      <tr key={row.fee_id} className="border-b border-slate-50 last:border-0">
                        <td className="px-5 py-3">
                          <p className="font-medium text-slate-900">{row.student_name}</p>
                          <p className="text-xs text-slate-400">{row.student_id}</p>
                        </td>
                        <td className="px-5 py-3 text-slate-700">
                          {semesterLabel(row.semester)} {row.school_year}
                        </td>
                        <td className="px-5 py-3 text-slate-700">{peso(row.amount_due)}</td>
                        <td className="px-5 py-3 text-slate-700">{peso(row.amount_paid)}</td>
                        <td className="px-5 py-3 font-medium text-slate-900">{peso(row.balance)}</td>
                        <td className="px-5 py-3">
                          {row.status === 'PAID' ? (
                            <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
                              Paid
                            </span>
                          ) : row.status === 'PARTIAL' ? (
                            <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700">
                              Partial
                            </span>
                          ) : (
                            <span className="rounded-full bg-rose-50 px-2.5 py-1 text-xs font-medium text-rose-700">
                              Unpaid
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-3 text-right">
                          {row.status === 'PAID' ? (
                            <span className="text-xs text-slate-400">—</span>
                          ) : (
                            <button
                              onClick={() => openRecordForm(row)}
                              className="rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-sky-700"
                            >
                              Record Payment
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          )}
        </main>
      </div>

      {recordFor && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
          onClick={() => setRecordFor(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-slate-900">Record Payment</h3>
            <p className="mt-1 text-sm text-slate-500">
              {recordFor.student_name} · {semesterLabel(recordFor.semester)} {recordFor.school_year} · Balance:{' '}
              {peso(recordFor.balance)}
            </p>

            <div className="mt-4 space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Amount</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={recordAmount}
                  onChange={(e) => setRecordAmount(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 transition focus:border-sky-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-500/20"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Note (optional)</label>
                <input
                  type="text"
                  value={recordNote}
                  onChange={(e) => setRecordNote(e.target.value)}
                  placeholder="e.g. Cash paid in person"
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 transition focus:border-sky-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-500/20"
                />
              </div>
              <button
                onClick={handleRecordPayment}
                disabled={recording}
                className="w-full rounded-lg bg-sky-600 py-2 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:opacity-50"
              >
                {recording ? 'Recording...' : 'Record Payment'}
              </button>
            </div>

            <button
              onClick={() => setRecordFor(null)}
              className="mt-3 w-full rounded-lg border border-slate-200 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
