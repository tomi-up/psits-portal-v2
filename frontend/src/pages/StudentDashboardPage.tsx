import { useEffect, useState, type ReactNode } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { ArrowRight, ClipboardCheck, Wallet, Gavel, QrCode, UserPlus } from 'lucide-react'
import { notify } from '@/lib/toast'
import { confirmAction } from '@/lib/confirm'
import Sidebar from '@/components/Sidebar'
import StudentHeader from '@/components/StudentHeader'
import QrCodeModal from '@/components/QrCodeModal'
import RegistrationNotice from '@/components/RegistrationNotice'
import EmptyState from '@/components/EmptyState'
import { getStudentSidebarItems } from '@/lib/studentNav'
import { studentFetch } from '@/lib/studentAuth'
import { API } from '@/lib/apiBase'
import { startStudentTourIfFirstVisit } from '@/lib/tour'

interface DashboardData {
  student: {
    student_id: string
    name: string
    email: string | null
    program: string | null
    year_level: number | null
    avatar_url: string | null
  }
  balance: { amount_due: number; status: string }
  sanctions: unknown[]
  attendance: {
    event_id: string
    event_name: string
    time_in: string | null
    time_out: string | null
    status: 'INCOMPLETE' | 'PRESENT' | 'ABSENT' | 'NOT_REGISTERED'
    is_late: boolean
  }[]
}

interface EventItem {
  id: string
  name: string
  venue?: string | null
  description: string | null
  event_date: string | null
  attendance_required: boolean
  is_registered: boolean
  is_checked_in: boolean
  is_checked_out: boolean
}


