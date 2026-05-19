import { useEffect, useState, useCallback } from 'react'
import {
  RotateCcw, CheckCircle, XCircle, Clock,
  AlertTriangle, Package, RefreshCw
} from 'lucide-react'
import { api } from '../api/client'
import type { RetornoResponse } from '../types/api'
import { Badge } from '../components/ui/Badge'
import { TableRowSkeleton } from '../components/ui/Skeleton'

type Tab = 'hoy' | 'pendientes'

export function RetornosOperador() {
  const [tab, setTab]             = useState<Tab>('hoy')
  const [retornos, setRetornos]   = useState<RetornoResponse[]>([])
  const [loading, setLoading]     = useState(true)
  const [toast, setToast]         = useState<string | null>(null)
  const [markingId, setMarkingId] = useState<number | null>(null)

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  const load = useCallback(async (currentTab: Tab) => {
    setLoading(true)
    try {
      const endpoint = currentTab === 'hoy' ? '/retornos/hoy' : '/retornos/pendientes'
      const { data } = await api.get<RetornoResponse[]>(endpoint)
      setRetornos(data)
    } catch {
      setRetornos([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load(tab) }, [tab, load])

  async function marcar(id: number, estado: 'retornado' | 'no_retornado') {
    setMarkingId(id)
    try {
      await api.put(`/retornos/${id}/marcar`, { estado })
      showToast(
        estado === 'retornado'
          ? 'Implemento marcado como retornado — stock restaurado'
          : 'Registrado como no retornado (merma)'
      )
      load(tab)
    } catch {
      showToast('Error al procesar la accion')
    } finally {
      setMarkingId(null)
    }
  }

  const pendientesCount   = retornos.filter(r => r.estado === 'pendiente').length
  const retornadosCount   = retornos.filter(r => r.estado === 'retornado').length
  const noRetornadosCount = retornos.filter(r => r.estado === 'no_retornado').length

  function estadoBadge(estado: string) {
    if (estado === 'retornado')    return <Badge variant="success">Retornado</Badge>
    if (estado === 'no_retornado') return <Badge variant="danger">No retornado</Badge>
    return <Badge variant="warning">Pendiente</Badge>
  }

  function formatHora(iso: string) {
    return new Date(iso).toLocaleTimeString('es-CL', {
      hour: '2-digit', minute: '2-digit'
    })
  }

  const hoy = new Date().toLocaleDateString('es-CL', {
    weekday: 'long', day: 'numeric', month: 'long'
  })

  return (
    <div className="p-8 max-w-5xl mx-auto">
      {toast && (
        <div className="fixed top-6 right-6 z-50 flex items-center gap-2 bg-teal-600
                        text-white px-4 py-3 rounded-xl shadow-lg text-sm font-semibold">
          <CheckCircle size={16} />{toast}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-black text-slate-900 flex items-center gap-3">
            <RotateCcw size={22} className="text-teal-600" />
            Retornos de Implementos
          </h1>
          <p className="text-slate-500 text-sm mt-0.5 capitalize">{hoy}</p>
        </div>
        <button
          onClick={() => load(tab)}
          className="flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200
                     text-slate-600 hover:bg-slate-50 text-sm font-semibold transition-colors">
          <RefreshCw size={14} /> Actualizar
        </button>
      </div>

      {/* Tarjetas de resumen (solo en tab hoy) */}
      {tab === 'hoy' && !loading && (
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-center">
            <p className="text-3xl font-black text-amber-700">{pendientesCount}</p>
            <p className="text-xs font-semibold text-amber-600 mt-1">Pendientes</p>
          </div>
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-center">
            <p className="text-3xl font-black text-emerald-700">{retornadosCount}</p>
            <p className="text-xs font-semibold text-emerald-600 mt-1">Retornados</p>
          </div>
          <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 text-center">
            <p className="text-3xl font-black text-rose-700">{noRetornadosCount}</p>
            <p className="text-xs font-semibold text-rose-600 mt-1">No retornados</p>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex rounded-xl border border-slate-200 overflow-hidden mb-5 bg-white">
        {([
          { key: 'hoy' as Tab,        label: 'Hoy',                  icon: Clock },
          { key: 'pendientes' as Tab, label: 'Todos los pendientes', icon: AlertTriangle },
        ]).map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm
                        font-bold transition-colors border-r last:border-r-0 border-slate-200 ${
              tab === key
                ? 'bg-teal-600 text-white border-teal-600'
                : 'text-slate-500 hover:bg-slate-50'
            }`}>
            <Icon size={14} />{label}
          </button>
        ))}
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              <th className="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide">Implemento</th>
              <th className="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide">Docente</th>
              <th className="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide">Sala</th>
              <th className="text-center px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide">Cant.</th>
              <th className="text-center px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide">Retiro</th>
              <th className="text-center px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide">Estado</th>
              <th className="text-center px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <TableRowSkeleton key={i} cols={7} />
              ))
            ) : retornos.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center py-16 text-slate-400">
                  <Package size={32} className="mx-auto mb-2 opacity-30" />
                  <p className="font-semibold">
                    {tab === 'hoy'
                      ? 'No hay implementos retirados hoy'
                      : 'No hay retornos pendientes'}
                  </p>
                </td>
              </tr>
            ) : retornos.map(r => (
              <tr key={r.id} className="hover:bg-slate-50 transition-colors">
                <td className="px-4 py-3">
                  <span className="font-semibold text-slate-900">{r.insumo_nombre}</span>
                  {r.solicitud_id && (
                    <div className="text-xs text-slate-400 mt-0.5">Solicitud #{r.solicitud_id}</div>
                  )}
                </td>
                <td className="px-4 py-3 text-slate-600">{r.docente_nombre ?? '—'}</td>
                <td className="px-4 py-3 text-slate-600">{r.sala_nombre ?? '—'}</td>
                <td className="px-4 py-3 text-center font-bold text-slate-900">{r.cantidad}</td>
                <td className="px-4 py-3 text-center text-slate-500 font-mono text-xs">
                  {formatHora(r.fecha_retiro)}
                </td>
                <td className="px-4 py-3 text-center">{estadoBadge(r.estado)}</td>
                <td className="px-4 py-3">
                  {r.estado === 'pendiente' ? (
                    <div className="flex items-center justify-center gap-2">
                      <button
                        onClick={() => marcar(r.id, 'retornado')}
                        disabled={markingId === r.id}
                        title="El implemento está en el área común — restaura el stock"
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg
                                   bg-emerald-50 hover:bg-emerald-100 text-emerald-700
                                   text-xs font-bold transition-colors disabled:opacity-50">
                        <CheckCircle size={12} /> Retornado
                      </button>
                      <button
                        onClick={() => marcar(r.id, 'no_retornado')}
                        disabled={markingId === r.id}
                        title="No apareció — se registra como merma"
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg
                                   bg-rose-50 hover:bg-rose-100 text-rose-700
                                   text-xs font-bold transition-colors disabled:opacity-50">
                        <XCircle size={12} /> No retornado
                      </button>
                    </div>
                  ) : (
                    <div className="text-center">
                      {r.operador_nombre && (
                        <p className="text-xs text-slate-500 font-semibold">{r.operador_nombre}</p>
                      )}
                      {r.fecha_retorno && (
                        <p className="text-xs text-slate-400 font-mono">
                          {formatHora(r.fecha_retorno)}
                        </p>
                      )}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
