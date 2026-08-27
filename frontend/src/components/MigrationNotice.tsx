import { useEffect, useState } from 'react'
import { AlertTriangle } from 'lucide-react'

const HIDE_KEY = 'psits_hide_migration_notice'
const SHOWN_THIS_SESSION_KEY = 'psits_migration_notice_shown'

export default function MigrationNotice() {
  const [open, setOpen] = useState(false)
  const [dontShowAgain, setDontShowAgain] = useState(false)

  useEffect(() => {
    const hidden = localStorage.getItem(HIDE_KEY) === '1'
    const shownThisSession = sessionStorage.getItem(SHOWN_THIS_SESSION_KEY) === '1'
    if (!hidden && !shownThisSession) {
      setOpen(true)
      sessionStorage.setItem(SHOWN_THIS_SESSION_KEY, '1')
    }
  }, [])

  function handleClose() {
    if (dontShowAgain) localStorage.setItem(HIDE_KEY, '1')
    setOpen(false)
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/50 p-4"
      onClick={handleClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-amber-50">
          <AlertTriangle className="h-5 w-5 text-amber-600" />
        </div>
        <h3 className="mt-4 text-base font-semibold text-slate-900">Heads up: data is still migrating</h3>
        <p className="mt-2 text-sm text-slate-500">
          You're viewing records for SY 2026–2027. The portal is still in development and student data
          is actively being migrated, so you may notice discrepancies for now — these will be corrected
          as migration continues.
        </p>
        <p className="mt-2 text-sm text-slate-500">
          Other functionalities (marked "Soon" in the sidebar) are not yet available and will be rolled
          out in future updates.
        </p>
        <label className="mt-4 flex items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={dontShowAgain}
            onChange={(e) => setDontShowAgain(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
          />
          Don't show this again
        </label>
        <button
          onClick={handleClose}
          className="mt-5 w-full rounded-xl bg-sky-600 py-2.5 text-sm font-semibold text-white transition hover:bg-sky-700"
        >
          Got it
        </button>
      </div>
    </div>
  )
}
