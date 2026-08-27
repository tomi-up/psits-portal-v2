import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronDown, LogOut } from 'lucide-react'
import { confirmAction } from '@/lib/confirm'
import { clearAdminSession, getAdminUser } from '@/lib/adminAuth'

export default function AdminProfileMenu() {
  const navigate = useNavigate()
  const admin = getAdminUser()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

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

  if (!admin) return null

  const label = admin.display_name || admin.email

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-full border border-slate-200 py-1 pl-1 pr-3 transition hover:bg-slate-50"
      >
        <img
          src={`https://api.dicebear.com/10.x/adventurer-neutral/svg?seed=${encodeURIComponent(label)}`}
          alt={label}
          className="h-8 w-8 rounded-full bg-slate-100"
        />
        <span className="text-sm font-medium text-slate-700">{label}</span>
        <ChevronDown className="h-4 w-4 text-slate-400" />
      </button>

      {open && (
        <div className="absolute right-0 z-20 mt-2 w-48 rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg">
          <p className="truncate px-3 py-1.5 text-xs text-slate-400">{admin.email}</p>
          <button
            onClick={handleLogout}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium text-rose-600 transition hover:bg-rose-50"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </div>
      )}
    </div>
  )
}
