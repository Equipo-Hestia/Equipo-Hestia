import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import {
  Users, Plus, Pencil, Archive, ArchiveRestore, CheckCircle,
  ShieldOff, Shield, ShieldAlert, RefreshCw
} from 'lucide-react'
import { api } from '../api/client'
import type { UsuarioMe, PaginatedResponse } from '../types/api'
import { Modal } from '../components/ui/Modal'
import { Badge } from '../components/ui/Badge'
import { HSelect } from '../components/ui/HSelect'
import { useLastUpdated } from '../hooks/useLastUpdated'

const PAGE_SIZE = 20
const ROLES = [
  'admin', 'operador_coordinador', 'operador', 'visor',
] as const
type Rol = typeof ROLES[number]

const ROL_LABEL: Record<Rol, string> = {
  admin: 'Administrador',
  operador_coordinador: 'Op. Coordinador',
  operador: 'Operador',
  visor: 'Visor',
}

const ROL_VARIANT: Record<Rol, 'danger' | 'warning' | 'info' | 'success'> = {
  admin: 'danger',
  operador_coordinador: 'warning',
  operador: 'warning',
  visor: 'info',
}

interface FormState {
  nombre: string
  email: string
  password: string
  rol: Rol
}

const FORM_INICIAL: FormState = { nombre: '', email: '', password: '', rol: 'visor' }

function extraerMensajeError(err: unknown, fallback: string): string {
  const detail = (err as { response?: { data?: { detail?: unknown } } })
    ?.response?.data?.detail
  if (!detail) return fallback
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail) && detail.length > 0) {
    const primero = detail[0] as { msg?: string; loc?: string[] }
    const campo = primero.loc?.slice(-1)[0] ?? ''
    const msg = primero.msg ?? ''
    return campo ? `${campo}: ${msg}` : msg || fallback
  }
  return fallback
}

