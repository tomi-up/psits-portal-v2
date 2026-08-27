import { LayoutDashboard, CalendarDays, ClipboardList, Wallet, Gavel } from 'lucide-react'
import type { SidebarItem } from '@/components/Sidebar'

export type StudentPage = 'dashboard' | 'events' | 'attendance'

export function getStudentSidebarItems(active: StudentPage, navigate: (path: string) => void): SidebarItem[] {
  return [
    {
      icon: <LayoutDashboard className="h-4 w-4" />,
      label: 'Dashboard',
      active: active === 'dashboard',
      onClick: () => navigate('/dashboard'),
    },
    {
      icon: <CalendarDays className="h-4 w-4" />,
      label: 'Events',
      active: active === 'events',
      onClick: () => navigate('/events'),
    },
    {
      icon: <ClipboardList className="h-4 w-4" />,
      label: 'Attendance',
      active: active === 'attendance',
      onClick: () => navigate('/attendance'),
    },
    { icon: <Wallet className="h-4 w-4" />, label: 'Balance', disabled: true },
    { icon: <Gavel className="h-4 w-4" />, label: 'Sanctions', disabled: true },
  ]
}
