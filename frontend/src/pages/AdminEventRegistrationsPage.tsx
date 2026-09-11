import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Clock,
  ShieldCheck,
  Search,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Wifi,
  WifiOff,
  Download,
  ScanLine,
  AlertTriangle,
  KeyRound,
  Plus,
  UserCheck,
  UserX,
} from 'lucide-react'
import { notify } from '@/lib/toast'
import { confirmAction } from '@/lib/confirm'
import Sidebar, { MobileMenuButton } from '@/components/Sidebar'
import AdminProfileMenu from '@/components/AdminProfileMenu'
import { getAdminSidebarItems } from '@/lib/adminNav'
import EmptyState from '@/components/EmptyState'
import { adminFetch, getAdminToken } from '@/lib/adminAuth'
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
  status:
    | 'NO_SHOW'
    | 'INCOMPLETE'
    | 'PRESENT'
    | 'ABSENT'
    | 'NOT_REGISTERED'
    | 'EXCUSED'
    | 'LATE'
    | 'FOR_REVIEW'
  is_late: boolean
  survey_status: 'PENDING' | 'SUBMITTED' | null
  checkpoints: string[]
}

interface RegistrationsData {
  event_id: string
  event_name: string
  event_status: 'DRAFT' | 'ACTIVE' | 'ARCHIVED'
  survey_required: boolean
  event_code: string | null
  attendance_phase: string
  attendance_phase_label: string
  next_phase: string | null
  next_phase_label: string | null
  uses_checkpoints: boolean
  late_threshold_minutes: number
  total_registered: number
  total_present: number
  total_incomplete: number
  total_no_show: number
  total_absent: number
  total_not_registered: number
  total_excused: number
  total_late: number
  total_late_status: number
  total_for_review: number
  registrations: RegistrationRow[]
}

interface OfficerOption {
  id: string
  name: string
  is_active: boolean
  created_at: string
  assignment_count: number
}

interface AssignmentRow {
  id: string
  officer_id: string
  officer_name: string
  officer_active: boolean
  course: string
  year_level: number
  section: string
  scan_count: number
}

interface SurveyQuestionResult {
  id: string
  text: string
  average: number | null
  responses: number
}

interface SurveySectionResult {
  title: string
  questions: SurveyQuestionResult[]
}

interface SurveyCommentEntry {
  student_id: string
  student_name: string
  comment: string
  submitted_at: string
}

interface SurveyResults {
  total_responses: number
  total_eligible: number
  sections: SurveySectionResult[]
  comments: SurveyCommentEntry[]
}

type SortKey = 'student_name' | 'time_in'
type PageTab = 'attendance' | 'survey' | 'officers' | 'scanner-officer' | 'scan-audit'

const CHECKPOINTS = ['IN', 'MIDDLE', 'OUT'] as const

const COURSE_OPTIONS = [
  { value: 'BSIT', label: 'BSIT' },
  { value: 'BSCS', label: 'BSCS' },
  { value: 'BSINFOSYS', label: 'BSInfoSys' },
  { value: 'BLIS', label: 'BLIS' },
]

