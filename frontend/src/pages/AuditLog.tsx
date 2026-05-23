import { useEffect, useState, useCallback } from 'react'
import { ScrollText, Search, RefreshCw, AlertCircle } from 'lucide-react'
import { api } from '../api/client'
import type { AuditLogEntry, PaginatedResponse } from '../types/api'
import { Badge } from '../components/ui/Badge'

const PAGE_SIZE = 50

const ENTIDADES = ['insumo', 'usuario', 'movimiento', 'solicitud', 'categoria', 'sala']

function BadgeAccion({ accion }: { accion: string }) {
  if (
    accion.includes('FALLIDO') ||
    accion.includes('ELIMINAR')
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
    accion.includes('COMPLETAR')
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
  const [logs, setLogs] = useState<AuditLogEntry[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [inputAccion, setInputAccion] = useState('')
  const [filtroAccion, setFiltroAccion] = useState('')
  const [filtroEntidad, setFiltroEntidad] = useState('')
  const [refetchKey, setRefetchKey] = useState(0)
  const [apiError, setApiError] = useState<string | null>(null)

  const load = useCallback(async (skip: number, accion: string, entidad: string) => {
    setLoading(true); setApiError(null)
    try {
      const params: Record<string, unknown> = { skip, limit: PAGE_SIZE }
      if (accion) params.accion = accion
      if (entidad) params.entidad = entidad
      const { data } = await api.get<PaginatedResponse<AuditLogEntry>>(
        '/audit-log/', { params }
      )
      setLogs(data.data); setTotal(data.total)
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })
        .response?.data?.detail
      setApiError(msg ?? 'No se pudo conectar con el servidor. Revisa que la API esté activa.')
    } finally {
      setLoading(false); setRefreshing(false)
    }
  }, [])

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
    <div className="p-8 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-black text-slate-900">Audit Log</h1>
          <p className="text-slate-500 text-sm mt-0.5">
            Registro de todas las acciones realizadas en el sistema.
          </p>
        </div>
        <button
          onClick={handleRefresh} disabled={refreshing || loading}
          className="flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-200
                     text-slate-600 hover:bg-slate-100 text-sm font-semibold transition-colors"
        >
          <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
          Actualizar
        </button>
      </div>

      <form onSubmit={handleBuscar} className="flex flex-wrap gap-3 mb-5">
        <div className="relative flex-1 min-w-48 max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text" value={inputAccion}
            onChange={e => setInputAccion(e.target.value)}
            placeholder="Filtrar por acción (ej: LOGIN)"
            className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-slate-200
                       focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white"
          />
        </div>
        <select
          value={filtroEntidad}
          onChange={e => { setFiltroEntidad(e.target.value); setPage(0) }}
          className="py-2 px-3 text-sm rounded-lg border border-slate-200
                     focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white text-slate-700"
        >
          <option value="">Todas las entidades</option>
          {ENTIDADES.map(e => (
            <option key={e} value={e}>{e}</option>
          ))}
        </select>
        <button type="submit"
          className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white text-sm
                     font-bold rounded-lg transition-colors">
          Buscar
        </button>
        {hayFiltros && (
          <button type="button" onClick={handleLimpiar}
            className="px-4 py-2 border border-slate-200 text-slate-600 text-sm
                       font-bold rounded-lg hover:bg-slate-50 transition-colors">
            Limpiar
          </button>
        )}
      </form>

      {apiError && (
        <div className="flex items-center gap-3 bg-rose-50 border border-rose-200
                        rounded-xl px-4 py-3 mb-5 text-rose-700 text-sm">
          <AlertCircle size={16} className="flex-shrink-0" />
          {apiError}
        </div>
      )}

      {!loading && !apiError && (
        <p className="text-sm text-slate-500 mb-4">
          {total} registro{total !== 1 ? 's' : ''}
          {filtroAccion ? ` para "${filtroAccion}"` : ''}
          {filtroEntidad ? ` · entidad: ${filtroEntidad}` : ''}
        </p>
      )}

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                {['Fecha', 'Acción', 'Usuario', 'Entidad', 'Detalle', 'IP'].map(h => (
                  <th key={h}
                    className="text-left px-4 py-3 text-xs font-bold
                               text-slate-500 uppercase tracking-wide whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 6 }).map((__, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="skeleton h-4 rounded w-28" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-16 text-slate-400">
                    <ScrollText size={32} className="mx-auto mb-2 opacity-30" />
                    <p className="font-semibold">Sin registros</p>
                  </td>
                </tr>
              ) : logs.map(log => (
                <tr key={log.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 text-slate-500 whitespace-nowrap text-xs">
                    {formatFecha(log.fecha)}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <BadgeAccion accion={log.accion} />
                  </td>
                  <td className="px-4 py-3 font-semibold text-slate-900 whitespace-nowrap">
                    {log.usuario_nombre}
                  </td>
                  <td className="px-4 py-3 text-slate-500 text-xs">
                    {log.entidad
                      ? <span>{log.entidad}{log.entidad_id ? ` #${log.entidad_id}` : ''}</span>
                      : <span className="text-slate-300">—</span>
                    }
                  </td>
                  <td className="px-4 py-3 text-slate-500 text-xs max-w-xs truncate">
                    {log.detalle ?? <span className="text-slate-300">—</span>}
                  </td>
                  <td className="px-4 py-3 text-slate-400 text-xs font-mono whitespace-nowrap">
                    {log.ip ?? '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {!loading && totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200">
            <p className="text-xs text-slate-500">Página {page + 1} de {totalPages}</p>
            <div className="flex gap-1">
              <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
                className="px-3 py-1 text-xs rounded-lg border border-slate-200
                           disabled:opacity-40 hover:bg-slate-50">←</button>
              <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="px-3 py-1 text-xs rounded-lg border border-slate-200
                           disabled:opacity-40 hover:bg-slate-50">→</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
