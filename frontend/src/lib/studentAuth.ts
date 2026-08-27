const TOKEN_KEY = 'access_token'

export function getStudentToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
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
    localStorage.removeItem('access_token')
    localStorage.removeItem('user')
    window.location.href = '/login'
  }

  return res
}
