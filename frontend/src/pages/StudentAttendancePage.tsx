import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, ArrowUpDown, ChevronLeft, ChevronRight, ShieldCheck } from 'lucide-react'
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
  status: 'INCOMPLETE' | 'PRESENT' | 'ABSENT' | 'NOT_REGISTERED' | 'EXCUSED' | 'LATE' | 'FOR_REVIEW'
  is_late: boolean
  survey_status: 'PENDING' | 'SUBMITTED' | null
  review_status: 'PENDING' | 'APPROVED' | 'REJECTED' | null
  review_rejection_reason: string | null
}

interface SurveyQuestion {
  id: string
  text: string
}

interface SurveySection {
  title: string
  questions: SurveyQuestion[]
}

interface RatingOption {
  value: number
  label: string
}

interface SurveyData {
  event_name: string
  sections: SurveySection[]
  rating_scale: RatingOption[]
  already_submitted: boolean
  answers: Record<string, number | string> | null
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

  const [reviewModal, setReviewModal] = useState<{ eventId: string; eventName: string } | null>(null)

  const [surveyEvent, setSurveyEvent] = useState<{ id: string; name: string } | null>(null)
  const [surveyData, setSurveyData] = useState<SurveyData | null>(null)
  const [surveyLoading, setSurveyLoading] = useState(false)
  const [surveyAnswers, setSurveyAnswers] = useState<Record<string, number>>({})
  const [surveyComments, setSurveyComments] = useState('')
  const [submittingSurvey, setSubmittingSurvey] = useState(false)

