import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { GraduationCap, Hash, Mail, BadgeCheck } from 'lucide-react'
import { notify } from '@/lib/toast'
import { confirmAction } from '@/lib/confirm'
import Sidebar from '@/components/Sidebar'
import StudentHeader from '@/components/StudentHeader'
import MigrationNotice from '@/components/MigrationNotice'
import { getStudentSidebarItems } from '@/lib/studentNav'
import { studentFetch } from '@/lib/studentAuth'
import { API } from '@/lib/apiBase'

interface ProfileData {
  student_id: string
  name: string
  email: string | null
  program: string | null
  year_level: number | null
  academic_standing: 'REGULAR' | 'IRREGULAR' | 'OVER_STAY' | null
  avatar_url: string | null
}

function ordinalYear(year: number | null): string {
  if (!year) return '—'
  const suffix = ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[year] ?? 'th'
  return `${year}${suffix} Year`
}

function academicStandingLabel(standing: ProfileData['academic_standing']): string {
  if (!standing) return '—'
  return { REGULAR: 'Regular', IRREGULAR: 'Irregular', OVER_STAY: 'Over Stay' }[standing]
}

export default function StudentProfilePage() {
  const navigate = useNavigate()
  const [data, setData] = useState<ProfileData | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    const stored = localStorage.getItem('user')
    if (!stored) {
      navigate('/login', { replace: true })
      return
    }
    void loadProfile()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function loadProfile(isRefresh = false) {
    if (isRefresh) setRefreshing(true)
    else setLoading(true)
    try {
      const res = await studentFetch(`${API}/student-auth/me/dashboard`)
      if (res.ok) setData((await res.json()).student)
    } catch {
      notify.error('Network error', 'Could not load your profile.')
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

  return (
    <div className="min-h-screen bg-slate-50 font-sans dark:bg-slate-950">
      <MigrationNotice />
      <Sidebar
        title="PSITS Portal"
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        items={getStudentSidebarItems('dashboard', navigate)}
      />

      <div className="lg:pl-64">
        <StudentHeader
          title="Profile"
          subtitle="Your account information"
          onMenuOpen={() => setMenuOpen(true)}
          onMenuClose={() => setMenuOpen(false)}
          onRefresh={() => loadProfile(true)}
          refreshing={refreshing}
          loading={loading}
          studentName={loading ? null : data?.name ?? null}
          avatarUrl={loading ? null : data?.avatar_url}
          onLogout={handleLogout}
        />

        <main className="px-6 py-8 lg:px-10">
          <div className="mx-auto max-w-xl">
            {loading || !data ? (
              <div className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
                <div className="flex items-center gap-4">
                  <div className="h-20 w-20 animate-pulse rounded-full bg-slate-200 dark:bg-slate-700" />
                  <div className="space-y-2">
                    <div className="h-5 w-40 animate-pulse rounded bg-slate-200 dark:bg-slate-700" />
                    <div className="h-4 w-24 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
                  </div>
                </div>
              </div>
            ) : (
              <>
                <div className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
                  <div className="flex items-center gap-4">
                    <img
                      src={
                        data.avatar_url ||
                        `https://api.dicebear.com/10.x/adventurer-neutral/svg?seed=${encodeURIComponent(data.name)}`
                      }
                      alt={data.name}
                      className="h-20 w-20 rounded-full bg-slate-100 object-cover"
                    />
                    <div>
                      <h2 className="text-lg font-semibold text-slate-900 dark:text-white">{data.name}</h2>
                      <p className="text-sm text-slate-500 dark:text-slate-400">{data.student_id}</p>
                    </div>
                  </div>
                </div>

                <div className="mt-4 divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
                  <ProfileRow icon={<Hash className="h-4 w-4" />} label="Student ID" value={data.student_id} />
                  <ProfileRow
                    icon={<GraduationCap className="h-4 w-4" />}
                    label="Program & Year"
                    value={
                      data.program ? `${data.program} · ${ordinalYear(data.year_level)}` : ordinalYear(data.year_level)
                    }
                  />
                  <ProfileRow icon={<Mail className="h-4 w-4" />} label="Email" value={data.email ?? '—'} />
                  <ProfileRow
                    icon={<BadgeCheck className="h-4 w-4" />}
                    label="Academic Status"
                    value={academicStandingLabel(data.academic_standing)}
                  />
                </div>
              </>
            )}
          </div>
        </main>
      </div>
    </div>
  )
}

function ProfileRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 px-5 py-4">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sky-50 text-sky-600 dark:bg-sky-950/40 dark:text-sky-400">
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">{label}</p>
        <p className="truncate text-sm font-medium text-slate-900 dark:text-white">{value}</p>
      </div>
    </div>
  )
}
