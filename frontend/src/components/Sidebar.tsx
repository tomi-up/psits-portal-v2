import type { ReactNode } from 'react'
import { Menu, X } from 'lucide-react'

export interface SidebarItem {
  icon: ReactNode
  label: string
  active?: boolean
  disabled?: boolean
  onClick?: () => void
  id?: string
}

export function MobileMenuButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="rounded-lg border border-slate-200 p-2 text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 lg:hidden"
      aria-label="Open menu"
    >
      <Menu className="h-5 w-5" />
    </button>
  )
}

export default function Sidebar({
  title,
  items,
  footer,
  open,
  onClose,
}: {
  title: string
  items: SidebarItem[]
  footer?: ReactNode
  open: boolean
  onClose: () => void
}) {
  return (
    <>
      {/* Mobile overlay */}
      {open && (
        <div className="fixed inset-0 z-40 bg-slate-900/50 lg:hidden" onClick={onClose} />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col bg-[#0b1b33] transition-transform duration-200 ease-out lg:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between px-6 py-6">
          <div className="flex items-center gap-3">
            <img src="/psits-logo.png" alt="PSITS" className="h-10 w-10" />
            <span className="text-lg font-semibold text-white">{title}</span>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-white/10 hover:text-white lg:hidden"
            aria-label="Close menu"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="mt-4 flex-1 space-y-1 overflow-y-auto px-3 pb-4">
          {items.map((item, i) => (
            <div
              key={i}
              id={item.id}
              onClick={item.disabled ? undefined : item.onClick}
              title={item.disabled ? 'Not yet implemented — in development' : undefined}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                item.disabled
                  ? 'cursor-not-allowed text-slate-600'
                  : item.active
                    ? 'bg-white/10 text-white'
                    : 'cursor-pointer text-slate-400 hover:bg-white/5 hover:text-white'
              }`}
            >
              {item.icon}
              <span className="flex-1">{item.label}</span>
              {item.disabled && (
                <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] font-medium text-slate-500">
                  Soon
                </span>
              )}
            </div>
          ))}
        </nav>

        {footer && <div className="px-3 pb-6">{footer}</div>}
      </aside>
    </>
  )
}