const SECTION_OPTIONS = ['A', 'B', 'C']

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

  const [tab, setTab] = useState<PageTab>('attendance')
  const [surveyResults, setSurveyResults] = useState<SurveyResults | null>(null)
  const [surveyResultsLoading, setSurveyResultsLoading] = useState(false)

  const [assignments, setAssignments] = useState<AssignmentRow[]>([])
  const [officerOptions, setOfficerOptions] = useState<OfficerOption[]>([])
  const [officersLoading, setOfficersLoading] = useState(false)
  const [advancingPhase, setAdvancingPhase] = useState(false)

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

  const [overridingId, setOverridingId] = useState<string | null>(null)

  async function handleOverride(studentId: string, newStatus: 'PRESENT' | 'EXCUSED' | 'ABSENT') {
    if (!eventId) return
    setOverridingId(studentId)
    try {
      const res = await adminFetch(`${API}/officer/events/${eventId}/registrations/${studentId}/override`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
      if (!res.ok) {
        notify.error('Override failed', 'Could not update this student\'s attendance.')
        return
      }
      setData(await res.json())
      notify.success('Updated', `Marked as ${newStatus.charAt(0) + newStatus.slice(1).toLowerCase()}.`)
    } catch {
      notify.error('Network error', 'Could not reach the server.')
    } finally {
      setOverridingId(null)
    }
  }

  async function loadSurveyResults() {
    if (!eventId) return
    setSurveyResultsLoading(true)
    try {
      const res = await adminFetch(`${API}/officer/events/${eventId}/survey-results`)
      if (!res.ok) throw new Error('failed')
      setSurveyResults(await res.json())
    } catch {
      notify.error('Failed to load', 'Could not load survey results for this event.')
    } finally {
      setSurveyResultsLoading(false)
    }
  }

  async function loadOfficers() {
    if (!eventId) return
    setOfficersLoading(true)
    try {
      const [assignedRes, rosterRes] = await Promise.all([
        adminFetch(`${API}/officer/events/${eventId}/officers`),
        adminFetch(`${API}/officer/officers/`),
      ])
      if (assignedRes.ok) setAssignments((await assignedRes.json()).assignments ?? [])
      if (rosterRes.ok) setOfficerOptions((await rosterRes.json()).officers ?? [])
    } catch {
      notify.error('Failed to load', 'Could not load officer assignments.')
    } finally {
      setOfficersLoading(false)
    }
  }

  async function advancePhase() {
    if (!eventId || !data?.next_phase || advancingPhase) return

    const confirmed = await confirmAction({
      title: `${data.next_phase_label}?`,
      text:
        data.next_phase === 'CLOSED' || data.next_phase.endsWith('_CLOSED')
          ? 'Officers will stop being able to scan this checkpoint. This cannot be undone — checkpoints only move forward.'
          : 'Officers scanning this event will switch to this checkpoint. This cannot be undone — checkpoints only move forward.',
      confirmText: data.next_phase_label ?? 'Continue',
    })
    if (!confirmed) return

    setAdvancingPhase(true)
    try {
      const res = await adminFetch(`${API}/officer/events/${eventId}/attendance-phase`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ next_phase: data.next_phase }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        notify.error('Could not change phase', body?.detail ?? 'Please refresh and try again.')
        return
      }
      const updated = await res.json()
      notify.success('Attendance phase updated', updated.attendance_phase_label)
      await loadRegistrations(true)
    } catch {
      notify.error('Network error', 'Could not reach the server.')
    } finally {
      setAdvancingPhase(false)
    }
  }

  async function downloadExport(exportUrl: string, defaultFilename: string) {
    if (!eventId || exporting) return
    setExporting(true)
    try {
      const res = await adminFetch(exportUrl)
      if (!res.ok) {
        const message = res.status === 404 ? 'Event not found.' : 'Could not generate the report.'
        notify.error('Export failed', message)
        return
      }

      const blob = await res.blob()
      const disposition = res.headers.get('Content-Disposition') ?? ''
      const match = disposition.match(/filename="?([^"]+)"?/)
      const filename = match?.[1] ?? defaultFilename

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

  useEffect(() => {
    if (tab === 'survey' && !surveyResults) void loadSurveyResults()
    if (tab === 'officers' || tab === 'scanner-officer') void loadOfficers()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, eventId])

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
        const token = getAdminToken()
        if (!token) {
          ws.close()
          return
        }
        ws.send(JSON.stringify({ token }))
      }
      // Both "a scan happened" and "the phase changed" arrive here as bare
      // signals; the payload is re-fetched either way, so the REST response
      // stays the single source of truth for the page's shape.
      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data) as { type?: string }
          if (message.type === 'authenticated') {
            setLive(true)
            return
          }
        } catch {
          // Unknown notifications still trigger the authoritative REST reload.
        }
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
  const showSurveyColumn = (data?.registrations ?? []).some((r) => r.survey_status !== null)
  // Only for events actually running the checkpoint workflow - on a legacy
  // two-scan event these would be three permanently empty columns.
  const showCheckpointColumns = data?.uses_checkpoints ?? false

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortAsc(!sortAsc)
    } else {
      setSortKey(key)
      setSortAsc(true)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 font-sans">
      <Sidebar
        title="PSITS Admin"
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        items={getAdminSidebarItems('attendance', navigate, () => {})}
      />

      <div className="lg:pl-64">
        <header className="flex items-center gap-3 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-6 py-4 lg:px-10">
          <MobileMenuButton onClick={() => setMenuOpen(true)} />
          <div>
            <Link
              to="/admin/events"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-sky-600 dark:text-sky-400 hover:text-sky-700"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Events
            </Link>
            <h1 className="mt-1 text-lg font-semibold text-slate-900 dark:text-white">
              {loading ? 'Loading...' : data?.event_name ?? 'Event'}
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">Registered students and their attendance status</p>
          </div>
          <div className="ml-auto flex items-center gap-3">
            <div
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${
                live ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400' : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
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
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Registered</p>
              <p className="mt-2 text-2xl font-semibold text-slate-900 dark:text-white">
                {loading ? '—' : data?.total_registered ?? 0}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Present</p>
              <p className="mt-2 text-2xl font-semibold text-emerald-600 dark:text-emerald-400">
                {loading ? '—' : data?.total_present ?? 0}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Incomplete</p>
              <p className="mt-2 text-2xl font-semibold text-sky-600 dark:text-sky-400">
                {loading ? '—' : data?.total_incomplete ?? 0}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Late</p>
              <p className="mt-2 text-2xl font-semibold text-amber-600 dark:text-amber-400">
                {loading ? '—' : data?.total_late ?? 0}
              </p>
            </div>
            {/* Finalized (ARCHIVED) events show ABSENT - active events show the
                live NO_SHOW/NOT_REGISTERED breakdown instead. The backend has
                already collapsed NO_SHOW+NOT_REGISTERED into ABSENT once
                archived, so these two card sets are mutually exclusive. */}
            {data?.event_status === 'ARCHIVED' ? (
              <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Absent</p>
                <p className="mt-2 text-2xl font-semibold text-rose-600 dark:text-rose-400">
                  {loading ? '—' : data?.total_absent ?? 0}
                </p>
              </div>
            ) : (
              <>
                <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">No Show</p>
                  <p className="mt-2 text-2xl font-semibold text-rose-600 dark:text-rose-400">
                    {loading ? '—' : data?.total_no_show ?? 0}
                  </p>
                </div>
                {(data?.total_not_registered ?? 0) > 0 && (
                  <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5">
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Not Registered</p>
                    <p className="mt-2 text-2xl font-semibold text-slate-600 dark:text-slate-300">
                      {loading ? '—' : data?.total_not_registered ?? 0}
                    </p>
                  </div>
                )}
              </>
            )}
            {(data?.total_excused ?? 0) > 0 && (
              <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Excused</p>
                <p className="mt-2 text-2xl font-semibold text-indigo-600 dark:text-indigo-400">
                  {loading ? '—' : data?.total_excused ?? 0}
                </p>
              </div>
            )}
            {(data?.total_late_status ?? 0) > 0 && (
              <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Late (missed IN)
                </p>
                <p className="mt-2 text-2xl font-semibold text-orange-600 dark:text-orange-400">
                  {data?.total_late_status ?? 0}
                </p>
              </div>
            )}
            {(data?.total_for_review ?? 0) > 0 && (
              <button
                type="button"
                onClick={() => navigate('/admin/excuse-requests?tab=attendance-review')}
                className="group rounded-xl border border-purple-200 bg-purple-50/60 p-5 text-left transition hover:border-purple-300 hover:bg-purple-100/70 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 dark:border-purple-900 dark:bg-purple-950/20 dark:hover:border-purple-700 dark:hover:bg-purple-950/40 dark:focus:ring-offset-slate-950"
              >
                <span className="flex items-center justify-between gap-3">
                  <span className="text-xs font-medium uppercase tracking-wide text-purple-700 dark:text-purple-400">
                    For Review
                  </span>
                  <ArrowRight className="h-4 w-4 text-purple-500 transition-transform group-hover:translate-x-0.5 dark:text-purple-400" />
                </span>
                <span className="mt-2 block text-2xl font-semibold text-purple-700 dark:text-purple-400">
                  {data?.total_for_review ?? 0}
                </span>
                <span className="mt-1 block text-[11px] text-purple-600 dark:text-purple-400">
                  Ambiguous scans — needs a look
                </span>
              </button>
            )}
          </div>

          {/* Attendance phase control. Manual at every step on purpose - the
              organiser opens MIDDLE when the programme actually gets there,
              which is not a time anyone can schedule in advance. */}
          {data && data.event_status !== 'DRAFT' && (
            <AttendanceControl
              data={data}
              busy={advancingPhase}
              onAdvance={() => void advancePhase()}
            />
          )}

          <div className="mt-6 flex flex-wrap gap-2">
            <TabButton active={tab === 'attendance'} onClick={() => setTab('attendance')}>
              Attendance
            </TabButton>
            {data?.survey_required && (
              <TabButton active={tab === 'survey'} onClick={() => setTab('survey')}>
                Survey Results
              </TabButton>
            )}
            <TabButton active={tab === 'scanner-officer'} onClick={() => setTab('scanner-officer')}>
              Scanner Officer
            </TabButton>
            <TabButton active={tab === 'officers'} onClick={() => setTab('officers')}>
              Officer Assignments
            </TabButton>
            <TabButton active={tab === 'scan-audit'} onClick={() => setTab('scan-audit')}>
              Scan Audit
            </TabButton>
          </div>

          {/* Table */}
          {tab === 'attendance' && (
          <div className="mt-8 w-full">
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
              {/* Toolbar */}
              <div className="space-y-3 border-b border-slate-100 dark:border-slate-800 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
                    <span>Show</span>
                    <select
                      value={pageSize}
                      onChange={(e) => setPageSize(Number(e.target.value))}
                      className="rounded-lg border border-slate-200 dark:border-slate-700 px-2 py-1.5 text-sm text-slate-700 dark:text-slate-300 focus:border-sky-500 focus:outline-none"
                    >
                      <option value={10}>10</option>
                      <option value={25}>25</option>
                      <option value={50}>50</option>
                    </select>
                    <span>entries</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() =>
                        downloadExport(
                          `${API}/officer/events/${eventId}/registrations/export`,
                          'PSITS_Attendance.xlsx'
                        )
                      }
                      disabled={exporting || loading}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 transition hover:bg-slate-50 dark:hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Download className="h-4 w-4" />
                      {exporting ? 'Exporting...' : 'Export Attendance Excel'}
                    </button>

                    <div className="relative w-full sm:w-64">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
                      <input
                        type="text"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search students..."
                        className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 py-2 pl-9 pr-3 text-sm text-slate-900 dark:text-white transition focus:border-sky-500 focus:bg-white dark:focus:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
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
                    options={[
                      'PRESENT',
                      ...(data?.uses_checkpoints ? ['LATE', 'FOR_REVIEW'] : []),
                      'INCOMPLETE',
                      'ABSENT',
                      'NO_SHOW',
                      'NOT_REGISTERED',
                      'EXCUSED',
                    ]}
                    formatOption={(s) =>
                      s === 'NO_SHOW'
                        ? 'No-show'
                        : s === 'NOT_REGISTERED'
                          ? 'Not Registered'
                          : s === 'FOR_REVIEW'
                            ? 'For Review'
                            : s === 'LATE'
                              ? 'Late (missed IN)'
                              : s.charAt(0) + s.slice(1).toLowerCase()
                    }
                  />
                  <button
                    onClick={() => setLateOnly(!lateOnly)}
                    className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                      lateOnly
                        ? 'border-amber-300 bg-amber-50 text-amber-700'
                        : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                    }`}
                  >
                    Late only
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
                    <thead className="border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-left text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      <tr>
                        <th className="px-5 py-3">
                          <button
                            onClick={() => toggleSort('student_name')}
                            className="flex items-center gap-1 uppercase tracking-wide hover:text-slate-700 dark:hover:text-slate-200"
                          >
                            Student <ArrowUpDown className="h-3 w-3" />
                          </button>
                        </th>
                        <th className="px-5 py-3">Program / Section</th>
                        <th className="px-5 py-3">
                          <button
                            onClick={() => toggleSort('time_in')}
                            className="flex items-center gap-1 uppercase tracking-wide hover:text-slate-700 dark:hover:text-slate-200"
                          >
                            Time In <ArrowUpDown className="h-3 w-3" />
                          </button>
                        </th>
                        <th className="px-5 py-3">Time Out</th>
                        {showCheckpointColumns &&
                          CHECKPOINTS.map((c) => (
                            <th key={c} className="px-3 py-3 text-center">
                              {c}
                            </th>
                          ))}
                        <th className="px-5 py-3">Status</th>
                        {showSurveyColumn && <th className="px-5 py-3">Survey</th>}
                        <th className="px-5 py-3">Override</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paged.map((r) => (
                        <tr key={r.student_id} className="border-b border-slate-50 dark:border-slate-800/60 last:border-0">
                          <td className="px-5 py-3">
                            <p className="font-medium text-slate-900 dark:text-white">{r.student_name}</p>
                            <p className="text-xs text-slate-400 dark:text-slate-500">{r.student_id}</p>
                          </td>
                          <td className="px-5 py-3 text-slate-500 dark:text-slate-400">
                            {r.program ? `${r.program}${r.year_level ? ` · Y${r.year_level}` : ''}` : '—'}
                            {r.section ? ` · ${r.section}` : ''}
                          </td>
                          <td className="px-5 py-3 text-slate-500 dark:text-slate-400">
                            {r.time_in ? (
                              <>
                                {new Date(r.time_in).toLocaleTimeString(undefined, { timeStyle: 'short' })}
                                {r.is_late && (
                                  <span className="ml-1.5 rounded-full bg-amber-50 dark:bg-amber-950/40 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-400">
                                    Late
                                  </span>
                                )}
                              </>
                            ) : (
                              '—'
                            )}
                          </td>
                          <td className="px-5 py-3 text-slate-500 dark:text-slate-400">
                            {r.time_out
                              ? new Date(r.time_out).toLocaleTimeString(undefined, { timeStyle: 'short' })
                              : '—'}
                          </td>
                          {showCheckpointColumns &&
                            CHECKPOINTS.map((c) => (
                              <td key={c} className="px-3 py-3 text-center">
                                {r.checkpoints?.includes(c) ? (
                                  <CheckCircle2 className="mx-auto h-4 w-4 text-emerald-500 dark:text-emerald-400" />
                                ) : (
                                  <span className="text-slate-300">—</span>
                                )}
                              </td>
                            ))}
                          <td className="px-5 py-3">
                            <StatusBadge status={r.status} />
                          </td>
                          {showSurveyColumn && (
                            <td className="px-5 py-3">
                              {r.survey_status === 'SUBMITTED' ? (
                                <span className="rounded-full bg-emerald-50 dark:bg-emerald-950/40 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                                  Submitted
                                </span>
                              ) : r.survey_status === 'PENDING' ? (
                                <span className="rounded-full bg-sky-50 dark:bg-sky-950/40 px-2.5 py-1 text-xs font-medium text-sky-700 dark:text-sky-400">
                                  Pending
                                </span>
                              ) : (
                                <span className="text-xs text-slate-400 dark:text-slate-500">—</span>
                              )}
                            </td>
                          )}
                          <td className="px-5 py-3">
                            <select
                              value=""
                              disabled={overridingId === r.student_id}
                              onChange={(e) => {
                                const value = e.target.value as 'PRESENT' | 'EXCUSED' | 'ABSENT'
                                if (value) void handleOverride(r.student_id, value)
                                e.target.value = ''
                              }}
                              className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 focus:border-sky-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              <option value="">
                                {overridingId === r.student_id ? 'Saving...' : 'Set as...'}
                              </option>
                              <option value="PRESENT">Present</option>
                              <option value="EXCUSED">Excused</option>
                              <option value="ABSENT">Absent</option>
                            </select>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Pagination */}
              {!loading && filtered.length > 0 && (
                <div className="flex items-center justify-between border-t border-slate-100 dark:border-slate-800 px-5 py-3 text-sm text-slate-500 dark:text-slate-400">
                  <span>
                    Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, filtered.length)} of{' '}
                    {filtered.length}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page === 1}
                      className="rounded-lg border border-slate-200 dark:border-slate-700 p-1.5 transition hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                    <span className="rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-medium text-white">
                      {page}
                    </span>
                    <button
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      disabled={page === totalPages}
                      className="rounded-lg border border-slate-200 dark:border-slate-700 p-1.5 transition hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
          )}

          {tab === 'survey' && (
            <div className="mt-8 w-full">
              {surveyResultsLoading || !surveyResults ? (
                <div className="space-y-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5">
                  <div className="h-4 w-full animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
                  <div className="h-4 w-2/3 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="flex flex-col gap-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Responses</p>
                      <p className="mt-1 text-2xl font-semibold text-slate-900 dark:text-white">
                        {surveyResults.total_responses} / {surveyResults.total_eligible}
                      </p>
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        Students who checked out and could be asked to respond.
                      </p>
                    </div>
                    <button
                      onClick={() =>
                        downloadExport(
                          `${API}/officer/events/${eventId}/survey-results/export`,
                          'PSITS_Survey.xlsx'
                        )
                      }
                      disabled={exporting || surveyResults.total_responses === 0}
                      className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 transition hover:bg-slate-50 dark:hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Download className="h-4 w-4" />
                      {exporting ? 'Exporting...' : 'Export Results'}
                    </button>
                  </div>

                  {surveyResults.total_responses === 0 ? (
                    <EmptyState title="No survey responses yet." />
                  ) : (
                    <>
                      <div className="grid gap-4 lg:grid-cols-2">
                        {surveyResults.sections.map((section, sIdx) => (
                          <div key={section.title} className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5">
                            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                              {sIdx + 1}. {section.title}
                            </h3>
                            <div className="mt-3 space-y-3">
                              {section.questions.map((q) => (
                                <div key={q.id}>
                                  <div className="flex items-center justify-between gap-3">
                                    <p className="text-sm text-slate-700 dark:text-slate-300">{q.text}</p>
                                    <span className="shrink-0 text-sm font-semibold text-sky-600 dark:text-sky-400">
                                      {q.average !== null ? q.average.toFixed(2) : '—'}
                                    </span>
                                  </div>
                                  <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                                    <div
                                      className="h-full rounded-full bg-sky-600"
                                      style={{ width: `${((q.average ?? 0) / 4) * 100}%` }}
                                    />
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>

                      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5">
                        <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Comments</h3>
                        {surveyResults.comments.length === 0 ? (
                          <p className="mt-2 text-sm text-slate-400 dark:text-slate-500">No written comments submitted.</p>
                        ) : (
                          <ul className="mt-3 grid gap-3 lg:grid-cols-2">
                            {surveyResults.comments.map((c, i) => (
                              <li key={i} className="rounded-lg bg-slate-50 dark:bg-slate-800 p-3">
                                <p className="text-sm text-slate-700 dark:text-slate-300">"{c.comment}"</p>
                                <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
                                  {c.student_name} ({c.student_id}) ·{' '}
                                  {new Date(c.submitted_at).toLocaleDateString(undefined, { dateStyle: 'medium' })}
                                </p>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          {tab === 'officers' && (
            <OfficersTab
              eventId={eventId!}
              eventCode={data?.event_code ?? null}
              assignments={assignments}
              officers={officerOptions}
              loading={officersLoading}
              onChanged={() => void loadOfficers()}
              onGoToRosterTab={() => setTab('scanner-officer')}
            />
          )}

          {tab === 'scanner-officer' && (
            <ScannerOfficerRosterTab
              officers={officerOptions}
              loading={officersLoading}
              onChanged={() => void loadOfficers()}
            />
          )}

          {tab === 'scan-audit' && <ScanAuditTable eventId={eventId!} />}
        </main>
      </div>
    </div>
  )
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
        active
          ? 'bg-slate-900 text-white dark:bg-sky-600'
          : 'border border-slate-300 bg-white text-slate-700 shadow-sm hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:shadow-none dark:hover:bg-slate-700'
      }`}
    >
      {children}
    </button>
  )
}

