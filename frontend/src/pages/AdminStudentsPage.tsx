import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Plus, Search, ArrowUpDown, Pencil, ChevronLeft, ChevronRight } from 'lucide-react'
import { notify } from '@/lib/toast'
import Sidebar, { MobileMenuButton } from '@/components/Sidebar'
import AdminProfileMenu from '@/components/AdminProfileMenu'
import { getAdminSidebarItems } from '@/lib/adminNav'
import EmptyState from '@/components/EmptyState'
import { adminFetch } from '@/lib/adminAuth'
import { API } from '@/lib/apiBase'

interface StudentRow {
  id: string
  student_id: string
  first_name: string
  middle_name: string | null
  last_name: string
  suffix: string | null
  email: string | null
  contact_number: string | null
  is_active: boolean
  program: string | null
  year_level: number | null
  section: string | null
  academic_standing: string | null
  enrollment_status: string | null
}

type SortKey = 'name' | 'student_id'

export default function AdminStudentsPage() {
  const navigate = useNavigate()
  const [students, setStudents] = useState<StudentRow[]>([])
  const [loading, setLoading] = useState(true)

  const [search, setSearch] = useState('')
  const [programFilter, setProgramFilter] = useState('ALL')
  const [yearFilter, setYearFilter] = useState('ALL')
  const [pageSize, setPageSize] = useState(25)
  const [page, setPage] = useState(1)
  const [sortKey, setSortKey] = useState<SortKey>('name')
  const [sortAsc, setSortAsc] = useState(true)
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    void loadStudents()
  }, [])

  async function loadStudents() {
    setLoading(true)
    try {
      const res = await adminFetch(`${API}/officer/students/`)
      if (res.ok) setStudents((await res.json()).students)
    } catch {
      notify.error('Network error', 'Could not load students.')
    } finally {
      setLoading(false)
    }
  }

  const programs = useMemo(
    () => Array.from(new Set(students.map((s) => s.program).filter((p): p is string => !!p))).sort(),
    [students]
  )
  const years = useMemo(
    () =>
      Array.from(new Set(students.map((s) => s.year_level).filter((y): y is number => y != null))).sort(
        (a, b) => a - b
      ),
    [students]
  )

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortAsc(!sortAsc)
    } else {
      setSortKey(key)
      setSortAsc(true)
    }
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    let list = students
    if (q) {
      list = list.filter(
        (s) =>
          s.student_id.toLowerCase().includes(q) ||
          `${s.first_name} ${s.last_name}`.toLowerCase().includes(q) ||
          `${s.last_name} ${s.first_name}`.toLowerCase().includes(q)
      )
    }
    if (programFilter !== 'ALL') list = list.filter((s) => s.program === programFilter)
    if (yearFilter !== 'ALL') list = list.filter((s) => String(s.year_level) === yearFilter)

    list = [...list].sort((a, b) => {
      const cmp =
        sortKey === 'student_id'
          ? a.student_id.localeCompare(b.student_id)
          : `${a.last_name}${a.first_name}`.localeCompare(`${b.last_name}${b.first_name}`)
      return sortAsc ? cmp : -cmp
    })
    return list
  }, [students, search, programFilter, yearFilter, sortKey, sortAsc])

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const paged = filtered.slice((page - 1) * pageSize, page * pageSize)

  useEffect(() => {
    setPage(1)
  }, [search, programFilter, yearFilter, pageSize])

  return (
    <div className="min-h-screen bg-slate-50 font-sans">
      <Sidebar
        title="PSITS Admin"
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        items={getAdminSidebarItems('students', navigate, () => navigate('/admin/events'))}
      />

      <div className="lg:pl-64">
        <header className="flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-6 py-4 lg:px-10">
          <div className="flex items-center gap-3">
            <MobileMenuButton onClick={() => setMenuOpen(true)} />
            <div>
              <h1 className="text-lg font-semibold text-slate-900">Student Management</h1>
              <p className="text-sm text-slate-500">View and manage the PSITS student roster</p>
            </div>
          </div>
          <AdminProfileMenu />
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
                    <option value={100}>100</option>
                  </select>
                  <span>entries</span>
                </div>

                <div className="flex items-center gap-2">
                  <div className="relative w-full sm:w-64">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search name or Student ID..."
                      className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm text-slate-900 transition focus:border-sky-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-500/20"
                    />
                  </div>
                  <Link
                    to="/admin/students/new"
                    className="flex shrink-0 items-center gap-1.5 rounded-lg bg-sky-600 px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-sky-700"
                  >
                    <Plus className="h-4 w-4" />
                    Add Student
                  </Link>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <select
                  value={programFilter}
                  onChange={(e) => setProgramFilter(e.target.value)}
                  className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-600 focus:border-sky-500 focus:outline-none"
                >
                  <option value="ALL">All Programs</option>
                  {programs.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
                <select
                  value={yearFilter}
                  onChange={(e) => setYearFilter(e.target.value)}
                  className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-600 focus:border-sky-500 focus:outline-none"
                >
                  <option value="ALL">All Years</option>
                  {years.map((y) => (
                    <option key={y} value={y}>
                      Year {y}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {loading ? (
              <div className="space-y-3 p-5">
                <div className="h-4 w-full animate-pulse rounded bg-slate-100" />
                <div className="h-4 w-full animate-pulse rounded bg-slate-100" />
              </div>
            ) : filtered.length === 0 ? (
              <EmptyState title={students.length === 0 ? 'No students found.' : 'No students match these filters.'} />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-slate-100 bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-5 py-3">
                        <button
                          onClick={() => toggleSort('student_id')}
                          className="flex items-center gap-1 uppercase tracking-wide hover:text-slate-700"
                        >
                          Student ID <ArrowUpDown className="h-3 w-3" />
                        </button>
                      </th>
                      <th className="px-5 py-3">
                        <button
                          onClick={() => toggleSort('name')}
                          className="flex items-center gap-1 uppercase tracking-wide hover:text-slate-700"
                        >
                          Name <ArrowUpDown className="h-3 w-3" />
                        </button>
                      </th>
                      <th className="px-5 py-3">Program</th>
                      <th className="px-5 py-3">Year / Section</th>
                      <th className="px-5 py-3">Standing</th>
                      <th className="px-5 py-3">Activated</th>
                      <th className="px-5 py-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paged.map((s) => (
                      <tr key={s.id} className="border-b border-slate-50 last:border-0">
                        <td className="px-5 py-3 font-mono text-xs text-slate-600">{s.student_id}</td>
                        <td className="px-5 py-3 text-slate-900">
                          {s.last_name}, {s.first_name}
                          {s.middle_name ? ` ${s.middle_name}` : ''}
                        </td>
                        <td className="px-5 py-3 text-slate-500">{s.program ?? '—'}</td>
                        <td className="px-5 py-3 text-slate-500">
                          {s.year_level ? `Year ${s.year_level}` : '—'}
                          {s.section ? ` · ${s.section}` : ''}
                        </td>
                        <td className="px-5 py-3">
                          <StandingBadge standing={s.academic_standing} />
                        </td>
                        <td className="px-5 py-3">
                          {s.is_active ? (
                            <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
                              Yes
                            </span>
                          ) : (
                            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-500">
                              Not yet
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-3">
                          <div className="flex items-center justify-end">
                            <Link
                              to={`/admin/students/${s.id}/edit`}
                              state={{ student: s }}
                              title="Edit"
                              className="rounded-lg p-2 text-sky-600 transition hover:bg-sky-50"
                            >
                              <Pencil className="h-4 w-4" />
                            </Link>
                          </div>
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
    </div>
  )
}

function StandingBadge({ standing }: { standing: string | null }) {
  if (standing === 'OVER_STAY') {
    return (
      <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700">Over Stay</span>
    )
  }
  if (standing === 'IRREGULAR') {
    return <span className="rounded-full bg-rose-50 px-2.5 py-1 text-xs font-medium text-rose-700">Irregular</span>
  }
  return <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">Regular</span>
}
