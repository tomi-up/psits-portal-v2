import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { QRCodeSVG } from 'qrcode.react'
import {
  Plus,
  Users,
  Search,
  ArrowUpDown,
  QrCode,
  Pencil,
  ChevronLeft,
  ChevronRight,
  Copy,
  ExternalLink,
} from 'lucide-react'
import { notify } from '@/lib/toast'
import Sidebar, { MobileMenuButton } from '@/components/Sidebar'
import AdminProfileMenu from '@/components/AdminProfileMenu'
import { getAdminSidebarItems } from '@/lib/adminNav'
import EmptyState from '@/components/EmptyState'
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


type SortKey = 'name' | 'event_date'

export default function AdminEventsPage() {
  const navigate = useNavigate()
  const [events, setEvents] = useState<EventItem[]>([])
  const [loading, setLoading] = useState(true)

  const [search, setSearch] = useState('')
  const [pageSize, setPageSize] = useState(10)
  const [page, setPage] = useState(1)
  const [sortKey, setSortKey] = useState<SortKey>('event_date')
  const [sortAsc, setSortAsc] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [shareEvent, setShareEvent] = useState<EventItem | null>(null)

  useEffect(() => {
    void loadEvents()
  }, [])

  async function loadEvents() {
    setLoading(true)
    try {
      const res = await adminFetch(`${API}/officer/events/`)
      if (res.ok) setEvents((await res.json()).events)
    } catch {
      notify.error('Network error', 'Could not load events.')
    } finally {
      setLoading(false)
    }
  }

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortAsc(!sortAsc)
    } else {
      setSortKey(key)
      setSortAsc(true)
    }
  }

  const filteredEvents = useMemo(() => {
    const q = search.trim().toLowerCase()
    let list = events
    if (q) {
      list = list.filter(
        (e) => e.name.toLowerCase().includes(q) || (e.venue ?? '').toLowerCase().includes(q)
      )
    }
    list = [...list].sort((a, b) => {
      let cmp = 0
      if (sortKey === 'name') {
        cmp = a.name.localeCompare(b.name)
      } else {
        cmp = (a.event_date ?? '').localeCompare(b.event_date ?? '')
      }
      return sortAsc ? cmp : -cmp
    })
    return list
  }, [events, search, sortKey, sortAsc])

  const totalPages = Math.max(1, Math.ceil(filteredEvents.length / pageSize))
  const pagedEvents = filteredEvents.slice((page - 1) * pageSize, page * pageSize)

  useEffect(() => {
    setPage(1)
  }, [search, pageSize])

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

      {/* Main */}
      <div className="lg:pl-64">
        <header className="flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-6 py-4 lg:px-10">
          <div className="flex items-center gap-3">
            <MobileMenuButton onClick={() => setMenuOpen(true)} />
            <div>
              <h1 className="text-lg font-semibold text-slate-900">Event Management</h1>
              <p className="text-sm text-slate-500">Create and manage PSITS events</p>
            </div>
          </div>
          <AdminProfileMenu />
        </header>

        <main className="px-6 py-8 lg:px-10">
          <div className="rounded-xl border border-slate-200 bg-white">
            {/* Toolbar */}
            <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <span>Show</span>
                <select
                  value={pageSize}
                  onChange={(e) => setPageSize(Number(e.target.value))}
                  className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm text-slate-700 focus:border-sky-500 focus:outline-none"
                >
                  <option value={5}>5</option>
                  <option value={10}>10</option>
                  <option value={25}>25</option>
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
                    placeholder="Search events..."
                    className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm text-slate-900 transition focus:border-sky-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-500/20"
                  />
                </div>
                <Link
                  to="/admin/events/new"
                  className="flex shrink-0 items-center gap-1.5 rounded-lg bg-sky-600 px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-sky-700"
                >
                  <Plus className="h-4 w-4" />
                  Create Event
                </Link>
              </div>
            </div>

            {loading ? (
              <div className="space-y-3 p-5">
                <div className="h-4 w-full animate-pulse rounded bg-slate-100" />
                <div className="h-4 w-full animate-pulse rounded bg-slate-100" />
              </div>
            ) : filteredEvents.length === 0 ? (
              <EmptyState title="No events found." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-slate-100 bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-5 py-3">
                        <button
                          onClick={() => toggleSort('name')}
                          className="flex items-center gap-1 hover:text-slate-700"
                        >
                          Name <ArrowUpDown className="h-3 w-3" />
                        </button>
                      </th>
                      <th className="px-5 py-3">
                        <button
                          onClick={() => toggleSort('event_date')}
                          className="flex items-center gap-1 hover:text-slate-700"
                        >
                          Date <ArrowUpDown className="h-3 w-3" />
                        </button>
                      </th>
                      <th className="px-5 py-3">Time</th>
                      <th className="px-5 py-3">Status</th>
                      <th className="px-5 py-3">Attendance</th>
                      <th className="px-5 py-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagedEvents.map((event) => (
                      <tr key={event.id} className="border-b border-slate-50 last:border-0">
                        <td className="px-5 py-3 text-slate-900">{event.name}</td>
                        <td className="px-5 py-3 text-slate-500">
                          {event.event_date
                            ? new Date(event.event_date).toLocaleDateString(undefined, {
                                dateStyle: 'medium',
                              })
                            : '—'}
                        </td>
                        <td className="px-5 py-3 text-slate-500">
                          {event.event_date
                            ? new Date(event.event_date).toLocaleTimeString(undefined, {
                                timeStyle: 'short',
                              })
                            : '—'}
                        </td>
                        <td className="px-5 py-3">
                          <StatusBadge status={event.status} />
                        </td>
                        <td className="px-5 py-3">
                          {event.attendance_required ? (
                            <span className="rounded-full bg-sky-50 px-2.5 py-1 text-xs font-medium text-sky-700">
                              Required
                            </span>
                          ) : (
                            <span className="text-xs text-slate-400">Optional</span>
                          )}
                        </td>
                        <td className="px-5 py-3">
                          <div className="flex items-center justify-end gap-1.5">
                            <Link
                              to={`/admin/events/${event.id}/registrations`}
                              title="View Registrations"
                              className="rounded-lg p-2 text-slate-600 transition hover:bg-slate-100"
                            >
                              <Users className="h-4 w-4" />
                            </Link>
                            <button
                              onClick={() => setShareEvent(event)}
                              title="Share Scanner Link"
                              className="rounded-lg p-2 text-emerald-600 transition hover:bg-emerald-50"
                            >
                              <QrCode className="h-4 w-4" />
                            </button>
                            <Link
                              to={`/admin/events/${event.id}/edit`}
                              state={{ event }}
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
            {!loading && filteredEvents.length > 0 && (
              <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3 text-sm text-slate-500">
                <span>
                  Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, filteredEvents.length)} of{' '}
                  {filteredEvents.length}
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

      {/* Share scanner link modal */}
      {shareEvent && <ShareScannerModal event={shareEvent} onClose={() => setShareEvent(null)} />}
    </div>
  )
}

