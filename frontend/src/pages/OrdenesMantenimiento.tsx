import { useEffect, useState, useCallback } from 'react'
import {
  Wrench, Plus, RefreshCw,
  CalendarClock, Building2, Trash2,
} from 'lucide-react'
import { api } from '../api/client'
import { useAuthStore } from '../store/auth'
import type {
  OrdenMantenimientoResponse, OrdenMantenimientoCreate,
  EstadoOrden, ResultadoItem,
  ActivoFijoResponse, ProveedorResponse,
  PaginatedResponse,
} from '../types/api'
import {
  ETIQUETA_ESTADO_ORDEN as ETIQUETAS_ORDEN,
  ETIQUETA_RESULTADO_ITEM,
} from '../types/api'
import { useLastUpdated } from '../hooks/useLastUpdated'
import { HSelect } from '../components/ui/HSelect'

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

const ESTADO_COLOR: Record<EstadoOrden, string> = {
  en_curso: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  cerrada:  'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
  cancelada: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-400',
}

const RESULTADO_COLOR: Record<ResultadoItem, string> = {
  pendiente:     'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300',
  ok:            'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
  sale_a_taller: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
  dar_de_baja:   'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300',
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
  activos:     ActivoFijoResponse[]
  proveedores: ProveedorResponse[]
  onClose:     () => void
  onSaved:     () => void
}