const PHASE_TONE: Record<string, string> = {
  IN: 'bg-emerald-500',
  MIDDLE: 'bg-sky-500',
  OUT: 'bg-violet-500',
}

function AttendanceControl({
  data,
  busy,
  onAdvance,
}: {
  data: RegistrationsData
  busy: boolean
  onAdvance: () => void
}) {
  const openCheckpoint = ['IN', 'MIDDLE', 'OUT'].includes(data.attendance_phase)
    ? data.attendance_phase
    : null

  return (
    <div className="mt-6 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Attendance Control
          </p>
          <div className="mt-2 flex items-center gap-2.5">
            {openCheckpoint && (
              <span
                className={`h-3 w-3 rounded-full ${PHASE_TONE[openCheckpoint]} animate-pulse`}
              />
            )}
            <p className="text-xl font-semibold text-slate-900 dark:text-white">{data.attendance_phase_label}</p>
          </div>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {openCheckpoint
              ? `Officers are scanning the ${openCheckpoint} checkpoint right now.`
              : data.attendance_phase === 'CLOSED'
                ? 'All checkpoints are done. Attendance for this event is final.'
                : 'No checkpoint is open — scanning is paused until you open the next one.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <div className="rounded-lg bg-slate-50 dark:bg-slate-800 px-4 py-2.5">
            <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Event Code
            </p>
            <p className="mt-0.5 font-mono text-lg font-bold tracking-[0.2em] text-slate-900 dark:text-white">
              {data.event_code ?? '—'}
            </p>
            {data.event_code ? (
              <a
                href={`/checkpoint-scanner?code=${data.event_code}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-0.5 inline-block text-[10px] font-medium text-sky-600 dark:text-sky-400 hover:underline"
              >
                Open officer scanner ↗
              </a>
            ) : (
              <p className="mt-0.5 text-[10px] text-slate-400 dark:text-slate-500">Officers enter this to sign in</p>
            )}
          </div>

          {data.next_phase ? (
            <button
              onClick={onAdvance}
              disabled={busy}
              className="rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50"
            >
              {busy ? 'Working...' : data.next_phase_label}
            </button>
          ) : (
            <span className="rounded-xl bg-slate-100 dark:bg-slate-800 px-5 py-3 text-sm font-semibold text-slate-500 dark:text-slate-400">
              Attendance Closed
            </span>
          )}
        </div>
      </div>

      <ol className="mt-5 flex flex-wrap items-center gap-1.5 text-xs">
        {(['IN', 'MIDDLE', 'OUT'] as const).map((c, i) => {
          const done = STEP_ORDER.indexOf(data.attendance_phase) > STEP_ORDER.indexOf(c)
          const active = data.attendance_phase === c
          return (
            <li key={c} className="flex items-center gap-1.5">
              {i > 0 && <span className="text-slate-300">→</span>}
              <span
                className={`rounded-full px-3 py-1 font-semibold ${
                  active
                    ? 'bg-slate-900 text-white dark:bg-sky-600'
                    : done
                      ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400'
                      : 'bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500'
                }`}
              >
                {c}
              </span>
            </li>
          )
        })}
        <li className="ml-2 text-slate-400 dark:text-slate-500">
          Late threshold: {data.late_threshold_minutes} min after start
        </li>
      </ol>
    </div>
  )
}

// Index positions for "has this checkpoint already passed?" - the phase list
// is ordered, so comparing indexes is enough.
const STEP_ORDER = [
  'NOT_STARTED',
  'IN',
  'IN_CLOSED',
  'MIDDLE',
  'MIDDLE_CLOSED',
  'OUT',
  'CLOSED',
]

function OfficersTab({
  eventId,
  eventCode,
  assignments,
  officers,
  loading,
  onChanged,
  onGoToRosterTab,
}: {
  eventId: string
  eventCode: string | null
  assignments: AssignmentRow[]
  officers: OfficerOption[]
  loading: boolean
  onChanged: () => void
  onGoToRosterTab: () => void
}) {
  const [officerId, setOfficerId] = useState('')
  const [course, setCourse] = useState(COURSE_OPTIONS[0].value)
  const [yearLevel, setYearLevel] = useState('1')
  const [section, setSection] = useState(SECTION_OPTIONS[0])
  const [saving, setSaving] = useState(false)

  async function assign() {
    if (!officerId) {
      notify.error('Missing details', 'Pick an officer to assign.')
      return
    }
    setSaving(true)
    try {
      const res = await adminFetch(`${API}/officer/events/${eventId}/officers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          officer_id: officerId,
          course,
          year_level: Number(yearLevel),
          section,
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        notify.error('Could not assign', body?.detail ?? 'Please try again.')
        return
      }
      notify.success('Officer assigned', `${course} · Year ${yearLevel} · ${section}`)
      setOfficerId('')
      onChanged()
    } finally {
      setSaving(false)
    }
  }

  async function unassign(row: AssignmentRow) {
    const confirmed = await confirmAction({
      title: `Remove ${row.officer_name}?`,
      text: `They will no longer be able to sign into the scanner for this event. Scans they already took stay in the record.`,
      confirmText: 'Remove',
      danger: true,
    })
    if (!confirmed) return

    const res = await adminFetch(`${API}/officer/events/${eventId}/officers/${row.id}`, {
      method: 'DELETE',
    })
    if (!res.ok) {
      notify.error('Could not remove', 'Please try again.')
      return
    }
    notify.success('Officer removed', row.officer_name)
    onChanged()
  }

  const sortedAssignments = useMemo(() => {
    return [...assignments].sort((a, b) => {
      const assignmentA = `${a.course}-${a.year_level}-${a.section}`
      const assignmentB = `${b.course}-${b.year_level}-${b.section}`
      return assignmentA.localeCompare(assignmentB) || a.officer_name.localeCompare(b.officer_name)
    })
  }, [assignments])

  return (
    <div className="mt-8 w-full space-y-6">
      <div className="flex items-start gap-2 rounded-xl border border-sky-200 dark:border-sky-900 bg-sky-50 dark:bg-sky-950/40 px-4 py-3 text-sm text-sky-900 dark:text-sky-300">
        <ScanLine className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          Officers sign into the scanner with event code{' '}
          <strong className="font-mono tracking-wider">{eventCode ?? '—'}</strong> and their own
          PIN. Each one covers a course, year level, and section{' '}
          <em>for this event only</em>, and scans whichever checkpoint you have open. More than one
          officer can cover the same course/year/section.
        </p>
      </div>

      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Assign an officer</h3>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr_auto] lg:items-end">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">Officer</label>
            <select
              value={officerId}
              onChange={(e) => setOfficerId(e.target.value)}
              className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-sky-500 focus:bg-white dark:focus:bg-slate-800 focus:outline-none"
            >
              <option value="">Select an officer...</option>
              {officers
                .filter((o) => o.is_active)
                .map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">Course</label>
            <select
              value={course}
              onChange={(e) => setCourse(e.target.value)}
              className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-sky-500 focus:bg-white dark:focus:bg-slate-800 focus:outline-none"
            >
              {COURSE_OPTIONS.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">Year</label>
            <select
              value={yearLevel}
              onChange={(e) => setYearLevel(e.target.value)}
              className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-sky-500 focus:bg-white dark:focus:bg-slate-800 focus:outline-none"
            >
              {[1, 2, 3, 4].map((y) => (
                <option key={y} value={y}>
                  Year {y}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">Section</label>
            <select
              value={section}
              onChange={(e) => setSection(e.target.value)}
              className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-sky-500 focus:bg-white dark:focus:bg-slate-800 focus:outline-none"
            >
              {SECTION_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <button
            onClick={() => void assign()}
            disabled={saving}
            className="w-full rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:opacity-50 lg:w-auto"
          >
            {saving ? 'Assigning...' : 'Assign'}
          </button>
        </div>
        {officers.filter((o) => o.is_active).length === 0 && !loading && (
          <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
            No active officers yet — add them under the{' '}
            <button onClick={onGoToRosterTab} className="font-medium text-sky-600 dark:text-sky-400 hover:underline">
              Scanner Officer
            </button>{' '}
            tab.
          </p>
        )}
      </div>

      {loading ? (
        <div className="space-y-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5">
          <div className="h-4 w-full animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
          <div className="h-4 w-2/3 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
        </div>
      ) : sortedAssignments.length === 0 ? (
        <EmptyState title="No officers assigned to this event yet." />
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="border-b border-slate-100 bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-400">
                <tr>
                  <th className="px-5 py-3">Officer</th>
                  <th className="px-5 py-3">Course</th>
                  <th className="px-5 py-3">Year</th>
                  <th className="px-5 py-3">Section</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3 text-right">Scans</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {sortedAssignments.map((row) => (
                  <tr
                    key={row.id}
                    className="border-b border-slate-50 last:border-0 dark:border-slate-800/60"
                  >
                    <td className="px-5 py-3 font-medium text-slate-900 dark:text-white">
                      {row.officer_name}
                    </td>
                    <td className="px-5 py-3 text-slate-600 dark:text-slate-300">{row.course}</td>
                    <td className="px-5 py-3 text-slate-500 dark:text-slate-400">
                      Year {row.year_level}
                    </td>
                    <td className="px-5 py-3 text-slate-500 dark:text-slate-400">{row.section}</td>
                    <td className="px-5 py-3">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
                          row.officer_active
                            ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400'
                            : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                        }`}
                      >
                        {row.officer_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right font-medium tabular-nums text-slate-600 dark:text-slate-300">
                      {row.scan_count}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <button
                        onClick={() => void unassign(row)}
                        className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 transition hover:bg-red-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950/30"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// ============================================================================
// SCANNER OFFICER ROSTER (global officer roster - create, rename, reset PIN,
// activate/deactivate. Not scoped to this event, but managed from here so
// there's one less top-level sidebar destination.)
// ============================================================================

type OfficerDialogMode =
  | { kind: 'create' }
  | { kind: 'pin'; officer: OfficerOption }
  | { kind: 'edit'; officer: OfficerOption }
  | null

function ScannerOfficerRosterTab({
  officers,
  loading,
  onChanged,
}: {
  officers: OfficerOption[]
  loading: boolean
  onChanged: () => void
}) {
  const [dialog, setDialog] = useState<OfficerDialogMode>(null)

  async function toggleActive(officer: OfficerOption) {
    const deactivating = officer.is_active
    if (deactivating) {
      const confirmed = await confirmAction({
        title: `Deactivate ${officer.name}?`,
        text: 'They will be signed out of any open scanner session immediately and their PIN will stop working.',
        confirmText: 'Deactivate',
        danger: true,
      })
      if (!confirmed) return
    }

    const res = await adminFetch(`${API}/officer/officers/${officer.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: officer.name, is_active: !officer.is_active }),
    })
    if (!res.ok) {
      notify.error('Update failed', 'Could not change this officer.')
      return
    }
    notify.success(deactivating ? 'Officer deactivated' : 'Officer activated', officer.name)
    onChanged()
  }

  return (
    <div className="mt-8 w-full space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start">
        <div className="flex min-w-0 flex-1 items-start gap-2 rounded-xl border border-sky-200 dark:border-sky-900 bg-sky-50 dark:bg-sky-950/40 px-4 py-3 text-sm text-sky-900 dark:text-sky-300">
          <ScanLine className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            An officer signs into the scanner with the <strong>event code</strong> and their own
            PIN, then scans whichever checkpoint the event currently has open. Assign them to a
            course, year, and section from the <strong>Officer Assignments</strong> tab.
          </p>
        </div>
        <button
          onClick={() => setDialog({ kind: 'create' })}
          className="inline-flex shrink-0 items-center justify-center gap-2 self-start rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-sky-700"
        >
          <Plus className="h-4 w-4" />
          Add Officer
        </button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
        {loading ? (
          <div className="space-y-3 p-6">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-5 w-full animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
            ))}
          </div>
        ) : officers.length === 0 ? (
          <EmptyState
            title="No officers yet"
            subtitle="Add the people who will be operating scanners during events."
          />
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              <tr>
                <th className="px-5 py-3">Officer</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">Event Assignments</th>
                <th className="px-5 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {officers.map((o) => (
                <tr key={o.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/60">
                  <td className="px-5 py-3 font-medium text-slate-900 dark:text-white">{o.name}</td>
                  <td className="px-5 py-3">
                    {o.is_active ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 dark:bg-emerald-950/40 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                        <UserCheck className="h-3.5 w-3.5" />
                        Active
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 dark:bg-slate-800 px-2.5 py-1 text-xs font-semibold text-slate-500 dark:text-slate-400">
                        <UserX className="h-3.5 w-3.5" />
                        Inactive
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-slate-600 dark:text-slate-300">{o.assignment_count}</td>
                  <td className="px-5 py-3">
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => setDialog({ kind: 'edit', officer: o })}
                        className="rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300 transition hover:bg-slate-50 dark:hover:bg-slate-800"
                      >
                        Rename
                      </button>
                      <button
                        onClick={() => setDialog({ kind: 'pin', officer: o })}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300 transition hover:bg-slate-50 dark:hover:bg-slate-800"
                      >
                        <KeyRound className="h-3.5 w-3.5" />
                        Reset PIN
                      </button>
                      <button
                        onClick={() => void toggleActive(o)}
                        className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                          o.is_active
                            ? 'border border-red-200 text-red-600 hover:bg-red-50'
                            : 'border border-emerald-200 text-emerald-700 hover:bg-emerald-50'
                        }`}
                      >
                        {o.is_active ? 'Deactivate' : 'Activate'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {dialog && (
        <OfficerDialog
          mode={dialog}
          onClose={() => setDialog(null)}
          onSaved={() => {
            setDialog(null)
            onChanged()
          }}
        />
      )}
    </div>
  )
}

function OfficerDialog({
  mode,
  onClose,
  onSaved,
}: {
  mode: NonNullable<OfficerDialogMode>
  onClose: () => void
  onSaved: () => void
}) {
  const [name, setName] = useState(mode.kind === 'create' ? '' : mode.officer.name)
  const [pin, setPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const needsPin = mode.kind === 'create' || mode.kind === 'pin'
  const title =
    mode.kind === 'create'
      ? 'Add Officer'
      : mode.kind === 'pin'
        ? `Reset PIN — ${mode.officer.name}`
        : 'Rename Officer'

  async function save() {
    setError(null)

    if (mode.kind !== 'pin' && !name.trim()) {
      setError('Name is required.')
      return
    }
    if (needsPin) {
      if (!/^\d{4,12}$/.test(pin)) {
        setError('PIN must be 4 to 12 digits.')
        return
      }
      if (pin !== confirmPin) {
        setError('The two PINs do not match.')
        return
      }
    }

    setSaving(true)
    try {
      let res: Response
      if (mode.kind === 'create') {
        res = await adminFetch(`${API}/officer/officers/`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: name.trim(), pin, confirm_pin: confirmPin, is_active: true }),
        })
      } else if (mode.kind === 'pin') {
        res = await adminFetch(`${API}/officer/officers/${mode.officer.id}/pin`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pin, confirm_pin: confirmPin }),
        })
      } else {
        res = await adminFetch(`${API}/officer/officers/${mode.officer.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: name.trim(), is_active: mode.officer.is_active }),
        })
      }

      if (!res.ok) {
        const body = await res.json().catch(() => null)
        setError(typeof body?.detail === 'string' ? body.detail : 'Could not save.')
        return
      }

      notify.success(
        mode.kind === 'create' ? 'Officer added' : mode.kind === 'pin' ? 'PIN updated' : 'Officer renamed',
        mode.kind === 'pin' ? 'Any open scanner session for them was ended.' : name.trim()
      )
      onSaved()
    } catch {
      setError('Could not reach the server.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 p-6 shadow-xl">
        <h2 className="text-base font-semibold text-slate-900 dark:text-white">{title}</h2>

        <div className="mt-4 space-y-3">
          {mode.kind !== 'pin' && (
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Name</label>
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Juan Dela Cruz"
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-4 py-2.5 text-sm text-slate-900 dark:text-white focus:border-sky-500 focus:bg-white dark:focus:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
              />
            </div>
          )}

          {needsPin && (
            <>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">New PIN</label>
                <input
                  type="password"
                  inputMode="numeric"
                  autoComplete="new-password"
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 12))}
                  placeholder="4–12 digits"
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-4 py-2.5 text-sm tracking-widest text-slate-900 dark:text-white focus:border-sky-500 focus:bg-white dark:focus:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Confirm PIN</label>
                <input
                  type="password"
                  inputMode="numeric"
                  autoComplete="new-password"
                  value={confirmPin}
                  onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, '').slice(0, 12))}
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-4 py-2.5 text-sm tracking-widest text-slate-900 dark:text-white focus:border-sky-500 focus:bg-white dark:focus:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
                />
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Write this down before saving — the PIN is stored hashed and can never be read back,
                only replaced.
              </p>
            </>
          )}

          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-2 text-sm font-semibold text-slate-600 dark:text-slate-300 transition hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            Cancel
          </button>
          <button
            onClick={() => void save()}
            disabled={saving}
            className="rounded-xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// SCAN AUDIT
