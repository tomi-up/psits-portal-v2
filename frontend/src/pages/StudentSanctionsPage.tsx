import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Gavel, ShieldCheck, Clock, Gift, HelpCircle } from 'lucide-react'
import { notify } from '@/lib/toast'
import { confirmAction } from '@/lib/confirm'
import Sidebar from '@/components/Sidebar'
import StudentHeader from '@/components/StudentHeader'
import { getStudentSidebarItems } from '@/lib/studentNav'
import { studentFetch } from '@/lib/studentAuth'
import { API } from '@/lib/apiBase'
import { startSanctionsTour, startSanctionsTourIfFirstVisit } from '@/lib/tour'

interface MissedEvent {
  event_id: string
  event_name: string
  event_date: string | null
}

interface DonationOption {
  key: string
  label: string
  quantity: number
}

interface ActiveSettlement {
  id: string
  resolution_type: 'COMMUNITY_SERVICE' | 'DONATION'
  sanctions_count: number
  donation_item: string | null
  donation_label: string | null
  donation_quantity: number | null
  community_service_hours_required: number | null
  community_service_hours_logged: number | null
  status: 'PENDING' | 'REJECTED' | 'APPROVED' | 'COMPLETED'
  rejection_reason: string | null
  created_at: string
}

interface SanctionsData {
  pending_count: number
  missed_events: MissedEvent[]
  donation_options: DonationOption[]
  community_service_hours_required: number
  active_settlement: ActiveSettlement | null
}