export default function StudentDashboardPage() {
  const navigate = useNavigate()
  const [studentId, setStudentId] = useState<string | null>(null)
  const [data, setData] = useState<DashboardData | null>(null)
  const [nextEvent, setNextEvent] = useState<EventItem | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [qrEvent, setQrEvent] = useState<EventItem | null>(null)
  const [sanctionsCount, setSanctionsCount] = useState<number | null>(null)
  const [hasActiveSettlement, setHasActiveSettlement] = useState(false)

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
    void loadAll()
  }, [studentId])

  useEffect(() => {
    if (!loading && data) startStudentTourIfFirstVisit(() => setMenuOpen(true), () => setMenuOpen(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, data])

  async function loadAll(isRefresh = false) {
    if (isRefresh) setRefreshing(true)
    else setLoading(true)
    try {
      const [dashRes, eventsRes, sanctionsRes] = await Promise.all([
        studentFetch(`${API}/student-auth/me/dashboard`),
        studentFetch(`${API}/events/`),
        studentFetch(`${API}/sanctions/`),
      ])
      if (dashRes.ok) setData(await dashRes.json())
      if (eventsRes.ok) {
        const events: EventItem[] = (await eventsRes.json()).events
        setNextEvent(events[0] ?? null) // already ordered by event_date by the backend
      }
      if (sanctionsRes.ok) {
        const sanctionsData = await sanctionsRes.json()
        setSanctionsCount(sanctionsData.pending_count)
        setHasActiveSettlement(sanctionsData.active_settlement?.status === 'PENDING')
      }
    } catch {
      notify.error('Network error', 'Could not load your dashboard.')
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

  if (!studentId) {
    return <LogoSpinner />
  }

  const isLoading = loading || !data

  return (
    <div className="min-h-screen bg-slate-50 font-sans dark:bg-slate-950">
      <Sidebar
        title="PSITS Portal"
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        items={getStudentSidebarItems('dashboard', navigate)}
      />

      {/* Main */}
      <div className="lg:pl-64">
        <StudentHeader
          onMenuOpen={() => setMenuOpen(true)}
          onMenuClose={() => setMenuOpen(false)}
          onRefresh={() => loadAll(true)}
          refreshing={refreshing}
          loading={isLoading}
          studentName={isLoading ? null : data!.student.name}
          avatarUrl={isLoading ? null : data!.student.avatar_url}
          onLogout={handleLogout}
        />

        <main className="px-6 py-8 lg:px-10">
          <RegistrationNotice />

          {/* Stat cards */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {isLoading ? (
              <>
                <StatCardSkeleton />
                <StatCardSkeleton />
                <StatCardSkeleton />
              </>
            ) : (
              <>
                <StatCard
                  label="Events Attended"
                  value={String(data!.attendance.filter((a) => a.status !== 'NOT_REGISTERED').length)}
                  accent="sky"
                  icon={<ClipboardCheck className="h-4 w-4" />}
                />
                <StatCard
                  label="Balance"
                  value={
                    data!.balance.status === 'NO_DATA'
                      ? 'No dues yet'
                      : `₱${data!.balance.amount_due.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                  }
                  accent="emerald"
                  icon={<Wallet className="h-4 w-4" />}
                  href="/balance"
                />
                <StatCard
                  label="Sanctions"
                  value={
                    sanctionsCount === null
                      ? '...'
                      : sanctionsCount > 0
                        ? `${sanctionsCount} pending`
                        : hasActiveSettlement
                          ? 'In progress'
                          : 'Good standing'
                  }
                  accent={sanctionsCount ? 'rose' : hasActiveSettlement ? 'sky' : 'emerald'}
                  icon={<Gavel className="h-4 w-4" />}
                  href="/sanctions"
                />
              </>
            )}
          </div>

          {/* Next upcoming event highlight */}
          <section className="mt-8">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">Upcoming Event</h2>
              <Link
                to="/events"
                className="inline-flex items-center gap-1 text-sm font-semibold text-sky-600 transition hover:text-sky-700"
              >
                View all events
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>

            {isLoading ? (
              <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                <div className="h-4 w-40 animate-pulse rounded bg-slate-200 dark:bg-slate-700" />
                <div className="mt-2 h-3 w-56 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
              </div>
            ) : !nextEvent ? (
              <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
                <EmptyState title="No upcoming events." />
              </div>
            ) : (
              <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-semibold text-slate-900 dark:text-white">{nextEvent.name}</p>
                  {nextEvent.event_date && (
                    <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
                      {new Date(nextEvent.event_date).toLocaleString(undefined, {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      })}
                    </p>
                  )}
                </div>
                {nextEvent.is_checked_out ? (
                  <span className="rounded-lg bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
                    ✓ Present
                  </span>
                ) : nextEvent.is_registered ? (
                  <div className="flex items-center gap-2">
                    {nextEvent.is_checked_in && (
                      <span className="text-xs font-medium text-sky-600 dark:text-sky-400">Checked in</span>
                    )}
                    <button
                      onClick={() => setQrEvent(nextEvent)}
                      title={nextEvent.is_checked_in ? 'Checked in — view QR' : 'View QR Code'}
                      className="rounded-lg bg-sky-600 p-2.5 text-white transition hover:bg-sky-700"
                    >
                      <QrCode className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <Link
                    to="/events"
                    title="Register"
                    className="rounded-lg bg-sky-600 p-2.5 text-white transition hover:bg-sky-700"
                  >
                    <UserPlus className="h-4 w-4" />
                  </Link>
                )}
              </div>
            )}
          </section>
        </main>
      </div>

      {studentId && <QrCodeModal event={qrEvent} studentId={studentId} onClose={() => setQrEvent(null)} />}
    </div>
  )
}

function StatCard({
  label,
  value,
  accent,
  icon,
  href,
}: {
  label: string
  value: string
  accent: 'sky' | 'emerald' | 'amber' | 'rose'
  icon: ReactNode
  href?: string
}) {
  const colors = {
    sky: 'bg-sky-50 text-sky-600 dark:bg-sky-950/40 dark:text-sky-400',
    emerald: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400',
    amber: 'bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400',
    rose: 'bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400',
  }[accent]

  const content = (
    <>
      <div className="flex items-center gap-2">
        <span className={`flex h-7 w-7 items-center justify-center rounded-lg ${colors}`}>{icon}</span>
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</p>
      </div>
      <p className="mt-2 text-2xl font-semibold text-slate-900 dark:text-white">{value}</p>
    </>
  )

  const className =
    'rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900' +
    (href ? ' transition hover:border-sky-300 dark:hover:border-sky-700' : '')

  if (href) {
    return (
      <Link to={href} className={className}>
        {content}
      </Link>
    )
  }

  return <div className={className}>{content}</div>
}

function StatCardSkeleton() {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
      <div className="h-3 w-24 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
      <div className="mt-3 h-7 w-16 animate-pulse rounded bg-slate-200 dark:bg-slate-700" />
    </div>
  )
}

function LogoSpinner() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 font-sans dark:bg-slate-950">
      <img src="/psits-logo.png" alt="PSITS" className="h-16 w-16 animate-spin-slow" />
    </div>
  )
}
