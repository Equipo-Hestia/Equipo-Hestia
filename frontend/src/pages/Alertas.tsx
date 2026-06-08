import { useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2, RefreshCw } from 'lucide-react'
import { api } from '../api/client'
import type { InsumoAlerta } from '../types/api'
import { Badge } from '../components/ui/Badge'
import { AlertaCardSkeleton } from '../components/ui/Skeleton'
import { useLastUpdated } from '../hooks/useLastUpdated'

type Tab = 'activas' | 'resueltas'
const DIAS_OPTIONS = [7, 14, 30] as const

export function Alertas() {
  const [tab, setTab]               = useState<Tab>('activas')
  const [dias, setDias]             = useState<number>(30)
  const [refetchKey, setRefetchKey] = useState(0)

  const [activas, setActivas]     = useState<InsumoAlerta[]>([])
  const [resueltas, setResueltas] = useState<InsumoAlerta[]>([])

  const [loading, setLoading]       = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const { labelTiempo, marcarActualizado } = useLastUpdated()

  useEffect(() => {
    setLoading(true)
    const url = tab === 'activas'
      ? '/insumos/alertas'
      : `/insumos/alertas-resueltas?dias=${dias}`

    api.get<InsumoAlerta[]>(url)
      .then(({ data }) => {
        if (tab === 'activas') setActivas(data)
        else setResueltas(data)
        marcarActualizado()
      })
      .finally(() => {
        setLoading(false)
        setRefreshing(false)
      })
  }, [tab, dias, refetchKey, marcarActualizado])

  function refresh() {
    setRefreshing(true)
    setRefetchKey(k => k + 1)
  }

  function gravedad(a: InsumoAlerta): 'danger' | 'warning' {
    return a.stock_actual === 0 || a.deficit >= a.stock_minimo ? 'danger' : 'warning'
  }

  const items = tab === 'activas' ? activas : resueltas

  return (
    <div className="p-8 max-w-4xl mx-auto">

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-h-primary">Alertas de stock</h1>
          <p className="text-h-secondary text-sm mt-0.5">
            {tab === 'activas'
              ? 'Insumos con stock igual o por debajo del minimo establecido.'
              : 'Insumos que superaron el minimo y recibieron entradas recientemente.'}
          </p>
          {labelTiempo && (
            <p className="text-xs text-h-tertiary mt-1">{labelTiempo}</p>
          )}
        </div>
        <button
          onClick={refresh}
          disabled={refreshing || loading}
          className="p-2 rounded-lg border border-h-subtle text-h-tertiary
                     transition-colors flex-shrink-0 disabled:opacity-50"
          style={{ background: 'var(--h-bg-elevated)' }}
          onMouseEnter={e => {
            e.currentTarget.style.background = 'var(--h-bg-highlight)'
            e.currentTarget.style.color = 'var(--h-text-secondary)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = 'var(--h-bg-elevated)'
            e.currentTarget.style.color = ''
          }}
          title="Actualizar"
        >
          <RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 p-1 rounded-xl mb-5 w-fit"
        style={{ background: 'var(--h-bg-elevated)' }}>
        {(['activas', 'resueltas'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={[
              'px-5 py-1.5 rounded-lg text-sm font-semibold transition-colors',
              tab === t ? 'text-h-primary shadow-sm' : 'text-h-tertiary hover:text-h-secondary',
            ].join(' ')}
            style={tab === t ? { background: 'var(--h-bg-surface)' } : {}}
          >
            {t === 'activas' ? 'Alertas activas' : 'Alertas resueltas'}
          </button>
        ))}
      </div>

      {/* Selector de dias (tab resueltas) */}
      {tab === 'resueltas' && (
        <div className="flex items-center gap-2 mb-5">
          <span className="text-sm text-h-secondary">Entradas en los ultimos:</span>
          {DIAS_OPTIONS.map(d => (
            <button key={d} onClick={() => setDias(d)}
              className="px-3 py-1 rounded-lg text-xs font-bold transition-colors"
              style={dias === d ? {
                background: 'var(--h-teal-rest)',
                color: 'white',
              } : {
                background: 'var(--h-bg-elevated)',
                color: 'var(--h-text-secondary)',
                border: '1px solid var(--h-border-subtle)',
              }}
              onMouseEnter={e => {
                if (dias !== d) e.currentTarget.style.background = 'var(--h-bg-highlight)'
              }}
              onMouseLeave={e => {
                if (dias !== d) e.currentTarget.style.background = 'var(--h-bg-elevated)'
              }}
            >
              {d} dias
            </button>
          ))}
        </div>
      )}

      {/* Contador */}
      {!loading && (
        <div className="flex items-center gap-2 mb-5">
          <span className="text-sm text-h-secondary">
            {items.length === 0
              ? tab === 'activas'
                ? 'Sin alertas activas'
                : `Sin alertas resueltas en los ultimos ${dias} dias`
              : `${items.length} insumo${items.length !== 1 ? 's' : ''} ${
                  tab === 'activas'
                    ? 'en alerta'
                    : 'resuelto' + (items.length !== 1 ? 's' : '')
                }`
            }
          </span>
          {tab === 'activas' && activas.length > 0 && (
            <Badge variant="danger">
              {activas.filter(a => a.stock_actual === 0).length} agotados
            </Badge>
          )}
        </div>
      )}

      {/* Contenido */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => <AlertaCardSkeleton key={i} />)}
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-2xl p-12 text-center border"
          style={{
            background: tab === 'activas'
              ? 'var(--h-sem-success-bg)'
              : 'var(--h-bg-elevated)',
            borderColor: tab === 'activas'
              ? 'var(--h-sem-success-border)'
              : 'var(--h-border-subtle)',
          }}>
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4"
            style={{
              background: tab === 'activas'
                ? 'var(--h-sem-success-bg)'
                : 'var(--h-bg-highlight)',
            }}>
            {tab === 'activas'
              ? <AlertTriangle size={24} style={{ color: 'var(--h-sem-success-text)' }} />
              : <CheckCircle2 size={24} className="text-h-tertiary" />
            }
          </div>
          <p className="font-bold"
            style={{ color: tab === 'activas' ? 'var(--h-sem-success-text)' : 'var(--h-text-primary)' }}>
            {tab === 'activas'
              ? 'Todo el inventario esta en orden'
              : `Sin alertas resueltas en los ultimos ${dias} dias`}
          </p>
          <p className="text-sm mt-1 text-h-secondary">
            {tab === 'activas'
              ? 'Ningun insumo esta bajo el stock minimo definido.'
              : 'No hubo insumos que superaran el minimo en este periodo.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map(a => (
            <div key={a.id}
              className="rounded-xl border p-5 transition-all"
              style={{
                background: 'var(--h-bg-surface)',
                borderColor: tab === 'resueltas'
                  ? 'var(--h-sem-success-border)'
                  : a.stock_actual === 0
                    ? 'var(--h-sem-danger-border)'
                    : 'var(--h-sem-warning-border)',
              }}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{
                      background: tab === 'resueltas'
                        ? 'var(--h-sem-success-bg)'
                        : a.stock_actual === 0
                          ? 'var(--h-sem-danger-bg)'
                          : 'var(--h-sem-warning-bg)',
                    }}>
                    {tab === 'resueltas'
                      ? <CheckCircle2 size={18} style={{ color: 'var(--h-sem-success-text)' }} />
                      : <AlertTriangle size={18} style={{
                          color: a.stock_actual === 0
                            ? 'var(--h-sem-danger-text)'
                            : 'var(--h-sem-warning-text)',
                        }} />
                    }
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-bold text-h-primary">{a.nombre}</p>
                      {tab === 'resueltas'
                        ? <Badge variant="success">Resuelto</Badge>
                        : a.stock_actual === 0 && <Badge variant="danger">Agotado</Badge>
                      }
                    </div>
                    <p className="text-xs text-h-tertiary mt-0.5">
                      {a.sala ?? 'Sin sala asignada'}
                      {a.categoria ? ` - ${a.categoria}` : ''}
                    </p>
                  </div>
                </div>
                {tab === 'activas'
                  ? <Badge variant={gravedad(a)}>Deficit: {a.deficit}</Badge>
                  : <span className="text-xs font-bold whitespace-nowrap"
                      style={{ color: 'var(--h-sem-success-text)' }}>
                      Stock: {a.stock_actual} / min {a.stock_minimo}
                    </span>
                }
              </div>

              <div className="mt-4">
                <div className="flex justify-between text-xs text-h-tertiary mb-1.5">
                  <span>
                    Stock actual:{' '}
                    <span className="font-bold text-h-primary">{a.stock_actual}</span>
                  </span>
                  <span>Minimo: <span className="font-bold">{a.stock_minimo}</span></span>
                </div>
                <div className="h-2 rounded-full overflow-hidden"
                  style={{ background: 'var(--h-bg-elevated)' }}>
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${Math.min(
                        100,
                        (a.stock_actual / Math.max(a.stock_minimo, 1)) * 100,
                      )}%`,
                      background: tab === 'resueltas'
                        ? 'var(--h-sem-success-border)'
                        : a.stock_actual === 0
                          ? 'var(--h-sem-danger-border)'
                          : 'var(--h-sem-warning-border)',
                    }}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
