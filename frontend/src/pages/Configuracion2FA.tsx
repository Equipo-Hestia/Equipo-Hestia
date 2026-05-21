import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Shield, CheckCircle, Copy, ChevronRight,
  Lock, ArrowLeft, Smartphone, Key
} from 'lucide-react'
import { api } from '../api/client'
import type { UsuarioMe, Setup2FAResponse, ActivarResponse } from '../types/api'
import { Skeleton } from '../components/ui/Skeleton'

type Step = 'loading' | 'intro' | 'qr' | 'verify' | 'codes' | 'success'

const WIZARD_STEPS = ['QR', 'Verificar', 'Códigos']
const WIZARD_STEP_IDX: Record<Step, number> = {
  loading: -1, intro: -1, qr: 0, verify: 1, codes: 2, success: 2
}

export function Configuracion2FA() {
  const [step, setStep] = useState<Step>('loading')
  const [setupData, setSetupData] = useState<Setup2FAResponse | null>(null)
  const [totp2FAEnabled, set2FAEnabled] = useState(false)
  const [codigo, setCodigo] = useState('')
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [copiedAll, setCopiedAll] = useState(false)

  useEffect(() => {
    api.get<UsuarioMe>('/usuarios/me')
      .then(({ data }) => { set2FAEnabled(data.totp_habilitado); setStep('intro') })
      .catch(() => setStep('intro'))
  }, [])

  async function handleSetup() {
    setLoading(true); setError(null)
    try {
      const { data } = await api.post<Setup2FAResponse>('/auth/2fa/setup')
      setSetupData(data)
      setStep('qr')
    } catch { setError('Error al generar el QR.') }
    finally { setLoading(false) }
  }

  async function handleActivar(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true); setError(null)
    try {
      const { data } = await api.post<ActivarResponse>('/auth/2fa/activar', { codigo })
      setRecoveryCodes(data.recovery_codes)
      set2FAEnabled(true)
      setStep('codes')
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })
        .response?.data?.detail
      setError(msg ?? 'Código incorrecto.')
    } finally { setLoading(false) }
  }

  function copySecret() {
    if (!setupData?.secret) return
    navigator.clipboard.writeText(setupData.secret)
    setCopied(true); setTimeout(() => setCopied(false), 2000)
  }

  function copyAllCodes() {
    navigator.clipboard.writeText(recoveryCodes.join('\n'))
    setCopiedAll(true); setTimeout(() => setCopiedAll(false), 2000)
  }

  const activeStepIdx = WIZARD_STEP_IDX[step]
  const showWizard = step === 'qr' || step === 'verify' || step === 'codes' || step === 'success'

  const inputCls = `
    w-full px-4 py-3 rounded-xl border-2 border-slate-200 text-slate-900
    focus:outline-none focus:border-teal-500 bg-slate-50 focus:bg-white transition-colors
  `
  const btnPrimary = `
    w-full bg-teal-600 hover:bg-teal-700 text-white font-bold py-3 rounded-xl
    transition-colors disabled:opacity-50 flex items-center justify-center gap-2
  `

  return (
    <div className="p-8 max-w-xl mx-auto">
      <div className="mb-8">
        <Link to="/dashboard"
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 font-semibold mb-4"
        >
          <ArrowLeft size={14} /> Dashboard
        </Link>
        <h1 className="text-2xl font-black text-slate-900">Verificación en dos pasos</h1>
        <p className="text-slate-500 text-sm mt-0.5">Configuración de Google Authenticator.</p>
      </div>

      {step === 'loading' && (
        <div className="space-y-4">
          <Skeleton className="h-28 w-full rounded-2xl" />
          <Skeleton className="h-48 w-full rounded-2xl" />
        </div>
      )}

      {step === 'intro' && (
        <div className="space-y-4">
          {/* Banner de estado */}
          <div className={`rounded-2xl border p-5 flex items-center gap-4 ${
            totp2FAEnabled ? 'bg-teal-50 border-teal-200' : 'bg-amber-50 border-amber-200'
          }`}>
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${
              totp2FAEnabled ? 'bg-teal-100' : 'bg-amber-100'
            }`}>
              <Shield size={22} className={totp2FAEnabled ? 'text-teal-600' : 'text-amber-500'} />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <p className="font-bold text-slate-900 text-sm">Verificación en dos pasos</p>
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                  totp2FAEnabled ? 'bg-teal-600 text-white' : 'bg-amber-400 text-white'
                }`}>
                  {totp2FAEnabled ? 'Activa' : 'Inactiva'}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                {totp2FAEnabled
                  ? 'Cada inicio de sesión requiere tu código TOTP.'
                  : 'El 2FA es obligatorio. Configúralo para acceder al sistema.'
                }
              </p>
            </div>
          </div>

          {/* Si 2FA no está activo: mostrar wizard de configuración */}
          {!totp2FAEnabled && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
              <h2 className="font-bold text-slate-900 mb-4">Cómo funciona</h2>
              <div className="space-y-4 mb-6">
                {[
                  { n: '1', icon: <Smartphone size={16} />, title: 'Escaneas el QR',
                    desc: 'Abres Google Authenticator y escaneas el código QR.' },
                  { n: '2', icon: <Shield size={16} />, title: 'La app genera códigos',
                    desc: 'Un código de 6 dígitos diferente cada 30 segundos.' },
                  { n: '3', icon: <Key size={16} />, title: 'Recibes códigos de respaldo',
                    desc: '10 códigos de un solo uso si pierdes acceso al teléfono.' },
                ].map(({ n, title, desc }) => (
                  <div key={n} className="flex items-start gap-3">
                    <div className="w-7 h-7 rounded-lg bg-teal-600 text-white flex items-center
                                    justify-center text-xs font-black flex-shrink-0">
                      {n}
                    </div>
                    <div>
                      <p className="font-semibold text-slate-900 text-sm">{title}</p>
                      <p className="text-slate-500 text-xs mt-0.5">{desc}</p>
                    </div>
                  </div>
                ))}
              </div>
              {error && (
                <p className="text-rose-600 text-xs bg-rose-50 border border-rose-200
                              px-3 py-2 rounded-lg font-semibold mb-4">{error}</p>
              )}
              <button onClick={handleSetup} disabled={loading} className={btnPrimary}>
                {loading ? 'Generando...' : <><Shield size={16} /> Activar 2FA</>}
              </button>
            </div>
          )}

          {/* Si 2FA está activo: información + bloqueo de desactivación */}
          {totp2FAEnabled && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
              <div className="flex items-start gap-3">
                <Lock size={18} className="text-teal-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold text-slate-900 text-sm mb-1">El 2FA es obligatorio</p>
                  <p className="text-slate-500 text-sm leading-relaxed">
                    La verificación en dos pasos no puede desactivarse en Hestia. Esto garantiza
                    la seguridad del sistema, especialmente para el acceso desde fuera de la
                    red interna de DuocUC.
                  </p>
                  <p className="text-slate-400 text-xs mt-3">
                    Si necesitas resetear tu configuración (cambio de teléfono, pérdida
                    de acceso a la app), contacta al administrador del sistema para que
                    realice el reset desde el panel de usuarios.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {showWizard && (
        <>
          <div className="flex items-center mb-6">
            {WIZARD_STEPS.map((label, i) => (
              <div key={label} className="flex items-center">
                <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs
                                 font-bold transition-all ${
                  i === activeStepIdx ? 'bg-teal-600 text-white'
                  : i < activeStepIdx ? 'bg-teal-100 text-teal-700'
                  : 'bg-slate-100 text-slate-400'
                }`}>
                  <span className="w-4 h-4 rounded-full flex items-center justify-center
                                   text-xs font-black">
                    {i < activeStepIdx ? '✓' : i + 1}
                  </span>
                  {label}
                </div>
                {i < WIZARD_STEPS.length - 1 && (
                  <div className={`h-px w-5 mx-0.5 ${
                    i < activeStepIdx - 1 ? 'bg-teal-300' : 'bg-slate-200'
                  }`} />
                )}
              </div>
            ))}
          </div>

          {step === 'qr' && setupData && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8">
              <h2 className="font-bold text-slate-900 mb-1">Escanea el código QR</h2>
              <p className="text-slate-500 text-sm mb-6">
                Abre Google Authenticator → toca <strong>+</strong> → Escanear QR.
              </p>
              <div className="flex justify-center mb-6">
                <div className="p-4 bg-white border-2 border-slate-200 rounded-2xl">
                  <img src={setupData.qr_code} alt="QR 2FA" className="w-56 h-56" />
                </div>
              </div>
              <div className="bg-slate-50 rounded-xl border border-slate-200 p-4 mb-6">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">
                  Clave manual
                </p>
                <div className="flex items-center justify-between gap-3">
                  <code className="text-sm font-mono text-slate-800 tracking-wider break-all">
                    {setupData.secret}
                  </code>
                  <button onClick={copySecret}
                    className="flex-shrink-0 flex items-center gap-1 text-xs font-bold
                               text-teal-600 hover:text-teal-800">
                    <Copy size={12} />{copied ? '¡Copiado!' : 'Copiar'}
                  </button>
                </div>
              </div>
              <button
                onClick={() => { setStep('verify'); setCodigo(''); setError(null) }}
                className={btnPrimary}
              >
                Ya lo escaneé <ChevronRight size={16} />
              </button>
              <button onClick={() => setStep('intro')}
                className="w-full mt-2 py-2 text-sm text-slate-400 hover:text-slate-600 font-semibold"
              >Cancelar</button>
            </div>
          )}

          {step === 'verify' && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8">
              <h2 className="font-bold text-slate-900 mb-1">Confirma el código</h2>
              <p className="text-slate-500 text-sm mb-6">
                Ingresa el código de 6 dígitos que muestra la app ahora.
              </p>
              <form onSubmit={handleActivar} className="space-y-4">
                <input
                  type="text" inputMode="numeric" pattern="[0-9]{6}" maxLength={6}
                  value={codigo}
                  onChange={(e) => { setCodigo(e.target.value.replace(/\D/g, '')); setError(null) }}
                  className="w-full px-4 py-5 rounded-xl border-2 border-slate-200 text-slate-900
                             text-4xl text-center font-black tracking-[0.7em] bg-slate-50
                             focus:outline-none focus:border-teal-500 placeholder:text-slate-200"
                  placeholder="000000" autoFocus required
                />
                {error && (
                  <p className="text-rose-600 text-sm bg-rose-50 border border-rose-200
                                px-3 py-2.5 rounded-xl font-semibold">{error}</p>
                )}
                <button type="submit" disabled={loading || codigo.length !== 6} className={btnPrimary}>
                  {loading ? 'Activando...' : 'Activar 2FA'}
                </button>
              </form>
              <button onClick={() => setStep('qr')}
                className="w-full mt-2 py-2 text-sm text-slate-400 hover:text-slate-600 font-semibold"
              >← Volver al QR</button>
            </div>
          )}

          {step === 'codes' && (
            <div className="bg-white rounded-2xl border border-teal-200 shadow-sm p-8">
              <div className="flex items-center gap-3 mb-2">
                <Key size={22} className="text-teal-600" />
                <h2 className="font-bold text-slate-900">Códigos de recuperación</h2>
              </div>
              <p className="text-slate-500 text-sm mb-5">
                Guarda estos 10 códigos en un lugar seguro. Cada uno funciona
                <strong> una sola vez</strong> si pierdes acceso a Google Authenticator.
                <strong> No podrás verlos de nuevo.</strong>
              </p>
              <div className="bg-slate-900 rounded-xl p-5 mb-5">
                <div className="grid grid-cols-2 gap-2">
                  {recoveryCodes.map((c, i) => (
                    <code key={i} className="text-teal-400 font-mono text-sm tracking-wider">{c}</code>
                  ))}
                </div>
              </div>
              <button
                onClick={copyAllCodes}
                className="w-full flex items-center justify-center gap-2 mb-4
                           border border-slate-200 hover:bg-slate-50 text-slate-700
                           font-bold py-2.5 rounded-xl transition-colors text-sm"
              >
                <Copy size={14} />{copiedAll ? '¡Copiados!' : 'Copiar todos los códigos'}
              </button>
              <button onClick={() => setStep('success')} className={btnPrimary}>
                Ya los guardé <ChevronRight size={16} />
              </button>
            </div>
          )}

          {step === 'success' && (
            <div className="bg-white rounded-2xl border border-teal-200 shadow-sm p-10 text-center">
              <div className="w-20 h-20 bg-teal-100 rounded-full flex items-center
                              justify-center mx-auto mb-5">
                <CheckCircle size={40} className="text-teal-600" />
              </div>
              <h2 className="text-xl font-black text-slate-900 mb-2">¡Verificación activada!</h2>
              <p className="text-slate-500 text-sm max-w-xs mx-auto mb-8">
                Tu cuenta está protegida con 2FA. Necesitarás el código TOTP
                en cada inicio de sesión.
              </p>
              <Link
                to="/dashboard"
                className="inline-flex items-center gap-2 bg-teal-600 hover:bg-teal-700
                           text-white font-bold px-6 py-3 rounded-xl transition-colors"
              >
                Ir al Dashboard <ChevronRight size={16} />
              </Link>
            </div>
          )}
        </>
      )}
    </div>
  )
}
