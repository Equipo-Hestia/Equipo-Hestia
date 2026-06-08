import { useEffect, useState, useRef } from 'react'
import { Link } from 'react-router-dom'
import {
  Shield, CheckCircle, Copy, ChevronRight,
  Lock, ArrowLeft, Smartphone, Key
} from 'lucide-react'
import { api } from '../api/client'
import type { UsuarioMe, Setup2FAResponse, ActivarResponse } from '../types/api'
import { Skeleton } from '../components/ui/Skeleton'
import { TotpInput } from '../components/ui/TotpInput'

type Step = 'loading' | 'intro' | 'qr' | 'verify' | 'codes' | 'success'

const WIZARD_STEPS = ['QR', 'Verificar', 'Codigos']
const WIZARD_STEP_IDX: Record<Step, number> = {
  loading: -1, intro: -1, qr: 0, verify: 1, codes: 2, success: 2,
}

export function Configuracion2FA() {
  const [step, setStep]             = useState<Step>('loading')
  const [setupData, setSetupData]   = useState<Setup2FAResponse | null>(null)
  const [totp2FAEnabled, set2FAEnabled] = useState(false)
  const [codigo, setCodigo]         = useState('')
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([])
  const [loading, setLoading]       = useState(false)
  const [error, setError]           = useState<string | null>(null)
  const [copied, setCopied]         = useState(false)
  const [copiedAll, setCopiedAll]   = useState(false)

  // Ref para disparar la animacion TotpInput desde el boton externo
  const totpAnimRef = useRef<(() => void) | null>(null)

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

  // Se llama desde DENTRO de la animacion TotpInput
  async function handleActivar() {
    setLoading(true); setError(null)
    try {
      const { data } = await api.post<ActivarResponse>('/auth/2fa/activar', { codigo })
      setRecoveryCodes(data.recovery_codes)
      set2FAEnabled(true)
      setStep('codes')
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })
        .response?.data?.detail
      setError(msg ?? 'Codigo incorrecto.')
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
  const showWizard = (['qr', 'verify', 'codes', 'success'] as Step[]).includes(step)

  // Estilos con tokens h-*
  const btnPrimary = `
    w-full text-white font-semibold py-2.5 rounded-xl text-sm
    transition-colors disabled:opacity-50 flex items-center justify-center gap-2
  `

  return (
    <div className="p-8 max-w-xl mx-auto">
      <div className="mb-8">
        <Link to="/dashboard"
          className="inline-flex items-center gap-1.5 text-sm text-h-secondary
                     hover:text-h-primary font-semibold mb-4 transition-colors"
        >
          <ArrowLeft size={14} /> Dashboard
        </Link>
        <h1 className="text-2xl font-bold text-h-primary">Verificacion en dos pasos</h1>
        <p className="text-h-secondary text-sm mt-0.5">Configuracion de Google Authenticator.</p>
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
          <div className="rounded-2xl border p-5 flex items-center gap-4"
            style={{
              background: totp2FAEnabled
                ? 'var(--h-sem-success-bg)' : 'var(--h-sem-warning-bg)',
              borderColor: totp2FAEnabled
                ? 'var(--h-sem-success-border)' : 'var(--h-sem-warning-border)',
            }}>
            <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: totp2FAEnabled ? 'var(--h-sem-success-bg)' : 'var(--h-sem-warning-bg)' }}>
              <Shield size={22} style={{
                color: totp2FAEnabled
                  ? 'var(--h-sem-success-text)' : 'var(--h-sem-warning-text)',
              }} />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <p className="font-bold text-h-primary text-sm">Verificacion en dos pasos</p>
                <span className="text-xs font-bold px-2 py-0.5 rounded-full text-white"
                  style={{
                    background: totp2FAEnabled
                      ? 'var(--h-sem-success-border)' : 'var(--h-sem-warning-border)',
                  }}>
                  {totp2FAEnabled ? 'Activa' : 'Inactiva'}
                </span>
              </div>
              <p className="text-xs text-h-secondary mt-0.5">
                {totp2FAEnabled
                  ? 'Cada inicio de sesion requiere tu codigo TOTP.'
                  : 'El 2FA es obligatorio. Configuralo para acceder al sistema.'
                }
              </p>
            </div>
          </div>

          {!totp2FAEnabled && (
            <div className="rounded-2xl border border-h-subtle p-6"
              style={{ background: 'var(--h-bg-surface)' }}>
              <h2 className="font-bold text-h-primary mb-4">Como funciona</h2>
              <div className="space-y-4 mb-6">
                {[
                  { n: '1', title: 'Escaneas el QR',
                    desc: 'Abres Google Authenticator y escaneas el codigo QR.' },
                  { n: '2', title: 'La app genera codigos',
                    desc: 'Un codigo de 6 digitos diferente cada 30 segundos.' },
                  { n: '3', title: 'Recibes codigos de respaldo',
                    desc: '10 codigos de un solo uso si pierdes acceso al telefono.' },
                ].map(({ n, title, desc }) => (
                  <div key={n} className="flex items-start gap-3">
                    <div className="w-7 h-7 rounded-lg text-white flex items-center
                                    justify-center text-xs font-black flex-shrink-0"
                      style={{ background: 'var(--h-teal-rest)' }}>
                      {n}
                    </div>
                    <div>
                      <p className="font-semibold text-h-primary text-sm">{title}</p>
                      <p className="text-h-secondary text-xs mt-0.5">{desc}</p>
                    </div>
                  </div>
                ))}
              </div>
              {error && (
                <p className="text-xs px-3 py-2 rounded-lg font-medium mb-4"
                  style={{
                    background: 'var(--h-sem-danger-bg)',
                    color: 'var(--h-sem-danger-text)',
                    border: '1px solid var(--h-sem-danger-border)',
                  }}>
                  {error}
                </p>
              )}
              <button onClick={handleSetup} disabled={loading}
                className={btnPrimary}
                style={{ background: loading ? 'var(--h-bg-highlight)' : 'var(--h-teal-rest)' }}
                onMouseEnter={e => { if (!loading) (e.currentTarget.style.background = 'var(--h-teal-hover)') }}
                onMouseLeave={e => { (e.currentTarget.style.background = loading ? 'var(--h-bg-highlight)' : 'var(--h-teal-rest)') }}
              >
                {loading ? 'Generando...' : <><Shield size={16} /> Activar 2FA</>}
              </button>
            </div>
          )}

          {totp2FAEnabled && (
            <div className="rounded-2xl border border-h-subtle p-6"
              style={{ background: 'var(--h-bg-surface)' }}>
              <div className="flex items-start gap-3">
                <Lock size={18} className="flex-shrink-0 mt-0.5"
                  style={{ color: 'var(--h-teal-hover)' }} />
                <div>
                  <p className="font-bold text-h-primary text-sm mb-1">El 2FA es obligatorio</p>
                  <p className="text-h-secondary text-sm leading-relaxed">
                    La verificacion en dos pasos no puede desactivarse en Hestia.
                    Esto garantiza la seguridad del sistema.
                  </p>
                  <p className="text-h-tertiary text-xs mt-3">
                    Si necesitas resetear tu configuracion, contacta al
                    administrador del sistema.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {showWizard && (
        <>
          {/* Wizard steps */}
          <div className="flex items-center mb-6">
            {WIZARD_STEPS.map((label, i) => (
              <div key={label} className="flex items-center">
                <div className={[
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs',
                  'font-bold transition-all',
                  i === activeStepIdx
                    ? 'text-white'
                    : i < activeStepIdx
                      ? 'text-h-secondary'
                      : 'text-h-tertiary',
                ].join(' ')}
                  style={{
                    background: i === activeStepIdx
                      ? 'var(--h-teal-rest)'
                      : i < activeStepIdx
                        ? 'var(--h-teal-subtle)'
                        : 'var(--h-bg-elevated)',
                  }}>
                  <span className="w-4 h-4 rounded-full flex items-center justify-center
                                   text-xs font-black">
                    {i < activeStepIdx ? '✓' : i + 1}
                  </span>
                  {label}
                </div>
                {i < WIZARD_STEPS.length - 1 && (
                  <div className="h-px w-5 mx-0.5"
                    style={{
                      background: i < activeStepIdx - 1
                        ? 'var(--h-teal-border)'
                        : 'var(--h-border-subtle)',
                    }} />
                )}
              </div>
            ))}
          </div>

          {/* Step QR */}
          {step === 'qr' && setupData && (
            <div className="rounded-2xl border border-h-subtle p-8"
              style={{ background: 'var(--h-bg-surface)' }}>
              <h2 className="font-bold text-h-primary mb-1">Escanea el codigo QR</h2>
              <p className="text-h-secondary text-sm mb-6">
                Abre Google Authenticator → toca <strong>+</strong> → Escanear QR.
              </p>
              <div className="flex justify-center mb-6">
                <div className="p-4 bg-white border-2 border-h-visible rounded-2xl">
                  <img src={setupData.qr_code} alt="QR 2FA" className="w-56 h-56" />
                </div>
              </div>
              <div className="rounded-xl border border-h-subtle p-4 mb-6"
                style={{ background: 'var(--h-bg-elevated)' }}>
                <p className="text-[10px] font-bold text-h-tertiary uppercase tracking-widest mb-2">
                  Clave manual
                </p>
                <div className="flex items-center justify-between gap-3">
                  <code className="text-sm font-mono text-h-primary tracking-wider break-all">
                    {setupData.secret}
                  </code>
                  <button onClick={copySecret}
                    className="flex-shrink-0 flex items-center gap-1 text-xs font-bold
                               transition-colors"
                    style={{ color: 'var(--h-teal-hover)' }}>
                    <Copy size={12} />{copied ? 'Copiado!' : 'Copiar'}
                  </button>
                </div>
              </div>
              <button
                onClick={() => { setStep('verify'); setCodigo(''); setError(null) }}
                className={btnPrimary}
                style={{ background: 'var(--h-teal-rest)' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--h-teal-hover)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'var(--h-teal-rest)')}
              >
                Ya lo escaneé <ChevronRight size={16} />
              </button>
              <button onClick={() => setStep('intro')}
                className="w-full mt-2 py-2 text-sm text-h-tertiary hover:text-h-secondary
                           font-semibold transition-colors">
                Cancelar
              </button>
            </div>
          )}

          {/* Step Verify — ahora con TotpInput animado */}
          {step === 'verify' && (
            <div className="rounded-2xl border border-h-subtle p-8"
              style={{ background: 'var(--h-bg-surface)' }}>
              <h2 className="font-bold text-h-primary mb-1">Confirma el codigo</h2>
              <p className="text-h-secondary text-sm mb-6">
                Ingresa el codigo de 6 digitos que muestra la app ahora.
              </p>
              <div className="space-y-4">
                <TotpInput
                  value={codigo}
                  onChange={v => { setCodigo(v); setError(null) }}
                  onConfirm={handleActivar}
                  animRef={totpAnimRef}
                  disabled={loading}
                />
                {error && (
                  <p className="text-xs px-3 py-2 rounded-lg font-medium"
                    style={{
                      background: 'var(--h-sem-danger-bg)',
                      color: 'var(--h-sem-danger-text)',
                      border: '1px solid var(--h-sem-danger-border)',
                    }}>
                    {error}
                  </p>
                )}
                <button
                  onClick={() => totpAnimRef.current?.()}
                  disabled={loading || codigo.length !== 6}
                  className={btnPrimary}
                  style={{ background: 'var(--h-teal-rest)' }}
                  onMouseEnter={e => {
                    if (!loading && codigo.length === 6)
                      (e.currentTarget.style.background = 'var(--h-teal-hover)')
                  }}
                  onMouseLeave={e =>
                    (e.currentTarget.style.background = 'var(--h-teal-rest)')
                  }
                >
                  {loading ? 'Activando...' : 'Activar 2FA'}
                </button>
              </div>
              <button onClick={() => setStep('qr')}
                className="w-full mt-2 py-2 text-sm text-h-tertiary hover:text-h-secondary
                           font-semibold transition-colors">
                Volver al QR
              </button>
            </div>
          )}

          {/* Step Codes */}
          {step === 'codes' && (
            <div className="rounded-2xl p-8"
              style={{
                background: 'var(--h-bg-surface)',
                border: '1px solid var(--h-sem-success-border)',
              }}>
              <div className="flex items-center gap-3 mb-2">
                <Key size={22} style={{ color: 'var(--h-teal-hover)' }} />
                <h2 className="font-bold text-h-primary">Codigos de recuperacion</h2>
              </div>
              <p className="text-h-secondary text-sm mb-5">
                Guarda estos 10 codigos en un lugar seguro. Cada uno funciona{' '}
                <strong>una sola vez</strong> si pierdes acceso a Google Authenticator.{' '}
                <strong>No podras verlos de nuevo.</strong>
              </p>
              <div className="rounded-xl p-5 mb-5"
                style={{ background: 'var(--h-bg-base)' }}>
                <div className="grid grid-cols-2 gap-2">
                  {recoveryCodes.map((c, i) => (
                    <code key={i} className="font-mono text-sm tracking-wider"
                      style={{ color: 'var(--h-teal-hover)' }}>{c}</code>
                  ))}
                </div>
              </div>
              <button
                onClick={copyAllCodes}
                className="w-full flex items-center justify-center gap-2 mb-4
                           border font-bold py-2.5 rounded-xl transition-colors text-sm"
                style={{
                  borderColor: 'var(--h-border-visible)',
                  color: 'var(--h-text-secondary)',
                  background: 'var(--h-bg-elevated)',
                }}
              >
                <Copy size={14} />{copiedAll ? 'Copiados!' : 'Copiar todos los codigos'}
              </button>
              <button
                onClick={() => setStep('success')}
                className={btnPrimary}
                style={{ background: 'var(--h-teal-rest)' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--h-teal-hover)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'var(--h-teal-rest)')}
              >
                Ya los guarde <ChevronRight size={16} />
              </button>
            </div>
          )}

          {/* Step Success */}
          {step === 'success' && (
            <div className="rounded-2xl border p-10 text-center"
              style={{
                background: 'var(--h-bg-surface)',
                borderColor: 'var(--h-sem-success-border)',
              }}>
              <div className="w-20 h-20 rounded-full flex items-center
                              justify-center mx-auto mb-5"
                style={{ background: 'var(--h-sem-success-bg)' }}>
                <CheckCircle size={40} style={{ color: 'var(--h-sem-success-text)' }} />
              </div>
              <h2 className="text-xl font-bold text-h-primary mb-2">
                Verificacion activada!
              </h2>
              <p className="text-h-secondary text-sm max-w-xs mx-auto mb-8">
                Tu cuenta esta protegida con 2FA. Necesitaras el codigo TOTP
                en cada inicio de sesion.
              </p>
              <Link
                to="/dashboard"
                className="inline-flex items-center gap-2 text-white font-bold
                           px-6 py-3 rounded-xl transition-colors"
                style={{ background: 'var(--h-teal-rest)' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--h-teal-hover)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'var(--h-teal-rest)')}
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
