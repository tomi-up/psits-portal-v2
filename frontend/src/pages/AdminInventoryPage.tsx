import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Search, ArrowUpDown, ChevronLeft, ChevronRight, Pencil, Trash2 } from 'lucide-react'
import { notify } from '@/lib/toast'
import { confirmAction } from '@/lib/confirm'
import Sidebar, { MobileMenuButton } from '@/components/Sidebar'
import AdminProfileMenu from '@/components/AdminProfileMenu'
import { getAdminSidebarItems } from '@/lib/adminNav'
import EmptyState from '@/components/EmptyState'
import { adminFetch } from '@/lib/adminAuth'
import { API } from '@/lib/apiBase'

interface InventoryRow {
  id: string
  school_year_id: string
  school_year_label: string
  semester: '1ST' | '2ND' | string
  record_type: 'FORWARDED' | 'NEW'
  item_name: string
  date_purchased: string | null
  cost: number | null
  fund_source: string
  previous_accountable_officer: string | null
  current_accountable_officer: string
  memorandum_receipt_number: string | null
  recorded_by: string
  created_at: string
}

interface SchoolYearOption {
  id: string
  label: string
  is_active: boolean
}

type SortKey = 'item_name' | 'date_purchased'
type RecordTab = 'FORWARDED' | 'NEW'
type DialogMode = { kind: 'create'; recordType: RecordTab } | { kind: 'edit'; item: InventoryRow } | null

function money(v: number | null): string {
  return v == null ? 'N/A' : `₱${v.toLocaleString(undefined, { minimumFractionDigits: 2 })}`
}

function dateLabel(v: string | null): string {
  return v ? new Date(v).toLocaleDateString(undefined, { dateStyle: 'medium' }) : 'N/A'
}

