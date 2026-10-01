const TOKEN_KEY = 'access_token'
const USER_KEY = 'user'

export interface StudentUser {
  student_id: string
  name: string
  email?: string
  avatar_url?: string | null
}

export function getStudentToken(): string | null {
  return sessionStorage.getItem(TOKEN_KEY)
}

/**
 * Synchronous read of the logged-in student from sessionStorage. Call this
 * directly in render (or a useState initializer) rather than via useEffect -
 * the value is already sitting in storage, so deferring it to an effect
 * just adds an extra render where the page has nothing to show yet.
 */
export function getStudentUser(): StudentUser | null {
  const raw = sessionStorage.getItem(USER_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

/**
 * fetch() wrapper that attaches the student Bearer token and redirects to
 * /login on a 401 (missing/expired/invalid session, or an authenticator
 * reset by an admin).
 */
export async function studentFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const token = getStudentToken()
  const headers = new Headers(init.headers)
  if (token) headers.set('Authorization', `Bearer ${token}`)

  const res = await fetch(input, { ...init, headers })

  if (res.status === 401) {
    sessionStorage.removeItem('access_token')
    sessionStorage.removeItem('user')
    window.location.href = '/login'
  }

  return res
}
