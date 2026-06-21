import { create } from 'zustand'

export interface AuthUser {
  id?: number
  nombre: string
  rol: string
  avatar_b64?: string | null // <-- Agregamos la propiedad opcional
}

interface AuthState {
  token: string | null
  user: AuthUser | null
  setAuth: (token: string, user: AuthUser) => void
  updateUser: (userData: Partial<AuthUser>) => void // <-- Nueva función para actualizar solo partes del usuario
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

  // Permite actualizar campos específicos (como el avatar) sin borrar el token
  updateUser: (userData) => set((state) => {
    if (!state.user) return state; // Si no hay usuario logueado, no hace nada
    const updatedUser = { ...state.user, ...userData }
    localStorage.setItem('hestia_user', JSON.stringify(updatedUser))
    return { user: updatedUser }
  }),

  logout: () => {
    localStorage.removeItem('hestia_token')
    localStorage.removeItem('hestia_user')
    set({ token: null, user: null })
  },
}))