import { useEffect, useState, useCallback } from 'react'
import {
  Wrench, Plus, RefreshCw, ChevronDown,
  CalendarClock, Building2, Pencil, X,
} from 'lucide-react'
import { api } from '../api/client'
import { useAuthStore } from '../store/auth'
import type {
  OrdenMantenimientoResponse, OrdenMantenimientoCreate, OrdenMantenimientoUpdate,
  EstadoOrden, ActivoFijoResponse, ProveedorResponse,
  PaginatedResponse, ETIQUETA_ESTADO_ORDEN,
} from '../types/api'
import { ETIQUETA_ESTADO_ORDEN as ETIQUETAS_ORDEN } from '../types/api'

// ---------------------------------------------------------------------------
// Tipos locales
// ---------------------------------------------------------------------------

type TipoMant = 'preventivo' | 'correctivo' | 'validacion_tecnica'

const ETIQUETA_TIPO: Record<TipoMant, string> = {
  preventivo: 'Preventivo',
  correctivo: 'Correctivo',
  validacion_tecnica: 'Validación técnica',
}

const TIPO_COLOR: Record<TipoMant, string> = {
  preventivo: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
  correctivo: 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300',
  validacion_tecnica: 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300',
}

const ESTADO_COLOR: Record<EstadoOrden, string> = {
  enviado: 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300',
  en_proceso: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  completado: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
  cancelado: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-400',
}

