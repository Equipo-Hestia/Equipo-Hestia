import { useEffect, useState, useCallback, useRef } from 'react'
import {
  Building2, Plus, Pencil, Archive,
  ArchiveRestore, CheckCircle, ExternalLink,
  X, Phone, Mail, FileText
} from 'lucide-react'
import { api } from '../api/client'
import { useAuthStore } from '../store/auth'
import type { ProveedorResponse, PaginatedResponse } from '../types/api'
import { Modal } from '../components/ui/Modal'
import { TableRowSkeleton } from '../components/ui/Skeleton'
import { Badge } from '../components/ui/Badge'

const PAGE_SIZE = 20

interface FormState {
  nombre:          string
  rut:             string
  contacto_nombre: string
  contacto_email:  string
  telefono:        string
  url_seneg:       string
  notas:           string
}

const FORM_VACIO: FormState = {
  nombre: '', rut: '', contacto_nombre: '',
  contacto_email: '', telefono: '', url_seneg: '', notas: '',
}

function proveedorAForm(p: ProveedorResponse): FormState {
  return {
    nombre:          p.nombre,
    rut:             p.rut             ?? '',
    contacto_nombre: p.contacto_nombre ?? '',
    contacto_email:  p.contacto_email  ?? '',
    telefono:        p.telefono        ?? '',
    url_seneg:       p.url_seneg       ?? '',
    notas:           p.notas           ?? '',
  }
}

