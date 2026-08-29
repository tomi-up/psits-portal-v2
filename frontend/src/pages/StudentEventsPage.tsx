import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Search,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Eye,
  MapPin,
  AlertTriangle,
  QrCode,
  UserPlus,
  FileWarning,
  HelpCircle,
} from 'lucide-react'
import { notify } from '@/lib/toast'
import { confirmAction } from '@/lib/confirm'
import Sidebar from '@/components/Sidebar'
import StudentHeader from '@/components/StudentHeader'
import MigrationNotice from '@/components/MigrationNotice'
import QrCodeModal from '@/components/QrCodeModal'
import { getStudentSidebarItems } from '@/lib/studentNav'
import EmptyState from '@/components/EmptyState'
import { studentFetch } from '@/lib/studentAuth'
import { API } from '@/lib/apiBase'
import { startEventsTour, startEventsTourIfFirstVisit } from '@/lib/tour'

interface EventItem {
  id: string
  name: string
  venue: string | null
  description: string | null
  event_date: string | null
  attendance_required: boolean
  is_registered: boolean
  is_checked_in: boolean
  is_checked_out: boolean
  excuse_status: 'PENDING' | 'APPROVED' | 'REJECTED' | null
  excuse_rejection_reason: string | null
}

type SortKey = 'name' | 'event_date'
type StatusFilter = 'ALL' | 'NOT_REGISTERED' | 'REGISTERED' | 'CHECKED_IN' | 'PRESENT'

