import { useEffect, useState } from 'react'
import { useNavigate, useParams, useLocation, Link } from 'react-router-dom'
import { Clock, Type, MapPin, Image as ImageIcon, AlignLeft, ArrowLeft } from 'lucide-react'
import { notify } from '@/lib/toast'
import { confirmAction } from '@/lib/confirm'
import Sidebar, { MobileMenuButton } from '@/components/Sidebar'
import AdminProfileMenu from '@/components/AdminProfileMenu'
import { getAdminSidebarItems } from '@/lib/adminNav'
import DatePicker from '@/components/DatePicker'
import { adminFetch } from '@/lib/adminAuth'
import { API } from '@/lib/apiBase'

interface EventItem {
  id: string
  name: string
  venue: string | null
  description: string | null
  event_date: string | null
  cover_image_url: string | null
  status: 'DRAFT' | 'ACTIVE' | 'ARCHIVED'
  attendance_required: boolean
  excused_year_levels: number[] | null
  created_at: string
}

const YEAR_LEVELS = [1, 2, 3, 4]

const emptyForm = {
  name: '',
  venue: '',
  description: '',
  event_date: '',
  event_time: '',
  status: 'DRAFT' as EventItem['status'],
  cover_image_url: '',
  attendance_required: false,
  excused_year_levels: [] as number[],
}

