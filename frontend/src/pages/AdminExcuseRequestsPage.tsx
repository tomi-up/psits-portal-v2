import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, X, RefreshCw } from 'lucide-react'
import { notify } from '@/lib/toast'
import { confirmAction, confirmActionWithReason } from '@/lib/confirm'
import Sidebar, { MobileMenuButton } from '@/components/Sidebar'
import AdminProfileMenu from '@/components/AdminProfileMenu'
import { getAdminSidebarItems } from '@/lib/adminNav'
import EmptyState from '@/components/EmptyState'
import { adminFetch } from '@/lib/adminAuth'
import { API } from '@/lib/apiBase'

interface ExcuseRequestRow {
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

const REJECTION_REASONS = [
  'Reason does not justify absence',
  'Insufficient details provided',
  'Request submitted too late',
  'Conflicts with organization policy',
  'Other',
]

export default function AdminExcuseRequestsPage() {
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)
  const [requests, setRequests] = useState<ExcuseRequestRow[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('PENDING')
  const [actingOn, setActingOn] = useState<string | null>(null)

  useEffect(() => {
    void loadRequests()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter])

  async function loadRequests(isRefresh = false) {
    if (isRefresh) setRefreshing(true)
    else setLoading(true)
    try {
      const query = statusFilter === 'ALL' ? '' : `?status_filter=${statusFilter}`
      const res = await adminFetch(`${API}/officer/excuse-requests/${query}`)
      if (res.ok) setRequests((await res.json()).requests)
    } catch {
      notify.error('Network error', 'Could not load excuse requests.')
    } finally {
      if (isRefresh) setRefreshing(false)
      else setLoading(false)
    }
  }

  async function handleApprove(req: ExcuseRequestRow) {
    const confirmed = await confirmAction({
      title: `Approve ${req.student_name}'s request?`,
      text: `They'll be marked EXCUSED for "${req.event_name}".`,
      confirmText: 'Approve',
    })
    if (!confirmed) return

    setActingOn(req.id)
    try {
      const res = await adminFetch(`${API}/officer/excuse-requests/${req.id}/approve`, { method: 'PUT' })
      if (!res.ok) {
        const err = await res.json()
        notify.error('Could not approve', err.detail || 'Please try again.')
        return
      }
      notify.success('Approved', `${req.student_name} is now excused from ${req.event_name}.`)
      await loadRequests()
    } catch {
      notify.error('Network error', 'Could not reach the server.')
    } finally {
      setActingOn(null)
    }
  }

  async function handleReject(req: ExcuseRequestRow) {
    const reason = await confirmActionWithReason({
      title: `Reject ${req.student_name}'s request?`,
      text: 'Select a reason - this will be shown to the student.',
      confirmText: 'Reject',
      reasons: REJECTION_REASONS,
    })
    if (!reason) return

    setActingOn(req.id)
    try {
      const res = await adminFetch(`${API}/officer/excuse-requests/${req.id}/reject`, {
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
      await loadRequests()
    } catch {
      notify.error('Network error', 'Could not reach the server.')
    } finally {
      setActingOn(null)
    }
  }

  const sorted = useMemo(
    () => [...requests].sort((a, b) => b.created_at.localeCompare(a.created_at)),
    [requests]
  )

  return (
    <div className="min-h-screen bg-slate-50 font-sans">
      <Sidebar
        title="PSITS Admin"
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        items={getAdminSidebarItems('excuse-requests', navigate, () => navigate('/admin/events'))}
      />

      <div className="lg:pl-64">
        <header className="flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-6 py-4 lg:px-10">
          <div className="flex items-center gap-3">
            <MobileMenuButton onClick={() => setMenuOpen(true)} />
            <div>
              <h1 className="text-lg font-semibold text-slate-900">Excuse Requests</h1>
              <p className="text-sm text-slate-500">Review student requests to be excused from required events</p>
            </div>
          </div>
          <AdminProfileMenu />
        </header>

        <main className="px-6 py-8 lg:px-10">
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
                onClick={() => loadRequests(true)}
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
                title={
                  statusFilter === 'PENDING' ? 'No pending excuse requests.' : 'No excuse requests have been submitted.'
                }
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-slate-100 bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-5 py-3">Student</th>
                      <th className="px-5 py-3">Event</th>
                      <th className="px-5 py-3">Reason</th>
                      <th className="px-5 py-3">Submitted</th>
                      <th className="px-5 py-3">Status</th>
                      <th className="px-5 py-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sorted.map((req) => (
                      <tr key={req.id} className="border-b border-slate-50 last:border-0">
                        <td className="px-5 py-3">
                          <p className="font-medium text-slate-900">{req.student_name}</p>
                          <p className="text-xs text-slate-400">{req.student_id}</p>
                        </td>
                        <td className="px-5 py-3 text-slate-700">{req.event_name}</td>
                        <td className="max-w-xs px-5 py-3 text-slate-600">
                          <p className="line-clamp-2">{req.reason}</p>
                        </td>
                        <td className="px-5 py-3 text-slate-500">
                          {new Date(req.created_at).toLocaleDateString(undefined, { dateStyle: 'medium' })}
                        </td>
                        <td className="px-5 py-3">
                          {req.status === 'PENDING' ? (
                            <span className="rounded-full bg-sky-50 px-2.5 py-1 text-xs font-medium text-sky-700">
                              Pending
                            </span>
                          ) : req.status === 'APPROVED' ? (
                            <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-700">
                              Approved
                            </span>
                          ) : (
                            <span className="rounded-full bg-rose-50 px-2.5 py-1 text-xs font-medium text-rose-700">
                              Rejected
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-3">
                          {req.status === 'PENDING' ? (
                            <div className="flex items-center justify-end gap-2">
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
                            <div className="text-right text-xs text-slate-400">
                              {req.reviewed_at && (
                                <p>{new Date(req.reviewed_at).toLocaleDateString(undefined, { dateStyle: 'medium' })}</p>
                              )}
                              {req.rejection_reason && (
                                <p className="mt-0.5 italic text-rose-500">{req.rejection_reason}</p>
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
        </main>
      </div>
    </div>
  )
}