function ModalNuevaOrden(
  { activos, proveedores, onClose, onSaved }: ModalNuevaOrdenProps,
) {
  const [proveedorId,  setProveedorId]  = useState('')
  const [fechaVisita,  setFechaVisita]  = useState('')
  const [notas,        setNotas]        = useState('')
  const [selectedIds,  setSelectedIds]  = useState<Set<number>>(new Set())
  const [guardando,    setGuardando]    = useState(false)
  const [error,        setError]        = useState('')

  const proveedorOpts = proveedores.map(p => ({ value: String(p.id), label: p.nombre }))

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
        activo_ids:   Array.from(selectedIds),
        fecha_visita: fechaVisita,
        notas:        notas.trim() || null,
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

        {/* Cabecera */}
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

        {/* Cuerpo */}
        <div className="px-6 py-5 space-y-4 overflow-y-auto flex-1">

          {/* Proveedor — HSelect */}
          <div>
            <label className={labelCls}>Proveedor</label>
            <HSelect
              value={proveedorId}
              onChange={setProveedorId}
              options={proveedorOpts}
              placeholder="Sin proveedor asignado"
              className="w-full"
            />
          </div>

          {/* Fecha de visita */}
          <div>
            <label className={labelCls}>Fecha de visita *</label>
            <input type="date" className={inputCls}
              value={fechaVisita}
              onChange={e => setFechaVisita(e.target.value)} />
          </div>

          {/* Lista de activos con checkboxes */}
          <div>
            <label className={labelCls}>
              Activos fijos a incluir *
              {selectedIds.size > 0 && (
                <span className="ml-2 normal-case font-normal text-h-secondary">
                  ({selectedIds.size}
                  {' '}seleccionado{selectedIds.size > 1 ? 's' : ''})
                </span>
              )}
            </label>
            {activosDisponibles.length === 0 ? (
              <p className="text-xs text-h-tertiary py-3">
                No hay activos disponibles para mantenimiento.
              </p>
            ) : (
              <div className="rounded-xl border border-h-subtle overflow-hidden"
                style={{
                  background:  'var(--h-bg-elevated)',
                  maxHeight:   '200px',
                  overflowY:   'auto',
                }}>
                {activosDisponibles.map(a => {
                  const checked = selectedIds.has(a.id)
                  return (
                    <button key={a.id} type="button"
                      onClick={() => toggleActivo(a.id)}
                      className="w-full flex items-center gap-3 px-4 py-2.5
                                 text-left transition-colors
                                 border-b border-h-subtle last:border-b-0"
                      style={{
                        background: checked ? 'var(--h-teal-subtle)' : 'transparent',
                      }}
                      onMouseEnter={e => {
                        if (!checked)
                          e.currentTarget.style.background = 'var(--h-bg-highlight)'
                      }}
                      onMouseLeave={e => {
                        if (!checked)
                          e.currentTarget.style.background = 'transparent'
                      }}
                    >
                      {/* Checkbox visual */}
                      <div className="w-4 h-4 rounded border-2 flex-shrink-0
                                      flex items-center justify-center"
                        style={{
                          borderColor: checked
                            ? 'var(--h-teal-rest)' : 'var(--h-border-visible)',
                          background: checked
                            ? 'var(--h-teal-rest)' : 'transparent',
                        }}>
                        {checked && (
                          <svg viewBox="0 0 10 8" fill="none" className="w-2.5 h-2.5">
                            <path d="M1 4l3 3 5-6" stroke="white"
                              strokeWidth="1.5" strokeLinecap="round"
                              strokeLinejoin="round" />
                          </svg>
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-h-primary truncate">
                          {a.nombre}
                        </p>
                        <p className="text-xs text-h-tertiary font-mono">
                          {a.codigo_interno ?? '\u2014'}
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
                color:      'var(--h-sem-danger-text)',
                border:     '1px solid var(--h-sem-danger-border)',
              }}>
              {error}
            </p>
          )}
        </div>

        {/* Pie */}
        <div className="flex justify-end gap-3 px-6 py-4
                        border-t border-h-subtle flex-shrink-0">
          <button onClick={onClose} disabled={guardando}
            className="px-4 py-2 rounded-lg text-sm font-semibold
                       text-h-secondary hover:bg-h-elevated transition-colors">
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
// Modal de confirmacion de eliminacion
// ---------------------------------------------------------------------------

interface ModalEliminarProps {
  orden:    OrdenMantenimientoResponse
  onClose:  () => void
  onSaved:  () => void
}

function ModalEliminar({ orden, onClose, onSaved }: ModalEliminarProps) {
  const [eliminando, setEliminando] = useState(false)
  const [error,      setError]      = useState('')

  async function handleEliminar() {
    setEliminando(true); setError('')
    try {
      await api.delete(`/ordenes-mantenimiento/${orden.id}`)
      onSaved()
    } catch (err: unknown) {
      const detail = (
        err as { response?: { data?: { detail?: string } } }
      )?.response?.data?.detail
      setError(detail ?? 'Error al eliminar la orden')
    } finally { setEliminando(false) }
  }

  const nActivos = orden.items.length

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center
                    bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-h-surface border border-h-subtle rounded-2xl shadow-2xl
                      w-full max-w-sm flex flex-col">
        <div className="px-6 py-5">
          {/* Icono */}
          <div className="w-11 h-11 rounded-full flex items-center justify-center mb-4"
            style={{
              background: 'var(--h-sem-danger-bg)',
              border:     '1px solid var(--h-sem-danger-border)',
            }}>
            <Trash2 size={18} style={{ color: 'var(--h-sem-danger-text)' }} />
          </div>

          <h2 className="text-base font-semibold text-h-primary mb-1">
            Eliminar orden de mantenimiento
          </h2>
          <p className="text-sm text-h-secondary leading-relaxed">
            Se cancelara la orden{' '}
            <span className="font-semibold text-h-primary">
              #ORD-{String(orden.id).padStart(4, '0')}
            </span>
            {orden.proveedor_nombre && (
              <> ({orden.proveedor_nombre})</>
            )}
            {' '}y{' '}
            <span className="font-semibold text-h-primary">
              {nActivos} activo{nActivos !== 1 ? 's' : ''}
            </span>
            {' '}volvera{nActivos !== 1 ? 'n' : ''} a estado{' '}
            <span className="font-semibold" style={{ color: 'var(--h-teal-hover)' }}>
              Disponible
            </span>.
            {' '}Esta accion quedara registrada en el historial.
          </p>

          {error && (
            <p className="text-xs font-medium px-3 py-2 rounded-lg mt-4"
              style={{
                background: 'var(--h-sem-danger-bg)',
                color:      'var(--h-sem-danger-text)',
                border:     '1px solid var(--h-sem-danger-border)',
              }}>
              {error}
            </p>
          )}
        </div>

        <div className="flex justify-end gap-3 px-6 pb-5 flex-shrink-0">
          <button onClick={onClose} disabled={eliminando}
            className="px-4 py-2 rounded-lg text-sm font-semibold
                       text-h-secondary hover:bg-h-elevated transition-colors">
            Cancelar
          </button>
          <button onClick={handleEliminar} disabled={eliminando}
            className="px-5 py-2 rounded-lg text-sm font-semibold text-white
                       transition-colors disabled:opacity-50"
            style={{ background: 'var(--h-sem-danger-text)' }}
            onMouseEnter={e => !eliminando &&
              (e.currentTarget.style.background = 'var(--h-sem-danger-border)')}
            onMouseLeave={e =>
              (e.currentTarget.style.background = 'var(--h-sem-danger-text)')}
          >
            {eliminando ? 'Eliminando...' : 'Si, eliminar orden'}
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

  const [ordenes,      setOrdenes]      = useState<OrdenMantenimientoResponse[]>([])
  const [activos,      setActivos]      = useState<ActivoFijoResponse[]>([])
  const [proveedores,  setProveedores]  = useState<ProveedorResponse[]>([])
  const [cargando,     setCargando]     = useState(true)
  const [filtroEstado, setFiltroEstado] = useState<EstadoOrden | ''>('')
  const [modalNueva,   setModalNueva]   = useState(false)
  const [modalEliminar, setModalEliminar] =
    useState<OrdenMantenimientoResponse | null>(null)
  const [toast,        setToast]        = useState('')
  const [hoveredOrden, setHoveredOrden] = useState<number | null>(null)
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

  // ── Construccion de filas (una por item) ──────────────────────────────────
  type Fila = {
    rowKey:  string
    orden:   OrdenMantenimientoResponse
    item:    OrdenMantenimientoResponse['items'][0]
    rowspan: number
    isFirst: boolean
  }

  const filas: Fila[] = []
  ordenes.forEach(orden => {
    if (orden.items.length === 0) {
      filas.push({
        rowKey:  `${orden.id}-empty`,
        orden,
        item: {
          id: -1, activo_fijo_id: -1,
          activo_fijo_nombre: '(sin activos)',
          activo_fijo_codigo: null,
          resultado: 'pendiente',
          fecha_envio: null, fecha_retorno_estimada: null, fecha_retorno: null,
          descripcion_problema: null, descripcion_trabajo: null, costo: null,
        },
        rowspan: 1,
        isFirst: true,
      })
    } else {
      orden.items.forEach((item, idx) => {
        filas.push({
          rowKey:  `${orden.id}-${item.id}`,
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
                color:      'var(--h-sem-warning-text)',
                border:     '1px solid var(--h-sem-warning-border)',
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

      {/* Filtros de estado */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-h-tertiary font-semibold">Estado:</span>
        {(['', 'en_curso', 'cerrada', 'cancelada'] as const).map(e => (
          <button key={e}
            onClick={() => setFiltroEstado(e as EstadoOrden | '')}
            className="px-3 py-1 rounded-full text-xs font-bold transition-colors"
            style={filtroEstado === e ? {
              background: 'var(--h-teal-rest)', color: 'white',
            } : {
              background: 'var(--h-bg-elevated)',
              color:      'var(--h-text-secondary)',
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
                  const dias      = diasDesde(orden.fecha_visita)
                  const hovered   = hoveredOrden === orden.id
                  const rowBg     = hovered
                    ? 'var(--h-bg-highlight)'
                    : 'var(--h-bg-surface)'

                  return (
                    <tr key={rowKey}
                      className="border-b border-h-subtle"
                      style={{ background: rowBg }}
                      onMouseEnter={() => setHoveredOrden(orden.id)}
                      onMouseLeave={() => setHoveredOrden(null)}
                    >
                      {/* Columna Orden / Proveedor — rowspan */}
                      {isFirst && (
                        <td className="px-4 py-3 align-top" rowSpan={rowspan}
                          style={{ background: rowBg }}>
                          <p className="font-mono text-xs text-h-tertiary">
                            #ORD-{String(orden.id).padStart(4, '0')}
                          </p>
                          {orden.proveedor_nombre ? (
                            <span className="flex items-center gap-1 text-xs
                                             text-h-secondary font-semibold mt-0.5">
                              <Building2 size={11} className="text-h-tertiary" />
                              {orden.proveedor_nombre}
                            </span>
                          ) : (
                            <span className="text-xs italic text-h-tertiary mt-0.5">
                              Sin proveedor
                            </span>
                          )}
                          {orden.notas && (
                            <p className="text-xs text-h-tertiary mt-1
                                          max-w-[160px] truncate"
                              title={orden.notas}>{orden.notas}</p>
                          )}
                        </td>
                      )}

                      {/* Columna Activo */}
                      <td className="px-4 py-3" style={{ background: rowBg }}>
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

                      {/* Columna Estado — rowspan */}
                      {isFirst && (
                        <td className="px-4 py-3 align-top" rowSpan={rowspan}
                          style={{ background: rowBg }}>
                          <BadgeLocal
                            label={ETIQUETAS_ORDEN[orden.estado]}
                            cls={ESTADO_COLOR[orden.estado]}
                          />
                        </td>
                      )}

                      {/* Columna Resultado */}
                      <td className="px-4 py-3" style={{ background: rowBg }}>
                        <BadgeLocal
                          label={ETIQUETA_RESULTADO_ITEM[item.resultado]}
                          cls={RESULTADO_COLOR[item.resultado]}
                        />
                      </td>

                      {/* Columna Fecha visita — rowspan */}
                      {isFirst && (
                        <td className="px-4 py-3 text-h-secondary whitespace-nowrap
                                       align-top" rowSpan={rowspan}
                          style={{ background: rowBg }}>
                          {formatFecha(orden.fecha_visita)}
                        </td>
                      )}

                      {/* Columna Retorno estimado */}
                      <td className="px-4 py-3 text-h-secondary whitespace-nowrap"
                        style={{ background: rowBg }}>
                        {formatFecha(item.fecha_retorno_estimada)}
                      </td>

                      {/* Columna Dias — rowspan */}
                      {isFirst && (
                        <td className="px-4 py-3 align-top" rowSpan={rowspan}
                          style={{ background: rowBg }}>
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

                      {/* Columna Acciones — rowspan, solo Eliminar */}
                      {isFirst && (
                        <td className="px-4 py-3 align-top" rowSpan={rowspan}
                          style={{ background: rowBg }}>
                          {puedeEscribir && orden.estado === 'en_curso' && (
                            <button
                              onClick={() => setModalEliminar(orden)}
                              title="Eliminar orden"
                              className="p-1.5 rounded-lg text-h-tertiary
                                         transition-colors"
                              onMouseEnter={e => {
                                e.currentTarget.style.color =
                                  'var(--h-sem-danger-text)'
                                e.currentTarget.style.background =
                                  'var(--h-sem-danger-bg)'
                              }}
                              onMouseLeave={e => {
                                e.currentTarget.style.color = ''
                                e.currentTarget.style.background = ''
                              }}
                            >
                              <Trash2 size={14} />
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

      {/* Modal eliminar */}
      {modalEliminar && (
        <ModalEliminar
          orden={modalEliminar}
          onClose={() => setModalEliminar(null)}
          onSaved={() => {
            setModalEliminar(null)
            mostrarToast('Orden eliminada y activos liberados')
            cargar()
          }}
        />
      )}

      {/* Toast */}
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
