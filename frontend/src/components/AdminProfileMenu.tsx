import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronDown, LogOut, Moon, RefreshCw, Sun } from 'lucide-react'
import { confirmAction } from '@/lib/confirm'
import { clearAdminSession, getAdminUser } from '@/lib/adminAuth'
import { applyTheme, getStoredTheme, type Theme } from '@/lib/theme'

interface AdminProfileMenuProps {
  onRefresh?: () => void | Promise<void>
  refreshing?: boolean
  refreshDisabled?: boolean
}

export default function AdminProfileMenu({
  onRefresh,
  refreshing = false,
  refreshDisabled = false,
}: AdminProfileMenuProps) {
  const navigate = useNavigate()
  const admin = getAdminUser()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const [theme, setTheme] = useState<Theme>(() => getStoredTheme())

  function toggleTheme() {
    const next: Theme = theme === 'dark' ? 'light' : 'dark'
    applyTheme(next)
    setTheme(next)
  }

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  async function handleLogout() {
    const confirmed = await confirmAction({
      title: 'Sign out?',
      text: "You'll need your admin email and password to sign in again.",
      confirmText: 'Sign out',
      danger: true,
    })
    if (!confirmed) return

    clearAdminSession()
    navigate('/admin/login', { replace: true })
  }

  function handleRefresh() {
    if (onRefresh) {
      void onRefresh()
      return
    }
    window.location.reload()
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={handleRefresh}
        disabled={refreshing || refreshDisabled}
        title="Refresh page"
        aria-label="Refresh page"
        className="rounded-full border border-slate-200 p-2 text-slate-500 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
      >
        <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
      </button>

      <button
        onClick={toggleTheme}
        title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        className="rounded-full border border-slate-200 p-2 text-slate-500 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
      >
        {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      </button>

      {admin && (
        <div ref={ref} className="relative">
          <button
            onClick={() => setOpen((o) => !o)}
            className="flex items-center gap-2 rounded-full border border-slate-200 py-1 pl-1 pr-3 transition hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
          >
            <img
              src={`https://api.dicebear.com/10.x/adventurer-neutral/svg?seed=${encodeURIComponent(admin.display_name || admin.email)}`}
              alt={admin.display_name || admin.email}
              className="h-8 w-8 rounded-full bg-slate-100 dark:bg-slate-800"
            />
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
              {admin.display_name || admin.email}
            </span>
            <ChevronDown className="h-4 w-4 text-slate-400" />
          </button>

          {open && (
            <div className="absolute right-0 z-20 mt-2 w-48 rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg dark:border-slate-700 dark:bg-slate-800">
              <p className="truncate px-3 py-1.5 text-xs text-slate-400 dark:text-slate-500">{admin.email}</p>
              <button
                onClick={handleLogout}
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
  )
}
