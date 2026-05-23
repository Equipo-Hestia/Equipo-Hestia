import { useEffect, useState, useCallback } from 'react'
import {
  BarChart2, RefreshCw, AlertCircle, Download,
  TrendingUp, Package, DollarSign,
} from 'lucide-react'
import { api } from '../api/client'
import type { ValorizacionResponse, ConsumoCarrerasResponse } from '../types/api'

type Tab = 'valorizacion' | 'carreras' | 'exportar'

function fmt(n: number) {
  return new Intl.NumberFormat('es-CL', {
    style: 'currency', currency: 'CLP', maximumFractionDigits: 0,
  }).format(n)
}

function fmtDec(n: number) {
  return new Intl.NumberFormat('es-CL', {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(n)
}

// ---------------------------------------------------------------------------
// Tab: Valorización del Stock
// ---------------------------------------------------------------------------
function TabValorizacion() {
  const [data, setData] = useState<ValorizacionResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const { data: res } = await api.get<ValorizacionResponse>('/reportes/valorizacion')
      setData(res)
    } catch {
      setError('No se pudo cargar la valorización del inventario.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  if (loading) return (
    <div className="space-y-3 mt-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="skeleton h-16 rounded-xl" />
      ))}
    </div>
  )

  if (error) return (
    <div className="flex items-center gap-3 bg-rose-50 border border-rose-200
                    rounded-xl px-4 py-3 mt-4 text-rose-700 text-sm">
      <AlertCircle size={16} className="flex-shrink-0" />
      {error}
    </div>
  )

  if (!data) return null

  return (
    <div className="mt-4 space-y-6">

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-teal-50 rounded-lg">
              <DollarSign size={18} className="text-teal-600" />
            </div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">
              Valor Total
            </p>
          </div>
          <p className="text-2xl font-black text-slate-900">
            {fmt(data.valor_total_inventario)}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-emerald-50 rounded-lg">
              <Package size={18} className="text-emerald-600" />
            </div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">
              Con Costo
            </p>
          </div>
          <p className="text-2xl font-black text-slate-900">{data.total_insumos_valorados}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-amber-50 rounded-lg">
              <Package size={18} className="text-amber-600" />
            </div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">
              Sin Costo
            </p>
          </div>
          <p className="text-2xl font-black text-slate-900">{data.total_insumos_sin_costo}</p>
          {data.total_insumos_sin_costo > 0 && (
            <p className="text-xs text-amber-600 mt-1">No incluidos en el total</p>
          )}
        </div>
      </div>

      {/* Por Categoría */}
      {data.por_categoria.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200">
            <h3 className="font-bold text-slate-800">Por Categoría</h3>
          </div>
          <div className="divide-y divide-slate-100">
            {data.por_categoria.map(g => (
              <div key={g.nombre}
                className="flex items-center justify-between px-5 py-3
                           hover:bg-slate-50 transition-colors">
                <div>
                  <p className="font-semibold text-slate-800 text-sm">{g.nombre}</p>
                  <p className="text-xs text-slate-400">{g.cantidad_insumos} insumos</p>
                </div>
                <p className="font-bold text-sm text-teal-600 dark:text-teal-400">
                  {fmt(g.valor_total)}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Por Sala */}
      {data.por_sala.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200">
            <h3 className="font-bold text-slate-800">Por Sala</h3>
          </div>
          <div className="divide-y divide-slate-100">
            {data.por_sala.map(g => (
              <div key={g.nombre}
                className="flex items-center justify-between px-5 py-3
                           hover:bg-slate-50 transition-colors">
                <div>
                  <p className="font-semibold text-slate-800 text-sm">{g.nombre}</p>
                  <p className="text-xs text-slate-400">{g.cantidad_insumos} insumos</p>
                </div>
                <p className="font-bold text-sm text-teal-600 dark:text-teal-400">
                  {fmt(g.valor_total)}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Detalle de insumos */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200">
          <h3 className="font-bold text-slate-800">
            Detalle ({data.total_insumos_valorados} insumos valorizados)
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50">
                {['Nombre', 'SKU', 'Stock', 'Costo Unit.', 'Valor Total',
                  'Categoría', 'Sala'].map(h => (
                  <th key={h}
                    className="text-left px-4 py-3 text-xs font-bold text-slate-500
                               uppercase tracking-wide whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.insumos.map(i => (
                <tr key={i.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-slate-800">{i.nombre}</td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-500">
                    {i.sku ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-slate-600 text-right">{i.stock_actual}</td>
                  <td className="px-4 py-3 text-slate-600 text-right">
                    ${fmtDec(i.costo_unitario)}
                  </td>
                  <td className="px-4 py-3 font-semibold text-right
                                 text-teal-600 dark:text-teal-400">
                    {fmt(i.valor_total)}
                  </td>
                  <td className="px-4 py-3 text-slate-500 text-xs">{i.categoria ?? '—'}</td>
                  <td className="px-4 py-3 text-slate-500 text-xs">{i.sala ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Tab: Consumo por Carrera
// ---------------------------------------------------------------------------
function TabCarreras() {
  const [semestre, setSemestre] = useState('')
  const [buscando, setBuscando] = useState('')
  const [data, setData] = useState<ConsumoCarrerasResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function buscar() {
    if (!semestre.trim()) return
    setBuscando(semestre.trim())
    setLoading(true); setError(null)
    try {
      const { data: res } = await api.get<ConsumoCarrerasResponse>(
        '/reportes/consumo-carreras', { params: { semestre: semestre.trim() } }
      )
      setData(res)
    } catch {
      setError('No se pudo cargar el consumo por carrera.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mt-4 space-y-5">
      <div className="flex gap-3">
        <input
          value={semestre}
          onChange={e => setSemestre(e.target.value)}
          placeholder="Semestre (ej: 2025-1)"
          className="px-3 py-2 text-sm rounded-lg border border-slate-200
                     focus:outline-none focus:ring-2 focus:ring-teal-500 w-52"
          onKeyDown={e => e.key === 'Enter' && buscar()}
        />
        <button onClick={buscar} disabled={!semestre.trim() || loading}
          className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white text-sm
                     font-bold rounded-lg disabled:opacity-50 transition-colors">
          {loading ? 'Cargando...' : 'Consultar'}
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-3 bg-rose-50 border border-rose-200
                        rounded-xl px-4 py-3 text-rose-700 text-sm">
          <AlertCircle size={16} className="flex-shrink-0" />
          {error}
        </div>
      )}

      {data && (
        <>
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-slate-700">
              Semestre {buscando} — Costo total:
              <span className="ml-2 font-black text-teal-600 dark:text-teal-400">
                {fmt(data.costo_total_semestre)}
              </span>
            </p>
          </div>

          {data.carreras.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <TrendingUp size={28} className="mx-auto mb-2 opacity-30" />
              <p className="font-semibold text-sm">
                Sin datos de consumo para este semestre.
              </p>
              <p className="text-xs mt-1">
                Verifica que las solicitudes tengan clase y asignatura con carrera asociadas.
              </p>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50">
                    {['Carrera', 'Solicitudes', 'Estudiantes', 'Costo Total',
                      'Costo/Estudiante'].map(h => (
                      <th key={h}
                        className="text-left px-4 py-3 text-xs font-bold text-slate-500
                                   uppercase tracking-wide whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.carreras.map(c => (
                    <tr key={c.carrera} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 font-semibold text-slate-800">
                        {c.carrera}
                      </td>
                      <td className="px-4 py-3 text-slate-600 text-right">
                        {c.num_solicitudes}
                      </td>
                      <td className="px-4 py-3 text-slate-600 text-right">
                        {c.num_estudiantes_total > 0
                          ? c.num_estudiantes_total
                          : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-4 py-3 font-bold text-right
                                     text-teal-600 dark:text-teal-400">
                        {fmt(c.costo_total)}
                      </td>
                      <td className="px-4 py-3 text-slate-600 text-right">
                        {c.costo_por_estudiante != null
                          ? `$${fmtDec(c.costo_por_estudiante)}`
                          : <span className="text-slate-300">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Tab: Exportar PDF
// ---------------------------------------------------------------------------
function TabExportar() {
  const [semestre, setSemestre] = useState('')
  const [descargando, setDescargando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState(false)

  async function descargar() {
    setDescargando(true); setError(null); setOk(false)
    try {
      const params = semestre.trim()
        ? `?semestre=${encodeURIComponent(semestre.trim())}`
        : ''
      const resp = await api.get(`/reportes/valorizacion/pdf${params}`, {
        responseType: 'blob',
      })
      const url = URL.createObjectURL(new Blob([resp.data], { type: 'application/pdf' }))
      const a = document.createElement('a')
      a.href = url
      a.download = `valorizacion_hestia${semestre ? `_${semestre}` : ''}.pdf`
      a.click()
      URL.revokeObjectURL(url)
      setOk(true)
      setTimeout(() => setOk(false), 3000)
    } catch {
      setError(
        'No se pudo generar el PDF. '
        + 'Ejecuta: docker compose up --build para reconstruir el servidor.'
      )
    } finally {
      setDescargando(false)
    }
  }

  return (
    <div className="mt-4 max-w-lg">
      <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-5">
        <div>
          <h3 className="font-bold text-slate-800 mb-1">Reporte de Valorización PDF</h3>
          <p className="text-sm text-slate-500">
            Genera un PDF con el valor del inventario activo agrupado por categoría y sala,
            con el detalle de cada insumo valorizado.
          </p>
        </div>
        <div>
          <label className="block text-xs font-bold text-slate-500 mb-1">
            SEMESTRE (opcional)
          </label>
          <input
            value={semestre}
            onChange={e => setSemestre(e.target.value)}
            placeholder="Ej: 2025-1"
            className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200
                       focus:outline-none focus:ring-2 focus:ring-teal-500"
          />
          <p className="text-xs text-slate-400 mt-1">
            Se mostrará en el encabezado del reporte.
          </p>
        </div>
        {error && (
          <div className="flex items-center gap-3 bg-rose-50 border border-rose-200
                          rounded-lg px-3 py-2 text-rose-700 text-sm">
            <AlertCircle size={14} className="flex-shrink-0" />
            {error}
          </div>
        )}
        {ok && (
          <div className="bg-teal-50 border border-teal-200 rounded-lg px-3 py-2
                          text-teal-700 text-sm font-semibold">
            PDF descargado correctamente.
          </div>
        )}
        <button onClick={descargar} disabled={descargando}
          className="flex items-center gap-2 w-full justify-center px-4 py-2.5
                     bg-teal-600 hover:bg-teal-700 text-white text-sm font-bold
                     rounded-lg disabled:opacity-50 transition-colors">
          <Download size={16} />
          {descargando ? 'Generando PDF...' : 'Descargar PDF'}
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Página principal
// ---------------------------------------------------------------------------
export function Reportes() {
  const [tab, setTab] = useState<Tab>('valorizacion')
  const [refreshKey, setRefreshKey] = useState(0)

  const tabs: { id: Tab; label: string }[] = [
    { id: 'valorizacion', label: 'Valorización del stock' },
    { id: 'carreras', label: 'Costo por carrera' },
    { id: 'exportar', label: 'Exportar PDF' },
  ]

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-black text-slate-900 flex items-center gap-2">
            <BarChart2 size={22} className="text-teal-600" />
            Reportes
          </h1>
          <p className="text-slate-500 text-sm mt-0.5">
            Valorización del inventario y costo de consumo por carrera.
          </p>
        </div>
        {tab === 'valorizacion' && (
          <button onClick={() => setRefreshKey(k => k + 1)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-200
                       text-slate-600 hover:bg-slate-100 text-sm font-semibold
                       transition-colors">
            <RefreshCw size={14} />
            Actualizar
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-xl mb-6 w-fit">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm font-semibold rounded-lg transition-colors ${
              tab === t.id
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'valorizacion' && <TabValorizacion key={refreshKey} />}
      {tab === 'carreras' && <TabCarreras />}
      {tab === 'exportar' && <TabExportar />}
    </div>
  )
}
