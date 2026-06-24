import { useState, useRef, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import { useAuthStore } from '../store/auth'
import { Logo } from '../components/ui/Logo'
import { HSelect } from '../components/ui/HSelect'
import { TotpInput } from '../components/ui/TotpInput'
import type { LoginResponse, Setup2FAResponse } from '../types/api'

// ─── Constantes ─────────────────────────────────────────────────────────────────

type Modo2FA   = 'totp' | 'recovery'
type SetupStep = 'qr' | 'code' | 'recovery'

const SOPORTE_EMAIL = 'hestia.soporte.cc@gmail.com'

const FAQ_ITEMS = [
  {
    q: 'Olvidé mi contraseña. ¿Qué hago?',
    a: 'Usa el enlace Olvidaste tu contraseña debajo del boton Ingresar. Recibirás un correo con instrucciones.',
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
  'Problema con 2FA',
  'Error general del sistema',
  'Otro',
]

const SYSTEM_STATS = [
  { value: '18',   label: 'salas clínicas' },
  { value: '5',    label: 'carreras' },
  { value: '1000+', label: 'insumos' },
]

// ─── Componentes de modales ──────────────────────────────────────────────────────

function ModalAcercaDe({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60
                 backdrop-blur-md animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="bg-h-surface border border-h-subtle rounded-2xl shadow-2xl
                   max-w-sm w-full p-8 relative flex flex-col items-center text-center"
        onClick={e => e.stopPropagation()}
      >
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-h-tertiary hover:text-h-primary hover:bg-h-elevated rounded-lg transition-colors"
          aria-label="Cerrar"
        >
          ✕
        </button>
        
        <Logo className="w-32 h-32 mb-4" />
        
        <h2 className="text-2xl font-bold text-h-primary tracking-tight mb-1">
          Hestia
        </h2>
        <span className="bg-h-elevated border border-h-visible text-h-secondary text-[10px] px-2 py-1 rounded-full font-mono mb-4">
          v1.0.0-beta
        </span>

        <p className="text-sm text-h-secondary leading-relaxed mb-6">
          Sistema integral de gestión de stock e inventario de insumos, implementos y activos fijos clínicos.
        </p>

        <div className="w-full bg-h-elevated rounded-xl border border-h-subtle p-4 mb-6 space-y-3">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-h-tertiary font-semibold mb-1">Desarrollado por</p>
            <p className="text-sm text-h-primary font-medium">Estudiantes de Informática Biomédica</p>
          </div>
          <div className="h-px bg-h-subtle w-full" />
          <div>
            <p className="text-[10px] uppercase tracking-widest text-h-tertiary font-semibold mb-1">Institución</p>
            <p className="text-sm text-h-primary font-medium">Escuela de Salud DuocUC</p>
            <p className="text-xs text-h-secondary mt-0.5">Sede San Bernardo</p>
          </div>
        </div>
      </div>
    </div>
  )
}

function ModalSoporte({ onClose }: { onClose: () => void }) {
  const [nombre,    setNombre]    = useState('')
  const [tema,      setTema]      = useState(TEMAS[0])
  const [mensaje,   setMensaje]   = useState('')
  const [enviado,   setEnviado]   = useState(false)
  const [expandFaq, setExpandFaq] = useState<number | null>(null)

  function handleEnviar(e: React.FormEvent) {
    e.preventDefault()
    const subject = encodeURIComponent(`[Hestia Soporte] ${tema}`)
    const body    = encodeURIComponent(
      `Nombre: ${nombre || 'No indicado'}\nTema: ${tema}\n\nDescripción:\n${mensaje}`
    )
    window.open(`mailto:${SOPORTE_EMAIL}?subject=${subject}&body=${body}`, '_blank')
    setEnviado(true)
  }

  // Estilos actualizados al nuevo diseño oscuro
  const inputCls = `
    w-full px-4 py-2.5 rounded-xl text-h-primary text-sm
    bg-h-elevated border border-h-subtle hover:border-h-visible
    focus:outline-none focus:border-[var(--h-teal-rest)] focus:ring-1 focus:ring-[var(--h-teal-rest)]
    placeholder:text-h-tertiary transition-all duration-200
  `
  const labelCls = `block text-[11px] font-semibold text-h-secondary mb-2
                    uppercase tracking-wider`

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4
                    bg-black/60 backdrop-blur-md animate-in fade-in duration-200" 
         onClick={onClose}>
      <div className="bg-h-surface border border-h-subtle rounded-2xl shadow-2xl
                      w-full max-w-md relative flex flex-col max-h-[90vh] overflow-hidden"
        onClick={e => e.stopPropagation()}>
        
        {/* Cabecera del modal */}
        <div className="flex items-center justify-between px-8 py-6
                        border-b border-h-subtle flex-shrink-0 bg-h-surface/50">
          <div>
            <h2 className="text-lg font-bold text-h-primary tracking-tight">Centro de soporte</h2>
            <p className="text-xs text-h-tertiary mt-1">Escuela de Salud • DuocUC</p>
          </div>
          <button onClick={onClose}
            className="p-2 text-h-tertiary hover:text-h-primary hover:bg-h-elevated rounded-lg transition-colors" 
            aria-label="Cerrar">✕</button>
        </div>

        {/* Cuerpo del modal (Scrollable) */}
        <div className="overflow-y-auto flex-1 px-8 py-6 space-y-8 custom-scrollbar">
          {enviado ? (
            <div className="text-center py-6">
              <div className="w-16 h-16 rounded-full flex items-center justify-center
                             mx-auto mb-5 text-2xl border bg-[var(--h-sem-success-bg)] border-[var(--h-sem-success-border)]">
                ✉️
              </div>
              <h3 className="text-lg font-bold text-h-primary mb-2">Ticket en preparación</h3>
              <p className="text-h-secondary text-sm mb-6 leading-relaxed">
                Se abrió tu cliente de correo con el formato listo para enviar a{' '}
                <span className="font-semibold text-[var(--h-teal-hover)]">{SOPORTE_EMAIL}</span>.
              </p>
              <button onClick={() => setEnviado(false)}
                className="px-4 py-2 rounded-lg border border-h-visible text-sm text-h-secondary hover:text-h-primary hover:bg-h-elevated font-medium transition-colors">
                Redactar otro ticket
              </button>
            </div>
          ) : (
            <div>
              <form onSubmit={handleEnviar} className="space-y-5">
                <div>
                  <label className={labelCls}>Nombre (opcional)</label>
                  <input type="text" value={nombre} onChange={e => setNombre(e.target.value)}
                    className={inputCls} placeholder="Ej. Juan Pérez" />
                </div>
                
                <div>
                  <label className={labelCls}>Tipo de problema *</label>
                  {/* Aquí integramos tu componente moderno HSelect */}
                  <HSelect 
                    options={TEMAS.map(t => ({ value: t, label: t }))}
                    value={tema}
                    onChange={(val: string) => setTema(val)}
                    placeholder="Selecciona una categoría"
                  />
                </div>
                
                <div>
                  <label className={labelCls}>Descripción *</label>
                  <textarea required rows={4} value={mensaje}
                    onChange={e => setMensaje(e.target.value)}
                    className={`${inputCls} resize-none`}
                    placeholder="Describe el problema con el mayor detalle posible..." />
                </div>
                
                <button type="submit" disabled={!mensaje.trim()}
                  className="w-full text-white font-semibold py-3 rounded-xl
                             transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed text-sm hover:brightness-110 active:scale-[0.98]"
                  style={{ background: 'var(--h-teal-rest)' }}>
                  Abrir cliente de correo
                </button>
              </form>
            </div>
          )}

          {/* Sección FAQ */}
          <div className="pt-6 border-t border-h-subtle">
            <h3 className="text-sm font-semibold text-h-primary mb-4 uppercase tracking-wider">Preguntas frecuentes</h3>
            <div className="space-y-2">
              {FAQ_ITEMS.map((item, i) => (
                <div key={i} className="rounded-xl border border-h-subtle overflow-hidden bg-h-elevated/50 transition-all">
                  <button type="button"
                    onClick={() => setExpandFaq(expandFaq === i ? null : i)}
                    className="w-full flex items-center justify-between gap-3
                               px-5 py-4 text-left hover:bg-h-elevated transition-colors">
                    <span className="text-sm font-medium text-h-primary">{item.q}</span>
                    <span className="text-h-tertiary flex-shrink-0">
                      {expandFaq === i ? '▲' : '▼'}
                    </span>
                  </button>
                  <div 
                    className={`px-5 overflow-hidden transition-all duration-300 ease-in-out
                      ${expandFaq === i ? 'max-h-40 pb-4 opacity-100' : 'max-h-0 opacity-0'}`}
                  >
                    <p className="text-sm text-h-secondary leading-relaxed border-t border-h-subtle pt-3">{item.a}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Panel izquierdo ─────────────────────────────────────────────────────────────

function PanelIzquierdo() {
  const panelRef  = useRef<HTMLDivElement>(null)
  const orb1Ref   = useRef<HTMLDivElement>(null)
  const orb2Ref   = useRef<HTMLDivElement>(null)
  const orb3Ref   = useRef<HTMLDivElement>(null)
  const glowRef   = useRef<HTMLDivElement>(null)
  const glowReady = useRef(false)

  const handleMouseMove = useCallback((e: MouseEvent) => {
    const panel = panelRef.current
    const glow  = glowRef.current
    if (!panel || !glow) return
    const rect = panel.getBoundingClientRect()
    const x  = e.clientX - rect.left
    const y  = e.clientY - rect.top
    const cx = rect.width  / 2
    const cy = rect.height / 2
    const dx = (x - cx) / cx
    const dy = (y - cy) / cy

    if (!glowReady.current) {
      glow.style.transition = 'none'
      glow.style.left = `${x}px`
      glow.style.top  = `${y}px`
      void glow.offsetWidth
      glow.style.transition = 'left 0.07s ease-out, top 0.07s ease-out'
      glowReady.current = true
    } else {
      glow.style.left = `${x}px`
      glow.style.top  = `${y}px`
    }

    if (orb1Ref.current) orb1Ref.current.style.transform =
      `translate(${dx * 22}px, ${dy * 16}px)`
    if (orb2Ref.current) orb2Ref.current.style.transform =
      `translate(${dx * -18}px, ${dy * -14}px)`
    if (orb3Ref.current) orb3Ref.current.style.transform =
      `translate(calc(-50% + ${dx * 12}px), calc(-50% + ${dy * 10}px))`
  }, [])

  const handleMouseLeave = useCallback(() => {
    const glow = glowRef.current
    if (glow) {
      glow.style.transition = 'none'
      glow.style.left = '-999px'
      glow.style.top  = '-999px'
    }
    glowReady.current = false
    if (orb1Ref.current) orb1Ref.current.style.transform = 'translate(0,0)'
    if (orb2Ref.current) orb2Ref.current.style.transform = 'translate(0,0)'
    if (orb3Ref.current) orb3Ref.current.style.transform = 'translate(-50%,-50%)'
  }, [])

  useEffect(() => {
    const panel = panelRef.current
    if (!panel) return
    panel.addEventListener('mousemove',  handleMouseMove)
    panel.addEventListener('mouseleave', handleMouseLeave)
    return () => {
      panel.removeEventListener('mousemove',  handleMouseMove)
      panel.removeEventListener('mouseleave', handleMouseLeave)
    }
  }, [handleMouseMove, handleMouseLeave])

  return (
    <div ref={panelRef}
      className="hidden lg:flex flex-col justify-between relative overflow-hidden
                 border-r border-h-subtle"
      style={{ width: '52%', background: 'var(--h-bg-surface)' }}>
      <div className="absolute inset-0 pointer-events-none" style={{
        backgroundImage:
          'radial-gradient(circle, var(--h-border-subtle) 1px, transparent 1px)',
        backgroundSize: '28px 28px',
      }} />
      <div ref={orb1Ref} className="absolute pointer-events-none" style={{
        width: '420px', height: '420px', top: '-120px', left: '-80px',
        borderRadius: '50%',
        background:
          'radial-gradient(circle, rgba(29,158,117,0.22) 0%, transparent 68%)',
        filter: 'blur(55px)', transition: 'transform 0.15s ease-out',
      }} />
      <div ref={orb2Ref} className="absolute pointer-events-none" style={{
        width: '340px', height: '340px', bottom: '-80px', right: '-60px',
        borderRadius: '50%',
        background:
          'radial-gradient(circle, rgba(15,110,86,0.18) 0%, transparent 68%)',
        filter: 'blur(50px)', transition: 'transform 0.15s ease-out',
      }} />
      <div ref={orb3Ref} className="absolute pointer-events-none" style={{
        width: '280px', height: '280px', top: '50%', left: '50%',
        transform: 'translate(-50%,-50%)', borderRadius: '50%',
        background:
          'radial-gradient(circle, rgba(93,202,165,0.10) 0%, transparent 68%)',
        filter: 'blur(40px)', transition: 'transform 0.15s ease-out',
      }} />
      <div ref={glowRef} className="absolute pointer-events-none" style={{
        width: '320px', height: '320px', left: '-999px', top: '-999px',
        borderRadius: '50%',
        background:
          'radial-gradient(circle, rgba(29,158,117,0.10) 0%, transparent 65%)',
        filter: 'blur(10px)', transform: 'translate(-50%,-50%)',
      }} />
      <div className="relative z-10 flex flex-col justify-between h-full p-10">
        <div className="flex items-center gap-3">
          <Logo className="w-14 h-14" />
          <div>
            <p className="text-h-primary text-base font-semibold leading-tight">Hestia</p>
            <p className="text-h-tertiary text-xs leading-tight">Escuela de Salud</p>
          </div>
        </div>
        <div>
          <h1 className="text-3xl font-bold text-h-primary leading-tight mb-3">
            Gestión de insumos<br />
            <span style={{ color: 'var(--h-teal-hover)' }}>clínicos</span>, simplificada.
          </h1>
          <p className="text-sm text-h-secondary leading-relaxed max-w-xs">
            Inventario, movimientos y planificación de talleres para la
            Escuela de Salud de DuocUC.
          </p>
        </div>
        <div className="grid grid-cols-3 gap-3">
          {SYSTEM_STATS.map(({ value, label }) => (
            <div key={label} className="rounded-xl border border-h-subtle p-4"
              style={{ background: 'rgba(30,37,48,0.6)' }}>
              <p className="text-2xl font-bold mb-0.5"
                style={{ color: 'var(--h-teal-hover)' }}>{value}</p>
              <p className="text-[11px] text-h-tertiary leading-tight">{label}</p>
            </div>
          ))}
        </div>
        <p className="text-[11px] text-h-tertiary">
          DuocUC San Bernardo • Informática Biomédica • 2026 - 2027
        </p>
      </div>
    </div>
  )
}

// ─── Shimmer button ───────────────────────────────────────────────────────────────

const SHIMMER_STYLE_ID = 'hestia-shimmer-style'

function ensureShimmerStyle() {
  if (document.getElementById(SHIMMER_STYLE_ID)) return
  const style = document.createElement('style')
  style.id = SHIMMER_STYLE_ID
  style.textContent = `
    @property --h-angle {
      syntax: '<angle>';
      initial-value: 0deg;
      inherits: false;
    }
    @keyframes h-spin-border { to { --h-angle: 360deg; } }
    .h-shimmer-border {
      animation: h-spin-border 2.8s linear infinite;
      background: conic-gradient(
        from var(--h-angle),
        transparent 0deg, transparent 55deg,
        #5dcaa5 110deg, #9fe1cb 170deg, #5dcaa5 230deg,
        transparent 290deg, transparent 360deg
      );
    }
  `
  document.head.appendChild(style)
}

interface ShimmerButtonProps {
  children:  React.ReactNode
  type?:     'button' | 'submit'
  disabled?: boolean
  onClick?:  () => void
}

function ShimmerButton(
  { children, type = 'button', disabled = false, onClick }: ShimmerButtonProps,
) {
  useEffect(() => { ensureShimmerStyle() }, [])
  return (
    <div className="relative w-full" style={{ borderRadius: '8px', padding: '2px' }}>
      <div className="h-shimmer-border absolute inset-0 pointer-events-none"
        style={{ borderRadius: '10px' }} aria-hidden />
      <div className="absolute inset-[2px] pointer-events-none"
        style={{
          borderRadius: '7px',
          background: disabled ? '#1e2530' : 'var(--h-teal-rest)',
          transition: 'background 0.2s',
        }} aria-hidden />
      <button type={type} disabled={disabled} onClick={onClick}
        className="relative z-10 w-full py-2.5 rounded-lg text-sm font-semibold
                   transition-colors duration-200 disabled:cursor-not-allowed"
        style={{
          background: 'transparent',
          color: disabled ? 'var(--h-text-tertiary)' : '#e1f5ee',
        }}
        onMouseEnter={e => {
          if (!disabled)
            (e.currentTarget.previousElementSibling as HTMLElement)
              .style.background = 'var(--h-teal-hover)'
        }}
        onMouseLeave={e => {
          if (!disabled)
            (e.currentTarget.previousElementSibling as HTMLElement)
              .style.background = 'var(--h-teal-rest)'
        }}
      >{children}</button>
    </div>
  )
}

// ─── Componente principal Login ──────────────────────────────────────────────────

export function Login() {
  const navigate = useNavigate()
  const setAuth  = useAuthStore((s) => s.setAuth)

  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState<string | null>(null)

  const [preToken,  setPreToken]  = useState<string | null>(null)
  const [totpValue, setTotpValue] = useState('')
  const [recovery,  setRecovery]  = useState('')
  const [modo2FA,   setModo2FA]   = useState<Modo2FA>('totp')

  // Ref que TotpInput expone para disparar la animacion desde el padre (flujo 2FA normal)
  const totpAnimRef = useRef<(() => void) | null>(null)

  const [isSetup2FA,   setIsSetup2FA]   = useState(false)
  const [setupToken,   setSetupToken]   = useState<string | null>(null)
  const [setupQR,      setSetupQR]      = useState<Setup2FAResponse | null>(null)
  const [setupStep,    setSetupStep]    = useState<SetupStep>('qr')
  const [setupTotp,    setSetupTotp]    = useState('')
  // Ref para la animacion TotpInput en el paso de confirmacion del setup
  const setupAnimRef = useRef<(() => void) | null>(null)
  const [setupCodes,   setSetupCodes]   = useState<string[]>([])
  const [showSecret,   setShowSecret]   = useState(false)
  const [setupLoading, setSetupLoading] = useState(false)
  const [copiado,      setCopiado]      = useState(false)

  const [isForgot,      setIsForgot]      = useState(false)
  const [forgotEmail,   setForgotEmail]   = useState('')
  const [forgotLoading, setForgotLoading] = useState(false)
  const [forgotError,   setForgotError]   = useState<string | null>(null)
  const [forgotOk,      setForgotOk]      = useState(false)

  const [showAbout,   setShowAbout]   = useState(false)
  const [showSoporte, setShowSoporte] = useState(false)

  const is2FA = preToken !== null

  function formatRecoveryCode(input: string) {
    const clean = input.toUpperCase().replace(/[^A-F0-9]/g, '').slice(0, 16)
    return clean.length <= 8 ? clean : `${clean.slice(0, 8)}-${clean.slice(8)}`
  }

  async function iniciarSetup2FA(token: string) {
    setSetupLoading(true); setError(null)
    try {
      const { data } = await api.post<Setup2FAResponse>(
        '/auth/2fa/setup-inicial', { setup_token: token }
      )
      setSetupQR(data); setSetupStep('qr')
    } catch {
      setError('No fue posible cargar el QR. Intenta iniciar sesión de nuevo.')
      setIsSetup2FA(false)
    } finally { setSetupLoading(false) }
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault(); setLoading(true)
    try {
      const form = new URLSearchParams()
      form.append('username', email); form.append('password', password)
      const { data } = await api.post<LoginResponse>('/auth/login', form, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      })
      if (data.requires_2fa_setup && data.pre_token) {
        setSetupToken(data.pre_token); setIsSetup2FA(true); setError(null)
        await iniciarSetup2FA(data.pre_token)
      } else if (data.requires_2fa && data.pre_token) {
        setPreToken(data.pre_token); setModo2FA('totp'); setError(null)
      } else if (data.access_token) {
        setAuth(data.access_token, { nombre: data.usuario!, rol: data.rol! })
        navigate('/dashboard')
      }
    } catch (err: unknown) {
      const msg = (
        err as { response?: { data?: { detail?: string } } }
      ).response?.data?.detail
      setError(msg ?? 'Error al iniciar sesión. Verifica tus credenciales e intenta de nuevo.')
    } finally { setLoading(false) }
  }

  // Llamado por TotpInput desde DENTRO de la animacion, en el momento correcto (2FA normal)
  async function handleTotp() {
    setLoading(true)
    try {
      const { data } = await api.post<LoginResponse>('/auth/2fa/completar-login', {
        pre_token: preToken, codigo: totpValue,
      })
      if (data.access_token) {
        setAuth(data.access_token, { nombre: data.usuario!, rol: data.rol! })
        navigate('/dashboard')
      }
    } catch (err: unknown) {
      const msg = (
        err as { response?: { data?: { detail?: string } } }
      ).response?.data?.detail
      setError(msg ?? 'Código incorrecto')
    } finally { setLoading(false) }
  }

  async function handleRecovery(e: React.FormEvent) {
    e.preventDefault(); setLoading(true)
    try {
      const { data } = await api.post<LoginResponse>('/auth/2fa/recuperar-acceso', {
        pre_token: preToken, recovery_code: recovery,
      })
      if (data.requires_2fa_setup && data.pre_token) {
        setPreToken(null); setSetupToken(data.pre_token)
        setIsSetup2FA(true); setError(null)
        await iniciarSetup2FA(data.pre_token)
      } else if (data.access_token) {
        setAuth(data.access_token, { nombre: data.usuario!, rol: data.rol! })
        navigate('/dashboard')
      }
    } catch (err: unknown) {
      const msg = (
        err as { response?: { data?: { detail?: string } } }
      ).response?.data?.detail
      setError(msg ?? 'Código de recuperación inválido. Verifica que lo ingresaste correctamente.')
    } finally { setLoading(false) }
  }

  // Llamado por TotpInput del setup desde DENTRO de la animacion
  async function handleSetupActivar() {
    setLoading(true)
    try {
      const { data } = await api.post<LoginResponse>('/auth/2fa/activar-inicial', {
        setup_token: setupToken, codigo: setupTotp,
      })
      if (data.access_token && data.recovery_codes) {
        setAuth(data.access_token, { nombre: data.usuario!, rol: data.rol! })
        setSetupCodes(data.recovery_codes); setSetupStep('recovery'); setError(null)
      }
    } catch (err: unknown) {
      const msg = (
        err as { response?: { data?: { detail?: string } } }
      ).response?.data?.detail
      setError(msg ?? 'Código incorrecto. Verifica que la app este sincronizada.')
    } finally { setLoading(false) }
  }

  function handleSetupFinalizar() { navigate('/dashboard') }

  function copiarCodigos() {
    navigator.clipboard.writeText(setupCodes.join('\n'))
    setCopiado(true); setTimeout(() => setCopiado(false), 2500)
  }

  async function handleForgot(e: React.FormEvent) {
    e.preventDefault(); setForgotLoading(true); setForgotError(null)
    try {
      await api.post('/auth/recuperar-password', { email: forgotEmail })
      setForgotOk(true)
    } catch {
      setForgotError('No fue posible procesar la solicitud. Intenta de nuevo.')
    } finally { setForgotLoading(false) }
  }

  function volverAlLogin() {
    setPreToken(null); setError(null); setTotpValue(''); setRecovery('')
  }

  // Vuelve al formulario de credenciales desde el setup de 2FA
  function cancelarSetup() {
    setIsSetup2FA(false)
    setSetupToken(null)
    setSetupQR(null)
    setSetupStep('qr')
    setSetupTotp('')
    setError(null)
  }

  function abrirForgot() {
    setIsForgot(true); setForgotEmail(email); setForgotError(null); setForgotOk(false)
  }
  function cerrarForgot() {
    setIsForgot(false); setForgotEmail(''); setForgotError(null); setForgotOk(false)
  }

  const inputCls = `
    w-full px-3.5 py-2.5 rounded-lg text-h-primary text-sm
    focus:outline-none placeholder:text-h-tertiary transition-all
    bg-h-elevated border border-h-visible focus:border-h-strong
  `
  const labelCls = `block text-[10px] font-semibold text-h-tertiary mb-1.5
                    uppercase tracking-widest`
  const backBtnCls = `text-h-secondary hover:text-h-primary text-sm font-medium
                      mb-4 flex items-center gap-1 transition-colors duration-150`
  const errorCls = (isWarning = false) => `
    text-xs px-3 py-2 rounded-lg font-medium
    ${ isWarning
      ? 'bg-h-warning border border-h-warning text-h-warning'
      : 'bg-h-danger  border border-h-danger  text-h-danger'
    }
  `
  const stdBtnCls = `
    w-full text-white font-semibold py-2.5 rounded-lg
    transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed text-sm
  `

  return (
    <div className="min-h-screen flex bg-h-base">
      <PanelIzquierdo />

      <div className="flex-1 flex flex-col items-center justify-center p-6
                      relative overflow-hidden">
        <div className="absolute pointer-events-none" style={{
          width: '380px', height: '380px', top: '-60px', right: '-80px',
          borderRadius: '50%',
          background:
            'radial-gradient(circle, rgba(29,158,117,0.08) 0%, transparent 65%)',
          filter: 'blur(50px)',
        }} />

        <div className="lg:hidden flex flex-col items-center mb-8">
          <Logo className="w-20 h-20 mb-3" />
          <h1 className="text-2xl font-bold text-h-primary">Hestia</h1>
          <p className="text-h-tertiary text-xs mt-1">Escuela de Salud • DuocUC</p>
        </div>

        {showAbout   && <ModalAcercaDe onClose={() => setShowAbout(false)} />}
        {showSoporte && <ModalSoporte  onClose={() => setShowSoporte(false)} />}

        <div className="relative z-10 w-full max-w-sm bg-h-surface border
                        border-h-subtle rounded-2xl p-7">

          {/* ────── Setup 2FA obligatorio ────── */}
          {isSetup2FA ? (
            setupLoading ? (
              <div className="text-center py-8">
                <div className="w-10 h-10 border-4 border-t-transparent
                                rounded-full animate-spin mx-auto mb-4"
                  style={{
                    borderColor:
                      'var(--h-teal-hover) transparent transparent transparent',
                  }} />
                <p className="text-h-secondary text-sm">Generando codigo QR...</p>
              </div>

            ) : setupStep === 'qr' ? (
              <>
                {/* Boton volver al formulario de credenciales */}
                <button type="button" onClick={cancelarSetup}
                  className={backBtnCls}>
                  ← Volver al inicio de sesión
                </button>
                <div className="flex items-center gap-2 mb-3">
                  <span className="w-6 h-6 rounded-full text-white text-xs font-bold
                                   flex items-center justify-center flex-shrink-0"
                    style={{ background: 'var(--h-teal-rest)' }}>1</span>
                  <h2 className="text-base font-semibold text-h-primary">
                    Configura la verificación en dos pasos
                  </h2>
                </div>
                <p className="text-h-secondary text-xs mb-4 leading-relaxed">
                  El 2FA es obligatorio en Hestia. Abre{' '}
                  <strong className="text-h-primary">Google Authenticator</strong>,
                  toca <strong className="text-h-primary">+</strong> y escanea el QR.
                </p>
                {setupQR && (
                  <div className="flex justify-center mb-4">
                    <div className="p-3 bg-white rounded-xl border-2 border-h-visible">
                      <img src={setupQR.qr_code} alt="QR 2FA" className="w-48 h-48" />
                    </div>
                  </div>
                )}
                <button type="button" onClick={() => setShowSecret(!showSecret)}
                  className="text-xs text-h-tertiary hover:text-h-accent font-medium
                             transition-colors flex items-center gap-1 mb-3">
                  {showSecret ? '\u25b2' : '\u25bc'} Ingresar clave manual en la app
                </button>
                {showSecret && setupQR && (
                  <div className="mb-4 rounded-lg border border-h-subtle px-3 py-2
                                  flex items-center justify-between gap-2"
                    style={{ background: 'var(--h-bg-base)' }}>
                    <code className="font-mono text-xs tracking-wider break-all"
                      style={{ color: 'var(--h-teal-hover)' }}>{setupQR.secret}</code>
                    <button type="button"
                      onClick={() => navigator.clipboard.writeText(setupQR.secret)}
                      className="text-xs text-h-tertiary hover:text-h-secondary
                                 flex-shrink-0 transition-colors"
                      title="Copiar clave">\ud83d\udccb</button>
                  </div>
                )}
                {error && <p className={errorCls() + ' mb-3'}>{error}</p>}
                <button type="button"
                  onClick={() => { setSetupStep('code'); setError(null) }}
                  disabled={!setupQR} className={stdBtnCls}
                  style={{ background: 'var(--h-teal-rest)' }}>
                  Ya escanee el QR →
                </button>
              </>

            ) : setupStep === 'code' ? (
              <>
                <button type="button"
                  onClick={() => { setSetupStep('qr'); setError(null) }}
                  className={backBtnCls}>← Volver al QR</button>
                <div className="flex items-center gap-2 mb-3">
                  <span className="w-6 h-6 rounded-full text-white text-xs font-bold
                                   flex items-center justify-center flex-shrink-0"
                    style={{ background: 'var(--h-teal-rest)' }}>2</span>
                  <h2 className="text-base font-semibold text-h-primary">
                    Confirma el código
                  </h2>
                </div>
                <p className="text-h-secondary text-xs mb-5">
                  Ingresa el código de 6 dígitos que muestra
                  Google Authenticator ahora.
                </p>
                <div className="space-y-4">
                  <TotpInput
                    value={setupTotp}
                    onChange={v => { setSetupTotp(v); setError(null) }}
                    onConfirm={handleSetupActivar}
                    animRef={setupAnimRef}
                    disabled={loading}
                  />
                  {error && <p className={errorCls()}>{error}</p>}
                  <ShimmerButton
                    type="button"
                    disabled={loading || setupTotp.length !== 6}
                    onClick={() => setupAnimRef.current?.()}
                  >
                    {loading ? 'Activando...' : 'Activar verificación en dos pasos'}
                  </ShimmerButton>
                </div>
              </>

            ) : (
              <>
                <div className="flex items-center gap-2 mb-3">
                  <span className="w-6 h-6 rounded-full text-white text-xs font-bold
                                   flex items-center justify-center flex-shrink-0"
                    style={{ background: 'var(--h-teal-rest)' }}>3</span>
                  <h2 className="text-base font-semibold text-h-primary">
                    Guarda tus códigos de respaldo
                  </h2>
                </div>
                <p className="text-h-secondary text-xs mb-4 leading-relaxed">
                  Cada código funciona{' '}
                  <strong className="text-h-primary">una sola vez</strong>.{' '}
                  <strong className="text-h-primary">No podras verlos de nuevo.</strong>{' '}
                  Guardalos en un lugar seguro.
                </p>
                <div className="rounded-xl border border-h-subtle p-4 mb-3"
                  style={{ background: 'var(--h-bg-base)' }}>
                  <div className="grid grid-cols-2 gap-y-1.5 gap-x-3">
                    {setupCodes.map((c, i) => (
                      <code key={i} className="font-mono text-xs tracking-wider"
                        style={{ color: 'var(--h-teal-hover)' }}>{c}</code>
                    ))}
                  </div>
                </div>
                <button type="button" onClick={copiarCodigos}
                  className="w-full mb-3 border border-h-visible text-h-secondary
                             font-semibold py-2 rounded-lg hover:bg-h-elevated
                             transition-colors text-sm">
                  {copiado ? 'Copiados! \u2713' : '\ud83d\udccb Copiar todos los codigos'}
                </button>
                <ShimmerButton type="button" onClick={handleSetupFinalizar}>
                  He guardado mis codigos — Ingresar al panel
                </ShimmerButton>
              </>
            )

          /* ────── Login normal ────── */
          ) : !is2FA && !isForgot ? (
            <>
              <h2 className="text-base font-semibold text-h-primary mb-5">
                Iniciar sesión
              </h2>
              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <label className={labelCls}>Correo electrónico</label>
                  <input type="email" value={email}
                    onChange={e => { setEmail(e.target.value); setError(null) }}
                    className={inputCls}
                    placeholder="usuario@hestia.duoc.cl" required />
                </div>
                <div>
                  <label className={labelCls}>Contraseña</label>
                  <input type="password" value={password}
                    onChange={e => { setPassword(e.target.value); setError(null) }}
                    className={inputCls} placeholder="••••••••" required />
                </div>
                {error && <p className={errorCls(error.includes('intento'))}>{error}</p>}
                <ShimmerButton type="submit" disabled={loading}>
                  {loading ? 'Verificando...' : 'Ingresar al sistema'}
                </ShimmerButton>
              </form>
              <button type="button" onClick={abrirForgot}
                className="w-full mt-4 text-xs text-h-tertiary hover:text-h-secondary
                           font-medium transition-colors duration-150">
                ¿Olvidaste tu contraseña?
              </button>
            </>

          /* ────── Recuperar contraseña ────── */
          ) : !is2FA && isForgot ? (
            <>
              <button onClick={cerrarForgot} className={backBtnCls}>← Volver</button>
              {forgotOk ? (
                <div className="text-center py-2">
                  <div className="w-12 h-12 rounded-full flex items-center
                                  justify-center mx-auto mb-4 text-2xl border"
                    style={{
                      background: 'var(--h-sem-success-bg)',
                      borderColor: 'var(--h-sem-success-border)',
                    }}>\u2709\ufe0f</div>
                  <h2 className="text-base font-semibold text-h-primary mb-2">
                    Revisa tu correo
                  </h2>
                  <p className="text-h-secondary text-xs mb-5">
                    Si el email{' '}
                    <span className="font-semibold"
                      style={{ color: 'var(--h-teal-hover)' }}>
                      {forgotEmail}
                    </span>{' '}
                    esta registrado, recibirás un enlace válido por 1 hora.
                  </p>
                  <ShimmerButton type="button" onClick={cerrarForgot}>
                    ← Volver al inicio de sesión
                  </ShimmerButton>
                </div>
              ) : (
                <>
                  <h2 className="text-base font-semibold text-h-primary mb-1">
                    Recuperar contraseña
                  </h2>
                  <p className="text-h-secondary text-xs mb-5">
                    Ingresa tu correo y te enviaremos un enlace para crear
                    una nueva contraseña.
                  </p>
                  <form onSubmit={handleForgot} className="space-y-4">
                    <div>
                      <label className={labelCls}>Correo electrónico</label>
                      <input type="email" value={forgotEmail}
                        onChange={e => {
                          setForgotEmail(e.target.value); setForgotError(null)
                        }}
                        className={inputCls}
                        placeholder="usuario@hestia.duoc.cl" required autoFocus />
                    </div>
                    {forgotError && <p className={errorCls()}>{forgotError}</p>}
                    <ShimmerButton
                      type="submit"
                      disabled={forgotLoading || !forgotEmail}
                    >
                      {forgotLoading ? 'Enviando...' : 'Enviar enlace de recuperación'}
                    </ShimmerButton>
                  </form>
                </>
              )}
            </>

          /* ────── 2FA TOTP ── con animacion HESTIA ────── */
          ) : modo2FA === 'totp' ? (
            <>
              <button onClick={volverAlLogin} className={backBtnCls}>
                ← Volver
              </button>
              <h2 className="text-base font-semibold text-h-primary mb-1">
                Verificación 2FA
              </h2>
              <p className="text-h-secondary text-xs mb-5">
                Ingresa el código de 6 dígitos de Google Authenticator.
              </p>
              <div className="space-y-4">
                <TotpInput
                  value={totpValue}
                  onChange={v => { setTotpValue(v); setError(null) }}
                  onConfirm={handleTotp}
                  animRef={totpAnimRef}
                  disabled={loading}
                />
                {error && <p className={errorCls()}>{error}</p>}
                <ShimmerButton
                  type="button"
                  disabled={totpValue.length !== 6 || loading}
                  onClick={() => totpAnimRef.current?.()}
                >
                  {loading ? 'Verificando...' : 'Confirmar código'}
                </ShimmerButton>
              </div>
              <button onClick={() => { setModo2FA('recovery'); setError(null) }}
                className="w-full mt-4 text-xs text-h-tertiary hover:text-h-secondary
                           font-medium transition-colors duration-150">
                Perdi acceso a mi app — usar código de recuperación
              </button>
            </>

          /* ────── Código de recuperación ────── */
          ) : (
            <>
              <button onClick={() => { setModo2FA('totp'); setError(null) }}
                className={backBtnCls}>← Volver</button>
              <h2 className="text-base font-semibold text-h-primary mb-1">
                Código de recuperación
              </h2>
              <p className="text-h-secondary text-xs mb-5">
                Ingresa uno de tus códigos de un solo uso.{' '}
                Formato:{' '}
                <code className="font-mono"
                  style={{ color: 'var(--h-teal-hover)' }}>XXXXXXXX-XXXXXXXX</code>
              </p>
              <form onSubmit={handleRecovery} className="space-y-4">
                <input type="text" value={recovery}
                  onChange={e => {
                    setRecovery(formatRecoveryCode(e.target.value)); setError(null)
                  }}
                  className="w-full px-4 py-4 rounded-lg text-h-primary text-lg
                             text-center font-mono tracking-widest focus:outline-none
                             placeholder:text-h-tertiary bg-h-elevated border
                             border-h-visible focus:border-h-strong transition-all"
                  placeholder="XXXXXXXX-XXXXXXXX" maxLength={17} autoFocus />
                {error && <p className={errorCls()}>{error}</p>}
                <ShimmerButton
                  type="submit"
                  disabled={loading || recovery.length !== 17}
                >
                  {loading ? 'Verificando...' : 'Acceder con código de recuperación'}
                </ShimmerButton>
              </form>
              <p className="text-h-tertiary text-xs text-center mt-4">
                Al usar un código de recuperación deberás reconfigurar el 2FA.
              </p>
            </>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="absolute bottom-4 left-0 right-0 flex items-center
                        justify-center gap-4">
          <button type="button" onClick={() => setShowAbout(true)}
            className="text-[11px] text-h-tertiary hover:text-h-secondary
                       transition-colors duration-150 px-1"
            style={{ opacity: 0.4 }}
            onMouseEnter={e => (e.currentTarget.style.opacity = '0.75')}
            onMouseLeave={e => (e.currentTarget.style.opacity = '0.4')}>
            Acerca de
          </button>
          <span className="text-h-tertiary text-[11px]" style={{ opacity: 0.25 }}>·</span>
          <button type="button" onClick={() => setShowSoporte(true)}
            className="text-[11px] text-h-tertiary hover:text-h-secondary
                       transition-colors duration-150 px-1"
            style={{ opacity: 0.4 }}
            onMouseEnter={e => (e.currentTarget.style.opacity = '0.75')}
            onMouseLeave={e => (e.currentTarget.style.opacity = '0.4')}>
            Soporte
          </button>
        </div>
      </div>
    </div>
  )
}
