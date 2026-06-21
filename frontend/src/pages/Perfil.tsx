import { useEffect, useRef, useState } from 'react'
import { UserCircle, User, Lock, Shield, Mail, CheckCircle2, XCircle, Camera, Sun, Moon, Laptop } from 'lucide-react'
import { api } from '../api/client'
import type { UsuarioMe } from '../types/api'
import { Badge } from '../components/ui/Badge'
import { useThemeStore } from '../store/theme' // Importamos tu store de tema
import { useAuthStore } from '../store/auth'

export function Perfil() {
  const [usuario, setUsuario] = useState<UsuarioMe | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'general' | 'seguridad' | 'apariencia'>('general')

  const { isDark, toggleTheme } = useThemeStore()
  
  const { updateUser } = useAuthStore()

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

      updateUser({ avatar_b64: data.avatar_b64 })
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
    <div className="p-8 max-w-4xl mx-auto min-h-full">
      <h1 className="text-2xl font-semibold text-h-primary mb-8 flex items-center gap-2">
        <UserCircle size={22} className="text-h-accent" />
        Configuración de la cuenta</h1>

      <div className="flex flex-col md:flex-row gap-8">
        
        {/* Menú Lateral de Configuración */}
        <aside className="w-full md:w-56 flex flex-col gap-1 flex-shrink-0">
          <TabButton 
            active={activeTab === 'general'} 
            onClick={() => setActiveTab('general')} 
            icon={<User size={16} />} 
            label="General" 
          />
          <TabButton 
            active={activeTab === 'seguridad'} 
            onClick={() => setActiveTab('seguridad')} 
            icon={<Shield size={16} />} 
            label="Seguridad" 
          />
          <TabButton 
            active={activeTab === 'apariencia'} 
            onClick={() => setActiveTab('apariencia')} 
            icon={<Sun size={16} />} 
            label="Apariencia" 
          />
        </aside>

        {/* Contenido Principal */}
        <div className="flex-1 min-w-0">
          
          {/* TABS: GENERAL */}
          {activeTab === 'general' && (
            <div className="bg-h-surface rounded-xl border border-h-subtle p-6 shadow-sm">
              <h2 className="text-sm font-semibold text-h-primary mb-6">Información personal</h2>
              
              {/* Avatar Section */}
              <div className="flex items-center gap-6 mb-8">
                <div
                  className="relative w-20 h-20 rounded-full overflow-hidden cursor-pointer group
                             ring-1 ring-h-subtle hover:ring-teal-500 transition-all duration-200"
                  onClick={() => fileInputRef.current?.click()}
                  title="Cambiar foto de perfil"
                >
                  {avatarSrc ? (
                    <img src={avatarSrc} alt="Foto de perfil" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-h-elevated flex items-center justify-center">
                      <User size={30} className="text-h-tertiary" />
                    </div>
                  )}
                  <div className="absolute inset-0 bg-black/50 flex items-center justify-center
                                 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                    <Camera size={20} className="text-white" />
                  </div>
                </div>

                <input type="file" ref={fileInputRef} accept="image/*" className="hidden" onChange={handleFileChange} />

                <div className="flex-1">
                  {avatarPreview ? (
                    <div className="flex items-center gap-2">
                      <button onClick={handleGuardarAvatar} disabled={subiendoAvatar}
                        className="px-4 py-2 bg-teal-600/90 hover:bg-teal-500 text-white text-xs font-semibold rounded-lg transition-colors disabled:opacity-50">
                        {subiendoAvatar ? 'Guardando...' : 'Guardar foto'}
                      </button>
                      <button onClick={() => setPreview(null)}
                        className="px-4 py-2 text-h-secondary hover:text-h-primary bg-h-elevated rounded-lg text-xs font-semibold transition-colors">
                        Cancelar
                      </button>
                    </div>
                  ) : (
                    <div>
                      <button onClick={() => fileInputRef.current?.click()} className="text-sm text-h-primary font-medium hover:text-teal-400 transition-colors">
                        {usuario?.avatar_b64 ? 'Cambiar foto de perfil' : 'Subir foto de perfil'}
                      </button>
                      <p className="text-xs text-h-tertiary mt-1">Recomendado: JPG o PNG, max 8MB.</p>
                    </div>
                  )}
                  {avatarExito && (
                    <p className="mt-2 text-xs text-teal-400 font-medium flex items-center gap-1">
                      <CheckCircle2 size={14} /> Foto actualizada correctamente.
                    </p>
                  )}
                </div>
              </div>

              <div className="h-px bg-h-subtle mb-6" />

              {/* User Info */}
              {loading ? (
                <div className="space-y-4">
                  {[...Array(3)].map((_, i) => <div key={i} className="h-6 bg-h-elevated rounded animate-pulse w-2/3" />)}
                </div>
              ) : usuario ? (
                <dl className="space-y-4">
                  <InfoRow label="Nombre" value={usuario.nombre} />
                  <InfoRow label="Email" value={usuario.email} />
                  <InfoRow label="Rol" value={rolLabel[usuario.rol] ?? usuario.rol} isBadge />
                </dl>
              ) : null}
            </div>
          )}

          {/* TABS: SEGURIDAD */}
          {activeTab === 'seguridad' && (
            <div className="space-y-6">
              {/* Autenticación 2FA Status */}
              <div className="bg-h-surface rounded-xl border border-h-subtle p-6 shadow-sm">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <h2 className="text-sm font-semibold text-h-primary">Autenticación de dos factores (2FA)</h2>
                    <p className="text-xs text-h-tertiary mt-1">Añade una capa extra de seguridad a tu cuenta.</p>
                  </div>
                  {usuario?.totp_habilitado ? (
                    <Badge variant="success">Activa</Badge>
                  ) : (
                    <Badge variant="warning">Inactiva</Badge>
                  )}
                </div>
              </div>

              {/* Cambio de Contraseña */}
              <div className="bg-h-surface rounded-xl border border-h-subtle p-6 shadow-sm">
                <h2 className="text-sm font-semibold text-h-primary mb-6">Cambiar contraseña</h2>
                <form onSubmit={handleSubmit} className="space-y-5">
                  <PasswordField label="Contraseña actual" name="password_actual" value={form.password_actual} onChange={handleChange} />
                  <PasswordField label="Nueva contraseña" name="password_nueva" value={form.password_nueva} onChange={handleChange} hint="Debe contener al menos 8 caracteres." />
                  <PasswordField label="Confirmar nueva contraseña" name="confirmar" value={form.confirmar} onChange={handleChange} />

                  {error && (
                    <div className="flex items-center gap-2 text-red-400 text-sm bg-red-400/10 border border-red-400/20 rounded-lg px-4 py-3">
                      <XCircle size={16} className="flex-shrink-0" />
                      {error}
                    </div>
                  )}

                  {exito && (
                    <div className="flex items-center gap-2 text-teal-400 text-sm bg-teal-400/10 border border-teal-400/20 rounded-lg px-4 py-3">
                      <CheckCircle2 size={16} className="flex-shrink-0" />
                      Contraseña actualizada correctamente.
                    </div>
                  )}

                  <div className="pt-2">
                    <button type="submit" disabled={guardando || !form.password_actual || !form.password_nueva || !form.confirmar}
                      className="px-5 py-2.5 bg-h-primary text-h-surface hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium rounded-lg transition-all">
                      {guardando ? 'Guardando...' : 'Actualizar contraseña'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* TABS: APARIENCIA */}
          {activeTab === 'apariencia' && (
            <div className="bg-h-surface rounded-xl border border-h-subtle p-6 shadow-sm">
              <h2 className="text-sm font-semibold text-h-primary mb-2">Tema de la interfaz</h2>
              <p className="text-xs text-h-tertiary mb-6">Elige el modo en el que deseas visualizar Hestia.</p>

              <div className="grid grid-cols-2 gap-4 max-w-sm">
                <button
                  onClick={() => isDark && toggleTheme()}
                  className={`flex items-center justify-center gap-3 p-4 rounded-xl border transition-all ${
                    !isDark ? 'border-teal-500 bg-teal-500/10 text-teal-400' : 'border-h-subtle bg-h-elevated text-h-secondary hover:text-h-primary'
                  }`}
                >
                  <Sun size={20} />
                  <span className="text-sm font-medium">Claro</span>
                </button>
                <button
                  onClick={() => !isDark && toggleTheme()}
                  className={`flex items-center justify-center gap-3 p-4 rounded-xl border transition-all ${
                    isDark ? 'border-teal-500 bg-teal-500/10 text-teal-400' : 'border-h-subtle bg-h-elevated text-h-secondary hover:text-h-primary'
                  }`}
                >
                  <Moon size={20} />
                  <span className="text-sm font-medium">Oscuro</span>
                </button>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}

function TabButton({ active, icon, label, onClick }: { active: boolean, icon: React.ReactNode, label: string, onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
        active 
          ? 'bg-h-elevated text-h-primary' 
          : 'text-h-secondary hover:bg-h-elevated hover:text-h-primary'
      }`}
    >
      <span className={active ? 'text-h-primary' : 'text-h-tertiary'}>{icon}</span>
      {label}
    </button>
  )
}

function InfoRow({ label, value, isBadge }: { label: string; value: React.ReactNode, isBadge?: boolean }) {
  return (
    <div className="grid grid-cols-3 gap-4 py-1">
      <dt className="text-sm font-medium text-h-secondary">{label}</dt>
      <dd className="col-span-2 text-sm text-h-primary">
        {isBadge ? <Badge variant="info">{value}</Badge> : value}
      </dd>
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
      <label className="block text-xs font-medium text-h-secondary mb-1.5">{label}</label>
      <input
        type="password" name={name} value={value} onChange={onChange} autoComplete="new-password"
        className="w-full px-4 py-2.5 rounded-lg border border-h-subtle bg-h-elevated text-h-primary text-sm
                   focus:outline-none focus:ring-1 focus:ring-teal-500 focus:border-teal-500 transition-all
                   placeholder-h-tertiary"
      />
      {hint && <p className="text-xs text-h-tertiary mt-1.5">{hint}</p>}
    </div>
  )
}