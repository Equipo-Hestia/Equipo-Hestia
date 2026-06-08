import { useEffect, useState, useCallback } from 'react'
import {
  Wrench, Plus, RefreshCw,
  CalendarClock, Building2, Pencil,
} from 'lucide-react'
import { api } from '../api/client'
import { useAuthStore } from '../store/auth'
import type {
  OrdenMantenimientoResponse, OrdenMantenimientoCreate,
  OrdenMantenimientoUpdate, EstadoOrden, ResultadoItem,
  ActivoFijoResponse, ProveedorResponse,
  PaginatedResponse,
} from '../types/api'
import {
  ETIQUETA_ESTADO_ORDEN as ETIQUETAS_ORDEN,
  ETIQUETA_RESULTADO_ITEM,
} from '../types/api'
import { useLastUpdated } from '../hooks/useLastUpdated'

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

const ESTADO_COLOR: Record<EstadoOrden, string> = {
  en_curso: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  cerrada: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
  cancelada: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-400',
}

const RESULTADO_COLOR: Record<ResultadoItem, string> = {
  pendiente: 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300',
  ok: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
  sale_a_taller: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
  dar_de_baja: 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300',
}

function BadgeLocal({ label, cls }: { label: string; cls: string }) {
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5
                      rounded-full text-xs font-semibold ${cls}`}>
      {label}
    </span>
  )
}

function formatFecha(f: string | null | undefined): string {
  if (!f) return '\u2014'
  return new Date(f + 'T00:00:00').toLocaleDateString('es-CL', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  })
}

function diasDesde(fecha: string): number {
  return Math.max(0, Math.round(
    (Date.now() - new Date(fecha + 'T00:00:00').getTime()) / 86400000
  ))
}

// ---------------------------------------------------------------------------
// Modal Nueva orden
// ---------------------------------------------------------------------------

interface ModalNuevaOrdenProps {
  activos: ActivoFijoResponse[]
  proveedores: ProveedorResponse[]
  onClose: () => void
  onSaved: () => void
}

function ModalNuevaOrden(
  { activos, proveedores, onClose, onSaved }: ModalNuevaOrdenProps,
) {
  const [proveedorId, setProveedorId] = useState('')
  const [fechaVisita, setFechaVisita] = useState(''
  )
  const [notas, setNotas] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  const activosDisponibles = activos.filter(
    a => a.activo && a.estado !== 'en_mantenimiento' && a.estado !== 'dado_de_baja'
  )

  function toggleActivo(id: number) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleGuardar() {
    if (selectedIds.size === 0) {
      setError('Selecciona al menos un activo fijo'); return
    }
    if (!fechaVisita) { setError('La fecha de visita es obligatoria'); return }
    setGuardando(true); setError('')
    try {
      const body: OrdenMantenimientoCreate = {
        proveedor_id: proveedorId ? parseInt(proveedorId) : null,
        activo_ids: Array.from(selectedIds),
        fecha_visita: fechaVisita,
        notas: notas.trim() || null,
      }
      await api.post('/ordenes-mantenimiento/', body)
      onSaved()
    } catch (err: unknown) {
      const detail = (
        err as { response?: { data?: { detail?: string } } }
      )?.response?.data?.detail
      setError(detail ?? 'Error al guardar')
    } finally { setGuardando(false) }
  }

  const labelCls = (
    'block text-[10px] font-semibold text-h-tertiary mb-1.5 '
    + 'uppercase tracking-widest'
  )
  const inputCls = (
    'w-full px-3 py-2.5 rounded-lg text-h-primary text-sm '
    + 'focus:outline-none transition-all bg-h-elevated border '
    + 'border-h-visible focus:border-h-strong placeholder:text-h-tertiary'
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center
                    bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-h-surface border border-h-subtle rounded-2xl shadow-2xl
                      w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4
                        border-b border-h-subtle flex-shrink-0">
          <h2 className="text-base font-semibold text-h-primary">
            Nueva orden de mantenimiento
          </h2>
          <button onClick={onClose}
            className="text-h-tertiary hover:text-h-secondary text-xl font-bold
                       transition-colors"
            aria-label="Cerrar">x</button>
        </div>

        <div className="px-6 py-5 space-y-4 overflow-y-auto flex-1">

          {/* Proveedor */}
          <div>
            <label className={labelCls}>Proveedor</label>
            <select className={`${inputCls} cursor-pointer`}
              value={proveedorId}
              onChange={e => setProveedorId(e.target.value)}>
              <option value="">Sin proveedor asignado</option>
              {proveedores.map(p => (
                <option key={p.id} value={p.id}>{p.nombre}</option>
              ))}
            </select>
          </div>

          {/* Fecha de visita */}
          <div>
            <label className={labelCls}>Fecha de visita *</label>
            <input type="date" className={inputCls}
              value={fechaVisita}
              onChange={e => setFechaVisita(e.target.value)} />
          </div>

          {/* Activos a incluir */}
          <div>
            <label className={labelCls}>
              Activos fijos a incluir *
              {selectedIds.size > 0 && (
                <span className="ml-2 normal-case font-normal
                                 text-h-secondary">
                  ({selectedIds.size} seleccionado{selectedIds.size > 1 ? 's' : ''})
                </span>
              )}
            </label>
            {activosDisponibles.length === 0 ? (
              <p className="text-xs text-h-tertiary py-3">
                No hay activos disponibles para mantenimiento.
              </p>
            ) : (
              <div className="rounded-xl border border-h-subtle overflow-hidden"
                style={{ background: 'var(--h-bg-elevated)', maxHeight: '200px',
                  overflowY: 'auto' }}>
                {activosDisponibles.map(a => {
                  const checked = selectedIds.has(a.id)
                  return (
                    <button key={a.id} type="button"
                      onClick={() => toggleActivo(a.id)}
                      className="w-full flex items-center gap-3 px-4 py-2.5
                                 text-left transition-colors
                                 border-b border-h-subtle last:border-b-0"
                      style={{
                        background: checked
                          ? 'var(--h-teal-subtle)'
                          : 'transparent',
                      }}
                      onMouseEnter={e => {
                        if (!checked)
                          e.currentTarget.style.background =
                            'var(--h-bg-highlight)'
                      }}
                      onMouseLeave={e => {
                        if (!checked)
                          e.currentTarget.style.background = 'transparent'
                      }}
                    >
                      <div className="w-4 h-4 rounded border-2 flex-shrink-0
                                      flex items-center justify-center"
                        style={{
                          borderColor: checked
                            ? 'var(--h-teal-rest)'
                            : 'var(--h-border-visible)',
                          background: checked
                            ? 'var(--h-teal-rest)'
                            : 'transparent',
                        }}>
                        {checked && (
                          <svg viewBox="0 0 10 8" fill="none"
                            className="w-2.5 h-2.5">
                            <path d="M1 4l3 3 5-6" stroke="white"
                              strokeWidth="1.5" strokeLinecap="round"
                              strokeLinejoin="round" />
                          </svg>
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-h-primary
                                       truncate">
                          {a.nombre}
                        </p>
                        <p className="text-xs text-h-tertiary font-mono">
                          {a.codigo_interno ?? '—'}
                        </p>
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {/* Notas */}
          <div>
            <label className={labelCls}>Notas (opcional)</label>
            <textarea className={`${inputCls} resize-none`} rows={2}
              value={notas}
              onChange={e => setNotas(e.target.value)}
              placeholder="Observaciones generales de la visita..." />
          </div>

          {error && (
            <p className="text-xs font-medium px-3 py-2 rounded-lg"
              style={{
                background: 'var(--h-sem-danger-bg)',
                color: 'var(--h-sem-danger-text)',
                border: '1px solid var(--h-sem-danger-border)',
              }}>
              {error}
            </p>
          )}
        </div>

        <div className="flex justify-end gap-3 px-6 py-4
                        border-t border-h-subtle flex-shrink-0">
          <button onClick={onClose} disabled={guardando}
            className="px-4 py-2 rounded-lg text-sm font-semibold
                       text-h-secondary hover:bg-h-elevated
                       transition-colors">
            Cancelar
          </button>
          <button onClick={handleGuardar} disabled={guardando}
            className="px-5 py-2 rounded-lg text-sm font-semibold text-white
                       transition-colors disabled:opacity-50"
            style={{ background: 'var(--h-teal-rest)' }}
            onMouseEnter={e => !guardando &&
              (e.currentTarget.style.background = 'var(--h-teal-hover)')}
            onMouseLeave={e =>
              (e.currentTarget.style.background = 'var(--h-teal-rest)')}
          >
            {guardando ? 'Creando...' : 'Crear orden'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Modal Editar cabecera (proveedor y notas)
// ---------------------------------------------------------------------------

interface ModalEditarCabeceraProps {
  orden: OrdenMantenimientoResponse
  proveedores: ProveedorResponse[]
  onClose: () => void
  onSaved: () => void
}

function ModalEditarCabecera(
  { orden, proveedores, onClose, onSaved }: ModalEditarCabeceraProps,
) {
  const [proveedorId, setProveedorId] = useState(
    orden.proveedor_id?.toString() ?? ''
  )
  const [notas, setNotas] = useState(orden.notas ?? '')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  async function handleGuardar() {
    setGuardando(true); setError('')
    try {
      const body: OrdenMantenimientoUpdate = {
        proveedor_id: proveedorId ? parseInt(proveedorId) : null,
        notas: notas.trim() || null,
      }
      await api.put(`/ordenes-mantenimiento/${orden.id}`, body)
      onSaved()
    } catch (err: unknown) {
      const detail = (
        err as { response?: { data?: { detail?: string } } }
      )?.response?.data?.detail
      setError(detail ?? 'Error al guardar')
    } finally { setGuardando(false) }
  }

  const labelCls = (
    'block text-[10px] font-semibold text-h-tertiary mb-1.5 '
    + 'uppercase tracking-widest'
  )
  const inputCls = (
    'w-full px-3 py-2.5 rounded-lg text-h-primary text-sm '
    + 'focus:outline-none transition-all bg-h-elevated border '
    + 'border-h-visible focus:border-h-strong placeholder:text-h-tertiary'
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center
                    bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-h-surface border border-h-subtle rounded-2xl shadow-2xl
                      w-full max-w-md flex flex-col">
        <div className="flex items-center justify-between px-6 py-4
                        border-b border-h-subtle">
          <div>
            <h2 className="text-base font-semibold text-h-primary">
              Editar orden #{orden.id}
            </h2>
            <p className="text-xs text-h-tertiary mt-0.5">
              Visita: {formatFecha(orden.fecha_visita)}
            </p>
          </div>
          <button onClick={onClose}
            className="text-h-tertiary hover:text-h-secondary text-xl font-bold
                       transition-colors"
            aria-label="Cerrar">x</button>
        </div>

        <div className="px-6 py-5 space-y-4">

          <div>
            <label className={labelCls}>Proveedor</label>
            <select className={`${inputCls} cursor-pointer`}
              value={proveedorId}
              onChange={e => setProveedorId(e.target.value)}>
              <option value="">Sin proveedor asignado</option>
              {proveedores.map(p => (
                <option key={p.id} value={p.id}>{p.nombre}</option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelCls}>Notas</label>
            <textarea className={`${inputCls} resize-none`} rows={3}
              value={notas}
              onChange={e => setNotas(e.target.value)}
              placeholder="Observaciones generales..." />
          </div>

          {error && (
            <p className="text-xs font-medium px-3 py-2 rounded-lg"
              style={{
                background: 'var(--h-sem-danger-bg)',
                color: 'var(--h-sem-danger-text)',
                border: '1px solid var(--h-sem-danger-border)',
              }}>
              {error}
            </p>
          )}
        </div>

        <div className="flex justify-end gap-3 px-6 py-4
                        border-t border-h-subtle">
          <button onClick={onClose} disabled={guardando}
            className="px-4 py-2 rounded-lg text-sm font-semibold
                       text-h-secondary hover:bg-h-elevated
                       transition-colors">
            Cancelar
          </button>
          <button onClick={handleGuardar} disabled={guardando}
            className="px-5 py-2 rounded-lg text-sm font-semibold text-white
                       transition-colors disabled:opacity-50"
            style={{ background: 'var(--h-teal-rest)' }}
            onMouseEnter={e => !guardando &&
              (e.currentTarget.style.background = 'var(--h-teal-hover)')}
            onMouseLeave={e =>
              (e.currentTarget.style.background = 'var(--h-teal-rest)')}
          >
            {guardando ? 'Guardando...' : 'Guardar cambios'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Pagina principal
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
  const [modalNueva, setModalNueva] = useState(false)
  const [modalEditar, setModalEditar] =
    useState<OrdenMantenimientoResponse | null>(null)
  const [toast, setToast] = useState('')
  const [hoveredRow, setHoveredRow] = useState<string | null>(null)
  const { labelTiempo, marcarActualizado } = useLastUpdated()

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
      marcarActualizado()
    } catch {
      mostrarToast('Error al cargar ordenes')
    } finally { setCargando(false) }
  }, [filtroEstado, marcarActualizado])

  useEffect(() => { cargar() }, [cargar])

  useEffect(() => {
    api.get<ActivoFijoResponse[]>('/activos-fijos/')
      .then(r => setActivos(r.data)).catch(() => {})
    api.get<PaginatedResponse<ProveedorResponse>>(
      '/proveedores/', { params: { limit: 100 } }
    ).then(r => setProveedores(r.data.data ?? [])).catch(() => {})
  }, [])

  const enCursoCount = ordenes.filter(o => o.estado === 'en_curso').length

  // Construir filas: una fila por item de cada orden
  type Fila = {
    rowKey: string
    orden: OrdenMantenimientoResponse
    item: OrdenMantenimientoResponse['items'][0]
    rowspan: number
    isFirst: boolean
  }

  const filas: Fila[] = []
  ordenes.forEach(orden => {
    if (orden.items.length === 0) {
      // Orden sin items (no deberia ocurrir pero se defiende)
      filas.push({
        rowKey: `${orden.id}-empty`,
        orden,
        item: {
          id: -1,
          activo_fijo_id: -1,
          activo_fijo_nombre: '(sin activos)',
          activo_fijo_codigo: null,
          resultado: 'pendiente',
          fecha_envio: null,
          fecha_retorno_estimada: null,
          fecha_retorno: null,
          descripcion_problema: null,
          descripcion_trabajo: null,
          costo: null,
        },
        rowspan: 1,
        isFirst: true,
      })
    } else {
      orden.items.forEach((item, idx) => {
        filas.push({
          rowKey: `${orden.id}-${item.id}`,
          orden,
          item,
          rowspan: orden.items.length,
          isFirst: idx === 0,
        })
      })
    }
  })

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-5">

      {/* Encabezado */}
      <div className="flex flex-col sm:flex-row sm:items-start
                      justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-h-primary">
            Ordenes de Mantenimiento
          </h1>
          <p className="text-sm text-h-secondary mt-0.5">
            Mantenimiento de activos fijos
          </p>
          {labelTiempo && (
            <p className="text-xs text-h-tertiary mt-1">{labelTiempo}</p>
          )}
        </div>
        <div className="flex items-center gap-3">
          {enCursoCount > 0 && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5
                             rounded-full text-xs font-bold"
              style={{
                background: 'var(--h-sem-warning-bg)',
                color: 'var(--h-sem-warning-text)',
                border: '1px solid var(--h-sem-warning-border)',
              }}>
              <CalendarClock size={13} />
              {enCursoCount} en curso
            </span>
          )}
          {puedeEscribir && (
            <button onClick={() => setModalNueva(true)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl
                         text-white text-sm font-semibold
                         transition-colors shadow-sm"
              style={{ background: 'var(--h-teal-rest)' }}
              onMouseEnter={e =>
                (e.currentTarget.style.background = 'var(--h-teal-hover)')}
              onMouseLeave={e =>
                (e.currentTarget.style.background = 'var(--h-teal-rest)')}
            >
              <Plus size={16} /> Nueva orden
            </button>
          )}
        </div>
      </div>

      {/* Filtro de estado */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-h-tertiary font-semibold">Estado:</span>
        {(['', 'en_curso', 'cerrada', 'cancelada'] as const).map(e => (
          <button key={e}
            onClick={() => setFiltroEstado(e as EstadoOrden | '')}
            className="px-3 py-1 rounded-full text-xs font-bold
                       transition-colors"
            style={filtroEstado === e ? {
              background: 'var(--h-teal-rest)', color: 'white',
            } : {
              background: 'var(--h-bg-elevated)',
              color: 'var(--h-text-secondary)',
            }}>
            {e === '' ? 'Todos' : ETIQUETAS_ORDEN[e as EstadoOrden]}
          </button>
        ))}
        <button onClick={cargar}
          className="ml-auto p-2 rounded-lg border border-h-subtle
                     text-h-tertiary transition-colors"
          style={{ background: 'var(--h-bg-elevated)' }}
          onMouseEnter={e => {
            e.currentTarget.style.background = 'var(--h-bg-highlight)'
            e.currentTarget.style.color = 'var(--h-text-secondary)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = 'var(--h-bg-elevated)'
            e.currentTarget.style.color = ''
          }}
          title="Actualizar">
          <RefreshCw size={14} />
        </button>
      </div>

      {/* Tabla */}
      <div className="rounded-2xl border border-h-subtle overflow-hidden"
        style={{ background: 'var(--h-bg-surface)' }}>
        {cargando ? (
          <div className="p-12 text-center text-h-secondary">
            <RefreshCw size={22} className="animate-spin mx-auto mb-3"
              style={{ color: 'var(--h-teal-hover)' }} />
            <p className="text-sm">Cargando ordenes...</p>
          </div>
        ) : ordenes.length === 0 ? (
          <div className="p-12 text-center">
            <Wrench size={40} className="mx-auto mb-3 text-h-tertiary" />
            <p className="text-h-secondary font-medium">
              No hay ordenes de mantenimiento
            </p>
            {puedeEscribir && (
              <p className="text-h-tertiary text-sm mt-1">
                Crea una nueva orden cuando envies un activo a mantencion.
              </p>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-h-subtle"
                  style={{ background: 'var(--h-bg-elevated)' }}>
                  {[
                    'Orden / Proveedor', 'Activo', 'Estado',
                    'Resultado', 'Fecha visita', 'Retorno est.', 'Dias', 'Acciones',
                  ].map(col => (
                    <th key={col}
                      className="text-left px-4 py-3 text-[10px] font-semibold
                                 text-h-tertiary uppercase tracking-widest">
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filas.map(({ rowKey, orden, item, rowspan, isFirst }) => {
                  const dias = diasDesde(orden.fecha_visita)
                  const rowHovered = hoveredRow === rowKey
                  return (
                    <tr key={rowKey}
                      className="border-b border-h-subtle transition-colors"
                      style={{
                        background: rowHovered
                          ? 'var(--h-bg-highlight)'
                          : 'var(--h-bg-surface)',
                      }}
                      onMouseEnter={() => setHoveredRow(rowKey)}
                      onMouseLeave={() => setHoveredRow(null)}
                    >
                      {/* Celda de cabecera (rowspan por orden) */}
                      {isFirst && (
                        <td className="px-4 py-3 align-top"
                          rowSpan={rowspan}>
                          <p className="font-mono text-xs text-h-tertiary">
                            #ORD-{String(orden.id).padStart(4, '0')}
                          </p>
                          {orden.proveedor_nombre ? (
                            <span className="flex items-center gap-1
                                             text-xs text-h-secondary
                                             font-semibold mt-0.5">
                              <Building2 size={11}
                                className="text-h-tertiary" />
                              {orden.proveedor_nombre}
                            </span>
                          ) : (
                            <span className="text-xs italic
                                             text-h-tertiary mt-0.5">
                              Sin proveedor
                            </span>
                          )}
                          {orden.notas && (
                            <p className="text-xs text-h-tertiary mt-1
                                          max-w-[160px] truncate"
                              title={orden.notas}>
                              {orden.notas}
                            </p>
                          )}
                        </td>
                      )}

                      {/* Activo */}
                      <td className="px-4 py-3">
                        <p className="font-semibold text-h-primary">
                          {item.activo_fijo_nombre}
                        </p>
                        <p className="text-xs text-h-tertiary mt-0.5 font-mono">
                          {item.activo_fijo_codigo ?? '\u2014'}
                        </p>
                        {item.descripcion_problema && (
                          <p className="text-xs text-h-tertiary mt-0.5
                                        max-w-[200px] truncate"
                            title={item.descripcion_problema}>
                            {item.descripcion_problema}
                          </p>
                        )}
                      </td>

                      {/* Estado orden (rowspan) */}
                      {isFirst && (
                        <td className="px-4 py-3 align-top" rowSpan={rowspan}>
                          <BadgeLocal
                            label={ETIQUETAS_ORDEN[orden.estado]}
                            cls={ESTADO_COLOR[orden.estado]}
                          />
                        </td>
                      )}

                      {/* Resultado item */}
                      <td className="px-4 py-3">
                        <BadgeLocal
                          label={ETIQUETA_RESULTADO_ITEM[item.resultado]}
                          cls={RESULTADO_COLOR[item.resultado]}
                        />
                      </td>

                      {/* Fecha visita (rowspan) */}
                      {isFirst && (
                        <td className="px-4 py-3 text-h-secondary whitespace-nowrap
                                       align-top" rowSpan={rowspan}>
                          {formatFecha(orden.fecha_visita)}
                        </td>
                      )}

                      {/* Retorno estimado (por item) */}
                      <td className="px-4 py-3 text-h-secondary whitespace-nowrap">
                        {formatFecha(item.fecha_retorno_estimada)}
                      </td>

                      {/* Dias (rowspan) */}
                      {isFirst && (
                        <td className="px-4 py-3 align-top" rowSpan={rowspan}>
                          <span className={`text-xs font-bold ${
                            orden.estado !== 'en_curso'
                              ? 'text-h-tertiary'
                              : dias > 30 ? 'text-rose-500'
                              : dias > 14 ? 'text-amber-500'
                              : 'text-h-secondary'
                          }`}>
                            {dias}d
                            {orden.estado !== 'en_curso' ? ' (cerrada)' : ''}
                          </span>
                        </td>
                      )}

                      {/* Acciones (rowspan, solo en primera fila del grupo) */}
                      {isFirst && (
                        <td className="px-4 py-3 align-top" rowSpan={rowspan}>
                          {puedeEscribir && orden.estado === 'en_curso' && (
                            <button
                              onClick={() => setModalEditar(orden)}
                              title="Editar cabecera de la orden"
                              className="p-1.5 rounded-lg text-h-tertiary
                                         transition-colors"
                              onMouseEnter={e => {
                                e.currentTarget.style.color =
                                  'var(--h-teal-hover)'
                                e.currentTarget.style.background =
                                  'var(--h-teal-subtle)'
                              }}
                              onMouseLeave={e => {
                                e.currentTarget.style.color = ''
                                e.currentTarget.style.background = ''
                              }}
                            >
                              <Pencil size={14} />
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal nueva orden */}
      {modalNueva && (
        <ModalNuevaOrden
          activos={activos}
          proveedores={proveedores}
          onClose={() => setModalNueva(false)}
          onSaved={() => {
            setModalNueva(false)
            mostrarToast('Orden creada exitosamente')
            cargar()
          }}
        />
      )}

      {/* Modal editar cabecera */}
      {modalEditar && (
        <ModalEditarCabecera
          orden={modalEditar}
          proveedores={proveedores}
          onClose={() => setModalEditar(null)}
          onSaved={() => {
            setModalEditar(null)
            mostrarToast('Orden actualizada')
            cargar()
          }}
        />
      )}

      {toast && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2
                        text-white text-sm font-medium px-4 py-3
                        rounded-xl shadow-lg"
          style={{ background: 'var(--h-bg-highlight)' }}>
          {toast}
        </div>
      )}
    </div>
  )
}
