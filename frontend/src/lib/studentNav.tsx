import { LayoutDashboard, CalendarDays, ClipboardList, Wallet, Gavel } from 'lucide-react'
import type { SidebarItem } from '@/components/Sidebar'

export type StudentPage = 'dashboard' | 'events' | 'attendance' | 'balance' | 'sanctions'

export function getStudentSidebarItems(active: StudentPage, navigate: (path: string) => void): SidebarItem[] {
  return [
    {
      id: 'tour-nav-dashboard',
      icon: <LayoutDashboard className="h-4 w-4" />,
      label: 'Dashboard',
      active: active === 'dashboard',
      onClick: () => navigate('/dashboard'),
    },
    {
      id: 'tour-nav-events',
      icon: <CalendarDays className="h-4 w-4" />,
      label: 'Events',
      active: active === 'events',
      onClick: () => navigate('/events'),
    },
    {
      id: 'tour-nav-attendance',
      icon: <ClipboardList className="h-4 w-4" />,
      label: 'Attendance',
      active: active === 'attendance',
      onClick: () => navigate('/attendance'),
    },
    {
      id: 'tour-nav-balance',
      icon: <Wallet className="h-4 w-4" />,
      label: 'Balance',
      active: active === 'balance',
      onClick: () => navigate('/balance'),
    },
    {
      id: 'tour-nav-sanctions',
      icon: <Gavel className="h-4 w-4" />,
      label: 'Sanctions',
      active: active === 'sanctions',
      onClick: () => navigate('/sanctions'),
    },
  ]
}
