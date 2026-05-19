import { useEffect, useState, useCallback, useRef } from 'react'
import {
  ClipboardList, Search, Plus, Trash2, CheckCircle,
  AlertTriangle, Clock, ChevronDown, ChevronUp, Package, Info
} from 'lucide-react'
import { api } from '../api/client'
import type {
  SalaResponse, InsumoResponse, SolicitudResponse,
  PaginatedResponse, EstadoSolicitud
} from '../types/api'
import { Badge } from '../components/ui/Badge'

interface CartItem {
  insumo: InsumoResponse
  cantidad: number
}

// ---------------------------------------------------------------------------
// Ventana de solicitud — debe coincidir con los valores del backend
// ---------------------------------------------------------------------------
const MIN_ANTICIPACION_MS = 2 * 60 * 60 * 1000   // 2 horas
const MAX_ANTICIPACION_MS = 7 * 24 * 60 * 60 * 1000 // 7 días

/**
 * Formatea un Date como string compatible con <input type="datetime-local">.
 * datetime-local usa hora LOCAL del dispositivo, no UTC, por eso no usamos
 * toISOString() (que devuelve UTC y desplazaría el min/max por la diferencia
 * de zona horaria).
 */
function toDatetimeLocal(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  )
}

function estadoBadge(estado: EstadoSolicitud) {
  if (estado === 'completada')    return <Badge variant="success">Completada</Badge>
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
  const [salas, setSalas] = useState<SalaResponse[]>([])
  const [salaId, setSalaId] = useState('')
  const [fechaClase, setFechaClase] = useState('')
  const [notas, setNotas] = useState('')
  const [cartItems, setCartItems] = useState<CartItem[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [showWarning, setShowWarning] = useState(false)

  const [query, setQuery] = useState('')
  const [searchResults, setSearchResults] = useState<InsumoResponse[]>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [showDropdown, setShowDropdown] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const searchContainerRef = useRef<HTMLDivElement>(null)

  const [historial, setHistorial] = useState<SolicitudResponse[]>([])
  const [loadingHistorial, setLoadingHistorial] = useState(true)
  const [expandido, setExpandido] = useState<number | null>(null)

  function showToast(msg: string) {
    setToast(msg); setTimeout(() => setToast(null), 3500)
  }

  // Límites del datetime-local en hora LOCAL del dispositivo
  const fechaMin = toDatetimeLocal(new Date(Date.now() + MIN_ANTICIPACION_MS))
  const fechaMax = toDatetimeLocal(new Date(Date.now() + MAX_ANTICIPACION_MS))

  useEffect(() => {
    api.get<PaginatedResponse<SalaResponse>>('/salas/', { params: { limit: 200 } })
      .then(({ data }) => setSalas(data.data))
      .catch(() => showToast('No se pudieron cargar las salas. Recarga la página.'))
  }, [])

  const cargarHistorial = useCallback(async () => {
    setLoadingHistorial(true)
    try {
      const { data } = await api.get<SolicitudResponse[]>('/solicitudes/mis-solicitudes')
      setHistorial(data)
    } catch {
      showToast('Error al cargar el historial de solicitudes.')
    } finally { setLoadingHistorial(false) }
  }, [])

  useEffect(() => { cargarHistorial() }, [cargarHistorial])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (query.trim().length < 2) {
      setSearchResults([]); setShowDropdown(false); return
    }
    debounceRef.current = setTimeout(async () => {
      setSearchLoading(true)
      try {
        const { data } = await api.get<PaginatedResponse<InsumoResponse>>('/insumos/', {
          params: { nombre: query.trim(), limit: 8 },
        })
        setSearchResults(data.data.filter(i => i.activo && i.stock_actual > 0))
        setShowDropdown(true)
      } finally { setSearchLoading(false) }
    }, 280)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [query])

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  function agregarAlCarrito(insumo: InsumoResponse) {
    setQuery(''); setShowDropdown(false)
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
    if (!salaId)       { setSubmitError('Selecciona una sala.'); return }
    if (!fechaClase)   { setSubmitError('Indica la fecha y hora de tu clase.'); return }
    if (cartItems.length === 0) { setSubmitError('Agrega al menos un insumo al carrito.'); return }

    // Validación client-side de la ventana (duplica la del backend como UX)
    const ahora = Date.now()
    const fechaMs = new Date(fechaClase).getTime()
    const diff = fechaMs - ahora

    if (diff < MIN_ANTICIPACION_MS) {
      setSubmitError(
        'Debes solicitar con al menos 2 horas de anticipación a tu clase. ' +
        'El personal necesita tiempo para preparar el pedido.'
      )
      return
    }
    if (diff > MAX_ANTICIPACION_MS) {
      setSubmitError('Solo puedes solicitar hasta 7 días antes de tu clase.')
      return
    }

    setShowWarning(true)
  }

  async function handleConfirmSubmit() {
    setShowWarning(false)
    setSubmitting(true)
    try {
      await api.post('/solicitudes/', {
        sala_id: parseInt(salaId),
        fecha_clase: new Date(fechaClase).toISOString(),
        notas: notas.trim() || null,
        items: cartItems.map(i => ({
          insumo_id: i.insumo.id,
          cantidad_solicitada: i.cantidad,
        })),
      })
      setSalaId(''); setFechaClase(''); setNotas(''); setCartItems([])
      showToast('Solicitud enviada correctamente')
      cargarHistorial()
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })
        .response?.data?.detail
      setSubmitError(detail ?? 'Error al enviar la solicitud. Intenta de nuevo.')
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

      {/* Modal de advertencia de mermas */}
      {showWarning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4
                        bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6
                          border border-amber-200">
            <div className="flex items-start gap-3 mb-5">
              <div className="w-10 h-10 rounded-full bg-amber-100 border border-amber-200
                              flex items-center justify-center flex-shrink-0 mt-0.5">
                <AlertTriangle size={20} className="text-amber-600" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 mb-1.5">
                  Compromiso de uso de insumos
                </h3>
                <p className="text-sm text-slate-600 leading-relaxed">
                  Al enviar esta solicitud confirmas que utilizarás{' '}
                  <strong className="text-slate-900">la totalidad</strong>{' '}
                  de los insumos pedidos durante tu clase. El no uso de
                  insumos retirados genera{' '}
                  <strong className="text-amber-700">mermas</strong>{' '}
                  y puede derivar en{' '}
                  <strong className="text-slate-900">llamados de atención formal</strong>.
                </p>
              </div>
            </div>

            <div className="bg-slate-50 rounded-xl border border-slate-200 px-4 py-3 mb-5">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-2">
                Insumos a retirar
              </p>
              <ul className="space-y-1.5">
                {cartItems.map(({ insumo, cantidad }) => (
                  <li key={insumo.id}
                    className="flex items-center justify-between text-sm">
                    <span className="text-slate-700 truncate mr-4">{insumo.nombre}</span>
                    <span className="font-bold text-slate-900 flex-shrink-0">x{cantidad}</span>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-slate-400 mt-2 pt-2 border-t border-slate-200">
                Total: <strong className="text-slate-600">{totalItems} unidades</strong>
              </p>
            </div>

            <div className="flex gap-3">
              <button type="button" onClick={() => setShowWarning(false)}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600
                           font-semibold text-sm hover:bg-slate-50 transition-colors">
                Cancelar
              </button>
              <button type="button" onClick={handleConfirmSubmit} disabled={submitting}
                className="flex-1 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700
                           text-white font-bold text-sm transition-colors
                           disabled:opacity-50 disabled:cursor-not-allowed">
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

      <form onSubmit={handlePreSubmit}>
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 mb-6">
          <h2 className="text-sm font-bold text-slate-700 mb-4">Nueva solicitud</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-3">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase
                               tracking-wide mb-1.5">Sala *</label>
              <select value={salaId} onChange={e => setSalaId(e.target.value)}
                className={inputCls + ' cursor-pointer'}>
                <option value="">Seleccionar sala...</option>
                {salas.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase
                               tracking-wide mb-1.5">Fecha y hora de clase *</label>
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

          {/* Aviso de ventana de solicitud */}
          <div className="flex items-start gap-2 p-3 rounded-xl mb-4
                          bg-slate-50 border border-slate-200 text-slate-500">
            <Info size={14} className="flex-shrink-0 mt-0.5 text-slate-400" />
            <p className="text-xs leading-relaxed">
              Puedes solicitar entre{' '}
              <strong className="text-slate-700">2 horas</strong> y{' '}
              <strong className="text-slate-700">7 días</strong>{' '}
              antes de tu clase. Solicitudes fuera de este rango serán rechazadas.
            </p>
          </div>

          <div className="mb-4">
            <label className="block text-xs font-bold text-slate-500 uppercase
                             tracking-wide mb-1.5">Agregar insumos al carrito</label>
            <div ref={searchContainerRef} className="relative">
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
                             bg-slate-50 focus:bg-white placeholder:text-slate-400"
                />
                {searchLoading && (
                  <span className="absolute right-3 top-1/2 -translate-y-1/2
                                   text-xs text-slate-400">Buscando...</span>
                )}
              </div>

              {showDropdown && searchResults.length > 0 && (
                <ul className="absolute left-0 right-0 top-full mt-1.5 bg-white border
                               border-slate-200 rounded-xl shadow-lg z-40 overflow-hidden">
                  {searchResults.map(insumo => {
                    const enCarrito = cartItems.some(i => i.insumo.id === insumo.id)
                    return (
                      <li key={insumo.id}>
                        <button type="button"
                          onMouseDown={e => { e.preventDefault(); agregarAlCarrito(insumo) }}
                          className="w-full flex items-center justify-between gap-3 px-4
                                     py-2.5 text-sm hover:bg-slate-50 transition-colors">
                          <div className="flex items-center gap-2 min-w-0">
                            <Package size={13} className="text-slate-300 flex-shrink-0" />
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
                              insumo.stock_actual === 0 ? 'text-rose-500'
                              : insumo.stock_actual <= insumo.stock_minimo ? 'text-amber-500'
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

              {showDropdown && searchResults.length === 0 && !searchLoading && query.length >= 2 && (
                <div className="absolute left-0 right-0 top-full mt-1.5 bg-white border
                                border-slate-200 rounded-xl shadow-lg z-40 px-4 py-3">
                  <p className="text-sm text-slate-400 text-center">
                    Sin resultados para &ldquo;{query}&rdquo;
                  </p>
                </div>
              )}
            </div>
          </div>

          {cartItems.length > 0 && (
            <div className="border border-slate-200 rounded-xl overflow-hidden mb-4">
              <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-200 flex
                              items-center justify-between">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">
                  Carrito ({cartItems.length} insumo{cartItems.length !== 1 ? 's' : ''},
                  {' '}{totalItems} unidad{totalItems !== 1 ? 'es' : ''})
                </span>
              </div>
              <ul className="divide-y divide-slate-100">
                {cartItems.map(({ insumo, cantidad }) => (
                  <li key={insumo.id} className="flex items-center gap-3 px-4 py-3">
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
                        Disponible: <span className="font-bold text-slate-600">
                          {insumo.stock_actual}
                        </span> unidades
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button type="button" onClick={() => setCantidad(insumo.id, cantidad - 1)}
                        disabled={cantidad <= 1}
                        className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200
                                   text-slate-600 font-bold text-sm disabled:opacity-30
                                   transition-colors flex items-center justify-center">-</button>
                      <input type="number" min={1} max={insumo.stock_actual} value={cantidad}
                        onChange={e => setCantidad(insumo.id, parseInt(e.target.value) || 1)}
                        className="w-14 text-center text-sm font-bold border border-slate-200
                                   rounded-lg py-1 focus:outline-none focus:ring-2
                                   focus:ring-teal-500" />
                      <button type="button" onClick={() => setCantidad(insumo.id, cantidad + 1)}
                        disabled={cantidad >= insumo.stock_actual}
                        className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200
                                   text-slate-600 font-bold text-sm disabled:opacity-30
                                   transition-colors flex items-center justify-center">+</button>
                    </div>
                    <button type="button" onClick={() => eliminarDelCarrito(insumo.id)}
                      className="p-1.5 rounded-lg text-slate-300 hover:text-rose-500
                                 hover:bg-rose-50 transition-colors" title="Quitar del carrito">
                      <Trash2 size={14} />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="mb-4">
            <label className="block text-xs font-bold text-slate-500 uppercase
                             tracking-wide mb-1.5">Notas (opcional)</label>
            <textarea value={notas} onChange={e => setNotas(e.target.value)} rows={2}
              placeholder="Indicaciones adicionales para el personal..."
              className={inputCls + ' resize-none'} />
          </div>

          {submitError && (
            <p className="text-rose-600 text-sm bg-rose-50 border border-rose-200
                          px-3 py-2 rounded-lg font-semibold mb-4">{submitError}</p>
          )}

          <button type="submit" disabled={submitting || cartItems.length === 0}
            className="w-full py-3 rounded-xl bg-teal-600 hover:bg-teal-700
                       text-white font-bold text-sm transition-colors
                       disabled:opacity-50 disabled:cursor-not-allowed">
            {submitting ? 'Enviando...' : `Enviar solicitud (${totalItems} unidades)`}
          </button>
        </div>
      </form>

      <div>
        <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">
          Mis solicitudes
        </h2>

        {loadingHistorial ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="bg-white rounded-xl border border-slate-200 p-4">
                <div className="skeleton h-4 w-48 rounded mb-2" />
                <div className="skeleton h-3 w-32 rounded" />
              </div>
            ))}
          </div>
        ) : historial.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 p-8 text-center">
            <ClipboardList size={28} className="mx-auto mb-2 text-slate-300" />
            <p className="text-sm font-semibold text-slate-400">Aún no tienes solicitudes.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {historial.map(sol => (
              <div key={sol.id}
                className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <button type="button"
                  onClick={() => setExpandido(expandido === sol.id ? null : sol.id)}
                  className="w-full flex items-center justify-between px-5 py-4
                             hover:bg-slate-50 transition-colors text-left">
                  <div className="flex items-center gap-3 min-w-0">
                    {estadoBadge(sol.estado)}
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-slate-900">{sol.sala_nombre}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <p className="text-xs text-slate-400">{formatFechaClase(sol.fecha_clase)}</p>
                        {urgenciaBadge(sol.minutos_hasta_clase)}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <span className="text-xs text-slate-400">
                      {sol.items.length} insumo{sol.items.length !== 1 ? 's' : ''}
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
                        <li key={item.id} className="flex items-center justify-between text-sm">
                          <span className="text-slate-700">{item.insumo_nombre}</span>
                          <span className="font-bold text-slate-900">x{item.cantidad_solicitada}</span>
                        </li>
                      ))}
                    </ul>
                    {sol.notas && (
                      <p className="mt-3 text-xs text-slate-500 bg-slate-50 rounded-lg px-3 py-2">
                        <strong>Notas:</strong> {sol.notas}
                      </p>
                    )}
                    {sol.notas_operador && (
                      <p className="mt-2 text-xs text-teal-700 bg-teal-50 rounded-lg px-3 py-2">
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
