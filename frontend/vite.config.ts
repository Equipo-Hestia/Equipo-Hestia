import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import type { IncomingMessage } from 'http'

// En desarrollo local el proxy apunta a localhost:8000.
// Dentro de Docker Compose, API_URL se inyecta como http://api:8000
// (nombre del servicio en el compose) para que el contenedor frontend
// pueda alcanzar el contenedor backend por la red interna de Docker.
const API = process.env.API_URL ?? 'http://localhost:8000'

// Content Security Policy compartida entre el servidor de desarrollo y
// cualquier proxy de produccion. 'unsafe-inline' en script/style es necesario
// para Vite HMR y Tailwind. Para un build de produccion servido con nginx
// se puede endurecer con nonces y eliminar 'unsafe-inline' de script-src.
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self' ws: wss:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ')

/**
 * Configuracion compartida para cada entrada del proxy.
 *
 * autoRewrite: true
 *   Reescribe el header Location de respuestas 3xx para que apunte al
 *   origen del proxy (localhost:3000) en vez de al backend real
 *   (api:8000). Sin esto, FastAPI devuelve un 307 con
 *   Location: http://api:8000/insumos/ y el browser intenta navegar a
 *   ese hostname interno de Docker, que no resuelve desde fuera.
 *
 * bypass
 *   Si el browser pide la ruta como navegacion HTML (Accept: text/html),
 *   es un hard-refresh de una ruta de React Router — hay que servir
 *   index.html, no proxear al backend. Las llamadas de Axios llevan
 *   Accept: application/json y pasan al proxy con normalidad.
 */
function apiProxy(target: string) {
  return {
    target,
    changeOrigin: true,
    autoRewrite: true,
    bypass(req: IncomingMessage) {
      const accept = req.headers['accept'] ?? ''
      if (accept.includes('text/html')) return '/index.html'
    },
  }
}

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    host: true, // escucha en 0.0.0.0 — necesario para Docker
    headers: {
      'Content-Security-Policy': CSP,
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
    },
    proxy: {
      '/auth':         apiProxy(API),
      '/insumos':      apiProxy(API),
      '/importar':     apiProxy(API),
      '/resumen':      apiProxy(API),
      '/salas':        apiProxy(API),
      '/categorias':   apiProxy(API),
      '/usuarios':     apiProxy(API),
      '/movimientos':  apiProxy(API),
      '/audit-log':    apiProxy(API),
      '/solicitudes':  apiProxy(API),
      '/retornos':     apiProxy(API),
    },
  },
})
