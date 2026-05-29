import { useEffect, useState, useCallback } from 'react'
import {
  BookOpen, Plus, Pencil, CheckCircle, ToggleLeft, ToggleRight
} from 'lucide-react'
import { api } from '../api/client'
import type { AsignaturaResponse, CarreraAsignatura } from '../types/api'
import { Badge } from '../components/ui/Badge'
import { Modal } from '../components/ui/Modal'
import { TableRowSkeleton } from '../components/ui/Skeleton'

const CARRERAS: { value: CarreraAsignatura; label: string }[] = [
  { value: 'TENS', label: 'Técnico en Enfermería' },
  { value: 'TQF', label: 'Técnico en Química y Farmacia' },
  { value: 'TLCBS', label: 'Téc. Laboratorio Clínico y Banco de Sangre' },
  { value: 'TONS', label: 'Técnico en Odontología' },
  { value: 'preparador_fisico', label: 'Preparador Físico' },
]

const CARRERA_VARIANT: Record<CarreraAsignatura, 'info' | 'success' | 'warning' | 'danger' | 'default'> = {
  TENS: 'info',
  TQF: 'warning',
  TLCBS: 'success',
  TONS: 'danger',
  preparador_fisico: 'default',
}

function carreraLabel(c: CarreraAsignatura | null): string {
  if (!c) return '—'
  return CARRERAS.find(x => x.value === c)?.label ?? c
}

interface FormState { nombre: string; codigo: string; carrera: CarreraAsignatura | '' }
const VACIO: FormState = { nombre: '', codigo: '', carrera: '' }