export default function StudentEventsPage() {
  const navigate = useNavigate()
  const [studentId, setStudentId] = useState<string | null>(null)
  const [studentName, setStudentName] = useState<string | null>(null)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [events, setEvents] = useState<EventItem[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [qrEvent, setQrEvent] = useState<EventItem | null>(null)
  const [viewEvent, setViewEvent] = useState<EventItem | null>(null)
  const [excuseEvent, setExcuseEvent] = useState<EventItem | null>(null)
  const [registering, setRegistering] = useState<string | null>(null)
  const [excusing, setExcusing] = useState(false)
  const [excuseReason, setExcuseReason] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL')
  const [pageSize, setPageSize] = useState(10)
  const [page, setPage] = useState(1)
  const [sortKey, setSortKey] = useState<SortKey>('event_date')
  const [sortAsc, setSortAsc] = useState(true)

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
    void loadEvents()
  }, [studentId])

  useEffect(() => {
    if (!loading && events.length > 0) startEventsTourIfFirstVisit()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, events])

  async function loadEvents(isRefresh = false) {
    if (isRefresh) setRefreshing(true)
    else setLoading(true)
    try {
      const res = await studentFetch(`${API}/events/`)
      if (res.ok) setEvents((await res.json()).events)
    } catch {
      notify.error('Network error', 'Could not load events.')
    } finally {
      if (isRefresh) setRefreshing(false)
      else setLoading(false)
    }
  }

  async function handleRegister(event: EventItem) {
    if (!studentId) return

    const confirmed = await confirmAction({
      title: `Register for ${event.name}?`,
      text: "You'll get a personal QR code to show an officer for check-in.",
      confirmText: 'Yes, register me',
    })
    if (!confirmed) return

    setRegistering(event.id)
    try {
      const res = await studentFetch(`${API}/events/${event.id}/register`, {
        method: 'POST',
      })
      if (!res.ok) {
        const err = await res.json()
        notify.error('Registration failed', err.detail)
        return
      }
      notify.success('Registered', `You're set for ${event.name}. Show your QR code to check in.`)
      await loadEvents()
    } catch {
      notify.error('Network error', 'Could not reach the server.')
    } finally {
      setRegistering(null)
    }
  }

  async function handleSubmitExcuse(event: EventItem) {
    if (!excuseReason.trim()) {
      notify.error('Reason required', 'Please explain why you need to be excused.')
      return
    }

    setExcusing(true)
    try {
      const res = await studentFetch(`${API}/events/${event.id}/excuse-request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: excuseReason.trim() }),
      })
      if (!res.ok) {
        const err = await res.json()
        notify.error('Could not submit', err.detail || 'Please try again.')
        return
      }
      notify.success('Submitted', 'Your excuse request is pending admin review.')
      setExcuseReason('')
      setExcuseEvent(null)
      await loadEvents()
    } catch {
      notify.error('Network error', 'Could not reach the server.')
    } finally {
      setExcusing(false)
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

  function statusOf(e: EventItem): StatusFilter {
    if (e.is_checked_out) return 'PRESENT'
    if (e.is_checked_in) return 'CHECKED_IN'
    if (e.is_registered) return 'REGISTERED'
    return 'NOT_REGISTERED'
  }

  const filtered = useMemo(() => {
    let rows = events

    const q = search.trim().toLowerCase()
    if (q) rows = rows.filter((e) => e.name.toLowerCase().includes(q))
    if (statusFilter !== 'ALL') rows = rows.filter((e) => statusOf(e) === statusFilter)

    rows = [...rows].sort((a, b) => {
      const cmp =
        sortKey === 'name' ? a.name.localeCompare(b.name) : (a.event_date ?? '').localeCompare(b.event_date ?? '')
      return sortAsc ? cmp : -cmp
    })

    return rows
  }, [events, search, statusFilter, sortKey, sortAsc])

  useEffect(() => {
    setPage(1)
  }, [search, statusFilter, pageSize])

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const paged = filtered.slice((page - 1) * pageSize, page * pageSize)

  // Tour anchors - tag only the first qualifying row so the tour has one
  // stable element to point at, regardless of how many rows exist.
  const firstRowId = paged[0]?.id
  const firstExcusableId = paged.find(
    (e) => e.attendance_required && !e.is_checked_out && e.excuse_status !== 'APPROVED'
  )?.id

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortAsc(!sortAsc)
    } else {
      setSortKey(key)
      setSortAsc(true)
    }
  }

  if (!studentId) return null

  return (
    <div className="min-h-screen bg-slate-50 font-sans dark:bg-slate-950">
      <MigrationNotice />
      <Sidebar
        title="PSITS Portal"
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        items={getStudentSidebarItems('events', navigate)}
      />

      <div className="lg:pl-64">
        <StudentHeader
          title="Events"
          subtitle="Register and manage your check-in QR code"
          onMenuOpen={() => setMenuOpen(true)}
          onMenuClose={() => setMenuOpen(false)}
          onRefresh={() => loadEvents(true)}
          refreshing={refreshing}
          loading={loading}
          studentName={studentName}
          avatarUrl={avatarUrl}
          onLogout={handleLogout}
        />

        <main className="px-6 py-8 lg:px-10">
          <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            {/* Toolbar */}
            <div className="space-y-3 border-b border-slate-100 p-4 dark:border-slate-800">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
                  <span>Show</span>
                  <select
                    value={pageSize}
                    onChange={(e) => setPageSize(Number(e.target.value))}
                    className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm text-slate-700 focus:border-sky-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                  >
                    <option value={10}>10</option>
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                  </select>
                  <span>entries</span>
                </div>

                <div className="relative w-full sm:w-64">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search events..."
                    className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm text-slate-900 transition focus:border-sky-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:bg-slate-800"
                  />
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                  className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-600 focus:border-sky-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                >
                  <option value="ALL">All Status</option>
                  <option value="NOT_REGISTERED">Not Registered</option>
                  <option value="REGISTERED">Registered</option>
                  <option value="CHECKED_IN">Checked In</option>
                  <option value="PRESENT">Present</option>
                </select>
                <button
                  onClick={startEventsTour}
                  title="Take a tour of this page"
                  className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  <HelpCircle className="h-3.5 w-3.5" />
                  How this works
                </button>
              </div>
            </div>

            {loading ? (
              <div className="space-y-3 p-5">
                <div className="h-4 w-full animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
                <div className="h-4 w-full animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
                <div className="h-4 w-2/3 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
              </div>
            ) : filtered.length === 0 ? (
              <EmptyState title={events.length === 0 ? 'No upcoming events.' : 'No events match these filters.'} />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-slate-100 bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-400">
                    <tr>
                      <th className="px-5 py-3">
                        <button
                          onClick={() => toggleSort('name')}
                          className="flex items-center gap-1 uppercase tracking-wide hover:text-slate-700 dark:hover:text-slate-200"
                        >
                          Event <ArrowUpDown className="h-3 w-3" />
                        </button>
                      </th>
                      <th className="px-5 py-3">
                        <button
                          onClick={() => toggleSort('event_date')}
                          className="flex items-center gap-1 uppercase tracking-wide hover:text-slate-700 dark:hover:text-slate-200"
                        >
                          Date <ArrowUpDown className="h-3 w-3" />
                        </button>
                      </th>
                      <th className="px-5 py-3">Time</th>
                      <th className="px-5 py-3">Attendance</th>
                      <th className="px-5 py-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paged.map((event) => (
                      <tr key={event.id} className="border-b border-slate-50 last:border-0 dark:border-slate-800/60">
                        <td className="px-5 py-3">
                          <p className="font-medium text-slate-900 dark:text-white">{event.name}</p>
                        </td>
                        <td className="px-5 py-3 text-slate-500 dark:text-slate-400">
                          {event.event_date
                            ? new Date(event.event_date).toLocaleDateString(undefined, {
                                dateStyle: 'medium',
                              })
                            : '—'}
                        </td>
                        <td className="px-5 py-3 text-slate-500 dark:text-slate-400">
                          {event.event_date
                            ? new Date(event.event_date).toLocaleTimeString(undefined, {
                                timeStyle: 'short',
                              })
                            : '—'}
                        </td>
                        <td className="px-5 py-3">
                          {event.attendance_required ? (
                            <span className="rounded-full bg-rose-50 px-2.5 py-1 text-xs font-medium text-rose-700 dark:bg-rose-950/40 dark:text-rose-400">
                              Required
                            </span>
                          ) : (
                            <span className="text-xs text-slate-400 dark:text-slate-500">Optional</span>
                          )}
                        </td>
                        <td className="px-5 py-3">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              id={event.id === firstRowId ? 'tour-events-view' : undefined}
                              onClick={() => setViewEvent(event)}
                              title="View details"
                              className="rounded-lg border border-slate-200 p-2 text-slate-500 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
                            >
                              <Eye className="h-3.5 w-3.5" />
                            </button>
                            {event.attendance_required &&
                              !event.is_checked_out &&
                              event.excuse_status !== 'APPROVED' && (
                                <button
                                  id={event.id === firstExcusableId ? 'tour-events-excuse' : undefined}
                                  onClick={() => setExcuseEvent(event)}
                                  title={
                                    event.excuse_status === 'PENDING'
                                      ? 'Excuse request pending'
                                      : event.excuse_status === 'REJECTED'
                                        ? 'Excuse request rejected - tap for details'
                                        : 'Request excuse'
                                  }
                                  className={`rounded-lg border p-2 transition ${
                                    event.excuse_status === 'PENDING'
                                      ? 'border-sky-200 bg-sky-50 text-sky-600 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-400'
                                      : event.excuse_status === 'REJECTED'
                                        ? 'border-rose-200 bg-rose-50 text-rose-600 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-400'
                                        : 'border-slate-200 text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800'
                                  }`}
                                >
                                  <FileWarning className="h-3.5 w-3.5" />
                                </button>
                              )}
                            {event.is_checked_out ? (
                              <span className="rounded-lg bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
                                ✓ Present
                              </span>
                            ) : event.excuse_status === 'APPROVED' ? (
                              <span className="rounded-lg bg-indigo-50 px-3 py-1.5 text-xs font-medium text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-400">
                                Excused
                              </span>
                            ) : event.is_registered ? (
                              <>
                                {event.is_checked_in && (
                                  <span className="text-xs font-medium text-sky-600 dark:text-sky-400">Checked in</span>
                                )}
                                <button
                                  id={event.id === firstRowId ? 'tour-events-action' : undefined}
                                  onClick={() => setQrEvent(event)}
                                  title="View QR Code"
                                  className="rounded-lg bg-sky-600 p-2 text-white transition hover:bg-sky-700"
                                >
                                  <QrCode className="h-3.5 w-3.5" />
                                </button>
                              </>
                            ) : (
                              <button
                                id={event.id === firstRowId ? 'tour-events-action' : undefined}
                                onClick={() => handleRegister(event)}
                                disabled={registering === event.id}
                                title={registering === event.id ? 'Registering...' : 'Register'}
                                className="rounded-lg bg-sky-600 p-2 text-white transition hover:bg-sky-700 disabled:opacity-50"
                              >
                                <UserPlus className={`h-3.5 w-3.5 ${registering === event.id ? 'animate-pulse' : ''}`} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {!loading && filtered.length > 0 && (
              <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3 text-sm text-slate-500 dark:border-slate-800 dark:text-slate-400">
                <span>
                  Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, filtered.length)} of{' '}
                  {filtered.length}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="rounded-lg border border-slate-200 p-1.5 transition hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:hover:bg-slate-800"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <span className="rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-medium text-white">{page}</span>
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="rounded-lg border border-slate-200 p-1.5 transition hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:hover:bg-slate-800"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </main>
      </div>

      {studentId && <QrCodeModal event={qrEvent} studentId={studentId} onClose={() => setQrEvent(null)} />}

      {viewEvent && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
          onClick={() => setViewEvent(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl dark:bg-slate-900"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">{viewEvent.name}</h3>

            <div className="mt-3 space-y-1.5 text-sm text-slate-500 dark:text-slate-400">
              {viewEvent.event_date && (
                <p>
                  {new Date(viewEvent.event_date).toLocaleString(undefined, {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  })}
                </p>
              )}
              {viewEvent.venue && (
                <p className="flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5" />
                  {viewEvent.venue}
                </p>
              )}
            </div>

            {viewEvent.description && (
              <p className="mt-4 whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-300">
                {viewEvent.description}
              </p>
            )}

            {viewEvent.attendance_required && !viewEvent.is_checked_out && (
              <div className="mt-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <p>
                  This is a required event. Not attending without a valid excuse may result in sanctions.
                </p>
              </div>
            )}

            <button
              onClick={() => setViewEvent(null)}
              className="mt-5 w-full rounded-lg border border-slate-200 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {excuseEvent && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
          onClick={() => {
            setExcuseEvent(null)
            setExcuseReason('')
          }}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl dark:bg-slate-900"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Request Excuse</h3>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{excuseEvent.name}</p>

            <div className="mt-4">
              {excuseEvent.excuse_status === 'PENDING' ? (
                <p className="rounded-xl bg-sky-50 p-3 text-center text-xs font-medium text-sky-700 dark:bg-sky-950/40 dark:text-sky-400">
                  Your excuse request is pending admin review.
                </p>
              ) : (
                <div className="space-y-2">
                  {excuseEvent.excuse_status === 'REJECTED' && (
                    <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-400">
                      <p className="font-medium">Your previous request was rejected.</p>
                      {excuseEvent.excuse_rejection_reason && (
                        <p className="mt-1">Reason: {excuseEvent.excuse_rejection_reason}</p>
                      )}
                      <p className="mt-1">You may submit a new request below.</p>
                    </div>
                  )}
                  <textarea
                    value={excuseReason}
                    onChange={(e) => setExcuseReason(e.target.value)}
                    placeholder="Explain why you can't attend..."
                    rows={3}
                    autoFocus
                    className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 transition focus:border-sky-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                  <button
                    onClick={() => handleSubmitExcuse(excuseEvent)}
                    disabled={excusing}
                    className="w-full rounded-lg bg-sky-600 py-2 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:opacity-50"
                  >
                    {excusing ? 'Submitting...' : 'Submit Request'}
                  </button>
                </div>
              )}
            </div>

            <button
              onClick={() => {
                setExcuseEvent(null)
                setExcuseReason('')
              }}
              className="mt-3 w-full rounded-lg border border-slate-200 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
