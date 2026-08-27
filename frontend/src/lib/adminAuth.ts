const TOKEN_KEY = 'admin_token'
const ADMIN_KEY = 'admin_user'

export interface AdminSummary {
  id: string
  email: string
  display_name: string
}

export function getAdminToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function getAdminUser(): AdminSummary | null {
  const raw = localStorage.getItem(ADMIN_KEY)
  return raw ? JSON.parse(raw) : null
}

export function setAdminSession(token: string, admin: AdminSummary) {
  localStorage.setItem(TOKEN_KEY, token)
  localStorage.setItem(ADMIN_KEY, JSON.stringify(admin))
}

export function clearAdminSession() {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(ADMIN_KEY)
}

/**
 * fetch() wrapper that attaches the admin Bearer token and redirects to
 * /admin/login on a 401 (missing/expired/invalid session).
 */
export async function adminFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const token = getAdminToken()
  const headers = new Headers(init.headers)
  if (token) headers.set('Authorization', `Bearer ${token}`)

  const res = await fetch(input, { ...init, headers })

  if (res.status === 401) {
    clearAdminSession()
    window.location.href = '/admin/login'
  }

  return res
}
