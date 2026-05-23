import { useEffect, useState, useCallback } from 'react'
import { Tag, Plus, Pencil, Trash2, CheckCircle } from 'lucide-react'
import { api } from '../api/client'
import { useAuthStore } from '../store/auth'
import type { CategoriaResponse, CategoriaCreate, PaginatedResponse } from '../types/api'
import { Modal } from '../components/ui/Modal'

const PAGE_SIZE = 20

export function Categorias() {
  const { user } = useAuthStore()
  const puedeEscribir = user?.rol === 'admin' || user?.rol === 'operador'
  const puedeEliminar = user?.rol === 'admin'

  const [categorias, setCategorias] = useState<CategoriaResponse[]>([])
  const [total, setTotal]           = useState(0)
  const [page, setPage]             = useState(0)
  const [loading, setLoading]       = useState(true)
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

  const inputCls = `w-full px-3 py-2.5 rounded-lg border border-slate-200 text-slate-900 text-sm
    focus:outline-none focus:ring-2 focus:ring-teal-500 bg-slate-50 focus:bg-white
    placeholder:text-slate-400 transition-all`
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div className="p-8 max-w-2xl mx-auto">
      {toast && (
        <div className="fixed top-6 right-6 z-50 flex items-center gap-2 bg-teal-600
                        text-white px-4 py-3 rounded-xl shadow-lg text-sm font-semibold">
          <CheckCircle size={16} />{toast}
        </div>
      )}

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-black text-slate-900">Categorias</h1>
          <p className="text-slate-500 text-sm mt-0.5">{total} categorias registradas</p>
        </div>
        {puedeEscribir && (
          <button onClick={abrirCrear}
            className="flex items-center gap-2 bg-teal-600 hover:bg-teal-700 text-white
                       font-bold px-4 py-2.5 rounded-xl text-sm transition-colors">
            <Plus size={16} /> Nueva categoria
          </button>
        )}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              <th className="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide">Nombre</th>
              {puedeEscribir && (
                <th className="text-center px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide">Acciones</th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={i}><td className="px-4 py-3" colSpan={puedeEscribir ? 2 : 1}>
                  <div className="skeleton h-4 w-48 rounded" />
                </td></tr>
              ))
            ) : categorias.length === 0 ? (
              <tr><td colSpan={puedeEscribir ? 2 : 1} className="text-center py-16 text-slate-400">
                <Tag size={32} className="mx-auto mb-2 opacity-30" />
                <p className="font-semibold">Sin categorias registradas</p>
              </td></tr>
            ) : categorias.map(c => (
              <tr key={c.id} className="hover:bg-slate-50 transition-colors">
                <td className="px-4 py-3 font-semibold text-slate-900">{c.nombre}</td>
                {puedeEscribir && (
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-center gap-2">
                      <button onClick={() => abrirEditar(c)}
                        className="p-1.5 rounded-lg text-slate-400 hover:bg-teal-50
                                   hover:text-teal-600 transition-colors">
                        <Pencil size={14} />
                      </button>
                      {puedeEliminar && (
                        <button onClick={() => { setDelTarget(c); setFormError(null) }}
                          className="p-1.5 rounded-lg text-slate-400 hover:bg-rose-50
                                     hover:text-rose-600 transition-colors">
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </td>
                )}
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

      {/* Modal crear/editar */}
      {(showCrear || editTarget) && (
        <Modal title={editTarget ? 'Editar categoria' : 'Nueva categoria'} onClose={cerrar} size="sm">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">
                Nombre *
              </label>
              <input type="text" required value={nombre}
                onChange={e => { setNombre(e.target.value); setFormError(null) }}
                className={inputCls} placeholder="Ej: Protección personal" autoFocus />
            </div>
            {formError && (
              <p className="text-rose-600 text-sm bg-rose-50 border border-rose-200
                            px-3 py-2 rounded-lg font-semibold">{formError}</p>
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

      {/* Modal eliminar */}
      {delTarget && (
        <Modal title="Eliminar categoria" onClose={cerrar} size="sm">
          <div className="text-center">
            <div className="w-14 h-14 bg-rose-100 rounded-full flex items-center
                            justify-center mx-auto mb-4">
              <Trash2 size={24} className="text-rose-600" />
            </div>
            <p className="font-bold text-slate-900 mb-1">¿Eliminar esta categoria?</p>
            <p className="text-slate-500 text-sm mb-6">
              <strong>{delTarget.nombre}</strong> será eliminada permanentemente.
            </p>
            {formError && (
              <p className="text-rose-600 text-xs bg-rose-50 border border-rose-200
                            px-3 py-2 rounded-lg font-semibold mb-4">{formError}</p>
            )}
            <div className="flex gap-3">
              <button onClick={cerrar}
                className="flex-1 py-2.5 rounded-xl border border-slate-200
                           text-slate-600 font-bold hover:bg-slate-50">Cancelar</button>
              <button onClick={handleDelete} disabled={deleting}
                className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700
                           text-white font-bold disabled:opacity-50">
                {deleting ? 'Eliminando...' : 'Eliminar'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
