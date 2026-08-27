// In dev, requests to '/api/v1' are proxied to the local backend (see
// vite.config.ts). In production the frontend and backend are on different
// origins (Vercel + Render), so production builds need the backend's full
// URL instead - set VITE_API_BASE_URL in the deployment's environment.
export const API = import.meta.env.PROD
  ? (import.meta.env.VITE_API_BASE_URL as string)
  : '/api/v1'

// Same origin split applies to the WebSocket used for live attendance
// updates - derive its ws(s):// origin from API instead of the page's own
// location, which in production is the Vercel frontend, not the backend.
export function apiWebSocketUrl(path: string): string {
  const httpOrigin = import.meta.env.PROD
    ? new URL(API).origin
    : window.location.origin
  return httpOrigin.replace(/^http/, 'ws') + path
}
