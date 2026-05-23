import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import { useAuthStore } from '../store/auth'
import { Logo } from '../components/ui/Logo'
import type { LoginResponse, Setup2FAResponse } from '../types/api'

type Modo2FA = 'totp' | 'recovery'
type SetupStep = 'qr' | 'code' | 'recovery'

const SOPORTE_EMAIL = 'hestia.soporte.cc@gmail.com'

const FAQ_ITEMS = [
  {
    q: '¿Olvidé mi contraseña. ¿Qué hago?',
    a: 'Usa el enlace «¿Olvidaste tu contraseña?» debajo del botón Ingresar. Recibirás un correo con instrucciones.',
  },
  {
    q: '¿Por qué no puedo ver mis solicitudes enviadas?',
    a: 'Ingresa a la sección «Solicitudes». Si recién enviaste una, espera unos segundos y recarga la página.',
  },
  {
    q: 'El stock de un insumo parece incorrecto.',
    a: 'El inventario se actualiza automáticamente al completar cada pedido. Contacta al operador o al administrador del sistema.',
  },
  {
    q: 'No recibo el correo de recuperación de contraseña.',
    a: 'Revisa tu carpeta de spam. El enlace es válido por 1 hora. Si persiste, envíanos un ticket desde este formulario.',
  },
  {
    q: 'No puedo iniciar sesión y tengo 2FA activo.',
    a: 'Usa uno de tus códigos de recuperación de un solo uso. Si tampoco los tienes, contacta al administrador.',
  },
]

const TEMAS = [
  'Problema al iniciar sesión',
  'No recibo correo de recuperación',
  'Error en el inventario / stock',
  'Solicitud no registrada o perdida',
  'Problema con 2FA',
  'Error general del sistema',
  'Otro',
]

function ModalAcercaDe({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-slate-800 rounded-2xl border border-slate-700 shadow-2xl max-w-sm w-full p-7 relative"
        onClick={e => e.stopPropagation()}
      >
        <button onClick={onClose}
          className="absolute top-4 right-4 text-slate-500 hover:text-slate-300 text-xl leading-none transition-colors"
          aria-label="Cerrar">×</button>
        <div className="flex flex-col items-center mb-6">
          <Logo className="w-16 h-16 mb-3" />
          <h2 className="text-xl font-black text-white tracking-tight">Hestia</h2>
          <p className="text-teal-400 text-xs font-semibold mt-1">Sistema de gestión de insumos médicos</p>
        </div>
        <div className="space-y-3 text-xs text-slate-400">
          <div className="bg-slate-900/60 rounded-xl border border-slate-700 px-4 py-3 space-y-2">
            <p><span className="text-slate-300 font-semibold">Institución</span><br />DuocUC — Sede San Bernardo</p>
            <p><span className="text-slate-300 font-semibold">Escuela</span><br />Escuela de Salud</p>
            <p><span className="text-slate-300 font-semibold">Carrera</span><br />Informática Biomédica</p>
            <p><span className="text-slate-300 font-semibold">Tipo de proyecto</span><br />Proyecto de Título · Ruta IE</p>
            <p><span className="text-slate-300 font-semibold">Período</span><br />2024 – 2025</p>
          </div>
          <div className="bg-slate-900/60 rounded-xl border border-slate-700 px-4 py-3">
            <p className="text-slate-300 font-semibold mb-2">Stack tecnológico</p>
            <div className="flex flex-wrap gap-1.5">
              {['FastAPI', 'PostgreSQL', 'React 19', 'TypeScript', 'Tailwind CSS', 'Docker'].map(t => (
                <span key={t} className="bg-slate-700 text-slate-300 px-2 py-0.5 rounded-md font-mono text-[10px]">{t}</span>
              ))}
            </div>
          </div>
        </div>
        <p className="text-center text-slate-600 text-[10px] mt-5">
          <strong className="text-slate-500">H</strong>ospitalidad·
          <strong className="text-slate-500">E</strong>ficacia·
          <strong className="text-slate-500">S</strong>ervicio·
          <strong className="text-slate-500">T</strong>ransparencia·
          <strong className="text-slate-500">I</strong>nsumos·
          <strong className="text-slate-500">A</strong>postolado
        </p>
      </div>
    </div>
  )
}

