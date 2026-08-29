import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, X, RefreshCw, Plus } from 'lucide-react'
import { notify } from '@/lib/toast'
import { confirmAction, confirmActionWithReason } from '@/lib/confirm'
import Sidebar, { MobileMenuButton } from '@/components/Sidebar'
import AdminProfileMenu from '@/components/AdminProfileMenu'
import { getAdminSidebarItems } from '@/lib/adminNav'
import EmptyState from '@/components/EmptyState'
import { adminFetch } from '@/lib/adminAuth'
import { API } from '@/lib/apiBase'

interface SettlementRow {
  id: string
  student_id: string
  student_name: string
  resolution_type: 'COMMUNITY_SERVICE' | 'DONATION'
  sanctions_count: number
  donation_item: string | null
  donation_label: string | null
  donation_quantity: number | null
  community_service_hours_required: number | null
  community_service_hours_logged: number | null
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'COMPLETED'
  rejection_reason: string | null
  created_at: string
  reviewed_at: string | null
}

type StatusFilter = 'PENDING' | 'ALL'

const REJECTION_REASONS = [
  'Item not received',
  'Wrong quantity',
  'Wrong item',
  'Item condition unacceptable',
  'Other',
]

export default function AdminSanctionsPage() {
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)
  const [settlements, setSettlements] = useState<SettlementRow[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('PENDING')
  const [actingOn, setActingOn] = useState<string | null>(null)
  const [hoursInput, setHoursInput] = useState<Record<string, string>>({})

  useEffect(() => {
    void loadSettlements()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter])

  async function loadSettlements(isRefresh = false) {
    if (isRefresh) setRefreshing(true)
    else setLoading(true)
    try {
      const query = statusFilter === 'ALL' ? '' : `?status_filter=${statusFilter}`
      const res = await adminFetch(`${API}/officer/sanctions/${query}`)
      if (res.ok) setSettlements((await res.json()).settlements)
    } catch {
      notify.error('Network error', 'Could not load sanctions.')
    } finally {
      if (isRefresh) setRefreshing(false)
      else setLoading(false)
    }
  }

  async function handleApprove(s: SettlementRow) {
    const confirmed = await confirmAction({
      title: `Confirm ${s.student_name}'s donation received?`,
      text: `${s.donation_quantity}x ${s.donation_label}. This clears ${s.sanctions_count} sanction(s).`,
      confirmText: 'Confirm Received',
    })
    if (!confirmed) return

    setActingOn(s.id)
    try {
      const res = await adminFetch(`${API}/officer/sanctions/${s.id}/approve`, { method: 'PUT' })
      if (!res.ok) {
        const err = await res.json()
        notify.error('Could not approve', err.detail || 'Please try again.')
        return
      }
      notify.success('Confirmed', `${s.student_name}'s sanction has been cleared.`)
      await loadSettlements()
    } catch {
      notify.error('Network error', 'Could not reach the server.')
    } finally {
      setActingOn(null)
    }
  }

  async function handleReject(s: SettlementRow) {
    const reason = await confirmActionWithReason({
      title: `Reject ${s.student_name}'s donation?`,
      text: 'Select a reason - this will be shown to the student.',
      confirmText: 'Reject',
      reasons: REJECTION_REASONS,
    })
    if (!reason) return

    setActingOn(s.id)
    try {
      const res = await adminFetch(`${API}/officer/sanctions/${s.id}/reject`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      })
      if (!res.ok) {
        const err = await res.json()
        notify.error('Could not reject', err.detail || 'Please try again.')
        return
      }
      notify.success('Rejected', `${s.student_name} can submit a new settlement.`)
      await loadSettlements()
    } catch {
      notify.error('Network error', 'Could not reach the server.')
    } finally {
      setActingOn(null)
    }
  }

  async function handleLogHours(s: SettlementRow) {
    const hours = Number(hoursInput[s.id])
    if (!hours || hours <= 0) {
      notify.error('Invalid hours', 'Enter how many hours were completed.')
      return
    }

    setActingOn(s.id)
    try {
      const res = await adminFetch(`${API}/officer/sanctions/${s.id}/log-hours`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hours }),
      })
      if (!res.ok) {
        const err = await res.json()
        notify.error('Could not log hours', err.detail || 'Please try again.')
        return
      }
      const result = await res.json()
      setHoursInput((prev) => ({ ...prev, [s.id]: '' }))
      notify.success(
        result.status === 'COMPLETED' ? 'Completed' : 'Logged',
        result.status === 'COMPLETED'
          ? `${s.student_name} has completed their community service.`
          : `${hours} hour(s) logged for ${s.student_name}.`
      )
      await loadSettlements()
    } catch {
      notify.error('Network error', 'Could not reach the server.')
    } finally {
      setActingOn(null)
    }
  }

  const sorted = useMemo(
    () => [...settlements].sort((a, b) => b.created_at.localeCompare(a.created_at)),
    [settlements]
  )

  return (
    <div className="min-h-screen bg-slate-50 font-sans">
      <Sidebar
        title="PSITS Admin"
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        items={getAdminSidebarItems('sanctions', navigate, () => navigate('/admin/events'))}
      />

      <div className="lg:pl-64">
        <header className="flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-6 py-4 lg:px-10">
          <div className="flex items-center gap-3">
            <MobileMenuButton onClick={() => setMenuOpen(true)} />
            <div>
              <h1 className="text-lg font-semibold text-slate-900">Sanctions</h1>
              <p className="text-sm text-slate-500">Review donation submissions and log community service hours</p>
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
                onClick={() => loadSettlements(true)}
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
              </div>
            ) : sorted.length === 0 ? (
              <EmptyState
                title={statusFilter === 'PENDING' ? 'No pending sanctions.' : 'No sanction settlements yet.'}
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-slate-100 bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-5 py-3">Student</th>
                      <th className="px-5 py-3">Type</th>
                      <th className="px-5 py-3">Details</th>
                      <th className="px-5 py-3">Status</th>
                      <th className="px-5 py-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sorted.map((s) => (
                      <tr key={s.id} className="border-b border-slate-50 last:border-0">
                        <td className="px-5 py-3">
                          <p className="font-medium text-slate-900">{s.student_name}</p>
                          <p className="text-xs text-slate-400">{s.student_id}</p>
                        </td>
                        <td className="px-5 py-3 text-slate-700">
                          {s.resolution_type === 'DONATION' ? 'Donation' : 'Community Service'}
                        </td>
                        <td className="px-5 py-3 text-slate-600">
                          {s.resolution_type === 'DONATION' ? (
                            <span>
                              {s.donation_quantity}x {s.donation_label}
                            </span>
                          ) : (
                            <div className="w-40">
                              <p className="text-xs">
                                {s.community_service_hours_logged ?? 0} / {s.community_service_hours_required} hrs
                              </p>
                              <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                                <div
                                  className="h-full rounded-full bg-sky-600"
                                  style={{
                                    width: `${Math.min(
                                      100,
                                      ((s.community_service_hours_logged ?? 0) /
                                        (s.community_service_hours_required ?? 1)) *
                                        100
                                    )}%`,
                                  }}
                                />
                              </div>
                            </div>
                          )}
                        </td>
                        <td className="px-5 py-3">
                          {s.status === 'PENDING' ? (
                            <span className="rounded-full bg-sky-50 px-2.5 py-1 text-xs font-medium text-sky-700">
                              Pending
                            </span>
                          ) : s.status === 'APPROVED' || s.status === 'COMPLETED' ? (
                            <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
                              {s.status === 'COMPLETED' ? 'Completed' : 'Approved'}
                            </span>
                          ) : (
                            <span className="rounded-full bg-rose-50 px-2.5 py-1 text-xs font-medium text-rose-700">
                              Rejected
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-3">
                          {s.status === 'PENDING' && s.resolution_type === 'DONATION' ? (
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={() => handleApprove(s)}
                                disabled={actingOn === s.id}
                                title="Confirm received"
                                className="rounded-lg bg-emerald-600 p-2 text-white transition hover:bg-emerald-700 disabled:opacity-50"
                              >
                                <Check className="h-3.5 w-3.5" />
                              </button>
                              <button
                                onClick={() => handleReject(s)}
                                disabled={actingOn === s.id}
                                title="Reject"
                                className="rounded-lg bg-rose-600 p-2 text-white transition hover:bg-rose-700 disabled:opacity-50"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          ) : s.status === 'PENDING' && s.resolution_type === 'COMMUNITY_SERVICE' ? (
                            <div className="flex items-center justify-end gap-2">
                              <input
                                type="number"
                                min="0"
                                step="0.5"
                                placeholder="hrs"
                                value={hoursInput[s.id] ?? ''}
                                onChange={(e) => setHoursInput((prev) => ({ ...prev, [s.id]: e.target.value }))}
                                className="w-20 rounded-lg border border-slate-200 px-2 py-1.5 text-xs focus:border-sky-500 focus:outline-none"
                              />
                              <button
                                onClick={() => handleLogHours(s)}
                                disabled={actingOn === s.id}
                                title="Log hours"
                                className="inline-flex items-center gap-1 rounded-lg bg-sky-600 px-2.5 py-1.5 text-xs font-semibold text-white transition hover:bg-sky-700 disabled:opacity-50"
                              >
                                <Plus className="h-3 w-3" />
                                Log
                              </button>
                            </div>
                          ) : (
                            <div className="text-right text-xs text-slate-400">
                              {s.reviewed_at && (
                                <p>{new Date(s.reviewed_at).toLocaleDateString(undefined, { dateStyle: 'medium' })}</p>
                              )}
                              {s.rejection_reason && (
                                <p className="mt-0.5 italic text-rose-500">{s.rejection_reason}</p>
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