export default function AdminEventFormPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { eventId } = useParams<{ eventId?: string }>()
  const isEditing = Boolean(eventId)

  const [form, setForm] = useState(emptyForm)
  const [fieldErrors, setFieldErrors] = useState<Record<string, boolean>>({})
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(isEditing)
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    if (!isEditing) return

    const passedEvent = (location.state as { event?: EventItem } | null)?.event
    if (passedEvent) {
      applyEvent(passedEvent)
      setLoading(false)
      return
    }

    // Fallback for a direct navigation / refresh without router state
    adminFetch(`${API}/officer/events/`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        const found = data?.events?.find((e: EventItem) => e.id === eventId)
        if (found) applyEvent(found)
        else notify.error('Event not found', 'It may have been deleted.')
      })
      .catch(() => notify.error('Network error', 'Could not load this event.'))
      .finally(() => setLoading(false))
  }, [eventId])

  function applyEvent(event: EventItem) {
    setForm({
      name: event.name,
      venue: event.venue ?? '',
      description: event.description ?? '',
      event_date: event.event_date ? event.event_date.slice(0, 10) : '',
      event_time: event.event_date ? event.event_date.slice(11, 16) : '',
      status: event.status,
      cover_image_url: event.cover_image_url ?? '',
      attendance_required: event.attendance_required,
      excused_year_levels: event.excused_year_levels ?? [],
    })
  }

  function toggleExcusedYear(year: number) {
    setForm((prev) => ({
      ...prev,
      excused_year_levels: prev.excused_year_levels.includes(year)
        ? prev.excused_year_levels.filter((y) => y !== year)
        : [...prev.excused_year_levels, year],
    }))
  }

  async function handleSubmit() {
    const errors = {
      name: !form.name,
      venue: !form.venue,
      description: !form.description,
      event_date: !form.event_date,
      event_time: !form.event_time,
    }
    setFieldErrors(errors)
    if (Object.values(errors).some(Boolean)) return

    setSaving(true)
    try {
      const url = isEditing ? `${API}/officer/events/${eventId}` : `${API}/officer/events/`
      const method = isEditing ? 'PUT' : 'POST'

      const res = await adminFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          venue: form.venue || null,
          description: form.description,
          event_date: `${form.event_date}T${form.event_time}`,
          status: form.status,
          cover_image_url: form.cover_image_url || null,
          attendance_required: form.attendance_required,
          excused_year_levels: form.excused_year_levels.length ? form.excused_year_levels : null,
        }),
      })

      if (!res.ok) {
        const err = await res.json()
        notify.error('Save failed', err.detail)
        return
      }

      notify.success(isEditing ? 'Event updated' : 'Event created', form.name)
      navigate('/admin/events')
    } catch {
      notify.error('Network error', 'Could not reach the server.')
    } finally {
      setSaving(false)
    }
  }

  async function handleCancel() {
    if (JSON.stringify(form) === JSON.stringify(emptyForm)) {
      navigate('/admin/events')
      return
    }
    const confirmed = await confirmAction({
      title: 'Discard changes?',
      text: 'Your edits to this event will be lost.',
      confirmText: 'Discard',
      danger: true,
    })
    if (confirmed) navigate('/admin/events')
  }

  function fieldClass(field: string) {
    return fieldErrors[field]
      ? 'border-red-400 bg-red-50/50 focus:border-red-500 focus:ring-red-500/20'
      : 'border-slate-200 bg-slate-50 focus:border-sky-500 focus:ring-sky-500/20'
  }

  function clearError(field: string) {
    if (fieldErrors[field]) setFieldErrors((prev) => ({ ...prev, [field]: false }))
  }

  return (
    <div className="min-h-screen bg-slate-50 font-sans">
      <Sidebar
        title="PSITS Admin"
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        items={getAdminSidebarItems('events', navigate, () =>
          notify.info('Pick an event', 'Click the people icon on an event row to view its attendance report.')
        )}
      />

      <div className="lg:pl-64">
        <header className="flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-6 py-4 lg:px-10">
          <div className="flex items-center gap-3">
            <MobileMenuButton onClick={() => setMenuOpen(true)} />
            <Link
              to="/admin/events"
              className="flex items-center gap-1 text-sm font-medium text-sky-600 transition hover:text-sky-700"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </Link>
          </div>
          <AdminProfileMenu />
        </header>

        <main className="px-6 py-8 lg:px-10">
          <div className="w-full rounded-xl border border-slate-200 bg-white p-6">
            <h2 className="mb-4 text-base font-semibold text-slate-900">
              {isEditing ? 'Edit Event' : 'Create Event'}
            </h2>
            {loading ? (
              <div className="space-y-3">
                <div className="h-4 w-full animate-pulse rounded bg-slate-100" />
                <div className="h-4 w-full animate-pulse rounded bg-slate-100" />
                <div className="h-4 w-2/3 animate-pulse rounded bg-slate-100" />
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    Title <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <Type className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      value={form.name}
                      onChange={(e) => {
                        setForm({ ...form, name: e.target.value })
                        clearError('name')
                      }}
                      placeholder="General Assembly"
                      className={`w-full rounded-xl border py-2.5 pl-10 pr-4 text-sm text-slate-900 transition focus:bg-white focus:outline-none focus:ring-2 ${fieldClass('name')}`}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">
                      Venue <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <MapPin className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <input
                        type="text"
                        value={form.venue}
                        onChange={(e) => {
                          setForm({ ...form, venue: e.target.value })
                          clearError('venue')
                        }}
                        placeholder="USM Gymnasium"
                        className={`w-full rounded-xl border py-2.5 pl-10 pr-4 text-sm text-slate-900 transition focus:bg-white focus:outline-none focus:ring-2 ${fieldClass('venue')}`}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">
                      Date <span className="text-red-500">*</span>
                    </label>
                    <DatePicker
                      value={form.event_date}
                      onChange={(value) => {
                        setForm({ ...form, event_date: value })
                        clearError('event_date')
                      }}
                      error={fieldErrors.event_date}
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">
                      Time <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <Clock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <input
                        type="time"
                        value={form.event_time}
                        onChange={(e) => {
                          setForm({ ...form, event_time: e.target.value })
                          clearError('event_time')
                        }}
                        className={`w-full rounded-xl border py-2.5 pl-10 pr-4 text-sm text-slate-900 transition focus:bg-white focus:outline-none focus:ring-2 ${fieldClass('event_time')}`}
                      />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">Status</label>
                    <select
                      value={form.status}
                      onChange={(e) => setForm({ ...form, status: e.target.value as EventItem['status'] })}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 transition focus:border-sky-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-500/20"
                    >
                      <option value="DRAFT">Draft (hidden from students)</option>
                      <option value="ACTIVE">Active (open for registration)</option>
                      <option value="ARCHIVED">Archived (ended)</option>
                    </select>
                  </div>

                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">Cover Image URL</label>
                    <div className="relative">
                      <ImageIcon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <input
                        type="url"
                        value={form.cover_image_url}
                        onChange={(e) => setForm({ ...form, cover_image_url: e.target.value })}
                        placeholder="https://..."
                        className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-4 text-sm text-slate-900 transition focus:border-sky-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-500/20"
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    Description <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <AlignLeft className="pointer-events-none absolute left-3.5 top-3.5 h-4 w-4 text-slate-400" />
                    <textarea
                      value={form.description}
                      onChange={(e) => {
                        setForm({ ...form, description: e.target.value })
                        clearError('description')
                      }}
                      rows={4}
                      placeholder="What is this event about?"
                      className={`w-full rounded-xl border py-2.5 pl-10 pr-4 text-sm text-slate-900 transition focus:bg-white focus:outline-none focus:ring-2 ${fieldClass('description')}`}
                    />
                  </div>
                </div>

                {/* Attendance required toggle */}
                <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <div>
                    <p className="text-sm font-medium text-slate-900">Attendance Required</p>
                    <p className="text-xs text-slate-500">Students will see this is mandatory on their dashboard.</p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={form.attendance_required}
                    onClick={() => setForm({ ...form, attendance_required: !form.attendance_required })}
                    className={`relative h-6 w-11 shrink-0 rounded-full transition ${
                      form.attendance_required ? 'bg-sky-600' : 'bg-slate-300'
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${
                        form.attendance_required ? 'left-5' : 'left-0.5'
                      }`}
                    />
                  </button>
                </div>

                {/* Excused year levels */}
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <p className="text-sm font-medium text-slate-900">Excused Year Levels</p>
                  <p className="mb-3 text-xs text-slate-500">
                    Students in these year levels are not required to register or attend this
                    event and will be marked EXCUSED instead of absent.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {YEAR_LEVELS.map((year) => {
                      const active = form.excused_year_levels.includes(year)
                      return (
                        <button
                          key={year}
                          type="button"
                          onClick={() => toggleExcusedYear(year)}
                          className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                            active
                              ? 'border-sky-500 bg-sky-600 text-white'
                              : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-100'
                          }`}
                        >
                          Year {year}
                        </button>
                      )
                    })}
                  </div>
                </div>

                <div className="flex justify-end gap-2">
                  <button
                    onClick={handleCancel}
                    className="rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSubmit}
                    disabled={saving}
                    className="rounded-xl bg-sky-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:opacity-50"
                  >
                    {saving ? 'Saving...' : isEditing ? 'Update Event' : 'Create Event'}
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
