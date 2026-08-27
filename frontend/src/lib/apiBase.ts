// In dev, requests to '/api/v1' are proxied to the local backend (see
// vite.config.ts). In production the frontend and backend are on different
// origins (Vercel + Render), so production builds need the backend's full
// URL instead - set VITE_API_BASE_URL in the deployment's environment.
export const API = import.meta.env.PROD
  ? (import.meta.env.VITE_API_BASE_URL as string)
  : '/api/v1'

// Same origin split applies to the WebSocket used for live attendance
// updates. `path` is expected to already include the API prefix (e.g.
// `${API}/events/.../ws`) - in dev that's relative ('/api/v1/...'), resolved
// against the page's own origin; in prod it's already absolute (the Render
// backend's URL), so the base argument below is ignored. Either way we just
// flip the resolved URL's http(s) scheme to ws(s).
export function apiWebSocketUrl(path: string): string {
  const url = new URL(path, window.location.href)
  url.protocol = url.protocol.replace('http', 'ws')
  return url.toString()
}
