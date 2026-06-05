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

  // Sincroniza la clase 'dark' en <html> cuando cambia la preferencia de tema
  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }, [isDark])

  useEffect(() => {
    if (!token) return

    // Pop-up 2FA: aparece siempre que totp_habilitado sea false,
    // sin importar si el usuario ya lo descartó antes.
    api.get<UsuarioMe>('/usuarios/me').then(({ data }) => {
      if (!data.totp_habilitado) setShow2FAWarning(true)
    }).catch(() => {})

    // El pop-up de solicitudes fue eliminado: el flujo de solicitudes
    // de retiro ya no existe en Hestia. Maritza gestiona los insumos
    // a través de los Paquetes de insumos (Guía de Taller).
  }, [token])

  function dismiss2FA() { setShow2FAWarning(false) }

  function goToSecurity() {
    dismiss2FA()
    navigate('/seguridad')
  }

  if (!token) return <Navigate to="/login" replace />

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 dark:bg-slate-900">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>

      {/* Pop-up 2FA — aparece siempre que totp_habilitado sea false */}
      {show2FAWarning && (
        <div
          className="
            fixed inset-0 bg-slate-900/50 backdrop-blur-sm
            flex items-center justify-center z-50 p-4
          "
        >
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-sm p-7">
            <div className="flex items-start justify-between mb-4">
              <div
                className="
                  w-12 h-12 bg-amber-100 dark:bg-amber-900/40 rounded-xl
                  flex items-center justify-center flex-shrink-0
                "
              >
                <ShieldAlert size={24} className="text-amber-600 dark:text-amber-400" />
              </div>
              <button
                onClick={dismiss2FA}
                className="
                  w-8 h-8 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700
                  flex items-center justify-center
                  text-slate-400 hover:text-slate-600 dark:hover:text-slate-200
                "
              >
                <X size={16} />
              </button>
            </div>

            <h2 className="text-lg font-black text-slate-900 dark:text-slate-50 mb-2">
              Activa la verificación en dos pasos
            </h2>
            <p className="text-slate-500 dark:text-slate-400 text-sm mb-4">
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
                      bg-amber-100 dark:bg-amber-900/50
                      text-amber-700 dark:text-amber-400
                    "
                  >
                    !
                  </span>
                  <span className="text-slate-700 dark:text-slate-300 font-semibold">
                    {item}
                  </span>
                </li>
              ))}
            </ul>

            <button
              onClick={goToSecurity}
              className="
                w-full bg-teal-600 hover:bg-teal-700 text-white font-bold
                py-2.5 rounded-xl transition-colors mb-2
              "
            >
              Configurar 2FA ahora
            </button>
            <button
              onClick={dismiss2FA}
              className="
                w-full py-2 text-sm font-semibold transition-colors
                text-slate-400 hover:text-slate-600 dark:hover:text-slate-200
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