  useEffect(() => {
    const stored = sessionStorage.getItem('user')
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

  useEffect(() => {
    if (!surveyEvent) {
      setSurveyData(null)
      setSurveyAnswers({})
      setSurveyComments('')
      return
    }

    setSurveyLoading(true)
    studentFetch(`${API}/events/${surveyEvent.id}/survey`)
      .then(async (res) => {
        if (!res.ok) {
          const err = await res.json()
          notify.error('Could not load survey', err.detail || 'Please try again.')
          setSurveyEvent(null)
          return
        }
        const data: SurveyData = await res.json()
        setSurveyData(data)
        if (data.answers) {
          const { comments, ...ratings } = data.answers
          setSurveyAnswers(ratings as Record<string, number>)
          setSurveyComments(typeof comments === 'string' ? comments : '')
        }
      })
      .catch(() => {
        notify.error('Network error', 'Could not load the survey.')
        setSurveyEvent(null)
      })
      .finally(() => setSurveyLoading(false))
  }, [surveyEvent])

  async function handleSubmitSurvey() {
    if (!surveyEvent || !surveyData) return

    const allQuestionIds = surveyData.sections.flatMap((s) => s.questions.map((q) => q.id))
    const unanswered = allQuestionIds.filter((id) => !surveyAnswers[id])
    if (unanswered.length > 0) {
      notify.error('Incomplete survey', 'Please answer every question before submitting.')
      return
    }

    setSubmittingSurvey(true)
    try {
      const res = await studentFetch(`${API}/events/${surveyEvent.id}/survey`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers: { ...surveyAnswers, comments: surveyComments.trim() } }),
      })
      if (!res.ok) {
        const err = await res.json()
        notify.error('Could not submit', err.detail || 'Please try again.')
        return
      }
      notify.success('Attendance Confirmed', 'Your post-event survey was submitted successfully.')
      setSurveyEvent(null)
      await loadAttendance(true)
    } catch {
      notify.error('Network error', 'Could not reach the server.')
    } finally {
      setSubmittingSurvey(false)
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

    sessionStorage.removeItem('access_token')
    sessionStorage.removeItem('user')
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
                  <option value="LATE">Late</option>
                  <option value="FOR_REVIEW">For Review</option>
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
                      <th className="px-5 py-3">Action</th>
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
                          {a.status === 'PRESENT' && a.survey_status === 'PENDING' ? (
                            <span
                              className="inline-flex items-center gap-1.5 rounded-full bg-sky-50 px-2.5 py-1 text-xs font-medium text-sky-700 dark:bg-sky-950/40 dark:text-sky-400"
                              title="You attended, but still need to submit the post-event survey"
                            >
                              Attendance Pending
                            </span>
                          ) : a.status === 'PRESENT' ? (
                            <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
                              Present
                            </span>
                          ) : a.status === 'LATE' ? (
                            <span
                              className="rounded-full bg-orange-50 px-2.5 py-1 text-xs font-medium text-orange-700 dark:bg-orange-950/40 dark:text-orange-400"
                              title="Scanned at MIDDLE and OUT but missed the IN checkpoint"
                            >
                              Late
                            </span>
                          ) : a.status === 'FOR_REVIEW' ? (
                            <span
                              className="rounded-full bg-purple-50 px-2.5 py-1 text-xs font-medium text-purple-700 dark:bg-purple-950/40 dark:text-purple-400"
                              title="Your scan pattern needs an admin to confirm before this is finalized"
                            >
                              For Review
                            </span>
                          ) : a.status === 'ABSENT' ? (
                            <span className="rounded-full bg-rose-50 px-2.5 py-1 text-xs font-medium text-rose-700 dark:bg-rose-950/40 dark:text-rose-400">
                              Absent
                            </span>
                          ) : a.status === 'NOT_REGISTERED' ? (
                            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400">
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
                        <td className="px-5 py-3">
                          {a.status === 'PRESENT' && a.survey_status === 'PENDING' ? (
                            <button
                              onClick={() => setSurveyEvent({ id: a.event_id, name: a.event_name })}
                              className="rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-sky-700"
                            >
                              Take Survey
                            </button>
                          ) : a.status === 'PRESENT' && a.survey_status === 'SUBMITTED' ? (
                            <span className="text-xs text-slate-400 dark:text-slate-500">Survey submitted</span>
                          ) : a.status === 'FOR_REVIEW' && a.review_status === 'PENDING' ? (
                            <span className="text-xs text-slate-500 dark:text-slate-400">Awaiting review</span>
                          ) : a.status === 'FOR_REVIEW' && a.review_status === 'REJECTED' ? (
                            <div>
                              <p className="text-[11px] italic text-rose-500">
                                Rejected: {a.review_rejection_reason}
                              </p>
                              <button
                                onClick={() => setReviewModal({ eventId: a.event_id, eventName: a.event_name })}
                                className="text-xs font-medium text-sky-600 hover:underline"
                              >
                                Resubmit explanation
                              </button>
                            </div>
                          ) : a.status === 'FOR_REVIEW' ? (
                            <button
                              onClick={() => setReviewModal({ eventId: a.event_id, eventName: a.event_name })}
                              className="rounded-lg border border-purple-200 bg-purple-50 px-3 py-1.5 text-xs font-medium text-purple-700 transition hover:bg-purple-100 dark:border-purple-900 dark:bg-purple-950/40 dark:text-purple-400"
                            >
                              Explain why
                            </button>
                          ) : (
                            <span className="text-xs text-slate-300 dark:text-slate-600">—</span>
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

      {reviewModal && (
        <AttendanceReviewModal
          eventName={reviewModal.eventName}
          onClose={() => setReviewModal(null)}
          onSubmitted={() => {
            setReviewModal(null)
            void loadAttendance(true)
          }}
          submit={async (reason) => {
            const res = await studentFetch(`${API}/events/${reviewModal.eventId}/attendance-review`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ reason }),
            })
            return res
          }}
        />
      )}

      {surveyEvent && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
          onClick={() => setSurveyEvent(null)}
        >
          <div
            className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-2xl bg-white shadow-xl dark:bg-slate-900"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b border-slate-100 p-6 pb-4 dark:border-slate-800">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Post-Event Survey</h3>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{surveyEvent.name}</p>
            </div>

            <div className="flex-1 overflow-y-auto p-6 pt-4">
              {surveyLoading || !surveyData ? (
                <div className="space-y-3">
                  <div className="h-4 w-full animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
                  <div className="h-4 w-2/3 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
                </div>
              ) : surveyData.already_submitted ? (
                <p className="rounded-xl bg-emerald-50 p-3 text-center text-sm font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
                  You've already submitted this survey. Thank you!
                </p>
              ) : (
                <div className="space-y-6">
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Please give your honest assessment using the scale below for each statement.
                  </p>

                  {surveyData.sections.map((section, sIdx) => (
                    <div key={section.title}>
                      <h4 className="text-sm font-semibold text-slate-900 dark:text-white">
                        {sIdx + 1}. {section.title}
                      </h4>
                      <div className="mt-3 space-y-4">
                        {section.questions.map((q) => (
                          <div key={q.id}>
                            <p className="text-sm text-slate-700 dark:text-slate-300">{q.text}</p>
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {surveyData.rating_scale.map((opt) => (
                                <button
                                  key={opt.value}
                                  type="button"
                                  onClick={() => setSurveyAnswers((prev) => ({ ...prev, [q.id]: opt.value }))}
                                  title={opt.label}
                                  className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                                    surveyAnswers[q.id] === opt.value
                                      ? 'bg-sky-600 text-white'
                                      : 'border border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                                  }`}
                                >
                                  {opt.value} - {opt.label}
                                </button>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}

                  <div>
                    <h4 className="text-sm font-semibold text-slate-900 dark:text-white">
                      Additional Comments (optional)
                    </h4>
                    <textarea
                      value={surveyComments}
                      onChange={(e) => setSurveyComments(e.target.value)}
                      placeholder="Any additional comments about the activity..."
                      rows={3}
                      className="mt-2 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 transition focus:border-sky-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="border-t border-slate-100 p-6 pt-4 dark:border-slate-800">
              {surveyData && !surveyData.already_submitted && (
                <button
                  onClick={handleSubmitSurvey}
                  disabled={submittingSurvey}
                  className="w-full rounded-lg bg-sky-600 py-2 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:opacity-50"
                >
                  {submittingSurvey ? 'Submitting...' : 'Submit Survey'}
                </button>
              )}
              <button
                onClick={() => setSurveyEvent(null)}
                className="mt-3 w-full rounded-lg border border-slate-200 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function AttendanceReviewModal({
  eventName,
  onClose,
  onSubmitted,
  submit,
}: {
  eventName: string
  onClose: () => void
  onSubmitted: () => void
  submit: (reason: string) => Promise<Response>
}) {
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit() {
    const trimmed = reason.trim()
    if (!trimmed) {
      setError('Please explain what happened.')
      return
    }

    setSaving(true)
    setError(null)
    try {
      const res = await submit(trimmed)
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        setError(typeof body?.detail === 'string' ? body.detail : 'Could not submit. Please try again.')
        return
      }
      notify.success('Explanation submitted', 'An admin will review it shortly.')
      onSubmitted()
    } catch {
      setError('Could not reach the server.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl dark:bg-slate-900">
        <h2 className="text-base font-semibold text-slate-900 dark:text-white">
          Explain your attendance — {eventName}
        </h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Your scans for this event were incomplete (e.g. you may have missed the middle
          checkpoint). Tell us what happened — an admin will review it.
        </p>

        <textarea
          autoFocus
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={4}
          placeholder="e.g. I stepped out briefly for an emergency and missed the middle scan."
          className="mt-4 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 focus:border-sky-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
        />

        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            Cancel
          </button>
          <button
            onClick={() => void handleSubmit()}
            disabled={saving}
            className="rounded-xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:opacity-50"
          >
            {saving ? 'Submitting...' : 'Submit'}
          </button>
        </div>
      </div>
    </div>
  )
}
