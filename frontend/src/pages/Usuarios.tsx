import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import {
  Users, Plus, Pencil, Archive, ArchiveRestore, CheckCircle,
  ShieldOff, Shield, ShieldAlert
} from 'lucide-react'
import { api } from '../api/client'
import type { UsuarioMe, PaginatedResponse } from '../types/api'
import { Modal } from '../components/ui/Modal'
import { Badge } from '../components/ui/Badge'

const PAGE_SIZE = 20
const ROLES = [
  'admin', 'operador_coordinador', 'operador', 'visor', 'docente',
] as const
type Rol = typeof ROLES[number]

const ROL_LABEL: Record<Rol, string> = {
  admin: 'Administrador',
  operador_coordinador: 'Op. Coordinador',
  operador: 'Operador',
  visor: 'Visor',
  docente: 'Docente',
}

const ROL_VARIANT: Record<Rol, 'danger' | 'warning' | 'info' | 'success'> = {
  admin: 'danger',
  operador_coordinador: 'warning',
  operador: 'warning',
  visor: 'info',
  docente: 'success',
}

interface FormState {
  nombre: string
  email: string
  password: string
  rol: Rol
}

const FORM_INICIAL: FormState = { nombre: '', email: '', password: '', rol: 'visor' }

/**
 * Extrae un mensaje legible desde cualquier estructura de error de Axios.
 *
 * FastAPI puede devolver:
 * - string: HTTPException { detail: "mensaje" }
 * - array:  Pydantic 422 { detail: [{loc, msg, type}, ...] }
 *
 * En ambos casos devolvemos algo que se pueda mostrar en la UI.
 */
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
  const [usuarios, setUsuarios] = useState<UsuarioMe[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(true)
  const [mostrarInactivos, setMostrar] = useState(false)
  const [showCrear, setShowCrear] = useState(false)
  const [editTarget, setEditTarget] = useState<UsuarioMe | null>(null)
  const [delTarget, setDelTarget] = useState<UsuarioMe | null>(null)
  const [reactivarTarget, setReactivar] = useState<UsuarioMe | null>(null)
  const [form, setForm] = useState<FormState>(FORM_INICIAL)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [deleteStep, setDeleteStep] = useState<'confirm' | 'totp'>('confirm')
  const [deleteTotp, setDeleteTotp] = useState('')
  const [userHas2FA, setUserHas2FA] = useState<boolean | null>(null)

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
    } catch {
      setUsuarios([]); setTotal(0)
    } finally {
      setLoading(false)
    }
  }, [])

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

  function handleField(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) {
    setForm(f => ({ ...f, [e.target.name]: e.target.value })); setFormError(null)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setFormError(null)
    if (!editTarget && form.password.length < 8) {
      setFormError('La contraseña debe tener al menos 8 caracteres.'); return
    }
    if (editTarget && form.password && form.password.length < 8) {
      setFormError('La contraseña nueva debe tener al menos 8 caracteres.'); return
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
    if (!confirm(`¿Desactivar el 2FA de ${u.nombre}? Tendrá que configurarlo de nuevo.`)) return
    try {
      await api.post(`/usuarios/${u.id}/reset-2fa`)
      showToast(`2FA desactivado para ${u.nombre}`)
      load(page * PAGE_SIZE, mostrarInactivos)
    } catch { showToast('Error al desactivar el 2FA.') }
  }

  const inputCls = `w-full px-3 py-2.5 rounded-lg border border-slate-200 text-slate-900 text-sm
    focus:outline-none focus:ring-2 focus:ring-teal-500 bg-slate-50 focus:bg-white
    placeholder:text-slate-400 transition-all`
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div className="p-8 max-w-5xl mx-auto">
      {toast && (
        <div className="fixed top-6 right-6 z-50 flex items-center gap-2 bg-teal-600
                        text-white px-4 py-3 rounded-xl shadow-lg text-sm font-semibold">
          <CheckCircle size={16} />{toast}
        </div>
      )}

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-black text-slate-900">Usuarios</h1>
          <p className="text-slate-500 text-sm mt-0.5">
            {total} {mostrarInactivos ? 'usuarios (incluye inactivos)' : 'usuarios activos'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox" checked={mostrarInactivos}
              onChange={e => { setMostrar(e.target.checked); setPage(0) }}
              className="w-4 h-4 rounded accent-teal-600"
            />
            <span className="text-sm font-semibold text-slate-600">Mostrar inactivos</span>
          </label>
          <button onClick={abrirCrear}
            className="flex items-center gap-2 bg-teal-600 hover:bg-teal-700 text-white
                       font-bold px-4 py-2.5 rounded-xl text-sm transition-colors">
            <Plus size={16} /> Nuevo usuario
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              {['Nombre', 'Email', 'Rol', 'Estado', '2FA', 'Acciones'].map(h => (
                <th key={h}
                  className="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i}>
                  {Array.from({ length: 6 }).map((__, j) => (
                    <td key={j} className="px-4 py-3">
                      <div className="skeleton h-4 rounded w-24" />
                    </td>
                  ))}
                </tr>
              ))
            ) : usuarios.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center py-16 text-slate-400">
                  <Users size={32} className="mx-auto mb-2 opacity-30" />
                  <p className="font-semibold">Sin usuarios registrados</p>
                </td>
              </tr>
            ) : usuarios.map(u => (
              <tr key={u.id}
                className={`hover:bg-slate-50 transition-colors ${u.activo ? '' : 'opacity-60'}`}>
                <td className="px-4 py-3 font-semibold text-slate-900">{u.nombre}</td>
                <td className="px-4 py-3 text-slate-500">{u.email}</td>
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
                    ? <Badge variant="success"><Shield size={11} className="inline mr-1" />Activo</Badge>
                    : <Badge variant="warning">Inactivo</Badge>
                  }
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1">
                    {u.activo ? (
                      <>
                        <button onClick={() => abrirEditar(u)}
                          className="p-1.5 rounded-lg text-slate-400 hover:bg-teal-50
                                     hover:text-teal-600 transition-colors" title="Editar">
                          <Pencil size={14} />
                        </button>
                        {u.totp_habilitado && (
                          <button onClick={() => handleReset2FA(u)}
                            className="p-1.5 rounded-lg text-slate-400 hover:bg-amber-50
                                       hover:text-amber-600 transition-colors" title="Desactivar 2FA">
                            <ShieldOff size={14} />
                          </button>
                        )}
                        <button onClick={() => { setDelTarget(u); setFormError(null) }}
                          className="p-1.5 rounded-lg text-slate-400 hover:bg-rose-50
                                     hover:text-rose-600 transition-colors" title="Desactivar usuario">
                          <Archive size={14} />
                        </button>
                      </>
                    ) : (
                      <button onClick={() => { setReactivar(u); setFormError(null) }}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg
                                   bg-emerald-50 hover:bg-emerald-100 text-emerald-700
                                   text-xs font-bold transition-colors" title="Reactivar usuario">
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
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200">
            <p className="text-xs text-slate-500">Página {page + 1} de {totalPages}</p>
            <div className="flex gap-1">
              <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
                className="px-3 py-1 text-xs rounded-lg border border-slate-200
                           disabled:opacity-40 hover:bg-slate-50">←</button>
              <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="px-3 py-1 text-xs rounded-lg border border-slate-200
                           disabled:opacity-40 hover:bg-slate-50">→</button>
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
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">
                Nombre *
              </label>
              <input type="text" name="nombre" required value={form.nombre}
                onChange={handleField} className={inputCls}
                placeholder="Ej: María González" autoFocus />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">
                Email *
              </label>
              <input type="email" name="email" required value={form.email}
                onChange={handleField} className={inputCls}
                placeholder="usuario@duoc.cl" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">
                {editTarget ? 'Nueva contraseña' : 'Contraseña *'}
              </label>
              <input type="password" name="password"
                required={!editTarget}
                value={form.password}
                onChange={handleField}
                className={inputCls}
                placeholder={editTarget ? 'Dejar vacío para no cambiar' : 'Mínimo 8 caracteres'}
                autoComplete="new-password" />
              {editTarget && (
                <p className="text-xs text-slate-400 mt-1">
                  Si no escribes nada, la contraseña actual se conserva.
                </p>
              )}
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">
                Rol *
              </label>
              <select name="rol" value={form.rol} onChange={handleField}
                className={inputCls}>
                {ROLES.map(r => (
                  <option key={r} value={r}>{ROL_LABEL[r]}</option>
                ))}
              </select>
              {form.rol === 'operador_coordinador' && (
                <p className="text-xs text-teal-600 mt-1.5 font-semibold">
                  El Operador Coordinador tiene los mismos accesos que el Operador.
                  Sus permisos adicionales se configurarán próximamente.
                </p>
              )}
              {form.rol === 'docente' && (
                <p className="text-xs text-teal-600 mt-1.5 font-semibold">
                  Los docentes solo pueden crear solicitudes de retiro de insumos.
                </p>
              )}
            </div>
            {formError && (
              <p className="text-rose-600 text-sm bg-rose-50 border border-rose-200
                            px-3 py-2 rounded-lg">{formError}</p>
            )}
            <div className="flex gap-3 pt-2">
              <button type="button" onClick={cerrar}
                className="flex-1 py-2.5 rounded-xl border border-slate-200
                           text-slate-600 font-bold hover:bg-slate-50">Cancelar</button>
              <button type="submit" disabled={saving}
                className="flex-1 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700
                           text-white font-bold disabled:opacity-50">
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
              <div className="w-14 h-14 bg-rose-100 rounded-full flex items-center
                              justify-center mx-auto mb-4">
                <Archive size={24} className="text-rose-600" />
              </div>
              <p className="font-bold text-slate-900 mb-1">¿Desactivar este usuario?</p>
              <p className="text-slate-500 text-sm mb-3">
                <strong>{delTarget.nombre}</strong> ({delTarget.email}) no podrá
                iniciar sesión. Su historial se conserva y puede reactivarse cuando quieras.
              </p>
              {userHas2FA === false ? (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-left">
                  <div className="flex items-start gap-2">
                    <ShieldAlert size={16} className="text-amber-600 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-amber-800 font-bold text-xs">2FA requerido</p>
                      <p className="text-amber-700 text-xs mt-0.5">
                        Activa la verificación en dos pasos para desactivar usuarios.
                      </p>
                    </div>
                  </div>
                  <Link to="/seguridad" onClick={cerrar}
                    className="mt-3 flex items-center justify-center gap-1.5
                               bg-amber-600 hover:bg-amber-700 text-white text-xs
                               font-bold py-2 rounded-lg transition-colors">
                    Activar 2FA ahora
                  </Link>
                </div>
              ) : (
                <>
                  <p className="text-slate-400 text-xs mb-5">
                    Necesitarás tu código TOTP para confirmar.
                  </p>
                  {formError && (
                    <p className="text-rose-600 text-xs bg-rose-50 border border-rose-200
                                  px-3 py-2 rounded-lg mb-4">{formError}</p>
                  )}
                  <div className="flex gap-3">
                    <button onClick={cerrar}
                      className="flex-1 py-2.5 rounded-xl border border-slate-200
                                 text-slate-600 font-bold hover:bg-slate-50">Cancelar</button>
                    <button onClick={() => setDeleteStep('totp')}
                      className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700
                                 text-white font-bold">Continuar</button>
                  </div>
                </>
              )}
            </div>
          ) : (
            <div>
              <p className="text-slate-600 text-sm mb-5 text-center">
                Ingresa tu código TOTP para confirmar la desactivación de
                <strong> {delTarget.nombre}</strong>.
              </p>
              <input
                type="text" inputMode="numeric" maxLength={6} value={deleteTotp}
                onChange={e => {
                  setDeleteTotp(e.target.value.replace(/\D/g, '')); setFormError(null)
                }}
                className="w-full px-4 py-4 rounded-xl border-2 border-slate-200
                           text-slate-900 text-4xl text-center font-black tracking-[0.7em]
                           focus:outline-none focus:border-rose-400 bg-slate-50 mb-4
                           placeholder:text-slate-200"
                placeholder="000000" autoFocus
              />
              {formError && (
                <p className="text-rose-600 text-xs bg-rose-50 border border-rose-200
                              px-3 py-2 rounded-lg font-semibold mb-4">{formError}</p>
              )}
              <div className="flex gap-3">
                <button onClick={() => { setDeleteStep('confirm'); setFormError(null) }}
                  className="flex-1 py-2.5 rounded-xl border border-slate-200
                             text-slate-600 font-bold hover:bg-slate-50">← Volver</button>
                <button onClick={handleDelete}
                  disabled={deleting || deleteTotp.length !== 6}
                  className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700
                             text-white font-bold disabled:opacity-50">
                  {deleting ? 'Desactivando...' : 'Desactivar'}
                </button>
              </div>
            </div>
          )}
        </Modal>
      )}

      {/* Modal reactivar — sin TOTP */}
      {reactivarTarget && (
        <Modal title="Reactivar usuario" onClose={cerrar} size="sm">
          <div className="text-center">
            <div className="w-14 h-14 bg-emerald-100 rounded-full flex items-center
                            justify-center mx-auto mb-4">
              <ArchiveRestore size={24} className="text-emerald-600" />
            </div>
            <p className="font-bold text-slate-900 mb-1">¿Reactivar este usuario?</p>
            <p className="text-slate-500 text-sm mb-5">
              <strong>{reactivarTarget.nombre}</strong> ({reactivarTarget.email})
              podrá volver a iniciar sesión con sus credenciales actuales.
            </p>
            {formError && (
              <p className="text-rose-600 text-xs bg-rose-50 border border-rose-200
                            px-3 py-2 rounded-lg mb-4">{formError}</p>
            )}
            <div className="flex gap-3">
              <button onClick={cerrar}
                className="flex-1 py-2.5 rounded-xl border border-slate-200
                           text-slate-600 font-bold hover:bg-slate-50">Cancelar</button>
              <button onClick={handleReactivar} disabled={deleting}
                className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700
                           text-white font-bold disabled:opacity-50">
                {deleting ? 'Reactivando...' : 'Reactivar'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
