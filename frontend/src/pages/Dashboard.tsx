import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor,
  useSensor, useSensors, DragEndEvent, DragStartEvent, DragOverlay, defaultDropAnimationSideEffects
} from '@dnd-kit/core'
import {
  arrayMove, SortableContext, sortableKeyboardCoordinates,
  rectSortingStrategy, useSortable
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

import {
  LayoutDashboard, Package, AlertTriangle, ArrowUpCircle,
  ArrowDownCircle, DoorOpen, Users, ArrowRight,
  XCircle, Activity, TrendingDown, GripVertical,
  RefreshCw, CalendarDays, Eye, EyeOff, RotateCcw,
  Clock,
} from 'lucide-react'
import { api } from '../api/client'
import type {
  ResumenResponse, InsumoAlerta, DiaMovimiento,
  ActividadReciente, TopInsumo, SalaHoy,
} from '../types/api'
import { MetricCardSkeleton, AlertaCardSkeleton } from '../components/ui/Skeleton'
import { Badge } from '../components/ui/Badge'
import { useAuthStore } from '../store/auth'
import { useLastUpdated } from '../hooks/useLastUpdated'

// ---------------------------------------------------------------------------
// Configuración de los Widgets (Bento Box Grid)
// ---------------------------------------------------------------------------

type WidgetId =
  | 'grafico_semana'
  | 'estado_inventario'
  | 'actividad'
  | 'top_insumos'
  | 'salas_hoy'
  | 'alertas'

// Definimos el tamaño responsivo usando CSS Grid modular (True Bento)
const WIDGET_CONFIG: Record<WidgetId, { label: string, classes: string }> = {
  grafico_semana:    { label: 'Actividad semanal',     classes: 'col-span-12 xl:col-span-8 row-span-2' }, // 8x2 bloques
  estado_inventario: { label: 'Estado del inventario', classes: 'col-span-12 xl:col-span-4 row-span-2' }, // 4x2 bloques
  actividad:         { label: 'Actividad reciente',    classes: 'col-span-12 xl:col-span-5 row-span-2' }, // 5x2 bloques
  top_insumos:       { label: 'Más retirados',         classes: 'col-span-12 xl:col-span-4 row-span-2' }, // 4x2 bloques
  salas_hoy:         { label: 'Salas con clase hoy',   classes: 'col-span-12 xl:col-span-3 row-span-2' }, // 3x2 bloques
  alertas:           { label: 'Alertas de stock',      classes: 'col-span-12 xl:col-span-12 row-span-1' }, // 12x1 bloques (Ocupa todo el ancho, poca altura)
}

const DEFAULT_ORDER: WidgetId[] = [
  'grafico_semana', 'estado_inventario', 'actividad', 'top_insumos', 'salas_hoy', 'alertas'
]

const ALL_WIDGET_IDS = Object.keys(WIDGET_CONFIG) as WidgetId[]

const STORAGE_ORDER_KEY = (uid: number) => `hestia_dash_order_${uid}`
const STORAGE_HIDDEN_KEY = (uid: number) => `hestia_dash_hidden_${uid}`

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function tiempoRelativo(isoFecha: string): string {
  const diff = Math.floor((Date.now() - new Date(isoFecha).getTime()) / 1000)
  if (diff < 60) return 'Hace un momento'
  if (diff < 3600) return `Hace ${Math.floor(diff / 60)} min`
  if (diff < 86400) return `Hace ${Math.floor(diff / 3600)} h`
  if (diff < 172800) return 'Ayer'
  return new Date(isoFecha).toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit' })
}

// ---------------------------------------------------------------------------
// Métricas fijas
// ---------------------------------------------------------------------------

function MetricasFijas({ resumen, loading }: { resumen: ResumenResponse | null; loading: boolean }) {
  const items = [
    { label: 'Total insumos',   value: resumen?.total_insumos ?? 0,      color: 'var(--h-teal-hover)',        bg: 'var(--h-teal-subtle)',     icon: <Package size={16} />,       accent: false },
    { label: 'Bajo stock',      value: resumen?.insumos_bajo_stock ?? 0, color: 'var(--h-sem-warning-text)', bg: 'var(--h-sem-warning-bg)',  icon: <AlertTriangle size={16} />, accent: (resumen?.insumos_bajo_stock ?? 0) > 0 },
    { label: 'Agotados',        value: resumen?.insumos_agotados ?? 0,   color: 'var(--h-sem-danger-text)',  bg: 'var(--h-sem-danger-bg)',   icon: <XCircle size={16} />,       accent: (resumen?.insumos_agotados ?? 0) > 0 },
    { label: 'Movimientos hoy', value: resumen?.movimientos_hoy ?? 0,    color: 'var(--h-text-secondary)',   bg: 'var(--h-bg-elevated)',     icon: <Package size={16} />,       accent: false },
    { label: 'Entradas hoy',    value: resumen?.entradas_hoy ?? 0,       color: 'var(--h-teal-hover)',        bg: 'var(--h-teal-subtle)',     icon: <ArrowUpCircle size={16} />, accent: false },
    { label: 'Salidas hoy',     value: resumen?.salidas_hoy ?? 0,        color: 'var(--h-sem-warning-text)', bg: 'var(--h-sem-warning-bg)',  icon: <ArrowDownCircle size={16} />, accent: false },
  ]

  if (loading) {
    return (
      <div className="grid grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
        {Array.from({ length: 6 }).map((_, i) => <MetricCardSkeleton key={i} />)}
      </div>
    )
  }

  return (
    <div className="grid grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
      {items.map(it => (
        <div key={it.label} className="bg-h-surface border border-h-subtle rounded-xl px-4 py-3 flex flex-col gap-1.5" style={{ borderLeftWidth: it.accent ? '3px' : undefined, borderLeftColor: it.accent ? it.color : undefined }}>
          <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: it.bg, color: it.color }}>{it.icon}</div>
          <p className="text-2xl font-black tabular-nums" style={{ color: it.accent ? it.color : 'var(--h-text-primary)' }}>{it.value}</p>
          <p className="text-[11px] text-h-tertiary font-medium leading-tight">{it.label}</p>
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Contenedor Base de los Widgets (Con Drag & Drop de dnd-kit)
// ---------------------------------------------------------------------------

function WidgetCard({
  title, icon, extra, children, dragListeners, dragAttributes
}: {
  title: string; icon?: React.ReactNode; extra?: React.ReactNode; children: React.ReactNode;
  dragListeners?: any; dragAttributes?: any;
}) {
  return (
    <div className="bg-h-surface border border-h-subtle rounded-2xl flex flex-col h-full overflow-hidden shadow-sm">
      <div className="flex items-center justify-between px-4 py-3 border-b border-h-subtle shrink-0" style={{ background: 'var(--h-bg-elevated)' }}>
        {/* ZONA DE ARRASTRE EXCLUSIVA */}
        <div
          {...dragListeners}
          {...dragAttributes}
          className="flex items-center gap-2 cursor-grab active:cursor-grabbing select-none flex-1 touch-none focus:outline-none"
        >
          <GripVertical size={13} className="text-h-tertiary opacity-50" />
          {icon}
          <span className="text-sm font-semibold text-h-primary">{title}</span>
        </div>
        
        {/* ZONA DE BOTONES (No arrastrable) */}
        {extra && <div className="flex-shrink-0 ml-2">{extra}</div>}
      </div>
      <div className="flex-1 overflow-y-auto p-4">{children}</div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Contenidos de widgets
// ---------------------------------------------------------------------------

function GraficoBarras({ datos }: { datos: DiaMovimiento[] }) {
  if (!datos.length) return null
  const max = Math.max(...datos.flatMap(d => [d.entradas, d.salidas]), 1)

  function labelDia(iso: string) {
    return new Date(iso + 'T12:00:00')
      .toLocaleDateString('es-CL', { weekday: 'short' })
      .replace('.', '')
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-end gap-1.5 flex-1 min-h-0">
        {datos.map(d => (
          <div key={d.fecha} className="flex-1 flex flex-col items-center h-full">
            <div className="flex items-end gap-0.5 flex-1 w-full">
              <div
                title={`Entradas: ${d.entradas}`}
                className="flex-1 rounded-t-sm transition-all duration-500"
                style={{ background: 'var(--h-teal-hover)', height: `${(d.entradas / max) * 100}%`, minHeight: d.entradas ? 3 : 0 }}
              />
              <div
                title={`Salidas: ${d.salidas}`}
                className="flex-1 rounded-t-sm transition-all duration-500"
                style={{ background: '#EF9F27', height: `${(d.salidas / max) * 100}%`, minHeight: d.salidas ? 3 : 0 }}
              />
            </div>
            <span className="text-[10px] text-h-tertiary mt-1 capitalize">{labelDia(d.fecha)}</span>
          </div>
        ))}
      </div>
      <div className="flex gap-4 mt-3 shrink-0">
        <div className="flex items-center gap-1.5 text-xs text-h-tertiary">
          <div className="w-2.5 h-2.5 rounded-sm" style={{ background: 'var(--h-teal-hover)' }} />
          Entradas
        </div>
        <div className="flex items-center gap-1.5 text-xs text-h-tertiary">
          <div className="w-2.5 h-2.5 rounded-sm" style={{ background: '#EF9F27' }} />
          Salidas
        </div>
      </div>
    </div>
  )
}

function GraficoEstado({ total, bajo, agotados }: {
  total: number; bajo: number; agotados: number
}) {
  const ok = total - bajo
  const soloAlerta = bajo - agotados
  const base = Math.max(total, 1)

  const filas = [
    { label: 'Stock OK',    valor: ok,        pct: ok / base,        barBg: 'var(--h-teal-hover)',         textStyle: { color: 'var(--h-sem-success-text)' } },
    { label: 'Bajo mínimo', valor: soloAlerta, pct: soloAlerta / base, barBg: '#EF9F27',                   textStyle: { color: 'var(--h-sem-warning-text)' } },
    { label: 'Agotados',    valor: agotados,   pct: agotados / base,   barBg: 'var(--h-sem-danger-border)', textStyle: { color: 'var(--h-sem-danger-text)' } },
  ]

  return (
    <div className="space-y-4">
      {filas.map(f => (
        <div key={f.label}>
          <div className="flex justify-between text-xs mb-1.5">
            <span className="text-h-secondary font-medium">{f.label}</span>
            <span className="font-bold" style={f.textStyle}>{f.valor}</span>
          </div>
          <div className="h-2 bg-h-elevated rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{ width: `${f.pct * 100}%`, background: f.barBg }}
            />
          </div>
        </div>
      ))}
      <p className="text-xs text-h-tertiary pt-1">{total} insumos en total</p>
    </div>
  )
}

function FeedActividadContent({ items, loading }: { items: ActividadReciente[]; loading: boolean }) {
  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <div className="skeleton w-8 h-8 rounded-lg flex-shrink-0" />
            <div className="flex-1 space-y-1.5">
              <div className="skeleton h-3 rounded w-3/4" />
              <div className="skeleton h-2.5 rounded w-1/2" />
            </div>
          </div>
        ))}
      </div>
    )
  }
  if (items.length === 0) {
    return <p className="text-sm text-h-tertiary text-center py-8">Sin movimientos recientes.</p>
  }
  return (
    <ul className="divide-y" style={{ borderColor: 'var(--h-border-subtle)' }}>
      {items.map(m => (
        <li key={m.id} className="flex items-center gap-3 py-2.5">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ background: m.tipo === 'entrada' ? 'var(--h-teal-subtle)' : 'var(--h-sem-warning-bg)' }}
          >
            {m.tipo === 'entrada'
              ? <ArrowUpCircle size={15} style={{ color: 'var(--h-teal-hover)' }} />
              : <ArrowDownCircle size={15} style={{ color: 'var(--h-sem-warning-text)' }} />
            }
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-h-primary truncate">{m.insumo}</p>
            <p className="text-xs text-h-tertiary truncate">
              {m.usuario}{m.sala ? ` · ${m.sala}` : ''}
            </p>
          </div>
          <div className="text-right flex-shrink-0">
            <p
              className="text-sm font-bold"
              style={{ color: m.tipo === 'entrada' ? 'var(--h-teal-hover)' : 'var(--h-sem-warning-text)' }}
            >
              {m.tipo === 'entrada' ? '+' : '-'}{m.cantidad}
            </p>
            <p className="text-[10px] text-h-tertiary">{tiempoRelativo(m.fecha)}</p>
          </div>
        </li>
      ))}
    </ul>
  )
}

