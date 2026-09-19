import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, X, QrCode, Search, ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { notify } from '@/lib/toast'
import { confirmAction, confirmActionWithReason } from '@/lib/confirm'
import Sidebar, { MobileMenuButton } from '@/components/Sidebar'
import AdminProfileMenu from '@/components/AdminProfileMenu'
import { getAdminSidebarItems } from '@/lib/adminNav'
import EmptyState from '@/components/EmptyState'
import ImageUploadField from '@/components/ImageUploadField'
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

interface StudentOption {
  student_id: string
  first_name: string
  last_name: string
}

interface SchoolYearOption {
  id: string
  label: string
  is_active: boolean
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

  const [addBalanceOpen, setAddBalanceOpen] = useState(false)
  const [studentOptions, setStudentOptions] = useState<StudentOption[]>([])
  const [schoolYearOptions, setSchoolYearOptions] = useState<SchoolYearOption[]>([])
  const [newBalanceStudentId, setNewBalanceStudentId] = useState('')
  const [newBalanceSchoolYearId, setNewBalanceSchoolYearId] = useState('')
  const [newBalanceSemester, setNewBalanceSemester] = useState('1ST')
  const [newBalanceAmount, setNewBalanceAmount] = useState('100')
  const [addingBalance, setAddingBalance] = useState(false)

  // Submissions table: search, term filter, pagination
  const [paymentSearch, setPaymentSearch] = useState('')
  const [paymentTermFilter, setPaymentTermFilter] = useState('ALL')
  const [paymentPageSize, setPaymentPageSize] = useState(25)
  const [paymentPage, setPaymentPage] = useState(1)

  // Student Balances table: search, filters, pagination
  const [balanceSearch, setBalanceSearch] = useState('')
  const [balanceStatusFilter, setBalanceStatusFilter] = useState('ALL')
  const [balanceYearFilter, setBalanceYearFilter] = useState('ALL')
  const [balanceSemFilter, setBalanceSemFilter] = useState('ALL')
  const [balancePageSize, setBalancePageSize] = useState(25)
  const [balancePage, setBalancePage] = useState(1)

  useEffect(() => {
    void loadPayments()
    void loadQrSetting()
    void loadBalances()
    void loadStudentOptions()
    void loadSchoolYearOptions()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter])