export default function AdminInventoryPage() {
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)
  const [items, setItems] = useState<InventoryRow[]>([])
  const [schoolYears, setSchoolYears] = useState<SchoolYearOption[]>([])
  const [loading, setLoading] = useState(true)
  const [dialog, setDialog] = useState<DialogMode>(null)
  const [tab, setTab] = useState<RecordTab>('FORWARDED')

  const [search, setSearch] = useState('')
  const [yearFilter, setYearFilter] = useState('ALL')
  const [semesterFilter, setSemesterFilter] = useState('ALL')
  const [pageSize, setPageSize] = useState(10)
  const [page, setPage] = useState(1)
  const [sortKey, setSortKey] = useState<SortKey>('date_purchased')
  const [sortAsc, setSortAsc] = useState(false)

  async function load() {
    setLoading(true)
    try {
      const [itemsRes, yearsRes] = await Promise.all([
        adminFetch(`${API}/officer/inventory/`),
        adminFetch(`${API}/officer/inventory/school-years`),
      ])
      if (itemsRes.ok) setItems((await itemsRes.json()).items ?? [])
      if (yearsRes.ok) setSchoolYears((await yearsRes.json()).school_years ?? [])
    } catch {
      notify.error('Network error', 'Could not load inventory.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  async function handleDelete(item: InventoryRow) {
    const confirmed = await confirmAction({
      title: `Delete "${item.item_name}"?`,
      text: 'This inventory record will be permanently removed. This cannot be undone.',
      confirmText: 'Delete',
      danger: true,
    })
    if (!confirmed) return

    const res = await adminFetch(`${API}/officer/inventory/${item.id}`, { method: 'DELETE' })
    if (!res.ok) {
      notify.error('Could not delete', 'Please try again.')
      return
    }
    notify.success('Item deleted', item.item_name)
    void load()
  }

  const byTab = useMemo(() => items.filter((i) => i.record_type === tab), [items, tab])

  const filtered = useMemo(() => {
    let rows = byTab

    const q = search.trim().toLowerCase()
    if (q) {
      rows = rows.filter(
        (r) =>
          r.item_name.toLowerCase().includes(q) ||
          r.fund_source.toLowerCase().includes(q) ||
          (r.memorandum_receipt_number ?? '').toLowerCase().includes(q) ||
          r.current_accountable_officer.toLowerCase().includes(q) ||
          (r.previous_accountable_officer ?? '').toLowerCase().includes(q)
      )
    }
    if (yearFilter !== 'ALL') rows = rows.filter((r) => r.school_year_id === yearFilter)
    if (semesterFilter !== 'ALL') rows = rows.filter((r) => r.semester === semesterFilter)

    rows = [...rows].sort((a, b) => {
      const cmp =
        sortKey === 'item_name'
          ? a.item_name.localeCompare(b.item_name)
          : (a.date_purchased ?? '').localeCompare(b.date_purchased ?? '')
      return sortAsc ? cmp : -cmp
    })

    return rows
  }, [byTab, search, yearFilter, semesterFilter, sortKey, sortAsc])

  useEffect(() => {
    setPage(1)
  }, [search, yearFilter, semesterFilter, pageSize, tab])

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

  const totalSpent = useMemo(
    () => items.filter((i) => i.cost != null).reduce((sum, i) => sum + (i.cost ?? 0), 0),
    [items]
  )

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 font-sans">
      <Sidebar
        title="PSITS Admin"
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        items={getAdminSidebarItems('inventory', navigate, () => navigate('/admin/events'))}
      />

      <div className="lg:pl-64">
        <header className="flex items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-6 py-4 lg:px-10">
          <div className="flex items-center gap-3">
            <MobileMenuButton onClick={() => setMenuOpen(true)} />
            <div>
              <h1 className="text-lg font-semibold text-slate-900 dark:text-white">Property Inventory</h1>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Philippine Society of Information Technology Students - USM
              </p>
            </div>
          </div>
          <AdminProfileMenu />
        </header>

        <main className="px-6 py-8 lg:px-10">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Total Items</p>
              <p className="mt-2 text-2xl font-semibold text-slate-900 dark:text-white">{loading ? '—' : items.length}</p>
            </div>
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Forwarded</p>
              <p className="mt-2 text-2xl font-semibold text-indigo-600 dark:text-indigo-400">
                {loading ? '—' : items.filter((i) => i.record_type === 'FORWARDED').length}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">New This Term</p>
              <p className="mt-2 text-2xl font-semibold text-sky-600 dark:text-sky-400">
                {loading ? '—' : items.filter((i) => i.record_type === 'NEW').length}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Total Cost Recorded</p>
              <p className="mt-2 text-2xl font-semibold text-emerald-600 dark:text-emerald-400">{loading ? '—' : money(totalSpent)}</p>
            </div>
          </div>

          <div className="mt-6 flex gap-2">
            <button
              onClick={() => setTab('FORWARDED')}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                tab === 'FORWARDED'
                  ? 'bg-slate-900 text-white dark:bg-sky-600'
                  : 'border border-slate-300 bg-white text-slate-700 shadow-sm hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:shadow-none dark:hover:bg-slate-700'
              }`}
            >
              Forwarded
            </button>
            <button
              onClick={() => setTab('NEW')}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                tab === 'NEW'
                  ? 'bg-slate-900 text-white dark:bg-sky-600'
                  : 'border border-slate-300 bg-white text-slate-700 shadow-sm hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:shadow-none dark:hover:bg-slate-700'
              }`}
            >
              New Property
            </button>
          </div>
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            {tab === 'FORWARDED'
              ? 'Properties purchased or acquired by a previous administration and transferred to the current one.'
              : 'Properties purchased or acquired by the organization for the current semester.'}
          </p>

          <div className="mt-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
            <div className="space-y-3 border-b border-slate-100 dark:border-slate-800 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
                  <span>Show</span>
                  <select
                    value={pageSize}
                    onChange={(e) => setPageSize(Number(e.target.value))}
                    className="rounded-lg border border-slate-200 dark:border-slate-700 px-2 py-1.5 text-sm text-slate-700 dark:text-slate-300 focus:border-sky-500 focus:outline-none"
                  >
                    <option value={10}>10</option>
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                  </select>
                  <span>entries</span>
                </div>

                <div className="flex items-center gap-2">
                  <div className="relative w-full sm:w-64">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
                    <input
                      type="text"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search item, officer, fund source..."
                      className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 py-2 pl-9 pr-3 text-sm text-slate-900 dark:text-white transition focus:border-sky-500 focus:bg-white dark:focus:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
                    />
                  </div>
                  <button
                    onClick={() => setDialog({ kind: 'create', recordType: tab })}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-sky-600 px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-sky-700"
                  >
                    <Plus className="h-4 w-4" />
                    Add {tab === 'FORWARDED' ? 'Forwarded' : 'New'} Item
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <select
                  value={yearFilter}
                  onChange={(e) => setYearFilter(e.target.value)}
                  className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 focus:border-sky-500 focus:outline-none"
                >
                  <option value="ALL">All School Years</option>
                  {schoolYears.map((y) => (
                    <option key={y.id} value={y.id}>
                      {y.label}
                    </option>
                  ))}
                </select>
                <select
                  value={semesterFilter}
                  onChange={(e) => setSemesterFilter(e.target.value)}
                  className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 focus:border-sky-500 focus:outline-none"
                >
                  <option value="ALL">All Semesters</option>
                  <option value="1ST">1st Semester</option>
                  <option value="2ND">2nd Semester</option>
                </select>
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
                title={byTab.length === 0 ? 'No items recorded yet.' : 'No items match these filters.'}
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-left text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    <tr>
                      <th className="px-5 py-3">
                        <button
                          onClick={() => toggleSort('item_name')}
                          className="flex items-center gap-1 uppercase tracking-wide hover:text-slate-700 dark:hover:text-slate-200"
                        >
                          Name of Property <ArrowUpDown className="h-3 w-3" />
                        </button>
                      </th>
                      <th className="px-5 py-3">
                        <button
                          onClick={() => toggleSort('date_purchased')}
                          className="flex items-center gap-1 uppercase tracking-wide hover:text-slate-700 dark:hover:text-slate-200"
                        >
                          Date Purchased <ArrowUpDown className="h-3 w-3" />
                        </button>
                      </th>
                      <th className="px-5 py-3">Cost</th>
                      <th className="px-5 py-3">Fund Source</th>
                      {tab === 'FORWARDED' && <th className="px-5 py-3">Previous Officer</th>}
                      <th className="px-5 py-3">Current Officer</th>
                      <th className="px-5 py-3">Memo No.</th>
                      <th className="px-5 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paged.map((item) => (
                      <tr key={item.id} className="border-b border-slate-50 dark:border-slate-800/60 last:border-0">
                        <td className="px-5 py-3 font-medium text-slate-900 dark:text-white">
                          {item.item_name}
                          <p className="mt-0.5 text-[10px] font-normal text-slate-400 dark:text-slate-500">
                            {item.school_year_label} · {item.semester === '1ST' ? '1st' : '2nd'} Sem
                          </p>
                        </td>
                        <td className="px-5 py-3 text-slate-500 dark:text-slate-400">{dateLabel(item.date_purchased)}</td>
                        <td className="px-5 py-3 text-slate-600 dark:text-slate-300">{money(item.cost)}</td>
                        <td className="px-5 py-3 text-slate-600 dark:text-slate-300">{item.fund_source}</td>
                        {tab === 'FORWARDED' && (
                          <td className="px-5 py-3 text-slate-500 dark:text-slate-400">{item.previous_accountable_officer}</td>
                        )}
                        <td className="px-5 py-3 text-slate-500 dark:text-slate-400">{item.current_accountable_officer}</td>
                        <td className="px-5 py-3 font-mono text-xs text-slate-500 dark:text-slate-400">
                          {item.memorandum_receipt_number ?? '—'}
                        </td>
                        <td className="px-5 py-3">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => setDialog({ kind: 'edit', item })}
                              title="Edit"
                              className="rounded-lg p-2 text-sky-600 dark:text-sky-400 transition hover:bg-sky-50"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => void handleDelete(item)}
                              title="Delete"
                              className="rounded-lg p-2 text-rose-600 dark:text-rose-400 transition hover:bg-rose-50"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {!loading && filtered.length > 0 && (
              <div className="flex items-center justify-between border-t border-slate-100 dark:border-slate-800 px-5 py-3 text-sm text-slate-500 dark:text-slate-400">
                <span>
                  Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, filtered.length)} of{' '}
                  {filtered.length}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="rounded-lg border border-slate-200 dark:border-slate-700 p-1.5 transition hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <span className="rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-medium text-white">{page}</span>
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="rounded-lg border border-slate-200 dark:border-slate-700 p-1.5 transition hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </main>
      </div>

      {dialog && (
        <InventoryDialog
          mode={dialog}
          schoolYears={schoolYears}
          onClose={() => setDialog(null)}
          onSaved={() => {
            setDialog(null)
            void load()
          }}
        />
      )}
    </div>
  )
}

