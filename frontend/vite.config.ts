import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import type { IncomingMessage } from 'http'

const API = process.env.API_URL ?? 'http://localhost:8000'

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
    host: true,
    headers: {
      'Content-Security-Policy': CSP,
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
    },
    proxy: {
      '/auth':                     apiProxy(API),
      '/insumos':                  apiProxy(API),
      '/importar':                 apiProxy(API),
      '/resumen':                  apiProxy(API),
      '/salas':                    apiProxy(API),
      '/categorias':               apiProxy(API),
      '/usuarios':                 apiProxy(API),
      '/movimientos':              apiProxy(API),
      '/audit-log':                apiProxy(API),
      '/solicitudes':              apiProxy(API),
      '/retornos':                 apiProxy(API),
      '/asignaturas':              apiProxy(API),
      '/clases-docente':           apiProxy(API),
      '/docentes':                 apiProxy(API),
      '/reportes':                 apiProxy(API),
      '/activos-fijos':            apiProxy(API),
      '/unidades-implemento':      apiProxy(API),
      '/talleres':                 apiProxy(API),
      '/paquetes':                 apiProxy(API),
      '/proveedores':              apiProxy(API),
      '/ordenes-mantenimiento':    apiProxy(API),
      '/ordenes-entrada':          apiProxy(API),
      '/programacion':             apiProxy(API),
      '/revisiones':               apiProxy(API),
    },
  },
})
