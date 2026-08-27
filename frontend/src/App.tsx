import { useEffect } from 'react'
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { useAuthStore } from '@/stores/authStore'
import { RequireAuth, RequireSessionNoProfile, RequireGuest } from '@/components/RouteGuards'
import RequireAdmin from '@/components/RequireAdmin'
import LoginPage from '@/pages/LoginPage'
import SignupPage from '@/pages/SignupPage'
import CheckEmailPage from '@/pages/CheckEmailPage'
import ActivatePage from '@/pages/ActivatePage'
import ActivationPage from '@/pages/ActivationPage'
import DashboardPage from '@/pages/DashboardPage'
import LandingPage from '@/pages/LandingPage'
import StudentDashboardPage from '@/pages/StudentDashboardPage'
import StudentEventsPage from '@/pages/StudentEventsPage'
import StudentAttendancePage from '@/pages/StudentAttendancePage'
import AdminLoginPage from '@/pages/AdminLoginPage'
import AdminEventsPage from '@/pages/AdminEventsPage'
import AdminEventFormPage from '@/pages/AdminEventFormPage'
import AdminEventRegistrationsPage from '@/pages/AdminEventRegistrationsPage'
import AdminStudentsPage from '@/pages/AdminStudentsPage'
import AdminStudentFormPage from '@/pages/AdminStudentFormPage'
import AdminHelpPage from '@/pages/AdminHelpPage'
import QRScannerPage from '@/pages/QRScannerPage'
import UnauthorizedPage from '@/pages/UnauthorizedPage'
import NotFoundPage from '@/pages/NotFoundPage'

export default function App() {
  const init = useAuthStore((s) => s.init)

  useEffect(() => {
    void init()
  }, [init])

  return (
    <Router>
      <Toaster position="top-right" gutter={12} toastOptions={{ duration: 4000 }} />
      <Routes>
        <Route element={<RequireGuest />}>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route path="/check-email" element={<CheckEmailPage />} />
        </Route>

        <Route element={<RequireSessionNoProfile />}>
          <Route path="/activate" element={<ActivatePage />} />
        </Route>

        <Route path="/" element={<LandingPage />} />

        <Route element={<RequireAuth />}>
          <Route path="/legacy-dashboard" element={<DashboardPage />} />
        </Route>

        {/* MVP Activation - public for testing */}
        <Route path="/activate-new" element={<ActivationPage />} />

        {/* MVP Student Dashboard - passwordless auth, reads from localStorage */}
        <Route path="/dashboard" element={<StudentDashboardPage />} />
        <Route path="/events" element={<StudentEventsPage />} />
        <Route path="/attendance" element={<StudentAttendancePage />} />

        {/* Admin - email/password login, gated by RequireAdmin */}
        <Route path="/admin/login" element={<AdminLoginPage />} />
        <Route path="/401" element={<UnauthorizedPage />} />
        <Route element={<RequireAdmin />}>
          <Route path="/admin/events" element={<AdminEventsPage />} />
          <Route path="/admin/events/new" element={<AdminEventFormPage />} />
          <Route path="/admin/events/:eventId/edit" element={<AdminEventFormPage />} />
          <Route path="/admin/events/:eventId/registrations" element={<AdminEventRegistrationsPage />} />
          <Route path="/admin/students" element={<AdminStudentsPage />} />
          <Route path="/admin/students/new" element={<AdminStudentFormPage />} />
          <Route path="/admin/students/:id/edit" element={<AdminStudentFormPage />} />
          <Route path="/admin/help" element={<AdminHelpPage />} />

          {/* Scanner - an admin must be logged in on this device to scan attendance */}
          <Route path="/scanner/:eventId" element={<QRScannerPage />} />
          <Route path="/scanner" element={<QRScannerPage />} />
        </Route>

        <Route path="/404" element={<NotFoundPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Router>
  )
}