export default function StudentSanctionsPage() {
  const navigate = useNavigate()
  const [studentId, setStudentId] = useState<string | null>(null)
  const [studentName, setStudentName] = useState<string | null>(null)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [data, setData] = useState<SanctionsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  const [selectedDonation, setSelectedDonation] = useState('')
  const [submitting, setSubmitting] = useState(false)

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
    void loadSanctions()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId])

  useEffect(() => {
    if (!loading) startSanctionsTourIfFirstVisit()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, data])

  async function loadSanctions(isRefresh = false) {
    if (isRefresh) setRefreshing(true)
    else setLoading(true)
    try {
      const res = await studentFetch(`${API}/sanctions/`)
      if (res.ok) {
        const d = await res.json()
        setData(d)
        if (d.donation_options.length > 0) setSelectedDonation(d.donation_options[0].key)
      }
    } catch {
      notify.error('Network error', 'Could not load your sanctions.')
    } finally {
      if (isRefresh) setRefreshing(false)
      else setLoading(false)
    }
  }

  async function handleSubmit(resolutionType: 'COMMUNITY_SERVICE' | 'DONATION') {
    const confirmed = await confirmAction({
      title: resolutionType === 'COMMUNITY_SERVICE' ? 'Commit to community service?' : 'Submit this donation?',
      text:
        resolutionType === 'COMMUNITY_SERVICE'
          ? `You're committing to ${data?.community_service_hours_required} hours of community service. An admin will log your hours as you complete them.`
          : 'An admin will confirm once the item is received.',
      confirmText: 'Confirm',
    })
    if (!confirmed) return

    setSubmitting(true)
    try {
      const res = await studentFetch(`${API}/sanctions/settle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          resolutionType === 'COMMUNITY_SERVICE'
            ? { resolution_type: 'COMMUNITY_SERVICE' }
            : { resolution_type: 'DONATION', donation_item: selectedDonation }
        ),
      })
      if (!res.ok) {
        const err = await res.json()
        notify.error('Could not submit', err.detail || 'Please try again.')
        return
      }
      notify.success('Submitted', 'Your sanction settlement is on record.')
      await loadSanctions()
    } catch {
      notify.error('Network error', 'Could not reach the server.')
    } finally {
      setSubmitting(false)
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

  if (!studentId) return null

  const hasActivePending = data?.active_settlement && data.active_settlement.status === 'PENDING'

  return (
    <div className="min-h-screen bg-slate-50 font-sans dark:bg-slate-950">
      <Sidebar
        title="PSITS Portal"
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        items={getStudentSidebarItems('sanctions', navigate)}
      />

      <div className="lg:pl-64">
        <StudentHeader
          title="Sanctions"
          subtitle="Settle missed required events with community service or a donation"
          onMenuOpen={() => setMenuOpen(true)}
          onMenuClose={() => setMenuOpen(false)}
          onRefresh={() => loadSanctions(true)}
          refreshing={refreshing}
          loading={loading}
          studentName={studentName}
          avatarUrl={avatarUrl}
          onLogout={handleLogout}
        />

        <main className="px-6 py-8 lg:px-10">
          <div className="mb-4 flex justify-end">
            <button
              onClick={startSanctionsTour}
              title="Take a tour of this page"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <HelpCircle className="h-3.5 w-3.5" />
              How this works
            </button>
          </div>

          {loading ? (
            <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
              <div className="h-4 w-full animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
              <div className="h-4 w-2/3 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
            </div>
          ) : !data || (data.pending_count === 0 && !data.active_settlement) ? (
            <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white p-10 text-center dark:border-slate-800 dark:bg-slate-900">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400">
                <ShieldCheck className="h-6 w-6" />
              </span>
              <p className="font-semibold text-slate-900 dark:text-white">No sanctions on record</p>
              <p className="max-w-sm text-sm text-slate-500 dark:text-slate-400">
                You're in good standing. Attend required events (or submit an excuse request beforehand) to keep it
                that way.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Missed events summary - only the ones not yet claimed by a settlement */}
              {data.pending_count > 0 && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 p-5 dark:border-rose-900 dark:bg-rose-950/20">
                  <div className="flex items-center gap-2">
                    <Gavel className="h-4 w-4 text-rose-600 dark:text-rose-400" />
                    <h2 className="text-sm font-semibold text-rose-800 dark:text-rose-300">
                      {data.pending_count} unexcused absence{data.pending_count > 1 ? 's' : ''} from required events
                    </h2>
                  </div>
                  <ul className="mt-3 space-y-1 text-sm text-rose-700 dark:text-rose-400">
                    {data.missed_events.map((e) => (
                      <li key={e.event_id}>
                        {e.event_name}
                        {e.event_date && (
                          <span className="text-rose-500 dark:text-rose-500">
                            {' '}
                            — {new Date(e.event_date).toLocaleDateString(undefined, { dateStyle: 'medium' })}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Active settlement status */}
              {data.active_settlement && data.active_settlement.status !== 'APPROVED' && (
                <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                  {data.active_settlement.status === 'REJECTED' && (
                    <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-400">
                      <p className="font-medium">Your previous submission was rejected.</p>
                      <p className="mt-1">Reason: {data.active_settlement.rejection_reason}</p>
                      <p className="mt-1">You may submit a new one below.</p>
                    </div>
                  )}

                  {data.active_settlement.status === 'PENDING' &&
                    data.active_settlement.resolution_type === 'DONATION' && (
                      <div className="flex items-center gap-3">
                        <Gift className="h-5 w-5 text-sky-600 dark:text-sky-400" />
                        <div>
                          <p className="text-sm font-semibold text-slate-900 dark:text-white">
                            {data.active_settlement.donation_quantity}x {data.active_settlement.donation_label}
                          </p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            Submitted — awaiting admin confirmation of receipt.
                          </p>
                        </div>
                      </div>
                    )}

                  {data.active_settlement.status === 'PENDING' &&
                    data.active_settlement.resolution_type === 'COMMUNITY_SERVICE' && (
                      <div>
                        <div className="flex items-center gap-2">
                          <Clock className="h-4 w-4 text-sky-600 dark:text-sky-400" />
                          <p className="text-sm font-semibold text-slate-900 dark:text-white">
                            Community Service Progress
                          </p>
                        </div>
                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                          {data.active_settlement.community_service_hours_logged ?? 0} of{' '}
                          {data.active_settlement.community_service_hours_required} hours logged by an admin.
                        </p>
                        <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                          <div
                            className="h-full rounded-full bg-sky-600 transition-all"
                            style={{
                              width: `${Math.min(
                                100,
                                ((data.active_settlement.community_service_hours_logged ?? 0) /
                                  (data.active_settlement.community_service_hours_required ?? 1)) *
                                  100
                              )}%`,
                            }}
                          />
                        </div>
                      </div>
                    )}
                </div>
              )}

              {/* Choice UI - only when nothing is currently pending review/in progress */}
              {!hasActivePending && (
                <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                  <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Choose How to Settle</h2>
                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <div id="tour-sanctions-community-service" className="rounded-lg border border-slate-200 p-4 dark:border-slate-700">
                      <div className="flex items-center gap-2">
                        <Clock className="h-4 w-4 text-sky-600 dark:text-sky-400" />
                        <p className="text-sm font-semibold text-slate-900 dark:text-white">Community Service</p>
                      </div>
                      <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">
                        {data.community_service_hours_required} hrs
                      </p>
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        2 hours per absence. An admin logs your completed hours over time.
                      </p>
                      <button
                        onClick={() => handleSubmit('COMMUNITY_SERVICE')}
                        disabled={submitting}
                        className="mt-4 w-full rounded-lg bg-sky-600 py-2 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:opacity-50"
                      >
                        Commit to Community Service
                      </button>
                    </div>

                    <div id="tour-sanctions-donation" className="rounded-lg border border-slate-200 p-4 dark:border-slate-700">
                      <div className="flex items-center gap-2">
                        <Gift className="h-4 w-4 text-sky-600 dark:text-sky-400" />
                        <p className="text-sm font-semibold text-slate-900 dark:text-white">Donation in Kind</p>
                      </div>
                      <select
                        value={selectedDonation}
                        onChange={(e) => setSelectedDonation(e.target.value)}
                        className="mt-3 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:border-sky-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                      >
                        {data.donation_options.map((opt) => (
                          <option key={opt.key} value={opt.key}>
                            {opt.quantity}x {opt.label}
                          </option>
                        ))}
                      </select>
                      <button
                        onClick={() => handleSubmit('DONATION')}
                        disabled={submitting || !selectedDonation}
                        className="mt-4 w-full rounded-lg border border-slate-200 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                      >
                        Submit This Donation
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
