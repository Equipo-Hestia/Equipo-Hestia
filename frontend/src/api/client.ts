import axios from 'axios'

// En desarrollo, Vite proxea las rutas al backend (ver vite.config.ts).
// En produccion se usa VITE_API_URL del .env.
const BASE_URL = import.meta.env.VITE_API_URL ?? ''

export const api = axios.create({ baseURL: BASE_URL })

// Interceptor de request: inyecta el JWT en cada llamada automaticamente
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('hestia_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// Interceptor de response: si la API devuelve 401 (token expirado/invalido)
// limpia la sesion y redirige al login.
//
// EXCEPCIONES al redirect automatico:
// - /auth/login:       un 401 aqui significa 'contrasena incorrecta',
//                      no token expirado. Mostrar el error normalmente.
// - /importar/*:       el TOTP incorrecto devuelve 403, pero como
//                      capa extra de seguridad no deslogueamos en 401
//                      de endpoints de importacion tampoco.
api.interceptors.response.use(
  (res) => res,
  (error) => {
    const url = error.config?.url ?? ''
    const esExcluido =
      url.includes('/auth/login') ||
      url.includes('/importar')
    if (error.response?.status === 401 && !esExcluido) {
      localStorage.removeItem('hestia_token')
      localStorage.removeItem('hestia_user')
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)
