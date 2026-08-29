import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  XCircle,
  UserX,
  ShieldCheck,
  Search,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Wifi,
  WifiOff,
  Download,
} from 'lucide-react'
import { notify } from '@/lib/toast'
import Sidebar, { MobileMenuButton } from '@/components/Sidebar'
import AdminProfileMenu from '@/components/AdminProfileMenu'
import { getAdminSidebarItems } from '@/lib/adminNav'
import EmptyState from '@/components/EmptyState'
import { adminFetch } from '@/lib/adminAuth'
import { API, apiWebSocketUrl } from '@/lib/apiBase'

interface RegistrationRow {
  student_id: string
  student_name: string
  program: string | null
  year_level: number | null
  section: string | null
  registered_at: string | null
  time_in: string | null
  time_out: string | null
  status: 'NO_SHOW' | 'INCOMPLETE' | 'PRESENT' | 'ABSENT' | 'NOT_REGISTERED' | 'EXCUSED'
  is_late: boolean
}

interface RegistrationsData {
  event_id: string
  event_name: string
  event_status: 'DRAFT' | 'ACTIVE' | 'ARCHIVED'
  total_registered: number
  total_present: number
  total_incomplete: number
  total_no_show: number
  total_absent: number
  total_not_registered: number
  total_excused: number
  total_late: number
  registrations: RegistrationRow[]
}

type SortKey = 'student_name' | 'time_in'

