import { useEffect, useState } from 'react'
import {
  ClipboardList, ChevronDown, CheckCircle2,
  AlertTriangle, PackageOpen, RefreshCw,
  ArrowLeft, PackageCheck, Loader2, XCircle,
} from 'lucide-react'
import { api } from '../api/client'
import type {
  PaqueteResponse, ChecklistResponse, ChecklistItemResponse,
  TallerResponse, AsignaturaResponse,
  ConfirmarPreparacionResponse, SalaResponse,
  PaginatedResponse,
} from '../types/api'
import { Badge } from '../components/ui/Badge'

type EstadoItem = 'pendiente' | 'ok' | 'faltante'
interface EstadoChecklist { [item_id: number]: EstadoItem }
type FaseConfirmacion = 'idle' | 'cargando' | 'exito' | 'error'

function estadoColor(e: EstadoItem) {
  if (e === 'ok')
    return 'border-teal-300 bg-teal-50 dark:border-teal-700 dark:bg-teal-900/20'
  if (e === 'faltante')
    return 'border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-900/20'
  return 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800'
}

function stockColor(stock: number, requerido: number) {
  if (stock === 0) return 'text-rose-600 dark:text-rose-400 font-bold'
  if (stock < requerido) return 'text-amber-600 dark:text-amber-400 font-bold'
  return 'text-teal-600 dark:text-teal-400 font-bold'
}

function stockBadge(stock: number, requerido: number) {
  if (stock === 0) return <Badge variant="danger">Sin stock</Badge>
  if (stock < requerido) return <Badge variant="warning">Stock insuficiente</Badge>
  return <Badge variant="success">Stock OK</Badge>
}

