import { useEffect, useState, useCallback } from 'react'
import {
  ClipboardList, RefreshCw, CheckCircle, Clock,
  AlertTriangle, ChevronDown, ChevronUp, Package, GraduationCap
} from 'lucide-react'
import { api } from '../api/client'
import type { SolicitudResponse, EstadoSolicitud } from '../types/api'
import { Badge } from '../components/ui/Badge'

type FiltroEstado = EstadoSolicitud | 'todas' | 'activas'

function urgenciaConfig(sol: SolicitudResponse) {
  if (sol.estado === 'completada')    return { border: 'border-l-slate-200', chip: null }
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

export function SolicitudOperador() {
  const [solicitudes, setSolicitudes] = useState<SolicitudResponse[]>([])
  const [loading, setLoading]         = useState(true)
  const [filtro, setFiltro]           = useState<FiltroEstado>('activas')
  const [accionando, setAccionando]   = useState<number | null>(null)
  const [completandoId, setCompletandoId] = useState<number | null>(null)
  const [notasMap, setNotasMap]       = useState<Record<number, string>>({})
  const [expandidos, setExpandidos]   = useState<Set<number>>(new Set())
  const [toast, setToast]             = useState<string | null>(null)

  function showToast(msg: string) {
    setToast(msg); setTimeout(() => setToast(null), 3000)
  }

  function toggleExpand(id: number) {
    setExpandidos(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const cargar = useCallback(async () => {
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

  useEffect(() => { cargar() }, [cargar])

  const filtradas = solicitudes.filter(s => {
    if (filtro === 'todas')   return true
    if (filtro === 'activas') return s.estado === 'pendiente' || s.estado === 'en_preparacion'
    return s.estado === filtro
  })

  async function marcarEnPreparacion(id: number) {
    setAccionando(id)
    try {
      await api.put(`/solicitudes/${id}/en-preparacion`, { notas_operador: null })
      showToast('Solicitud marcada en preparación'); cargar()
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
      cargar()
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

  const FILTROS: { key: FiltroEstado; label: string; count?: number }[] = [
    { key: 'activas',        label: 'Activas',        count: cuentas.activas },
    { key: 'pendiente',      label: 'Pendientes',     count: cuentas.pendientes },
    { key: 'en_preparacion', label: 'En preparación', count: cuentas.en_preparacion },
    { key: 'completada',     label: 'Completadas',    count: cuentas.completadas },
    { key: 'todas',          label: 'Todas' },
  ]

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {toast && (
        <div className="fixed top-6 right-6 z-50 flex items-center gap-2 bg-teal-600
                        text-white px-4 py-3 rounded-xl shadow-lg text-sm font-semibold">
          <CheckCircle size={16} />{toast}
        </div>
      )}

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-black text-slate-900 flex items-center gap-2">
            <ClipboardList size={24} className="text-teal-600" />
            Solicitudes de retiro
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            {loading ? '...' : `${filtradas.length} solicitudes`}
          </p>
        </div>
        <button onClick={cargar}
          className="flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200
                     text-slate-500 hover:bg-slate-50 text-sm transition-colors">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Actualizar
        </button>
      </div>

      <div className="flex gap-1.5 flex-wrap mb-5">
        {FILTROS.map(f => (
          <button key={f.key} onClick={() => setFiltro(f.key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
              filtro === f.key
                ? 'bg-slate-900 text-white'
                : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
            }`}>
            {f.label}
            {f.count !== undefined && (
              <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] font-black ${
                filtro === f.key ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-600'
              }`}>{f.count}</span>
            )}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-slate-200 p-5">
              <div className="skeleton h-4 w-48 rounded mb-3" />
              <div className="skeleton h-3 w-32 rounded mb-2" />
              <div className="skeleton h-3 w-64 rounded" />
            </div>
          ))}
        </div>
      ) : filtradas.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-10 text-center">
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
                className={`bg-white rounded-xl border border-slate-200 border-l-4
                             shadow-sm overflow-hidden ${border}`}>
                <div className="px-5 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        {estadoBadge(sol.estado)}
                        {chip}
                      </div>
                      <p className="text-base font-bold text-slate-900">{sol.docente_nombre}</p>
                      {/* Trazabilidad academica — visible cuando la clase esta especificada */}
                      {sol.asignatura_nombre && (
                        <p className="text-xs text-blue-600 font-semibold mt-0.5">
                          <GraduationCap size={10} className="inline mr-1" />
                          {sol.asignatura_nombre} · Secc. {sol.seccion} · {sol.semestre}
                        </p>
                      )}
                      <p className="text-sm text-slate-500 mt-0.5">
                        {sol.sala_nombre}{' '}
                        <span className="text-slate-300">·</span>{' '}
                        {formatFechaClase(sol.fecha_clase)}
                      </p>
                    </div>
                    <button
                      onClick={() => toggleExpand(sol.id)}
                      className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100
                                 transition-colors flex-shrink-0"
                    >
                      {estaExpandido ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </button>
                  </div>
                </div>

                {estaExpandido && (
                  <div className="px-5 pb-1 border-t border-slate-100">
                    <ul className="mt-3 space-y-1.5 mb-3">
                      {sol.items.map(item => (
                        <li key={item.id} className="flex items-center gap-2 text-sm">
                          <Package size={12} className="text-slate-300 flex-shrink-0" />
                          <span className="flex-1 text-slate-700 truncate">{item.insumo_nombre}</span>
                          <span className="font-bold text-slate-900">x{item.cantidad_solicitada}</span>
                        </li>
                      ))}
                    </ul>
                    {sol.notas && (
                      <p className="text-xs text-slate-500 bg-slate-50 rounded-lg px-3 py-2 mb-3">
                        <strong>Docente:</strong> {sol.notas}
                      </p>
                    )}
                    {sol.notas_operador && (
                      <p className="text-xs text-teal-700 bg-teal-50 rounded-lg px-3 py-2 mb-3">
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
                          onChange={e => setNotasMap(prev => ({ ...prev, [sol.id]: e.target.value }))}
                          placeholder="Notas del operador (opcional)..."
                          className="w-full px-3 py-2 rounded-lg border border-slate-200
                                     text-sm focus:outline-none focus:ring-2
                                     focus:ring-teal-500 placeholder:text-slate-400
                                     resize-none bg-slate-50 focus:bg-white"
                        />
                        <div className="flex gap-2">
                          <button onClick={() => setCompletandoId(null)}
                            className="px-3 py-2 rounded-xl border border-slate-200
                                       text-slate-600 text-sm font-bold
                                       hover:bg-slate-50 transition-colors">Cancelar</button>
                          <button onClick={() => completar(sol.id)}
                            disabled={accionando === sol.id}
                            className="flex items-center gap-2 px-4 py-2 rounded-xl
                                       bg-teal-600 hover:bg-teal-700 text-white
                                       text-sm font-bold transition-colors disabled:opacity-50">
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
    </div>
  )
}
