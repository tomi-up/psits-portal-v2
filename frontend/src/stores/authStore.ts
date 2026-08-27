import { create } from 'zustand'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { api, type ApiResponse } from '@/lib/api'

export interface RoleSummary {
  id: string
  code: string
  name: string
}

export interface Profile {
  id: string
  auth_user_id: string
  student_id: string | null
  display_name: string
  email: string
  profile_image_url: string | null
  status: string
  roles: RoleSummary[]
  permissions: string[]
  created_at: string
}

interface AuthState {
  session: Session | null
  profile: Profile | null
  isLoading: boolean
  isInitialized: boolean
  hasPermission: (permission: string) => boolean
  init: () => Promise<void>
  refreshProfile: () => Promise<void>
  signOut: () => Promise<void>
}

export const useAuthStore = create<AuthState>((set, get) => ({
  session: null,
  profile: null,
  isLoading: true,
  isInitialized: false,

  hasPermission: (permission) => get().profile?.permissions.includes(permission) ?? false,

  init: async () => {
    const { data } = await supabase.auth.getSession()
    set({ session: data.session })

    if (data.session) {
      await get().refreshProfile()
    }

    set({ isLoading: false, isInitialized: true })

    supabase.auth.onAuthStateChange(async (_event, session) => {
      set({ session })
      if (session) {
        await get().refreshProfile()
      } else {
        set({ profile: null })
      }
    })
  },

  refreshProfile: async () => {
    try {
      const res = await api.get<ApiResponse<Profile>>('/auth/me')
      set({ profile: res.data.data ?? null })
    } catch {
      // No profile linked yet (e.g. signed up but not activated), or
      // the request failed - either way, treat as "no profile".
      set({ profile: null })
    }
  },

  signOut: async () => {
    await supabase.auth.signOut()
    set({ session: null, profile: null })
  },
}))
