import { useEffect, useRef, useState } from 'react'
import { User, Lock, Shield, Mail, CheckCircle2, XCircle, Camera } from 'lucide-react'
import { api } from '../api/client'
import type { UsuarioMe } from '../types/api'
import { Badge } from '../components/ui/Badge'

export function Perfil() {
  const [usuario, setUsuario] = useState<UsuarioMe | null>(null)
  const [loading, setLoading] = useState(true)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const [avatarPreview, setPreview] = useState<string | null>(null)
  const [subiendoAvatar, setSubiendo] = useState(false)
  const [avatarExito, setAvatarExito] = useState(false)

  const [form, setForm] = useState({
    password_actual: '', password_nueva: '', confirmar: '',
  })
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [exito, setExito] = useState(false)

  useEffect(() => {
    api.get<UsuarioMe>('/usuarios/me')
      .then(({ data }) => setUsuario(data))
      .finally(() => setLoading(false))
  }, [])

  function resizarImagen(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = (e) => {
        const img = new Image()
        img.onload = () => {
          const MAX = 256
          const ratio = Math.min(MAX / img.width, MAX / img.height, 1)
          const w = Math.round(img.width * ratio)
          const h = Math.round(img.height * ratio)
          const canvas = document.createElement('canvas')
          canvas.width = w; canvas.height = h
          const ctx = canvas.getContext('2d')!
          ctx.drawImage(img, 0, 0, w, h)
          resolve(canvas.toDataURL('image/jpeg', 0.88))
        }
        img.onerror = reject
        img.src = e.target?.result as string
      }
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      alert('Solo se permiten archivos de imagen.')
      return
    }
    if (file.size > 8_000_000) {
      alert('La imagen no puede superar 8 MB antes de redimensionar.')
      return
    }
    try {
      const dataUrl = await resizarImagen(file)
      setPreview(dataUrl); setAvatarExito(false)
    } catch {
      alert('No se pudo procesar la imagen. Intenta con otro archivo.')
    }
    e.target.value = ''
  }

  async function handleGuardarAvatar() {
    if (!avatarPreview) return
    setSubiendo(true)
    try {
      const { data } = await api.put<UsuarioMe>('/usuarios/me/avatar', {
        avatar_b64: avatarPreview,
      })
      setUsuario(data); setPreview(null)
      setAvatarExito(true); setTimeout(() => setAvatarExito(false), 3000)
    } catch {
      alert('Error al guardar la foto. Intenta de nuevo.')
    } finally { setSubiendo(false) }
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setForm(f => ({ ...f, [e.target.name]: e.target.value }))
    setError(null); setExito(false)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null); setExito(false)
    if (form.password_nueva.length < 8) {
      setError('La contraseña nueva debe tener al menos 8 caracteres.')
      return
    }
    if (form.password_nueva !== form.confirmar) {
      setError('Las contraseñas nuevas no coinciden.')
      return
    }
    setGuardando(true)
    try {
      await api.post('/usuarios/me/cambiar-password', {
        password_actual: form.password_actual,
        password_nueva: form.password_nueva,
      })
      setExito(true)
      setForm({ password_actual: '', password_nueva: '', confirmar: '' })
    } catch (err: unknown) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const detail = (err as any)?.response?.data?.detail
      setError(detail ?? 'Error al cambiar la contraseña. Intenta de nuevo.')
    } finally { setGuardando(false) }
  }

  const avatarSrc = avatarPreview ?? usuario?.avatar_b64 ?? null

  const rolLabel: Record<string, string> = {
    admin: 'Administrador', operador: 'Operador', visor: 'Visor', docente: 'Docente',
  }

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <h1 className="text-2xl font-black text-slate-900 mb-8">Mi perfil</h1>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 mb-6">
        <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-5">
          Información de la cuenta
        </h2>

        {/* Avatar */}
        <div className="flex flex-col items-center mb-6">
          <div
            className="relative w-24 h-24 rounded-full overflow-hidden cursor-pointer group
                       ring-2 ring-slate-200 hover:ring-teal-400 transition-all duration-200"
            onClick={() => fileInputRef.current?.click()}
            title="Cambiar foto de perfil"
          >
            {avatarSrc ? (
              <img src={avatarSrc} alt="Foto de perfil" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full bg-slate-100 flex items-center justify-center">
                <User size={38} className="text-slate-400" />
              </div>
            )}
            <div className="absolute inset-0 bg-black/40 flex items-center justify-center
                           opacity-0 group-hover:opacity-100 transition-opacity duration-200">
              <Camera size={22} className="text-white" />
            </div>
          </div>

          <input
            type="file" ref={fileInputRef} accept="image/*"
            className="hidden" onChange={handleFileChange}
          />

          {avatarPreview ? (
            <div className="flex items-center gap-2 mt-3">
              <button
                onClick={handleGuardarAvatar} disabled={subiendoAvatar}
                className="px-4 py-1.5 bg-teal-600 hover:bg-teal-700 text-white text-xs
                           font-bold rounded-lg transition-colors disabled:opacity-50"
              >
                {subiendoAvatar ? 'Guardando...' : 'Guardar foto'}
              </button>
              <button
                onClick={() => setPreview(null)}
                className="px-3 py-1.5 text-slate-400 hover:text-slate-600 text-xs
                           font-semibold transition-colors"
              >
                Cancelar
              </button>
            </div>
          ) : (
            <button
              onClick={() => fileInputRef.current?.click()}
              className="mt-2 text-xs text-slate-400 hover:text-teal-600
                         font-semibold transition-colors"
            >
              {usuario?.avatar_b64 ? 'Cambiar foto' : 'Subir foto de perfil'}
            </button>
          )}

          {avatarExito && (
            <p className="mt-2 text-xs text-teal-600 font-semibold flex items-center gap-1">
              <CheckCircle2 size={13} /> Foto actualizada
            </p>
          )}
        </div>

        <div className="border-t border-slate-100 mb-1" />

        {loading ? (
          <div className="space-y-3 mt-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-5 bg-slate-100 rounded animate-pulse" />
            ))}
          </div>
        ) : usuario ? (
          <dl className="divide-y divide-slate-100">
            <InfoRow
              icon={<User size={15} />}
              label="Nombre"
              value={<span className="font-semibold text-slate-900">{usuario.nombre}</span>}
            />
            <InfoRow
              icon={<Mail size={15} />}
              label="Email"
              value={<span className="font-semibold text-slate-900">{usuario.email}</span>}
            />
            <InfoRow
              icon={<Shield size={15} />}
              label="Rol"
              value={<Badge variant="info">{rolLabel[usuario.rol] ?? usuario.rol}</Badge>}
            />
            <InfoRow
              icon={<CheckCircle2 size={15} />}
              label="Autenticación 2FA"
              value={
                usuario.totp_habilitado
                  ? <Badge variant="success">Activa</Badge>
                  : <Badge variant="warning">Inactiva</Badge>
              }
            />
          </dl>
        ) : null}
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <div className="flex items-center gap-2 mb-5">
          <Lock size={15} className="text-slate-400" />
          <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest">
            Cambiar contraseña
          </h2>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <PasswordField label="Contraseña actual" name="password_actual"
            value={form.password_actual} onChange={handleChange} />
          <PasswordField label="Contraseña nueva" name="password_nueva"
            value={form.password_nueva} onChange={handleChange}
            hint="Mínimo 8 caracteres" />
          <PasswordField label="Confirmar contraseña nueva" name="confirmar"
            value={form.confirmar} onChange={handleChange} />

          {error && (
            <div className="flex items-center gap-2 text-rose-600 text-sm
                            bg-rose-50 border border-rose-200 rounded-lg px-4 py-2.5">
              <XCircle size={15} className="flex-shrink-0" />
              {error}
            </div>
          )}

          {exito && (
            <div className="flex items-center gap-2 text-teal-700 text-sm
                            bg-teal-50 border border-teal-200 rounded-lg px-4 py-2.5">
              <CheckCircle2 size={15} className="flex-shrink-0" />
              Contraseña actualizada correctamente.
            </div>
          )}

          <button
            type="submit"
            disabled={guardando || !form.password_actual || !form.password_nueva || !form.confirmar}
            className="w-full mt-2 py-2.5 px-4 bg-teal-600 hover:bg-teal-700
                       disabled:opacity-50 disabled:cursor-not-allowed
                       text-white text-sm font-bold rounded-xl transition-colors"
          >
            {guardando ? 'Guardando...' : 'Cambiar contraseña'}
          </button>
        </form>
      </div>
    </div>
  )
}

function InfoRow({ icon, label, value }: {
  icon: React.ReactNode; label: string; value: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <dt className="flex items-center gap-2 text-sm text-slate-500 min-w-0">
        <span className="text-slate-400">{icon}</span>
        {label}
      </dt>
      <dd className="text-sm text-right">{value}</dd>
    </div>
  )
}

function PasswordField({ label, name, value, onChange, hint }: {
  label: string; name: string; value: string
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  hint?: string
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-600 mb-1.5">{label}</label>
      <input
        type="password" name={name} value={value} onChange={onChange}
        autoComplete="new-password"
        className="w-full px-3 py-2.5 rounded-lg border border-slate-200 text-sm
                   focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent
                   transition"
      />
      {hint && <p className="text-xs text-slate-400 mt-1">{hint}</p>}
    </div>
  )
}