export default function AdminEventRegistrationsPage() {
  const { eventId } = useParams<{ eventId: string }>()
  const navigate = useNavigate()
  const [data, setData] = useState<RegistrationsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [menuOpen, setMenuOpen] = useState(false)
  const [exporting, setExporting] = useState(false)

  const [search, setSearch] = useState('')
  const [programFilter, setProgramFilter] = useState('ALL')
  const [yearFilter, setYearFilter] = useState('ALL')
  const [sectionFilter, setSectionFilter] = useState('ALL')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [lateOnly, setLateOnly] = useState(false)
  const [pageSize, setPageSize] = useState(10)
  const [page, setPage] = useState(1)
  const [sortKey, setSortKey] = useState<SortKey>('time_in')
  const [sortAsc, setSortAsc] = useState(true)
  const [live, setLive] = useState(false)

  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const reconnectAttemptRef = useRef(0)

  async function loadRegistrations(background = false) {
    if (!eventId) return
    if (!background) setLoading(true)
    try {
      const res = await adminFetch(`${API}/officer/events/${eventId}/registrations`)
      if (!res.ok) throw new Error('not found')
      setData(await res.json())
    } catch {
      if (!background) notify.error('Failed to load', 'Could not load registrations for this event.')
    } finally {
      if (!background) setLoading(false)
    }
  }

  async function handleExport() {
    if (!eventId || exporting) return
    setExporting(true)
    try {
      const res = await adminFetch(`${API}/officer/events/${eventId}/registrations/export`)
      if (!res.ok) {
        const message = res.status === 404 ? 'Event not found.' : 'Could not generate the report.'
        notify.error('Export failed', message)
        return
      }

      const blob = await res.blob()
      const disposition = res.headers.get('Content-Disposition') ?? ''
      const match = disposition.match(/filename="?([^"]+)"?/)
      const filename = match?.[1] ?? 'PSITS_Attendance.xlsx'

      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = filename
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)

      notify.success('Export ready', `Downloaded ${filename}`)
    } catch {
      notify.error('Network error', 'Could not reach the server.')
    } finally {
      setExporting(false)
    }
  }

  // Initial load
  useEffect(() => {
    void loadRegistrations()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId])

  // Coarse fallback poll - keeps the table eventually-consistent even if the
  // WebSocket silently drops without firing a close event.
  useEffect(() => {
    if (!eventId) return
    const interval = setInterval(() => loadRegistrations(true), 20000)
    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId])

  // Live updates: reconnects with backoff on drop, capped at 10s between tries.
  useEffect(() => {
    if (!eventId) return

    let cancelled = false

    const connect = () => {
      if (cancelled) return

      const ws = new WebSocket(apiWebSocketUrl(`${API}/events/${eventId}/attendance/ws`))
      wsRef.current = ws

      ws.onopen = () => {
        reconnectAttemptRef.current = 0
        setLive(true)
      }
      ws.onmessage = () => {
        void loadRegistrations(true)
      }
      ws.onclose = () => {
        setLive(false)
        if (cancelled) return
        const delay = Math.min(10000, 1000 * 2 ** reconnectAttemptRef.current)
        reconnectAttemptRef.current += 1
        reconnectTimerRef.current = setTimeout(connect, delay)
      }
      ws.onerror = () => ws.close()
    }

    connect()

    return () => {
      cancelled = true
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current)
      wsRef.current?.close()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId])

  const programs = useMemo(
    () => Array.from(new Set(data?.registrations.map((r) => r.program).filter(Boolean))) as string[],
    [data]
  )
  const years = useMemo(
    () => Array.from(new Set(data?.registrations.map((r) => r.year_level).filter(Boolean))) as number[],
    [data]
  )
  const sections = useMemo(
    () => Array.from(new Set(data?.registrations.map((r) => r.section).filter(Boolean))) as string[],
    [data]
  )

  const filtered = useMemo(() => {
    if (!data) return []
    let rows = data.registrations

    const q = search.trim().toLowerCase()
    if (q) {
      rows = rows.filter(
        (r) => r.student_name.toLowerCase().includes(q) || r.student_id.toLowerCase().includes(q)
      )
    }
    if (programFilter !== 'ALL') rows = rows.filter((r) => r.program === programFilter)
    if (yearFilter !== 'ALL') rows = rows.filter((r) => String(r.year_level) === yearFilter)
    if (sectionFilter !== 'ALL') rows = rows.filter((r) => r.section === sectionFilter)
    if (statusFilter !== 'ALL') rows = rows.filter((r) => r.status === statusFilter)
    if (lateOnly) rows = rows.filter((r) => r.is_late)

    rows = [...rows].sort((a, b) => {
      const cmp =
        sortKey === 'student_name'
          ? a.student_name.localeCompare(b.student_name)
          : (a.time_in ?? '').localeCompare(b.time_in ?? '')
      return sortAsc ? cmp : -cmp
    })

    return rows
  }, [data, search, programFilter, yearFilter, sectionFilter, statusFilter, lateOnly, sortKey, sortAsc])

  useEffect(() => {
    setPage(1)
  }, [search, programFilter, yearFilter, sectionFilter, statusFilter, lateOnly, pageSize])

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

  return (
    <div className="min-h-screen bg-slate-50 font-sans">
      <Sidebar
        title="PSITS Admin"
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        items={getAdminSidebarItems('attendance', navigate, () => {})}
      />

      <div className="lg:pl-64">
        <header className="flex items-center gap-3 border-b border-slate-200 bg-white px-6 py-4 lg:px-10">
          <MobileMenuButton onClick={() => setMenuOpen(true)} />
          <div>
            <Link
              to="/admin/events"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-sky-600 hover:text-sky-700"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Events
            </Link>
            <h1 className="mt-1 text-lg font-semibold text-slate-900">
              {loading ? 'Loading...' : data?.event_name ?? 'Event'}
            </h1>
            <p className="text-sm text-slate-500">Registered students and their attendance status</p>
          </div>
          <div className="ml-auto flex items-center gap-3">
            <div
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${
                live ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
              }`}
            >
              {live ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
              {live ? 'Live' : 'Reconnecting...'}
            </div>
            <AdminProfileMenu />
          </div>
        </header>

        <main className="px-6 py-8 lg:px-10">
          {/* Stat cards */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Registered</p>
              <p className="mt-2 text-2xl font-semibold text-slate-900">
                {loading ? '—' : data?.total_registered ?? 0}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Present</p>
              <p className="mt-2 text-2xl font-semibold text-emerald-600">
                {loading ? '—' : data?.total_present ?? 0}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Incomplete</p>
              <p className="mt-2 text-2xl font-semibold text-sky-600">
                {loading ? '—' : data?.total_incomplete ?? 0}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Late</p>
              <p className="mt-2 text-2xl font-semibold text-amber-600">
                {loading ? '—' : data?.total_late ?? 0}
              </p>
            </div>
            {/* Finalized (ARCHIVED) events show ABSENT - active events show the
                live NO_SHOW/NOT_REGISTERED breakdown instead. The backend has
                already collapsed NO_SHOW+NOT_REGISTERED into ABSENT once
                archived, so these two card sets are mutually exclusive. */}
            {data?.event_status === 'ARCHIVED' ? (
              <div className="rounded-xl border border-slate-200 bg-white p-5">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Absent</p>
                <p className="mt-2 text-2xl font-semibold text-rose-600">
                  {loading ? '—' : data?.total_absent ?? 0}
                </p>
              </div>
            ) : (
              <>
                <div className="rounded-xl border border-slate-200 bg-white p-5">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">No Show</p>
                  <p className="mt-2 text-2xl font-semibold text-rose-600">
                    {loading ? '—' : data?.total_no_show ?? 0}
                  </p>
                </div>
                {(data?.total_not_registered ?? 0) > 0 && (
                  <div className="rounded-xl border border-slate-200 bg-white p-5">
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Not Registered</p>
                    <p className="mt-2 text-2xl font-semibold text-slate-600">
                      {loading ? '—' : data?.total_not_registered ?? 0}
                    </p>
                  </div>
                )}
              </>
            )}
            {(data?.total_excused ?? 0) > 0 && (
              <div className="rounded-xl border border-slate-200 bg-white p-5">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Excused</p>
                <p className="mt-2 text-2xl font-semibold text-indigo-600">
                  {loading ? '—' : data?.total_excused ?? 0}
                </p>
              </div>
            )}
          </div>

          {/* Table */}
          <div className="mt-8 max-w-6xl">
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

                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleExport}
                      disabled={exporting || loading}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Download className="h-4 w-4" />
                      {exporting ? 'Exporting...' : 'Export Attendance Excel'}
                    </button>

                    <div className="relative w-full sm:w-64">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <input
                        type="text"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search students..."
                        className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm text-slate-900 transition focus:border-sky-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-500/20"
                      />
                    </div>
                  </div>
                </div>

                {/* Filters */}
                <div className="flex flex-wrap gap-2">
                  <FilterSelect
                    label="Program"
                    value={programFilter}
                    onChange={setProgramFilter}
                    options={programs}
                  />
                  <FilterSelect
                    label="Year"
                    value={yearFilter}
                    onChange={setYearFilter}
                    options={years.map((y) => String(y))}
                    formatOption={(y) => `Year ${y}`}
                  />
                  <FilterSelect
                    label="Section"
                    value={sectionFilter}
                    onChange={setSectionFilter}
                    options={sections}
                  />
                  <FilterSelect
                    label="Status"
                    value={statusFilter}
                    onChange={setStatusFilter}
                    options={['PRESENT', 'INCOMPLETE', 'ABSENT', 'NO_SHOW', 'NOT_REGISTERED', 'EXCUSED']}
                    formatOption={(s) =>
                      s === 'NO_SHOW'
                        ? 'No-show'
                        : s === 'NOT_REGISTERED'
                          ? 'Not Registered'
                          : s.charAt(0) + s.slice(1).toLowerCase()
                    }
                  />
                  <button
                    onClick={() => setLateOnly(!lateOnly)}
                    className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                      lateOnly
                        ? 'border-amber-300 bg-amber-50 text-amber-700'
                        : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    Late only
                  </button>
                </div>
              </div>

              {loading ? (
                <div className="space-y-3 p-5">
                  <div className="h-4 w-full animate-pulse rounded bg-slate-100" />
                  <div className="h-4 w-full animate-pulse rounded bg-slate-100" />
                  <div className="h-4 w-2/3 animate-pulse rounded bg-slate-100" />
                </div>
              ) : filtered.length === 0 ? (
                <EmptyState
                  title={
                    data?.registrations.length === 0
                      ? 'No students have registered yet.'
                      : 'No students match these filters.'
                  }
                />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b border-slate-100 bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-5 py-3">
                          <button
                            onClick={() => toggleSort('student_name')}
                            className="flex items-center gap-1 uppercase tracking-wide hover:text-slate-700"
                          >
                            Student <ArrowUpDown className="h-3 w-3" />
                          </button>
                        </th>
                        <th className="px-5 py-3">Program / Section</th>
                        <th className="px-5 py-3">
                          <button
                            onClick={() => toggleSort('time_in')}
                            className="flex items-center gap-1 uppercase tracking-wide hover:text-slate-700"
                          >
                            Time In <ArrowUpDown className="h-3 w-3" />
                          </button>
                        </th>
                        <th className="px-5 py-3">Time Out</th>
                        <th className="px-5 py-3">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paged.map((r) => (
                        <tr key={r.student_id} className="border-b border-slate-50 last:border-0">
                          <td className="px-5 py-3">
                            <p className="font-medium text-slate-900">{r.student_name}</p>
                            <p className="text-xs text-slate-400">{r.student_id}</p>
                          </td>
                          <td className="px-5 py-3 text-slate-500">
                            {r.program ? `${r.program}${r.year_level ? ` · Y${r.year_level}` : ''}` : '—'}
                            {r.section ? ` · ${r.section}` : ''}
                          </td>
                          <td className="px-5 py-3 text-slate-500">
                            {r.time_in ? (
                              <>
                                {new Date(r.time_in).toLocaleTimeString(undefined, { timeStyle: 'short' })}
                                {r.is_late && (
                                  <span className="ml-1.5 rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
                                    Late
                                  </span>
                                )}
                              </>
                            ) : (
                              '—'
                            )}
                          </td>
                          <td className="px-5 py-3 text-slate-500">
                            {r.time_out
                              ? new Date(r.time_out).toLocaleTimeString(undefined, { timeStyle: 'short' })
                              : '—'}
                          </td>
                          <td className="px-5 py-3">
                            <StatusBadge status={r.status} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Pagination */}
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
                    <span className="rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-medium text-white">
                      {page}
                    </span>
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
          </div>
        </main>
      </div>
    </div>
  )
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
  formatOption,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: string[]
  formatOption?: (v: string) => string
}) {
  return (
    <select
      disabled={options.length === 0}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-600 focus:border-sky-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
    >
      <option value="ALL">All {label}</option>
      {options.map((o) => (
        <option key={o} value={o}>
          {formatOption ? formatOption(o) : o}
        </option>
      ))}
    </select>
  )
}

function StatusBadge({ status }: { status: RegistrationRow['status'] }) {
  if (status === 'PRESENT') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
        <CheckCircle2 className="h-3.5 w-3.5" />
        Present
      </span>
    )
  }
  if (status === 'INCOMPLETE') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-50 px-2.5 py-1 text-xs font-medium text-sky-700">
        <Clock className="h-3.5 w-3.5" />
        Incomplete
      </span>
    )
  }
  if (status === 'ABSENT') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 px-2.5 py-1 text-xs font-medium text-rose-700">
        <XCircle className="h-3.5 w-3.5" />
        Absent
      </span>
    )
  }
  if (status === 'NOT_REGISTERED') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-500">
        <UserX className="h-3.5 w-3.5" />
        Not Registered
      </span>
    )
  }
  if (status === 'EXCUSED') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-700">
        <ShieldCheck className="h-3.5 w-3.5" />
        Excused
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
      <XCircle className="h-3.5 w-3.5" />
      No-show
    </span>
  )
}