export function Usuarios() {
  const [usuarios, setUsuarios]         = useState<UsuarioMe[]>([])
  const [total, setTotal]               = useState(0)
  const [page, setPage]                 = useState(0)
  const [loading, setLoading]           = useState(true)
  const [mostrarInactivos, setMostrar]  = useState(false)
  const [showCrear, setShowCrear]       = useState(false)
  const [editTarget, setEditTarget]     = useState<UsuarioMe | null>(null)
  const [delTarget, setDelTarget]       = useState<UsuarioMe | null>(null)
  const [reactivarTarget, setReactivar] = useState<UsuarioMe | null>(null)
  const [form, setForm]                 = useState<FormState>(FORM_INICIAL)
  const [saving, setSaving]             = useState(false)
  const [deleting, setDeleting]         = useState(false)
  const [formError, setFormError]       = useState<string | null>(null)
  const [toast, setToast]               = useState<string | null>(null)
  const [deleteStep, setDeleteStep]     = useState<'confirm' | 'totp'>('confirm')
  const [deleteTotp, setDeleteTotp]     = useState('')
  const [userHas2FA, setUserHas2FA]     = useState<boolean | null>(null)
  const [rowHover, setRowHover]         = useState<number | null>(null)

  const { labelTiempo, marcarActualizado } = useLastUpdated()

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  useEffect(() => {
    api.get<{ totp_habilitado: boolean }>('/usuarios/me').then(({ data }) => {
      setUserHas2FA(data.totp_habilitado)
    }).catch(() => {})
  }, [])

  const load = useCallback(async (skip: number, incluirInactivos: boolean) => {
    setLoading(true)
    try {
      const { data } = await api.get<PaginatedResponse<UsuarioMe>>('/usuarios/', {
        params: { skip, limit: PAGE_SIZE, incluir_inactivos: incluirInactivos },
      })
      setUsuarios(data.data)
      setTotal(data.total)
      marcarActualizado()
    } catch {
      setUsuarios([]); setTotal(0)
    } finally {
      setLoading(false)
    }
  }, [marcarActualizado])

  useEffect(() => { load(page * PAGE_SIZE, mostrarInactivos) }, [page, mostrarInactivos, load])

  function abrirCrear() { setForm(FORM_INICIAL); setFormError(null); setShowCrear(true) }

  function abrirEditar(u: UsuarioMe) {
    setForm({ nombre: u.nombre, email: u.email, password: '', rol: u.rol as Rol })
    setFormError(null); setEditTarget(u)
  }

  function cerrar() {
    setShowCrear(false); setEditTarget(null); setDelTarget(null); setReactivar(null)
    setFormError(null); setDeleteStep('confirm'); setDeleteTotp('')
  }

  function handleField(e: React.ChangeEvent<HTMLInputElement>) {
    setForm(f => ({ ...f, [e.target.name]: e.target.value })); setFormError(null)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setFormError(null)
    if (!editTarget && form.password.length < 8) {
      setFormError('La contrase\u00f1a debe tener al menos 8 caracteres.'); return
    }
    if (editTarget && form.password && form.password.length < 8) {
      setFormError('La contrase\u00f1a nueva debe tener al menos 8 caracteres.'); return
    }
    setSaving(true)
    try {
      if (editTarget) {
        const payload: Record<string, unknown> = {
          nombre: form.nombre, email: form.email, rol: form.rol,
        }
        if (form.password) payload.password = form.password
        await api.put(`/usuarios/${editTarget.id}`, payload)
        showToast('Usuario actualizado')
      } else {
        await api.post('/usuarios/', {
          nombre: form.nombre, email: form.email,
          password: form.password, rol: form.rol,
        })
        showToast('Usuario creado')
      }
      cerrar(); load(page * PAGE_SIZE, mostrarInactivos)
    } catch (err: unknown) {
      setFormError(extraerMensajeError(err, 'Error al guardar. Intenta de nuevo.'))
    } finally { setSaving(false) }
  }

  async function handleDelete() {
    if (!delTarget) return
    setDeleting(true)
    try {
      await api.delete(`/usuarios/${delTarget.id}`, {
        headers: { 'x-totp-code': deleteTotp }
      })
      showToast(`${delTarget.nombre} desactivado`)
      cerrar(); load(page * PAGE_SIZE, mostrarInactivos)
    } catch (err: unknown) {
      setFormError(extraerMensajeError(err, 'Error al desactivar.'))
    } finally { setDeleting(false) }
  }

  async function handleReactivar() {
    if (!reactivarTarget) return
    setDeleting(true)
    try {
      await api.put(`/usuarios/${reactivarTarget.id}`, {
        nombre: reactivarTarget.nombre,
        email: reactivarTarget.email,
        rol: reactivarTarget.rol,
        activo: true,
      })
      showToast(`${reactivarTarget.nombre} reactivado`)
      cerrar(); load(page * PAGE_SIZE, mostrarInactivos)
    } catch (err: unknown) {
      setFormError(extraerMensajeError(err, 'Error al reactivar.'))
    } finally { setDeleting(false) }
  }

  async function handleReset2FA(u: UsuarioMe) {
    if (!confirm(`\u00bfDesactivar el 2FA de ${u.nombre}? Tendr\u00e1 que configurarlo de nuevo.`)) return
    try {
      await api.post(`/usuarios/${u.id}/reset-2fa`)
      showToast(`2FA desactivado para ${u.nombre}`)
      load(page * PAGE_SIZE, mostrarInactivos)
    } catch { showToast('Error al desactivar el 2FA.') }
  }

  const inputCls = `
    w-full px-3 py-2.5 rounded-lg border border-h-visible text-h-primary text-sm
    focus:outline-none focus:ring-2 bg-h-elevated placeholder:text-h-tertiary
    transition-all
  `

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const rolOpts = ROLES.map(r => ({ value: r, label: ROL_LABEL[r] }))

  return (
    <div className="p-8 w-full">

      {/* Toast */}
      {toast && (
        <div
          className="
            fixed top-6 right-6 z-50 flex items-center gap-2
            px-4 py-3 rounded-xl shadow-lg text-sm font-semibold text-white
          "
          style={{ background: 'var(--h-teal-rest)' }}
        >
          <CheckCircle size={16} />{toast}
        </div>
      )}

      {/* Encabezado */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-black text-h-primary flex items-center gap-2">
            <Users size={22} className="text-h-accent" />
            Usuarios
          </h1>
          <p className="text-h-secondary text-sm mt-0.5">
            {total} {mostrarInactivos ? 'usuarios (incluye inactivos)' : 'usuarios activos'}
          </p>
          <p className="text-xs text-h-tertiary mt-1">{labelTiempo}</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => load(page * PAGE_SIZE, mostrarInactivos)}
            title="Actualizar"
            className="p-2 rounded-lg border border-h-subtle bg-h-elevated
                       text-h-tertiary transition-colors duration-150"
            onMouseEnter={e =>
              (e.currentTarget.style.background = 'var(--h-bg-highlight)')
            }
            onMouseLeave={e =>
              (e.currentTarget.style.background = 'var(--h-bg-elevated)')
            }
          >
            <RefreshCw size={15} />
          </button>
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox" checked={mostrarInactivos}
              onChange={e => { setMostrar(e.target.checked); setPage(0) }}
              className="w-4 h-4 rounded"
            />
            <span className="text-sm font-semibold text-h-secondary">
              Mostrar inactivos
            </span>
          </label>
          <button
            onClick={abrirCrear}
            className="
              flex items-center gap-2 text-white font-bold
              px-4 py-2.5 rounded-xl text-sm transition-colors duration-150
            "
            style={{ background: 'var(--h-teal-rest)' }}
            onMouseEnter={e =>
              (e.currentTarget.style.background = 'var(--h-teal-hover)')
            }
            onMouseLeave={e =>
              (e.currentTarget.style.background = 'var(--h-teal-rest)')
            }
          >
            <Plus size={16} /> Nuevo usuario
          </button>
        </div>
      </div>

      {/* Tabla */}
      <div className="bg-h-surface rounded-xl border border-h-subtle overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-h-subtle bg-h-elevated">
              {['Nombre', 'Email', 'Rol', 'Estado', '2FA', 'Acciones'].map(h => (
                <th
                  key={h}
                  className="
                    text-left px-4 py-3 text-xs font-bold
                    text-h-tertiary uppercase tracking-wide
                  "
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i}>
                  {Array.from({ length: 6 }).map((__, j) => (
                    <td key={j} className="px-4 py-3">
                      <div className="h-4 rounded bg-h-elevated w-24 animate-pulse" />
                    </td>
                  ))}
                </tr>
              ))
            ) : usuarios.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center py-16">
                  <Users size={32} className="mx-auto mb-2 text-h-tertiary opacity-40" />
                  <p className="font-semibold text-h-secondary">Sin usuarios registrados</p>
                </td>
              </tr>
            ) : usuarios.map(u => (
              <tr
                key={u.id}
                style={{
                  background: rowHover === u.id
                    ? 'var(--h-bg-highlight)'
                    : 'transparent',
                  opacity: u.activo ? 1 : 0.55,
                }}
                className="border-b border-h-subtle transition-colors"
                onMouseEnter={() => setRowHover(u.id)}
                onMouseLeave={() => setRowHover(null)}
              >
                <td className="px-4 py-3 font-semibold text-h-primary">{u.nombre}</td>
                <td className="px-4 py-3 text-h-secondary">{u.email}</td>
                <td className="px-4 py-3">
                  <Badge variant={ROL_VARIANT[u.rol as Rol] ?? 'info'}>
                    {ROL_LABEL[u.rol as Rol] ?? u.rol}
                  </Badge>
                </td>
                <td className="px-4 py-3">
                  {u.activo
                    ? <Badge variant="success">Activo</Badge>
                    : <Badge variant="danger">Inactivo</Badge>
                  }
                </td>
                <td className="px-4 py-3">
                  {u.totp_habilitado
                    ? (
                      <Badge variant="success">
                        <Shield size={11} className="inline mr-1" />Activo
                      </Badge>
                    )
                    : <Badge variant="warning">Inactivo</Badge>
                  }
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1">
                    {u.activo ? (
                      <>
                        <button
                          onClick={() => abrirEditar(u)}
                          title="Editar"
                          className="p-1.5 rounded-lg text-h-tertiary transition-colors duration-150"
                          onMouseEnter={e => {
                            e.currentTarget.style.background = 'var(--h-teal-subtle)'
                            e.currentTarget.style.color = 'var(--h-teal-hover)'
                          }}
                          onMouseLeave={e => {
                            e.currentTarget.style.background = 'transparent'
                            e.currentTarget.style.color = 'var(--h-text-tertiary)'
                          }}
                        >
                          <Pencil size={14} />
                        </button>
                        {u.totp_habilitado && (
                          <button
                            onClick={() => handleReset2FA(u)}
                            title="Desactivar 2FA"
                            className="p-1.5 rounded-lg text-h-tertiary transition-colors duration-150"
                            onMouseEnter={e => {
                              e.currentTarget.style.background = 'var(--h-sem-warning-bg)'
                              e.currentTarget.style.color = 'var(--h-sem-warning-text)'
                            }}
                            onMouseLeave={e => {
                              e.currentTarget.style.background = 'transparent'
                              e.currentTarget.style.color = 'var(--h-text-tertiary)'
                            }}
                          >
                            <ShieldOff size={14} />
                          </button>
                        )}
                        <button
                          onClick={() => { setDelTarget(u); setFormError(null) }}
                          title="Desactivar usuario"
                          className="p-1.5 rounded-lg text-h-tertiary transition-colors duration-150"
                          onMouseEnter={e => {
                            e.currentTarget.style.background = 'var(--h-sem-danger-bg)'
                            e.currentTarget.style.color = 'var(--h-sem-danger-text)'
                          }}
                          onMouseLeave={e => {
                            e.currentTarget.style.background = 'transparent'
                            e.currentTarget.style.color = 'var(--h-text-tertiary)'
                          }}
                        >
                          <Archive size={14} />
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => { setReactivar(u); setFormError(null) }}
                        title="Reactivar usuario"
                        className="
                          flex items-center gap-1 px-2.5 py-1.5 rounded-lg
                          text-xs font-bold transition-colors duration-150
                        "
                        style={{
                          background: 'var(--h-sem-success-bg)',
                          color: 'var(--h-sem-success-text)',
                        }}
                        onMouseEnter={e => {
                          e.currentTarget.style.opacity = '0.8'
                        }}
                        onMouseLeave={e => {
                          e.currentTarget.style.opacity = '1'
                        }}
                      >
                        <ArchiveRestore size={12} /> Reactivar
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {!loading && totalPages > 1 && (
          <div
            className="
              flex items-center justify-between
              px-4 py-3 border-t border-h-subtle
            "
          >
            <p className="text-xs text-h-tertiary">
              P\u00e1gina {page + 1} de {totalPages}
            </p>
            <div className="flex gap-1">
              <button
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={page === 0}
                className="
                  px-3 py-1 text-xs rounded-lg border border-h-subtle
                  text-h-secondary disabled:opacity-40
                  transition-colors duration-150
                "
                onMouseEnter={e =>
                  (e.currentTarget.style.background = 'var(--h-bg-highlight)')
                }
                onMouseLeave={e =>
                  (e.currentTarget.style.background = 'transparent')
                }
              >
                \u2190
              </button>
              <button
                onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="
                  px-3 py-1 text-xs rounded-lg border border-h-subtle
                  text-h-secondary disabled:opacity-40
                  transition-colors duration-150
                "
                onMouseEnter={e =>
                  (e.currentTarget.style.background = 'var(--h-bg-highlight)')
                }
                onMouseLeave={e =>
                  (e.currentTarget.style.background = 'transparent')
                }
              >
                \u2192
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modal crear / editar */}
      {(showCrear || editTarget) && (
        <Modal
          title={editTarget ? 'Editar usuario' : 'Nuevo usuario'}
          onClose={cerrar}
          size="sm"
        >
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                className="
                  block text-xs font-bold text-h-tertiary
                  uppercase tracking-wide mb-1.5
                "
              >
                Nombre *
              </label>
              <input
                type="text" name="nombre" required value={form.nombre}
                onChange={handleField} className={inputCls}
                placeholder="Ej: Mariana González" autoFocus
              />
            </div>
            <div>
              <label
                className="
                  block text-xs font-bold text-h-tertiary
                  uppercase tracking-wide mb-1.5
                "
              >
                Email *
              </label>
              <input
                type="email" name="email" required value={form.email}
                onChange={handleField} className={inputCls}
                placeholder="usuario@duoc.cl"
              />
            </div>
            <div>
              <label
                className="
                  block text-xs font-bold text-h-tertiary
                  uppercase tracking-wide mb-1.5
                "
              >
                {editTarget ? 'Nueva contraseña' : 'Contraseña *'}
              </label>
              <input
                type="password" name="password"
                required={!editTarget}
                value={form.password}
                onChange={handleField}
                className={inputCls}
                placeholder={
                  editTarget
                    ? 'Dejar vacío para no cambiar'
                    : 'M\u00ednimo 8 caracteres'
                }
                autoComplete="new-password"
              />
              {editTarget && (
                <p className="text-xs text-h-tertiary mt-1">
                  Si no escribes nada, la contraseña actual se conserva.
                </p>
              )}
            </div>
            <div>
              <label
                className="
                  block text-xs font-bold text-h-tertiary
                  uppercase tracking-wide mb-1.5
                "
              >
                Rol *
              </label>
              <HSelect
                value={form.rol}
                onChange={v => {
                  setForm(f => ({ ...f, rol: v as Rol }))
                  setFormError(null)
                }}
                options={rolOpts}
                className="w-full"
              />
              {form.rol === 'operador_coordinador' && (
                <p
                  className="text-xs mt-1.5 font-semibold"
                  style={{ color: 'var(--h-teal-hover)' }}
                >
                  El Operador Coordinador tiene los mismos accesos que el Operador.
                  Sus permisos adicionales se configurarán próximamente.
                </p>
              )}
            </div>
            {formError && (
              <p
                className="text-sm px-3 py-2 rounded-lg border"
                style={{
                  background: 'var(--h-sem-danger-bg)',
                  borderColor: 'var(--h-sem-danger-border)',
                  color: 'var(--h-sem-danger-text)',
                }}
              >
                {formError}
              </p>
            )}
            <div className="flex gap-3 pt-2">
              <button
                type="button" onClick={cerrar}
                className="
                  flex-1 py-2.5 rounded-xl border border-h-visible
                  text-h-secondary font-bold transition-colors duration-150
                "
                onMouseEnter={e =>
                  (e.currentTarget.style.background = 'var(--h-bg-highlight)')
                }
                onMouseLeave={e =>
                  (e.currentTarget.style.background = 'transparent')
                }
              >
                Cancelar
              </button>
              <button
                type="submit" disabled={saving}
                className="flex-1 py-2.5 rounded-xl text-white font-bold disabled:opacity-50"
                style={{ background: 'var(--h-teal-rest)' }}
                onMouseEnter={e =>
                  (e.currentTarget.style.background = 'var(--h-teal-hover)')
                }
                onMouseLeave={e =>
                  (e.currentTarget.style.background = 'var(--h-teal-rest)')
                }
              >
                {saving ? 'Guardando...' : editTarget ? 'Guardar' : 'Crear'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Modal desactivar — dos pasos con TOTP */}
      {delTarget && (
        <Modal title="Desactivar usuario" onClose={cerrar} size="sm">
          {deleteStep === 'confirm' ? (
            <div className="text-center">
              <div
                className="
                  w-14 h-14 rounded-full flex items-center
                  justify-center mx-auto mb-4
                "
                style={{ background: 'var(--h-sem-danger-bg)' }}
              >
                <Archive size={24} style={{ color: 'var(--h-sem-danger-text)' }} />
              </div>
              <p className="font-bold text-h-primary mb-1">
                ¿Desactivar este usuario?
              </p>
              <p className="text-h-secondary text-sm mb-3">
                <strong>{delTarget.nombre}</strong> ({delTarget.email}) no podrá volver a
                iniciar sesión. Su historial se conserva y puede reactivarse cuando quieras.
              </p>
              {userHas2FA === false ? (
                <div
                  className="rounded-xl p-4 text-left border"
                  style={{
                    background: 'var(--h-sem-warning-bg)',
                    borderColor: 'var(--h-sem-warning-border)',
                  }}
                >
                  <div className="flex items-start gap-2">
                    <ShieldAlert
                      size={16}
                      className="mt-0.5 flex-shrink-0"
                      style={{ color: 'var(--h-sem-warning-text)' }}
                    />
                    <div>
                      <p
                        className="font-bold text-xs"
                        style={{ color: 'var(--h-sem-warning-text)' }}
                      >
                        2FA requerido
                      </p>
                      <p
                        className="text-xs mt-0.5"
                        style={{ color: 'var(--h-sem-warning-text)' }}
                      >
                        Activa la verificación en dos pasos para desactivar usuarios.
                      </p>
                    </div>
                  </div>
                  <Link
                    to="/seguridad" onClick={cerrar}
                    className="
                      mt-3 flex items-center justify-center gap-1.5
                      text-white text-xs font-bold py-2 rounded-lg
                      transition-colors
                    "
                    style={{ background: 'var(--h-sem-warning-text)' }}
                  >
                    Activar 2FA ahora
                  </Link>
                </div>
              ) : (
                <>
                  <p className="text-h-tertiary text-xs mb-5">
                    Necesitarás tu código TOTP para confirmar.
                  </p>
                  {formError && (
                    <p
                      className="text-xs px-3 py-2 rounded-lg border mb-4"
                      style={{
                        background: 'var(--h-sem-danger-bg)',
                        borderColor: 'var(--h-sem-danger-border)',
                        color: 'var(--h-sem-danger-text)',
                      }}
                    >
                      {formError}
                    </p>
                  )}
                  <div className="flex gap-3">
                    <button
                      onClick={cerrar}
                      className="
                        flex-1 py-2.5 rounded-xl border border-h-visible
                        text-h-secondary font-bold transition-colors duration-150
                      "
                      onMouseEnter={e =>
                        (e.currentTarget.style.background = 'var(--h-bg-highlight)')
                      }
                      onMouseLeave={e =>
                        (e.currentTarget.style.background = 'transparent')
                      }
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={() => setDeleteStep('totp')}
                      className="flex-1 py-2.5 rounded-xl text-white font-bold"
                      style={{ background: 'var(--h-sem-danger-text)' }}
                      onMouseEnter={e => (e.currentTarget.style.opacity = '0.85')}
                      onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
                    >
                      Continuar
                    </button>
                  </div>
                </>
              )}
            </div>
          ) : (
            <div>
              <p className="text-h-secondary text-sm mb-5 text-center">
                Ingresa tu código TOTP para confirmar la desactivación de
                <strong> {delTarget.nombre}</strong>.
              </p>
              <input
                type="text" inputMode="numeric" maxLength={6} value={deleteTotp}
                onChange={e => {
                  setDeleteTotp(e.target.value.replace(/\D/g, ''))
                  setFormError(null)
                }}
                className="
                  w-full px-4 py-4 rounded-xl border-2 text-h-primary
                  text-4xl text-center font-black tracking-[0.7em]
                  focus:outline-none bg-h-elevated mb-4
                  placeholder:text-h-tertiary
                "
                style={{ borderColor: 'var(--h-border-visible)' }}
                placeholder="000000" autoFocus
              />
              {formError && (
                <p
                  className="text-xs px-3 py-2 rounded-lg border font-semibold mb-4"
                  style={{
                    background: 'var(--h-sem-danger-bg)',
                    borderColor: 'var(--h-sem-danger-border)',
                    color: 'var(--h-sem-danger-text)',
                  }}
                >
                  {formError}
                </p>
              )}
              <div className="flex gap-3">
                <button
                  onClick={() => { setDeleteStep('confirm'); setFormError(null) }}
                  className="
                    flex-1 py-2.5 rounded-xl border border-h-visible
                    text-h-secondary font-bold transition-colors duration-150
                  "
                  onMouseEnter={e =>
                    (e.currentTarget.style.background = 'var(--h-bg-highlight)')
                  }
                  onMouseLeave={e =>
                    (e.currentTarget.style.background = 'transparent')
                  }
                >
                  \u2190 Volver
                </button>
                <button
                  onClick={handleDelete}
                  disabled={deleting || deleteTotp.length !== 6}
                  className="flex-1 py-2.5 rounded-xl text-white font-bold disabled:opacity-50"
                  style={{ background: 'var(--h-sem-danger-text)' }}
                  onMouseEnter={e => (e.currentTarget.style.opacity = '0.85')}
                  onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
                >
                  {deleting ? 'Desactivando...' : 'Desactivar'}
                </button>
              </div>
            </div>
          )}
        </Modal>
      )}

      {/* Modal reactivar */}
      {reactivarTarget && (
        <Modal title="Reactivar usuario" onClose={cerrar} size="sm">
          <div className="text-center">
            <div
              className="
                w-14 h-14 rounded-full flex items-center
                justify-center mx-auto mb-4
              "
              style={{ background: 'var(--h-sem-success-bg)' }}
            >
              <ArchiveRestore
                size={24}
                style={{ color: 'var(--h-sem-success-text)' }}
              />
            </div>
            <p className="font-bold text-h-primary mb-1">
              ¿Reactivar este usuario?
            </p>
            <p className="text-h-secondary text-sm mb-5">
              <strong>{reactivarTarget.nombre}</strong> ({reactivarTarget.email})
              podrá volver a iniciar sesión con sus credenciales actuales.
            </p>
            {formError && (
              <p
                className="text-xs px-3 py-2 rounded-lg border mb-4"
                style={{
                  background: 'var(--h-sem-danger-bg)',
                  borderColor: 'var(--h-sem-danger-border)',
                  color: 'var(--h-sem-danger-text)',
                }}
              >
                {formError}
              </p>
            )}
            <div className="flex gap-3">
              <button
                onClick={cerrar}
                className="
                  flex-1 py-2.5 rounded-xl border border-h-visible
                  text-h-secondary font-bold transition-colors duration-150
                "
                onMouseEnter={e =>
                  (e.currentTarget.style.background = 'var(--h-bg-highlight)')
                }
                onMouseLeave={e =>
                  (e.currentTarget.style.background = 'transparent')
                }
              >
                Cancelar
              </button>
              <button
                onClick={handleReactivar} disabled={deleting}
                className="flex-1 py-2.5 rounded-xl text-white font-bold disabled:opacity-50"
                style={{ background: 'var(--h-sem-success-text)' }}
                onMouseEnter={e => (e.currentTarget.style.opacity = '0.85')}
                onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
              >
                {deleting ? 'Reactivando...' : 'Reactivar'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
