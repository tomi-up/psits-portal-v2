import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Check, Eye, X } from 'lucide-react'
import { notify } from '@/lib/toast'
import { confirmAction, confirmActionWithReason } from '@/lib/confirm'
import Sidebar, { MobileMenuButton } from '@/components/Sidebar'
import AdminProfileMenu from '@/components/AdminProfileMenu'
import { getAdminSidebarItems } from '@/lib/adminNav'
import EmptyState from '@/components/EmptyState'
import { adminFetch } from '@/lib/adminAuth'
import { API } from '@/lib/apiBase'

/** Both queues below share this exact shape - a student submits a reason,
 * an admin approves or rejects it. */
interface ReviewRow {
  id: string
  event_id: string
  event_name: string
  student_id: string
  student_name: string
  reason: string
  status: 'PENDING' | 'APPROVED' | 'REJECTED'
  created_at: string
  reviewed_at: string | null
  rejection_reason: string | null
}

type StatusFilter = 'PENDING' | 'ALL'
type PageTab = 'excuse' | 'attendance-review'

const EXCUSE_REJECTION_REASONS = [
  'Reason does not justify absence',
  'Insufficient details provided',
  'Request submitted too late',
  'Conflicts with organization policy',
  'Other',
]

const ATTENDANCE_REVIEW_REJECTION_REASONS = [
  'Explanation does not account for the missing scan',
  'Insufficient details provided',
  'Request submitted too late',
  'Other',
]

