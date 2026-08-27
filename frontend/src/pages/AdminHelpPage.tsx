import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  CalendarDays,
  ClipboardList,
  IdCard,
  ShieldCheck,
  Download,
  QrCode,
  Users,
} from 'lucide-react'
import Sidebar, { MobileMenuButton } from '@/components/Sidebar'
import AdminProfileMenu from '@/components/AdminProfileMenu'
import { getAdminSidebarItems } from '@/lib/adminNav'

const SECTIONS = [
  { id: 'events', label: 'Events' },
  { id: 'attendance', label: 'Attendance Reports' },
  { id: 'students', label: 'Students' },
]

export default function AdminHelpPage() {
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <div className="min-h-screen bg-slate-50 font-sans">
      <Sidebar
        title="PSITS Admin"
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        items={getAdminSidebarItems('help', navigate, () => navigate('/admin/events'))}
      />

      <div className="lg:pl-64">
        <header className="flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-6 py-4 lg:px-10">
          <div className="flex items-center gap-3">
            <MobileMenuButton onClick={() => setMenuOpen(true)} />
            <div>
              <h1 className="text-lg font-semibold text-slate-900">Help &amp; Guide</h1>
              <p className="text-sm text-slate-500">How to use the PSITS Admin panel</p>
            </div>
          </div>
          <AdminProfileMenu />
        </header>

        <main className="px-6 py-8 lg:px-10">
          <div className="mx-auto max-w-3xl space-y-8">
            {/* Quick nav */}
            <nav className="flex flex-wrap gap-2 rounded-xl border border-slate-200 bg-white p-3">
              {SECTIONS.map((s) => (
                <a
                  key={s.id}
                  href={`#${s.id}`}
                  className="rounded-lg px-3 py-1.5 text-sm font-medium text-sky-600 transition hover:bg-sky-50"
                >
                  {s.label}
                </a>
              ))}
            </nav>

            {/* Events */}
            <section id="events" className="scroll-mt-6 rounded-xl border border-slate-200 bg-white p-6">
              <div className="mb-4 flex items-center gap-2">
                <CalendarDays className="h-5 w-5 text-sky-600" />
                <h2 className="text-base font-semibold text-slate-900">Events</h2>
              </div>

              <div className="space-y-5 text-sm text-slate-600">
                <div>
                  <p className="font-medium text-slate-900">Creating an event</p>
                  <p className="mt-1">
                    Go to <span className="font-medium text-slate-800">Events → Create Event</span> and
                    fill in the title, venue, date, time, and description. All four are required.
                  </p>
                </div>

                <div>
                  <p className="font-medium text-slate-900">Status</p>
                  <ul className="mt-1 list-disc space-y-1 pl-5">
                    <li><span className="font-medium">Draft</span> — hidden from students, still editable.</li>
                    <li><span className="font-medium">Active</span> — visible to students, open for registration and QR check-in.</li>
                    <li><span className="font-medium">Archived</span> — event has ended. This is when the full eligible-student roster (including students who never registered) appears in the Attendance Report.</li>
                  </ul>
                </div>

                <div>
                  <p className="font-medium text-slate-900">Attendance Required</p>
                  <p className="mt-1">
                    Turn this on for mandatory events. Once the event is Archived, every student who
                    didn't register at all will show up in the Attendance Report as{' '}
                    <span className="font-medium">Not Registered</span> instead of being silently
                    left out.
                  </p>
                </div>

                <div>
                  <p className="font-medium text-slate-900">Excused Year Levels</p>
                  <p className="mt-1">
                    Tick the year levels that don't need to attend this event (e.g. incoming 1st
                    years during a returning-students-only assembly). Students in those year levels
                    are marked <span className="font-medium text-indigo-700">Excused</span> instead
                    of Absent or Not Registered, and are not required to register.
                  </p>
                </div>

                <div>
                  <p className="font-medium text-slate-900">Sharing an event</p>
                  <p className="mt-1 flex items-center gap-1.5">
                    Click the <QrCode className="inline h-4 w-4" /> QR icon on an event row to get its
                    registration link and QR code for students to scan.
                  </p>
                </div>
              </div>
            </section>

            {/* Attendance Reports */}
            <section id="attendance" className="scroll-mt-6 rounded-xl border border-slate-200 bg-white p-6">
              <div className="mb-4 flex items-center gap-2">
                <ClipboardList className="h-5 w-5 text-sky-600" />
                <h2 className="text-base font-semibold text-slate-900">Attendance Reports</h2>
              </div>

              <div className="space-y-5 text-sm text-slate-600">
                <div>
                  <p className="font-medium text-slate-900">Opening a report</p>
                  <p className="mt-1 flex items-center gap-1.5">
                    From the Events list, click the <Users className="inline h-4 w-4" /> people icon on
                    any event row to open its attendance DataTable.
                  </p>
                </div>

                <div>
                  <p className="font-medium text-slate-900">Reading the statuses</p>
                  <ul className="mt-1 list-disc space-y-1 pl-5">
                    <li><span className="font-medium">Present</span> — scanned in and out.</li>
                    <li><span className="font-medium">Incomplete</span> — scanned in, hasn't scanned out yet (event still ongoing).</li>
                    <li><span className="font-medium">No-show</span> — registered, never scanned in.</li>
                    <li><span className="font-medium">Absent</span> — scanned in but never completed the scan-out, and the event has since ended.</li>
                    <li><span className="font-medium">Not Registered</span> — never registered for a mandatory, archived event.</li>
                    <li><span className="font-medium text-indigo-700">Excused</span> — in a year level the event exempted; not counted against attendance.</li>
                  </ul>
                </div>

                <div>
                  <p className="font-medium text-slate-900">Filtering and searching</p>
                  <p className="mt-1">
                    Use the search box, or the Program / Year / Section / Status filters and the
                    "Late only" toggle, to narrow the table down. The Live badge means the table is
                    updating in real time as officers scan students in.
                  </p>
                </div>

                <div>
                  <p className="font-medium text-slate-900 flex items-center gap-1.5">
                    <Download className="h-4 w-4" /> Exporting to Excel
                  </p>
                  <p className="mt-1">
                    Click <span className="font-medium">Export Attendance Excel</span> to download a
                    formatted .xlsx report of everything currently shown in the table — the full
                    eligible roster, registration status, attendance status, and time in/out. It
                    always matches what's on screen.
                  </p>
                </div>
              </div>
            </section>

            {/* Students */}
            <section id="students" className="scroll-mt-6 rounded-xl border border-slate-200 bg-white p-6">
              <div className="mb-4 flex items-center gap-2">
                <IdCard className="h-5 w-5 text-sky-600" />
                <h2 className="text-base font-semibold text-slate-900">Students</h2>
              </div>

              <div className="space-y-5 text-sm text-slate-600">
                <div>
                  <p className="font-medium text-slate-900">Managing student records</p>
                  <p className="mt-1">
                    The Students page lists every enrolled student. Use Add Student to create a new
                    record, or click the pencil icon on a row to edit an existing one — program,
                    year level, and section are set here.
                  </p>
                </div>
                <div>
                  <p className="font-medium text-slate-900">Roster Import</p>
                  <p className="mt-1">
                    Bulk CSV import is coming soon (shown as "Soon" in the sidebar) — for now, add
                    students one at a time.
                  </p>
                </div>
              </div>
            </section>

            <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-500">
              <ShieldCheck className="h-4 w-4 shrink-0 text-slate-400" />
              Everything above only affects the modules currently enabled. Sidebar items marked
              "Soon" aren't available yet.
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}
