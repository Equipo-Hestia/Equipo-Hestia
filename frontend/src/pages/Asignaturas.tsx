import { useEffect, useState, useCallback, Fragment } from 'react'
import {
  BookOpen, Plus, Pencil, CheckCircle, ToggleLeft, ToggleRight
} from 'lucide-react'
import { api } from '../api/client'
import type { AsignaturaResponse, CarreraAsignatura } from '../types/api'
import { Badge } from '../components/ui/Badge'
import { Modal } from '../components/ui/Modal'
import { HSelect } from '../components/ui/HSelect'
import { TableRowSkeleton } from '../components/ui/Skeleton'

const ORDEN_CARRERAS: Array<CarreraAsignatura | '__sin_carrera__'> = [
  'TENS',
  'TQF',
  'TLCBS',
  'TONS',
  'preparador_fisico',
  '__sin_carrera__',
]

const CARRERAS: { value: CarreraAsignatura; label: string }[] = [
  { value: 'TENS', label: 'Tecnico en Enfermeria' },
  { value: 'TQF', label: 'Tec. Quimica y Farmacia' },
  { value: 'TLCBS', label: 'Tec. Lab. Clinico y Banco de Sangre' },
  { value: 'TONS', label: 'Tecnico en Odontologia' },
  { value: 'preparador_fisico', label: 'Preparador Fisico' },
]

type BadgeVariant = 'info' | 'warning' | 'success' | 'danger' | 'purple' | 'default'

const CARRERA_VARIANT: Record<CarreraAsignatura, BadgeVariant> = {
  TENS: 'info',
  TQF: 'warning',
  TLCBS: 'success',
  TONS: 'danger',
  preparador_fisico: 'purple',
}

function carreraLabel(c: CarreraAsignatura | null): string {
  if (!c) return '\u2014'
  return CARRERAS.find(x => x.value === c)?.label ?? c
}

function agruparPorCarrera(
  lista: AsignaturaResponse[]
): Array<{ carrera: CarreraAsignatura | null; asignaturas: AsignaturaResponse[] }> {
  const mapa = new Map<string, AsignaturaResponse[]>()

  for (const a of lista) {
    const clave = a.carrera ?? '__sin_carrera__'
    if (!mapa.has(clave)) mapa.set(clave, [])
    mapa.get(clave)!.push(a)
  }

  for (const grupo of mapa.values()) {
    grupo.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
  }

  return ORDEN_CARRERAS
    .filter(c => mapa.has(c))
    .map(c => ({
      carrera: c === '__sin_carrera__' ? null : (c as CarreraAsignatura),
      asignaturas: mapa.get(c)!,
    }))
}

interface FormState { nombre: string; codigo: string; carrera: CarreraAsignatura | '' }
const VACIO: FormState = { nombre: '', codigo: '', carrera: '' }