function Badge({ label, cls }: { label: string; cls: string }) {
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${cls}`}>
      {label}
    </span>
  )
}

function diasEnMantenimiento(fechaEnvio: string, fechaRetorno?: string | null): number {
  const inicio = new Date(fechaEnvio)
  const fin = fechaRetorno ? new Date(fechaRetorno) : new Date()
  return Math.max(0, Math.round((fin.getTime() - inicio.getTime()) / 86400000))
}

function formatFecha(f: string | null | undefined): string {
  if (!f) return '—'
  return new Date(f + 'T00:00:00').toLocaleDateString('es-CL', {
    day: '2-digit', month: '2-digit', year: 'numeric'
  })
}

// ---------------------------------------------------------------------------
// Modal crear / editar
// ---------------------------------------------------------------------------

interface ModalOrdenProps {
  orden: OrdenMantenimientoResponse | null
  activos: ActivoFijoResponse[]
  proveedores: ProveedorResponse[]
  onClose: () => void
  onSaved: () => void
}

function ModalOrden({ orden, activos, proveedores, onClose, onSaved }: ModalOrdenProps) {
  const esNueva = orden === null
  const [activoId, setActivoId] = useState(orden?.activo_fijo_id.toString() ?? '')
  const [proveedorId, setProveedorId] = useState(orden?.proveedor_id?.toString() ?? '')
  const [tipo, setTipo] = useState<TipoMant | ''>(orden?.tipo_mantenimiento as TipoMant ?? '')
  const [estado, setEstado] = useState<EstadoOrden>(orden?.estado ?? 'enviado')
  const [fechaEnvio, setFechaEnvio] = useState(orden?.fecha_envio ?? '')
  const [fechaRetornoEst, setFechaRetornoEst] = useState(orden?.fecha_retorno_estimada ?? '')
  const [fechaRetorno, setFechaRetorno] = useState(orden?.fecha_retorno ?? '')
  const [descripcionProblema, setDescripcionProblema] = useState(orden?.descripcion_problema ?? '')
  const [descripcionTrabajo, setDescripcionTrabajo] = useState(orden?.descripcion_trabajo ?? '')
  const [costo, setCosto] = useState(orden?.costo?.toString() ?? '')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  async function handleGuardar() {
    if (esNueva && !activoId) { setError('Selecciona un activo fijo'); return }
    if (esNueva && !fechaEnvio) { setError('La fecha de envío es obligatoria'); return }
    setGuardando(true); setError('')
    try {
      if (esNueva) {
        const body: OrdenMantenimientoCreate = {
          activo_fijo_id: parseInt(activoId),
          proveedor_id: proveedorId ? parseInt(proveedorId) : null,
          tipo_mantenimiento: tipo || null,
          fecha_envio: fechaEnvio,
          fecha_retorno_estimada: fechaRetornoEst || null,
          descripcion_problema: descripcionProblema.trim() || null,
        }
        await api.post('/ordenes-mantenimiento/', body)
      } else {
        const body: OrdenMantenimientoUpdate = {
          proveedor_id: proveedorId ? parseInt(proveedorId) : null,
          tipo_mantenimiento: tipo || null,
          estado,
          fecha_retorno_estimada: fechaRetornoEst || null,
          fecha_retorno: fechaRetorno || null,
          descripcion_trabajo: descripcionTrabajo.trim() || null,
          costo: costo ? parseFloat(costo) : null,
        }
        await api.put(`/ordenes-mantenimiento/${orden!.id}`, body)
      }
      onSaved()
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setError(detail ?? 'Error al guardar')
    } finally { setGuardando(false) }
  }

  const labelCls = 'block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1'
  const inputCls = [
    'w-full px-3 py-2 rounded-lg border text-sm',
    'bg-white dark:bg-slate-700 border-slate-300 dark:border-slate-600',
    'text-slate-900 dark:text-slate-50',
    'focus:outline-none focus:ring-2 focus:ring-teal-500',
  ].join(' ')

  // Solo mostrar activos disponibles o en_uso para nuevas órdenes
  const activosDisponibles = activos.filter(
    a => a.activo && (esNueva
      ? a.estado !== 'en_mantenimiento' && a.estado !== 'dado_de_baja'
      : true)
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b
                        border-slate-200 dark:border-slate-700">
          <h2 className="text-lg font-bold text-slate-900 dark:text-slate-50">
            {esNueva ? 'Nueva orden de mantenimiento' : 'Actualizar orden'}
          </h2>
          <button onClick={onClose}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-xl font-bold">
            ×
          </button>
        </div>
        <div className="px-6 py-5 space-y-4">

          {/* Activo fijo — solo al crear */}
          {esNueva && (
            <div>
              <label className={labelCls}>Activo fijo *</label>
              <div className="relative">
                <select className={inputCls + ' appearance-none pr-9'}
                  value={activoId} onChange={e => setActivoId(e.target.value)}>
                  <option value="">Seleccionar activo…</option>
                  {activosDisponibles.map(a => (
                    <option key={a.id} value={a.id}>
                      {a.codigo_interno} — {a.nombre}
                    </option>
                  ))}
                </select>
                <ChevronDown size={15} className="absolute right-3 top-1/2 -translate-y-1/2
                  text-slate-400 pointer-events-none" />
              </div>
            </div>
          )}

          {/* Tipo de mantenimiento */}
          <div>
            <label className={labelCls}>Tipo de mantenimiento</label>
            <div className="grid grid-cols-3 gap-2">
              {(['preventivo', 'correctivo', 'validacion_tecnica'] as TipoMant[]).map(t => (
                <button key={t} type="button"
                  onClick={() => setTipo(prev => prev === t ? '' : t)}
                  className={[
                    'py-2 px-1 rounded-xl border-2 text-xs font-bold transition-all text-center',
                    tipo === t
                      ? TIPO_COLOR[t] + ' border-current'
                      : 'border-slate-200 dark:border-slate-600 text-slate-500 dark:text-slate-400',
                  ].join(' ')}>
                  {ETIQUETA_TIPO[t]}
                </button>
              ))}
            </div>
          </div>

          {/* Proveedor */}
          <div>
            <label className={labelCls}>Proveedor</label>
            <div className="relative">
              <select className={inputCls + ' appearance-none pr-9'}
                value={proveedorId} onChange={e => setProveedorId(e.target.value)}>
                <option value="">Sin proveedor asignado</option>
                {proveedores.map(p => (
                  <option key={p.id} value={p.id}>{p.nombre}</option>
                ))}
              </select>
              <ChevronDown size={15} className="absolute right-3 top-1/2 -translate-y-1/2
                text-slate-400 pointer-events-none" />
            </div>
          </div>

          {/* Estado — solo al editar */}
          {!esNueva && (
            <div>
              <label className={labelCls}>Estado</label>
              <div className="relative">
                <select className={inputCls + ' appearance-none pr-9'}
                  value={estado} onChange={e => setEstado(e.target.value as EstadoOrden)}>
                  <option value="enviado">Enviado al proveedor</option>
                  <option value="en_proceso">En proceso</option>
                  <option value="completado">Completado</option>
                  <option value="cancelado">Cancelado</option>
                </select>
                <ChevronDown size={15} className="absolute right-3 top-1/2 -translate-y-1/2
                  text-slate-400 pointer-events-none" />
              </div>
            </div>
          )}

          {/* Fechas */}
          <div className="grid grid-cols-2 gap-3">
            {esNueva && (
              <div>
                <label className={labelCls}>Fecha de envío *</label>
                <input type="date" className={inputCls} value={fechaEnvio}
                  onChange={e => setFechaEnvio(e.target.value)} />
              </div>
            )}
            <div>
              <label className={labelCls}>Retorno estimado</label>
              <input type="date" className={inputCls} value={fechaRetornoEst}
                onChange={e => setFechaRetornoEst(e.target.value)} />
            </div>
            {!esNueva && (
              <div>
                <label className={labelCls}>Fecha de retorno real</label>
                <input type="date" className={inputCls} value={fechaRetorno}
                  onChange={e => setFechaRetorno(e.target.value)} />
              </div>
            )}
          </div>

          {/* Descripción del problema */}
          <div>
            <label className={labelCls}>
              {esNueva ? 'Descripción del problema (o motivo preventivo)' : 'Trabajo realizado'}
            </label>
            <textarea
              className={inputCls} rows={3}
              value={esNueva ? descripcionProblema : descripcionTrabajo}
              onChange={e => esNueva
                ? setDescripcionProblema(e.target.value)
                : setDescripcionTrabajo(e.target.value)
              }
              placeholder={esNueva
                ? 'Ej: Falla en módulo de sonidos. Mantenimiento semestral…'
                : 'Descripción del trabajo realizado por el proveedor…'
              }
            />
          </div>

          {/* Costo — solo al editar */}
          {!esNueva && (
            <div>
              <label className={labelCls}>Costo (CLP)</label>
              <input type="number" min="0" step="1" className={inputCls} value={costo}
                onChange={e => setCosto(e.target.value)}
                placeholder="Ej: 150000" />
            </div>
          )}

          {error && (
            <p className="text-sm text-rose-600 dark:text-rose-400 font-medium">{error}</p>
          )}
        </div>
        <div className="flex justify-end gap-3 px-6 py-4 border-t
                        border-slate-200 dark:border-slate-700">
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
            {guardando ? 'Guardando…' : esNueva ? 'Crear orden' : 'Guardar cambios'}
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

export function OrdenesMantenimiento() {
  const { user } = useAuthStore()
  const puedeEscribir = user?.rol ? ROLES_ESCRITURA.includes(user.rol) : false

  const [ordenes, setOrdenes] = useState<OrdenMantenimientoResponse[]>([])
  const [activos, setActivos] = useState<ActivoFijoResponse[]>([])
  const [proveedores, setProveedores] = useState<ProveedorResponse[]>([])
  const [cargando, setCargando] = useState(true)
  const [filtroEstado, setFiltroEstado] = useState<EstadoOrden | ''>('')
  const [modal, setModal] = useState<OrdenMantenimientoResponse | null | undefined>(undefined)
  const [toast, setToast] = useState('')

  function mostrarToast(msg: string) {
    setToast(msg); setTimeout(() => setToast(''), 3000)
  }

  const cargar = useCallback(async () => {
    setCargando(true)
    try {
      const params: Record<string, string> = {}
      if (filtroEstado) params.estado = filtroEstado
      const res = await api.get<PaginatedResponse<OrdenMantenimientoResponse>>(
        '/ordenes-mantenimiento/', { params }
      )
      setOrdenes(res.data.data ?? [])
    } catch {
      mostrarToast('Error al cargar órdenes')
    } finally { setCargando(false) }
  }, [filtroEstado])

  useEffect(() => { cargar() }, [cargar])

  useEffect(() => {
    api.get<ActivoFijoResponse[]>('/activos-fijos/')
      .then(r => setActivos(r.data))
      .catch(() => {})
    api.get<PaginatedResponse<ProveedorResponse>>('/proveedores/', { params: { limit: 100 } })
      .then(r => setProveedores(r.data.data ?? []))
      .catch(() => {})
  }, [])

  const inputCls = [
    'px-3 py-2 rounded-lg border text-sm',
    'bg-white dark:bg-slate-700 border-slate-300 dark:border-slate-600',
    'text-slate-900 dark:text-slate-50',
    'focus:outline-none focus:ring-2 focus:ring-teal-500',
  ].join(' ')

  const abiertasCount = ordenes.filter(
    o => o.estado === 'enviado' || o.estado === 'en_proceso'
  ).length

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">

      {/* Encabezado */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50">
            Órdenes de Mantenimiento
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Mantenimiento de activos fijos — phantomas, muebles e implementos
          </p>
        </div>
        <div className="flex items-center gap-3">
          {abiertasCount > 0 && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full
                             text-xs font-bold bg-amber-100 text-amber-800
                             dark:bg-amber-900/40 dark:text-amber-300">
              <CalendarClock size={13} />
              {abiertasCount} en curso
            </span>
          )}
          {puedeEscribir && (
            <button onClick={() => setModal(null)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl
                         bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold
                         transition-colors shadow-sm">
              <Plus size={16} /> Nueva orden
            </button>
          )}
        </div>
      </div>

      {/* Filtro de estado */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-slate-500 dark:text-slate-400 font-semibold">Estado:</span>
        {(['', 'enviado', 'en_proceso', 'completado', 'cancelado'] as const).map(e => (
          <button key={e} onClick={() => setFiltroEstado(e as EstadoOrden | '')}
            className={`px-3 py-1 rounded-full text-xs font-bold transition-colors ${
              filtroEstado === e
                ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900'
                : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-200'
            }`}>
            {e === '' ? 'Todos' : ETIQUETAS_ORDEN[e as EstadoOrden]}
          </button>
        ))}
        <button onClick={cargar}
          className="ml-auto p-1.5 rounded-lg text-slate-400 hover:text-slate-600
                     hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
          <RefreshCw size={14} />
        </button>
      </div>

      {/* Tabla */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm
                      border border-slate-200 dark:border-slate-700 overflow-hidden">
        {cargando ? (
          <div className="p-12 text-center text-slate-400 dark:text-slate-500">
            <RefreshCw size={24} className="animate-spin mx-auto mb-3" />
            Cargando órdenes…
          </div>
        ) : ordenes.length === 0 ? (
          <div className="p-12 text-center">
            <Wrench size={40} className="mx-auto mb-3 text-slate-300 dark:text-slate-600" />
            <p className="text-slate-500 dark:text-slate-400 font-medium">
              No hay órdenes de mantenimiento
            </p>
            {puedeEscribir && (
              <p className="text-slate-400 dark:text-slate-500 text-sm mt-1">
                Crea una nueva orden cuando envíes un activo a mantención.
              </p>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700
                               bg-slate-50 dark:bg-slate-900/50">
                  {[
                    'Activo', 'Tipo', 'Estado', 'Proveedor',
                    'Envío', 'Retorno est.', 'Días', 'Acciones',
                  ].map(col => (
                    <th key={col} className="text-left px-4 py-3 text-xs font-semibold
                                            text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                {ordenes.map(o => {
                  const dias = diasEnMantenimiento(
                    o.fecha_envio, o.fecha_retorno ?? undefined
                  )
                  return (
                    <tr key={o.id}
                      className="hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                      <td className="px-4 py-3">
                        <p className="font-semibold text-slate-900 dark:text-slate-50">
                          {o.activo_fijo_nombre}
                        </p>
                        <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5 font-mono">
                          {o.activo_fijo_codigo ?? '—'}
                        </p>
                        {o.descripcion_problema && (
                          <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5
                                        max-w-[220px] truncate" title={o.descripcion_problema}>
                            {o.descripcion_problema}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {o.tipo_mantenimiento ? (
                          <Badge
                            label={ETIQUETA_TIPO[o.tipo_mantenimiento as TipoMant]}
                            cls={TIPO_COLOR[o.tipo_mantenimiento as TipoMant]}
                          />
                        ) : (
                          <span className="text-slate-300 dark:text-slate-600 text-xs italic">
                            Sin especificar
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <Badge
                          label={ETIQUETAS_ORDEN[o.estado]}
                          cls={ESTADO_COLOR[o.estado]}
                        />
                      </td>
                      <td className="px-4 py-3">
                        {o.proveedor_nombre ? (
                          <span className="flex items-center gap-1 text-xs
                                           text-slate-600 dark:text-slate-300 font-semibold">
                            <Building2 size={11} className="text-slate-400" />
                            {o.proveedor_nombre}
                          </span>
                        ) : (
                          <span className="text-slate-300 dark:text-slate-600 text-xs italic">
                            Sin asignar
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-500 dark:text-slate-400 whitespace-nowrap">
                        {formatFecha(o.fecha_envio)}
                      </td>
                      <td className="px-4 py-3 text-slate-500 dark:text-slate-400 whitespace-nowrap">
                        {formatFecha(o.fecha_retorno_estimada)}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-bold ${
                          o.estado === 'completado' || o.estado === 'cancelado'
                            ? 'text-slate-400 dark:text-slate-500'
                            : dias > 30 ? 'text-rose-600 dark:text-rose-400'
                            : dias > 14 ? 'text-amber-600 dark:text-amber-400'
                            : 'text-slate-600 dark:text-slate-300'
                        }`}>
                          {dias}d
                          {(o.estado === 'completado' || o.estado === 'cancelado')
                            ? ' (cerrada)' : ''}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {puedeEscribir &&
                          o.estado !== 'completado' &&
                          o.estado !== 'cancelado' && (
                            <button onClick={() => setModal(o)}
                              title="Actualizar orden"
                              className="p-1.5 rounded-lg text-slate-400 hover:text-teal-600
                                         hover:bg-teal-50 dark:hover:bg-teal-900/30 transition-colors">
                              <Pencil size={14} />
                            </button>
                          )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modal !== undefined && (
        <ModalOrden
          orden={modal}
          activos={activos}
          proveedores={proveedores}
          onClose={() => setModal(undefined)}
          onSaved={() => {
            setModal(undefined)
            mostrarToast(modal === null ? 'Orden creada' : 'Orden actualizada')
            cargar()
          }}
        />
      )}

      {toast && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 dark:bg-slate-700
                        text-white text-sm font-medium px-4 py-3 rounded-xl shadow-lg">
          {toast}
        </div>
      )}
    </div>
  )
}