// ============================================================================

interface ScanAuditRow {
  id: string
  checkpoint: string
  student_id: string
  student_name: string
  student_course: string | null
  student_year_level: number | null
  student_section: string | null
  officer_id: string | null
  officer_name: string | null
  officer_course: string | null
  officer_year_level: number | null
  officer_section: string | null
  cross_section: boolean
  scanned_at: string
}

const SCAN_CHECKPOINT_STYLE: Record<string, string> = {
  IN: 'bg-emerald-50 text-emerald-700',
  MIDDLE: 'bg-sky-50 text-sky-700',
  OUT: 'bg-violet-50 text-violet-700',
}

function ScanAuditTable({ eventId }: { eventId: string }) {
  const [scans, setScans] = useState<ScanAuditRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [crossOnly, setCrossOnly] = useState(false)
  const [pageSize, setPageSize] = useState(10)
  const [page, setPage] = useState(1)
  const [sortAsc, setSortAsc] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    adminFetch(`${API}/officer/events/${eventId}/checkpoint-scans`)
      .then((res) => (res.ok ? res.json() : { scans: [] }))
      .then((data) => {
        if (!cancelled) setScans(data.scans ?? [])
      })
      .catch(() => {
        if (!cancelled) notify.error('Failed to load', 'Could not load the scan audit trail.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [eventId])

  const filtered = useMemo(() => {
    let rows = scans
    const q = search.trim().toLowerCase()
    if (q) {
      rows = rows.filter(
        (r) =>
          r.student_name.toLowerCase().includes(q) ||
          r.student_id.toLowerCase().includes(q) ||
          (r.officer_name ?? '').toLowerCase().includes(q)
      )
    }
    if (crossOnly) rows = rows.filter((r) => r.cross_section)

    rows = [...rows].sort((a, b) => {
      const cmp = a.scanned_at.localeCompare(b.scanned_at)
      return sortAsc ? cmp : -cmp
    })
    return rows
  }, [scans, search, crossOnly, sortAsc])

  useEffect(() => {
    setPage(1)
  }, [search, crossOnly, pageSize])

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const paged = filtered.slice((page - 1) * pageSize, page * pageSize)

  return (
    <div className="mt-8 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
      <div className="space-y-3 border-b border-slate-100 dark:border-slate-800 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Scan Audit</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Every checkpoint scan for this event — who scanned whom, and when.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-500 dark:text-slate-400">Show</span>
            <select
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
              className="rounded-lg border border-slate-200 dark:border-slate-700 px-2 py-1.5 text-sm text-slate-700 dark:text-slate-300 focus:border-sky-500 focus:outline-none"
            >
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
            </select>
            <span className="text-sm text-slate-500 dark:text-slate-400">entries</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full sm:w-64">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search student or officer..."
              className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 py-2 pl-9 pr-3 text-sm text-slate-900 dark:text-white transition focus:border-sky-500 focus:bg-white dark:focus:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
            />
          </div>
          <button
            onClick={() => setCrossOnly(!crossOnly)}
            className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
              crossOnly
                ? 'border-amber-300 bg-amber-50 text-amber-700'
                : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
            }`}
          >
            Cross-section only
          </button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3 p-5">
          <div className="h-4 w-full animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
          <div className="h-4 w-full animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          title={scans.length === 0 ? 'No scans recorded yet.' : 'No scans match these filters.'}
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-left text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
              <tr>
                <th className="px-5 py-3">Checkpoint</th>
                <th className="px-5 py-3">Student</th>
                <th className="px-5 py-3">Scanned By</th>
                <th className="px-5 py-3">Officer's Assignment</th>
                <th className="px-5 py-3">Cross-Section</th>
                <th className="px-5 py-3">
                  <button
                    onClick={() => setSortAsc(!sortAsc)}
                    className="flex items-center gap-1 uppercase tracking-wide hover:text-slate-700 dark:hover:text-slate-200"
                  >
                    Scanned At <ArrowUpDown className="h-3 w-3" />
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              {paged.map((s) => (
                <tr key={s.id} className="border-b border-slate-50 dark:border-slate-800/60 last:border-0">
                  <td className="px-5 py-3">
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                        SCAN_CHECKPOINT_STYLE[s.checkpoint] ?? 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {s.checkpoint}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <p className="font-medium text-slate-900 dark:text-white">{s.student_name}</p>
                    <p className="text-xs text-slate-400 dark:text-slate-500">{s.student_id}</p>
                  </td>
                  <td className="px-5 py-3 text-slate-700 dark:text-slate-300">{s.officer_name ?? '(deleted officer)'}</td>
                  <td className="px-5 py-3 text-slate-500 dark:text-slate-400">
                    {s.officer_course
                      ? `${s.officer_course} · Year ${s.officer_year_level} · ${s.officer_section}`
                      : '—'}
                  </td>
                  <td className="px-5 py-3">
                    {s.cross_section ? (
                      <span
                        className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 dark:bg-amber-950/40 px-2.5 py-1 text-xs font-medium text-amber-700 dark:text-amber-400"
                        title={`Student is ${s.student_course ?? '?'} Year ${s.student_year_level ?? '?'} ${s.student_section ?? '?'}`}
                      >
                        <AlertTriangle className="h-3.5 w-3.5" />
                        Flagged
                      </span>
                    ) : (
                      <span className="text-xs text-slate-400 dark:text-slate-500">—</span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-slate-500 dark:text-slate-400">
                    {new Date(s.scanned_at).toLocaleString(undefined, {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && filtered.length > 0 && (
        <div className="flex items-center justify-between border-t border-slate-100 dark:border-slate-800 px-5 py-3 text-sm text-slate-500 dark:text-slate-400">
          <span>
            Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, filtered.length)} of{' '}
            {filtered.length}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="rounded-lg border border-slate-200 dark:border-slate-700 p-1.5 transition hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-medium text-white">{page}</span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="rounded-lg border border-slate-200 dark:border-slate-700 p-1.5 transition hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
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
      className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 focus:border-sky-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
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
      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 dark:bg-emerald-950/40 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-400">
        <CheckCircle2 className="h-3.5 w-3.5" />
        Present
      </span>
    )
  }
  if (status === 'LATE') {
    // Missed the IN sweep but was scanned at MIDDLE and OUT - attendance,
    // not absence, and not the same thing as the "Late" arrival-time chip.
    return (
      <span
        className="inline-flex items-center gap-1.5 rounded-full bg-orange-50 dark:bg-orange-950/40 px-2.5 py-1 text-xs font-medium text-orange-700 dark:text-orange-400"
        title="Scanned at MIDDLE and OUT but missed the IN checkpoint"
      >
        <Clock className="h-3.5 w-3.5" />
        Late
      </span>
    )
  }
  if (status === 'FOR_REVIEW') {
    return (
      <span
        className="inline-flex items-center gap-1.5 rounded-full bg-purple-50 dark:bg-purple-950/40 px-2.5 py-1 text-xs font-medium text-purple-700 dark:text-purple-400"
        title="Ambiguous checkpoint pattern - needs an admin to confirm before any penalty applies"
      >
        <AlertTriangle className="h-3.5 w-3.5" />
        For Review
      </span>
    )
  }
  if (status === 'INCOMPLETE') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-50 dark:bg-sky-950/40 px-2.5 py-1 text-xs font-medium text-sky-700 dark:text-sky-400">
        <Clock className="h-3.5 w-3.5" />
        Incomplete
      </span>
    )
  }
  if (status === 'ABSENT') {
    return (
      <span className="rounded-full bg-rose-50 dark:bg-rose-950/40 px-2.5 py-1 text-xs font-medium text-rose-700 dark:text-rose-400">
        Absent
      </span>
    )
  }
  if (status === 'NOT_REGISTERED') {
    return (
      <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-2.5 py-1 text-xs font-medium text-slate-500 dark:text-slate-400">
        Not Registered
      </span>
    )
  }
  if (status === 'EXCUSED') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 dark:bg-indigo-950/40 px-2.5 py-1 text-xs font-medium text-indigo-700 dark:text-indigo-400">
        <ShieldCheck className="h-3.5 w-3.5" />
        Excused
      </span>
    )
  }
  return (
    <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-2.5 py-1 text-xs font-medium text-slate-600 dark:text-slate-300">
      No-show
    </span>
  )
}