function ModalSoporte({ onClose }: { onClose: () => void }) {
  const [nombre, setNombre]   = useState('')
  const [tema, setTema]       = useState(TEMAS[0])
  const [mensaje, setMensaje] = useState('')
  const [enviado, setEnviado] = useState(false)
  const [expandFaq, setExpandFaq] = useState<number | null>(null)

  function handleEnviar(e: React.FormEvent) {
    e.preventDefault()
    const subject = encodeURIComponent(`[Hestia Soporte] ${tema}`)
    const body = encodeURIComponent(
      `Nombre: ${nombre || 'No indicado'}\nTema: ${tema}\n\nDescripción:\n${mensaje}`
    )
    window.open(`mailto:${SOPORTE_EMAIL}?subject=${subject}&body=${body}`, '_blank')
    setEnviado(true)
  }

  const inputCls = `w-full px-3 py-2.5 rounded-lg border border-slate-700 bg-slate-900
    text-white text-sm focus:outline-none focus:ring-2 focus:ring-teal-500
    placeholder:text-slate-600 transition-all`
  const labelCls = 'block text-xs font-bold text-slate-400 mb-1.5 uppercase tracking-wide'

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-slate-800 rounded-2xl border border-slate-700 shadow-2xl
                   w-full max-w-md relative flex flex-col max-h-[90vh]"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-7 pt-6 pb-4
                        border-b border-slate-700 flex-shrink-0">
          <div>
            <h2 className="text-base font-bold text-white">Centro de soporte</h2>
            <p className="text-xs text-slate-400 mt-0.5">Hestia — Escuela de Salud DuocUC</p>
          </div>
          <button onClick={onClose}
            className="text-slate-500 hover:text-slate-300 text-xl leading-none transition-colors"
            aria-label="Cerrar">×</button>
        </div>
        <div className="overflow-y-auto flex-1 px-7 py-5 space-y-6">
          {enviado ? (
            <div className="text-center py-4">
              <div className="w-12 h-12 rounded-full bg-teal-900 border border-teal-700
                              flex items-center justify-center mx-auto mb-4 text-xl">✉️</div>
              <h3 className="text-base font-bold text-white mb-2">Ticket enviado</h3>
              <p className="text-slate-400 text-xs mb-4">
                Se abrió tu cliente de correo con el mensaje listo para enviar a{' '}
                <span className="text-teal-400 font-semibold">{SOPORTE_EMAIL}</span>.
                Responderemos a la brevedad.
              </p>
              <button onClick={() => setEnviado(false)}
                className="text-xs text-slate-500 hover:text-slate-300 font-semibold
                           transition-colors underline">
                Enviar otro ticket
              </button>
            </div>
          ) : (
            <div>
              <h3 className="text-sm font-bold text-slate-300 mb-3">Contactar soporte</h3>
              <form onSubmit={handleEnviar} className="space-y-3">
                <div>
                  <label className={labelCls}>Nombre (opcional)</label>
                  <input type="text" value={nombre} onChange={e => setNombre(e.target.value)}
                    className={inputCls} placeholder="Tu nombre o usuario" />
                </div>
                <div>
                  <label className={labelCls}>Tipo de problema *</label>
                  <select required value={tema} onChange={e => setTema(e.target.value)}
                    className={inputCls + ' cursor-pointer'}>
                    {TEMAS.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Descripción *</label>
                  <textarea required rows={4} value={mensaje}
                    onChange={e => setMensaje(e.target.value)}
                    className={inputCls + ' resize-none'}
                    placeholder="Describe el problema con el mayor detalle posible..." />
                </div>
                <button type="submit" disabled={!mensaje.trim()}
                  className="w-full bg-teal-600 hover:bg-teal-700 text-white font-bold
                             py-2.5 rounded-lg transition-colors disabled:opacity-50
                             disabled:cursor-not-allowed text-sm">
                  Abrir cliente de correo
                </button>
                <p className="text-[10px] text-slate-600 text-center">
                  Se abrirá tu app de correo con el mensaje prellenado a{' '}
                  <span className="text-slate-500">{SOPORTE_EMAIL}</span>
                </p>
              </form>
            </div>
          )}
          <div>
            <h3 className="text-sm font-bold text-slate-300 mb-3">Preguntas frecuentes</h3>
            <div className="space-y-1.5">
              {FAQ_ITEMS.map((item, i) => (
                <div key={i} className="rounded-xl border border-slate-700 overflow-hidden">
                  <button type="button"
                    onClick={() => setExpandFaq(expandFaq === i ? null : i)}
                    className="w-full flex items-center justify-between gap-3
                               px-4 py-3 text-left hover:bg-slate-700/50 transition-colors">
                    <span className="text-xs font-semibold text-slate-300">{item.q}</span>
                    <span className="text-slate-500 flex-shrink-0 text-sm">
                      {expandFaq === i ? '−' : '+'}
                    </span>
                  </button>
                  {expandFaq === i && (
                    <div className="px-4 pb-3">
                      <p className="text-xs text-slate-400 leading-relaxed">{item.a}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export function Login() {
  const navigate = useNavigate()
  const setAuth  = useAuthStore((s) => s.setAuth)

  // Estado: login
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState<string | null>(null)

  // Estado: flujo 2FA normal (ya configurado)
  const [preToken, setPreToken] = useState<string | null>(null)
  const [totp, setTotp]         = useState('')
  const [recovery, setRecovery] = useState('')
  const [modo2FA, setModo2FA]   = useState<Modo2FA>('totp')

  // Estado: configuración inicial obligatoria de 2FA
  const [isSetup2FA, setIsSetup2FA]     = useState(false)
  const [setupToken, setSetupToken]     = useState<string | null>(null)
  const [setupQR, setSetupQR]           = useState<Setup2FAResponse | null>(null)
  const [setupStep, setSetupStep]       = useState<SetupStep>('qr')
  const [setupTotp, setSetupTotp]       = useState('')
  const [setupCodes, setSetupCodes]     = useState<string[]>([])
  const [showSecret, setShowSecret]     = useState(false)
  const [setupLoading, setSetupLoading] = useState(false)
  const [copiado, setCopiado]           = useState(false)

  // Estado: recuperar contraseña
  const [isForgot, setIsForgot]           = useState(false)
  const [forgotEmail, setForgotEmail]     = useState('')
  const [forgotLoading, setForgotLoading] = useState(false)
  const [forgotError, setForgotError]     = useState<string | null>(null)
  const [forgotOk, setForgotOk]           = useState(false)

  // Estado: modales informativos
  const [showAbout, setShowAbout]     = useState(false)
  const [showSoporte, setShowSoporte] = useState(false)

  const is2FA = preToken !== null

  function formatRecoveryCode(input: string) {
    const clean = input.toUpperCase().replace(/[^A-F0-9]/g, '').slice(0, 16)
    return clean.length <= 8 ? clean : `${clean.slice(0, 8)}-${clean.slice(8)}`
  }

  async function iniciarSetup2FA(token: string) {
    setSetupLoading(true)
    setError(null)
    try {
      const { data } = await api.post<Setup2FAResponse>('/auth/2fa/setup-inicial', {
        setup_token: token,
      })
      setSetupQR(data)
      setSetupStep('qr')
    } catch {
      setError('No fue posible cargar el QR. Intenta iniciar sesión de nuevo.')
      setIsSetup2FA(false)
    } finally {
      setSetupLoading(false)
    }
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      const form = new URLSearchParams()
      form.append('username', email)
      form.append('password', password)
      const { data } = await api.post<LoginResponse>('/auth/login', form, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      })
      if (data.requires_2fa_setup && data.pre_token) {
        // 2FA obligatorio: usuario sin 2FA configurado → forzar setup
        setSetupToken(data.pre_token)
        setIsSetup2FA(true)
        setError(null)
        await iniciarSetup2FA(data.pre_token)
      } else if (data.requires_2fa && data.pre_token) {
        setPreToken(data.pre_token)
        setModo2FA('totp')
        setError(null)
      } else if (data.access_token) {
        setAuth(data.access_token, { nombre: data.usuario!, rol: data.rol! })
        navigate('/dashboard')
      }
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
      setError(msg ?? 'Error al iniciar sesión')
    } finally {
      setLoading(false)
    }
  }

  async function handleTotp(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      const { data } = await api.post<LoginResponse>('/auth/2fa/completar-login', {
        pre_token: preToken,
        codigo: totp,
      })
      if (data.access_token) {
        setAuth(data.access_token, { nombre: data.usuario!, rol: data.rol! })
        navigate('/dashboard')
      }
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
      setError(msg ?? 'Código incorrecto')
    } finally {
      setLoading(false)
    }
  }

  async function handleRecovery(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      const { data } = await api.post<LoginResponse>('/auth/2fa/recuperar-acceso', {
        pre_token: preToken,
        recovery_code: recovery,
      })
      if (data.requires_2fa_setup && data.pre_token) {
        // Código válido → 2FA deshabilitado → debe reconfigurar obligatoriamente
        setPreToken(null)
        setSetupToken(data.pre_token)
        setIsSetup2FA(true)
        setError(null)
        await iniciarSetup2FA(data.pre_token)
      } else if (data.access_token) {
        setAuth(data.access_token, { nombre: data.usuario!, rol: data.rol! })
        navigate('/dashboard')
      }
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
      setError(msg ?? 'Código de recuperación inválido')
    } finally {
      setLoading(false)
    }
  }

  async function handleSetupActivar(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      const { data } = await api.post<LoginResponse>('/auth/2fa/activar-inicial', {
        setup_token: setupToken,
        codigo: setupTotp,
      })
      if (data.access_token && data.recovery_codes) {
        setAuth(data.access_token, { nombre: data.usuario!, rol: data.rol! })
        setSetupCodes(data.recovery_codes)
        setSetupStep('recovery')
        setError(null)
      }
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
      setError(msg ?? 'Código incorrecto. Verifica que la app esté sincronizada.')
    } finally {
      setLoading(false)
    }
  }

  function handleSetupFinalizar() {
    navigate('/dashboard')
  }

  function copiarCodigos() {
    navigator.clipboard.writeText(setupCodes.join('\n'))
    setCopiado(true)
    setTimeout(() => setCopiado(false), 2500)
  }

  async function handleForgot(e: React.FormEvent) {
    e.preventDefault()
    setForgotLoading(true)
    setForgotError(null)
    try {
      await api.post('/auth/recuperar-password', { email: forgotEmail })
      setForgotOk(true)
    } catch {
      setForgotError('No fue posible procesar la solicitud. Intenta de nuevo.')
    } finally {
      setForgotLoading(false)
    }
  }

  function volverAlLogin() {
    setPreToken(null)
    setError(null)
    setTotp('')
    setRecovery('')
  }

  function abrirForgot() {
    setIsForgot(true)
    setForgotEmail(email)
    setForgotError(null)
    setForgotOk(false)
  }

  function cerrarForgot() {
    setIsForgot(false)
    setForgotEmail('')
    setForgotError(null)
    setForgotOk(false)
  }

  const inputCls = `
    w-full px-3.5 py-2.5 rounded-lg border border-slate-700 bg-slate-800 text-white text-sm
    focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent
    placeholder:text-slate-500 transition-all
  `
  const btnCls = `
    w-full bg-teal-600 hover:bg-teal-700 text-white font-bold py-2.5 rounded-lg
    transition-colors disabled:opacity-50 disabled:cursor-not-allowed
  `
  const labelCls = 'block text-xs font-bold text-slate-400 mb-1.5 uppercase tracking-wide'
  const footerBtnCls = `
    text-xs font-semibold text-slate-600 hover:text-slate-300 transition-colors
    duration-150 px-1 py-0.5 rounded hover:bg-slate-800/60
    focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500
  `

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_#134e4a22_0%,_transparent_60%)]" />

      {showAbout   && <ModalAcercaDe onClose={() => setShowAbout(false)} />}
      {showSoporte && <ModalSoporte  onClose={() => setShowSoporte(false)} />}

      <div className="relative w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-32 h-32 mb-4">
            <Logo className="w-32 h-32" />
          </div>
          <h1 className="text-4xl font-black text-white tracking-tight">Hestia</h1>
        </div>

        <div className="bg-slate-800 rounded-2xl border border-slate-700 shadow-2xl p-7">

          {/* ── Flujo: Configuración inicial obligatoria de 2FA ── */}
          {isSetup2FA ? (
            setupLoading ? (
              <div className="text-center py-8">
                <div className="w-10 h-10 border-4 border-teal-500 border-t-transparent
                                rounded-full animate-spin mx-auto mb-4" />
                <p className="text-slate-400 text-sm">Generando código QR...</p>
              </div>

            ) : setupStep === 'qr' ? (
              <>
                <div className="flex items-center gap-2 mb-3">
                  <span className="w-6 h-6 rounded-full bg-teal-600 text-white text-xs font-black
                                   flex items-center justify-center flex-shrink-0">1</span>
                  <h2 className="text-base font-bold text-white">Configura la verificación en dos pasos</h2>
                </div>
                <p className="text-slate-400 text-xs mb-4 leading-relaxed">
                  El 2FA es obligatorio en Hestia. Abre{' '}
                  <strong className="text-slate-300">Google Authenticator</strong>, toca{' '}
                  <strong className="text-slate-300">+</strong> y escanea el código QR.
                </p>
                {setupQR && (
                  <div className="flex justify-center mb-4">
                    <div className="p-3 bg-white rounded-xl border-2 border-slate-600">
                      <img src={setupQR.qr_code} alt="QR 2FA" className="w-48 h-48" />
                    </div>
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => setShowSecret(!showSecret)}
                  className="text-xs text-slate-500 hover:text-teal-400 font-semibold
                             transition-colors flex items-center gap-1 mb-3"
                >
                  {showSecret ? '▲' : '▼'} Ingresar clave manual en la app
                </button>
                {showSecret && setupQR && (
                  <div className="mb-4 bg-slate-900 rounded-lg border border-slate-700
                                  px-3 py-2 flex items-center justify-between gap-2">
                    <code className="text-teal-400 font-mono text-xs tracking-wider break-all">
                      {setupQR.secret}
                    </code>
                    <button
                      type="button"
                      onClick={() => navigator.clipboard.writeText(setupQR.secret)}
                      className="text-xs text-slate-500 hover:text-slate-300 flex-shrink-0"
                      title="Copiar clave"
                    >📋</button>
                  </div>
                )}
                {error && (
                  <p className="text-rose-400 text-xs bg-rose-950 border border-rose-800
                                px-3 py-2 rounded-lg font-semibold mb-3">{error}</p>
                )}
                <button
                  type="button"
                  onClick={() => { setSetupStep('code'); setError(null) }}
                  disabled={!setupQR}
                  className={btnCls}
                >
                  Ya escaneé el QR →
                </button>
              </>

            ) : setupStep === 'code' ? (
              <>
                <button
                  type="button"
                  onClick={() => { setSetupStep('qr'); setError(null) }}
                  className="text-slate-400 hover:text-slate-200 text-sm font-semibold
                             mb-4 flex items-center gap-1"
                >← Volver al QR</button>
                <div className="flex items-center gap-2 mb-3">
                  <span className="w-6 h-6 rounded-full bg-teal-600 text-white text-xs font-black
                                   flex items-center justify-center flex-shrink-0">2</span>
                  <h2 className="text-base font-bold text-white">Confirma el código</h2>
                </div>
                <p className="text-slate-400 text-xs mb-5">
                  Ingresa el código de 6 dígitos que muestra Google Authenticator ahora.
                </p>
                <form onSubmit={handleSetupActivar} className="space-y-4">
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    value={setupTotp}
                    onChange={e => { setSetupTotp(e.target.value.replace(/\D/g, '')); setError(null) }}
                    className="w-full px-4 py-4 rounded-lg border border-slate-700 bg-slate-900
                               text-white text-3xl text-center font-black tracking-[0.6em]
                               focus:outline-none focus:ring-2 focus:ring-teal-500
                               placeholder:text-slate-700"
                    placeholder="000000"
                    autoFocus
                    required
                  />
                  {error && (
                    <p className="text-rose-400 text-xs bg-rose-950 border border-rose-800
                                  px-3 py-2 rounded-lg font-semibold">{error}</p>
                  )}
                  <button
                    type="submit"
                    disabled={loading || setupTotp.length !== 6}
                    className={btnCls}
                  >
                    {loading ? 'Activando...' : 'Activar verificación en dos pasos'}
                  </button>
                </form>
              </>

            ) : (
              // setupStep === 'recovery': mostrar los 10 códigos de respaldo
              <>
                <div className="flex items-center gap-2 mb-3">
                  <span className="w-6 h-6 rounded-full bg-teal-600 text-white text-xs font-black
                                   flex items-center justify-center flex-shrink-0">3</span>
                  <h2 className="text-base font-bold text-white">Guarda tus códigos de respaldo</h2>
                </div>
                <p className="text-slate-400 text-xs mb-4 leading-relaxed">
                  Cada código funciona{' '}
                  <strong className="text-slate-300">una sola vez</strong> si pierdes acceso
                  a la app.{' '}
                  <strong className="text-slate-300">No podrás verlos de nuevo.</strong>{' '}
                  Guárdalos en un lugar seguro.
                </p>
                <div className="bg-slate-900 rounded-xl border border-slate-700 p-4 mb-3">
                  <div className="grid grid-cols-2 gap-y-1.5 gap-x-3">
                    {setupCodes.map((c, i) => (
                      <code key={i} className="text-teal-400 font-mono text-xs tracking-wider">{c}</code>
                    ))}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={copiarCodigos}
                  className="w-full mb-3 border border-slate-600 hover:bg-slate-700/50
                             text-slate-300 font-bold py-2 rounded-lg transition-colors text-sm"
                >
                  {copiado ? '¡Copiados! ✓' : '📋 Copiar todos los códigos'}
                </button>
                <button type="button" onClick={handleSetupFinalizar} className={btnCls}>
                  He guardado mis códigos — Ingresar al panel
                </button>
              </>
            )

          /* ── Flujo: Login normal ── */
          ) : !is2FA && !isForgot ? (
            <>
              <h2 className="text-base font-bold text-white mb-5">Iniciar sesión</h2>
              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <label className={labelCls}>Correo electrónico</label>
                  <input type="email" value={email}
                    onChange={e => { setEmail(e.target.value); setError(null) }}
                    className={inputCls} placeholder="usuario@hestia.duoc.cl" required />
                </div>
                <div>
                  <label className={labelCls}>Contraseña</label>
                  <input type="password" value={password}
                    onChange={e => { setPassword(e.target.value); setError(null) }}
                    className={inputCls} placeholder="••••••••" required />
                </div>
                {error && (
                  <p className={`text-xs px-3 py-2 rounded-lg font-semibold ${
                    error.includes('intento')
                      ? 'text-amber-400 bg-amber-950 border border-amber-800'
                      : 'text-rose-400 bg-rose-950 border border-rose-800'
                  }`}>{error}</p>
                )}
                <button type="submit" disabled={loading} className={btnCls}>
                  {loading ? 'Verificando...' : 'Ingresar'}
                </button>
              </form>
              <button type="button" onClick={abrirForgot}
                className="w-full mt-4 text-xs text-slate-500 hover:text-slate-300
                           font-semibold transition-colors">
                ¿Olvidaste tu contraseña?
              </button>
            </>

          /* ── Flujo: Recuperar contraseña ── */
          ) : !is2FA && isForgot ? (
            <>
              <button onClick={cerrarForgot}
                className="text-slate-400 hover:text-slate-200 text-sm font-semibold
                           mb-4 flex items-center gap-1">← Volver</button>
              {forgotOk ? (
                <div className="text-center py-2">
                  <div className="w-12 h-12 rounded-full bg-teal-900 border border-teal-700
                                  flex items-center justify-center mx-auto mb-4 text-2xl">✉️</div>
                  <h2 className="text-base font-bold text-white mb-2">Revisa tu correo</h2>
                  <p className="text-slate-400 text-xs mb-5">
                    Si el email{' '}
                    <span className="text-teal-400 font-semibold">{forgotEmail}</span>{' '}
                    está registrado, recibirás un enlace para restablecer tu contraseña.
                    El enlace es válido por 1 hora.
                  </p>
                  <button onClick={cerrarForgot} className={btnCls}>Volver al inicio de sesión</button>
                </div>
              ) : (
                <>
                  <h2 className="text-base font-bold text-white mb-1">Recuperar contraseña</h2>
                  <p className="text-slate-400 text-xs mb-5">
                    Ingresa tu correo y te enviaremos un enlace para crear una nueva contraseña.
                  </p>
                  <form onSubmit={handleForgot} className="space-y-4">
                    <div>
                      <label className={labelCls}>Correo electrónico</label>
                      <input type="email" value={forgotEmail}
                        onChange={e => { setForgotEmail(e.target.value); setForgotError(null) }}
                        className={inputCls} placeholder="usuario@hestia.duoc.cl" required autoFocus />
                    </div>
                    {forgotError && (
                      <p className="text-rose-400 text-xs bg-rose-950 border border-rose-800
                                    px-3 py-2 rounded-lg font-semibold">{forgotError}</p>
                    )}
                    <button type="submit" disabled={forgotLoading || !forgotEmail} className={btnCls}>
                      {forgotLoading ? 'Enviando...' : 'Enviar enlace de recuperación'}
                    </button>
                  </form>
                </>
              )}
            </>

          /* ── Flujo: Verificación 2FA (TOTP) ── */
          ) : modo2FA === 'totp' ? (
            <>
              <button onClick={volverAlLogin}
                className="text-slate-400 hover:text-slate-200 text-sm font-semibold
                           mb-4 flex items-center gap-1">← Volver</button>
              <h2 className="text-base font-bold text-white mb-1">Verificación 2FA</h2>
              <p className="text-slate-400 text-xs mb-5">
                Ingresa el código de 6 dígitos de Google Authenticator.
              </p>
              <form onSubmit={handleTotp} className="space-y-4">
                <input type="text" inputMode="numeric" pattern="[0-9]{6}" maxLength={6}
                  value={totp}
                  onChange={e => { setTotp(e.target.value.replace(/\D/g, '')); setError(null) }}
                  className="w-full px-4 py-4 rounded-lg border border-slate-700 bg-slate-900
                             text-white text-3xl text-center font-black tracking-[0.6em]
                             focus:outline-none focus:ring-2 focus:ring-teal-500
                             placeholder:text-slate-700"
                  placeholder="000000" autoFocus required />
                {error && (
                  <p className="text-rose-400 text-xs bg-rose-950 border border-rose-800
                                px-3 py-2 rounded-lg font-semibold">{error}</p>
                )}
                <button type="submit" disabled={loading || totp.length !== 6} className={btnCls}>
                  {loading ? 'Verificando...' : 'Confirmar código'}
                </button>
              </form>
              <button onClick={() => { setModo2FA('recovery'); setError(null) }}
                className="w-full mt-4 text-xs text-slate-500 hover:text-slate-300
                           font-semibold transition-colors">
                Perdí acceso a mi app — usar código de recuperación
              </button>
            </>

          /* ── Flujo: Código de recuperación ── */
          ) : (
            <>
              <button onClick={() => { setModo2FA('totp'); setError(null) }}
                className="text-slate-400 hover:text-slate-200 text-sm font-semibold
                           mb-4 flex items-center gap-1">← Volver</button>
              <h2 className="text-base font-bold text-white mb-1">Código de recuperación</h2>
              <p className="text-slate-400 text-xs mb-5">
                Ingresa uno de tus códigos de un solo uso.
                Formato: <code className="text-teal-400">XXXXXXXX-XXXXXXXX</code>
              </p>
              <form onSubmit={handleRecovery} className="space-y-4">
                <input type="text" value={recovery}
                  onChange={e => { setRecovery(formatRecoveryCode(e.target.value)); setError(null) }}
                  className="w-full px-4 py-4 rounded-lg border border-slate-700 bg-slate-900
                             text-white text-lg text-center font-mono tracking-widest
                             focus:outline-none focus:ring-2 focus:ring-teal-500
                             placeholder:text-slate-700"
                  placeholder="XXXXXXXX-XXXXXXXX" maxLength={17} autoFocus />
                {error && (
                  <p className="text-rose-400 text-xs bg-rose-950 border border-rose-800
                                px-3 py-2 rounded-lg font-semibold">{error}</p>
                )}
                <button type="submit" disabled={loading || recovery.length !== 17} className={btnCls}>
                  {loading ? 'Verificando...' : 'Acceder con código de recuperación'}
                </button>
              </form>
              <p className="text-slate-600 text-xs text-center mt-4">
                Al usar un código de recuperación deberás reconfigurar el 2FA.
              </p>
            </>
          )}
        </div>

        {/* Pie de página */}
        <div className="flex items-center justify-between mt-5 px-1">
          <button type="button" onClick={() => setShowAbout(true)} className={footerBtnCls}>
            Acerca de
          </button>
          <span className="text-slate-700 text-xs select-none">Escuela de Salud — DuocUC</span>
          <button type="button" onClick={() => setShowSoporte(true)} className={footerBtnCls}>
            Soporte
          </button>
        </div>
      </div>
    </div>
  )
}