function TopInsumosContent({ items, loading }: { items: TopInsumo[]; loading: boolean }) {
  const maxSalidas = Math.max(...items.map(i => i.total_salidas), 1)
  if (loading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i}>
            <div className="skeleton h-3 rounded w-3/4 mb-2" />
            <div className="skeleton h-2 rounded-full w-full" />
          </div>
        ))}
      </div>
    )
  }
  if (items.length === 0) {
    return <p className="text-sm text-h-tertiary text-center py-8">Sin salidas en los últimos 30 días.</p>
  }
  return (
    <ol className="space-y-3.5">
      {items.map((item, idx) => (
        <li key={item.nombre}>
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2 min-w-0">
              <span
                className="text-xs font-bold w-4 flex-shrink-0"
                style={{
                  color: idx === 0 ? 'var(--h-sem-warning-text)'
                       : idx === 1 ? 'var(--h-text-secondary)'
                       : idx === 2 ? '#EF9F27'
                       : 'var(--h-text-tertiary)',
                }}
              >
                {idx + 1}
              </span>
              <span className="text-xs font-medium text-h-secondary truncate">{item.nombre}</span>
            </div>
            <span className="text-xs font-bold flex-shrink-0 ml-2" style={{ color: 'var(--h-sem-warning-text)' }}>
              {item.total_salidas} u.
            </span>
          </div>
          <div className="h-1.5 bg-h-elevated rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{ width: `${(item.total_salidas / maxSalidas) * 100}%`, background: '#EF9F27' }}
            />
          </div>
        </li>
      ))}
    </ol>
  )
}