export function Asignaturas() {
  const [asignaturas, setAsignaturas] = useState<AsignaturaResponse[]>([])
  const [loading, setLoading] = useState(true)
  const [incluirInactivas, setIncluir] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [editTarget, setEditTarget] = useState<AsignaturaResponse | null>(null)
  const [form, setForm] = useState<FormState>(VACIO)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  function showToast(msg: string) {
    setToast(msg); setTimeout(() => setToast(null), 3000)
  }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await api.get<AsignaturaResponse[]>('/asignaturas/', {
        params: { incluir_inactivas: incluirInactivas },
      })
      setAsignaturas(data)
    } finally { setLoading(false) }
  }, [incluirInactivas])

  useEffect(() => { load() }, [load])

  function abrirCrear() {
    setForm(VACIO); setFormError(null); setEditTarget(null); setShowModal(true)
  }
  function abrirEditar(a: AsignaturaResponse) {
    setForm({ nombre: a.nombre, codigo: a.codigo, carrera: a.carrera ?? '' })
    setFormError(null); setEditTarget(a); setShowModal(true)
  }
  function cerrar() { setShowModal(false); setFormError(null) }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setSaving(true); setFormError(null)
    const payload = {
      nombre: form.nombre,
      codigo: form.codigo,
      carrera: form.carrera || null,
    }
    try {
      if (editTarget) {
        await api.put(`/asignaturas/${editTarget.id}`, payload)
        showToast('Asignatura actualizada')
      } else {
        await api.post('/asignaturas/', payload)
        showToast('Asignatura creada')
      }
      cerrar(); load()
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })
        .response?.data?.detail
      setFormError(msg ?? 'Error al guardar.')
    } finally { setSaving(false) }
  }

  async function toggleActiva(a: AsignaturaResponse) {
    try {
      await api.put(`/asignaturas/${a.id}`, { activa: !a.activa })
      showToast(a.activa ? 'Asignatura desactivada' : 'Asignatura reactivada')
      load()
    } catch {
      showToast('Error al cambiar el estado')
    }
  }

  const inputCls = `w-full px-3 py-2.5 rounded-lg border border-slate-200 text-slate-900
    text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 bg-slate-50
    focus:bg-white placeholder:text-slate-400 transition-all`

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
            <BookOpen size={22} className="text-teal-600" /> Asignaturas
          </h1>
          <p className="text-slate-500 text-sm mt-0.5">
            {loading ? '...' : `${asignaturas.length} asignaturas`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 cursor-pointer select-none text-sm
                            text-slate-600 font-semibold">
            <input type="checkbox" checked={incluirInactivas}
              onChange={e => setIncluir(e.target.checked)}
              className="w-4 h-4 rounded accent-teal-600" />
            Mostrar inactivas
          </label>
          <button onClick={abrirCrear}
            className="flex items-center gap-2 bg-teal-600 hover:bg-teal-700 text-white
                       font-bold px-4 py-2.5 rounded-xl text-sm transition-colors">
            <Plus size={16} /> Nueva asignatura
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              <th className="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide">Nombre</th>
              <th className="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide">Código</th>
              <th className="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide">Carrera</th>
              <th className="text-center px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide">Estado</th>
              <th className="text-center px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => <TableRowSkeleton key={i} cols={5} />)
            ) : asignaturas.length === 0 ? (
              <tr>
                <td colSpan={5} className="text-center py-12 text-slate-400">
                  <BookOpen size={28} className="mx-auto mb-2 opacity-30" />
                  <p className="font-semibold">Sin asignaturas registradas</p>
                </td>
              </tr>
            ) : asignaturas.map(a => (
              <tr key={a.id} className={`hover:bg-slate-50 transition-colors ${a.activa ? '' : 'opacity-60'}`}>
                <td className="px-4 py-3 font-semibold text-slate-900">{a.nombre}</td>
                <td className="px-4 py-3 font-mono text-xs text-slate-500">{a.codigo}</td>
                <td className="px-4 py-3">
                  {a.carrera
                    ? (
                      <Badge variant={CARRERA_VARIANT[a.carrera]}>
                        {carreraLabel(a.carrera)}
                      </Badge>
                    )
                    : <span className="text-slate-400 text-xs">—</span>
                  }
                </td>
                <td className="px-4 py-3 text-center">
                  {a.activa
                    ? <Badge variant="success">Activa</Badge>
                    : <Badge variant="danger">Inactiva</Badge>}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-center gap-2">
                    <button onClick={() => abrirEditar(a)}
                      className="p-1.5 rounded-lg text-slate-400 hover:bg-teal-50
                                 hover:text-teal-600 transition-colors" title="Editar">
                      <Pencil size={14} />
                    </button>
                    <button onClick={() => toggleActiva(a)}
                      className={`p-1.5 rounded-lg transition-colors ${
                        a.activa
                          ? 'text-slate-400 hover:bg-rose-50 hover:text-rose-600'
                          : 'text-slate-400 hover:bg-emerald-50 hover:text-emerald-600'
                      }`}
                      title={a.activa ? 'Desactivar' : 'Reactivar'}>
                      {a.activa ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
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
          title={editTarget ? 'Editar asignatura' : 'Nueva asignatura'}
          onClose={cerrar}
          size="sm"
        >
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase
                               tracking-wide mb-1.5">Nombre *</label>
              <input type="text" required value={form.nombre}
                onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
                className={inputCls} placeholder="Ej: Primeros Auxilios" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase
                               tracking-wide mb-1.5">Código *</label>
              <input type="text" required value={form.codigo}
                onChange={e => setForm(f => ({ ...f, codigo: e.target.value.toUpperCase() }))}
                className={inputCls} placeholder="Ej: CIS1101" maxLength={20} />
              <p className="text-xs text-slate-400 mt-1">
                Código oficial DuocUC (ej: CIS1101). Se convierte a mayúsculas.
              </p>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase
                               tracking-wide mb-1.5">Carrera</label>
              <select
                value={form.carrera}
                onChange={e => setForm(f => ({
                  ...f, carrera: e.target.value as CarreraAsignatura | ''
                }))}
                className={inputCls}
              >
                <option value="">Sin carrera asignada</option>
                {CARRERAS.map(c => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
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
                {saving ? 'Guardando...' : editTarget ? 'Guardar cambios' : 'Crear'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