export function PrepararTaller() {
  const [asignaturas, setAsignaturas] = useState<AsignaturaResponse[]>([])
  const [talleres, setTalleres] = useState<TallerResponse[]>([])
  const [paquetes, setPaquetes] = useState<PaqueteResponse[]>([])
  // /salas/ devuelve PaginatedResponse — extraer .data
  const [salas, setSalas] = useState<SalaResponse[]>([])

  const [asignaturaId, setAsignaturaId] = useState<number | null>(null)
  const [tallerId, setTallerId] = useState<number | null>(null)
  const [paqueteId, setPaqueteId] = useState<number | null>(null)
  const [salaId, setSalaId] = useState<number | null>(null)

  const [checklist, setChecklist] = useState<ChecklistResponse | null>(null)
  const [estados, setEstados] = useState<EstadoChecklist>({})
  const [loading, setLoading] = useState(false)
  const [loadingSelects, setLoadingSelects] = useState(true)

  const [faseConfirmacion, setFaseConfirmacion] = useState<FaseConfirmacion>('idle')
  const [resultadoConfirmacion, setResultadoConfirmacion] =
    useState<ConfirmarPreparacionResponse | null>(null)

  useEffect(() => {
    Promise.all([
      api.get<AsignaturaResponse[]>('/asignaturas/?incluir_inactivas=false'),
      // /salas/ devuelve PaginatedResponse, no array directo
      api.get<PaginatedResponse<SalaResponse>>('/salas/', { params: { limit: 100 } }),
    ]).then(([resA, resS]) => {
      setAsignaturas(resA.data)
      setSalas(resS.data.data ?? [])
    }).finally(() => setLoadingSelects(false))
  }, [])

  useEffect(() => {
    if (!asignaturaId) { setTalleres([]); setTallerId(null); return }
    api.get<TallerResponse[]>(`/talleres/?asignatura_id=${asignaturaId}`)
      .then(({ data }) => setTalleres(data))
  }, [asignaturaId])

  useEffect(() => {
    if (!tallerId) { setPaquetes([]); setPaqueteId(null); return }
    api.get<PaqueteResponse[]>(`/paquetes/?taller_id=${tallerId}`)
      .then(({ data }) => setPaquetes(data))
  }, [tallerId])

  useEffect(() => {
    if (!paqueteId) {
      setChecklist(null); setEstados({})
      setFaseConfirmacion('idle'); setResultadoConfirmacion(null)
      return
    }
    setLoading(true)
    api.get<ChecklistResponse>(`/paquetes/${paqueteId}/checklist`)
      .then(({ data }) => {
        setChecklist(data)
        const init: EstadoChecklist = {}
        data.items.forEach(item => { init[item.item_id] = 'pendiente' })
        setEstados(init)
        setFaseConfirmacion('idle')
        setResultadoConfirmacion(null)
      })
      .finally(() => setLoading(false))
  }, [paqueteId])

  function marcarItem(itemId: number, estado: EstadoItem) {
    setEstados(prev => ({ ...prev, [itemId]: estado }))
  }

  function reiniciar() {
    if (!checklist) return
    const init: EstadoChecklist = {}
    checklist.items.forEach(item => { init[item.item_id] = 'pendiente' })
    setEstados(init)
    setFaseConfirmacion('idle')
    setResultadoConfirmacion(null)
  }

  function volver() {
    setChecklist(null); setPaqueteId(null); setEstados({})
    setFaseConfirmacion('idle'); setResultadoConfirmacion(null)
  }

  async function confirmarSalaLista() {
    if (!checklist || !todosRevisados) return
    setFaseConfirmacion('cargando')
    try {
      const faltantes = checklist.items
        .filter(item => estados[item.item_id] === 'faltante')
        .map(item => ({ insumo_id: item.insumo_id, cantidad: item.cantidad_requerida }))
      const { data } = await api.post<ConfirmarPreparacionResponse>(
        `/paquetes/${checklist.paquete_id}/confirmar-preparacion`,
        { faltantes, sala_id: salaId ?? null },
      )
      setResultadoConfirmacion(data)
      setFaseConfirmacion('exito')
    } catch {
      setFaseConfirmacion('error')
    }
  }

  const total = checklist?.items.length ?? 0
  const okCount = Object.values(estados).filter(e => e === 'ok').length
  const faltanteCount = Object.values(estados).filter(e => e === 'faltante').length
  const pendienteCount = Object.values(estados).filter(e => e === 'pendiente').length
  const todosRevisados = total > 0 && pendienteCount === 0
  const faltantes = checklist?.items.filter(item => estados[item.item_id] === 'faltante') ?? []
  const salaActual = salas.find(s => s.id === salaId)

  if (!checklist) {
    return (
      <div className="p-6 max-w-lg mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-black text-slate-900 dark:text-slate-50">
            Preparar taller
          </h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
            Selecciona la asignatura, taller y semestre para iniciar el checklist.
          </p>
        </div>
        {loadingSelects ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i}
                className="h-12 rounded-xl bg-slate-100 dark:bg-slate-800 animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="space-y-4">
            <SelectCascada
              label="Asignatura"
              value={asignaturaId} disabled={false}
              placeholder="— Selecciona una asignatura —"
              onChange={v => { setAsignaturaId(v); setTallerId(null); setPaqueteId(null) }}
              opciones={asignaturas.map(a => ({ value: a.id, label: `${a.nombre} (${a.codigo})` }))}
              mensajeVacio={null}
            />
            <SelectCascada
              label="Taller"
              value={tallerId} disabled={!asignaturaId}
              placeholder="— Selecciona un taller —"
              onChange={v => { setTallerId(v); setPaqueteId(null) }}
              opciones={talleres.map(t => ({ value: t.id, label: t.nombre }))}
              mensajeVacio={
                asignaturaId && talleres.length === 0
                  ? 'Esta asignatura no tiene talleres registrados.' : null
              }
            />
            <SelectCascada
              label="Semestre"
              value={paqueteId} disabled={!tallerId}
              placeholder="— Selecciona un semestre —"
              onChange={setPaqueteId}
              opciones={paquetes.map(p => ({ value: p.id, label: p.semestre }))}
              mensajeVacio={
                tallerId && paquetes.length === 0
                  ? 'Este taller no tiene paquetes de insumos registrados.' : null
              }
            />
            <SelectCascada
              label="Sala a preparar (opcional)"
              value={salaId} disabled={false}
              placeholder="— Sin sala específica —"
              onChange={setSalaId}
              opciones={salas.map(s => ({ value: s.id, label: s.nombre }))}
              mensajeVacio={null}
            />
            {paqueteId && (
              <button
                disabled={loading}
                className="
                  w-full mt-2 bg-teal-600 hover:bg-teal-700 disabled:opacity-50
                  text-white font-bold py-3 rounded-xl transition-colors
                  flex items-center justify-center gap-2
                "
              >
                {loading
                  ? <Loader2 size={16} className="animate-spin" />
                  : <ClipboardList size={16} />}
                {loading ? 'Cargando guía...' : 'Iniciar checklist'}
              </button>
            )}
          </div>
        )}
      </div>
    )
  }

  if (faseConfirmacion === 'exito' && resultadoConfirmacion) {
    const { movimientos_generados, items_sin_stock } = resultadoConfirmacion
    return (
      <div className="p-4 max-w-lg mx-auto">
        <div className="bg-teal-50 dark:bg-teal-900/20 border border-teal-300
                        dark:border-teal-700 rounded-2xl p-6 text-center">
          <div className="w-14 h-14 bg-teal-100 dark:bg-teal-800 rounded-full
                          flex items-center justify-center mx-auto mb-4">
            <PackageCheck size={26} className="text-teal-600 dark:text-teal-400" />
          </div>
          <p className="font-black text-teal-800 dark:text-teal-300 text-xl mb-1">
            ¡Sala lista!
          </p>
          <p className="text-teal-600 dark:text-teal-400 text-sm">
            {checklist.taller_nombre} · Semestre {checklist.semestre}
          </p>
          <div className="flex gap-3 mt-5 mb-2">
            <div className="flex-1 bg-white dark:bg-slate-800 rounded-xl
                            border border-teal-200 dark:border-teal-700 p-3">
              <p className="text-2xl font-black text-teal-700 dark:text-teal-300">{okCount}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Ya en sala</p>
            </div>
            <div className="flex-1 bg-white dark:bg-slate-800 rounded-xl
                            border border-teal-200 dark:border-teal-700 p-3">
              <p className="text-2xl font-black text-teal-700 dark:text-teal-300">
                {movimientos_generados}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Retiros bodega</p>
            </div>
          </div>
          {items_sin_stock.length > 0 && (
            <div className="mt-4 bg-amber-50 dark:bg-amber-900/20 border
                            border-amber-200 dark:border-amber-700 rounded-xl p-3 text-left">
              <p className="text-xs font-bold text-amber-700 dark:text-amber-400 mb-2
                            flex items-center gap-1.5">
                <AlertTriangle size={13} />
                {items_sin_stock.length} ítem(s) sin stock suficiente:
              </p>
              {items_sin_stock.map((nombre, i) => (
                <p key={i} className="text-xs text-amber-700 dark:text-amber-400">• {nombre}</p>
              ))}
            </div>
          )}
          <button
            onClick={volver}
            className="mt-5 w-full py-2.5 rounded-xl font-bold text-sm
                       bg-teal-600 hover:bg-teal-700 text-white transition-colors"
          >
            Preparar otro taller
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 max-w-2xl mx-auto">
      <div className="flex items-start gap-3 mb-5">
        <button onClick={volver}
          className="mt-0.5 w-8 h-8 rounded-lg flex items-center justify-center
                     text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800
                     hover:text-slate-600 dark:hover:text-slate-200 transition-colors">
          <ArrowLeft size={16} />
        </button>
        <div className="flex-1">
          <h1 className="text-xl font-black text-slate-900 dark:text-slate-50 leading-tight">
            {checklist.taller_nombre}
          </h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm">
            Semestre {checklist.semestre}
            {salaActual ? ` · ${salaActual.nombre}` : ''}
          </p>
        </div>
        <button onClick={reiniciar} title="Reiniciar checklist"
          className="mt-0.5 w-8 h-8 rounded-lg flex items-center justify-center
                     text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800
                     hover:text-slate-600 dark:hover:text-slate-200 transition-colors">
          <RefreshCw size={14} />
        </button>
      </div>

      {/* Barra de progreso */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200
                      dark:border-slate-700 p-4 mb-4">
        <div className="flex items-center justify-between text-xs font-bold mb-2">
          <span className="text-slate-500 dark:text-slate-400">
            {okCount + faltanteCount} de {total} revisados
          </span>
          <div className="flex gap-2">
            {okCount > 0 && (
              <span className="text-teal-600 dark:text-teal-400">{okCount} OK</span>
            )}
            {faltanteCount > 0 && (
              <span className="text-amber-600 dark:text-amber-400">
                {faltanteCount} faltante{faltanteCount !== 1 ? 's' : ''}
              </span>
            )}
          </div>
        </div>
        <div className="h-2 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
          <div
            className="h-full bg-teal-500 rounded-full transition-all duration-300"
            style={{ width: `${total > 0 ? ((okCount + faltanteCount) / total) * 100 : 0}%` }}
          />
        </div>
      </div>

      <div className="space-y-3 mb-5">
        {checklist.items.map(item => (
          <ItemChecklist
            key={item.item_id} item={item}
            estado={estados[item.item_id] ?? 'pendiente'}
            onMarcar={marcarItem}
          />
        ))}
      </div>

      {faltanteCount > 0 && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200
                        dark:border-amber-700 rounded-xl p-4 mb-4">
          <p className="text-sm font-bold text-amber-700 dark:text-amber-400 mb-3
                        flex items-center gap-2">
            <PackageOpen size={16} />
            {faltanteCount} ítem{faltanteCount !== 1 ? 's' : ''} para buscar en bodega
          </p>
          <div className="space-y-2">
            {faltantes.map(item => (
              <div key={item.item_id} className="flex items-center justify-between text-sm">
                <span className="font-semibold text-slate-700 dark:text-slate-300">
                  {item.insumo_nombre}
                </span>
                <span className="text-amber-700 dark:text-amber-400 font-bold">
                  Necesita {item.cantidad_requerida} · bodega: {item.stock_actual}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {faseConfirmacion === 'error' && (
        <div className="flex items-center gap-2 bg-rose-50 dark:bg-rose-900/20
                        border border-rose-200 dark:border-rose-700 rounded-xl
                        p-3 mb-4 text-sm">
          <XCircle size={15} className="text-rose-600 dark:text-rose-400 flex-shrink-0" />
          <span className="text-rose-700 dark:text-rose-400 font-semibold">
            Ocurrió un error al registrar los retiros. Intenta nuevamente.
          </span>
        </div>
      )}

      <button
        disabled={!todosRevisados || faseConfirmacion === 'cargando'}
        onClick={confirmarSalaLista}
        className="
          w-full py-3.5 rounded-xl font-bold text-sm transition-colors
          flex items-center justify-center gap-2
          bg-teal-600 hover:bg-teal-700 text-white
          disabled:opacity-40 disabled:cursor-not-allowed
        "
      >
        {faseConfirmacion === 'cargando' ? (
          <><Loader2 size={18} className="animate-spin" /> Registrando retiros...</>
        ) : todosRevisados ? (
          <><PackageCheck size={18} /> Sala lista ✓</>
        ) : (
          <><PackageCheck size={18} />
            Revisa todos los ítems ({pendienteCount} pendiente{pendienteCount !== 1 ? 's' : ''})
          </>
        )}
      </button>
    </div>
  )
}

interface SelectCascadaProps {
  label: string
  value: number | null
  disabled: boolean
  placeholder: string
  onChange: (v: number | null) => void
  opciones: { value: number; label: string }[]
  mensajeVacio: string | null
}

function SelectCascada({
  label, value, disabled, placeholder, onChange, opciones, mensajeVacio
}: SelectCascadaProps) {
  return (
    <div>
      <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1.5">
        {label}
      </label>
      <div className="relative">
        <select
          value={value ?? ''}
          disabled={disabled || opciones.length === 0}
          onChange={e => onChange(e.target.value ? Number(e.target.value) : null)}
          className="
            w-full appearance-none px-4 py-3 pr-10 rounded-xl border
            border-slate-200 dark:border-slate-700
            bg-white dark:bg-slate-800
            text-slate-900 dark:text-slate-50
            text-sm font-semibold focus:outline-none
            focus:ring-2 focus:ring-teal-500
            disabled:opacity-50 disabled:cursor-not-allowed
          "
        >
          <option value="">{placeholder}</option>
          {opciones.map(op => (
            <option key={op.value} value={op.value}>{op.label}</option>
          ))}
        </select>
        <ChevronDown size={16}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
      </div>
      {mensajeVacio && (
        <p className="text-xs text-slate-400 mt-1 px-1">{mensajeVacio}</p>
      )}
    </div>
  )
}

interface ItemChecklistProps {
  item: ChecklistItemResponse
  estado: EstadoItem
  onMarcar: (id: number, estado: EstadoItem) => void
}

function ItemChecklist({ item, estado, onMarcar }: ItemChecklistProps) {
  const pct = Math.min(100, (item.stock_actual / Math.max(item.cantidad_requerida, 1)) * 100)
  return (
    <div className={`rounded-xl border p-4 transition-all shadow-sm ${estadoColor(estado)}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-bold text-slate-900 dark:text-slate-50 text-sm leading-tight">
              {item.insumo_nombre}
            </p>
            {stockBadge(item.stock_actual, item.cantidad_requerida)}
          </div>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
            {item.insumo_tipo === 'implemento' ? 'Implemento' : 'Insumo desechable'}
            {item.notas_guia ? ` · ${item.notas_guia}` : ''}
          </p>
          <div className="flex items-center gap-4 mt-2.5 text-xs">
            <span className="text-slate-500 dark:text-slate-400">
              Guía: <span className="font-bold text-slate-700 dark:text-slate-300">
                {item.cantidad_requerida}
              </span>
            </span>
            <span className="text-slate-500 dark:text-slate-400">
              Bodega: <span className={stockColor(item.stock_actual, item.cantidad_requerida)}>
                {item.stock_actual}
              </span>
            </span>
          </div>
          <div className="mt-2 h-1.5 bg-slate-200 dark:bg-slate-600 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                item.stock_actual === 0 ? 'bg-rose-500'
                  : item.stock_actual < item.cantidad_requerida ? 'bg-amber-400'
                  : 'bg-teal-500'
              }`}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
        <div className="flex flex-col gap-2 flex-shrink-0">
          <button
            onClick={() => onMarcar(item.item_id, estado === 'ok' ? 'pendiente' : 'ok')}
            className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors ${ estado === 'ok' ? 'bg-teal-600 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-400 hover:bg-teal-100 hover:text-teal-700 dark:hover:bg-teal-900/30 dark:hover:text-teal-400' }`}
            title="Marcar como OK (está en sala)">
            <CheckCircle2 size={16} />
          </button>
          <button
            onClick={() => onMarcar(item.item_id, estado === 'faltante' ? 'pendiente' : 'faltante')}
            className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors ${ estado === 'faltante' ? 'bg-amber-500 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-400 hover:bg-amber-100 hover:text-amber-700 dark:hover:bg-amber-900/30 dark:hover:text-amber-400' }`}
            title="Marcar como faltante">
            <AlertTriangle size={16} />
          </button>
        </div>
      </div>
    </div>
  )
}
