import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, ArrowUpDown, ChevronLeft, ChevronRight, UserX, ShieldCheck } from 'lucide-react'
import { notify } from '@/lib/toast'
import { confirmAction } from '@/lib/confirm'
import Sidebar from '@/components/Sidebar'
import StudentHeader from '@/components/StudentHeader'
import { getStudentSidebarItems } from '@/lib/studentNav'
import EmptyState from '@/components/EmptyState'
import { studentFetch } from '@/lib/studentAuth'
import { API } from '@/lib/apiBase'

interface AttendanceRow {
  event_id: string
  event_name: string
  time_in: string | null
  time_out: string | null
  status: 'INCOMPLETE' | 'PRESENT' | 'ABSENT' | 'NOT_REGISTERED' | 'EXCUSED'
  is_late: boolean
}

type SortKey = 'event_name' | 'time_in'

export default function StudentAttendancePage() {
  const navigate = useNavigate()
  const [studentId, setStudentId] = useState<string | null>(null)
  const [studentName, setStudentName] = useState<string | null>(null)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [attendance, setAttendance] = useState<AttendanceRow[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [lateOnly, setLateOnly] = useState(false)
  const [pageSize, setPageSize] = useState(10)
  const [page, setPage] = useState(1)
  const [sortKey, setSortKey] = useState<SortKey>('time_in')
  const [sortAsc, setSortAsc] = useState(false)

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
    void loadAttendance()
  }, [studentId])

  async function loadAttendance(isRefresh = false) {
    if (isRefresh) setRefreshing(true)
    else setLoading(true)
    try {
      const res = await studentFetch(`${API}/student-auth/me/dashboard`)
      if (res.ok) setAttendance((await res.json()).attendance)
    } catch {
      notify.error('Network error', 'Could not load attendance history.')
    } finally {
      if (isRefresh) setRefreshing(false)
      else setLoading(false)
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

  const filtered = useMemo(() => {
    let rows = attendance

    const q = search.trim().toLowerCase()
    if (q) rows = rows.filter((r) => r.event_name.toLowerCase().includes(q))
    if (statusFilter !== 'ALL') rows = rows.filter((r) => r.status === statusFilter)
    if (lateOnly) rows = rows.filter((r) => r.is_late)

    rows = [...rows].sort((a, b) => {
      const cmp =
        sortKey === 'event_name'
          ? a.event_name.localeCompare(b.event_name)
          : (a.time_in ?? '').localeCompare(b.time_in ?? '')
      return sortAsc ? cmp : -cmp
    })

    return rows
  }, [attendance, search, statusFilter, lateOnly, sortKey, sortAsc])

  useEffect(() => {
    setPage(1)
  }, [search, statusFilter, lateOnly, pageSize])

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
    <div className="min-h-screen bg-slate-50 font-sans dark:bg-slate-950">
      <Sidebar
        title="PSITS Portal"
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        items={getStudentSidebarItems('attendance', navigate)}
      />

      <div className="lg:pl-64">
        <StudentHeader
          title="Attendance History"
          subtitle="Every event you've checked in to"
          onMenuOpen={() => setMenuOpen(true)}
          onMenuClose={() => setMenuOpen(false)}
          onRefresh={() => loadAttendance(true)}
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
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-600 focus:border-sky-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                >
                  <option value="ALL">All Status</option>
                  <option value="PRESENT">Present</option>
                  <option value="INCOMPLETE">Incomplete</option>
                  <option value="ABSENT">Absent</option>
                  <option value="NOT_REGISTERED">Not Registered</option>
                  <option value="EXCUSED">Excused</option>
                </select>
                <button
                  onClick={() => setLateOnly(!lateOnly)}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                    lateOnly
                      ? 'border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-400'
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
                title={attendance.length === 0 ? 'No attendance recorded yet.' : 'No records match these filters.'}
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-slate-100 bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-400">
                    <tr>
                      <th className="px-5 py-3">
                        <button
                          onClick={() => toggleSort('event_name')}
                          className="flex items-center gap-1 uppercase tracking-wide hover:text-slate-700 dark:hover:text-slate-200"
                        >
                          Event <ArrowUpDown className="h-3 w-3" />
                        </button>
                      </th>
                      <th className="px-5 py-3">
                        <button
                          onClick={() => toggleSort('time_in')}
                          className="flex items-center gap-1 uppercase tracking-wide hover:text-slate-700 dark:hover:text-slate-200"
                        >
                          Time In <ArrowUpDown className="h-3 w-3" />
                        </button>
                      </th>
                      <th className="px-5 py-3">Time Out</th>
                      <th className="px-5 py-3">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paged.map((a, i) => (
                      <tr key={i} className="border-b border-slate-50 last:border-0 dark:border-slate-800/60">
                        <td className="px-5 py-3 text-slate-900 dark:text-white">{a.event_name}</td>
                        <td className="px-5 py-3 text-slate-500 dark:text-slate-400">
                          {a.time_in ? (
                            <>
                              {new Date(a.time_in).toLocaleTimeString(undefined, { timeStyle: 'short' })}
                              {a.is_late && (
                                <span className="ml-1.5 rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-950/40 dark:text-amber-400">
                                  Late
                                </span>
                              )}
                            </>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="px-5 py-3 text-slate-500 dark:text-slate-400">
                          {a.time_out
                            ? new Date(a.time_out).toLocaleTimeString(undefined, { timeStyle: 'short' })
                            : '—'}
                        </td>
                        <td className="px-5 py-3">
                          {a.status === 'PRESENT' ? (
                            <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
                              Present
                            </span>
                          ) : a.status === 'ABSENT' ? (
                            <span className="rounded-full bg-rose-50 px-2.5 py-1 text-xs font-medium text-rose-700 dark:bg-rose-950/40 dark:text-rose-400">
                              Absent
                            </span>
                          ) : a.status === 'NOT_REGISTERED' ? (
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                              <UserX className="h-3.5 w-3.5" />
                              Not Registered
                            </span>
                          ) : a.status === 'EXCUSED' ? (
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-400">
                              <ShieldCheck className="h-3.5 w-3.5" />
                              Excused
                            </span>
                          ) : (
                            <span className="rounded-full bg-sky-50 px-2.5 py-1 text-xs font-medium text-sky-700 dark:bg-sky-950/40 dark:text-sky-400">
                              Incomplete
                            </span>
                          )}
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
    </div>
  )
}