function SalasHoyContent({ items, loading }: { items: SalaHoy[]; loading: boolean }) {
  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i}>
            <div className="skeleton h-3 rounded w-2/3 mb-1.5" />
            <div className="skeleton h-2.5 rounded w-1/2" />
          </div>
        ))}
      </div>
    )
  }
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full py-6 gap-2">
        <CalendarDays size={28} className="text-h-tertiary opacity-40" />
        <p className="text-sm text-h-tertiary text-center">Sin talleres programados hoy</p>
      </div>
    )
  }
  return (
    <ul className="space-y-2.5">
      {items.map((s, i) => (
        <li
          key={i}
          className="p-2.5 rounded-xl border border-h-subtle"
          style={{ background: 'var(--h-bg-elevated)' }}
        >
          <p className="text-xs font-bold text-h-primary truncate">{s.sala_nombre}</p>
          <p className="text-[11px] text-h-secondary truncate mt-0.5">{s.taller_nombre}</p>
          {(s.hora_inicio || s.seccion) && (
            <div className="flex items-center gap-2 mt-1">
              {s.hora_inicio && (
                <span className="flex items-center gap-1 text-[10px] text-h-tertiary">
                  <Clock size={9} />
                  {s.hora_inicio}{s.hora_fin ? `–${s.hora_fin}` : ''}
                </span>
              )}
              {s.seccion && (
                <span className="text-[10px] text-h-tertiary">Secc. {s.seccion}</span>
              )}
            </div>
          )}
        </li>
      ))}
    </ul>
  )
}

