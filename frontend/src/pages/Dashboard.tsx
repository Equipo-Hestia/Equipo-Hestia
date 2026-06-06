import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Package, AlertTriangle, ArrowUpCircle,
  ArrowDownCircle, DoorOpen, Users, ArrowRight,
  XCircle, Activity, TrendingDown
} from 'lucide-react'
import { api } from '../api/client'
import type {
  ResumenResponse, InsumoAlerta, DiaMovimiento,
  ActividadReciente, TopInsumo
} from '../types/api'
import { MetricCard } from '../components/ui/Card'
import { MetricCardSkeleton, AlertaCardSkeleton } from '../components/ui/Skeleton'
import { Badge } from '../components/ui/Badge'

function tiempoRelativo(isoFecha: string): string {
  const diff = Math.floor((Date.now() - new Date(isoFecha).getTime()) / 1000)
  if (diff < 60) return 'Hace un momento'
  if (diff < 3600) return `Hace ${Math.floor(diff / 60)} min`
  if (diff < 86400) return `Hace ${Math.floor(diff / 3600)} h`
  if (diff < 172800) return 'Ayer'
  return new Date(isoFecha).toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit' })
}

function GraficoBarras({ datos }: { datos: DiaMovimiento[] }) {
  if (!datos.length) return null
  const max = Math.max(...datos.flatMap(d => [d.entradas, d.salidas]), 1)

  function labelDia(iso: string) {
    return new Date(iso + 'T12:00:00')
      .toLocaleDateString('es-CL', { weekday: 'short' })
      .replace('.', '')
  }

  return (
    <div>
      <div className="flex items-end gap-1.5 h-28">
        {datos.map(d => (
          <div key={d.fecha} className="flex-1 flex flex-col items-center">
            <div className="flex items-end gap-0.5 h-24 w-full">
              <div
                title={`Entradas: ${d.entradas}`}
                className="flex-1 rounded-t-sm transition-all duration-500"
                style={{
                  background:  'var(--h-teal-hover)',
                  height:      `${(d.entradas / max) * 100}%`,
                  minHeight:   d.entradas ? 3 : 0,
                }}
              />
              <div
                title={`Salidas: ${d.salidas}`}
                className="flex-1 rounded-t-sm transition-all duration-500"
                style={{
                  background: '#EF9F27',
                  height:     `${(d.salidas / max) * 100}%`,
                  minHeight:  d.salidas ? 3 : 0,
                }}
              />
            </div>
            <span className="text-[10px] text-h-tertiary mt-1 capitalize">
              {labelDia(d.fecha)}
            </span>
          </div>
        ))}
      </div>
      <div className="flex gap-4 mt-3">
        <div className="flex items-center gap-1.5 text-xs text-h-tertiary">
          <div className="w-2.5 h-2.5 rounded-sm"
            style={{ background: 'var(--h-teal-hover)' }} />
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
  const ok        = total - bajo
  const soloAlerta = bajo - agotados
  const base      = Math.max(total, 1)

  const filas = [
    {
      label: 'Stock OK',
      valor: ok,
      pct:   ok / base,
      barBg: 'var(--h-teal-hover)',
      textStyle: { color: 'var(--h-sem-success-text)' },
    },
    {
      label: 'Bajo mínimo',
      valor: soloAlerta,
      pct:   soloAlerta / base,
      barBg: '#EF9F27',
      textStyle: { color: 'var(--h-sem-warning-text)' },
    },
    {
      label: 'Agotados',
      valor: agotados,
      pct:   agotados / base,
      barBg: 'var(--h-sem-danger-border)',
      textStyle: { color: 'var(--h-sem-danger-text)' },
    },
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

function FeedActividad({ items, loading }: {
  items: ActividadReciente[]; loading: boolean
}) {
  return (
    <div className="bg-h-surface rounded-2xl border border-h-subtle p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Activity size={15} className="text-h-tertiary" />
          <p className="text-sm font-semibold text-h-primary">Actividad reciente</p>
        </div>
        <Link
          to="/movimientos"
          className="text-xs font-semibold flex items-center gap-1
                     transition-colors duration-150"
          style={{ color: 'var(--h-teal-hover)' }}
        >
          Ver todo <ArrowRight size={12} />
        </Link>
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="skeleton w-8 h-8 rounded-lg flex-shrink-0" />
              <div className="flex-1 space-y-1.5">
                <div className="skeleton h-3 rounded w-3/4" />
                <div className="skeleton h-2.5 rounded w-1/2" />
              </div>
              <div className="skeleton h-3 rounded w-14" />
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        <p className="text-sm text-h-tertiary text-center py-8">Sin movimientos recientes.</p>
      ) : (
        <ul className="divide-y border-h-subtle">
          {items.map(m => (
            <li key={m.id} className="flex items-center gap-3 py-2.5">
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{
                  background: m.tipo === 'entrada'
                    ? 'var(--h-teal-subtle)'
                    : 'var(--h-sem-warning-bg)',
                }}
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
                  style={{
                    color: m.tipo === 'entrada'
                      ? 'var(--h-teal-hover)'
                      : 'var(--h-sem-warning-text)',
                  }}
                >
                  {m.tipo === 'entrada' ? '+' : '-'}{m.cantidad}
                </p>
                <p className="text-[10px] text-h-tertiary">{tiempoRelativo(m.fecha)}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function TopInsumos({ items, loading }: {
  items: TopInsumo[]; loading: boolean
}) {
  const maxSalidas = Math.max(...items.map(i => i.total_salidas), 1)

  return (
    <div className="bg-h-surface rounded-2xl border border-h-subtle p-5">
      <div className="flex items-center gap-2 mb-4">
        <TrendingDown size={15} style={{ color: 'var(--h-sem-warning-text)' }} />
        <p className="text-sm font-semibold text-h-primary">Más retirados</p>
        <span className="ml-auto text-xs text-h-tertiary">últimos 30 días</span>
      </div>

      {loading ? (
        <div className="space-y-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i}>
              <div className="skeleton h-3 rounded w-3/4 mb-2" />
              <div className="skeleton h-2 rounded-full w-full" />
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        <p className="text-sm text-h-tertiary text-center py-8">
          Sin salidas en los últimos 30 días.
        </p>
      ) : (
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
                  <span className="text-xs font-medium text-h-secondary truncate">
                    {item.nombre}
                  </span>
                </div>
                <span
                  className="text-xs font-bold flex-shrink-0 ml-2"
                  style={{ color: 'var(--h-sem-warning-text)' }}
                >
                  {item.total_salidas} u.
                </span>
              </div>
              <div className="h-1.5 bg-h-elevated rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{
                    width:      `${(item.total_salidas / maxSalidas) * 100}%`,
                    background: '#EF9F27',
                  }}
                />
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

export function Dashboard() {
  const [resumen,        setResumen]        = useState<ResumenResponse | null>(null)
  const [alertas,        setAlertas]        = useState<InsumoAlerta[]>([])
  const [semana,         setSemana]         = useState<DiaMovimiento[]>([])
  const [actividad,      setActividad]      = useState<ActividadReciente[]>([])
  const [topInsumos,     setTopInsumos]     = useState<TopInsumo[]>([])
  const [loading,        setLoading]        = useState(true)
  const [chartLoading,   setChartLoading]   = useState(true)
  const [actividadLoading, setActLoading]   = useState(true)
  const [topLoading,     setTopLoading]     = useState(true)

  useEffect(() => {
    async function loadPrincipal() {
      try {
        const [r, a] = await Promise.all([
          api.get<ResumenResponse>('/resumen/'),
          api.get<InsumoAlerta[]>('/insumos/alertas'),
        ])
        setResumen(r.data); setAlertas(a.data.slice(0, 5))
      } finally { setLoading(false) }
    }
    async function loadChart() {
      try {
        const { data } = await api.get<DiaMovimiento[]>('/resumen/grafico-semana')
        setSemana(data)
      } finally { setChartLoading(false) }
    }
    async function loadActividad() {
      try {
        const { data } = await api.get<ActividadReciente[]>(
          '/resumen/actividad-reciente', { params: { limit: 8 } }
        )
        setActividad(data)
      } finally { setActLoading(false) }
    }
    async function loadTop() {
      try {
        const { data } = await api.get<TopInsumo[]>(
          '/resumen/top-insumos-retirados', { params: { dias: 30, limit: 8 } }
        )
        setTopInsumos(data)
      } finally { setTopLoading(false) }
    }
    loadPrincipal(); loadChart(); loadActividad(); loadTop()
  }, [])

  return (
    <div className="p-8 max-w-6xl mx-auto">

      {/* Título de página */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-h-primary">Dashboard</h1>
        <p className="text-h-secondary text-sm mt-0.5">
          Vista general del inventario —{' '}
          {new Date().toLocaleDateString('es-CL', {
            weekday: 'long', day: 'numeric', month: 'long',
          })}
        </p>
      </div>

      {/* Métricas de inventario */}
      <section className="mb-8">
        <h2 className="text-[10px] font-semibold text-h-tertiary uppercase tracking-widest mb-3">
          Inventario
        </h2>
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
          {loading ? (
            Array.from({ length: 6 }).map((_, i) => <MetricCardSkeleton key={i} />)
          ) : resumen && (
            <>
              <MetricCard
                label="Total insumos" value={resumen.total_insumos}
                icon={<Package size={18} style={{ color: 'var(--h-teal-hover)' }} />}
              />
              <MetricCard
                label="Bajo stock" value={resumen.insumos_bajo_stock}
                icon={<AlertTriangle size={18} style={{ color: 'var(--h-sem-warning-text)' }} />}
                iconBg="bg-h-warning"
                accent={resumen.insumos_bajo_stock > 0}
              />
              <MetricCard
                label="Agotados" value={resumen.insumos_agotados}
                icon={<XCircle size={18} style={{ color: 'var(--h-sem-danger-text)' }} />}
                iconBg="bg-h-danger"
                accent={resumen.insumos_agotados > 0}
              />
              <MetricCard
                label="Movimientos hoy" value={resumen.movimientos_hoy}
                icon={<Package size={18} className="text-h-tertiary" />}
                iconBg="bg-h-elevated"
              />
              <MetricCard
                label="Entradas hoy" value={resumen.entradas_hoy}
                icon={<ArrowUpCircle size={18} style={{ color: 'var(--h-teal-hover)' }} />}
              />
              <MetricCard
                label="Salidas hoy" value={resumen.salidas_hoy}
                icon={<ArrowDownCircle size={18} style={{ color: 'var(--h-sem-warning-text)' }} />}
                iconBg="bg-h-warning"
              />
            </>
          )}
        </div>
      </section>

      {/* Análisis */}
      <section className="mb-8">
        <h2 className="text-[10px] font-semibold text-h-tertiary uppercase tracking-widest mb-3">
          Análisis
        </h2>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

          {/* Gráfico semanal */}
          <div className="lg:col-span-2 bg-h-surface rounded-2xl border border-h-subtle p-5">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm font-semibold text-h-primary">Actividad semanal</p>
              <div className="flex items-center gap-1">
                <ArrowUpCircle size={12} style={{ color: 'var(--h-teal-hover)' }} />
                <ArrowDownCircle size={12} style={{ color: '#EF9F27' }} />
                <span className="text-xs text-h-tertiary ml-1">últimos 7 días</span>
              </div>
            </div>
            {chartLoading ? (
              <div className="h-28 flex items-end gap-1.5">
                {Array.from({ length: 7 }).map((_, i) => (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1">
                    <div
                      className="w-full bg-h-elevated rounded-t skeleton"
                      style={{ height: `${30 + (i * 11) % 60}%` }}
                    />
                  </div>
                ))}
              </div>
            ) : (
              <GraficoBarras datos={semana} />
            )}
          </div>

          {/* Estado del inventario */}
          <div className="bg-h-surface rounded-2xl border border-h-subtle p-5">
            <p className="text-sm font-semibold text-h-primary mb-4">Estado del inventario</p>
            {loading || !resumen ? (
              <div className="space-y-4">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i}>
                    <div className="skeleton h-3 w-24 rounded mb-1.5" />
                    <div className="skeleton h-2 w-full rounded-full" />
                  </div>
                ))}
              </div>
            ) : (
              <GraficoEstado
                total={resumen.total_insumos}
                bajo={resumen.insumos_bajo_stock}
                agotados={resumen.insumos_agotados}
              />
            )}
            {!loading && resumen && resumen.insumos_bajo_stock > 0 && (
              <Link
                to="/alertas"
                className="
                  mt-5 flex items-center justify-between p-3 rounded-xl
                  border transition-colors duration-150
                "
                style={{
                  background:   'var(--h-sem-danger-bg)',
                  borderColor:  'var(--h-sem-danger-border)',
                }}
              >
                <div className="flex items-center gap-2">
                  <AlertTriangle size={14} style={{ color: 'var(--h-sem-danger-text)' }} />
                  <span
                    className="text-xs font-semibold"
                    style={{ color: 'var(--h-sem-danger-text)' }}
                  >
                    {resumen.insumos_bajo_stock} alertas activas
                  </span>
                </div>
                <ArrowRight size={13} style={{ color: 'var(--h-sem-danger-text)' }} />
              </Link>
            )}
          </div>
        </div>
      </section>

      {/* Movimientos */}
      <section className="mb-8">
        <h2 className="text-[10px] font-semibold text-h-tertiary uppercase tracking-widest mb-3">
          Movimientos
        </h2>
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          <div className="lg:col-span-3">
            <FeedActividad items={actividad} loading={actividadLoading} />
          </div>
          <div className="lg:col-span-2">
            <TopInsumos items={topInsumos} loading={topLoading} />
          </div>
        </div>
      </section>

      {/* Alertas de stock */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-[10px] font-semibold text-h-tertiary uppercase tracking-widest">
            Alertas de stock
          </h2>
          <Link
            to="/alertas"
            className="text-xs font-semibold flex items-center gap-1 transition-colors duration-150"
            style={{ color: 'var(--h-teal-hover)' }}
          >
            Ver todas <ArrowRight size={13} />
          </Link>
        </div>

        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => <AlertaCardSkeleton key={i} />)}
          </div>
        ) : alertas.length === 0 ? (
          <div
            className="rounded-xl p-6 text-center border"
            style={{
              background:  'var(--h-sem-success-bg)',
              borderColor: 'var(--h-sem-success-border)',
            }}
          >
            <p
              className="font-semibold text-sm"
              style={{ color: 'var(--h-sem-success-text)' }}
            >
              Sin alertas activas
            </p>
            <p
              className="text-xs mt-1"
              style={{ color: 'var(--h-sem-success-text)', opacity: 0.75 }}
            >
              Todos los insumos están sobre el mínimo.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {alertas.map(a => (
              <div
                key={a.id}
                className="bg-h-surface rounded-xl border border-h-subtle p-4
                           flex items-start justify-between gap-3"
              >
                <div className="flex items-start gap-3">
                  <div
                    className="mt-0.5 w-8 h-8 rounded-lg flex items-center
                               justify-center flex-shrink-0"
                    style={{ background: 'var(--h-sem-danger-bg)' }}
                  >
                    <AlertTriangle size={15} style={{ color: 'var(--h-sem-danger-text)' }} />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-h-primary">{a.nombre}</p>
                    <p className="text-xs text-h-tertiary mt-0.5">
                      {a.sala ?? 'Sin sala'} · {a.categoria ?? 'Sin categoría'}
                    </p>
                    <div className="flex items-center gap-3 mt-2">
                      <span className="text-xs text-h-secondary">
                        Stock:{' '}
                        <span
                          className="font-bold"
                          style={{ color: 'var(--h-sem-danger-text)' }}
                        >
                          {a.stock_actual}
                        </span>
                        <span className="text-h-tertiary"> / mín. {a.stock_minimo}</span>
                      </span>
                    </div>
                  </div>
                </div>
                <Badge variant={a.stock_actual === 0 ? 'danger' : 'warning'}>
                  {a.stock_actual === 0 ? 'Agotado' : `Déficit ${a.deficit}`}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Footer de contexto */}
      {!loading && resumen && (
        <div
          className="mt-6 pt-6 border-t border-h-subtle
                     flex items-center gap-2 text-xs text-h-tertiary"
        >
          <DoorOpen size={13} />
          <span>{resumen.total_salas} salas</span>
          <span className="mx-1">·</span>
          <Users size={13} />
          <span>{resumen.total_usuarios} usuarios activos</span>
        </div>
      )}
    </div>
  )
}
