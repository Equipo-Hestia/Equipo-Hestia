import { useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2, RefreshCw, CalendarClock, CalendarX } from 'lucide-react'
import { api } from '../api/client'
import type { InsumoAlerta, InsumoVencimiento } from '../types/api'
import { Badge } from '../components/ui/Badge'
import { AlertaCardSkeleton } from '../components/ui/Skeleton'

type Tab = 'activas' | 'resueltas' | 'vencimientos'
const DIAS_OPTIONS = [7, 14, 30] as const
const DIAS_VENC_OPTIONS = [7, 14, 30, 60, 90] as const

function formatAntiguedad(fecha: Date): string {
  const diff = Math.floor((Date.now() - fecha.getTime()) / 1000)
  if (diff < 60) return 'Actualizado hace un momento'
  if (diff < 3600) return `Actualizado hace ${Math.floor(diff / 60)} min`
  return `Actualizado el ${fecha.toLocaleString('es-CL', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  })}`
}

function formatFecha(fechaISO: string): string {
  return new Date(fechaISO + 'T00:00:00').toLocaleDateString('es-CL', {
    day: '2-digit', month: '2-digit', year: 'numeric'
  })
}

export function Alertas() {
  const [tab, setTab]         = useState<Tab>('activas')
  const [dias, setDias]       = useState<number>(30)
  const [diasVenc, setDiasVenc] = useState<number>(30)
  const [refetchKey, setRefetchKey] = useState(0)

  const [activas, setActivas]       = useState<InsumoAlerta[]>([])
  const [resueltas, setResueltas]   = useState<InsumoAlerta[]>([])
  const [vencimientos, setVencimientos] = useState<InsumoVencimiento[]>([])

  const [loading, setLoading]     = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  useEffect(() => {
    setLoading(true)
    let url = ''
    if (tab === 'activas') url = '/insumos/alertas'
    else if (tab === 'resueltas') url = `/insumos/alertas-resueltas?dias=${dias}`
    else url = `/insumos/alertas-vencimiento?dias=${diasVenc}`

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    api.get<any[]>(url)
      .then(({ data }) => {
        if (tab === 'activas') setActivas(data)
        else if (tab === 'resueltas') setResueltas(data)
        else setVencimientos(data)
        setLastUpdated(new Date())
      })
      .finally(() => {
        setLoading(false)
        setRefreshing(false)
      })
  }, [tab, dias, diasVenc, refetchKey])

  function refresh() {
    setRefreshing(true)
    setRefetchKey(k => k + 1)
  }

  function gravedad(a: InsumoAlerta): 'danger' | 'warning' {
    return a.stock_actual === 0 || a.deficit >= a.stock_minimo ? 'danger' : 'warning'
  }

  const itemsStock = tab === 'activas' ? activas : resueltas
  const vencidosCount  = vencimientos.filter(v => v.vencido).length
  const proximosCount  = vencimientos.filter(v => !v.vencido).length

  // Descripción del subtitulo según tab activa
  const subtitulo: Record<Tab, string> = {
    activas: 'Insumos con stock igual o por debajo del mínimo establecido.',
    resueltas: 'Insumos que superaron el mínimo y recibieron entradas recientemente.',
    vencimientos: 'Insumos con fecha de vencimiento vencida o próxima a vencer.',
  }

  return (
    <div className="p-8 max-w-4xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-black text-slate-900">Alertas</h1>
          <p className="text-slate-500 text-sm mt-0.5">{subtitulo[tab]}</p>
          {lastUpdated && (
            <p className="text-xs text-slate-400 mt-0.5">{formatAntiguedad(lastUpdated)}</p>
          )}
        </div>
        <button
          onClick={refresh}
          disabled={refreshing || loading}
          className="flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-200
                     text-slate-600 hover:bg-slate-100 text-sm font-semibold transition-colors"
        >
          <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
          Actualizar
        </button>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl mb-5 w-fit">
        {(['activas', 'resueltas', 'vencimientos'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-5 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
              tab === t
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {t === 'activas' ? 'Stock activas'
              : t === 'resueltas' ? 'Stock resueltas'
              : 'Vencimientos'}
          </button>
        ))}
      </div>

      {/* Selector de días (tab resueltas) */}
      {tab === 'resueltas' && (
        <div className="flex items-center gap-2 mb-5">
          <span className="text-sm text-slate-500">Entradas en los últimos:</span>
          {DIAS_OPTIONS.map((d) => (
            <button key={d} onClick={() => setDias(d)}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors ${
                dias === d ? 'bg-teal-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}>
              {d} días
            </button>
          ))}
        </div>
      )}

      {/* Selector de días (tab vencimientos) */}
      {tab === 'vencimientos' && (
        <div className="flex items-center gap-2 mb-5">
          <span className="text-sm text-slate-500">Mostrar vencidos + los que vencen en:</span>
          {DIAS_VENC_OPTIONS.map((d) => (
            <button key={d} onClick={() => setDiasVenc(d)}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors ${
                diasVenc === d
                  ? 'bg-amber-500 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}>
              {d}d
            </button>
          ))}
        </div>
      )}

      {/* Contador */}
      {!loading && (
        <div className="flex items-center gap-2 mb-5">
          {tab === 'vencimientos' ? (
            <>
              <span className="text-sm text-slate-500">
                {vencimientos.length === 0
                  ? 'Sin alertas de vencimiento en este rango'
                  : `${vencimientos.length} insumo${vencimientos.length !== 1 ? 's' : ''} con alerta de vencimiento`}
              </span>
              {vencidosCount > 0 && (
                <Badge variant="danger">{vencidosCount} vencido{vencidosCount !== 1 ? 's' : ''}</Badge>
              )}
              {proximosCount > 0 && (
                <Badge variant="warning">{proximosCount} próximo{proximosCount !== 1 ? 's' : ''}</Badge>
              )}
            </>
          ) : (
            <>
              <span className="text-sm text-slate-500">
                {itemsStock.length === 0
                  ? (tab === 'activas' ? 'Sin alertas activas' : 'Sin alertas resueltas en este período')
                  : `${itemsStock.length} insumo${itemsStock.length !== 1 ? 's' : ''} ${
                      tab === 'activas' ? 'en alerta' : 'resuelto' + (itemsStock.length !== 1 ? 's' : '')
                    }`
                }
              </span>
              {tab === 'activas' && activas.length > 0 && (
                <Badge variant="danger">
                  {activas.filter(a => a.stock_actual === 0).length} agotados
                </Badge>
              )}
            </>
          )}
        </div>
      )}

      {/* ── Contenido: tabs de stock (activas / resueltas) ── */}
      {tab !== 'vencimientos' && (
        loading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => <AlertaCardSkeleton key={i} />)}
          </div>
        ) : itemsStock.length === 0 ? (
          <div className={`border rounded-2xl p-12 text-center ${
            tab === 'activas' ? 'bg-teal-50 border-teal-200' : 'bg-slate-50 border-slate-200'
          }`}>
            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4 ${
              tab === 'activas' ? 'bg-teal-100' : 'bg-slate-100'
            }`}>
              {tab === 'activas'
                ? <AlertTriangle size={24} className="text-teal-600" />
                : <CheckCircle2 size={24} className="text-slate-400" />
              }
            </div>
            <p className={`font-bold ${
              tab === 'activas' ? 'text-teal-800' : 'text-slate-700'
            }`}>
              {tab === 'activas'
                ? 'Todo el inventario está en orden'
                : `Sin alertas resueltas en los últimos ${dias} días`}
            </p>
            <p className={`text-sm mt-1 ${
              tab === 'activas' ? 'text-teal-600' : 'text-slate-500'
            }`}>
              {tab === 'activas'
                ? 'Ningún insumo está bajo el stock mínimo definido.'
                : 'No hubo insumos que superaran el mínimo en este período.'}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {itemsStock.map((a) => (
              <div key={a.id}
                className={`bg-white rounded-xl border p-5 shadow-sm hover:shadow-md transition-all ${
                  tab === 'resueltas'
                    ? 'border-teal-200 hover:border-teal-300'
                    : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-4">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                      tab === 'resueltas' ? 'bg-teal-50' :
                      a.stock_actual === 0 ? 'bg-rose-100' : 'bg-amber-50'
                    }`}>
                      {tab === 'resueltas'
                        ? <CheckCircle2 size={18} className="text-teal-600" />
                        : <AlertTriangle size={18}
                            className={a.stock_actual === 0 ? 'text-rose-600' : 'text-amber-500'} />
                      }
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-bold text-slate-900">{a.nombre}</p>
                        {tab === 'resueltas'
                          ? <Badge variant="success">Resuelto</Badge>
                          : a.stock_actual === 0 && <Badge variant="danger">Agotado</Badge>
                        }
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {a.sala ?? 'Sin sala asignada'}
                        {a.categoria ? ` · ${a.categoria}` : ''}
                      </p>
                    </div>
                  </div>
                  {tab === 'activas'
                    ? <Badge variant={gravedad(a)}>Déficit: {a.deficit}</Badge>
                    : <span className="text-xs text-teal-600 font-bold whitespace-nowrap">
                        Stock: {a.stock_actual} / mín {a.stock_minimo}
                      </span>
                  }
                </div>
                <div className="mt-4">
                  <div className="flex justify-between text-xs text-slate-500 mb-1.5">
                    <span>Stock actual: <span className="font-bold text-slate-700">{a.stock_actual}</span></span>
                    <span>Mínimo: <span className="font-bold">{a.stock_minimo}</span></span>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        tab === 'resueltas' ? 'bg-teal-500' :
                        a.stock_actual === 0 ? 'bg-rose-500' : 'bg-amber-400'
                      }`}
                      style={{
                        width: `${Math.min(100, (a.stock_actual / Math.max(a.stock_minimo, 1)) * 100)}%`
                      }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {/* ── Contenido: tab vencimientos ── */}
      {tab === 'vencimientos' && (
        loading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => <AlertaCardSkeleton key={i} />)}
          </div>
        ) : vencimientos.length === 0 ? (
          <div className="bg-teal-50 border border-teal-200 rounded-2xl p-12 text-center">
            <div className="w-14 h-14 rounded-2xl bg-teal-100 flex items-center
                            justify-center mx-auto mb-4">
              <CalendarClock size={24} className="text-teal-600" />
            </div>
            <p className="font-bold text-teal-800">
              Ningún insumo vence en los próximos {diasVenc} días
            </p>
            <p className="text-sm mt-1 text-teal-600">
              Solo se muestran insumos con fecha de vencimiento registrada.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Separador: vencidos */}
            {vencidosCount > 0 && (
              <p className="text-xs font-bold text-rose-500 uppercase tracking-wide px-1">
                Vencidos — {vencidosCount} insumo{vencidosCount !== 1 ? 's' : ''}
              </p>
            )}
            {vencimientos.filter(v => v.vencido).map((v) => (
              <VencimientoCard key={v.id} v={v} />
            ))}

            {/* Separador: próximos a vencer */}
            {proximosCount > 0 && vencidosCount > 0 && (
              <div className="pt-2" />
            )}
            {proximosCount > 0 && (
              <p className="text-xs font-bold text-amber-600 uppercase tracking-wide px-1">
                Próximos a vencer — {proximosCount} insumo{proximosCount !== 1 ? 's' : ''}
              </p>
            )}
            {vencimientos.filter(v => !v.vencido).map((v) => (
              <VencimientoCard key={v.id} v={v} />
            ))}
          </div>
        )
      )}
    </div>
  )
}

