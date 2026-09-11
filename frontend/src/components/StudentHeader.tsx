import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { RefreshCw, Moon, Sun, Bell, ChevronDown, LogOut, User, Compass } from 'lucide-react'
import { notify } from '@/lib/toast'
import { MobileMenuButton } from '@/components/Sidebar'
import { applyTheme, getStoredTheme, type Theme } from '@/lib/theme'
import { startStudentTour } from '@/lib/tour'

interface StudentHeaderProps {
  title?: string
  subtitle?: string
  onMenuOpen: () => void
  onMenuClose?: () => void
  onRefresh: () => void
  refreshing: boolean
  loading: boolean
  studentName: string | null
  avatarUrl?: string | null
  onLogout: () => void
}

export default function StudentHeader({
  title,
  subtitle,
  onMenuOpen,
  onMenuClose,
  onRefresh,
  refreshing,
  loading,
  studentName,
  avatarUrl,
  onLogout,
}: StudentHeaderProps) {
  const [profileOpen, setProfileOpen] = useState(false)
  const profileRef = useRef<HTMLDivElement>(null)
  const [theme, setTheme] = useState<Theme>(() => getStoredTheme())

  function toggleTheme() {
    const next: Theme = theme === 'dark' ? 'light' : 'dark'
    applyTheme(next)
    setTheme(next)
  }

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  return (
    <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-4 dark:border-slate-800 dark:bg-slate-900 sm:px-6 lg:px-10">
      <div className="flex min-w-0 items-center gap-3">
        <MobileMenuButton onClick={onMenuOpen} />
        {title && (
          loading ? (
            <div className="space-y-2">
              <div className="h-5 w-32 animate-pulse rounded bg-slate-200 dark:bg-slate-700 sm:w-48" />
              <div className="hidden h-4 w-32 animate-pulse rounded bg-slate-100 dark:bg-slate-800 sm:block" />
            </div>
          ) : (
            <div className="min-w-0">
              <h1 className="truncate text-base font-semibold text-slate-900 dark:text-white sm:text-lg">{title}</h1>
              {subtitle && (
                <p className="hidden truncate text-sm text-slate-500 dark:text-slate-400 sm:block">{subtitle}</p>
              )}
            </div>
          )
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
        <button
          id="tour-header-refresh"
          onClick={onRefresh}
          disabled={refreshing || loading}
          title="Refresh"
          className="rounded-full border border-slate-200 p-2 text-slate-500 transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 sm:p-2.5"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
        </button>
        <button
          id="tour-header-theme"
          onClick={toggleTheme}
          title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          className="rounded-full border border-slate-200 p-2 text-slate-500 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 sm:p-2.5"
        >
          {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>
        <button
          id="tour-header-notifications"
          onClick={() => notify.info('Coming soon', 'Notifications are on the way.')}
          title="Notifications"
          className="relative rounded-full border border-slate-200 p-2 text-slate-500 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 sm:p-2.5"
        >
          <Bell className="h-4 w-4" />
          <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-orange-500 sm:right-2 sm:top-2" />
        </button>

        {!loading && studentName && (
          <div id="tour-header-profile" ref={profileRef} className="relative">
            <button
              onClick={() => setProfileOpen((o) => !o)}
              className="flex items-center gap-2 rounded-full border border-slate-200 py-1 pl-1 pr-2 transition hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800 sm:pr-3"
            >
              <img
                src={avatarUrl || `https://api.dicebear.com/10.x/adventurer-neutral/svg?seed=${encodeURIComponent(studentName)}`}
                alt={studentName}
                className="h-8 w-8 rounded-full bg-slate-100 object-cover"
              />
              <span className="hidden text-sm font-medium text-slate-700 dark:text-slate-300 sm:inline">
                {studentName.split(' ')[0]}
              </span>
              <ChevronDown className="hidden h-4 w-4 text-slate-400 sm:inline" />
            </button>

            {profileOpen && (
              <div className="absolute right-0 z-20 mt-2 w-44 rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg dark:border-slate-700 dark:bg-slate-800">
                <Link
                  to="/profile"
                  onClick={() => setProfileOpen(false)}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-700"
                >
                  <User className="h-4 w-4" />
                  View Profile
                </Link>
                <button
                  onClick={() => {
                    setProfileOpen(false)
                    startStudentTour(onMenuOpen, onMenuClose)
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-700"
                >
                  <Compass className="h-4 w-4" />
                  Take a Tour
                </button>
                <button
                  onClick={onLogout}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium text-rose-600 transition hover:bg-rose-50 dark:hover:bg-rose-950/40"
                >
                  <LogOut className="h-4 w-4" />
                  Sign out
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  )
}
