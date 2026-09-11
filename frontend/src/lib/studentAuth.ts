const TOKEN_KEY = 'access_token'

export function getStudentToken(): string | null {
  return sessionStorage.getItem(TOKEN_KEY)
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
