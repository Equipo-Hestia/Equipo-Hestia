import { useEffect, useState, useCallback } from 'react'
import { ScrollText, Search, RefreshCw, AlertCircle } from 'lucide-react'
import { api } from '../api/client'
import type { AuditLogEntry, PaginatedResponse } from '../types/api'
import { Badge } from '../components/ui/Badge'
import { HSelect } from '../components/ui/HSelect'
import { useLastUpdated } from '../hooks/useLastUpdated'

const PAGE_SIZE = 50

const ENTIDADES = [
  'insumo',
  'implemento',
  'activo_fijo',
  'usuario',
  'movimiento',
  'revision_sala',
  'clase_docente',
  'solicitud',
  'categoria',
  'sala',
]

const ENTIDAD_OPTS = ENTIDADES.map(e => ({ value: e, label: e }))

function BadgeAccion({ accion }: { accion: string }) {
  if (
    accion.includes('FALLIDO') ||
    accion.includes('ELIMINAR') ||
    accion.includes('DAR_DE_BAJA')
  ) {
    return <Badge variant="danger">{accion}</Badge>
  }
  if (
    accion.includes('ALERTA') ||
    accion.includes('DESACTIVAR') ||
    accion.includes('EDITAR') ||
    accion.includes('RESET') ||
    accion.includes('UPDATE')
  ) {
    return <Badge variant="warning">{accion}</Badge>
  }
  if (
    accion.includes('EXITOSO') ||
    accion.includes('CREAR') ||
    accion.includes('REACTIVAR') ||
    accion.includes('COMPLETAR') ||
    accion.includes('IMPORTAR')
  ) {
    return <Badge variant="success">{accion}</Badge>
  }
  return <Badge variant="info">{accion}</Badge>
}