  async function loadPayments(background = false) {
    if (!background) setLoading(true)
    try {
      const query = statusFilter === 'ALL' ? '' : `?status_filter=${statusFilter}`
      const res = await adminFetch(`${API}/officer/payments/${query}`)
      if (res.ok) setPayments((await res.json()).payments)
    } catch {
      notify.error('Network error', 'Could not load payments.')
    } finally {
      if (!background) setLoading(false)
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

  async function loadBalances(background = false) {
    if (!background) setBalancesLoading(true)
    try {
      const res = await adminFetch(`${API}/officer/balances/`)
      if (res.ok) setBalances((await res.json()).balances)
    } catch {
      notify.error('Network error', 'Could not load student balances.')
    } finally {
      if (!background) setBalancesLoading(false)
    }
  }

  async function refreshAll() {
    setRefreshing(true)
    try {
      await Promise.all([loadPayments(true), loadBalances(true), loadQrSetting()])
    } finally {
      setRefreshing(false)
    }
  }

  async function loadStudentOptions() {
    try {
      const res = await adminFetch(`${API}/officer/students/`)
      if (res.ok) setStudentOptions((await res.json()).students)
    } catch {
      // Non-critical - the Add Balance student dropdown just starts empty.
    }
  }

  async function loadSchoolYearOptions() {
    try {
      const res = await adminFetch(`${API}/officer/school-years`)
      if (res.ok) setSchoolYearOptions((await res.json()).school_years)
    } catch {
      // Non-critical - the Add Balance term dropdown just starts empty.
    }
  }

  function openAddBalance() {
    setNewBalanceStudentId('')
    setNewBalanceSchoolYearId(schoolYearOptions.find((y) => y.is_active)?.id ?? schoolYearOptions[0]?.id ?? '')
    setNewBalanceSemester('1ST')
    setNewBalanceAmount('100')
    setAddBalanceOpen(true)
  }

  async function handleCreateBalance() {
    if (!newBalanceStudentId || !newBalanceSchoolYearId) {
      notify.error('Missing info', 'Please pick a student and a term.')
      return
    }
    const amountNum = Number(newBalanceAmount)
    if (!amountNum || amountNum <= 0) {
      notify.error('Invalid amount', 'Please enter how much is due.')
      return
    }

    setAddingBalance(true)
    try {
      const res = await adminFetch(`${API}/officer/balances/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          student_id: newBalanceStudentId,
          school_year_id: newBalanceSchoolYearId,
          semester: newBalanceSemester,
          amount_due: amountNum,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        notify.error('Could not add balance', err.detail || 'Please try again.')
        return
      }
      notify.success('Balance added', 'The new due has been added to the ledger.')
      setAddBalanceOpen(false)
      await loadBalances()
    } catch {
      notify.error('Network error', 'Could not reach the server.')
    } finally {
      setAddingBalance(false)
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

  const paymentTerms = useMemo(
    () => Array.from(new Set(payments.map((p) => `${p.semester}|${p.school_year}`))).sort(),
    [payments]
  )

  const filteredPayments = useMemo(() => {
    const q = paymentSearch.trim().toLowerCase()
    let list = sorted
    if (q) {
      list = list.filter(
        (p) =>
          p.student_id.toLowerCase().includes(q) ||
          p.student_name.toLowerCase().includes(q) ||
          p.reference_number.toLowerCase().includes(q)
      )
    }
    if (paymentTermFilter !== 'ALL') {
      list = list.filter((p) => `${p.semester}|${p.school_year}` === paymentTermFilter)
    }
    return list
  }, [sorted, paymentSearch, paymentTermFilter])

  const paymentTotalPages = Math.max(1, Math.ceil(filteredPayments.length / paymentPageSize))
  const pagedPayments = filteredPayments.slice(
    (paymentPage - 1) * paymentPageSize,
    paymentPage * paymentPageSize
  )

  useEffect(() => {
    setPaymentPage(1)
  }, [paymentSearch, paymentTermFilter, paymentPageSize, statusFilter])

  const balanceYears = useMemo(
    () => Array.from(new Set(balances.map((b) => b.school_year))).sort().reverse(),
    [balances]
  )

  // The summary cards follow the selected school year / semester only, so
  // they stay a true term total while the table is narrowed by search/status.
  const termBalances = useMemo(
    () =>
      balances.filter(
        (b) =>
          (balanceYearFilter === 'ALL' || b.school_year === balanceYearFilter) &&
          (balanceSemFilter === 'ALL' || b.semester === balanceSemFilter)
      ),
    [balances, balanceYearFilter, balanceSemFilter]
  )

  const balanceTotals = useMemo(() => {
    const collectibles = termBalances.reduce((sum, b) => sum + b.amount_due, 0)
    const collected = termBalances.reduce((sum, b) => sum + Math.min(b.amount_paid, b.amount_due), 0)
    const paidCount = termBalances.filter((b) => b.status === 'PAID').length
    return {
      collectibles,
      collected,
      notCollected: collectibles - collected,
      paidCount,
      total: termBalances.length,
      rate: collectibles > 0 ? Math.round((collected / collectibles) * 100) : 0,
    }
  }, [termBalances])

  const filteredBalances = useMemo(() => {
    const q = balanceSearch.trim().toLowerCase()
    let list = termBalances
    if (q) {
      list = list.filter(
        (b) => b.student_id.toLowerCase().includes(q) || b.student_name.toLowerCase().includes(q)
      )
    }
    if (balanceStatusFilter !== 'ALL') list = list.filter((b) => b.status === balanceStatusFilter)
    return list
  }, [termBalances, balanceSearch, balanceStatusFilter])

  const balanceTotalPages = Math.max(1, Math.ceil(filteredBalances.length / balancePageSize))
  const pagedBalances = filteredBalances.slice(
    (balancePage - 1) * balancePageSize,
    balancePage * balancePageSize
  )

  useEffect(() => {
    setBalancePage(1)
  }, [balanceSearch, balanceStatusFilter, balanceYearFilter, balanceSemFilter, balancePageSize])

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 font-sans">
      <Sidebar
        title="PSITS Admin"
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        items={getAdminSidebarItems('payments', navigate, () => navigate('/admin/events'))}
      />

      <div className="lg:pl-64">
        <header className="flex items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-6 py-4 lg:px-10">
          <div className="flex items-center gap-3">
            <MobileMenuButton onClick={() => setMenuOpen(true)} />
            <div>
              <h1 className="text-lg font-semibold text-slate-900 dark:text-white">Membership Ledger</h1>
              <p className="text-sm text-slate-500 dark:text-slate-400">Review student payment submissions</p>
            </div>
          </div>
          <AdminProfileMenu
            onRefresh={refreshAll}
            refreshing={refreshing}
            refreshDisabled={loading || balancesLoading}
          />
        </header>

        <main className="px-6 py-8 lg:px-10">
          <div className="mb-6 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5">
            <div className="flex items-center gap-2">
              <QrCode className="h-4 w-4 text-slate-500 dark:text-slate-400" />
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Payment QR Code</h2>
            </div>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              The QR image shown to students when they pay their membership fee.
            </p>
            <div className="mt-3 max-w-sm">
              <ImageUploadField
                label="QR image"
                value={qrImageUrl}
                purpose="payment-qr"
                onChange={setQrImageUrl}
                previewClassName="h-36 w-36"
              />
            </div>
            <div className="mt-3 flex justify-end">
              <button
                onClick={handleSaveQr}
                disabled={savingQr}
                className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:opacity-50"
              >
                {savingQr ? 'Saving...' : 'Save QR'}
              </button>
            </div>
          </div>

          <div className="mb-4 flex gap-2">
            <button
              onClick={() => setTab('submissions')}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                tab === 'submissions'
                  ? 'bg-slate-900 text-white dark:bg-sky-600'
                  : 'border border-slate-300 bg-white text-slate-700 shadow-sm hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:shadow-none dark:hover:bg-slate-700'
              }`}
            >
              Submissions
            </button>
            <button
              onClick={() => setTab('balances')}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                tab === 'balances'
                  ? 'bg-slate-900 text-white dark:bg-sky-600'
                  : 'border border-slate-300 bg-white text-slate-700 shadow-sm hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:shadow-none dark:hover:bg-slate-700'
              }`}
            >
              Student Balances
            </button>
          </div>

          {tab === 'submissions' && (
          <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
            <div className="space-y-3 border-b border-slate-100 dark:border-slate-800 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
                  <span>Show</span>
                  <select
                    value={paymentPageSize}
                    onChange={(e) => setPaymentPageSize(Number(e.target.value))}
                    className="rounded-lg border border-slate-200 dark:border-slate-700 px-2 py-1.5 text-sm text-slate-700 dark:text-slate-300 focus:border-sky-500 focus:outline-none"
                  >
                    <option value={10}>10</option>
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                  </select>
                  <span>entries</span>
                </div>

                <div className="relative w-full sm:w-64">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
                  <input
                    type="text"
                    value={paymentSearch}
                    onChange={(e) => setPaymentSearch(e.target.value)}
                    placeholder="Search name, Student ID, or reference #..."
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 py-2 pl-9 pr-3 text-sm text-slate-900 dark:text-white transition focus:border-sky-500 focus:bg-white dark:focus:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="flex gap-2">
                  <button
                    onClick={() => setStatusFilter('PENDING')}
                    className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                      statusFilter === 'PENDING'
                        ? 'bg-sky-600 text-white'
                        : 'border border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                    }`}
                  >
                    Pending
                  </button>
                  <button
                    onClick={() => setStatusFilter('ALL')}
                    className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                      statusFilter === 'ALL'
                        ? 'bg-sky-600 text-white'
                        : 'border border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                    }`}
                  >
                    All
                  </button>
                </div>
                {paymentTerms.length > 1 && (
                  <select
                    value={paymentTermFilter}
                    onChange={(e) => setPaymentTermFilter(e.target.value)}
                    className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 focus:border-sky-500 focus:outline-none"
                  >
                    <option value="ALL">All Terms</option>
                    {paymentTerms.map((t) => {
                      const [sem, year] = t.split('|')
                      return (
                        <option key={t} value={t}>
                          {semesterLabel(sem)} {year}
                        </option>
                      )
                    })}
                  </select>
                )}
              </div>
            </div>

            {loading ? (
              <div className="space-y-3 p-5">
                <div className="h-4 w-full animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
                <div className="h-4 w-full animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
                <div className="h-4 w-2/3 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
              </div>
            ) : filteredPayments.length === 0 ? (
              <EmptyState
                title={
                  sorted.length === 0
                    ? statusFilter === 'PENDING'
                      ? 'No pending payments.'
                      : 'No payments have been submitted.'
                    : 'No payments match these filters.'
                }
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-left text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
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
                    {pagedPayments.map((p) => (
                      <tr key={p.id} className="border-b border-slate-50 dark:border-slate-800/60 last:border-0">
                        <td className="px-5 py-3">
                          <p className="font-medium text-slate-900 dark:text-white">{p.student_name}</p>
                          <p className="text-xs text-slate-400 dark:text-slate-500">{p.student_id}</p>
                        </td>
                        <td className="px-5 py-3 text-slate-700 dark:text-slate-300">
                          {semesterLabel(p.semester)} {p.school_year}
                        </td>
                        <td className="px-5 py-3 text-slate-600 dark:text-slate-300">{p.reference_number}</td>
                        <td className="px-5 py-3 font-medium text-slate-900 dark:text-white">{peso(p.amount)}</td>
                        <td className="px-5 py-3 text-slate-500 dark:text-slate-400">
                          {new Date(p.created_at).toLocaleDateString(undefined, { dateStyle: 'medium' })}
                        </td>
                        <td className="px-5 py-3">
                          {p.status === 'PENDING' ? (
                            <span className="rounded-full bg-sky-50 dark:bg-sky-950/40 px-2.5 py-1 text-xs font-medium text-sky-700 dark:text-sky-400">
                              Pending
                            </span>
                          ) : p.status === 'APPROVED' ? (
                            <span className="rounded-full bg-emerald-50 dark:bg-emerald-950/40 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                              Approved
                            </span>
                          ) : (
                            <span className="rounded-full bg-rose-50 dark:bg-rose-950/40 px-2.5 py-1 text-xs font-medium text-rose-700 dark:text-rose-400">
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
                            <div className="text-right text-xs text-slate-400 dark:text-slate-500">
                              {p.reviewed_at && (
                                <p>{new Date(p.reviewed_at).toLocaleDateString(undefined, { dateStyle: 'medium' })}</p>
                              )}
                              {p.rejection_reason && (
                                <p className="mt-0.5 italic text-rose-500 dark:text-rose-400">{p.rejection_reason}</p>
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

            {!loading && filteredPayments.length > 0 && (
              <div className="flex items-center justify-between border-t border-slate-100 dark:border-slate-800 px-5 py-3 text-sm text-slate-500 dark:text-slate-400">
                <span>
                  Showing {(paymentPage - 1) * paymentPageSize + 1}–
                  {Math.min(paymentPage * paymentPageSize, filteredPayments.length)} of{' '}
                  {filteredPayments.length}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setPaymentPage((p) => Math.max(1, p - 1))}
                    disabled={paymentPage === 1}
                    className="rounded-lg border border-slate-200 dark:border-slate-700 p-1.5 transition hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <span className="rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-medium text-white">
                    {paymentPage}
                  </span>
                  <button
                    onClick={() => setPaymentPage((p) => Math.min(paymentTotalPages, p + 1))}
                    disabled={paymentPage === paymentTotalPages}
                    className="rounded-lg border border-slate-200 dark:border-slate-700 p-1.5 transition hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
          )}

          {tab === 'balances' && (
          <>
          <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Total Collectibles
              </p>
              <p className="mt-2 text-2xl font-semibold text-slate-900 dark:text-white">
                {balancesLoading ? '—' : peso(balanceTotals.collectibles)}
              </p>
              <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
                {balanceTotals.total} fee{balanceTotals.total === 1 ? '' : 's'} ·{' '}
                {balanceYearFilter === 'ALL' ? 'All school years' : balanceYearFilter} ·{' '}
                {balanceSemFilter === 'ALL' ? 'Both semesters' : semesterLabel(balanceSemFilter)}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Collected</p>
              <p className="mt-2 text-2xl font-semibold text-emerald-600 dark:text-emerald-400">
                {balancesLoading ? '—' : peso(balanceTotals.collected)}
              </p>
              <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
                {balanceTotals.rate}% collected · {balanceTotals.paidCount} fully paid
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Not Yet Collected
              </p>
              <p className="mt-2 text-2xl font-semibold text-rose-600 dark:text-rose-400">
                {balancesLoading ? '—' : peso(balanceTotals.notCollected)}
              </p>
              <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
                {balanceTotals.total - balanceTotals.paidCount} unsettled fee
                {balanceTotals.total - balanceTotals.paidCount === 1 ? '' : 's'}
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
            <div className="space-y-3 border-b border-slate-100 dark:border-slate-800 p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm text-slate-500 dark:text-slate-400">Record a payment directly - e.g. cash paid in person.</p>
                <button
                  onClick={openAddBalance}
                  className="flex shrink-0 items-center gap-1.5 rounded-lg bg-sky-600 px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-sky-700"
                >
                  <Plus className="h-4 w-4" />
                  Add Balance
                </button>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
                  <span>Show</span>
                  <select
                    value={balancePageSize}
                    onChange={(e) => setBalancePageSize(Number(e.target.value))}
                    className="rounded-lg border border-slate-200 dark:border-slate-700 px-2 py-1.5 text-sm text-slate-700 dark:text-slate-300 focus:border-sky-500 focus:outline-none"
                  >
                    <option value={10}>10</option>
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                  </select>
                  <span>entries</span>
                </div>

                <div className="relative w-full sm:w-64">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
                  <input
                    type="text"
                    value={balanceSearch}
                    onChange={(e) => setBalanceSearch(e.target.value)}
                    placeholder="Search name or Student ID..."
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 py-2 pl-9 pr-3 text-sm text-slate-900 dark:text-white transition focus:border-sky-500 focus:bg-white dark:focus:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
                  />
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <select
                  value={balanceStatusFilter}
                  onChange={(e) => setBalanceStatusFilter(e.target.value)}
                  className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 focus:border-sky-500 focus:outline-none"
                >
                  <option value="ALL">All Statuses</option>
                  <option value="PAID">Paid</option>
                  <option value="PARTIAL">Partial</option>
                  <option value="UNPAID">Unpaid</option>
                </select>
                <select
                  value={balanceYearFilter}
                  onChange={(e) => setBalanceYearFilter(e.target.value)}
                  className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 focus:border-sky-500 focus:outline-none"
                >
                  <option value="ALL">All School Years</option>
                  {balanceYears.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
                <select
                  value={balanceSemFilter}
                  onChange={(e) => setBalanceSemFilter(e.target.value)}
                  className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 focus:border-sky-500 focus:outline-none"
                >
                  <option value="ALL">Both Semesters</option>
                  <option value="1ST">1st Sem</option>
                  <option value="2ND">2nd Sem</option>
                </select>
              </div>
            </div>

            {balancesLoading ? (
              <div className="space-y-3 p-5">
                <div className="h-4 w-full animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
                <div className="h-4 w-full animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
                <div className="h-4 w-2/3 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
              </div>
            ) : filteredBalances.length === 0 ? (
              <EmptyState
                title={balances.length === 0 ? 'No membership dues on record yet.' : 'No balances match these filters.'}
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-left text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
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
                    {pagedBalances.map((row) => (
                      <tr key={row.fee_id} className="border-b border-slate-50 dark:border-slate-800/60 last:border-0">
                        <td className="px-5 py-3">
                          <p className="font-medium text-slate-900 dark:text-white">{row.student_name}</p>
                          <p className="text-xs text-slate-400 dark:text-slate-500">{row.student_id}</p>
                        </td>
                        <td className="px-5 py-3 text-slate-700 dark:text-slate-300">
                          {semesterLabel(row.semester)} {row.school_year}
                        </td>
                        <td className="px-5 py-3 text-slate-700 dark:text-slate-300">{peso(row.amount_due)}</td>
                        <td className="px-5 py-3 text-slate-700 dark:text-slate-300">{peso(row.amount_paid)}</td>
                        <td className="px-5 py-3 font-medium text-slate-900 dark:text-white">{peso(row.balance)}</td>
                        <td className="px-5 py-3">
                          {row.status === 'PAID' ? (
                            <span className="rounded-full bg-emerald-50 dark:bg-emerald-950/40 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                              Paid
                            </span>
                          ) : row.status === 'PARTIAL' ? (
                            <span className="rounded-full bg-amber-50 dark:bg-amber-950/40 px-2.5 py-1 text-xs font-medium text-amber-700 dark:text-amber-400">
                              Partial
                            </span>
                          ) : (
                            <span className="rounded-full bg-rose-50 dark:bg-rose-950/40 px-2.5 py-1 text-xs font-medium text-rose-700 dark:text-rose-400">
                              Unpaid
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-3 text-right">
                          {row.status === 'PAID' ? (
                            <span className="text-xs text-slate-400 dark:text-slate-500">—</span>
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

            {!balancesLoading && filteredBalances.length > 0 && (
              <div className="flex items-center justify-between border-t border-slate-100 dark:border-slate-800 px-5 py-3 text-sm text-slate-500 dark:text-slate-400">
                <span>
                  Showing {(balancePage - 1) * balancePageSize + 1}–
                  {Math.min(balancePage * balancePageSize, filteredBalances.length)} of{' '}
                  {filteredBalances.length}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setBalancePage((p) => Math.max(1, p - 1))}
                    disabled={balancePage === 1}
                    className="rounded-lg border border-slate-200 dark:border-slate-700 p-1.5 transition hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <span className="rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-medium text-white">
                    {balancePage}
                  </span>
                  <button
                    onClick={() => setBalancePage((p) => Math.min(balanceTotalPages, p + 1))}
                    disabled={balancePage === balanceTotalPages}
                    className="rounded-lg border border-slate-200 dark:border-slate-700 p-1.5 transition hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
          </>
          )}
        </main>
      </div>

      {recordFor && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
          onClick={() => setRecordFor(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Record Payment</h3>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              {recordFor.student_name} · {semesterLabel(recordFor.semester)} {recordFor.school_year} · Balance:{' '}
              {peso(recordFor.balance)}
            </p>

            <div className="mt-4 space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">Amount</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={recordAmount}
                  onChange={(e) => setRecordAmount(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white transition focus:border-sky-500 focus:bg-white dark:focus:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">Note (optional)</label>
                <input
                  type="text"
                  value={recordNote}
                  onChange={(e) => setRecordNote(e.target.value)}
                  placeholder="e.g. Cash paid in person"
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white transition focus:border-sky-500 focus:bg-white dark:focus:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
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
              className="mt-3 w-full rounded-lg border border-slate-200 dark:border-slate-700 py-2 text-sm font-semibold text-slate-600 dark:text-slate-300 transition hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {addBalanceOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
          onClick={() => setAddBalanceOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Add Balance</h3>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Assess a new membership due for a student, e.g. a late enrollee with no fee on record yet.
            </p>

            <div className="mt-4 space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">Student</label>
                <select
                  value={newBalanceStudentId}
                  onChange={(e) => setNewBalanceStudentId(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white transition focus:border-sky-500 focus:bg-white dark:focus:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
                >
                  <option value="">Select a student...</option>
                  {studentOptions.map((s) => (
                    <option key={s.student_id} value={s.student_id}>
                      {s.last_name}, {s.first_name} ({s.student_id})
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">School Year</label>
                  <select
                    value={newBalanceSchoolYearId}
                    onChange={(e) => setNewBalanceSchoolYearId(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white transition focus:border-sky-500 focus:bg-white dark:focus:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
                  >
                    <option value="">Select...</option>
                    {schoolYearOptions.map((y) => (
                      <option key={y.id} value={y.id}>
                        {y.label}
                        {y.is_active ? ' (active)' : ''}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">Semester</label>
                  <select
                    value={newBalanceSemester}
                    onChange={(e) => setNewBalanceSemester(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white transition focus:border-sky-500 focus:bg-white dark:focus:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
                  >
                    <option value="1ST">1st Sem</option>
                    <option value="2ND">2nd Sem</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">Amount Due</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={newBalanceAmount}
                  onChange={(e) => setNewBalanceAmount(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white transition focus:border-sky-500 focus:bg-white dark:focus:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
                />
              </div>
              <button
                onClick={handleCreateBalance}
                disabled={addingBalance}
                className="w-full rounded-lg bg-sky-600 py-2 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:opacity-50"
              >
                {addingBalance ? 'Adding...' : 'Add Balance'}
              </button>
            </div>

            <button
              onClick={() => setAddBalanceOpen(false)}
              className="mt-3 w-full rounded-lg border border-slate-200 dark:border-slate-700 py-2 text-sm font-semibold text-slate-600 dark:text-slate-300 transition hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
