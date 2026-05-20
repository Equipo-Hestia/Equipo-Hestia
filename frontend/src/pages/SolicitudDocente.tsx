import { useEffect, useState, useCallback, useRef } from 'react'
import {
  ClipboardList, Search, Plus, Trash2, CheckCircle,
  AlertTriangle, Clock, ChevronDown, ChevronUp, Package,
  Info, GraduationCap, Calendar
} from 'lucide-react'
import { api } from '../api/client'
import type {
  SalaResponse, InsumoResponse, SolicitudResponse,
  PaginatedResponse, EstadoSolicitud, ClaseDocenteResponse
} from '../types/api'
import { Badge } from '../components/ui/Badge'

interface CartItem {
  insumo: InsumoResponse
  cantidad: number
}

const MIN_ANTICIPACION_MS = 2 * 60 * 60 * 1000
const MAX_ANTICIPACION_MS = 7 * 24 * 60 * 60 * 1000

// JS getDay(): 0=Dom 1=Lun 2=Mar 3=Mie 4=Jue 5=Vie 6=Sab
const DIA_A_GETDAY: Record<string, number> = {
  lunes: 1, martes: 2, miercoles: 3, jueves: 4, viernes: 5,
}

function calcularSesiones(clase: ClaseDocenteResponse): Date[] {
  if (!clase.dia_semana || !clase.hora_inicio) return []
  const targetDay = DIA_A_GETDAY[clase.dia_semana.toLowerCase()]
  if (targetDay === undefined) return []
  const [hh, mm] = clase.hora_inicio.split(':').map(Number)
  const ahora = Date.now()
  const limiteMin = ahora + MIN_ANTICIPACION_MS
  const limiteMax = ahora + MAX_ANTICIPACION_MS
  const sesiones: Date[] = []
  for (let i = 0; i <= 7; i++) {
    const d = new Date()
    d.setDate(d.getDate() + i)
    d.setHours(hh, mm, 0, 0)
    if (
      d.getDay() === targetDay &&
      d.getTime() >= limiteMin &&
      d.getTime() <= limiteMax
    ) {
      sesiones.push(new Date(d))
    }
  }
  return sesiones
}

function formatearSesion(d: Date, clase: ClaseDocenteResponse): string {
  const fecha = d.toLocaleDateString('es-CL', {
    weekday: 'long', day: 'numeric', month: 'long',
  })
  const inicio = clase.hora_inicio ?? ''
  const fin = clase.hora_fin ? ` — ${clase.hora_fin}` : ''
  const cap = fecha.charAt(0).toUpperCase() + fecha.slice(1)
  return `${cap} · ${inicio}${fin}`
}

function toDatetimeLocal(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  )
}

function estadoBadge(estado: EstadoSolicitud) {
  if (estado === 'completada')     return <Badge variant="success">Completada</Badge>
  if (estado === 'en_preparacion') return <Badge variant="info">En preparación</Badge>
  return <Badge variant="warning">Pendiente</Badge>
}

