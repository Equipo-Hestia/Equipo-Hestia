import { useEffect, useState, useCallback } from 'react'
import {
  GraduationCap, Plus, Pencil, CheckCircle,
  ToggleLeft, ToggleRight
} from 'lucide-react'
import { api } from '../api/client'
import type {
  ClaseDocenteResponse, AsignaturaResponse, PaginatedResponse
} from '../types/api'
import { Badge } from '../components/ui/Badge'
import { Modal } from '../components/ui/Modal'
import { TableRowSkeleton } from '../components/ui/Skeleton'

// Calcula el semestre actual: meses 1-7 → X-1, meses 8-12 → X-2
function semestreActual(): string {
  const now = new Date()
  const s = now.getMonth() + 1 <= 7 ? '1' : '2'
  return `${now.getFullYear()}-${s}`
}

interface UsuarioSimple { id: number; nombre: string; rol: string }
interface FormState {
  docente_id: string
  asignatura_id: string
  seccion: string
  semestre: string
}
const VACIO: FormState = {
  docente_id: '', asignatura_id: '',
  seccion: '', semestre: semestreActual()
}

export function ClasesDocente() {
  const [clases, setClases]           = useState<ClaseDocenteResponse[]>([])
  const [loading, setLoading]         = useState(true)
  const [docentes, setDocentes]       = useState<UsuarioSimple[]>([])
  const [asignaturas, setAsignaturas] = useState<AsignaturaResponse[]>([])
  const [soloActivas, setSoloActivas] = useState(true)
  const [showModal, setShowModal]     = useState(false)
  const [editTarget, setEditTarget]   = useState<ClaseDocenteResponse | null>(null)
  const [form, setForm]               = useState<FormState>(VACIO)
  const [saving, setSaving]           = useState(false)
  const [formError, setFormError]     = useState<string | null>(null)
  const [toast, setToast]             = useState<string | null>(null)

  function showToast(msg: string) {
    setToast(msg); setTimeout(() => setToast(null), 3000)
  }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await api.get<ClaseDocenteResponse[]>('/clases-docente/', {
        params: { solo_activas: soloActivas },
      })
      setClases(data)
    } finally { setLoading(false) }
  }, [soloActivas])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    // Carga docentes y asignaturas para los selects del modal
    Promise.all([
      api.get<PaginatedResponse<UsuarioSimple>>('/usuarios/', { params: { limit: 200 } }),
      api.get<AsignaturaResponse[]>('/asignaturas/'),
    ]).then(([u, a]) => {
      setDocentes(u.data.data.filter((usr: UsuarioSimple) => usr.rol === 'docente'))
      setAsignaturas(a.data)
    })
  }, [])

  function abrirCrear() {
    setForm(VACIO); setFormError(null); setEditTarget(null); setShowModal(true)
  }
  function abrirEditar(c: ClaseDocenteResponse) {
    setForm({
      docente_id: String(c.docente_id),
      asignatura_id: String(c.asignatura_id),
      seccion: c.seccion,
      semestre: c.semestre,
    })
    setFormError(null); setEditTarget(c); setShowModal(true)
  }
  function cerrar() { setShowModal(false); setFormError(null) }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setSaving(true); setFormError(null)
    try {
      if (editTarget) {
        await api.put(`/clases-docente/${editTarget.id}`, {
          seccion: form.seccion, semestre: form.semestre,
        })
        showToast('Clase actualizada')
      } else {
        await api.post('/clases-docente/', {
          docente_id: parseInt(form.docente_id),
          asignatura_id: parseInt(form.asignatura_id),
          seccion: form.seccion,
          semestre: form.semestre,
        })
        showToast('Clase asignada')
      }
      cerrar(); load()
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })
        .response?.data?.detail
      setFormError(msg ?? 'Error al guardar.')
    } finally { setSaving(false) }
  }

  async function toggleActiva(c: ClaseDocenteResponse) {
    try {
      await api.put(`/clases-docente/${c.id}`, { activa: !c.activa })
      showToast(c.activa ? 'Clase desactivada' : 'Clase reactivada')
      load()
    } catch { showToast('Error al cambiar el estado') }
  }

  const inputCls = `w-full px-3 py-2.5 rounded-lg border border-slate-200 text-slate-900
    text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 bg-slate-50
    focus:bg-white placeholder:text-slate-400 transition-all`
  const selectCls = `${inputCls} cursor-pointer`

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
          <h1 className="text-2xl font-black text-slate-900 flex items-center gap-2">
            <GraduationCap size={22} className="text-teal-600" /> Clases Docentes
          </h1>
          <p className="text-slate-500 text-sm mt-0.5">
            {loading ? '...' : `${clases.length} clases`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 cursor-pointer select-none text-sm
                            text-slate-600 font-semibold">
            <input type="checkbox" checked={!soloActivas}
              onChange={e => setSoloActivas(!e.target.checked)}
              className="w-4 h-4 rounded accent-teal-600" />
            Mostrar inactivas
          </label>
          <button onClick={abrirCrear}
            className="flex items-center gap-2 bg-teal-600 hover:bg-teal-700 text-white
                       font-bold px-4 py-2.5 rounded-xl text-sm transition-colors">
            <Plus size={16} /> Asignar clase
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              <th className="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide">Docente</th>
              <th className="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide">Asignatura</th>
              <th className="text-center px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide">Sección</th>
              <th className="text-center px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide">Semestre</th>
              <th className="text-center px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide">Estado</th>
              <th className="text-center px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              Array.from({ length: 6 }).map((_, i) => <TableRowSkeleton key={i} cols={6} />)
            ) : clases.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center py-12 text-slate-400">
                  <GraduationCap size={28} className="mx-auto mb-2 opacity-30" />
                  <p className="font-semibold">Sin clases asignadas</p>
                </td>
              </tr>
            ) : clases.map(c => (
              <tr key={c.id} className={`hover:bg-slate-50 transition-colors ${c.activa ? '' : 'opacity-60'}`}>
                <td className="px-4 py-3 font-semibold text-slate-900">{c.docente_nombre}</td>
                <td className="px-4 py-3">
                  <div className="font-semibold text-slate-900">{c.asignatura_nombre}</div>
                  <div className="text-xs text-slate-400 font-mono">{c.asignatura_codigo}</div>
                </td>
                <td className="px-4 py-3 text-center font-bold font-mono text-slate-700">{c.seccion}</td>
                <td className="px-4 py-3 text-center text-slate-500">{c.semestre}</td>
                <td className="px-4 py-3 text-center">
                  {c.activa
                    ? <Badge variant="success">Activa</Badge>
                    : <Badge variant="danger">Inactiva</Badge>}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-center gap-2">
                    <button onClick={() => abrirEditar(c)}
                      className="p-1.5 rounded-lg text-slate-400 hover:bg-teal-50
                                 hover:text-teal-600 transition-colors" title="Editar">
                      <Pencil size={14} />
                    </button>
                    <button onClick={() => toggleActiva(c)}
                      className={`p-1.5 rounded-lg transition-colors ${
                        c.activa
                          ? 'text-slate-400 hover:bg-rose-50 hover:text-rose-600'
                          : 'text-slate-400 hover:bg-emerald-50 hover:text-emerald-600'
                      }`}
                      title={c.activa ? 'Desactivar' : 'Reactivar'}>
                      {c.activa ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <Modal
          title={editTarget ? 'Editar clase' : 'Asignar clase a docente'}
          onClose={cerrar}
          size="sm"
        >
          <form onSubmit={handleSubmit} className="space-y-4">
            {!editTarget && (
              <>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase
                                   tracking-wide mb-1.5">Docente *</label>
                  <select required value={form.docente_id}
                    onChange={e => setForm(f => ({ ...f, docente_id: e.target.value }))}
                    className={selectCls}>
                    <option value="">Seleccionar docente...</option>
                    {docentes.map(d => (
                      <option key={d.id} value={d.id}>{d.nombre}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase
                                   tracking-wide mb-1.5">Asignatura *</label>
                  <select required value={form.asignatura_id}
                    onChange={e => setForm(f => ({ ...f, asignatura_id: e.target.value }))}
                    className={selectCls}>
                    <option value="">Seleccionar asignatura...</option>
                    {asignaturas.map(a => (
                      <option key={a.id} value={a.id}>
                        {a.nombre} ({a.codigo})
                      </option>
                    ))}
                  </select>
                </div>
              </>
            )}
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase
                               tracking-wide mb-1.5">Sección *</label>
              <input type="text" required value={form.seccion}
                onChange={e => setForm(f => ({ ...f, seccion: e.target.value.toUpperCase() }))}
                className={inputCls} placeholder="Ej: 001D" maxLength={10} />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase
                               tracking-wide mb-1.5">Semestre *</label>
              <input type="text" required value={form.semestre}
                onChange={e => setForm(f => ({ ...f, semestre: e.target.value }))}
                className={inputCls} placeholder="Ej: 2025-1" maxLength={10} />
              <p className="text-xs text-slate-400 mt-1">Formato: Año-Semestre (ej: 2025-1, 2025-2)</p>
            </div>
            {formError && (
              <p className="text-rose-600 text-sm bg-rose-50 border border-rose-200
                            px-3 py-2 rounded-lg font-semibold">{formError}</p>
            )}
            <div className="flex gap-3 pt-1">
              <button type="button" onClick={cerrar}
                className="flex-1 py-2.5 rounded-xl border border-slate-200
                           text-slate-600 font-bold hover:bg-slate-50">Cancelar</button>
              <button type="submit" disabled={saving}
                className="flex-1 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700
                           text-white font-bold disabled:opacity-50">
                {saving ? 'Guardando...' : editTarget ? 'Guardar cambios' : 'Asignar'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
