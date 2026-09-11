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
    // Events: everything about running an event lives here - creating it,
    // seeing who showed up, and who's covering the scanner for it.
    {
      icon: <CalendarDays className="h-4 w-4" />,
      label: 'Events',
      active: active === 'events',
      onClick: () => navigate('/admin/events'),
      section: 'Events',
    },
    {
      icon: <ClipboardList className="h-4 w-4" />,
      label: 'Attendance Reports',
      active: active === 'attendance',
      onClick: active === 'attendance' ? undefined : onAttendanceReportsClick,
      section: 'Events',
    },

    // People: the student roster and anything a student can request review of.
    {
      icon: <IdCard className="h-4 w-4" />,
      label: 'Students',
      active: active === 'students',
      onClick: () => navigate('/admin/students'),
      section: 'People',
    },
    {
      icon: <FileWarning className="h-4 w-4" />,
      label: 'Excuse Requests',
      active: active === 'excuse-requests',
      onClick: () => navigate('/admin/excuse-requests'),
      section: 'People',
    },
    { icon: <Users className="h-4 w-4" />, label: 'Org Directory', disabled: true, section: 'People' },
    { icon: <UploadCloud className="h-4 w-4" />, label: 'Roster Import', disabled: true, section: 'People' },

    // Finance: dues and the consequences of missing a required event.
    {
      icon: <Wallet className="h-4 w-4" />,
      label: 'Membership Ledger',
      active: active === 'payments',
      onClick: () => navigate('/admin/payments'),
      section: 'Finance',
    },
    {
      icon: <Gavel className="h-4 w-4" />,
      label: 'Sanctions',
      active: active === 'sanctions',
      onClick: () => navigate('/admin/sanctions'),
      section: 'Finance',
    },

    // Content
    {
      icon: <Newspaper className="h-4 w-4" />,
      label: 'News & Updates',
      active: active === 'news',
      onClick: () => navigate('/admin/news'),
      section: 'Content',
    },

    // Inventory: physical items the org owns - equipment, supplies, etc.
    {
      icon: <Boxes className="h-4 w-4" />,
      label: 'Inventory',
      active: active === 'inventory',
      onClick: () => navigate('/admin/inventory'),
      section: 'Inventory',
    },
    {
      icon: <ArrowLeftRight className="h-4 w-4" />,
      label: 'Inventory Turnover',
      disabled: true,
      section: 'Inventory',
    },

    // Not built yet
    {
      icon: <ShieldCheck className="h-4 w-4" />,
      label: 'Module Permissions',
      disabled: true,
      section: 'Coming Soon',
    },

    {
      icon: <BookOpen className="h-4 w-4" />,
      label: 'Help & Guide',
      active: active === 'help',
      onClick: () => navigate('/admin/help'),
      section: 'Support',
    },
  ]
}
