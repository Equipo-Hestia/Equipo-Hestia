import { useEffect, useState, useCallback } from 'react'
import {
  ClipboardList, RefreshCw, CheckCircle, Clock,
  AlertTriangle, ChevronDown, ChevronUp, Package,
  GraduationCap, Zap, Search, Trash2, Plus, Minus,
} from 'lucide-react'
import { api } from '../api/client'
import type {
  SolicitudResponse, EstadoSolicitud,
  InsumoResponse, SalaResponse, TipoInsumo,
  EntregaDirectaCreate, EntregaDirectaResponse,
} from '../types/api'
import { Badge } from '../components/ui/Badge'

// ---------------------------------------------------------------------------
// Tipos locales
// ---------------------------------------------------------------------------

type FiltroEstado = EstadoSolicitud | 'todas' | 'activas'
type Vista = 'solicitudes' | 'entrega'

interface DocenteBasico { id: number; nombre: string; email: string; rol: string }

interface CartItem {
  insumo_id: number
  nombre: string
  cantidad: number
  stock_actual: number
  tipo: TipoInsumo
}

// ---------------------------------------------------------------------------
// Helpers solicitudes
// ---------------------------------------------------------------------------

function urgenciaConfig(sol: SolicitudResponse) {
  if (sol.estado === 'completada')     return { border: 'border-l-slate-200', chip: null }
  if (sol.estado === 'en_preparacion') return { border: 'border-l-blue-400', chip: null }
  const min = sol.minutos_hasta_clase
  if (min < 0)  return { border: 'border-l-slate-300', chip: null }
  if (min < 30) return {
    border: 'border-l-rose-500',
    chip: (
      <span className="flex items-center gap-1 text-xs font-black text-rose-600
                       bg-rose-100 px-2 py-0.5 rounded-full">
        <AlertTriangle size={10} /> {min < 1 ? '<1' : min} min
      </span>
    ),
  }
  if (min < 60) return {
    border: 'border-l-amber-400',
    chip: (
      <span className="flex items-center gap-1 text-xs font-bold text-amber-700
                       bg-amber-100 px-2 py-0.5 rounded-full">
        <Clock size={10} /> {min} min
      </span>
    ),
  }
  const horas = Math.floor(min / 60)
  const minResto = min % 60
  return {
    border: 'border-l-teal-400',
    chip: (
      <span className="flex items-center gap-1 text-xs font-semibold text-teal-700
                       bg-teal-50 px-2 py-0.5 rounded-full">
        <Clock size={10} /> {horas}h{minResto > 0 ? ` ${minResto}m` : ''}
      </span>
    ),
  }
}