/** Tarjeta individual para un insumo con alerta de vencimiento. */
function VencimientoCard({ v }: { v: InsumoVencimiento }) {
  const urgente = v.vencido || v.dias_para_vencer <= 7

  function etiquetaDias(): string {
    if (v.vencido) return `Venció hace ${Math.abs(v.dias_para_vencer)} día${Math.abs(v.dias_para_vencer) !== 1 ? 's' : ''}`
    if (v.dias_para_vencer === 0) return 'Vence hoy'
    if (v.dias_para_vencer === 1) return 'Vence mañana'
    return `Vence en ${v.dias_para_vencer} días`
  }

  // Barra de urgencia: 100% = vencido, 0% = le quedan 90+ días
  const pct = v.vencido
    ? 100
    : Math.max(0, Math.round((1 - v.dias_para_vencer / 90) * 100))

  return (
    <div className={`bg-white rounded-xl border p-5 shadow-sm hover:shadow-md transition-all ${
      v.vencido
        ? 'border-rose-200 hover:border-rose-300'
        : urgente
          ? 'border-amber-200 hover:border-amber-300'
          : 'border-slate-200 hover:border-slate-300'
    }`}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
            v.vencido ? 'bg-rose-100' : urgente ? 'bg-amber-50' : 'bg-slate-50'
          }`}>
            {v.vencido
              ? <CalendarX size={18} className="text-rose-600" />
              : <CalendarClock size={18} className={urgente ? 'text-amber-500' : 'text-slate-400'} />
            }
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-bold text-slate-900">{v.nombre}</p>
              {v.vencido
                ? <Badge variant="danger">Vencido</Badge>
                : urgente
                  ? <Badge variant="warning">{etiquetaDias()}</Badge>
                  : <span className="text-xs text-slate-500 font-semibold">{etiquetaDias()}</span>
              }
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              {v.sala ?? 'Sin sala asignada'}
              {v.categoria ? ` · ${v.categoria}` : ''}
              {` · ${v.tipo}`}
            </p>
          </div>
        </div>
        <div className="text-right flex-shrink-0">
          <p className={`text-sm font-bold ${
            v.vencido ? 'text-rose-600' : urgente ? 'text-amber-600' : 'text-slate-600'
          }`}>
            {formatFecha(v.fecha_vencimiento)}
          </p>
          <p className="text-xs text-slate-400 mt-0.5">Stock: {v.stock_actual}</p>
        </div>
      </div>

      {/* Barra de urgencia */}
      <div className="mt-4">
        <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${
              v.vencido ? 'bg-rose-500' : urgente ? 'bg-amber-400' : 'bg-teal-400'
            }`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    </div>
  )
}
