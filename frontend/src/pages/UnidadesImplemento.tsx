import { useState, useEffect, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import {
  Package, Plus, Pencil, PowerOff, RefreshCw,
  ChevronLeft, CheckCircle, MapPin,
} from 'lucide-react'
import { api } from '../api/client'
import { useAuthStore } from '../store/auth'
import type {
  UnidadImplementoResponse, UnidadImplementoCreate,
  UnidadImplementoUpdate, EstadoUnidad, InsumoResponse,
  SalaResponse, PaginatedResponse,
} from '../types/api'

// ---------------------------------------------------------------------------
// Configuracion de estados
// ---------------------------------------------------------------------------

const ESTADO_CFG: Record<EstadoUnidad, { label: string; cls: string }> = {
  disponible: {
    label: 'Disponible',
    cls: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
  },
  en_uso: {
    label: 'En uso',
    cls: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
  },
  dado_de_baja: {
    label: 'Dado de baja',
    cls: 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300',
  },
}

// ---------------------------------------------------------------------------
// Modal crear / editar unidad
// ---------------------------------------------------------------------------

interface ModalProps {
  unidad: UnidadImplementoResponse | null  // null = crear nueva
  implementoId: number
  salas: SalaResponse[]
  onClose: () => void
  onSaved: () => void
}

function UnidadModal({ unidad, implementoId, salas, onClose, onSaved }: ModalProps) {
  const esNueva = unidad === null
  const [estado, setEstado] = useState<EstadoUnidad>(unidad?.estado ?? 'disponible')
  const [salaId, setSalaId] = useState<string>(unidad?.sala_id != null ? String(unidad.sala_id) : '')
  const [notas, setNotas] = useState(unidad?.notas ?? '')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  const inputCls = [
    'w-full px-3 py-2 rounded-lg border text-sm',
    'bg-white dark:bg-slate-700',
    'border-slate-300 dark:border-slate-600',
    'text-slate-900 dark:text-slate-50',
    'focus:outline-none focus:ring-2 focus:ring-teal-500',
  ].join(' ')

  async function handleGuardar() {
    setGuardando(true)
    setError('')
    try {
      const sala_id = salaId ? parseInt(salaId) : null
      if (esNueva) {
        const body: UnidadImplementoCreate = {
          implemento_id: implementoId,
          sala_id,
          notas: notas.trim() || null,
        }
        await api.post('/unidades-implemento/', body)
      } else {
        const body: UnidadImplementoUpdate = {
          estado,
          sala_id,
          notas: notas.trim() || null,
        }
        await api.put(`/unidades-implemento/${unidad!.id}`, body)
      }
      onSaved()
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })
        ?.response?.data?.detail
      setError(detail ?? 'Error al guardar')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4
                        border-b border-slate-200 dark:border-slate-700">
          <h2 className="text-base font-bold text-slate-900 dark:text-slate-50">
            {esNueva ? 'Registrar nueva unidad' : `Editar ${unidad!.codigo ?? 'unidad'}`}
          </h2>
          <button onClick={onClose}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200
                       text-xl font-bold">×</button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {/* Estado — solo en edición */}
          {!esNueva && (
            <div>
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400
                            mb-2 uppercase tracking-wide">Estado</p>
              <div className="flex gap-2 flex-wrap">
                {(['disponible', 'en_uso', 'dado_de_baja'] as EstadoUnidad[]).map(e => (
                  <button key={e} onClick={() => setEstado(e)}
                    className={[
                      'px-3 py-1.5 rounded-full text-xs font-semibold transition-all border-2',
                      estado === e
                        ? 'border-teal-500 bg-teal-50 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300'
                        : 'border-slate-200 dark:border-slate-600 text-slate-500 dark:text-slate-400',
                    ].join(' ')}>
                    {ESTADO_CFG[e].label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Sala asignada */}
          <div>
            <label className="block text-xs font-semibold text-slate-700
                              dark:text-slate-300 mb-1.5 uppercase tracking-wide">
              <span className="flex items-center gap-1.5">
                <MapPin size={11} /> Ubicación física
              </span>
            </label>
            <select
              value={salaId}
              onChange={e => setSalaId(e.target.value)}
              className={inputCls}
            >
              <option value="">Bodega (sin asignar a sala)</option>
              {salas.map(s => (
                <option key={s.id} value={s.id}>{s.nombre}</option>
              ))}
            </select>
            <p className="text-xs text-slate-400 mt-1">
              Si esta unidad está asignada permanentemente a una sala clínica,
              selecciónala. De lo contrario, se indica que está en Bodega.
            </p>
          </div>

          {/* Notas */}
          <div>
            <label className="block text-xs font-semibold text-slate-700
                              dark:text-slate-300 mb-1 uppercase tracking-wide">
              Notas
            </label>
            <textarea className={inputCls} rows={2} value={notas}
              onChange={e => setNotas(e.target.value)}
              placeholder="Ej: rayada, falta goma de sellado…" />
          </div>

          {error && (
            <p className="text-sm text-rose-600 dark:text-rose-400 font-medium">{error}</p>
          )}
        </div>

        <div className="flex justify-end gap-3 px-6 py-4
                        border-t border-slate-200 dark:border-slate-700">
          <button onClick={onClose} disabled={guardando}
            className="px-4 py-2 rounded-lg text-sm font-semibold
                       text-slate-600 dark:text-slate-400
                       hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
            Cancelar
          </button>
          <button onClick={handleGuardar} disabled={guardando}
            className="px-5 py-2 rounded-lg text-sm font-semibold
                       bg-teal-600 hover:bg-teal-700 text-white
                       disabled:opacity-50 transition-colors">
            {guardando ? 'Guardando…' : esNueva ? 'Registrar' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Página principal
// ---------------------------------------------------------------------------

const ROLES_ESCRITURA = ['admin', 'operador_coordinador', 'operador']

export function UnidadesImplemento() {
  const { user } = useAuthStore()
  const puedeEscribir = user?.rol ? ROLES_ESCRITURA.includes(user.rol) : false
  const esAdmin = user?.rol === 'admin'

  const { implemento_id } = useParams<{ implemento_id: string }>()
  const implementoId = parseInt(implemento_id ?? '0')

  const [implemento, setImplemento] = useState<InsumoResponse | null>(null)
  const [unidades, setUnidades] = useState<UnidadImplementoResponse[]>([])
  const [salas, setSalas] = useState<SalaResponse[]>([])
  const [cargando, setCargando] = useState(true)
  const [modal, setModal] = useState<UnidadImplementoResponse | null | undefined>(undefined)
  const [toast, setToast] = useState('')
  // Filtro de sala en la vista
  const [filtroSala, setFiltroSala] = useState<string>('')

  function mostrarToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(''), 3000)
  }

  useEffect(() => {
    if (!implementoId) return
    Promise.all([
      api.get<InsumoResponse>(`/insumos/${implementoId}`),
      api.get<PaginatedResponse<SalaResponse>>('/salas/', { params: { limit: 100 } }),
    ]).then(([insumoRes, salasRes]) => {
      setImplemento(insumoRes.data)
      setSalas(salasRes.data.data)
    }).catch(() => {})
  }, [implementoId])

  const cargar = useCallback(async () => {
    if (!implementoId) return
    setCargando(true)
    try {
      const params: Record<string, string | number> = { implemento_id: implementoId }
      if (filtroSala) params.sala_id = parseInt(filtroSala)
      const res = await api.get<UnidadImplementoResponse[]>('/unidades-implemento/', { params })
      setUnidades(res.data)
    } catch {
      mostrarToast('Error al cargar unidades')
    } finally {
      setCargando(false)
    }
  }, [implementoId, filtroSala])

  useEffect(() => { cargar() }, [cargar])

  async function handleDarDeBaja(u: UnidadImplementoResponse) {
    if (!confirm(`¿Dar de baja a ${u.codigo ?? 'esta unidad'}?`)) return
    try {
      await api.put(`/unidades-implemento/${u.id}`, { estado: 'dado_de_baja' })
      mostrarToast('Unidad dada de baja')
      cargar()
    } catch {
      mostrarToast('Error al dar de baja')
    }
  }

  const conteos = {
    total: unidades.length,
    disponibles: unidades.filter(u => u.estado === 'disponible').length,
    en_uso: unidades.filter(u => u.estado === 'en_uso').length,
    baja: unidades.filter(u => u.estado === 'dado_de_baja').length,
    en_salas: unidades.filter(u => u.sala_id != null).length,
    en_bodega: unidades.filter(u => u.sala_id == null).length,
  }

  if (!implementoId) {
    return (
      <div className="p-6 text-center text-slate-400 dark:text-slate-500">
        No se especificó un implemento. Accede desde la página de Insumos.
      </div>
    )
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2
                        bg-slate-900 dark:bg-slate-700 text-white text-sm
                        font-medium px-4 py-3 rounded-xl shadow-lg">
          <CheckCircle size={14} /> {toast}
        </div>
      )}

      {/* Encabezado */}
      <div>
        <Link to="/insumos"
          className="flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400
                     hover:text-teal-600 dark:hover:text-teal-400 transition-colors mb-3">
          <ChevronLeft size={15} /> Volver a Insumos e Implementos
        </Link>

        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Package size={20} className="text-teal-600" />
              <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50">
                {implemento?.nombre ?? 'Cargando…'}
              </h1>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full
                               bg-violet-100 text-violet-700
                               dark:bg-violet-900/40 dark:text-violet-300">
                Implemento
              </span>
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Unidades físicas individuales —
              {' '}<strong>{conteos.en_salas}</strong> en salas,
              {' '}<strong>{conteos.en_bodega}</strong> en bodega
            </p>
          </div>

          {puedeEscribir && (
            <button onClick={() => setModal(null)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl
                         bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold
                         transition-colors shadow-sm flex-shrink-0">
              <Plus size={15} /> Registrar unidad
            </button>
          )}
        </div>
      </div>

      {/* Resumen de estados */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total', value: conteos.total,
            cls: 'text-slate-700 dark:text-slate-200' },
          { label: 'Disponibles', value: conteos.disponibles,
            cls: 'text-emerald-600 dark:text-emerald-400' },
          { label: 'En uso', value: conteos.en_uso,
            cls: 'text-blue-600 dark:text-blue-400' },
          { label: 'Baja', value: conteos.baja,
            cls: 'text-rose-500 dark:text-rose-400' },
        ].map(stat => (
          <div key={stat.label}
            className="bg-white dark:bg-slate-800 rounded-xl border
                       border-slate-200 dark:border-slate-700 p-4 text-center">
            <p className={`text-2xl font-black ${stat.cls}`}>{stat.value}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-semibold mt-0.5">
              {stat.label}
            </p>
          </div>
        ))}
      </div>

      {/* Filtro de sala */}
      <div className="flex items-center gap-3">
        <MapPin size={14} className="text-slate-400" />
        <select
          value={filtroSala}
          onChange={e => setFiltroSala(e.target.value)}
          className="px-3 py-1.5 rounded-lg border border-slate-200 text-sm
                     text-slate-600 bg-white focus:outline-none
                     focus:ring-2 focus:ring-teal-500 cursor-pointer"
        >
          <option value="">Todas las ubicaciones</option>
          <option value="0">Solo Bodega</option>
          {salas.map(s => (
            <option key={s.id} value={s.id}>{s.nombre}</option>
          ))}
        </select>
      </div>

      {/* Tabla de unidades */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm
                      border border-slate-200 dark:border-slate-700 overflow-hidden">
        {cargando ? (
          <div className="p-12 text-center text-slate-400 dark:text-slate-500">
            <RefreshCw size={24} className="animate-spin mx-auto mb-3" />
            Cargando unidades…
          </div>
        ) : unidades.length === 0 ? (
          <div className="p-12 text-center">
            <Package size={32} className="mx-auto mb-3 text-slate-300" />
            <p className="text-slate-500 dark:text-slate-400 font-medium">
              No hay unidades para esta selección
            </p>
            {puedeEscribir && (
              <p className="text-slate-400 dark:text-slate-500 text-sm mt-1">
                Usa "Registrar unidad" para agregar la primera unidad.
              </p>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700
                               bg-slate-50 dark:bg-slate-900/50">
                  {['Sub-código', 'Ubicación', 'Estado', 'Notas', 'Acciones'].map(col => (
                    <th key={col}
                      className="text-left px-4 py-3 text-xs font-semibold
                                 text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                {unidades.map(u => (
                  <tr key={u.id}
                    className="hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                    <td className="px-4 py-3">
                      <span className="font-mono text-sm font-bold
                                       text-slate-800 dark:text-slate-100
                                       bg-slate-100 dark:bg-slate-700
                                       px-2.5 py-1 rounded-lg">
                        {u.codigo ?? '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {u.sala_nombre ? (
                        <span className="flex items-center gap-1.5 text-slate-600
                                         dark:text-slate-300 text-sm">
                          <MapPin size={11} className="text-teal-500" />
                          {u.sala_nombre}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400
                                         bg-slate-100 dark:bg-slate-700
                                         px-2 py-0.5 rounded-full font-semibold">
                          Bodega
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2.5 py-0.5
                                        rounded-full text-xs font-semibold
                                        ${ESTADO_CFG[u.estado].cls}`}>
                        {ESTADO_CFG[u.estado].label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-500 dark:text-slate-400
                                   max-w-xs truncate text-sm">
                      {u.notas ?? <span className="text-slate-300 dark:text-slate-600">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        {puedeEscribir && (
                          <button onClick={() => setModal(u)}
                            title="Editar"
                            className="p-1.5 rounded-lg text-slate-400 hover:text-teal-600
                                       hover:bg-teal-50 dark:hover:bg-teal-900/30 transition-colors">
                            <Pencil size={14} />
                          </button>
                        )}
                        {esAdmin && u.estado !== 'dado_de_baja' && (
                          <button onClick={() => handleDarDeBaja(u)}
                            title="Dar de baja"
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600
                                       hover:bg-rose-50 dark:hover:bg-rose-900/30 transition-colors">
                            <PowerOff size={14} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal */}
      {modal !== undefined && (
        <UnidadModal
          unidad={modal}
          implementoId={implementoId}
          salas={salas}
          onClose={() => setModal(undefined)}
          onSaved={() => {
            setModal(undefined)
            mostrarToast(modal === null ? 'Unidad registrada' : 'Unidad actualizada')
            cargar()
          }}
        />
      )}
    </div>
  )
}