function formatFechaClase(iso: string) {
  return new Date(iso).toLocaleString('es-CL', {
    weekday: 'short', day: '2-digit', month: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

function estadoBadge(estado: EstadoSolicitud) {
  if (estado === 'completada')     return <Badge variant="success">Completada</Badge>
  if (estado === 'en_preparacion') return <Badge variant="info">En preparación</Badge>
  return <Badge variant="warning">Pendiente</Badge>
}

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------

export function SolicitudOperador() {
  // ── Estado solicitudes ───────────────────────────────────────────────────
  const [solicitudes, setSolicitudes] = useState<SolicitudResponse[]>([])
  const [loading, setLoading]         = useState(true)
  const [filtro, setFiltro]           = useState<FiltroEstado>('activas')
  const [accionando, setAccionando]   = useState<number | null>(null)
  const [completandoId, setCompletandoId] = useState<number | null>(null)
  const [notasMap, setNotasMap]       = useState<Record<number, string>>({})
  const [expandidos, setExpandidos]   = useState<Set<number>>(new Set())

  // ── Estado entrega directa ───────────────────────────────────────────────
  const [vista, setVista]             = useState<Vista>('solicitudes')
  const [docentes, setDocentes]       = useState<DocenteBasico[]>([])
  const [salasEntrega, setSalasEntrega] = useState<SalaResponse[]>([])
  const [docenteId, setDocenteId]     = useState<string>('')
  const [salaEntregaId, setSalaEntregaId] = useState<string>('')
  const [busqueda, setBusqueda]       = useState('')
  const [resultados, setResultados]   = useState<InsumoResponse[]>([])
  const [carrito, setCarrito]         = useState<CartItem[]>([])
  const [notasEntrega, setNotasEntrega] = useState('')
  const [enviando, setEnviando]       = useState(false)
  const [buscando, setBuscando]       = useState(false)

  // ── Compartido ───────────────────────────────────────────────────────────
  const [toast, setToast] = useState<string | null>(null)

  function showToast(msg: string) {
    setToast(msg); setTimeout(() => setToast(null), 3500)
  }

  // ── Solicitudes: carga y acciones ────────────────────────────────────────

  function toggleExpand(id: number) {
    setExpandidos(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const cargarSolicitudes = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await api.get<SolicitudResponse[]>('/solicitudes/')
      setSolicitudes(data)
      setExpandidos(new Set(
        data.filter(s => s.estado !== 'completada').map(s => s.id)
      ))
    } catch {
      showToast('Error al cargar las solicitudes. Verifica la conexión.')
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { cargarSolicitudes() }, [cargarSolicitudes])

  async function marcarEnPreparacion(id: number) {
    setAccionando(id)
    try {
      await api.put(`/solicitudes/${id}/en-preparacion`, { notas_operador: null })
      showToast('Solicitud marcada en preparación'); cargarSolicitudes()
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })
        .response?.data?.detail
      showToast(detail ?? 'Error al actualizar la solicitud')
    } finally { setAccionando(null) }
  }

  async function completar(id: number) {
    setAccionando(id)
    try {
      const notas = notasMap[id]?.trim() || null
      await api.post(`/solicitudes/${id}/completar`, { notas_operador: notas })
      showToast('Pedido completado — stock actualizado')
      setCompletandoId(null)
      setNotasMap(prev => { const n = { ...prev }; delete n[id]; return n })
      cargarSolicitudes()
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })
        .response?.data?.detail
      showToast(detail ?? 'Error al completar el pedido')
    } finally { setAccionando(null) }
  }

  const cuentas = {
    activas:        solicitudes.filter(s => s.estado === 'pendiente' || s.estado === 'en_preparacion').length,
    pendientes:     solicitudes.filter(s => s.estado === 'pendiente').length,
    en_preparacion: solicitudes.filter(s => s.estado === 'en_preparacion').length,
    completadas:    solicitudes.filter(s => s.estado === 'completada').length,
  }

  const filtradas = solicitudes.filter(s => {
    if (filtro === 'todas')   return true
    if (filtro === 'activas') return s.estado === 'pendiente' || s.estado === 'en_preparacion'
    return s.estado === filtro
  })

  const FILTROS: { key: FiltroEstado; label: string; count?: number }[] = [
    { key: 'activas',        label: 'Activas',        count: cuentas.activas },
    { key: 'pendiente',      label: 'Pendientes',     count: cuentas.pendientes },
    { key: 'en_preparacion', label: 'En preparación', count: cuentas.en_preparacion },
    { key: 'completada',     label: 'Completadas',    count: cuentas.completadas },
    { key: 'todas',          label: 'Todas' },
  ]

  // ── Entrega directa: carga de datos de apoyo ─────────────────────────────

  useEffect(() => {
    if (vista !== 'entrega') return
    // Docentes
    api.get<{ data: DocenteBasico[] }>('/usuarios/', { params: { limit: 100 } })
      .then(r => setDocentes((r.data.data ?? []).filter(u => u.rol === 'docente')))
      .catch(() => {})
    // Salas — PaginatedResponse
    api.get<{ data: SalaResponse[] }>('/salas/', { params: { limit: 100 } })
      .then(r => setSalasEntrega(r.data.data ?? []))
      .catch(() => {})
  }, [vista])

  async function buscarInsumos() {
    const q = busqueda.trim()
    if (!q) return
    setBuscando(true)
    try {
      const r = await api.get<{ data: InsumoResponse[] }>('/insumos/', {
        params: { nombre: q, limit: 8 },
      })
      setResultados(r.data.data ?? [])
    } catch {
      setResultados([])
    } finally { setBuscando(false) }
  }

  function agregarAlCarrito(insumo: InsumoResponse) {
    setCarrito(prev => {
      const existe = prev.find(i => i.insumo_id === insumo.id)
      if (existe) {
        return prev.map(i =>
          i.insumo_id === insumo.id ? { ...i, cantidad: i.cantidad + 1 } : i
        )
      }
      return [...prev, {
        insumo_id: insumo.id,
        nombre: insumo.nombre,
        cantidad: 1,
        stock_actual: insumo.stock_actual,
        tipo: insumo.tipo,
      }]
    })
    setResultados([])
    setBusqueda('')
  }

  function actualizarCantidad(insumo_id: number, delta: number) {
    setCarrito(prev =>
      prev.map(i => i.insumo_id === insumo_id
        ? { ...i, cantidad: Math.max(1, i.cantidad + delta) }
        : i
      )
    )
  }

  function quitarDelCarrito(insumo_id: number) {
    setCarrito(prev => prev.filter(i => i.insumo_id !== insumo_id))
  }

  async function registrarEntrega() {
    if (!docenteId || !salaEntregaId || carrito.length === 0) return
    setEnviando(true)
    try {
      const body: EntregaDirectaCreate = {
        sala_id: parseInt(salaEntregaId),
        docente_id: parseInt(docenteId),
        items: carrito.map(i => ({ insumo_id: i.insumo_id, cantidad: i.cantidad })),
        notas: notasEntrega.trim() || null,
      }
      const r = await api.post<EntregaDirectaResponse>('/movimientos/entrega-directa', body)
      const { items_procesados, retornos_pendientes } = r.data
      showToast(
        `Entrega registrada: ${items_procesados} ítem(s)` +
        (retornos_pendientes > 0 ? ` · ${retornos_pendientes} retorno(s) pendiente(s)` : '')
      )
      setCarrito([])
      setDocenteId('')
      setSalaEntregaId('')
      setNotasEntrega('')
      setBusqueda('')
      setResultados([])
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })
        ?.response?.data?.detail
      showToast(detail ?? 'Error al registrar la entrega')
    } finally { setEnviando(false) }
  }

  // ── Estilos comunes ───────────────────────────────────────────────────────

  const selectCls = [
    'w-full px-3 py-2 rounded-lg border text-sm',
    'bg-white dark:bg-slate-700',
    'border-slate-200 dark:border-slate-600',
    'text-slate-800 dark:text-slate-50',
    'focus:outline-none focus:ring-2 focus:ring-teal-500',
  ].join(' ')

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Toast */}
      {toast && (
        <div className="fixed top-6 right-6 z-50 flex items-center gap-2 bg-teal-600
                        text-white px-4 py-3 rounded-xl shadow-lg text-sm font-semibold">
          <CheckCircle size={16} />{toast}
        </div>
      )}

      {/* Encabezado */}
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-2xl font-black text-slate-900 dark:text-slate-50
                       flex items-center gap-2">
          <ClipboardList size={24} className="text-teal-600" />
          Solicitudes
        </h1>
        {vista === 'solicitudes' && (
          <button onClick={cargarSolicitudes}
            className="flex items-center gap-2 px-3 py-2 rounded-lg border
                       border-slate-200 dark:border-slate-600
                       text-slate-500 dark:text-slate-400
                       hover:bg-slate-50 dark:hover:bg-slate-700 text-sm transition-colors">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Actualizar
          </button>
        )}
      </div>

      {/* Tabs vista principal */}
      <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl w-fit mb-5">
        <button onClick={() => setVista('solicitudes')}
          className={[
            'flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-semibold transition-all',
            vista === 'solicitudes'
              ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-50 shadow-sm'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300',
          ].join(' ')}>
          <ClipboardList size={14} />
          Solicitudes de retiro
          {cuentas.activas > 0 && (
            <span className={[
              'ml-1 text-xs px-1.5 py-0.5 rounded-full font-bold',
              vista === 'solicitudes'
                ? 'bg-teal-100 text-teal-700 dark:bg-teal-900/50 dark:text-teal-300'
                : 'bg-slate-200 text-slate-500 dark:bg-slate-700 dark:text-slate-400',
            ].join(' ')}>
              {cuentas.activas}
            </span>
          )}
        </button>
        <button onClick={() => setVista('entrega')}
          className={[
            'flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-semibold transition-all',
            vista === 'entrega'
              ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-50 shadow-sm'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300',
          ].join(' ')}>
          <Zap size={14} />
          Entrega directa
        </button>
      </div>

      {/* ─── Vista: Solicitudes de retiro ──────────────────────────────────── */}
      {vista === 'solicitudes' && (
        <>
          <div className="flex gap-1.5 flex-wrap mb-5">
            {FILTROS.map(f => (
              <button key={f.key} onClick={() => setFiltro(f.key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                  filtro === f.key
                    ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}>
                {f.label}
                {f.count !== undefined && (
                  <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] font-black ${
                    filtro === f.key
                      ? 'bg-white/20 text-white dark:bg-slate-900/20 dark:text-slate-900'
                      : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400'
                  }`}>{f.count}</span>
                )}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="bg-white dark:bg-slate-800 rounded-xl
                                        border border-slate-200 dark:border-slate-700 p-5">
                  <div className="skeleton h-4 w-48 rounded mb-3" />
                  <div className="skeleton h-3 w-32 rounded mb-2" />
                  <div className="skeleton h-3 w-64 rounded" />
                </div>
              ))}
            </div>
          ) : filtradas.length === 0 ? (
            <div className="bg-white dark:bg-slate-800 rounded-xl
                            border border-slate-200 dark:border-slate-700 p-10 text-center">
              <ClipboardList size={28} className="mx-auto mb-2 text-slate-300" />
              <p className="text-sm font-semibold text-slate-400">
                No hay solicitudes en esta categoría.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filtradas.map(sol => {
                const { border, chip } = urgenciaConfig(sol)
                const estaCompletando = completandoId === sol.id
                const estaExpandido   = expandidos.has(sol.id)

                return (
                  <div key={sol.id}
                    className={`bg-white dark:bg-slate-800 rounded-xl
                                border border-slate-200 dark:border-slate-700
                                border-l-4 shadow-sm overflow-hidden ${border}`}>
                    <div className="px-5 py-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            {estadoBadge(sol.estado)}
                            {chip}
                          </div>
                          <p className="text-base font-bold text-slate-900 dark:text-slate-50">
                            {sol.docente_nombre}
                          </p>
                          {sol.asignatura_nombre && (
                            <p className="text-xs text-blue-600 dark:text-blue-400 font-semibold mt-0.5">
                              <GraduationCap size={10} className="inline mr-1" />
                              {sol.asignatura_nombre} · Secc. {sol.seccion} · {sol.semestre}
                            </p>
                          )}
                          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                            {sol.sala_nombre}{' '}
                            <span className="text-slate-300 dark:text-slate-600">·</span>{' '}
                            {formatFechaClase(sol.fecha_clase)}
                          </p>
                        </div>
                        <button onClick={() => toggleExpand(sol.id)}
                          className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100
                                     dark:hover:bg-slate-700 transition-colors flex-shrink-0">
                          {estaExpandido ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                        </button>
                      </div>
                    </div>

                    {estaExpandido && (
                      <div className="px-5 pb-1 border-t border-slate-100 dark:border-slate-700">
                        <ul className="mt-3 space-y-1.5 mb-3">
                          {sol.items.map(item => (
                            <li key={item.id} className="flex items-center gap-2 text-sm">
                              <Package size={12} className="text-slate-300 flex-shrink-0" />
                              <span className="flex-1 text-slate-700 dark:text-slate-300 truncate">
                                {item.insumo_nombre}
                              </span>
                              <span className="font-bold text-slate-900 dark:text-slate-50">
                                x{item.cantidad_solicitada}
                              </span>
                            </li>
                          ))}
                        </ul>
                        {sol.notas && (
                          <p className="text-xs text-slate-500 bg-slate-50 dark:bg-slate-700/50
                                        rounded-lg px-3 py-2 mb-3">
                            <strong>Docente:</strong> {sol.notas}
                          </p>
                        )}
                        {sol.notas_operador && (
                          <p className="text-xs text-teal-700 dark:text-teal-300
                                        bg-teal-50 dark:bg-teal-900/30 rounded-lg px-3 py-2 mb-3">
                            <strong>Operador:</strong> {sol.notas_operador}
                          </p>
                        )}
                        {sol.fecha_completada && (
                          <p className="text-xs text-slate-400 mb-3">
                            Completada: {formatFechaClase(sol.fecha_completada)}
                          </p>
                        )}
                      </div>
                    )}

                    {sol.estado === 'pendiente' && (
                      <div className="px-5 pb-4">
                        <button onClick={() => marcarEnPreparacion(sol.id)}
                          disabled={accionando === sol.id}
                          className="flex items-center gap-2 px-4 py-2 rounded-xl
                                     bg-blue-600 hover:bg-blue-700 text-white text-sm
                                     font-bold transition-colors disabled:opacity-50">
                          {accionando === sol.id ? 'Actualizando...' : 'Marcar en preparación'}
                        </button>
                      </div>
                    )}

                    {sol.estado === 'en_preparacion' && (
                      <div className="px-5 pb-4">
                        {!estaCompletando ? (
                          <button onClick={() => setCompletandoId(sol.id)}
                            className="flex items-center gap-2 px-4 py-2 rounded-xl
                                       bg-teal-600 hover:bg-teal-700 text-white text-sm
                                       font-bold transition-colors">
                            Completar pedido
                          </button>
                        ) : (
                          <div className="space-y-2">
                            <textarea rows={2}
                              value={notasMap[sol.id] ?? ''}
                              onChange={e => setNotasMap(prev => ({
                                ...prev, [sol.id]: e.target.value
                              }))}
                              placeholder="Notas del operador (opcional)..."
                              className="w-full px-3 py-2 rounded-lg border
                                         border-slate-200 dark:border-slate-600
                                         text-sm focus:outline-none focus:ring-2
                                         focus:ring-teal-500 placeholder:text-slate-400
                                         resize-none bg-slate-50 dark:bg-slate-700
                                         text-slate-800 dark:text-slate-50
                                         focus:bg-white dark:focus:bg-slate-600"
                            />
                            <div className="flex gap-2">
                              <button onClick={() => setCompletandoId(null)}
                                className="px-3 py-2 rounded-xl border
                                           border-slate-200 dark:border-slate-600
                                           text-slate-600 dark:text-slate-400 text-sm
                                           font-bold hover:bg-slate-50 dark:hover:bg-slate-700
                                           transition-colors">
                                Cancelar
                              </button>
                              <button onClick={() => completar(sol.id)}
                                disabled={accionando === sol.id}
                                className="flex items-center gap-2 px-4 py-2 rounded-xl
                                           bg-teal-600 hover:bg-teal-700 text-white
                                           text-sm font-bold transition-colors
                                           disabled:opacity-50">
                                <CheckCircle size={14} />
                                {accionando === sol.id ? 'Completando...' : 'Confirmar despacho'}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}

      {/* ─── Vista: Entrega directa ─────────────────────────────────────────── */}
      {vista === 'entrega' && (
        <div className="space-y-5">
          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200
                          dark:border-amber-700/50 rounded-xl px-4 py-3 text-sm
                          text-amber-800 dark:text-amber-300">
            <strong>Entrega presencial inmediata.</strong> Úsala cuando el docente
            está en el pañol y retira insumos en el momento, sin solicitud previa.
            El registro queda en el historial de movimientos y en retornos pendientes.
          </div>

          {/* Docente y sala */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl border
                          border-slate-200 dark:border-slate-700 p-5 space-y-4">
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-50">
              1. Información del retiro
            </h2>

            <div>
              <label className="block text-sm font-semibold text-slate-700
                                dark:text-slate-300 mb-1">
                Docente *
              </label>
              <select className={selectCls} value={docenteId}
                onChange={e => setDocenteId(e.target.value)}>
                <option value="">Seleccionar docente…</option>
                {docentes.map(d => (
                  <option key={d.id} value={d.id}>
                    {d.nombre} — {d.email}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700
                                dark:text-slate-300 mb-1">
                Sala *
              </label>
              <select className={selectCls} value={salaEntregaId}
                onChange={e => setSalaEntregaId(e.target.value)}>
                <option value="">Seleccionar sala…</option>
                {salasEntrega.map(s => (
                  <option key={s.id} value={s.id}>{s.nombre}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700
                                dark:text-slate-300 mb-1">
                Observaciones (opcional)
              </label>
              <textarea rows={2} className={selectCls + ' resize-none'}
                value={notasEntrega}
                onChange={e => setNotasEntrega(e.target.value)}
                placeholder="Ej: clase de urgencias, reposición de emergencia…" />
            </div>
          </div>

          {/* Buscador de insumos */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl border
                          border-slate-200 dark:border-slate-700 p-5 space-y-3">
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-50">
              2. Insumos a entregar
            </h2>

            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2
                                             text-slate-400 pointer-events-none" />
                <input
                  className={selectCls + ' pl-9'}
                  value={busqueda}
                  onChange={e => setBusqueda(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && buscarInsumos()}
                  placeholder="Buscar insumo por nombre…"
                />
              </div>
              <button onClick={buscarInsumos} disabled={buscando || !busqueda.trim()}
                className="px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white
                           text-sm font-semibold disabled:opacity-50 transition-colors
                           flex items-center gap-1.5">
                {buscando ? <RefreshCw size={14} className="animate-spin" /> : <Search size={14} />}
                Buscar
              </button>
            </div>

            {/* Resultados */}
            {resultados.length > 0 && (
              <div className="border border-slate-200 dark:border-slate-600 rounded-xl
                              divide-y divide-slate-100 dark:divide-slate-700 overflow-hidden">
                {resultados.map(ins => (
                  <button key={ins.id} onClick={() => agregarAlCarrito(ins)}
                    className="w-full flex items-center justify-between px-4 py-3 text-sm
                               hover:bg-teal-50 dark:hover:bg-teal-900/20 transition-colors
                               text-left">
                    <div>
                      <span className="font-semibold text-slate-800 dark:text-slate-100">
                        {ins.nombre}
                      </span>
                      {ins.tipo === 'implemento' && (
                        <span className="ml-2 text-xs text-violet-600 dark:text-violet-400
                                         font-semibold">
                          implemento
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0 ml-3">
                      <span className={`text-xs font-bold ${
                        ins.stock_actual === 0
                          ? 'text-rose-500'
                          : ins.stock_actual <= ins.stock_minimo
                          ? 'text-amber-500'
                          : 'text-emerald-600 dark:text-emerald-400'
                      }`}>
                        stock: {ins.stock_actual}
                      </span>
                      <Plus size={14} className="text-teal-500" />
                    </div>
                  </button>
                ))}
              </div>
            )}

            {resultados.length === 0 && busqueda && !buscando && (
              <p className="text-sm text-slate-400 text-center py-2">
                Presiona "Buscar" o Enter para buscar insumos
              </p>
            )}

            {/* Carrito */}
            {carrito.length > 0 ? (
              <div className="space-y-2 mt-1">
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                  Insumos a entregar
                </p>
                {carrito.map(item => (
                  <div key={item.insumo_id}
                    className="flex items-center gap-3 bg-slate-50 dark:bg-slate-700/50
                               rounded-xl px-4 py-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">
                        {item.nombre}
                      </p>
                      {item.cantidad > item.stock_actual && (
                        <p className="text-xs text-rose-500 font-semibold mt-0.5">
                          ⚠ Cantidad supera el stock disponible ({item.stock_actual})
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <button onClick={() => actualizarCantidad(item.insumo_id, -1)}
                        className="w-7 h-7 rounded-lg bg-slate-200 dark:bg-slate-600
                                   hover:bg-slate-300 dark:hover:bg-slate-500
                                   flex items-center justify-center transition-colors">
                        <Minus size={12} />
                      </button>
                      <span className="w-8 text-center text-sm font-bold
                                       text-slate-900 dark:text-slate-50">
                        {item.cantidad}
                      </span>
                      <button onClick={() => actualizarCantidad(item.insumo_id, 1)}
                        className="w-7 h-7 rounded-lg bg-slate-200 dark:bg-slate-600
                                   hover:bg-slate-300 dark:hover:bg-slate-500
                                   flex items-center justify-center transition-colors">
                        <Plus size={12} />
                      </button>
                    </div>
                    <button onClick={() => quitarDelCarrito(item.insumo_id)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500
                                 hover:bg-rose-50 dark:hover:bg-rose-900/30 transition-colors">
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-400 dark:text-slate-500 text-center py-4">
                Busca y agrega insumos para la entrega
              </p>
            )}
          </div>

          {/* Botón registrar */}
          <button
            onClick={registrarEntrega}
            disabled={enviando || !docenteId || !salaEntregaId || carrito.length === 0}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl
                       bg-teal-600 hover:bg-teal-700 text-white font-bold text-sm
                       disabled:opacity-50 disabled:cursor-not-allowed transition-colors
                       shadow-sm">
            {enviando
              ? <><RefreshCw size={16} className="animate-spin" /> Registrando…</>
              : <><Zap size={16} /> Registrar entrega</>
            }
          </button>
        </div>
      )}
    </div>
  )
}
