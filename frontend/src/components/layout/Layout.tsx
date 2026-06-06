import { Outlet, Navigate, useNavigate } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { useAuthStore } from '../../store/auth'
import { useThemeStore } from '../../store/theme'
import { useEffect, useState } from 'react'
import { ShieldAlert, X } from 'lucide-react'
import { api } from '../../api/client'
import type { UsuarioMe } from '../../types/api'

export function Layout() {
  const token = useAuthStore((s) => s.token)
  const navigate = useNavigate()
  const { isDark } = useThemeStore()

  const [show2FAWarning, setShow2FAWarning] = useState(false)

  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }, [isDark])

  useEffect(() => {
    if (!token) return
    api.get<UsuarioMe>('/usuarios/me').then(({ data }) => {
      if (!data.totp_habilitado) setShow2FAWarning(true)
    }).catch(() => {})
  }, [token])

  function dismiss2FA() { setShow2FAWarning(false) }

  function goToSecurity() {
    dismiss2FA()
    navigate('/seguridad')
  }

  if (!token) return <Navigate to="/login" replace />

  return (
    <div className="flex h-screen overflow-hidden bg-h-base">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>

      {show2FAWarning && (
        <div
          className="
            fixed inset-0 bg-black/50 backdrop-blur-sm
            flex items-center justify-center z-50 p-4
          "
        >
          <div className="bg-h-surface border border-h-subtle rounded-2xl w-full max-w-sm p-7">
            <div className="flex items-start justify-between mb-4">
              <div
                className="
                  w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0
                  bg-h-warning border border-h-warning
                "
              >
                <ShieldAlert size={24} className="text-h-warning" />
              </div>
              <button
                onClick={dismiss2FA}
                className="
                  w-8 h-8 rounded-lg flex items-center justify-center
                  text-h-tertiary hover:bg-h-elevated hover:text-h-secondary
                  transition-colors duration-150
                "
              >
                <X size={16} />
              </button>
            </div>

            <h2 className="text-lg font-bold text-h-primary mb-2">
              Activa la verificación en dos pasos
            </h2>
            <p className="text-h-secondary text-sm mb-4">
              Sin el 2FA activo, algunas funciones críticas no estarán disponibles:
            </p>
            <ul className="space-y-2 mb-6">
              {[
                'Importar insumos desde CSV o XLSX',
                'Eliminar insumos del inventario',
                'Eliminar usuarios del sistema',
              ].map((item) => (
                <li key={item} className="flex items-center gap-2 text-sm">
                  <span
                    className="
                      w-5 h-5 rounded-full flex items-center justify-center
                      text-xs flex-shrink-0
                      bg-h-warning text-h-warning
                    "
                  >
                    !
                  </span>
                  <span className="text-h-primary font-medium">{item}</span>
                </li>
              ))}
            </ul>

            <button
              onClick={goToSecurity}
              className="
                w-full font-semibold py-2.5 rounded-xl transition-colors mb-2
                text-sm text-white
              "
              style={{ background: 'var(--h-teal-rest)' }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = 'var(--h-teal-hover)'
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = 'var(--h-teal-rest)'
              }}
            >
              Configurar 2FA ahora
            </button>
            <button
              onClick={dismiss2FA}
              className="
                w-full py-2 text-sm font-medium transition-colors
                text-h-tertiary hover:text-h-secondary
              "
            >
              Recordar más tarde
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
