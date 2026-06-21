import { useEffect, useState, useCallback } from 'react'
import { Tag, Plus, Pencil, Trash2, CheckCircle } from 'lucide-react'
import { api } from '../api/client'
import { useAuthStore } from '../store/auth'
import type { CategoriaResponse, CategoriaCreate, PaginatedResponse } from '../types/api'
import { Modal } from '../components/ui/Modal'
import { TableRowSkeleton } from '../components/ui/Skeleton'

const PAGE_SIZE = 20

export function Categorias() {
  const { user } = useAuthStore()
  const puedeEscribir = user?.rol === 'admin' || user?.rol === 'operador'
  const puedeEliminar = user?.rol === 'admin'

  const [categorias, setCategorias] = useState<CategoriaResponse[]>([])
  const [total, setTotal]           = useState(0)
  const [page, setPage]             = useState(0)
  const [loading, setLoading]       = useState(true)
  const [hoveredId, setHoveredId]   = useState<number | null>(null)
  const [editTarget, setEditTarget] = useState<CategoriaResponse | null>(null)
  const [showCrear, setShowCrear]   = useState(false)
  const [delTarget, setDelTarget]   = useState<CategoriaResponse | null>(null)
  const [nombre, setNombre]         = useState('')
  const [saving, setSaving]         = useState(false)
  const [deleting, setDeleting]     = useState(false)
  const [formError, setFormError]   = useState<string | null>(null)
  const [toast, setToast]           = useState<string | null>(null)

  function showToast(msg: string) {
    setToast(msg); setTimeout(() => setToast(null), 3000)
  }

  const load = useCallback(async (skip: number) => {
    setLoading(true)
    try {
      const { data } = await api.get<PaginatedResponse<CategoriaResponse>>('/categorias/', {
        params: { skip, limit: PAGE_SIZE }
      })
      setCategorias(data.data); setTotal(data.total)
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { load(page * PAGE_SIZE) }, [page, load])

  function abrirCrear() { setNombre(''); setFormError(null); setShowCrear(true) }
  function abrirEditar(c: CategoriaResponse) {
    setNombre(c.nombre); setFormError(null); setEditTarget(c)
  }
  function cerrar() {
    setShowCrear(false); setEditTarget(null); setDelTarget(null); setFormError(null)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setSaving(true); setFormError(null)
    const payload: CategoriaCreate = { nombre: nombre.trim() }
    try {
      if (editTarget) {
        await api.put(`/categorias/${editTarget.id}`, payload)
        showToast('Categoria actualizada')
      } else {
        await api.post('/categorias/', payload)
        showToast('Categoria creada')
      }
      cerrar(); load(page * PAGE_SIZE)
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })
        .response?.data?.detail
      setFormError(msg ?? 'Error al guardar.')
    } finally { setSaving(false) }
  }

  async function handleDelete() {
    if (!delTarget) return
    setDeleting(true)
    try {
      await api.delete(`/categorias/${delTarget.id}`)
      showToast('Categoria eliminada')
      cerrar(); load(page * PAGE_SIZE)
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })
        .response?.data?.detail
      setFormError(msg ?? 'Error al eliminar.')
    } finally { setDeleting(false) }
  }

  const inputCls = `w-full px-3 py-2.5 rounded-lg text-h-primary text-sm
    focus:outline-none transition-all bg-h-elevated border border-h-visible
    focus:border-h-strong placeholder:text-h-tertiary`
  const labelCls = `block text-[10px] font-semibold text-h-tertiary
    uppercase tracking-widest mb-1.5`
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const colCount = puedeEscribir ? 2 : 1

  return (
    <div className="p-8 w-full">
      {toast && (
        <div className="fixed top-6 right-6 z-50 flex items-center gap-2 px-4 py-3
                        rounded-xl shadow-lg text-sm font-semibold text-white"
          style={{ background: 'var(--h-teal-rest)' }}>
          <CheckCircle size={16} />{toast}
        </div>
      )}

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-h-primary flex items-center gap-2">
            <Tag size={22} className="text-h-accent" />
            Categorias
          </h1>
          <p className="text-h-secondary text-sm mt-0.5">
            {loading ? '...' : `${total} categorias registradas`}
          </p>
        </div>
        {puedeEscribir && (
          <button onClick={abrirCrear}
            className="flex items-center gap-2 text-white font-semibold
                       px-4 py-2.5 rounded-xl text-sm transition-colors duration-150"
            style={{ background: 'var(--h-teal-rest)' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--h-teal-hover)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'var(--h-teal-rest)')}>
            <Plus size={16} /> Nueva categoria
          </button>
        )}
      </div>

      <div className="bg-h-surface rounded-xl border border-h-subtle overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[480px] text-sm">
            <thead>
              <tr className="border-b border-h-subtle bg-h-elevated">
                <th className="text-left px-4 py-3 text-[10px] font-semibold
                               text-h-tertiary uppercase tracking-widest">
                  Nombre
                </th>
                {puedeEscribir && (
                  <th className="text-center px-4 py-3 text-[10px] font-semibold
                                 text-h-tertiary uppercase tracking-widest w-28">
                    Acciones
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <TableRowSkeleton key={i} cols={colCount} />
                ))
              ) : categorias.length === 0 ? (
                <tr>
                  <td colSpan={colCount} className="text-center py-16 text-h-tertiary">
                    <Tag size={32} className="mx-auto mb-2 opacity-30" />
                    <p className="font-semibold text-h-secondary">Sin categorias registradas</p>
                  </td>
                </tr>
              ) : categorias.map(c => {
                const isHovered = hoveredId === c.id
                return (
                  <tr key={c.id}
                    onMouseEnter={() => setHoveredId(c.id)}
                    onMouseLeave={() => setHoveredId(null)}
                    className={`
                      border-b border-h-subtle last:border-0 transition-colors duration-150
                      ${isHovered ? 'bg-h-elevated' : ''}
                    `}
                  >
                    <td className="px-4 py-3 font-medium text-h-primary">{c.nombre}</td>
                    {puedeEscribir && (
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-1">
                          <button onClick={() => abrirEditar(c)}
                            className="p-1.5 rounded-lg text-h-tertiary transition-colors"
                            onMouseEnter={e => {
                              e.currentTarget.style.background = 'var(--h-bg-highlight)'
                              e.currentTarget.style.color = 'var(--h-teal-hover)'
                            }}
                            onMouseLeave={e => {
                              e.currentTarget.style.background = ''
                              e.currentTarget.style.color = ''
                            }}>
                            <Pencil size={14} />
                          </button>
                          {puedeEliminar && (
                            <button onClick={() => { setDelTarget(c); setFormError(null) }}
                              className="p-1.5 rounded-lg text-h-tertiary transition-colors"
                              onMouseEnter={e => {
                                e.currentTarget.style.background = 'var(--h-sem-danger-bg)'
                                e.currentTarget.style.color = 'var(--h-sem-danger-text)'
                              }}
                              onMouseLeave={e => {
                                e.currentTarget.style.background = ''
                                e.currentTarget.style.color = ''
                              }}>
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {!loading && totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-h-subtle">
            <p className="text-xs text-h-tertiary">
              Pagina {page + 1} de {totalPages}
            </p>
            <div className="flex gap-1">
              <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
                className="px-3 py-1 text-xs rounded-lg border border-h-subtle
                           text-h-secondary disabled:opacity-40 transition-colors"
                style={{ background: 'var(--h-bg-elevated)' }}
                onMouseEnter={e => {
                  if (page !== 0) e.currentTarget.style.background = 'var(--h-bg-highlight)'
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = 'var(--h-bg-elevated)'
                }}>
                ←
              </button>
              <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="px-3 py-1 text-xs rounded-lg border border-h-subtle
                           text-h-secondary disabled:opacity-40 transition-colors"
                style={{ background: 'var(--h-bg-elevated)' }}
                onMouseEnter={e => {
                  if (page < totalPages - 1) {
                    e.currentTarget.style.background = 'var(--h-bg-highlight)'
                  }
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = 'var(--h-bg-elevated)'
                }}>
                →
              </button>
            </div>
          </div>
        )}
      </div>

      {(showCrear || editTarget) && (
        <Modal title={editTarget ? 'Editar categoria' : 'Nueva categoria'} onClose={cerrar} size="sm">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className={labelCls}>Nombre *</label>
              <input type="text" required value={nombre}
                onChange={e => { setNombre(e.target.value); setFormError(null) }}
                className={inputCls} placeholder="Ej: Proteccion personal" autoFocus />
            </div>
            {formError && (
              <p className="text-sm px-3 py-2 rounded-lg font-semibold"
                style={{
                  color: 'var(--h-sem-danger-text)',
                  background: 'var(--h-sem-danger-bg)',
                  border: '1px solid var(--h-sem-danger-border)',
                }}>
                {formError}
              </p>
            )}
            <div className="flex gap-3 pt-2">
              <button type="button" onClick={cerrar}
                className="flex-1 py-2.5 rounded-xl border border-h-subtle
                           text-h-secondary font-semibold transition-colors"
                style={{ background: 'var(--h-bg-elevated)' }}
                onMouseEnter={e => {
                  e.currentTarget.style.background = 'var(--h-bg-highlight)'
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = 'var(--h-bg-elevated)'
                }}>
                Cancelar
              </button>
              <button type="submit" disabled={saving}
                className="flex-1 py-2.5 rounded-xl text-white font-semibold
                           disabled:opacity-50 transition-colors"
                style={{ background: 'var(--h-teal-rest)' }}
                onMouseEnter={e => {
                  if (!saving) e.currentTarget.style.background = 'var(--h-teal-hover)'
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = 'var(--h-teal-rest)'
                }}>
                {saving ? 'Guardando...' : editTarget ? 'Guardar' : 'Crear'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {delTarget && (
        <Modal title="Eliminar categoria" onClose={cerrar} size="sm">
          <div className="text-center">
            <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4"
              style={{ background: 'var(--h-sem-danger-bg)' }}>
              <Trash2 size={24} style={{ color: 'var(--h-sem-danger-text)' }} />
            </div>
            <p className="font-bold text-h-primary mb-1">Eliminar esta categoria?</p>
            <p className="text-h-secondary text-sm mb-6">
              <strong className="text-h-primary">{delTarget.nombre}</strong>{' '}
              sera eliminada permanentemente.
            </p>
            {formError && (
              <p className="text-xs px-3 py-2 rounded-lg font-semibold mb-4"
                style={{
                  color: 'var(--h-sem-danger-text)',
                  background: 'var(--h-sem-danger-bg)',
                  border: '1px solid var(--h-sem-danger-border)',
                }}>
                {formError}
              </p>
            )}
            <div className="flex gap-3">
              <button onClick={cerrar}
                className="flex-1 py-2.5 rounded-xl border border-h-subtle
                           text-h-secondary font-semibold transition-colors"
                style={{ background: 'var(--h-bg-elevated)' }}
                onMouseEnter={e => {
                  e.currentTarget.style.background = 'var(--h-bg-highlight)'
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = 'var(--h-bg-elevated)'
                }}>
                Cancelar
              </button>
              <button onClick={handleDelete} disabled={deleting}
                className="flex-1 py-2.5 rounded-xl text-white font-semibold
                           disabled:opacity-50 transition-colors"
                style={{ background: 'var(--h-sem-danger-border)' }}
                onMouseEnter={e => {
                  if (!deleting) e.currentTarget.style.opacity = '0.9'
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.opacity = ''
                }}>
                {deleting ? 'Eliminando...' : 'Eliminar'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
