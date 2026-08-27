import toast from 'react-hot-toast'

type ToastKind = 'success' | 'info' | 'warning' | 'error'

const DURATION = 4000

const STYLES: Record<ToastKind, { bg: string; bar: string }> = {
  success: { bg: 'bg-emerald-500', bar: 'bg-emerald-700/40' },
  info: { bg: 'bg-sky-500', bar: 'bg-sky-700/40' },
  warning: { bg: 'bg-amber-500', bar: 'bg-amber-700/40' },
  error: { bg: 'bg-rose-500', bar: 'bg-rose-700/40' },
}

function Icon({ kind }: { kind: ToastKind }) {
  const common = 'h-7 w-7 shrink-0 text-white'

  if (kind === 'success') {
    return (
      <svg viewBox="0 0 24 24" fill="none" className={common}>
        <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }

  if (kind === 'info') {
    return (
      <svg viewBox="0 0 24 24" className={common}>
        <circle cx="12" cy="12" r="10" fill="white" />
        <rect x="11" y="10" width="2" height="7" rx="1" fill="currentColor" className="text-sky-500" />
        <circle cx="12" cy="7.2" r="1.3" fill="currentColor" className="text-sky-500" />
      </svg>
    )
  }

  if (kind === 'warning') {
    return (
      <svg viewBox="0 0 24 24" fill="none" className={common}>
        <path d="M12 3l10 18H2L12 3z" stroke="white" strokeWidth={2} strokeLinejoin="round" />
        <rect x="11" y="10" width="2" height="5" rx="1" fill="white" />
        <circle cx="12" cy="18" r="1.1" fill="white" />
      </svg>
    )
  }

  return (
    <svg viewBox="0 0 24 24" className={common}>
      <path d="M12 2l8 3v6c0 5-3.4 8.7-8 11-4.6-2.3-8-6-8-11V5l8-3z" fill="white" />
      <rect x="11" y="7" width="2" height="6" rx="1" fill="currentColor" className="text-rose-500" />
      <circle cx="12" cy="16" r="1.1" fill="currentColor" className="text-rose-500" />
    </svg>
  )
}

function show(kind: ToastKind, title: string, message?: string) {
  const { bg, bar } = STYLES[kind]

  toast.custom(
    (t) => (
      <div
        className={`relative overflow-hidden rounded-lg shadow-lg transition-all duration-200 ${bg} ${
          t.visible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2'
        }`}
        style={{ minWidth: 300, maxWidth: 380 }}
      >
        <div className="flex items-start gap-3 px-4 py-3.5">
          <Icon kind={kind} />
          <div className="pt-0.5">
            <p className="text-[15px] font-bold leading-tight text-white">{title}</p>
            {message && <p className="mt-0.5 text-sm leading-snug text-white/90">{message}</p>}
          </div>
        </div>
        <div
          className={`h-1 origin-left ${bar}`}
          style={{ animation: `toast-timer ${DURATION}ms linear forwards` }}
        />
      </div>
    ),
    { duration: DURATION },
  )
}

export const notify = {
  success: (title: string, message?: string) => show('success', title, message),
  info: (title: string, message?: string) => show('info', title, message),
  warning: (title: string, message?: string) => show('warning', title, message),
  error: (title: string, message?: string) => show('error', title, message),
}