function formatFecha(iso: string): string {
  return new Date(iso).toLocaleString('es-CL', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
}

export function AuditLog() {
  const [logs, setLogs]             = useState<AuditLogEntry[]>([])
  const [total, setTotal]           = useState(0)
  const [page, setPage]             = useState(0)
  const [loading, setLoading]       = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [inputAccion, setInputAccion]     = useState('')
  const [filtroAccion, setFiltroAccion]   = useState('')
  const [filtroEntidad, setFiltroEntidad] = useState('')
  const [refetchKey, setRefetchKey]       = useState(0)
  const [apiError, setApiError]           = useState<string | null>(null)
  const [rowHover, setRowHover]           = useState<number | null>(null)

  const { labelTiempo, marcarActualizado } = useLastUpdated()

  const load = useCallback(async (
    skip: number, accion: string, entidad: string
  ) => {
    setLoading(true); setApiError(null)
    try {
      const params: Record<string, unknown> = { skip, limit: PAGE_SIZE }
      if (accion) params.accion = accion
      if (entidad) params.entidad = entidad
      const { data } = await api.get<PaginatedResponse<AuditLogEntry>>(
        '/audit-log/', { params }
      )
      setLogs(data.data); setTotal(data.total)
      marcarActualizado()
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })
        .response?.data?.detail
      setApiError(
        msg ?? 'No se pudo conectar con el servidor. Revisa que la API este activa.'
      )
    } finally {
      setLoading(false); setRefreshing(false)
    }
  }, [marcarActualizado])

  useEffect(() => {
    load(page * PAGE_SIZE, filtroAccion, filtroEntidad)
  }, [page, filtroAccion, filtroEntidad, refetchKey, load])

  function handleBuscar(e: React.FormEvent) {
    e.preventDefault(); setPage(0)
    setFiltroAccion(inputAccion.trim().toUpperCase())
  }

  function handleRefresh() { setRefreshing(true); setRefetchKey(k => k + 1) }

  function handleLimpiar() {
    setInputAccion(''); setFiltroAccion(''); setFiltroEntidad(''); setPage(0)
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const hayFiltros = !!(filtroAccion || filtroEntidad)

  return (
    <div className="p-8 w-full">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-black text-h-primary flex items-center gap-2">
            <ScrollText size={22} className="text-h-accent" />
            Audit Log
          </h1>
          <p className="text-h-secondary text-sm mt-0.5">
            Registro de todas las acciones realizadas en el sistema.
          </p>
          <p className="text-xs text-h-tertiary mt-1">{labelTiempo}</p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing || loading}
          title="Actualizar"
          className="
            p-2 rounded-lg border border-h-subtle text-h-tertiary
            transition-colors duration-150 flex-shrink-0 disabled:opacity-50
          "
          style={{ background: 'var(--h-bg-elevated)' }}
          onMouseEnter={e =>
            (e.currentTarget.style.background = 'var(--h-bg-highlight)')
          }
          onMouseLeave={e =>
            (e.currentTarget.style.background = 'var(--h-bg-elevated)')
          }
        >
          <RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Barra de filtros */}
      <form onSubmit={handleBuscar} className="flex flex-wrap gap-3 mb-5">
        <div className="relative flex-1 min-w-48 max-w-xs">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-h-tertiary"
          />
          <input
            type="text" value={inputAccion}
            onChange={e => setInputAccion(e.target.value)}
            placeholder="Filtrar por accion (ej: LOGIN)"
            className="
              w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-h-subtle
              focus:outline-none focus:border-h-visible bg-h-elevated
              text-h-primary placeholder:text-h-tertiary
            "
          />
        </div>
        <HSelect
          value={filtroEntidad}
          onChange={v => { setFiltroEntidad(v); setPage(0) }}
          options={ENTIDAD_OPTS}
          placeholder="Todas las entidades"
          size="sm"
        />
        <button
          type="submit"
          className="px-4 py-2 text-white text-sm font-bold rounded-lg transition-colors"
          style={{ background: 'var(--h-teal-rest)' }}
          onMouseEnter={e =>
            (e.currentTarget.style.background = 'var(--h-teal-hover)')
          }
          onMouseLeave={e =>
            (e.currentTarget.style.background = 'var(--h-teal-rest)')
          }
        >
          Buscar
        </button>
        {hayFiltros && (
          <button
            type="button" onClick={handleLimpiar}
            className="
              px-4 py-2 border border-h-subtle text-h-secondary
              text-sm font-bold rounded-lg transition-colors duration-150
            "
            onMouseEnter={e =>
              (e.currentTarget.style.background = 'var(--h-bg-highlight)')
            }
            onMouseLeave={e =>
              (e.currentTarget.style.background = 'transparent')
            }
          >
            Limpiar
          </button>
        )}
      </form>

      {apiError && (
        <div
          className="flex items-center gap-3 rounded-xl px-4 py-3 mb-5 text-sm border"
          style={{
            background: 'var(--h-sem-danger-bg)',
            color: 'var(--h-sem-danger-text)',
            borderColor: 'var(--h-sem-danger-border)',
          }}
        >
          <AlertCircle size={16} className="flex-shrink-0" />
          {apiError}
        </div>
      )}

      {!loading && !apiError && (
        <p className="text-sm text-h-secondary mb-4">
          {total} registro{total !== 1 ? 's' : ''}
          {filtroAccion ? ` para "${filtroAccion}"` : ''}
          {filtroEntidad ? ` - entidad: ${filtroEntidad}` : ''}
        </p>
      )}

      <div className="rounded-xl border border-h-subtle overflow-hidden bg-h-surface">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-h-subtle bg-h-elevated">
                {['Fecha', 'Accion', 'Usuario', 'Entidad', 'Detalle', 'IP'].map(h => (
                  <th
                    key={h}
                    className="
                      text-left px-4 py-3 text-[10px] font-semibold
                      text-h-tertiary uppercase tracking-widest whitespace-nowrap
                    "
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 6 }).map((__, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-4 rounded bg-h-elevated w-28 animate-pulse" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-16">
                    <ScrollText
                      size={32}
                      className="mx-auto mb-2 text-h-tertiary opacity-40"
                    />
                    <p className="font-semibold text-h-secondary">Sin registros</p>
                  </td>
                </tr>
              ) : logs.map(log => (
                <tr
                  key={log.id}
                  style={{
                    background: rowHover === log.id
                      ? 'var(--h-bg-elevated)'
                      : 'transparent',
                  }}
                  className="border-b border-h-subtle transition-colors"
                  onMouseEnter={() => setRowHover(log.id)}
                  onMouseLeave={() => setRowHover(null)}
                >
                  <td className="px-4 py-3 text-h-tertiary whitespace-nowrap text-xs">
                    {formatFecha(log.fecha)}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <BadgeAccion accion={log.accion} />
                  </td>
                  <td className="px-4 py-3 font-semibold text-h-primary whitespace-nowrap">
                    {log.usuario_nombre}
                  </td>
                  <td className="px-4 py-3 text-h-secondary text-xs">
                    {log.entidad ? (
                      <span>
                        {log.entidad}
                        {log.entidad_id ? ` #${log.entidad_id}` : ''}
                      </span>
                    ) : (
                      <span className="text-h-tertiary">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-h-secondary text-xs max-w-xs truncate">
                    {log.detalle ?? <span className="text-h-tertiary">—</span>}
                  </td>
                  <td className="px-4 py-3 text-h-tertiary text-xs font-mono whitespace-nowrap">
                    {log.ip ?? '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {!loading && totalPages > 1 && (
          <div
            className="
              flex items-center justify-between
              px-4 py-3 border-t border-h-subtle
            "
          >
            <p className="text-xs text-h-tertiary">
              P\u00e1gina {page + 1} de {totalPages}
            </p>
            <div className="flex gap-1">
              <button
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={page === 0}
                className="
                  px-3 py-1 text-xs rounded-lg border border-h-subtle
                  text-h-secondary disabled:opacity-40
                  transition-colors duration-150
                "
                onMouseEnter={e =>
                  (e.currentTarget.style.background = 'var(--h-bg-highlight)')
                }
                onMouseLeave={e =>
                  (e.currentTarget.style.background = 'transparent')
                }
              >
                &#8592;
              </button>
              <button
                onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="
                  px-3 py-1 text-xs rounded-lg border border-h-subtle
                  text-h-secondary disabled:opacity-40
                  transition-colors duration-150
                "
                onMouseEnter={e =>
                  (e.currentTarget.style.background = 'var(--h-bg-highlight)')
                }
                onMouseLeave={e =>
                  (e.currentTarget.style.background = 'transparent')
                }
              >
                &#8594;
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
