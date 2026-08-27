import axios from 'axios'
import { supabase } from './supabase'

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL as string,
  timeout: Number(import.meta.env.VITE_API_TIMEOUT ?? 30000),
})

// Attach the current Supabase access token to every outgoing request.
// The backend validates this token against Supabase on each call.
api.interceptors.request.use(async (config) => {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token

  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }

  return config
})

export interface ApiResponse<T = unknown> {
  success: boolean
  data?: T
  message: string
  timestamp: string
}

export interface ApiErrorBody {
  success: false
  error: string
  message: string
  details?: Record<string, unknown> | null
}
