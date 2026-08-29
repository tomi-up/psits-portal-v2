import { useEffect, useState } from 'react'
import { Info, X } from 'lucide-react'

const HIDE_KEY = 'psits_hide_registration_notice'
const SHOWN_THIS_SESSION_KEY = 'psits_registration_notice_shown'

export default function RegistrationNotice() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const hidden = localStorage.getItem(HIDE_KEY) === '1'
    const shownThisSession = sessionStorage.getItem(SHOWN_THIS_SESSION_KEY) === '1'
    if (!hidden && !shownThisSession) {
      setOpen(true)
      sessionStorage.setItem(SHOWN_THIS_SESSION_KEY, '1')
    }
  }, [])

  if (!open) return null

  return (
    <div className="mb-6 flex items-start gap-3 rounded-xl border border-sky-100 bg-sky-50 p-4 dark:border-sky-900 dark:bg-sky-950/30">
      <Info className="mt-0.5 h-5 w-5 shrink-0 text-sky-600 dark:text-sky-400" />
      <div className="flex-1 text-sm text-sky-900 dark:text-sky-200">
        <p className="font-medium">Heads up when registering for events</p>
        <p className="mt-1 text-sky-700 dark:text-sky-300">
          After tapping Register, wait for the confirmation instead of tapping again — a duplicate
          tap won't create a duplicate registration, but tapping repeatedly during busy periods
          (like when registration first opens) just adds unnecessary load without getting you in
          any faster.
        </p>
      </div>
      <button
        onClick={() => {
          localStorage.setItem(HIDE_KEY, '1')
          setOpen(false)
        }}
        className="shrink-0 rounded-lg p-1 text-sky-400 transition hover:bg-sky-100 hover:text-sky-600 dark:hover:bg-sky-900"
        aria-label="Dismiss"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}
