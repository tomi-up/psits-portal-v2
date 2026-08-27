import { useAuthStore } from '@/stores/authStore'

export default function DashboardPage() {
  const profile = useAuthStore((s) => s.profile)
  const signOut = useAuthStore((s) => s.signOut)

  if (!profile) return null

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-4">
          <h1 className="text-lg font-semibold text-slate-950">PSITS Portal</h1>
          <button onClick={() => void signOut()} className="btn-secondary px-4 py-1.5 text-sm">
            Sign out
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-4xl space-y-6 px-4 py-8">
        <div className="card">
          <h2 className="mb-4 text-base font-semibold text-slate-950">Your profile</h2>
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Name</dt>
              <dd className="mt-0.5 text-sm text-slate-950">{profile.display_name}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Email</dt>
              <dd className="mt-0.5 text-sm text-slate-950">{profile.email}</dd>
            </div>
            {profile.student_id && (
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Student ID
                </dt>
                <dd className="mt-0.5 text-sm text-slate-950">{profile.student_id}</dd>
              </div>
            )}
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Status</dt>
              <dd className="mt-0.5 text-sm text-slate-950">{profile.status}</dd>
            </div>
          </dl>
        </div>

        <div className="card">
          <h2 className="mb-4 text-base font-semibold text-slate-950">Roles</h2>
          <div className="flex flex-wrap gap-2">
            {profile.roles.length === 0 && (
              <p className="text-sm text-slate-500">No roles assigned yet.</p>
            )}
            {profile.roles.map((role) => (
              <span
                key={role.id}
                className="rounded-full bg-sky-100 px-3 py-1 text-xs font-medium text-sky-800"
              >
                {role.name}
              </span>
            ))}
          </div>
        </div>

        <div className="card">
          <h2 className="mb-4 text-base font-semibold text-slate-950">
            Permissions ({profile.permissions.length})
          </h2>
          <div className="flex flex-wrap gap-1.5">
            {profile.permissions.map((permission) => (
              <span
                key={permission}
                className="rounded bg-slate-100 px-2 py-1 font-mono text-xs text-slate-700"
              >
                {permission}
              </span>
            ))}
          </div>
        </div>
      </main>
    </div>
  )
}
