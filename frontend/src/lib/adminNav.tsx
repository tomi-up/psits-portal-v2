import {
  CalendarDays,
  ClipboardList,
  Wallet,
  Boxes,
  ArrowLeftRight,
  Users,
  UploadCloud,
  Gavel,
  ShieldCheck,
  IdCard,
  BookOpen,
  FileWarning,
  Newspaper,
} from 'lucide-react'
import type { SidebarItem } from '@/components/Sidebar'

export type AdminPage =
  | 'events'
  | 'attendance'
  | 'excuse-requests'
  | 'payments'
  | 'news'
  | 'inventory'
  | 'turnover'
  | 'directory'
  | 'roster'
  | 'sanctions'
  | 'permissions'
  | 'students'
  | 'help'

export function getAdminSidebarItems(
  active: AdminPage,
  navigate: (path: string) => void,
  onAttendanceReportsClick: () => void
): SidebarItem[] {
  return [
    {
      icon: <CalendarDays className="h-4 w-4" />,
      label: 'Events',
      active: active === 'events',
      onClick: () => navigate('/admin/events'),
    },
    {
      icon: <ClipboardList className="h-4 w-4" />,
      label: 'Attendance Reports',
      active: active === 'attendance',
      onClick: active === 'attendance' ? undefined : onAttendanceReportsClick,
    },
    {
      icon: <IdCard className="h-4 w-4" />,
      label: 'Students',
      active: active === 'students',
      onClick: () => navigate('/admin/students'),
    },
    {
      icon: <FileWarning className="h-4 w-4" />,
      label: 'Excuse Requests',
      active: active === 'excuse-requests',
      onClick: () => navigate('/admin/excuse-requests'),
    },
    {
      icon: <Wallet className="h-4 w-4" />,
      label: 'Membership Ledger',
      active: active === 'payments',
      onClick: () => navigate('/admin/payments'),
    },
    {
      icon: <Newspaper className="h-4 w-4" />,
      label: 'News & Updates',
      active: active === 'news',
      onClick: () => navigate('/admin/news'),
    },
    { icon: <Boxes className="h-4 w-4" />, label: 'Inventory', disabled: true },
    { icon: <ArrowLeftRight className="h-4 w-4" />, label: 'Inventory Turnover', disabled: true },
    { icon: <Users className="h-4 w-4" />, label: 'Org Directory', disabled: true },
    { icon: <UploadCloud className="h-4 w-4" />, label: 'Roster Import', disabled: true },
    {
      icon: <Gavel className="h-4 w-4" />,
      label: 'Sanctions',
      active: active === 'sanctions',
      onClick: () => navigate('/admin/sanctions'),
    },
    { icon: <ShieldCheck className="h-4 w-4" />, label: 'Module Permissions', disabled: true },
    {
      icon: <BookOpen className="h-4 w-4" />,
      label: 'Help & Guide',
      active: active === 'help',
      onClick: () => navigate('/admin/help'),
    },
  ]
}