export function Asignaturas() {
  const [asignaturas, setAsignaturas] = useState<AsignaturaResponse[]>([])
  const [loading, setLoading] = useState(true)
  const [hoveredId, setHoveredId] = useState<number | null>(null)
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

  const inputCls = `w-full px-3 py-2.5 rounded-lg text-h-primary text-sm
    focus:outline-none transition-all bg-h-elevated border border-h-visible
    focus:border-h-strong placeholder:text-h-tertiary`
  const labelCls = `block text-[10px] font-semibold text-h-tertiary
    uppercase tracking-widest mb-1.5`

  const carreraOpts = CARRERAS.map(c => ({ value: c.value, label: c.label }))
  const grupos = agruparPorCarrera(asignaturas)
  const totalVisible = asignaturas.length

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
            <BookOpen size={22} className="text-h-accent" />
            Asignaturas
          </h1>
          <p className="text-h-secondary text-sm mt-0.5">
            {loading ? '...' : `${totalVisible} asignaturas`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 cursor-pointer select-none text-sm
                            text-h-secondary font-medium">
            <input type="checkbox" checked={incluirInactivas}
              onChange={e => setIncluir(e.target.checked)}
              className="w-4 h-4 rounded accent-teal-600" />
            Mostrar inactivas
          </label>
          <button onClick={abrirCrear}
            className="flex items-center gap-2 text-white font-semibold
                       px-4 py-2.5 rounded-xl text-sm transition-colors duration-150"
            style={{ background: 'var(--h-teal-rest)' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--h-teal-hover)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'var(--h-teal-rest)')}>
            <Plus size={16} /> Nueva asignatura
          </button>
        </div>
      </div>

      <div className="bg-h-surface rounded-xl border border-h-subtle overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-h-subtle bg-h-elevated">
                <th className="text-left px-4 py-3 text-[10px] font-semibold
                               text-h-tertiary uppercase tracking-widest">
                  Nombre
                </th>
                <th className="text-left px-4 py-3 text-[10px] font-semibold
                               text-h-tertiary uppercase tracking-widest">
                  Codigo
                </th>
                <th className="text-center px-4 py-3 text-[10px] font-semibold
                               text-h-tertiary uppercase tracking-widest">
                  Estado
                </th>
                <th className="text-center px-4 py-3 text-[10px] font-semibold
                               text-h-tertiary uppercase tracking-widest w-28">
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRowSkeleton key={i} cols={4} />
                ))
              ) : asignaturas.length === 0 ? (
                <tr>
                  <td colSpan={4} className="text-center py-16 text-h-tertiary">
                    <BookOpen size={28} className="mx-auto mb-2 opacity-30" />
                    <p className="font-semibold text-h-secondary">Sin asignaturas registradas</p>
                  </td>
                </tr>
              ) : grupos.map(({ carrera, asignaturas: items }) => (
                <Fragment key={`grupo-${carrera ?? 'sin'}`}>
                  <tr>
                    <td
                      colSpan={4}
                      className="px-4 py-2 border-t border-h-subtle"
                      style={{ background: 'var(--h-bg-elevated)' }}
                    >
                      <div className="flex items-center gap-2">
                        {carrera ? (
                          <Badge variant={CARRERA_VARIANT[carrera]}>
                            {carreraLabel(carrera)}
                          </Badge>
                        ) : (
                          <span className="text-xs font-semibold text-h-tertiary">
                            Sin carrera asignada
                          </span>
                        )}
                        <span className="text-xs text-h-tertiary">
                          {items.length} asignatura{items.length !== 1 ? 's' : ''}
                        </span>
                      </div>
                    </td>
                  </tr>
                  {items.map(a => {
                    const isHovered = hoveredId === a.id
                    return (
                      <tr
                        key={a.id}
                        onMouseEnter={() => setHoveredId(a.id)}
                        onMouseLeave={() => setHoveredId(null)}
                        className={`
                          border-b border-h-subtle last:border-0 transition-colors duration-150
                          ${isHovered ? 'bg-h-elevated' : ''}
                          ${a.activa ? '' : 'opacity-60'}
                        `}
                      >
                        <td className="px-4 py-3 font-medium text-h-primary pl-8">
                          {a.nombre}
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-h-tertiary">
                          {a.codigo}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {a.activa
                            ? <Badge variant="success">Activa</Badge>
                            : <Badge variant="danger">Inactiva</Badge>}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-center gap-1">
                            <button onClick={() => abrirEditar(a)}
                              className="p-1.5 rounded-lg text-h-tertiary transition-colors"
                              title="Editar"
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
                            <button onClick={() => toggleActiva(a)}
                              className="p-1.5 rounded-lg text-h-tertiary transition-colors"
                              title={a.activa ? 'Desactivar' : 'Reactivar'}
                              onMouseEnter={e => {
                                e.currentTarget.style.background = a.activa
                                  ? 'var(--h-sem-danger-bg)'
                                  : 'var(--h-sem-success-bg)'
                                e.currentTarget.style.color = a.activa
                                  ? 'var(--h-sem-danger-text)'
                                  : 'var(--h-sem-success-text)'
                              }}
                              onMouseLeave={e => {
                                e.currentTarget.style.background = ''
                                e.currentTarget.style.color = ''
                              }}>
                              {a.activa ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <Modal
          title={editTarget ? 'Editar asignatura' : 'Nueva asignatura'}
          onClose={cerrar}
          size="sm"
        >
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className={labelCls}>Nombre *</label>
              <input type="text" required value={form.nombre}
                onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
                className={inputCls} placeholder="Ej: Primeros Auxilios" />
            </div>
            <div>
              <label className={labelCls}>Codigo *</label>
              <input type="text" required value={form.codigo}
                onChange={e => setForm(f => ({
                  ...f, codigo: e.target.value.toUpperCase()
                }))}
                className={inputCls} placeholder="Ej: CIS1101" maxLength={20} />
              <p className="text-xs text-h-tertiary mt-1">
                Codigo oficial DuocUC (ej: CIS1101). Se convierte a mayusculas.
              </p>
            </div>
            <div>
              <label className={labelCls}>Carrera</label>
              <HSelect
                value={form.carrera}
                onChange={v => setForm(f => ({
                  ...f, carrera: v as CarreraAsignatura | ''
                }))}
                options={carreraOpts}
                placeholder="Sin carrera asignada"
                className="w-full"
              />
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
            <div className="flex gap-3 pt-1">
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
                {saving ? 'Guardando...' : editTarget ? 'Guardar cambios' : 'Crear'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