function formatFechaClase(iso: string) {
  return new Date(iso).toLocaleString('es-CL', {
    weekday: 'short', day: '2-digit', month: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

function urgenciaBadge(minutos: number) {
  if (minutos < 0) return null
  if (minutos <= 30) {
    return (
      <span className="flex items-center gap-1 text-xs font-bold text-rose-600">
        <AlertTriangle size={11} /> Menos de {minutos < 1 ? 1 : minutos} min
      </span>
    )
  }
  if (minutos <= 60) {
    return (
      <span className="flex items-center gap-1 text-xs font-bold text-amber-600">
        <Clock size={11} /> {minutos} min
      </span>
    )
  }
  return null
}

export function SolicitudDocente() {
  const [misClases, setMisClases]       = useState<ClaseDocenteResponse[]>([])
  const [salas, setSalas]               = useState<SalaResponse[]>([])
  const [claseDocenteId, setClaseId]    = useState<number | null>(null)
  const [sesionSeleccionada, setSesion] = useState<Date | null>(null)
  const [salaId, setSalaId]             = useState('')
  const [fechaClase, setFechaClase]     = useState('')
  const [notas, setNotas]               = useState('')
  const [cartItems, setCartItems]       = useState<CartItem[]>([])
  const [submitting, setSubmitting]     = useState(false)
  const [submitError, setSubmitError]   = useState<string | null>(null)
  const [toast, setToast]               = useState<string | null>(null)
  const [showWarning, setShowWarning]   = useState(false)

  const [query, setQuery]               = useState('')
  const [searchResults, setSearch]      = useState<InsumoResponse[]>([])
  const [searchLoading, setSearchLoad]  = useState(false)
  const [showDropdown, setDropdown]     = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const searchRef   = useRef<HTMLDivElement>(null)

  const [historial, setHistorial]       = useState<SolicitudResponse[]>([])
  const [loadingH, setLoadingH]         = useState(true)
  const [expandido, setExpandido]       = useState<number | null>(null)

  function showToast(msg: string) {
    setToast(msg); setTimeout(() => setToast(null), 3500)
  }

  const claseSeleccionada = misClases.find(c => c.id === claseDocenteId) ?? null
  const tieneHorario = !!(
    claseSeleccionada?.dia_semana && claseSeleccionada?.hora_inicio
  )
  const sesiones = claseSeleccionada && tieneHorario
    ? calcularSesiones(claseSeleccionada) : []
  const salaAutoFill = !!(claseSeleccionada?.sala_id)

  const fechaMin = toDatetimeLocal(new Date(Date.now() + MIN_ANTICIPACION_MS))
  const fechaMax = toDatetimeLocal(new Date(Date.now() + MAX_ANTICIPACION_MS))

  useEffect(() => { setSesion(null); setFechaClase('') }, [claseDocenteId])

  useEffect(() => {
    Promise.all([
      api.get<PaginatedResponse<SalaResponse>>('/salas/', { params: { limit: 200 } }),
      api.get<ClaseDocenteResponse[]>('/clases-docente/mis-clases'),
    ]).then(([s, c]) => {
      setSalas(s.data.data)
      setMisClases(c.data)
    }).catch(() => showToast('No se pudieron cargar los datos iniciales.'))
  }, [])

  const cargarHistorial = useCallback(async () => {
    setLoadingH(true)
    try {
      const { data } = await api.get<SolicitudResponse[]>('/solicitudes/mis-solicitudes')
      setHistorial(data)
    } catch {
      showToast('Error al cargar el historial.')
    } finally { setLoadingH(false) }
  }, [])

  useEffect(() => { cargarHistorial() }, [cargarHistorial])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (query.trim().length < 2) { setSearch([]); setDropdown(false); return }
    debounceRef.current = setTimeout(async () => {
      setSearchLoad(true)
      try {
        const { data } = await api.get<PaginatedResponse<InsumoResponse>>('/insumos/', {
          params: { nombre: query.trim(), limit: 8 },
        })
        setSearch(data.data.filter(i => i.activo && i.stock_actual > 0))
        setDropdown(true)
      } finally { setSearchLoad(false) }
    }, 280)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [query])

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setDropdown(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  function agregarAlCarrito(insumo: InsumoResponse) {
    setQuery(''); setDropdown(false)
    setCartItems(prev => {
      const existente = prev.find(i => i.insumo.id === insumo.id)
      if (existente) {
        return prev.map(i =>
          i.insumo.id === insumo.id
            ? { ...i, cantidad: Math.min(i.cantidad + 1, insumo.stock_actual) }
            : i
        )
      }
      return [...prev, { insumo, cantidad: 1 }]
    })
  }

  function setCantidad(insumoId: number, valor: number) {
    setCartItems(prev =>
      prev.map(i =>
        i.insumo.id === insumoId
          ? { ...i, cantidad: Math.max(1, Math.min(valor, i.insumo.stock_actual)) }
          : i
      )
    )
  }

  function eliminarDelCarrito(insumoId: number) {
    setCartItems(prev => prev.filter(i => i.insumo.id !== insumoId))
  }

  function handlePreSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitError(null)

    if (!claseDocenteId) {
      setSubmitError('Selecciona la clase para la que necesitas los insumos.')
      return
    }
    if (tieneHorario) {
      if (!sesionSeleccionada) {
        setSubmitError('Selecciona la sesión de tu clase.')
        return
      }
    } else {
      if (!fechaClase) {
        setSubmitError('Indica la fecha y hora de tu clase.')
        return
      }
      const diff = new Date(fechaClase).getTime() - Date.now()
      if (diff < MIN_ANTICIPACION_MS) {
        setSubmitError('Debes solicitar con al menos 2 horas de anticipación.')
        return
      }
      if (diff > MAX_ANTICIPACION_MS) {
        setSubmitError('Solo puedes solicitar hasta 7 días antes de tu clase.')
        return
      }
    }
    const salaIdFinal = claseSeleccionada?.sala_id ?? (salaId ? parseInt(salaId) : null)
    if (!salaIdFinal) {
      setSubmitError('La clase no tiene sala asignada. Selecciona una manualmente.')
      return
    }
    if (cartItems.length === 0) {
      setSubmitError('Agrega al menos un insumo al carrito.')
      return
    }
    setShowWarning(true)
  }

  async function handleConfirmSubmit() {
    setShowWarning(false)
    setSubmitting(true)
    const fechaClaseISO = tieneHorario && sesionSeleccionada
      ? sesionSeleccionada.toISOString()
      : new Date(fechaClase).toISOString()
    const salaIdFinal = claseSeleccionada?.sala_id ?? parseInt(salaId)
    try {
      await api.post('/solicitudes/', {
        sala_id: salaIdFinal,
        fecha_clase: fechaClaseISO,
        notas: notas.trim() || null,
        clase_docente_id: claseDocenteId,
        items: cartItems.map(i => ({
          insumo_id: i.insumo.id,
          cantidad_solicitada: i.cantidad,
        })),
      })
      setClaseId(null); setSesion(null); setSalaId('')
      setFechaClase(''); setNotas(''); setCartItems([])
      showToast('Solicitud enviada correctamente')
      cargarHistorial()
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })
        .response?.data?.detail
      setSubmitError(detail ?? 'Error al enviar la solicitud.')
    } finally { setSubmitting(false) }
  }

  const inputCls = `w-full px-3 py-2.5 rounded-lg border border-slate-200 text-slate-900
    text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 bg-slate-50
    focus:bg-white placeholder:text-slate-400 transition-all`
  const totalItems = cartItems.reduce((s, i) => s + i.cantidad, 0)

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {toast && (
        <div className="fixed top-6 right-6 z-50 flex items-center gap-2 bg-teal-600
                        text-white px-4 py-3 rounded-xl shadow-lg text-sm font-semibold">
          <CheckCircle size={16} />{toast}
        </div>
      )}

      {/* Modal de advertencia */}
      {showWarning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4
                        bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6
                          border border-amber-200">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-amber-100 border border-amber-200
                              flex items-center justify-center flex-shrink-0">
                <AlertTriangle size={20} className="text-amber-600" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 mb-1">
                  Compromiso de uso de insumos
                </h3>
                <p className="text-sm text-slate-600 leading-relaxed">
                  Confirmas que utilizarás{' '}
                  <strong>la totalidad</strong>{' '}
                  de los insumos pedidos. El no uso genera{' '}
                  <strong className="text-amber-700">mermas</strong>{' '}
                  y puede derivar en{' '}
                  <strong>llamados de atención formal</strong>.
                </p>
              </div>
            </div>

            {claseSeleccionada && (
              <div className="flex items-center gap-2 bg-blue-50 border border-blue-200
                              rounded-xl px-4 py-2.5 mb-4">
                <GraduationCap size={13} className="text-blue-500 flex-shrink-0" />
                <p className="text-xs font-semibold text-blue-700">
                  {claseSeleccionada.asignatura_nombre}{' · '}
                  Secc. {claseSeleccionada.seccion}{' · '}
                  {claseSeleccionada.semestre}
                </p>
              </div>
            )}

            <div className="bg-slate-50 rounded-xl border border-slate-200 px-4 py-3 mb-5">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-2">
                Insumos a retirar
              </p>
              <ul className="space-y-1.5">
                {cartItems.map(({ insumo, cantidad }) => (
                  <li key={insumo.id}
                    className="flex items-center justify-between text-sm">
                    <span className="text-slate-700 truncate mr-4">{insumo.nombre}</span>
                    <span className="font-bold text-slate-900">x{cantidad}</span>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-slate-400 mt-2 pt-2 border-t border-slate-200">
                Total:{' '}
                <strong className="text-slate-600">{totalItems} unidades</strong>
              </p>
            </div>

            <div className="flex gap-3">
              <button type="button" onClick={() => setShowWarning(false)}
                className="flex-1 py-2.5 rounded-xl border border-slate-200
                           text-slate-600 font-semibold text-sm hover:bg-slate-50">
                Cancelar
              </button>
              <button type="button" onClick={handleConfirmSubmit} disabled={submitting}
                className="flex-1 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700
                           text-white font-bold text-sm disabled:opacity-50">
                {submitting ? 'Enviando...' : 'Confirmar y enviar'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="mb-6">
        <h1 className="text-2xl font-black text-slate-900 flex items-center gap-2">
          <ClipboardList size={24} className="text-teal-600" />
          Retiro de insumos
        </h1>
        <p className="text-slate-500 text-sm mt-1">
          Solicita los insumos que necesitas para tu clase.
        </p>
      </div>

      {/* Sin clases asignadas */}
      {misClases.length === 0 ? (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-8 text-center">
          <GraduationCap size={36} className="mx-auto mb-3 text-amber-400" />
          <p className="font-bold text-amber-800 mb-1">Sin clases asignadas</p>
          <p className="text-sm text-amber-700 max-w-sm mx-auto">
            No tienes clases registradas para el semestre en curso.
            Contacta al administrador para que importe tu horario académico.
          </p>
        </div>
      ) : (
        <form onSubmit={handlePreSubmit}>
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 mb-6">
            <h2 className="text-sm font-bold text-slate-700 mb-4">Nueva solicitud</h2>

            {/* Selector de clase (obligatorio) */}
            <div className="mb-4">
              <label className="block text-xs font-bold text-slate-500 uppercase
                               tracking-wide mb-1.5">
                <GraduationCap size={11} className="inline mr-1" />
                ¿Para qué clase es esta solicitud? *
              </label>
              <select
                required
                value={claseDocenteId ?? ''}
                onChange={e => setClaseId(e.target.value ? parseInt(e.target.value) : null)}
                className={`${inputCls} cursor-pointer`}>
                <option value="">Seleccionar clase...</option>
                {misClases.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.asignatura_nombre} — Secc. {c.seccion} ({c.semestre})
                  </option>
                ))}
              </select>
            </div>

            {/* Sesión o datetime-local según si la clase tiene horario */}
            {claseSeleccionada && (
              <div className="mb-4">
                {tieneHorario ? (
                  sesiones.length > 0 ? (
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase
                                       tracking-wide mb-1.5">
                        <Calendar size={11} className="inline mr-1" />
                        ¿Qué sesión necesitas? *
                      </label>
                      <select
                        required
                        value={sesionSeleccionada ? sesionSeleccionada.toISOString() : ''}
                        onChange={e =>
                          setSesion(e.target.value ? new Date(e.target.value) : null)
                        }
                        className={`${inputCls} cursor-pointer`}>
                        <option value="">Seleccionar sesión...</option>
                        {sesiones.map((s, i) => (
                          <option key={i} value={s.toISOString()}>
                            {formatearSesion(s, claseSeleccionada)}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <div className="flex items-start gap-2 bg-amber-50 border border-amber-200
                                    rounded-xl p-3">
                      <AlertTriangle size={14}
                        className="text-amber-500 flex-shrink-0 mt-0.5" />
                      <p className="text-xs text-amber-700 leading-relaxed">
                        No hay sesiones de{' '}
                        <strong className="capitalize">
                          {claseSeleccionada.dia_semana}s
                        </strong>{' '}
                        disponibles en los próximos 7 días dentro de la
                        ventana de 2 horas mínima.
                      </p>
                    </div>
                  )
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-start gap-2 bg-slate-50 border
                                    border-slate-200 rounded-xl p-3">
                      <Info size={13}
                        className="text-slate-400 flex-shrink-0 mt-0.5" />
                      <p className="text-xs text-slate-500">
                        Esta clase aún no tiene horario importado.
                        Ingresa la fecha y hora manualmente.
                      </p>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500
                                       uppercase tracking-wide mb-1.5">
                        Fecha y hora de clase *
                      </label>
                      <input
                        type="datetime-local"
                        value={fechaClase}
                        min={fechaMin}
                        max={fechaMax}
                        onChange={e => setFechaClase(e.target.value)}
                        className={inputCls}
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Sala: automática desde clase o selector manual */}
            {claseSeleccionada && (
              salaAutoFill ? (
                <div className="mb-4">
                  <label className="block text-xs font-bold text-slate-500
                                   uppercase tracking-wide mb-1.5">
                    Sala (automático)
                  </label>
                  <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg
                                  bg-teal-50 border border-teal-200">
                    <CheckCircle size={13} className="text-teal-600 flex-shrink-0" />
                    <span className="text-sm font-semibold text-teal-800">
                      {claseSeleccionada.sala_nombre}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="mb-4">
                  <label className="block text-xs font-bold text-slate-500
                                   uppercase tracking-wide mb-1.5">Sala *</label>
                  <select value={salaId}
                    onChange={e => setSalaId(e.target.value)}
                    className={`${inputCls} cursor-pointer`}>
                    <option value="">Seleccionar sala...</option>
                    {salas.map(s => (
                      <option key={s.id} value={s.id}>{s.nombre}</option>
                    ))}
                  </select>
                </div>
              )
            )}

            {/* Aviso ventana (solo en modo manual) */}
            {claseSeleccionada && !tieneHorario && (
              <div className="flex items-start gap-2 p-3 rounded-xl mb-4
                              bg-slate-50 border border-slate-200">
                <Info size={13} className="flex-shrink-0 mt-0.5 text-slate-400" />
                <p className="text-xs text-slate-500">
                  Ventana permitida: entre{' '}
                  <strong className="text-slate-700">2 horas</strong> y{' '}
                  <strong className="text-slate-700">7 días</strong>{' '}
                  antes de tu clase.
                </p>
              </div>
            )}

            {/* Buscador de insumos */}
            <div className="mb-4">
              <label className="block text-xs font-bold text-slate-500 uppercase
                               tracking-wide mb-1.5">
                Agregar insumos al carrito
              </label>
              <div ref={searchRef} className="relative">
                <div className="relative">
                  <Search size={15}
                    className="absolute left-3 top-1/2 -translate-y-1/2
                               text-slate-400 pointer-events-none" />
                  <input type="text" value={query}
                    onChange={e => setQuery(e.target.value)}
                    placeholder="Buscar insumo por nombre..."
                    autoComplete="off"
                    className="w-full pl-9 pr-4 py-2.5 rounded-lg border border-slate-200
                               text-sm focus:outline-none focus:ring-2 focus:ring-teal-500
                               bg-slate-50 focus:bg-white placeholder:text-slate-400" />
                  {searchLoading && (
                    <span className="absolute right-3 top-1/2 -translate-y-1/2
                                     text-xs text-slate-400">Buscando...</span>
                  )}
                </div>

                {showDropdown && searchResults.length > 0 && (
                  <ul className="absolute left-0 right-0 top-full mt-1.5 bg-white
                                 border border-slate-200 rounded-xl shadow-lg
                                 z-40 overflow-hidden">
                    {searchResults.map(insumo => {
                      const enCarrito = cartItems.some(i => i.insumo.id === insumo.id)
                      return (
                        <li key={insumo.id}>
                          <button type="button"
                            onMouseDown={e => {
                              e.preventDefault(); agregarAlCarrito(insumo)
                            }}
                            className="w-full flex items-center justify-between
                                       gap-3 px-4 py-2.5 text-sm hover:bg-slate-50
                                       transition-colors">
                            <div className="flex items-center gap-2 min-w-0">
                              <Package size={13}
                                className="text-slate-300 flex-shrink-0" />
                              <span className="font-semibold text-slate-800 truncate">
                                {insumo.nombre}
                              </span>
                              {insumo.tipo === 'implemento' && (
                                <span className="text-[10px] font-bold text-blue-600
                                                 bg-blue-50 px-1.5 py-0.5 rounded">
                                  Implemento
                                </span>
                              )}
                              {enCarrito && (
                                <span className="text-[10px] font-bold text-teal-600
                                                 bg-teal-50 px-1.5 py-0.5 rounded">
                                  En carrito
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              <span className={`text-xs font-bold ${
                                insumo.stock_actual === 0
                                  ? 'text-rose-500'
                                  : insumo.stock_actual <= insumo.stock_minimo
                                  ? 'text-amber-500'
                                  : 'text-teal-600'
                              }`}>
                                Stock: {insumo.stock_actual}
                              </span>
                              <Plus size={14} className="text-slate-400" />
                            </div>
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                )}

                {showDropdown &&
                  searchResults.length === 0 &&
                  !searchLoading &&
                  query.length >= 2 && (
                    <div className="absolute left-0 right-0 top-full mt-1.5 bg-white
                                    border border-slate-200 rounded-xl shadow-lg
                                    z-40 px-4 py-3">
                      <p className="text-sm text-slate-400 text-center">
                        Sin resultados para &ldquo;{query}&rdquo;
                      </p>
                    </div>
                )}
              </div>
            </div>

            {/* Carrito */}
            {cartItems.length > 0 && (
              <div className="border border-slate-200 rounded-xl overflow-hidden mb-4">
                <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-200">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">
                    Carrito ({cartItems.length} íte{cartItems.length !== 1 ? 'ms' : 'm'},
                    {' '}{totalItems} unidad{totalItems !== 1 ? 'es' : ''})
                  </span>
                </div>
                <ul className="divide-y divide-slate-100">
                  {cartItems.map(({ insumo, cantidad }) => (
                    <li key={insumo.id}
                      className="flex items-center gap-3 px-4 py-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold text-slate-900 truncate">
                            {insumo.nombre}
                          </p>
                          {insumo.tipo === 'implemento' && (
                            <span className="text-[10px] font-bold text-blue-600
                                             bg-blue-50 px-1.5 py-0.5 rounded flex-shrink-0">
                              Retornable
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-400 mt-0.5">
                          Disponible:{' '}
                          <span className="font-bold text-slate-600">
                            {insumo.stock_actual}
                          </span>
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button type="button"
                          onClick={() => setCantidad(insumo.id, cantidad - 1)}
                          disabled={cantidad <= 1}
                          className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200
                                     text-slate-600 font-bold text-sm disabled:opacity-30
                                     transition-colors flex items-center justify-center">
                          -
                        </button>
                        <input type="number" min={1} max={insumo.stock_actual}
                          value={cantidad}
                          onChange={e =>
                            setCantidad(insumo.id, parseInt(e.target.value) || 1)
                          }
                          className="w-14 text-center text-sm font-bold border
                                     border-slate-200 rounded-lg py-1 focus:outline-none
                                     focus:ring-2 focus:ring-teal-500" />
                        <button type="button"
                          onClick={() => setCantidad(insumo.id, cantidad + 1)}
                          disabled={cantidad >= insumo.stock_actual}
                          className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200
                                     text-slate-600 font-bold text-sm disabled:opacity-30
                                     transition-colors flex items-center justify-center">
                          +
                        </button>
                      </div>
                      <button type="button"
                        onClick={() => eliminarDelCarrito(insumo.id)}
                        className="p-1.5 rounded-lg text-slate-300 hover:text-rose-500
                                   hover:bg-rose-50 transition-colors">
                        <Trash2 size={14} />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Notas */}
            <div className="mb-4">
              <label className="block text-xs font-bold text-slate-500 uppercase
                               tracking-wide mb-1.5">Notas (opcional)</label>
              <textarea value={notas} onChange={e => setNotas(e.target.value)}
                rows={2}
                placeholder="Indicaciones adicionales para el personal..."
                className={`${inputCls} resize-none`} />
            </div>

            {submitError && (
              <p className="text-rose-600 text-sm bg-rose-50 border border-rose-200
                            px-3 py-2 rounded-lg font-semibold mb-4">
                {submitError}
              </p>
            )}

            <button type="submit" disabled={submitting || cartItems.length === 0}
              className="w-full py-3 rounded-xl bg-teal-600 hover:bg-teal-700
                         text-white font-bold text-sm transition-colors
                         disabled:opacity-50 disabled:cursor-not-allowed">
              {submitting
                ? 'Enviando...'
                : `Enviar solicitud (${totalItems} unidades)`}
            </button>
          </div>
        </form>
      )}

      {/* Historial */}
      <div>
        <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">
          Mis solicitudes
        </h2>

        {loadingH ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="bg-white rounded-xl border border-slate-200 p-4">
                <div className="h-4 w-48 bg-slate-100 rounded animate-pulse mb-2" />
                <div className="h-3 w-32 bg-slate-100 rounded animate-pulse" />
              </div>
            ))}
          </div>
        ) : historial.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 p-8 text-center">
            <ClipboardList size={28} className="mx-auto mb-2 text-slate-300" />
            <p className="text-sm font-semibold text-slate-400">
              Aún no tienes solicitudes.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {historial.map(sol => (
              <div key={sol.id}
                className="bg-white rounded-xl border border-slate-200
                           shadow-sm overflow-hidden">
                <button type="button"
                  onClick={() =>
                    setExpandido(expandido === sol.id ? null : sol.id)
                  }
                  className="w-full flex items-center justify-between px-5 py-4
                             hover:bg-slate-50 transition-colors text-left">
                  <div className="flex items-center gap-3 min-w-0">
                    {estadoBadge(sol.estado)}
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-slate-900">
                        {sol.sala_nombre}
                      </p>
                      {sol.asignatura_nombre && (
                        <p className="text-xs text-blue-600 font-semibold mt-0.5">
                          <GraduationCap size={10} className="inline mr-1" />
                          {sol.asignatura_nombre} · {sol.seccion}
                        </p>
                      )}
                      <div className="flex items-center gap-2 mt-0.5">
                        <p className="text-xs text-slate-400">
                          {formatFechaClase(sol.fecha_clase)}
                        </p>
                        {urgenciaBadge(sol.minutos_hasta_clase)}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <span className="text-xs text-slate-400">
                      {sol.items.length} íte{sol.items.length !== 1 ? 'ms' : 'm'}
                    </span>
                    {expandido === sol.id
                      ? <ChevronUp size={15} className="text-slate-400" />
                      : <ChevronDown size={15} className="text-slate-400" />}
                  </div>
                </button>

                {expandido === sol.id && (
                  <div className="px-5 pb-4 border-t border-slate-100">
                    <ul className="mt-3 space-y-2">
                      {sol.items.map(item => (
                        <li key={item.id}
                          className="flex items-center justify-between text-sm">
                          <span className="text-slate-700">{item.insumo_nombre}</span>
                          <span className="font-bold text-slate-900">
                            x{item.cantidad_solicitada}
                          </span>
                        </li>
                      ))}
                    </ul>
                    {sol.notas && (
                      <p className="mt-3 text-xs text-slate-500 bg-slate-50
                                    rounded-lg px-3 py-2">
                        <strong>Notas:</strong> {sol.notas}
                      </p>
                    )}
                    {sol.notas_operador && (
                      <p className="mt-2 text-xs text-teal-700 bg-teal-50
                                    rounded-lg px-3 py-2">
                        <strong>Operador:</strong> {sol.notas_operador}
                      </p>
                    )}
                    {sol.fecha_completada && (
                      <p className="mt-2 text-xs text-slate-400">
                        Completada: {formatFechaClase(sol.fecha_completada)}
                      </p>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
