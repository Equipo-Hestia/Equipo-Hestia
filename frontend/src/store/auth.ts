import { create } from 'zustand'

export interface AuthUser {
  nombre: string
  rol: string
}

interface AuthState {
  token: string | null
  user: AuthUser | null
  setAuth: (token: string, user: AuthUser) => void
  logout: () => void
}

// Zustand es el gestor de estado global.
// Piensalo como una variable global reactiva: cuando cambia,
// todos los componentes que la leen se actualizan automaticamente.
export const useAuthStore = create<AuthState>((set) => ({
  token: localStorage.getItem('hestia_token'),
  user: (() => {
    const raw = localStorage.getItem('hestia_user')
    return raw ? (JSON.parse(raw) as AuthUser) : null
  })(),
  setAuth: (token, user) => {
    localStorage.setItem('hestia_token', token)
    localStorage.setItem('hestia_user', JSON.stringify(user))
    set({ token, user })
  },
  logout: () => {
    localStorage.removeItem('hestia_token')
    localStorage.removeItem('hestia_user')
    set({ token: null, user: null })
  },
}))
