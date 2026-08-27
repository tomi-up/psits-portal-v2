import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { RefreshCw, ArrowRight, ClipboardCheck, Wallet, Gavel, Moon, Bell, ChevronDown, LogOut } from 'lucide-react'
import { notify } from '@/lib/toast'
import { confirmAction } from '@/lib/confirm'
import Sidebar, { MobileMenuButton } from '@/components/Sidebar'
import MigrationNotice from '@/components/MigrationNotice'
import RegistrationNotice from '@/components/RegistrationNotice'
import EmptyState from '@/components/EmptyState'
import { getStudentSidebarItems } from '@/lib/studentNav'
import { studentFetch } from '@/lib/studentAuth'

interface DashboardData {
  student: {
    student_id: string
    name: string
    email: string | null
    program: string | null
    year_level: number | null
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

const API = '/api/v1'

export default function StudentDashboardPage() {
  const navigate = useNavigate()
  const [studentId, setStudentId] = useState<string | null>(null)
  const [data, setData] = useState<DashboardData | null>(null)
  const [nextEvent, setNextEvent] = useState<EventItem | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const profileRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

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

  async function loadAll(isRefresh = false) {
    if (isRefresh) setRefreshing(true)
    else setLoading(true)
    try {
      const [dashRes, eventsRes] = await Promise.all([
        studentFetch(`${API}/student-auth/me/dashboard`),
        studentFetch(`${API}/events/`),
      ])
      if (dashRes.ok) setData(await dashRes.json())
      if (eventsRes.ok) {
        const events: EventItem[] = (await eventsRes.json()).events
        setNextEvent(events[0] ?? null) // already ordered by event_date by the backend
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
    <div className="min-h-screen bg-slate-50 font-sans">
      <MigrationNotice />
      <Sidebar
        title="PSITS Portal"
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        items={getStudentSidebarItems('dashboard', navigate)}
      />

      {/* Main */}
      <div className="lg:pl-64">
        <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-4 lg:px-10">
          <div className="flex items-start gap-3">
            <MobileMenuButton onClick={() => setMenuOpen(true)} />
          {isLoading ? (
            <div className="space-y-2">
              <div className="h-5 w-48 animate-pulse rounded bg-slate-200" />
              <div className="h-4 w-32 animate-pulse rounded bg-slate-100" />
            </div>
          ) : (
            <div className="flex flex-col gap-0.5">
            </div>
          )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => loadAll(true)}
              disabled={refreshing || isLoading}
              title="Refresh"
              className="rounded-full border border-slate-200 p-2.5 text-slate-500 transition hover:bg-slate-50 disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={() => notify.info('Coming soon', 'Dark mode is on the way.')}
              title="Toggle dark mode"
              className="rounded-full border border-slate-200 p-2.5 text-slate-500 transition hover:bg-slate-50"
            >
              <Moon className="h-4 w-4" />
            </button>
            <button
              onClick={() => notify.info('Coming soon', 'Notifications are on the way.')}
              title="Notifications"
              className="relative rounded-full border border-slate-200 p-2.5 text-slate-500 transition hover:bg-slate-50"
            >
              <Bell className="h-4 w-4" />
              <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-orange-500" />
            </button>

            {!isLoading && (
              <div ref={profileRef} className="relative">
                <button
                  onClick={() => setProfileOpen((o) => !o)}
                  className="flex items-center gap-2 rounded-full border border-slate-200 py-1 pl-1 pr-3 transition hover:bg-slate-50"
                >
                  <img
                    src={`https://api.dicebear.com/10.x/adventurer-neutral/svg?seed=${encodeURIComponent(data!.student.name)}`}
                    alt={data!.student.name}
                    className="h-8 w-8 rounded-full bg-slate-100"
                  />
                  <span className="text-sm font-medium text-slate-700">{data!.student.name.split(' ')[0]}</span>
                  <ChevronDown className="h-4 w-4 text-slate-400" />
                </button>

                {profileOpen && (
                  <div className="absolute right-0 z-20 mt-2 w-44 rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg">
                    <button
                      onClick={handleLogout}
                      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium text-rose-600 transition hover:bg-rose-50"
                    >
                      <LogOut className="h-4 w-4" />
                      Sign out
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </header>

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
                <StatCard label="Balance" value="Coming Soon" accent="emerald" icon={<Wallet className="h-4 w-4" />} />
                <StatCard label="Sanctions" value="Coming Soon" accent="amber" icon={<Gavel className="h-4 w-4" />} />
              </>
            )}
          </div>

          {/* Next upcoming event highlight */}
          <section className="mt-8">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-semibold text-slate-900">Upcoming Event</h2>
              <Link
                to="/events"
                className="inline-flex items-center gap-1.5 rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-700"
              >
                View all events
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>

            {isLoading ? (
              <div className="rounded-xl border border-slate-200 bg-white p-5">
                <div className="h-4 w-40 animate-pulse rounded bg-slate-200" />
                <div className="mt-2 h-3 w-56 animate-pulse rounded bg-slate-100" />
              </div>
            ) : !nextEvent ? (
              <div className="rounded-xl border border-slate-200 bg-white">
                <EmptyState title="No upcoming events." />
              </div>
            ) : (
              <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-5 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-semibold text-slate-900">{nextEvent.name}</p>
                  {nextEvent.event_date && (
                    <p className="mt-1 text-xs text-slate-400">
                      {new Date(nextEvent.event_date).toLocaleString(undefined, {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      })}
                    </p>
                  )}
                </div>
                {nextEvent.is_checked_out ? (
                  <span className="rounded-lg bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-700">
                    ✓ Present
                  </span>
                ) : nextEvent.is_registered ? (
                  <Link
                    to="/events"
                    className="rounded-lg bg-sky-600 px-4 py-2 text-center text-sm font-semibold text-white transition hover:bg-sky-700"
                  >
                    {nextEvent.is_checked_in ? 'Checked in — view QR' : 'View QR Code'}
                  </Link>
                ) : (
                  <Link
                    to="/events"
                    className="rounded-lg border border-sky-600 px-4 py-2 text-center text-sm font-semibold text-sky-600 transition hover:bg-sky-50"
                  >
                    Register
                  </Link>
                )}
              </div>
            )}
          </section>
        </main>
      </div>
    </div>
  )
}

function StatCard({
  label,
  value,
  accent,
  icon,
}: {
  label: string
  value: string
  accent: 'sky' | 'emerald' | 'amber'
  icon: ReactNode
}) {
  const colors = {
    sky: 'bg-sky-50 text-sky-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    amber: 'bg-amber-50 text-amber-600',
  }[accent]

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="flex items-center gap-2">
        <span className={`flex h-7 w-7 items-center justify-center rounded-lg ${colors}`}>{icon}</span>
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      </div>
      <p className="mt-2 text-2xl font-semibold text-slate-900">{value}</p>
    </div>
  )
}

function StatCardSkeleton() {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="h-3 w-24 animate-pulse rounded bg-slate-100" />
      <div className="mt-3 h-7 w-16 animate-pulse rounded bg-slate-200" />
    </div>
  )
}

function LogoSpinner() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 font-sans">
      <img src="/psits-logo.png" alt="PSITS" className="h-16 w-16 animate-spin-slow" />
    </div>
  )
}
