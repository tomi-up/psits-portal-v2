import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { QRCodeCanvas } from 'qrcode.react'
import { RefreshCw, Download, Search, ArrowUpDown, ChevronLeft, ChevronRight } from 'lucide-react'
import { notify } from '@/lib/toast'
import { confirmAction } from '@/lib/confirm'
import Sidebar, { MobileMenuButton } from '@/components/Sidebar'
import MigrationNotice from '@/components/MigrationNotice'
import { getStudentSidebarItems } from '@/lib/studentNav'
import EmptyState from '@/components/EmptyState'
import { studentFetch } from '@/lib/studentAuth'
import { API } from '@/lib/apiBase'

interface EventItem {
  id: string
  name: string
  description: string | null
  event_date: string | null
  attendance_required: boolean
  is_registered: boolean
  is_checked_in: boolean
  is_checked_out: boolean
}

type SortKey = 'name' | 'event_date'
type StatusFilter = 'ALL' | 'NOT_REGISTERED' | 'REGISTERED' | 'CHECKED_IN' | 'PRESENT'

export default function StudentEventsPage() {
  const navigate = useNavigate()
  const [studentId, setStudentId] = useState<string | null>(null)
  const [events, setEvents] = useState<EventItem[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [qrEvent, setQrEvent] = useState<EventItem | null>(null)
  const qrCanvasRef = useRef<HTMLCanvasElement>(null)
  const [registering, setRegistering] = useState<string | null>(null)
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
    setStudentId(JSON.parse(stored).student_id)
  }, [navigate])

  useEffect(() => {
    if (!studentId) return
    void loadEvents()
  }, [studentId])

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

  function handleSaveQr() {
    const canvas = qrCanvasRef.current
    if (!canvas || !studentId) return

    const link = document.createElement('a')
    link.download = `psits-qr-${studentId}.png`
    link.href = canvas.toDataURL('image/png')
    link.click()
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
    <div className="min-h-screen bg-slate-50 font-sans">
      <MigrationNotice />
      <Sidebar
        title="PSITS Portal"
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        items={getStudentSidebarItems('events', navigate)}
        footer={
          <button
            onClick={handleLogout}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-slate-400 transition hover:bg-white/5 hover:text-white"
          >
            Sign out
          </button>
        }
      />

      <div className="lg:pl-64">
        <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-4 lg:px-10">
          <div className="flex items-center gap-3">
            <MobileMenuButton onClick={() => setMenuOpen(true)} />
            <div>
              <h1 className="text-lg font-semibold text-slate-900">Events</h1>
              <p className="text-sm text-slate-500">Register and manage your check-in QR code</p>
            </div>
          </div>
          <button
            onClick={() => loadEvents(true)}
            disabled={refreshing || loading}
            title="Refresh"
            className="rounded-lg border border-slate-200 p-2 text-slate-500 transition hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        </header>

        <main className="px-6 py-8 lg:px-10">
          <div className="rounded-xl border border-slate-200 bg-white">
            {/* Toolbar */}
            <div className="space-y-3 border-b border-slate-100 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2 text-sm text-slate-500">
                  <span>Show</span>
                  <select
                    value={pageSize}
                    onChange={(e) => setPageSize(Number(e.target.value))}
                    className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm text-slate-700 focus:border-sky-500 focus:outline-none"
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
                    className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm text-slate-900 transition focus:border-sky-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-500/20"
                  />
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                  className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-600 focus:border-sky-500 focus:outline-none"
                >
                  <option value="ALL">All Status</option>
                  <option value="NOT_REGISTERED">Not Registered</option>
                  <option value="REGISTERED">Registered</option>
                  <option value="CHECKED_IN">Checked In</option>
                  <option value="PRESENT">Present</option>
                </select>
              </div>
            </div>

            {loading ? (
              <div className="space-y-3 p-5">
                <div className="h-4 w-full animate-pulse rounded bg-slate-100" />
                <div className="h-4 w-full animate-pulse rounded bg-slate-100" />
                <div className="h-4 w-2/3 animate-pulse rounded bg-slate-100" />
              </div>
            ) : filtered.length === 0 ? (
              <EmptyState title={events.length === 0 ? 'No upcoming events.' : 'No events match these filters.'} />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-slate-100 bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-5 py-3">
                        <button
                          onClick={() => toggleSort('name')}
                          className="flex items-center gap-1 hover:text-slate-700"
                        >
                          Event <ArrowUpDown className="h-3 w-3" />
                        </button>
                      </th>
                      <th className="px-5 py-3">
                        <button
                          onClick={() => toggleSort('event_date')}
                          className="flex items-center gap-1 hover:text-slate-700"
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
                      <tr key={event.id} className="border-b border-slate-50 last:border-0">
                        <td className="px-5 py-3">
                          <p className="font-medium text-slate-900">{event.name}</p>
                          {event.description && (
                            <p className="text-xs text-slate-400">{event.description}</p>
                          )}
                        </td>
                        <td className="px-5 py-3 text-slate-500">
                          {event.event_date
                            ? new Date(event.event_date).toLocaleDateString(undefined, {
                                dateStyle: 'medium',
                              })
                            : '—'}
                        </td>
                        <td className="px-5 py-3 text-slate-500">
                          {event.event_date
                            ? new Date(event.event_date).toLocaleTimeString(undefined, {
                                timeStyle: 'short',
                              })
                            : '—'}
                        </td>
                        <td className="px-5 py-3">
                          {event.attendance_required ? (
                            <span className="rounded-full bg-rose-50 px-2.5 py-1 text-xs font-medium text-rose-700">
                              Required
                            </span>
                          ) : (
                            <span className="text-xs text-slate-400">Optional</span>
                          )}
                        </td>
                        <td className="px-5 py-3">
                          <div className="flex items-center justify-end gap-2">
                            {event.is_checked_out ? (
                              <span className="rounded-lg bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700">
                                ✓ Present
                              </span>
                            ) : event.is_registered ? (
                              <>
                                {event.is_checked_in && (
                                  <span className="text-xs font-medium text-sky-600">Checked in</span>
                                )}
                                <button
                                  onClick={() => setQrEvent(event)}
                                  className="rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-sky-700"
                                >
                                  View QR Code
                                </button>
                              </>
                            ) : (
                              <button
                                onClick={() => handleRegister(event)}
                                disabled={registering === event.id}
                                className="rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-sky-700 disabled:opacity-50"
                              >
                                {registering === event.id ? 'Registering...' : 'Register'}
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
              <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3 text-sm text-slate-500">
                <span>
                  Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, filtered.length)} of{' '}
                  {filtered.length}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="rounded-lg border border-slate-200 p-1.5 transition hover:bg-slate-50 disabled:opacity-40"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <span className="rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-medium text-white">{page}</span>
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="rounded-lg border border-slate-200 p-1.5 transition hover:bg-slate-50 disabled:opacity-40"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </main>
      </div>

      {qrEvent && studentId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
          onClick={() => setQrEvent(null)}
        >
          <div
            className="w-full max-w-xs rounded-2xl bg-white p-6 text-center shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold text-slate-900">{qrEvent.name}</h3>
            <p className="mt-1 text-sm text-slate-500">
              {qrEvent.is_checked_in
                ? 'Show this to an officer when you leave to scan out.'
                : 'Show this to an officer to check in.'}
            </p>
            <div className="mt-4 flex justify-center rounded-xl border border-slate-100 bg-slate-50 p-4">
              <QRCodeCanvas ref={qrCanvasRef} value={studentId} size={200} />
            </div>
            <p className="mt-3 font-mono text-sm text-slate-600">{studentId}</p>
            <button
              onClick={handleSaveQr}
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg bg-sky-600 py-2 text-sm font-semibold text-white transition hover:bg-sky-700"
            >
              <Download className="h-4 w-4" />
              Save QR Code
            </button>
            <button
              onClick={() => setQrEvent(null)}
              className="mt-2 w-full rounded-lg border border-slate-200 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