export function Proveedores() {
  const { user } = useAuthStore()
  const puedeEscribir = user?.rol === 'admin' || user?.rol === 'operador_coordinador'
  const puedeEliminar = user?.rol === 'admin'

  const [proveedores, setProveedores] = useState<ProveedorResponse[]>([])
  const [total, setTotal]             = useState(0)
  const [page, setPage]               = useState(0)
  const [loading, setLoading]         = useState(true)
  const [busqueda, setBusqueda]       = useState('')
  const [mostrarInactivos, setMostrar] = useState(false)

  const [editTarget,      setEditTarget]      = useState<ProveedorResponse | null>(null)
  const [showCrear,       setShowCrear]       = useState(false)
  const [deleteTarget,    setDeleteTarget]    = useState<ProveedorResponse | null>(null)
  const [reactivarTarget, setReactivar]       = useState<ProveedorResponse | null>(null)
  const [form,            setForm]            = useState<FormState>(FORM_VACIO)
  const [saving,          setSaving]          = useState(false)
  const [formError,       setFormError]       = useState<string | null>(null)
  const [deleting,        setDeleting]        = useState(false)
  const [toast,           setToast]           = useState<string | null>(null)
  const [hoveredId,       setHoveredId]       = useState<number | null>(null)

  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  function showToast(msg: string) {
    setToast(msg); setTimeout(() => setToast(null), 3000)
  }

  function goToPage(p: number) {
    setPage(p); setHoveredId(null)
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior })
  }

  const load = useCallback(async (
    skip: number, nombre: string, incluirInactivos: boolean
  ) => {
    setLoading(true)
    try {
      const params: Record<string, string | number | boolean> = {
        skip, limit: PAGE_SIZE,
      }
      if (nombre) params.nombre = nombre
      if (incluirInactivos) params.incluir_inactivos = true
      const { data } = await api.get<PaginatedResponse<ProveedorResponse>>(
        '/proveedores/', { params }
      )
      setProveedores(data.data); setTotal(data.total)
    } finally { setLoading(false) }
  }, [])

  useEffect(() => {
    load(page * PAGE_SIZE, busqueda, mostrarInactivos)
  }, [page, busqueda, mostrarInactivos, load])

  function handleBusqueda(val: string) {
    setBusqueda(val)
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => goToPage(0), 300)
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const showModal  = showCrear || editTarget !== null

  function abrirCrear()  { setForm(FORM_VACIO); setFormError(null); setShowCrear(true) }
  function abrirEditar(p: ProveedorResponse) {
    setForm(proveedorAForm(p)); setFormError(null); setEditTarget(p)
  }
  function abrirEliminar(p: ProveedorResponse) { setDeleteTarget(p); setFormError(null) }
  function abrirReactivar(p: ProveedorResponse) { setReactivar(p); setFormError(null) }
  function cerrarModal() {
    setShowCrear(false); setEditTarget(null)
    setDeleteTarget(null); setReactivar(null); setFormError(null)
  }
  function setField(k: keyof FormState, v: string) {
    setForm(f => ({ ...f, [k]: v }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setSaving(true); setFormError(null)
    const payload = {
      nombre:          form.nombre.trim(),
      rut:             form.rut.trim()             || null,
      contacto_nombre: form.contacto_nombre.trim() || null,
      contacto_email:  form.contacto_email.trim()  || null,
      telefono:        form.telefono.trim()         || null,
      url_seneg:       form.url_seneg.trim()        || null,
      notas:           form.notas.trim()            || null,
    }
    try {
      if (editTarget) {
        await api.put(`/proveedores/${editTarget.id}`, payload)
        showToast('Proveedor actualizado')
      } else {
        await api.post('/proveedores/', payload)
        showToast('Proveedor creado')
      }
      cerrarModal()
      load(page * PAGE_SIZE, busqueda, mostrarInactivos)
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })
        .response?.data?.detail
      setFormError(msg ?? 'Error al guardar.')
    } finally { setSaving(false) }
  }

  async function handleDesactivar() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await api.delete(`/proveedores/${deleteTarget.id}`)
      showToast(`'${deleteTarget.nombre}' desactivado`)
      cerrarModal()
      load(page * PAGE_SIZE, busqueda, mostrarInactivos)
    } catch (err: unknown) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const detail = (err as any)?.response?.data?.detail
      setFormError(typeof detail === 'string' ? detail : 'Error al desactivar.')
    } finally { setDeleting(false) }
  }

  async function handleReactivar() {
    if (!reactivarTarget) return
    setDeleting(true)
    try {
      await api.put(`/proveedores/${reactivarTarget.id}`, { activo: true })
      showToast(`'${reactivarTarget.nombre}' reactivado`)
      cerrarModal()
      load(page * PAGE_SIZE, busqueda, mostrarInactivos)
    } catch (err: unknown) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const detail = (err as any)?.response?.data?.detail
      setFormError(typeof detail === 'string' ? detail : 'Error al reactivar.')
    } finally { setDeleting(false) }
  }

  const inputCls = `w-full px-3 py-2.5 rounded-lg text-h-primary text-sm
    focus:outline-none transition-all bg-h-elevated border border-h-visible
    focus:border-h-strong placeholder:text-h-tertiary`
  const labelCls = `block text-[10px] font-semibold text-h-tertiary
    uppercase tracking-widest mb-1.5`

  return (
    <div className="p-8 w-full">

      {/* Toast */}
      {toast && (
        <div className="fixed top-6 right-6 z-50 flex items-center gap-2 px-4 py-3
                        rounded-xl shadow-lg text-sm font-semibold text-white"
          style={{ background: 'var(--h-teal-rest)' }}>
          <CheckCircle size={16} />{toast}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-h-primary">Proveedores</h1>
          <p className="text-h-secondary text-sm mt-0.5">
            {loading ? '…' : `${total} proveedores registrados`}
          </p>
        </div>
        {puedeEscribir && (
          <button onClick={abrirCrear}
            className="flex items-center gap-2 text-white font-semibold
                       px-4 py-2.5 rounded-xl text-sm transition-colors duration-150"
            style={{ background: 'var(--h-teal-rest)' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--h-teal-hover)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'var(--h-teal-rest)')}>
            <Plus size={16} /> Nuevo proveedor
          </button>
        )}
      </div>

      {/* Búsqueda + filtro inactivos */}
      <div className="bg-h-surface rounded-xl border border-h-subtle p-4 mb-4
                      flex items-center gap-3">
        <input
          type="text" value={busqueda}
          onChange={e => handleBusqueda(e.target.value)}
          placeholder="Buscar por nombre…"
          className={`${inputCls} flex-1`}
        />
        {puedeEliminar && (
          <label className="flex items-center gap-2 cursor-pointer select-none
                            whitespace-nowrap">
            <input type="checkbox" checked={mostrarInactivos}
              onChange={e => { setMostrar(e.target.checked); goToPage(0) }}
              className="w-4 h-4 rounded"
              style={{ accentColor: 'var(--h-teal-hover)' }} />
            <span className="text-sm font-medium text-h-secondary">Mostrar inactivos</span>
          </label>
        )}
        {busqueda && (
          <button onClick={() => handleBusqueda('')}
            className="text-h-tertiary hover:text-h-secondary transition-colors">
            <X size={16} />
          </button>
        )}
      </div>

      {/* Tabla */}
      <div className="bg-h-surface rounded-xl border border-h-subtle overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-h-subtle bg-h-elevated">
              <th className="text-left px-4 py-3 text-[10px] font-semibold
                             text-h-tertiary uppercase tracking-widest">Nombre</th>
              <th className="text-left px-4 py-3 text-[10px] font-semibold
                             text-h-tertiary uppercase tracking-widest">Contacto</th>
              <th className="text-left px-4 py-3 text-[10px] font-semibold
                             text-h-tertiary uppercase tracking-widest">SeNegocia</th>
              {puedeEscribir && <th className="w-10 px-4 py-3" aria-label="Acciones" />}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <TableRowSkeleton key={i} cols={puedeEscribir ? 4 : 3} />
              ))
            ) : proveedores.length === 0 ? (
              <tr>
                <td colSpan={puedeEscribir ? 4 : 3}
                  className="text-center py-16 text-h-tertiary">
                  <Building2 size={32} className="mx-auto mb-2 opacity-30" />
                  <p className="font-medium">Sin proveedores que mostrar</p>
                </td>
              </tr>
            ) : proveedores.map(p => {
              const isHovered = hoveredId === p.id
              return (
                <tr key={p.id}
                  onMouseEnter={() => setHoveredId(p.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  className={`border-b border-h-subtle last:border-0
                    transition-colors duration-150
                    ${isHovered ? 'bg-h-elevated' : ''}
                    ${!p.activo ? 'opacity-50' : ''}`}>

                  {/* Nombre + RUT */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-h-primary">{p.nombre}</span>
                      {!p.activo && <Badge variant="danger">Inactivo</Badge>}
                    </div>
                    {p.rut && (
                      <div className="text-[11px] text-h-tertiary font-mono mt-0.5">
                        RUT {p.rut}
                      </div>
                    )}
                  </td>

                  {/* Contacto */}
                  <td className="px-4 py-3">
                    {p.contacto_nombre && (
                      <p className="text-sm text-h-secondary">{p.contacto_nombre}</p>
                    )}
                    <div className="flex flex-col gap-0.5 mt-0.5">
                      {p.contacto_email && (
                        <a href={`mailto:${p.contacto_email}`}
                          className="flex items-center gap-1 text-[11px]
                                     text-h-tertiary hover:text-h-accent
                                     transition-colors">
                          <Mail size={10} />{p.contacto_email}
                        </a>
                      )}
                      {p.telefono && (
                        <span className="flex items-center gap-1 text-[11px] text-h-tertiary">
                          <Phone size={10} />{p.telefono}
                        </span>
                      )}
                    </div>
                  </td>

                  {/* URL SeNegocia */}
                  <td className="px-4 py-3">
                    {p.url_seneg ? (
                      <a href={p.url_seneg} target="_blank" rel="noreferrer"
                        className="flex items-center gap-1.5 text-xs font-medium
                                   transition-colors duration-150"
                        style={{ color: 'var(--h-teal-hover)' }}>
                        <ExternalLink size={11} /> Ver perfil
                      </a>
                    ) : (
                      <span className="text-h-tertiary text-xs">—</span>
                    )}
                  </td>

                  {/* Acciones en hover */}
                  {puedeEscribir && (
                    <td className="px-3 py-3 w-10">
                      <div className="flex items-center justify-end gap-1
                                      transition-opacity duration-150"
                        style={{ opacity: isHovered ? 1 : 0 }}>
                        {p.activo ? (
                          <>
                            <button onClick={() => abrirEditar(p)} title="Editar"
                              className="p-1.5 rounded-md text-h-tertiary
                                         transition-colors duration-150
                                         hover:bg-h-highlight hover:text-h-secondary">
                              <Pencil size={14} />
                            </button>
                            {puedeEliminar && (
                              <button onClick={() => abrirEliminar(p)}
                                title="Desactivar"
                                className="p-1.5 rounded-md transition-colors duration-150"
                                style={{ color: 'var(--h-text-tertiary)' }}
                                onMouseEnter={e => {
                                  const b = e.currentTarget as HTMLButtonElement
                                  b.style.background = 'var(--h-sem-danger-bg)'
                                  b.style.color = 'var(--h-sem-danger-text)'
                                }}
                                onMouseLeave={e => {
                                  const b = e.currentTarget as HTMLButtonElement
                                  b.style.background = ''
                                  b.style.color = 'var(--h-text-tertiary)'
                                }}>
                                <Archive size={14} />
                              </button>
                            )}
                          </>
                        ) : (
                          puedeEliminar && (
                            <button onClick={() => abrirReactivar(p)}
                              className="flex items-center gap-1 px-2 py-1 rounded-md
                                         text-xs font-medium transition-colors duration-150"
                              style={{
                                background: 'var(--h-sem-success-bg)',
                                color: 'var(--h-sem-success-text)',
                              }}>
                              <ArchiveRestore size={12} /> Reactivar
                            </button>
                          )
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>

        {/* Paginación simple */}
        {!loading && totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3
                          border-t border-h-subtle">
            <p className="text-xs text-h-tertiary">
              Página {page + 1} de {totalPages}
            </p>
            <div className="flex gap-1">
              <button onClick={() => goToPage(page - 1)} disabled={page === 0}
                className="px-3 py-1.5 rounded-md text-xs font-medium
                           border border-h-subtle text-h-secondary bg-h-elevated
                           hover:bg-h-highlight disabled:opacity-30
                           transition-colors duration-150">
                ← Anterior
              </button>
              <button onClick={() => goToPage(page + 1)}
                disabled={page >= totalPages - 1}
                className="px-3 py-1.5 rounded-md text-xs font-medium
                           border border-h-subtle text-h-secondary bg-h-elevated
                           hover:bg-h-highlight disabled:opacity-30
                           transition-colors duration-150">
                Siguiente →
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modal crear / editar */}
      {showModal && (
        <Modal
          title={editTarget ? 'Editar proveedor' : 'Nuevo proveedor'}
          onClose={cerrarModal} size="md">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className={labelCls}>Nombre *</label>
              <input type="text" required value={form.nombre}
                onChange={e => setField('nombre', e.target.value)}
                className={inputCls}
                placeholder="Ej: Laerdal Medical" />
            </div>
            <div>
              <label className={labelCls}>RUT</label>
              <input type="text" value={form.rut}
                onChange={e => setField('rut', e.target.value)}
                className={inputCls}
                placeholder="Ej: 76.123.456-7" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Nombre de contacto</label>
                <input type="text" value={form.contacto_nombre}
                  onChange={e => setField('contacto_nombre', e.target.value)}
                  className={inputCls} placeholder="Nombre del representante" />
              </div>
              <div>
                <label className={labelCls}>Teléfono</label>
                <input type="text" value={form.telefono}
                  onChange={e => setField('telefono', e.target.value)}
                  className={inputCls} placeholder="+56 9 1234 5678" />
              </div>
            </div>
            <div>
              <label className={labelCls}>Email de contacto</label>
              <input type="email" value={form.contacto_email}
                onChange={e => setField('contacto_email', e.target.value)}
                className={inputCls} placeholder="contacto@proveedor.cl" />
            </div>
            <div>
              <label className={labelCls}>URL SeNegocia</label>
              <input type="url" value={form.url_seneg}
                onChange={e => setField('url_seneg', e.target.value)}
                className={inputCls}
                placeholder="https://www.senegocia.com/proveedor/..." />
              <p className="text-xs text-h-tertiary mt-1">
                Perfil del proveedor en la plataforma de licitaciones DuocUC.
              </p>
            </div>
            <div>
              <label className={labelCls}>Notas</label>
              <textarea rows={3} value={form.notas}
                onChange={e => setField('notas', e.target.value)}
                className={inputCls + ' resize-none'}
                placeholder="Observaciones, condiciones de contrato, etc." />
            </div>
            {formError && (
              <p className="text-xs px-3 py-2 rounded-lg font-medium" style={{
                background: 'var(--h-sem-danger-bg)',
                color: 'var(--h-sem-danger-text)',
                border: '1px solid var(--h-sem-danger-border)',
              }}>{formError}</p>
            )}
            <div className="flex gap-3 pt-2">
              <button type="button" onClick={cerrarModal}
                className="flex-1 py-2.5 rounded-xl border border-h-subtle
                           text-h-secondary font-medium hover:bg-h-elevated
                           transition-colors duration-150">Cancelar</button>
              <button type="submit" disabled={saving}
                className="flex-1 py-2.5 rounded-xl text-white font-semibold
                           disabled:opacity-50 transition-colors duration-150"
                style={{ background: 'var(--h-teal-rest)' }}
                onMouseEnter={e => {
                  if (!saving)
                    (e.currentTarget.style.background = 'var(--h-teal-hover)')
                }}
                onMouseLeave={e => {
                  (e.currentTarget.style.background = 'var(--h-teal-rest)')
                }}>
                {saving ? 'Guardando…' : editTarget ? 'Guardar cambios' : 'Crear proveedor'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Modal desactivar */}
      {deleteTarget && (
        <Modal title="Desactivar proveedor" onClose={cerrarModal} size="sm">
          <div className="text-center">
            <div className="w-14 h-14 rounded-full flex items-center justify-center
                            mx-auto mb-4"
              style={{ background: 'var(--h-sem-danger-bg)' }}>
              <Archive size={24} style={{ color: 'var(--h-sem-danger-text)' }} />
            </div>
            <p className="font-semibold text-h-primary mb-1">
              ¿Desactivar este proveedor?
            </p>
            <p className="text-h-secondary text-sm mb-5">
              <strong>{deleteTarget.nombre}</strong> no aparecerá en los selectores
              de nuevas órdenes, pero su historial se conserva.
            </p>
            {formError && (
              <p className="text-xs px-3 py-2 rounded-lg mb-4 font-medium" style={{
                background: 'var(--h-sem-danger-bg)',
                color: 'var(--h-sem-danger-text)',
                border: '1px solid var(--h-sem-danger-border)',
              }}>{formError}</p>
            )}
            <div className="flex gap-3">
              <button onClick={cerrarModal}
                className="flex-1 py-2.5 rounded-xl border border-h-subtle
                           text-h-secondary font-medium hover:bg-h-elevated
                           transition-colors">Cancelar</button>
              <button onClick={handleDesactivar} disabled={deleting}
                className="flex-1 py-2.5 rounded-xl text-white font-semibold
                           disabled:opacity-50 transition-colors"
                style={{ background: 'var(--h-sem-danger-border)' }}>
                {deleting ? 'Desactivando…' : 'Desactivar'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Modal reactivar */}
      {reactivarTarget && (
        <Modal title="Reactivar proveedor" onClose={cerrarModal} size="sm">
          <div className="text-center">
            <div className="w-14 h-14 rounded-full flex items-center justify-center
                            mx-auto mb-4"
              style={{ background: 'var(--h-sem-success-bg)' }}>
              <ArchiveRestore size={24} style={{ color: 'var(--h-sem-success-text)' }} />
            </div>
            <p className="font-semibold text-h-primary mb-1">
              ¿Reactivar este proveedor?
            </p>
            <p className="text-h-secondary text-sm mb-5">
              <strong>{reactivarTarget.nombre}</strong> volverá a aparecer
              en los selectores de nuevas órdenes.
            </p>
            {formError && (
              <p className="text-xs px-3 py-2 rounded-lg mb-4" style={{
                background: 'var(--h-sem-danger-bg)',
                color: 'var(--h-sem-danger-text)',
                border: '1px solid var(--h-sem-danger-border)',
              }}>{formError}</p>
            )}
            <div className="flex gap-3">
              <button onClick={cerrarModal}
                className="flex-1 py-2.5 rounded-xl border border-h-subtle
                           text-h-secondary font-medium hover:bg-h-elevated
                           transition-colors">Cancelar</button>
              <button onClick={handleReactivar} disabled={deleting}
                className="flex-1 py-2.5 rounded-xl text-white font-semibold
                           disabled:opacity-50 transition-colors"
                style={{ background: 'var(--h-sem-success-border)' }}>
                {deleting ? 'Reactivando…' : 'Reactivar'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
