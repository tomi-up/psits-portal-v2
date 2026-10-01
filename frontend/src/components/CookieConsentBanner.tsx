import { useState } from 'react'
import { Cookie, ChevronDown, ChevronUp } from 'lucide-react'

const STORAGE_KEY = 'cookie_consent'

type Consent = 'all' | 'necessary'

function getStoredConsent(): Consent | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY)
    return value === 'all' || value === 'necessary' ? value : null
  } catch {
    // Private browsing / storage blocked - treat as "not yet decided" every
    // visit rather than crashing the banner.
    return null
  }
}

export default function CookieConsentBanner() {
  const [consent, setConsent] = useState<Consent | null>(() => getStoredConsent())
  const [showDetails, setShowDetails] = useState(false)

  function choose(value: Consent) {
    try {
      localStorage.setItem(STORAGE_KEY, value)
    } catch {
      // Ignore - the choice still applies for this page load even if it
      // can't be remembered for next time.
    }
    setConsent(value)
  }

  if (consent) return null

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 border-t border-slate-200 bg-white/95 px-4 py-4 shadow-[0_-4px_16px_rgba(0,0,0,0.08)] backdrop-blur dark:border-slate-700 dark:bg-slate-900/95 sm:px-6">
      <div className="mx-auto max-w-4xl">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-4">
          <Cookie className="hidden h-6 w-6 shrink-0 text-sky-600 dark:text-sky-400 sm:block" />
          <div className="flex-1 text-sm text-slate-600 dark:text-slate-300">
            <p>
              We use cookies that are <strong className="text-slate-800 dark:text-slate-100">strictly
              necessary</strong> for Google Sign-In and Cloudflare Turnstile (bot protection) to work -
              the portal can't authenticate you without them. We don't use any tracking, analytics, or
              advertising cookies ourselves.
            </p>

            <button
              type="button"
              onClick={() => setShowDetails((s) => !s)}
              className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-sky-600 hover:underline dark:text-sky-400"
            >
              {showDetails ? 'Hide details' : 'See details'}
              {showDetails ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </button>

            {showDetails && (
              <div className="mt-3 space-y-2 rounded-lg bg-slate-50 p-3 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                <p>
                  <strong className="text-slate-800 dark:text-slate-200">This site:</strong> doesn't set
                  any cookies of its own. Your sign-in session is kept in your browser's session storage
                  and is cleared when you close the tab.
                </p>
                <p>
                  <strong className="text-slate-800 dark:text-slate-200">Google Sign-In:</strong> sets
                  its own cookies to verify your identity when you sign in with your Google account.
                </p>
                <p>
                  <strong className="text-slate-800 dark:text-slate-200">Cloudflare Turnstile:</strong>{' '}
                  sets a cookie to confirm you're not a bot before you sign in or submit certain forms.
                </p>
                <p>
                  Since both are required for signing in, they stay active regardless of which option
                  you choose below - there's nothing optional to turn off today. This choice is saved so
                  we know your preference if that ever changes.
                </p>
              </div>
            )}
          </div>

          <div className="flex shrink-0 gap-2 sm:flex-col sm:w-40">
            <button
              onClick={() => choose('all')}
              className="flex-1 rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-700 sm:flex-none"
            >
              Accept All
            </button>
            <button
              onClick={() => choose('necessary')}
              className="flex-1 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800 sm:flex-none"
            >
              Necessary Only
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