function InventoryDialog({
  mode,
  schoolYears,
  onClose,
  onSaved,
}: {
  mode: NonNullable<DialogMode>
  schoolYears: SchoolYearOption[]
  onClose: () => void
  onSaved: () => void
}) {
  const editing = mode.kind === 'edit' ? mode.item : null
  const recordType: RecordTab = editing?.record_type ?? (mode.kind === 'create' ? mode.recordType : 'NEW')

  const [schoolYearId, setSchoolYearId] = useState(
    editing?.school_year_id ?? schoolYears.find((y) => y.is_active)?.id ?? schoolYears[0]?.id ?? ''
  )
  const [semester, setSemester] = useState(editing?.semester ?? '1ST')
  const [itemName, setItemName] = useState(editing?.item_name ?? '')
  const [datePurchased, setDatePurchased] = useState(
    editing?.date_purchased ? editing.date_purchased.slice(0, 10) : ''
  )
  const [cost, setCost] = useState(editing?.cost != null ? String(editing.cost) : '')
  const [fundSource, setFundSource] = useState(editing?.fund_source ?? '')
  const [previousOfficer, setPreviousOfficer] = useState(editing?.previous_accountable_officer ?? '')
  const [currentOfficer, setCurrentOfficer] = useState(editing?.current_accountable_officer ?? '')
  const [memoNumber, setMemoNumber] = useState(editing?.memorandum_receipt_number ?? '')
  const [recordedBy, setRecordedBy] = useState(editing?.recorded_by ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    setError(null)

    if (!schoolYearId) {
      setError('Select a school year.')
      return
    }
    if (!itemName.trim()) {
      setError('Name of property is required.')
      return
    }
    if (!fundSource.trim()) {
      setError('Fund source is required.')
      return
    }
    if (!currentOfficer.trim()) {
      setError('Current accountable officer is required.')
      return
    }
    if (recordType === 'FORWARDED' && !previousOfficer.trim()) {
      setError('Previous accountable officer is required for a forwarded item.')
      return
    }
    if (!recordedBy.trim()) {
      setError('Recorded by is required.')
      return
    }

    setSaving(true)
    try {
      const body = {
        school_year_id: schoolYearId,
        semester,
        record_type: recordType,
        item_name: itemName.trim(),
        date_purchased: datePurchased || null,
        cost: cost.trim() ? Number(cost) : null,
        fund_source: fundSource.trim(),
        previous_accountable_officer: recordType === 'FORWARDED' ? previousOfficer.trim() : null,
        current_accountable_officer: currentOfficer.trim(),
        memorandum_receipt_number: memoNumber.trim() || null,
        recorded_by: recordedBy.trim(),
      }

      const res =
        mode.kind === 'create'
          ? await adminFetch(`${API}/officer/inventory/`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(body),
            })
          : await adminFetch(`${API}/officer/inventory/${mode.item.id}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(body),
            })

      if (!res.ok) {
        const err = await res.json().catch(() => null)
        const reason =
          (typeof err?.detail === 'string' && err.detail) ||
          (typeof err?.message === 'string' && err.message) ||
          'Could not save. Please try again.'
        setError(reason)
        return
      }

      notify.success(mode.kind === 'create' ? 'Item added' : 'Item updated', itemName.trim())
      onSaved()
    } catch {
      setError('Could not reach the server.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-900/50 p-4">
      <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white dark:bg-slate-900 p-6 shadow-xl">
        <h2 className="text-base font-semibold text-slate-900 dark:text-white">
          {mode.kind === 'create' ? 'Add' : 'Edit'} {recordType === 'FORWARDED' ? 'Forwarded' : 'New'} Property
        </h2>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          {recordType === 'FORWARDED'
            ? 'Carried over from the previous administration.'
            : 'Acquired by the organization this semester.'}
        </p>

        <div className="mt-4 grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-3">
          <div className="sm:col-span-3">
            <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Name of Property</label>
            <input
              value={itemName}
              onChange={(e) => setItemName(e.target.value)}
              placeholder="e.g. Epson Projector"
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-4 py-2.5 text-sm text-slate-900 dark:text-white focus:border-sky-500 focus:bg-white dark:focus:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">School Year</label>
            <select
              value={schoolYearId}
              onChange={(e) => setSchoolYearId(e.target.value)}
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-4 py-2.5 text-sm text-slate-900 dark:text-white focus:border-sky-500 focus:bg-white dark:focus:bg-slate-800 focus:outline-none"
            >
              {schoolYears.length === 0 && <option value="">No school years yet</option>}
              {schoolYears.map((y) => (
                <option key={y.id} value={y.id}>
                  {y.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Semester</label>
            <select
              value={semester}
              onChange={(e) => setSemester(e.target.value)}
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-4 py-2.5 text-sm text-slate-900 dark:text-white focus:border-sky-500 focus:bg-white dark:focus:bg-slate-800 focus:outline-none"
            >
              <option value="1ST">1st Semester</option>
              <option value="2ND">2nd Semester</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
              Date Purchased <span className="font-normal text-slate-400 dark:text-slate-500">(N/A if none)</span>
            </label>
            <div className="flex gap-2">
              <input
                type="date"
                value={datePurchased}
                onChange={(e) => setDatePurchased(e.target.value)}
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-4 py-2.5 text-sm text-slate-900 dark:text-white focus:border-sky-500 focus:bg-white dark:focus:bg-slate-800 focus:outline-none"
              />
              {datePurchased && (
                <button
                  type="button"
                  onClick={() => setDatePurchased('')}
                  title="Clear date (N/A)"
                  className="shrink-0 rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2.5 text-xs font-semibold text-slate-600 dark:text-slate-300 transition hover:bg-slate-100 dark:hover:bg-slate-700"
                >
                  N/A
                </button>
              )}
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
              Cost <span className="font-normal text-slate-400 dark:text-slate-500">(N/A if none)</span>
            </label>
            <div className="relative">
              <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-slate-400 dark:text-slate-500">
                ₱
              </span>
              <input
                type="number"
                min={0}
                step="0.01"
                value={cost}
                onChange={(e) => setCost(e.target.value)}
                placeholder="N/A"
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 py-2.5 pl-8 pr-4 text-sm text-slate-900 dark:text-white focus:border-sky-500 focus:bg-white dark:focus:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
              />
            </div>
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Fund Source</label>
            <input
              value={fundSource}
              onChange={(e) => setFundSource(e.target.value)}
              placeholder="e.g. PSITS Funds, Donation from Alumni, Freebie from..."
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-4 py-2.5 text-sm text-slate-900 dark:text-white focus:border-sky-500 focus:bg-white dark:focus:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
            />
          </div>

          {recordType === 'FORWARDED' && (
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Previous Officer</label>
              <input
                value={previousOfficer}
                onChange={(e) => setPreviousOfficer(e.target.value)}
                placeholder="Who held it before"
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-4 py-2.5 text-sm text-slate-900 dark:text-white focus:border-sky-500 focus:bg-white dark:focus:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
              />
            </div>
          )}
          <div className={recordType === 'FORWARDED' ? 'sm:col-span-2' : 'sm:col-span-3'}>
            <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Current Officer</label>
            <input
              value={currentOfficer}
              onChange={(e) => setCurrentOfficer(e.target.value)}
              placeholder="Who holds it now"
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-4 py-2.5 text-sm text-slate-900 dark:text-white focus:border-sky-500 focus:bg-white dark:focus:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
            />
          </div>

          <div className="sm:col-span-2">
            <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
              Memorandum Receipt Number <span className="font-normal text-slate-400 dark:text-slate-500">(if applicable)</span>
            </label>
            <input
              value={memoNumber}
              onChange={(e) => setMemoNumber(e.target.value.toUpperCase())}
              placeholder="USM-PSITS-2026-045"
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-4 py-2.5 font-mono text-sm text-slate-900 dark:text-white focus:border-sky-500 focus:bg-white dark:focus:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Recorded By</label>
            <input
              value={recordedBy}
              onChange={(e) => setRecordedBy(e.target.value)}
              placeholder="Name of the officer recording this"
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-4 py-2.5 text-sm text-slate-900 dark:text-white focus:border-sky-500 focus:bg-white dark:focus:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
            />
          </div>

          <p className="sm:col-span-3 -mt-2 text-xs text-slate-400 dark:text-slate-500">
            Recorded By is plain text for now since this admin account is shared between officers.
          </p>

          {error && <p className="sm:col-span-3 text-sm text-red-600 dark:text-red-400">{error}</p>}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-2 text-sm font-semibold text-slate-600 dark:text-slate-300 transition hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            Cancel
          </button>
          <button
            onClick={() => void save()}
            disabled={saving}
            className="rounded-xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
