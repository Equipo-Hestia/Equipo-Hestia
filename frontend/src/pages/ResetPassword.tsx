import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { api } from '../api/client'
import { Logo } from '../components/ui/Logo'

export function ResetPassword() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [exito, setExito] = useState(false)

  const inputCls = `
    w-full px-3.5 py-2.5 rounded-lg border border-slate-700 bg-slate-800 text-white text-sm
    focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent
    placeholder:text-slate-500 transition-all
  `
  const btnCls = `
    w-full bg-teal-600 hover:bg-teal-700 text-white font-bold py-2.5 rounded-lg
    transition-colors disabled:opacity-50 disabled:cursor-not-allowed
  `
  const labelCls = "block text-xs font-bold text-slate-400 mb-1.5 uppercase tracking-wide"

  async function handleReset(e: React.FormEvent) {
    e.preventDefault()
    if (password !== confirm) {
      setError('Las contraseñas no coinciden.')
      return
    }
    setLoading(true)
    setError(null)
    try {
      await api.post('/auth/confirmar-reset', { token, nueva_password: password })
      setExito(true)
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })
        .response?.data?.detail
      setError(msg ?? 'Error al restablecer la contraseña. El enlace puede haber expirado.')
    } finally { setLoading(false) }
  }

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_#134e4a22_0%,_transparent_60%)]" />
      <div className="relative w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-32 h-32 mb-4">
            <Logo className="w-32 h-32" />
          </div>
          <h1 className="text-4xl font-black text-white tracking-tight">Hestia</h1>
        </div>

        <div className="bg-slate-800 rounded-2xl border border-slate-700 shadow-2xl p-7">

          {/* Enlace inválido o sin token */}
          {!token ? (
            <div className="text-center py-4">
              <div className="w-12 h-12 rounded-full bg-amber-900 border border-amber-700
                              flex items-center justify-center mx-auto mb-4 text-2xl">
                ⚠️
              </div>
              <h2 className="text-base font-bold text-white mb-2">Enlace inválido</h2>
              <p className="text-slate-400 text-xs mb-5">
                Este enlace de recuperación no es válido o ya fue utilizado.
                Solicita uno nuevo desde la pantalla de inicio de sesión.
              </p>
              <button onClick={() => navigate('/login')} className={btnCls}>
                Volver al inicio de sesión
              </button>
            </div>

          ) : exito ? (
            /* Éxito */
            <div className="text-center py-4">
              <div className="w-12 h-12 rounded-full bg-teal-900 border border-teal-700
                              flex items-center justify-center mx-auto mb-4 text-2xl">
                ✅
              </div>
              <h2 className="text-base font-bold text-white mb-2">¡Contraseña actualizada!</h2>
              <p className="text-slate-400 text-xs mb-5">
                Tu contraseña fue restablecida correctamente. Ya puedes iniciar sesión
                con tus nuevas credenciales.
              </p>
              <button onClick={() => navigate('/login')} className={btnCls}>
                Iniciar sesión
              </button>
            </div>

          ) : (
            /* Formulario de nueva contraseña */
            <>
              <h2 className="text-base font-bold text-white mb-1">Nueva contraseña</h2>
              <p className="text-slate-400 text-xs mb-5">
                Elige una contraseña segura: mínimo 8 caracteres con mayúscula,
                minúscula, número y carácter especial.
              </p>
              <form onSubmit={handleReset} className="space-y-4">
                <div>
                  <label className={labelCls}>Nueva contraseña</label>
                  <input
                    type="password" value={password}
                    onChange={e => { setPassword(e.target.value); setError(null) }}
                    className={inputCls} placeholder="••••••••" required autoFocus
                  />
                </div>
                <div>
                  <label className={labelCls}>Confirmar contraseña</label>
                  <input
                    type="password" value={confirm}
                    onChange={e => { setConfirm(e.target.value); setError(null) }}
                    className={inputCls} placeholder="••••••••" required
                  />
                </div>
                {error && (
                  <p className="text-rose-400 text-xs bg-rose-950 border border-rose-800
                                px-3 py-2 rounded-lg font-semibold">{error}</p>
                )}
                <button
                  type="submit"
                  disabled={loading || !password || !confirm}
                  className={btnCls}
                >
                  {loading ? 'Guardando...' : 'Restablecer contraseña'}
                </button>
              </form>
            </>
          )}
        </div>
        <p className="text-center text-slate-600 text-xs mt-6">
          Escuela de Salud — DuocUC
        </p>
      </div>
    </div>
  )
}