export default function AdminExcuseRequestsPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [menuOpen, setMenuOpen] = useState(false)
  const tab: PageTab = searchParams.get('tab') === 'attendance-review' ? 'attendance-review' : 'excuse'

  const [excuseRequests, setExcuseRequests] = useState<ReviewRow[]>([])
  const [reviewRequests, setReviewRequests] = useState<ReviewRow[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('PENDING')
  const [actingOn, setActingOn] = useState<string | null>(null)
  const [viewing, setViewing] = useState<ReviewRow | null>(null)

  const endpoint = tab === 'excuse' ? 'excuse-requests' : 'attendance-reviews'

  function selectTab(nextTab: PageTab) {
    const nextParams = new URLSearchParams(searchParams)
    if (nextTab === 'attendance-review') nextParams.set('tab', nextTab)
    else nextParams.delete('tab')
    setSearchParams(nextParams)
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, statusFilter])

  async function load(isRefresh = false) {
    if (isRefresh) setRefreshing(true)
    else setLoading(true)
    try {
      const query = statusFilter === 'ALL' ? '' : `?status_filter=${statusFilter}`
      const res = await adminFetch(`${API}/officer/${endpoint}/${query}`)
      if (res.ok) {
        const requests = (await res.json()).requests
        if (tab === 'excuse') setExcuseRequests(requests)
        else setReviewRequests(requests)
      }
    } catch {
      notify.error('Network error', 'Could not load requests.')
    } finally {
      if (isRefresh) setRefreshing(false)
      else setLoading(false)
    }
  }

  async function handleApprove(req: ReviewRow) {
    const confirmed = await confirmAction({
      title: `Approve ${req.student_name}'s request?`,
      text:
        tab === 'excuse'
          ? `They'll be marked EXCUSED for "${req.event_name}".`
          : `Their attendance for "${req.event_name}" will be marked PRESENT.`,
      confirmText: 'Approve',
    })
    if (!confirmed) return

    setActingOn(req.id)
    try {
      const res = await adminFetch(`${API}/officer/${endpoint}/${req.id}/approve`, { method: 'PUT' })
      if (!res.ok) {
        const err = await res.json()
        notify.error('Could not approve', err.detail || 'Please try again.')
        return
      }
      notify.success(
        'Approved',
        tab === 'excuse'
          ? `${req.student_name} is now excused from ${req.event_name}.`
          : `${req.student_name} is now marked PRESENT for ${req.event_name}.`
      )
      await load()
    } catch {
      notify.error('Network error', 'Could not reach the server.')
    } finally {
      setActingOn(null)
    }
  }

  async function handleReject(req: ReviewRow) {
    const reason = await confirmActionWithReason({
      title: `Reject ${req.student_name}'s request?`,
      text: 'Select a reason - this will be shown to the student.',
      confirmText: 'Reject',
      reasons: tab === 'excuse' ? EXCUSE_REJECTION_REASONS : ATTENDANCE_REVIEW_REJECTION_REASONS,
    })
    if (!reason) return

    setActingOn(req.id)
    try {
      const res = await adminFetch(`${API}/officer/${endpoint}/${req.id}/reject`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      })
      if (!res.ok) {
        const err = await res.json()
        notify.error('Could not reject', err.detail || 'Please try again.')
        return
      }
      notify.success('Rejected', `${req.student_name}'s request has been rejected.`)
      await load()
    } catch {
      notify.error('Network error', 'Could not reach the server.')
    } finally {
      setActingOn(null)
    }
  }

  const rows = tab === 'excuse' ? excuseRequests : reviewRequests
  const sorted = useMemo(
    () => [...rows].sort((a, b) => b.created_at.localeCompare(a.created_at)),
    [rows]
  )

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 font-sans">
      <Sidebar
        title="PSITS Admin"
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        items={getAdminSidebarItems('excuse-requests', navigate, () => navigate('/admin/events'))}
      />

      <div className="lg:pl-64">
        <header className="flex items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-6 py-4 lg:px-10">
          <div className="flex items-center gap-3">
            <MobileMenuButton onClick={() => setMenuOpen(true)} />
            <div>
              <h1 className="text-lg font-semibold text-slate-900 dark:text-white">Review Requests</h1>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Excuse requests and attendance-review explanations submitted by students
              </p>
            </div>
          </div>
          <AdminProfileMenu
            onRefresh={() => load(true)}
            refreshing={refreshing}
            refreshDisabled={loading}
          />
        </header>

        <main className="px-6 py-8 lg:px-10">
          <div className="mb-4 flex gap-2">
            <button
              onClick={() => selectTab('excuse')}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                tab === 'excuse'
                  ? 'bg-slate-900 text-white dark:bg-sky-600'
                  : 'border border-slate-300 bg-white text-slate-700 shadow-sm hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:shadow-none dark:hover:bg-slate-700'
              }`}
            >
              Excuse Requests
            </button>
            <button
              onClick={() => selectTab('attendance-review')}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                tab === 'attendance-review'
                  ? 'bg-slate-900 text-white dark:bg-sky-600'
                  : 'border border-slate-300 bg-white text-slate-700 shadow-sm hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:shadow-none dark:hover:bg-slate-700'
              }`}
            >
              Attendance Reviews
            </button>
          </div>

          <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
            <div className="flex items-center gap-3 border-b border-slate-100 dark:border-slate-800 p-4">
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
            </div>

            {loading ? (
              <div className="space-y-3 p-5">
                <div className="h-4 w-full animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
                <div className="h-4 w-full animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
                <div className="h-4 w-2/3 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
              </div>
            ) : sorted.length === 0 ? (
              <EmptyState
                title={
                  statusFilter === 'PENDING'
                    ? tab === 'excuse'
                      ? 'No pending excuse requests.'
                      : 'No pending attendance reviews.'
                    : tab === 'excuse'
                      ? 'No excuse requests have been submitted.'
                      : 'No attendance reviews have been submitted.'
                }
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[960px] table-fixed text-sm">
                  <thead className="border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-left text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    <tr>
                      <th className="w-[18%] px-5 py-3">Student</th>
                      <th className="w-[17%] px-5 py-3">Event</th>
                      <th className="w-[24%] px-5 py-3">Reason</th>
                      <th className="w-[13%] px-5 py-3">Submitted</th>
                      <th className="w-[11%] px-5 py-3">Status</th>
                      <th className="w-[17%] px-5 py-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sorted.map((req) => (
                      <tr key={req.id} className="border-b border-slate-50 dark:border-slate-800/60 last:border-0">
                        <td className="px-5 py-3">
                          <p className="truncate font-medium text-slate-900 dark:text-white">{req.student_name}</p>
                          <p className="text-xs text-slate-400 dark:text-slate-500">{req.student_id}</p>
                        </td>
                        <td className="px-5 py-3 text-slate-700 dark:text-slate-300">
                          <p className="truncate" title={req.event_name}>{req.event_name}</p>
                        </td>
                        <td className="px-5 py-3 text-slate-600 dark:text-slate-300">
                          <p className="line-clamp-2 break-words">{req.reason}</p>
                        </td>
                        <td className="px-5 py-3 text-slate-500 dark:text-slate-400">
                          {new Date(req.created_at).toLocaleDateString(undefined, { dateStyle: 'medium' })}
                        </td>
                        <td className="px-5 py-3">
                          {req.status === 'PENDING' ? (
                            <span className="rounded-full bg-sky-50 dark:bg-sky-950/40 px-2.5 py-1 text-xs font-medium text-sky-700 dark:text-sky-400">
                              Pending
                            </span>
                          ) : req.status === 'APPROVED' ? (
                            <span className="rounded-full bg-indigo-50 dark:bg-indigo-950/40 px-2.5 py-1 text-xs font-medium text-indigo-700 dark:text-indigo-400">
                              Approved
                            </span>
                          ) : (
                            <span className="rounded-full bg-rose-50 dark:bg-rose-950/40 px-2.5 py-1 text-xs font-medium text-rose-700 dark:text-rose-400">
                              Rejected
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-3">
                          {req.status === 'PENDING' ? (
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={() => setViewing(req)}
                                title="View request"
                                aria-label={`View ${req.student_name}'s request`}
                                className="rounded-lg border border-slate-200 bg-white p-2 text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                              >
                                <Eye className="h-3.5 w-3.5" />
                              </button>
                              <button
                                onClick={() => handleApprove(req)}
                                disabled={actingOn === req.id}
                                title="Approve"
                                className="rounded-lg bg-emerald-600 p-2 text-white transition hover:bg-emerald-700 disabled:opacity-50"
                              >
                                <Check className="h-3.5 w-3.5" />
                              </button>
                              <button
                                onClick={() => handleReject(req)}
                                disabled={actingOn === req.id}
                                title="Reject"
                                className="rounded-lg bg-rose-600 p-2 text-white transition hover:bg-rose-700 disabled:opacity-50"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center justify-end gap-2">
                              <span className="truncate text-xs text-slate-400 dark:text-slate-500">
                                {req.reviewed_at && new Date(req.reviewed_at).toLocaleDateString(undefined, { dateStyle: 'medium' })}
                              </span>
                              <button
                                onClick={() => setViewing(req)}
                                title="View request"
                                aria-label={`View ${req.student_name}'s request`}
                                className="shrink-0 rounded-lg border border-slate-200 bg-white p-2 text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                              >
                                <Eye className="h-3.5 w-3.5" />
                              </button>
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
        </main>
      </div>

      {viewing && <RequestDetailsModal request={viewing} onClose={() => setViewing(null)} />}
    </div>
  )
}

function RequestDetailsModal({ request, onClose }: { request: ReviewRow; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="request-details-title"
        className="w-full max-w-lg rounded-lg border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4 dark:border-slate-800">
          <div className="min-w-0">
            <h2 id="request-details-title" className="text-base font-semibold text-slate-900 dark:text-white">
              Request details
            </h2>
            <p className="mt-0.5 truncate text-sm text-slate-500 dark:text-slate-400">{request.event_name}</p>
          </div>
          <button
            onClick={onClose}
            title="Close"
            aria-label="Close request details"
            className="shrink-0 rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-5 px-5 py-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Detail label="Student" value={request.student_name} />
            <Detail label="Student ID" value={request.student_id} />
            <Detail
              label="Submitted"
              value={new Date(request.created_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
            />
            <Detail label="Status" value={request.status.charAt(0) + request.status.slice(1).toLowerCase()} />
          </div>

          <div>
            <p className="text-xs font-medium uppercase text-slate-500 dark:text-slate-400">Reason</p>
            <p className="mt-2 max-h-64 overflow-y-auto whitespace-pre-wrap break-words rounded-lg bg-slate-50 p-3 text-sm leading-6 text-slate-700 dark:bg-slate-800 dark:text-slate-200">
              {request.reason}
            </p>
          </div>

          {request.rejection_reason && (
            <div>
              <p className="text-xs font-medium uppercase text-rose-500 dark:text-rose-400">Rejection reason</p>
              <p className="mt-2 whitespace-pre-wrap break-words text-sm text-slate-700 dark:text-slate-200">
                {request.rejection_reason}
              </p>
            </div>
          )}
        </div>

        <div className="flex justify-end border-t border-slate-100 px-5 py-4 dark:border-slate-800">
          <button
            onClick={onClose}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700 dark:bg-sky-600 dark:hover:bg-sky-700"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-medium uppercase text-slate-500 dark:text-slate-400">{label}</p>
      <p className="mt-1 break-words text-sm font-medium text-slate-900 dark:text-white">{value}</p>
    </div>
  )
}
