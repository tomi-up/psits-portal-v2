import { useEffect, useState } from 'react'
import { useNavigate, useParams, useLocation, Link } from 'react-router-dom'
import { IdCard, User, Mail, Phone, ArrowLeft, RotateCcw } from 'lucide-react'
import { notify } from '@/lib/toast'
import { confirmAction } from '@/lib/confirm'
import Sidebar, { MobileMenuButton } from '@/components/Sidebar'
import AdminProfileMenu from '@/components/AdminProfileMenu'
import { getAdminSidebarItems } from '@/lib/adminNav'
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


// Never add a program here without also adding the Program row in Supabase -
// this admin form only lets you pick from what already exists.
const PROGRAM_OPTIONS = ['BSCS', 'BSIT', 'BLIS', 'BSInfoSys']

const emptyForm = {
  student_id: '',
  first_name: '',
  middle_name: '',
  last_name: '',
  suffix: '',
  email: '',
  contact_number: '',
  program: PROGRAM_OPTIONS[0],
  year_level: 1,
  section: '',
  academic_standing: 'REGULAR',
  enrollment_status: 'ACTIVE',
  is_active: false,
}

export default function AdminStudentFormPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { id } = useParams<{ id?: string }>()
  const isEditing = Boolean(id)

  const [form, setForm] = useState(emptyForm)
  const [fieldErrors, setFieldErrors] = useState<Record<string, boolean>>({})
  const [saving, setSaving] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [loading, setLoading] = useState(isEditing)
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    if (!isEditing) return

    const passedStudent = (location.state as { student?: StudentRow } | null)?.student
    if (passedStudent) {
      applyStudent(passedStudent)
      setLoading(false)
      return
    }

    // Fallback for a direct navigation / refresh without router state
    adminFetch(`${API}/officer/students/`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        const found = data?.students?.find((s: StudentRow) => s.id === id)
        if (found) applyStudent(found)
        else notify.error('Student not found', 'It may have been removed.')
      })
      .catch(() => notify.error('Network error', 'Could not load this student.'))
      .finally(() => setLoading(false))
  }, [id])

  function applyStudent(s: StudentRow) {
    setForm({
      student_id: s.student_id,
      first_name: s.first_name,
      middle_name: s.middle_name ?? '',
      last_name: s.last_name,
      suffix: s.suffix ?? '',
      email: s.email ?? '',
      contact_number: s.contact_number ?? '',
      program: s.program ?? PROGRAM_OPTIONS[0],
      year_level: s.year_level ?? 1,
      section: s.section ?? '',
      academic_standing: s.academic_standing ?? 'REGULAR',
      enrollment_status: s.enrollment_status ?? 'ACTIVE',
      is_active: s.is_active,
    })
  }

  async function handleSubmit() {
    const errors = {
      student_id: !form.student_id,
      first_name: !form.first_name,
      last_name: !form.last_name,
      section: !form.section,
    }
    setFieldErrors(errors)
    if (Object.values(errors).some(Boolean)) return

    setSaving(true)
    try {
      const url = isEditing ? `${API}/officer/students/${id}` : `${API}/officer/students/`
      const method = isEditing ? 'PUT' : 'POST'

      const res = await adminFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          student_id: form.student_id,
          first_name: form.first_name,
          middle_name: form.middle_name || null,
          last_name: form.last_name,
          suffix: form.suffix || null,
          email: form.email || null,
          contact_number: form.contact_number || null,
          program: form.program,
          year_level: Number(form.year_level),
          section: form.section,
          academic_standing: form.academic_standing,
          enrollment_status: form.enrollment_status,
          is_active: form.is_active,
        }),
      })

      if (!res.ok) {
        const err = await res.json()
        notify.error('Save failed', err.detail)
        return
      }

      notify.success(isEditing ? 'Student updated' : 'Student added', `${form.first_name} ${form.last_name}`)
      navigate('/admin/students')
    } catch {
      notify.error('Network error', 'Could not reach the server.')
    } finally {
      setSaving(false)
    }
  }

  async function handleCancel() {
    if (JSON.stringify(form) === JSON.stringify(emptyForm)) {
      navigate('/admin/students')
      return
    }
    const confirmed = await confirmAction({
      title: 'Discard changes?',
      text: 'Your edits to this student will be lost.',
      confirmText: 'Discard',
      danger: true,
    })
    if (confirmed) navigate('/admin/students')
  }

  async function handleResetAuthenticator() {
    if (!id) return
    const confirmed = await confirmAction({
      title: 'Reset authenticator?',
      text: `${form.first_name} ${form.last_name} will need to activate their account again from scratch (scan a new QR code). Use this if they lost their device.`,
      confirmText: 'Reset',
      danger: true,
    })
    if (!confirmed) return

    setResetting(true)
    try {
      const res = await adminFetch(`${API}/officer/students/${id}/reset-authenticator`, { method: 'POST' })
      if (!res.ok) {
        const err = await res.json()
        notify.error('Reset failed', err.detail)
        return
      }
      setForm((f) => ({ ...f, is_active: false }))
      notify.success('Authenticator reset', 'This student can now re-activate their account.')
    } catch {
      notify.error('Network error', 'Could not reach the server.')
    } finally {
      setResetting(false)
    }
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
        items={getAdminSidebarItems('students', navigate, () => navigate('/admin/events'))}
      />

      <div className="lg:pl-64">
        <header className="flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-6 py-4 lg:px-10">
          <div className="flex items-center gap-3">
            <MobileMenuButton onClick={() => setMenuOpen(true)} />
            <Link
              to="/admin/students"
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
              {isEditing ? 'Edit Student' : 'Add Student'}
            </h2>
            {loading ? (
              <div className="space-y-3">
                <div className="h-4 w-full animate-pulse rounded bg-slate-100" />
                <div className="h-4 w-full animate-pulse rounded bg-slate-100" />
                <div className="h-4 w-2/3 animate-pulse rounded bg-slate-100" />
              </div>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">
                      Student ID <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <IdCard className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <input
                        type="text"
                        value={form.student_id}
                        onChange={(e) => {
                          setForm({ ...form, student_id: e.target.value })
                          clearError('student_id')
                        }}
                        placeholder="22-42998"
                        className={`w-full rounded-xl border py-2.5 pl-10 pr-4 text-sm text-slate-900 transition focus:bg-white focus:outline-none focus:ring-2 ${fieldClass('student_id')}`}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">
                      Last Name <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <User className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <input
                        type="text"
                        value={form.last_name}
                        onChange={(e) => {
                          setForm({ ...form, last_name: e.target.value })
                          clearError('last_name')
                        }}
                        placeholder="Dela Cruz"
                        className={`w-full rounded-xl border py-2.5 pl-10 pr-4 text-sm text-slate-900 transition focus:bg-white focus:outline-none focus:ring-2 ${fieldClass('last_name')}`}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">
                      First Name <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <User className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <input
                        type="text"
                        value={form.first_name}
                        onChange={(e) => {
                          setForm({ ...form, first_name: e.target.value })
                          clearError('first_name')
                        }}
                        placeholder="Juan"
                        className={`w-full rounded-xl border py-2.5 pl-10 pr-4 text-sm text-slate-900 transition focus:bg-white focus:outline-none focus:ring-2 ${fieldClass('first_name')}`}
                      />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">Middle Name</label>
                    <input
                      type="text"
                      value={form.middle_name}
                      onChange={(e) => setForm({ ...form, middle_name: e.target.value })}
                      placeholder="Santos"
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 transition focus:border-sky-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-500/20"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">Suffix</label>
                    <input
                      type="text"
                      value={form.suffix}
                      onChange={(e) => setForm({ ...form, suffix: e.target.value })}
                      placeholder="Jr."
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 transition focus:border-sky-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-500/20"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">Email</label>
                    <div className="relative">
                      <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <input
                        type="email"
                        value={form.email}
                        onChange={(e) => setForm({ ...form, email: e.target.value })}
                        placeholder="student@example.com"
                        className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-4 text-sm text-slate-900 transition focus:border-sky-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-500/20"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">Contact Number</label>
                    <div className="relative">
                      <Phone className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <input
                        type="text"
                        value={form.contact_number}
                        onChange={(e) => setForm({ ...form, contact_number: e.target.value })}
                        placeholder="09XX XXX XXXX"
                        className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-4 text-sm text-slate-900 transition focus:border-sky-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-500/20"
                      />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">Program</label>
                    <select
                      value={form.program}
                      onChange={(e) => setForm({ ...form, program: e.target.value })}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 transition focus:border-sky-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-500/20"
                    >
                      {PROGRAM_OPTIONS.map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">Year Level</label>
                    <select
                      value={form.year_level}
                      onChange={(e) => setForm({ ...form, year_level: Number(e.target.value) })}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 transition focus:border-sky-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-500/20"
                    >
                      <option value={1}>Year 1</option>
                      <option value={2}>Year 2</option>
                      <option value={3}>Year 3</option>
                      <option value={4}>Year 4</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">
                      Section <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={form.section}
                      onChange={(e) => {
                        setForm({ ...form, section: e.target.value })
                        clearError('section')
                      }}
                      placeholder="A"
                      className={`w-full rounded-xl border px-4 py-2.5 text-sm text-slate-900 transition focus:bg-white focus:outline-none focus:ring-2 ${fieldClass('section')}`}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">Academic Standing</label>
                    <select
                      value={form.academic_standing}
                      onChange={(e) => setForm({ ...form, academic_standing: e.target.value })}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 transition focus:border-sky-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-500/20"
                    >
                      <option value="REGULAR">Regular</option>
                      <option value="IRREGULAR">Irregular</option>
                      <option value="OVER_STAY">Over Stay</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">Enrollment Status</label>
                    <select
                      value={form.enrollment_status}
                      onChange={(e) => setForm({ ...form, enrollment_status: e.target.value })}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 transition focus:border-sky-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-500/20"
                    >
                      <option value="ACTIVE">Active</option>
                      <option value="INACTIVE">Inactive</option>
                    </select>
                  </div>
                </div>

                {/* Account activated toggle */}
                <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <div>
                    <p className="text-sm font-medium text-slate-900">Portal Account Activated</p>
                    <p className="text-xs text-slate-500">
                      Whether this student has completed authenticator (TOTP) setup and can log in. New
                      students always start unactivated - they activate it themselves.
                    </p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={form.is_active}
                    onClick={() => setForm({ ...form, is_active: !form.is_active })}
                    className={`relative h-6 w-11 shrink-0 rounded-full transition ${
                      form.is_active ? 'bg-sky-600' : 'bg-slate-300'
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${
                        form.is_active ? 'left-5' : 'left-0.5'
                      }`}
                    />
                  </button>
                </div>

                {isEditing && form.is_active && (
                  <div className="flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
                    <div>
                      <p className="text-sm font-medium text-amber-900">Lost device?</p>
                      <p className="text-xs text-amber-700">
                        Reset their authenticator so they can scan a new QR code and activate again.
                      </p>
                    </div>
                    <button
                      onClick={handleResetAuthenticator}
                      disabled={resetting}
                      className="flex shrink-0 items-center gap-1.5 rounded-lg border border-amber-300 bg-white px-3.5 py-2 text-sm font-semibold text-amber-700 transition hover:bg-amber-100 disabled:opacity-50"
                    >
                      <RotateCcw className="h-4 w-4" />
                      {resetting ? 'Resetting...' : 'Reset Authenticator'}
                    </button>
                  </div>
                )}

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
                    {saving ? 'Saving...' : isEditing ? 'Update Student' : 'Add Student'}
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