function ShareScannerModal({ event, onClose }: { event: EventItem; onClose: () => void }) {
  const scannerUrl = `${window.location.origin}/scanner/${event.id}`
  const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(scannerUrl)
      notify.success('Link copied', 'Paste it to any officer to share this scanner.')
    } catch {
      notify.error('Could not copy', 'Select and copy the link manually.')
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-base font-semibold text-slate-900">{event.name}</h3>
        <p className="mt-1 text-sm text-slate-500">
          Share this link or QR code with any officer — everyone who opens it scans into the same
          event, at the same time, from their own device.
        </p>

        <div className="mt-4 flex justify-center rounded-xl border border-slate-100 bg-slate-50 p-4">
          <QRCodeSVG value={scannerUrl} size={180} />
        </div>

        <div className="mt-4 flex items-center gap-2">
          <input
            readOnly
            value={scannerUrl}
            onFocus={(e) => e.target.select()}
            className="w-full truncate rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600"
          />
          <button
            onClick={copyLink}
            title="Copy link"
            className="shrink-0 rounded-lg bg-slate-100 p-2 text-slate-600 transition hover:bg-slate-200"
          >
            <Copy className="h-4 w-4" />
          </button>
        </div>

        {isLocalhost && (
          <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-left text-xs text-amber-800">
            You're on <span className="font-mono">localhost</span> — other devices on the WiFi
            can't reach this link. Open this admin page using your PC's LAN IP (e.g.{' '}
            <span className="font-mono">192.168.x.x:5173</span>) instead, then share the link
            generated here.
          </p>
        )}

        <a
          href={scannerUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-sky-600 py-2.5 text-sm font-semibold text-white transition hover:bg-sky-700"
        >
          <ExternalLink className="h-4 w-4" />
          Open Scanner
        </a>

        <button
          onClick={onClose}
          className="mt-2 w-full rounded-xl border border-slate-200 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
        >
          Close
        </button>
      </div>
    </div>
  )
}

function StatusBadge({ status }: { status: EventItem['status'] }) {
  const styles = {
    DRAFT: 'bg-slate-100 text-slate-600',
    ACTIVE: 'bg-emerald-50 text-emerald-700',
    ARCHIVED: 'bg-amber-50 text-amber-700',
  }[status]

  return <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${styles}`}>{status}</span>
}
