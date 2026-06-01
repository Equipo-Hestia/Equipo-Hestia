import { useEffect, useState } from 'react'
import {
  ClipboardList, ChevronDown, CheckCircle2,
  AlertTriangle, PackageOpen, RefreshCw,
  ArrowLeft, PackageCheck,
} from 'lucide-react'
import { api } from '../api/client'
import type {
  PaqueteResponse, ChecklistResponse, ChecklistItemResponse,
  TallerResponse, AsignaturaResponse,
} from '../types/api'
import { Badge } from '../components/ui/Badge'

// ---------------------------------------------------------------------------
// Tipos locales
// ---------------------------------------------------------------------------

type EstadoItem = 'pendiente' | 'ok' | 'faltante'

interface EstadoChecklist {
  [item_id: number]: EstadoItem
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function estadoColor(e: EstadoItem) {
  if (e === 'ok') return 'border-teal-300 bg-teal-50 dark:border-teal-700 dark:bg-teal-900/20'
  if (e === 'faltante') return 'border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-900/20'
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

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------

export function PrepararTaller() {
  // --- Selección de paquete ---
  const [asignaturas, setAsignaturas] = useState<AsignaturaResponse[]>([])
  const [talleres, setTalleres] = useState<TallerResponse[]>([])
  const [paquetes, setPaquetes] = useState<PaqueteResponse[]>([])

  const [asignaturaId, setAsignaturaId] = useState<number | null>(null)
  const [tallerId, setTallerId] = useState<number | null>(null)
  const [paqueteId, setPaqueteId] = useState<number | null>(null)

  // --- Checklist ---
  const [checklist, setChecklist] = useState<ChecklistResponse | null>(null)
  const [estados, setEstados] = useState<EstadoChecklist>({})
  const [salaLista, setSalaLista] = useState(false)
  const [loading, setLoading] = useState(false)
  const [loadingSelects, setLoadingSelects] = useState(true)

  // ---------------------------------------------------------------------------
  // Carga inicial: asignaturas
  // ---------------------------------------------------------------------------
  useEffect(() => {
    api.get<AsignaturaResponse[]>('/asignaturas/?incluir_inactivas=false')
      .then(({ data }) => setAsignaturas(data))
      .finally(() => setLoadingSelects(false))
  }, [])

  // ---------------------------------------------------------------------------
  // Al seleccionar asignatura → cargar talleres
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!asignaturaId) { setTalleres([]); setTallerId(null); return }
    api.get<TallerResponse[]>(`/talleres/?asignatura_id=${asignaturaId}`)
      .then(({ data }) => setTalleres(data))
  }, [asignaturaId])

  // ---------------------------------------------------------------------------
  // Al seleccionar taller → cargar paquetes
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!tallerId) { setPaquetes([]); setPaqueteId(null); return }
    api.get<PaqueteResponse[]>(`/paquetes/?taller_id=${tallerId}`)
      .then(({ data }) => setPaquetes(data))
  }, [tallerId])

  // ---------------------------------------------------------------------------
  // Al seleccionar paquete → cargar checklist
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!paqueteId) { setChecklist(null); setEstados({}); setSalaLista(false); return }
    setLoading(true)
    api.get<ChecklistResponse>(`/paquetes/${paqueteId}/checklist`)
      .then(({ data }) => {
        setChecklist(data)
        // Inicializar todos los ítems como pendientes
        const init: EstadoChecklist = {}
        data.items.forEach(item => { init[item.item_id] = 'pendiente' })
        setEstados(init)
        setSalaLista(false)
      })
      .finally(() => setLoading(false))
  }, [paqueteId])

  // ---------------------------------------------------------------------------
  // Acciones
  // ---------------------------------------------------------------------------
  function marcarItem(itemId: number, estado: EstadoItem) {
    setEstados(prev => ({ ...prev, [itemId]: estado }))
  }

  function reiniciar() {
    if (!checklist) return
    const init: EstadoChecklist = {}
    checklist.items.forEach(item => { init[item.item_id] = 'pendiente' })
    setEstados(init)
    setSalaLista(false)
  }

  function volver() {
    setChecklist(null)
    setPaqueteId(null)
    setEstados({})
    setSalaLista(false)
  }

  // Contadores
  const total = checklist?.items.length ?? 0
  const okCount = Object.values(estados).filter(e => e === 'ok').length
  const faltanteCount = Object.values(estados).filter(e => e === 'faltante').length
  const pendienteCount = Object.values(estados).filter(e => e === 'pendiente').length
  const todosRevisados = total > 0 && pendienteCount === 0

  // Ítems con stock insuficiente (faltantes para registrar retiro)
  const faltantes = checklist?.items.filter(
    item => estados[item.item_id] === 'faltante'
  ) ?? []

  // ---------------------------------------------------------------------------
  // Pantalla de selección de taller
  // ---------------------------------------------------------------------------
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
              <div key={i} className="h-12 rounded-xl bg-slate-100 dark:bg-slate-800 animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="space-y-4">

            {/* Asignatura */}
            <div>
              <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                Asignatura
              </label>
              <div className="relative">
                <select
                  value={asignaturaId ?? ''}
                  onChange={e => {
                    setAsignaturaId(e.target.value ? Number(e.target.value) : null)
                    setTallerId(null)
                    setPaqueteId(null)
                  }}
                  className="
                    w-full appearance-none px-4 py-3 pr-10 rounded-xl border
                    border-slate-200 dark:border-slate-700
                    bg-white dark:bg-slate-800
                    text-slate-900 dark:text-slate-50
                    text-sm font-semibold focus:outline-none
                    focus:ring-2 focus:ring-teal-500
                  "
                >
                  <option value="">— Selecciona una asignatura —</option>
                  {asignaturas.map(a => (
                    <option key={a.id} value={a.id}>
                      {a.nombre} ({a.codigo})
                    </option>
                  ))}
                </select>
                <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              </div>
            </div>

            {/* Taller */}
            <div>
              <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                Taller
              </label>
              <div className="relative">
                <select
                  value={tallerId ?? ''}
                  disabled={!asignaturaId || talleres.length === 0}
                  onChange={e => {
                    setTallerId(e.target.value ? Number(e.target.value) : null)
                    setPaqueteId(null)
                  }}
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
                  <option value="">— Selecciona un taller —</option>
                  {talleres.map(t => (
                    <option key={t.id} value={t.id}>{t.nombre}</option>
                  ))}
                </select>
                <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              </div>
              {asignaturaId && talleres.length === 0 && (
                <p className="text-xs text-slate-400 mt-1 px-1">
                  Esta asignatura no tiene talleres registrados.
                </p>
              )}
            </div>

            {/* Paquete / Semestre */}
            <div>
              <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                Semestre
              </label>
              <div className="relative">
                <select
                  value={paqueteId ?? ''}
                  disabled={!tallerId || paquetes.length === 0}
                  onChange={e => setPaqueteId(e.target.value ? Number(e.target.value) : null)}
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
                  <option value="">— Selecciona un semestre —</option>
                  {paquetes.map(p => (
                    <option key={p.id} value={p.id}>{p.semestre}</option>
                  ))}
                </select>
                <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              </div>
              {tallerId && paquetes.length === 0 && (
                <p className="text-xs text-slate-400 mt-1 px-1">
                  Este taller no tiene paquetes de insumos registrados.
                </p>
              )}
            </div>

            {/* Botón iniciar */}
            {paqueteId && (
              <button
                onClick={() => { /* el useEffect ya carga */ }}
                disabled={loading}
                className="
                  w-full mt-2 bg-teal-600 hover:bg-teal-700 disabled:opacity-50
                  text-white font-bold py-3 rounded-xl transition-colors
                  flex items-center justify-center gap-2
                "
              >
                {loading
                  ? <RefreshCw size={16} className="animate-spin" />
                  : <ClipboardList size={16} />}
                {loading ? 'Cargando guía...' : 'Iniciar checklist'}
              </button>
            )}
          </div>
        )}
      </div>
    )
  }

  // ---------------------------------------------------------------------------
  // Pantalla de checklist activo
  // ---------------------------------------------------------------------------
  return (
    <div className="p-4 max-w-2xl mx-auto">

      {/* Header */}
      <div className="flex items-start gap-3 mb-5">
        <button
          onClick={volver}
          className="mt-0.5 w-8 h-8 rounded-lg flex items-center justify-center
                     text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800
                     hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
        >
          <ArrowLeft size={16} />
        </button>
        <div className="flex-1">
          <h1 className="text-xl font-black text-slate-900 dark:text-slate-50 leading-tight">
            {checklist.taller_nombre}
          </h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm">
            Semestre {checklist.semestre}
          </p>
        </div>
        <button
          onClick={reiniciar}
          title="Reiniciar checklist"
          className="mt-0.5 w-8 h-8 rounded-lg flex items-center justify-center
                     text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800
                     hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
        >
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
              <span className="text-teal-600 dark:text-teal-400">
                {okCount} OK
              </span>
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

      {/* Lista de ítems */}
      <div className="space-y-3 mb-5">
        {checklist.items.map(item => (
          <ItemChecklist
            key={item.item_id}
            item={item}
            estado={estados[item.item_id] ?? 'pendiente'}
            onMarcar={marcarItem}
          />
        ))}
      </div>

      {/* Panel de faltantes */}
      {faltanteCount > 0 && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200
                        dark:border-amber-700 rounded-xl p-4 mb-4">
          <p className="text-sm font-bold text-amber-700 dark:text-amber-400 mb-3 flex items-center gap-2">
            <PackageOpen size={16} />
            {faltanteCount} ítem{faltanteCount !== 1 ? 's' : ''} para buscar en bodega
          </p>
          <div className="space-y-2">
            {faltantes.map(item => (
              <div key={item.item_id}
                className="flex items-center justify-between text-sm"
              >
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

      {/* Botón sala lista */}
      {!salaLista ? (
        <button
          disabled={!todosRevisados}
          onClick={() => setSalaLista(true)}
          className="
            w-full py-3.5 rounded-xl font-bold text-sm transition-colors
            flex items-center justify-center gap-2
            bg-teal-600 hover:bg-teal-700 text-white
            disabled:opacity-40 disabled:cursor-not-allowed
          "
        >
          <PackageCheck size={18} />
          {todosRevisados ? 'Sala lista ✓' : `Revisa todos los ítems (${pendienteCount} pendiente${pendienteCount !== 1 ? 's' : ''})`}
        </button>
      ) : (
        <div className="bg-teal-50 dark:bg-teal-900/20 border border-teal-300
                        dark:border-teal-700 rounded-xl p-5 text-center">
          <div className="w-12 h-12 bg-teal-100 dark:bg-teal-800 rounded-full
                          flex items-center justify-center mx-auto mb-3">
            <PackageCheck size={22} className="text-teal-600 dark:text-teal-400" />
          </div>
          <p className="font-black text-teal-800 dark:text-teal-300 text-lg">
            ¡Sala lista!
          </p>
          <p className="text-teal-600 dark:text-teal-400 text-sm mt-1">
            {okCount} ítem{okCount !== 1 ? 's' : ''} verificado{okCount !== 1 ? 's' : ''}
            {faltanteCount > 0 ? ` · ${faltanteCount} repuesto${faltanteCount !== 1 ? 's' : ''} desde bodega` : ''}
          </p>
          <button
            onClick={volver}
            className="mt-4 text-sm font-bold text-teal-600 dark:text-teal-400
                       hover:text-teal-800 dark:hover:text-teal-200 transition-colors"
          >
            Preparar otro taller
          </button>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Tarjeta de ítem del checklist
// ---------------------------------------------------------------------------

interface ItemChecklistProps {
  item: ChecklistItemResponse
  estado: EstadoItem
  onMarcar: (id: number, estado: EstadoItem) => void
}

function ItemChecklist({ item, estado, onMarcar }: ItemChecklistProps) {
  const pct = Math.min(100, (item.stock_actual / Math.max(item.cantidad_requerida, 1)) * 100)

  return (
    <div className={`rounded-xl border p-4 transition-all shadow-sm ${ estadoColor(estado) }`}>
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

          {/* Datos de stock */}
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

          {/* Barra de stock */}
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

        {/* Botones de acción */}
        <div className="flex flex-col gap-2 flex-shrink-0">
          <button
            onClick={() => onMarcar(item.item_id, estado === 'ok' ? 'pendiente' : 'ok')}
            className={`
              w-9 h-9 rounded-lg flex items-center justify-center
              transition-colors text-sm font-bold
              ${ estado === 'ok'
                ? 'bg-teal-600 text-white'
                : 'bg-slate-100 dark:bg-slate-700 text-slate-400 hover:bg-teal-100 hover:text-teal-700
                   dark:hover:bg-teal-900/30 dark:hover:text-teal-400'
              }
            `}
            title="Marcar como OK (está en sala)"
          >
            <CheckCircle2 size={16} />
          </button>
          <button
            onClick={() => onMarcar(item.item_id, estado === 'faltante' ? 'pendiente' : 'faltante')}
            className={`
              w-9 h-9 rounded-lg flex items-center justify-center
              transition-colors text-sm font-bold
              ${ estado === 'faltante'
                ? 'bg-amber-500 text-white'
                : 'bg-slate-100 dark:bg-slate-700 text-slate-400 hover:bg-amber-100 hover:text-amber-700
                   dark:hover:bg-amber-900/30 dark:hover:text-amber-400'
              }
            `}
            title="Marcar como faltante (hay que buscar en bodega)"
          >
            <AlertTriangle size={16} />
          </button>
        </div>
      </div>
    </div>
  )
}