function AlertasContent({ alertas, loading }: { alertas: InsumoAlerta[]; loading: boolean }) {
  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => <AlertaCardSkeleton key={i} />)}
      </div>
    )
  }
  if (alertas.length === 0) {
    return (
      <div
        className="rounded-xl p-4 text-center border"
        style={{ background: 'var(--h-sem-success-bg)', borderColor: 'var(--h-sem-success-border)' }}
      >
        <p className="font-semibold text-sm" style={{ color: 'var(--h-sem-success-text)' }}>
          Sin alertas activas
        </p>
        <p className="text-xs mt-0.5" style={{ color: 'var(--h-sem-success-text)', opacity: 0.75 }}>
          Todos los insumos están sobre el mínimo.
        </p>
      </div>
    )
  }
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
      {alertas.map(a => (
        <div
          key={a.id}
          className="bg-h-elevated rounded-xl border border-h-subtle p-3 flex items-start justify-between gap-3"
        >
          <div className="flex items-start gap-2.5">
            <div
              className="mt-0.5 w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ background: 'var(--h-sem-danger-bg)' }}
            >
              <AlertTriangle size={13} style={{ color: 'var(--h-sem-danger-text)' }} />
            </div>
            <div>
              <p className="text-xs font-semibold text-h-primary">{a.nombre}</p>
              <p className="text-[10px] text-h-tertiary mt-0.5">
                {a.sala ?? 'Sin sala'} · {a.categoria ?? 'Sin categoría'}
              </p>
              <p className="text-[10px] text-h-secondary mt-1">
                Stock:{' '}
                <span className="font-bold" style={{ color: 'var(--h-sem-danger-text)' }}>{a.stock_actual}</span>
                <span className="text-h-tertiary"> / mín. {a.stock_minimo}</span>
              </p>
            </div>
          </div>
          <Badge variant={a.stock_actual === 0 ? 'danger' : 'warning'}>
            {a.stock_actual === 0 ? 'Agotado' : `Déficit ${a.deficit}`}
          </Badge>
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sortable Wrapper
// ---------------------------------------------------------------------------

function SortableWidget({ id, renderContent }: { id: WidgetId, renderContent: (props: any) => React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 0 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className={`${WIDGET_CONFIG[id].classes} relative`}>
      <div className={`h-full w-full rounded-2xl transition-opacity duration-200 ${
        // Este es el diseño del "hueco" que queda en la grilla
        isDragging ? 'opacity-30 border-2 border-dashed border-h-teal-hover bg-h-bg-elevated' : 'opacity-100'
      }`}>
        {/* Ocultamos el contenido real del hueco para que no distraiga */}
        <div className={`h-full w-full ${isDragging ? 'invisible' : 'visible'}`}>
          {renderContent({ dragListeners: listeners, dragAttributes: attributes })}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Panel de personalización
// ---------------------------------------------------------------------------

function PanelPersonalizar({ hiddenWidgets, onToggle, onReset, onClose }: any) {
  return (
    <div className="absolute right-0 top-12 z-40 w-64 rounded-2xl border border-h-subtle shadow-2xl p-4" style={{ background: 'var(--h-bg-surface)' }}>
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-bold text-h-primary">Personalizar</p>
        <button onClick={onReset} className="flex items-center gap-1 text-xs text-h-tertiary hover:text-h-teal-hover transition-colors"><RotateCcw size={11} /> Restablecer</button>
      </div>
      <ul className="space-y-1">
        {ALL_WIDGET_IDS.map(id => (
          <li key={id}>
            <button onClick={() => onToggle(id)} className="w-full flex items-center justify-between px-2 py-1.5 rounded-lg text-left hover:bg-h-elevated transition-colors">
              <span className="text-xs text-h-secondary">{WIDGET_CONFIG[id].label}</span>
              {!hiddenWidgets.has(id) ? <Eye size={13} style={{ color: 'var(--h-teal-hover)' }} /> : <EyeOff size={13} className="text-h-tertiary" />}
            </button>
          </li>
        ))}
      </ul>
      <button onClick={onClose} className="mt-3 w-full text-center text-xs text-h-tertiary hover:text-h-secondary transition-colors">Cerrar</button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Dashboard principal
// ---------------------------------------------------------------------------

export function Dashboard() {
  const { user } = useAuthStore()
  const uid = user?.id ?? 0

  const [resumen,    setResumen]    = useState<ResumenResponse | null>(null)
  const [activeWidget, setActiveWidget] = useState<WidgetId | null>(null)
  const [alertas,    setAlertas]    = useState<InsumoAlerta[]>([])
  const [semana,     setSemana]     = useState<DiaMovimiento[]>([])
  const [actividad,  setActividad]  = useState<ActividadReciente[]>([])
  const [topInsumos, setTopInsumos] = useState<TopInsumo[]>([])
  const [salasHoy,   setSalasHoy]   = useState<SalaHoy[]>([])
  

  const [loading,          setLoading]      = useState(true)
  const [chartLoading,     setChartLoading] = useState(true)
  const [actividadLoading, setActLoading]   = useState(true)
  const [topLoading,       setTopLoading]   = useState(true)
  const [salasLoading,     setSalasLoading] = useState(true)
  

  // ── Nuevo Estado de Orden (Dnd-Kit) ──────────────────────────────────────
  const [widgetOrder, setWidgetOrder] = useState<WidgetId[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_ORDER_KEY(uid))
      if (saved) {
        const parsed = JSON.parse(saved)
        // Asegurar que no falte ningún widget nuevo si se actualizaron
        const missing = DEFAULT_ORDER.filter(id => !parsed.includes(id))
        return [...parsed, ...missing]
      }
      return DEFAULT_ORDER
    } catch { return DEFAULT_ORDER }
  })

  const [hiddenWidgets, setHiddenWidgets] = useState<Set<WidgetId>>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_HIDDEN_KEY(uid))
      return saved ? new Set<WidgetId>(JSON.parse(saved)) : new Set()
    } catch { return new Set() }
  })

  const [showPersonalizar, setShowPersonalizar] = useState(false)
  const { labelTiempo, marcarActualizado } = useLastUpdated()

  // ── Sensores para Dnd-Kit ────────────────────────────────────────────────
  // El constraint de distancia evita clics accidentales como arrastres
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [r, a] = await Promise.all([
        api.get<ResumenResponse>('/resumen/'),
        api.get<InsumoAlerta[]>('/insumos/alertas'),
      ])
      setResumen(r.data)
      setAlertas(a.data.slice(0, 12))
      marcarActualizado()
    } finally { setLoading(false) }
  }, [marcarActualizado])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    async function loadChart() {
      try {
        const { data } = await api.get<DiaMovimiento[]>('/resumen/grafico-semana')
        setSemana(data)
      } finally { setChartLoading(false) }
    }
    async function loadActividad() {
      try {
        const { data } = await api.get<ActividadReciente[]>(
          '/resumen/actividad-reciente', { params: { limit: 10 } },
        )
        setActividad(data)
      } finally { setActLoading(false) }
    }
    async function loadTop() {
      try {
        const { data } = await api.get<TopInsumo[]>(
          '/resumen/top-insumos-retirados', { params: { dias: 30, limit: 8 } },
        )
        setTopInsumos(data)
      } finally { setTopLoading(false) }
    }
    async function loadSalas() {
      try {
        const { data } = await api.get<SalaHoy[]>('/resumen/salas-hoy')
        setSalasHoy(data)
      } finally { setSalasLoading(false) }
    }
    
    loadChart(); 
    loadActividad(); 
    loadTop(); 
    loadSalas()
  }, [])

  // ── Handlers ──────────────────────────────────────────────────────────────

  function handleDragStart(event: DragStartEvent) {
    setActiveWidget(event.active.id as WidgetId)
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveWidget(null) // Soltamos la caja
    const { active, over } = event
    if (over && active.id !== over.id) {
      setWidgetOrder((items) => {
        const oldIndex = items.indexOf(active.id as WidgetId)
        const newIndex = items.indexOf(over.id as WidgetId)
        const newOrder = arrayMove(items, oldIndex, newIndex)
        localStorage.setItem(STORAGE_ORDER_KEY(uid), JSON.stringify(newOrder))
        return newOrder
      })
    }
  }

  function handleDragCancel() {
    setActiveWidget(null)
  }

  function toggleWidget(id: WidgetId) {
    setHiddenWidgets(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      localStorage.setItem(STORAGE_HIDDEN_KEY(uid), JSON.stringify([...next]))
      return next
    })
  }

  function resetLayout() {
    setWidgetOrder(DEFAULT_ORDER)
    setHiddenWidgets(new Set())
    localStorage.removeItem(STORAGE_ORDER_KEY(uid))
    localStorage.removeItem(STORAGE_HIDDEN_KEY(uid))
    setShowPersonalizar(false)
  }

  const visibleWidgets = widgetOrder.filter(id => !hiddenWidgets.has(id))

  // ── Renderizadores de contenido por Widget ────────────────────────────────
  const widgetRenderers: Record<WidgetId, (props: any) => React.ReactNode> = {
    grafico_semana: (props) => (
      <WidgetCard title="Actividad semanal" icon={<ArrowUpCircle size={13} style={{ color: 'var(--h-teal-hover)' }} />} extra={<span className="text-xs text-h-tertiary">últimos 7 días</span>} {...props}>
        {semana.length > 0 && <GraficoBarras datos={semana} />}
      </WidgetCard>
    ),
    estado_inventario: (props) => (
      <WidgetCard title="Estado del inventario" icon={<Package size={13} className="text-h-tertiary" />} {...props}>
        {resumen && <GraficoEstado total={resumen.total_insumos} bajo={resumen.insumos_bajo_stock} agotados={resumen.insumos_agotados} />}
      </WidgetCard>
    ),
    actividad: (props) => (
      <WidgetCard title="Actividad reciente" icon={<Activity size={13} className="text-h-tertiary" />} {...props}>
         {actividad.length > 0 && <FeedActividadContent items={actividad} loading={actividadLoading} />}
      </WidgetCard>
    ),
    top_insumos: (props) => (
      <WidgetCard title="Más retirados" icon={<TrendingDown size={13} style={{ color: 'var(--h-sem-warning-text)' }} />} {...props}>
        {topInsumos.length > 0 && <TopInsumosContent items={topInsumos} loading={topLoading} />}
      </WidgetCard>
    ),
    salas_hoy: (props) => (
      <WidgetCard title="Salas con clase hoy" icon={<CalendarDays size={13} className="text-h-tertiary" />} {...props}>
        {salasHoy.length > 0 && <SalasHoyContent items={salasHoy} loading={salasLoading} />}
      </WidgetCard>
    ),
    alertas: (props) => (
      <WidgetCard title="Alertas de stock" icon={<AlertTriangle size={13} style={{ color: 'var(--h-sem-warning-text)' }} />} {...props}>
        {alertas.length > 0 && <AlertasContent alertas={alertas} loading={loading} />}
      </WidgetCard>
    ),
  }

  return (
    <div className="p-6 w-full max-w-[1600px] mx-auto">
      {/* Encabezado */}
      <div className="flex items-start justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold text-h-primary flex items-center gap-2"><LayoutDashboard size={22} className="text-h-accent" /> Dashboard</h1>
          <p className="text-xs text-h-tertiary mt-1">{labelTiempo}</p>
        </div>
        <div className="flex items-center gap-2 relative">
          <button onClick={load} className="p-2 rounded-lg border border-h-subtle bg-h-elevated text-h-tertiary hover:bg-h-highlight transition-colors"><RefreshCw size={15} /></button>
          <button onClick={() => setShowPersonalizar(v => !v)} className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-h-subtle bg-h-elevated text-h-secondary text-xs font-semibold hover:bg-h-highlight transition-colors"><Eye size={13} /> Personalizar</button>
          {showPersonalizar && <PanelPersonalizar hiddenWidgets={hiddenWidgets} onToggle={toggleWidget} onReset={resetLayout} onClose={() => setShowPersonalizar(false)} />}
        </div>
      </div>

      <MetricasFijas resumen={resumen} loading={loading} />

      {/* ── BENTO BOX NATIVO CON CSS GRID & DND-KIT ── */}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd} onDragCancel={handleDragCancel}> 
        <SortableContext items={visibleWidgets} strategy={rectSortingStrategy}>
          {/* Añadimos grid-flow-row-dense y auto-rows-[160px] */}
          <div className="grid grid-cols-1 md:grid-cols-6 xl:grid-cols-12 gap-4 auto-rows-[160px] grid-flow-row-dense w-full relative">
            {visibleWidgets.map(id => (
              <SortableWidget key={id} id={id} renderContent={widgetRenderers[id]} />
            ))}
          </div>
        </SortableContext>

        {/* ── LA MAGIA VISUAL: EL OVERLAY DE ARRASTRE ── */}
        <DragOverlay dropAnimation={{
          duration: 300,
          easing: 'cubic-bezier(0.18, 0.67, 0.6, 1.22)', // Efecto de rebote (Spring)
          sideEffects: defaultDropAnimationSideEffects({ styles: { active: { opacity: '0.4' } } }),
        }}>
          {activeWidget ? (
            <div className={`scale-105 shadow-2xl opacity-95 ${WIDGET_CONFIG[activeWidget].classes} cursor-grabbing`}>
              {widgetRenderers[activeWidget]({ dragListeners: {}, dragAttributes: {} })}
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  )
}