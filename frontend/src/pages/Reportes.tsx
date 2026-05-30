import { useEffect, useState, useCallback } from 'react'
import {
  BarChart2, RefreshCw, AlertCircle, Download, FileSpreadsheet,
  TrendingUp, Package, DollarSign,
} from 'lucide-react'
import { api } from '../api/client'
import type {
  ValorizacionResponse, ConsumoCarrerasResponse,
  PaqueteResponse, TallerResponse, AsignaturaResponse,
} from '../types/api'

type Tab = 'paquetes' | 'carreras' | 'exportar'

const CARRERA_NOMBRES: Record<string, string> = {
  TENS: 'Técnico en Enfermería',
  TQF: 'Técnico en Química y Farmacia',
  TLCBS: 'Técnico de Laboratorio Clínico y Banco de Sangre',
  TONS: 'Técnico en Odontología',
  preparador_fisico: 'Preparador Físico',
}

function nombreCarrera(carrera: string): string {
  return CARRERA_NOMBRES[carrera] ?? carrera
}

function getSemestreActual(): string {
  const hoy = new Date()
  const mes = hoy.getMonth() + 1
  const anio = hoy.getFullYear()
  if (mes >= 3 && mes <= 7) return `${anio}-1`
  if (mes >= 8) return `${anio}-2`
  return `${anio - 1}-2`
}

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
// Tab: Paquetes de insumos (vista principal — reemplaza "Por Categoría")
// ---------------------------------------------------------------------------
function TabPaquetes() {
  const [paquetes, setPaquetes]       = useState<PaqueteResponse[]>([])
  const [talleres, setTalleres]       = useState<TallerResponse[]>([])
  const [asignaturas, setAsignaturas] = useState<AsignaturaResponse[]>([])
  const [val, setVal]                 = useState<ValorizacionResponse | null>(null)
  const [loading, setLoading]         = useState(true)
  const [error, setError]             = useState<string | null>(null)
  const [expandido, setExpandido]     = useState<number | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const [paqRes, tallRes, asigRes, valRes] = await Promise.all([
        api.get<PaqueteResponse[]>('/paquetes/'),
        api.get<TallerResponse[]>('/talleres/'),
        api.get<AsignaturaResponse[]>('/asignaturas/'),
        api.get<ValorizacionResponse>('/reportes/valorizacion'),
      ])
      setPaquetes(paqRes.data)
      setTalleres(tallRes.data)
      setAsignaturas(asigRes.data)
      setVal(valRes.data)
    } catch {
      setError('No se pudo cargar la información de paquetes.')
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

  return (
    <div className="mt-4 space-y-6">
      {/* KPIs del inventario */}
      {val && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-teal-50 rounded-lg">
                <DollarSign size={18} className="text-teal-600" />
              </div>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">
                Valor Total Inventario
              </p>
            </div>
            <p className="text-2xl font-black text-slate-900">
              {fmt(val.valor_total_inventario)}
            </p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-emerald-50 rounded-lg">
                <Package size={18} className="text-emerald-600" />
              </div>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">
                Total Paquetes
              </p>
            </div>
            <p className="text-2xl font-black text-slate-900">{paquetes.length}</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-violet-50 rounded-lg">
                <TrendingUp size={18} className="text-violet-600" />
              </div>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">
                Total Talleres
              </p>
            </div>
            <p className="text-2xl font-black text-slate-900">{talleres.length}</p>
          </div>
        </div>
      )}

      {/* Tabla de paquetes */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200">
          <h3 className="font-bold text-slate-800">
            Paquetes de insumos ({paquetes.length})
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Haz clic en una fila para ver el detalle de insumos del paquete.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50">
                <th className="w-8 px-3 py-3"></th>
                {[
                  { l: 'Taller',       a: 'left'   },
                  { l: 'Asignatura',   a: 'left'   },
                  { l: 'Carrera',      a: 'left'   },
                  { l: 'Semestre',     a: 'center' },
                  { l: 'Ítems',        a: 'center' },
                  { l: 'Estado',       a: 'center' },
                ].map(h => (
                  <th key={h.l}
                    className={`px-4 py-3 text-xs font-bold text-slate-500
                                uppercase tracking-wide text-${h.a}`}>
                    {h.l}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paquetes.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-slate-400">
                    <Package size={28} className="mx-auto mb-2 opacity-30" />
                    <p className="font-semibold text-sm">
                      No hay paquetes registrados.
                    </p>
                  </td>
                </tr>
              ) : paquetes.map(p => {
                const taller = talleres.find(t => t.id === p.taller_id)
                const asig = asignaturas.find(a => a.id === taller?.asignatura_id)
                const abierto = expandido === p.id
                return (
                  <>
                    <tr key={p.id}
                      className="hover:bg-slate-50 transition-colors cursor-pointer"
                      onClick={() => setExpandido(abierto ? null : p.id)}>
                      <td className="px-3 py-3 text-slate-400">
                        {abierto
                          ? <span className="text-teal-500">▲</span>
                          : <span>▼</span>}
                      </td>
                      <td className="px-4 py-3 font-semibold text-slate-900">
                        {p.taller_nombre}
                      </td>
                      <td className="px-4 py-3 text-slate-600 text-sm max-w-[220px]">
                        {asig?.nombre ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-slate-600 text-sm">
                        {asig ? nombreCarrera(asig.carrera ?? '') : '—'}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="font-mono text-xs bg-slate-100
                                         px-2 py-0.5 rounded-full">
                          {p.semestre}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center font-semibold">
                        {p.items.length}
                      </td>
                      <td className="px-4 py-3 text-center text-xs">
                        {p.bloqueado
                          ? <span className="text-amber-600 font-semibold">Bloqueado</span>
                          : <span className="text-teal-600 font-semibold">Editable</span>}
                      </td>
                    </tr>
                    {abierto && (
                      <tr key={`${p.id}-det`}>
                        <td colSpan={7} className="bg-slate-50 px-8 py-3">
                          {p.items.length === 0 ? (
                            <p className="text-slate-400 text-xs italic">
                              Sin ítems.
                            </p>
                          ) : (
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="text-slate-400 font-bold uppercase tracking-wide">
                                  <th className="text-left py-1 pr-4">Insumo / implemento</th>
                                  <th className="text-center py-1 pr-4">Tipo</th>
                                  <th className="text-center py-1 pr-4">Cantidad</th>
                                  <th className="text-left py-1">Notas</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-200">
                                {p.items.map(it => (
                                  <tr key={it.id}>
                                    <td className="py-1.5 pr-4 font-semibold text-slate-700">
                                      {it.insumo_nombre}
                                    </td>
                                    <td className="py-1.5 pr-4 text-center text-slate-500">
                                      {it.insumo_tipo}
                                    </td>
                                    <td className="py-1.5 pr-4 text-center font-bold
                                                   text-slate-700">
                                      {it.cantidad_requerida}
                                    </td>
                                    <td className="py-1.5 text-slate-400">
                                      {it.notas ?? '—'}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                          {p.creado_por_nombre && (
                            <p className="text-xs text-slate-400 mt-2">
                              Creado por {p.creado_por_nombre}
                            </p>
                          )}
                        </td>
                      </tr>
                    )}
                  </>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detalle de valorización (tabla completa) */}
      {val && val.insumos.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200">
            <h3 className="font-bold text-slate-800">
              Valorización del inventario ({val.total_insumos_valorados} insumos)
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50">
                  {[
                    { label: 'Nombre',      align: 'left'  },
                    { label: 'SKU',         align: 'left'  },
                    { label: 'Stock',       align: 'right' },
                    { label: 'Costo Unit.', align: 'right' },
                    { label: 'Valor Total', align: 'right' },
                    { label: 'Categoría',  align: 'left'  },
                  ].map(h => (
                    <th key={h.label}
                      className={`px-4 py-3 text-xs font-bold text-slate-500
                                  uppercase tracking-wide whitespace-nowrap
                                  text-${h.align}`}>
                      {h.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {val.insumos.map(i => (
                  <tr key={i.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-800">
                      {i.nombre}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-500">
                      {i.sku ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-slate-600 text-right">
                      {i.stock_actual}
                    </td>
                    <td className="px-4 py-3 text-slate-600 text-right">
                      ${fmtDec(i.costo_unitario)}
                    </td>
                    <td className="px-4 py-3 font-semibold text-right text-teal-600">
                      {fmt(i.valor_total)}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">
                      {i.categoria ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Tab: Costo por carrera
// ---------------------------------------------------------------------------
function TabCarreras() {
  const semestreActual = getSemestreActual()
  const [semestre, setSemestre] = useState(semestreActual)
  const [buscando, setBuscando] = useState('')
  const [data, setData]   = useState<ConsumoCarrerasResponse | null>(null)
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

  const COLS: { label: string; align: 'left' | 'right' }[] = [
    { label: 'Carrera',          align: 'left'  },
    { label: 'Solicitudes',      align: 'right' },
    { label: 'Estudiantes',      align: 'right' },
    { label: 'Costo Total',      align: 'right' },
    { label: 'Costo/Estudiante', align: 'right' },
  ]

  return (
    <div className="mt-4 space-y-5">
      <div className="flex gap-3 items-end">
        <div>
          <label className="block text-xs font-bold text-slate-500 mb-1">
            SEMESTRE
          </label>
          <input value={semestre} onChange={e => setSemestre(e.target.value)}
            placeholder="Ej: 2026-1"
            className="px-3 py-2 text-sm rounded-lg border border-slate-200
                       focus:outline-none focus:ring-2 focus:ring-teal-500 w-40"
            onKeyDown={e => e.key === 'Enter' && buscar()} />
          <p className="text-xs text-slate-400 mt-1">
            Semestre actual: <strong>{semestreActual}</strong>
          </p>
        </div>
        <button onClick={buscar} disabled={!semestre.trim() || loading}
          className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white
                     text-sm font-bold rounded-lg disabled:opacity-50
                     transition-colors mb-5">
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
          <p className="text-sm font-semibold text-slate-700">
            Semestre {buscando} — Costo total:
            <span className="ml-2 font-black text-teal-600">
              {fmt(data.costo_total_semestre)}
            </span>
          </p>
          {data.carreras.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <TrendingUp size={28} className="mx-auto mb-2 opacity-30" />
              <p className="font-semibold text-sm">
                Sin datos de consumo para este semestre.
              </p>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50">
                    {COLS.map(col => (
                      <th key={col.label}
                        className={`px-4 py-3 text-xs font-bold text-slate-500
                                    uppercase tracking-wide whitespace-nowrap
                                    text-${col.align}`}>
                        {col.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.carreras.map(c => (
                    <tr key={c.carrera} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-semibold text-slate-800">
                        {nombreCarrera(c.carrera)}
                      </td>
                      <td className="px-4 py-3 text-slate-600 text-right">
                        {c.num_solicitudes}
                      </td>
                      <td className="px-4 py-3 text-slate-600 text-right">
                        {c.num_estudiantes_total > 0
                          ? c.num_estudiantes_total
                          : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-4 py-3 font-bold text-right text-teal-600">
                        {fmt(c.costo_total)}
                      </td>
                      <td className="px-4 py-3 text-slate-600 text-right">
                        {c.costo_por_estudiante != null
                          ? fmt(c.costo_por_estudiante)
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
// Tab: Exportar (PDF + Excel lado a lado)
// ---------------------------------------------------------------------------
function TabExportar() {
  const [semestre, setSemestre] = useState(getSemestreActual)
  const [descargandoPdf, setDescargandoPdf]   = useState(false)
  const [descargandoXlsx, setDescargandoXlsx] = useState(false)
  const [errorPdf, setErrorPdf]   = useState<string | null>(null)
  const [errorXlsx, setErrorXlsx] = useState<string | null>(null)
  const [okPdf, setOkPdf]   = useState(false)
  const [okXlsx, setOkXlsx] = useState(false)

  async function _blobError(err: unknown): Promise<string> {
    const response = (err as { response?: { data?: unknown } })?.response
    if (response?.data instanceof Blob) {
      try {
        const texto = await (response.data as Blob).text()
        return JSON.parse(texto)?.detail ?? 'Error desconocido'
      } catch {
        return 'Error desconocido'
      }
    }
    return (response?.data as { detail?: string } | undefined)?.detail
      ?? 'Error desconocido'
  }

  async function descargarPdf() {
    setDescargandoPdf(true); setErrorPdf(null); setOkPdf(false)
    try {
      const params = semestre.trim()
        ? `?semestre=${encodeURIComponent(semestre.trim())}` : ''
      const resp = await api.get(`/reportes/valorizacion/pdf${params}`, {
        responseType: 'blob',
      })
      const url = URL.createObjectURL(
        new Blob([resp.data], { type: 'application/pdf' })
      )
      const a = document.createElement('a')
      a.href = url
      a.download = `valorizacion_hestia${semestre ? `_${semestre}` : ''}.pdf`
      a.click()
      URL.revokeObjectURL(url)
      setOkPdf(true); setTimeout(() => setOkPdf(false), 3000)
    } catch (err) {
      setErrorPdf(await _blobError(err))
    } finally { setDescargandoPdf(false) }
  }

  async function descargarXlsx() {
    setDescargandoXlsx(true); setErrorXlsx(null); setOkXlsx(false)
    try {
      const params = semestre.trim()
        ? `?semestre=${encodeURIComponent(semestre.trim())}` : ''
      const resp = await api.get(
        `/reportes/valorizacion/xlsx${params}`,
        { responseType: 'blob' }
      )
      const mime =
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      const url = URL.createObjectURL(new Blob([resp.data], { type: mime }))
      const a = document.createElement('a')
      a.href = url
      a.download = `valorizacion_hestia${semestre ? `_${semestre}` : ''}.xlsx`
      a.click()
      URL.revokeObjectURL(url)
      setOkXlsx(true); setTimeout(() => setOkXlsx(false), 3000)
    } catch (err) {
      setErrorXlsx(await _blobError(err))
    } finally { setDescargandoXlsx(false) }
  }

  const inputCls = `w-full px-3 py-2 text-sm rounded-lg border border-slate-200
    focus:outline-none focus:ring-2 focus:ring-teal-500`

  // Campo semestre compartido
  const campoSemestre = (
    <div>
      <label className="block text-xs font-bold text-slate-500 mb-1">
        SEMESTRE (opcional)
      </label>
      <input value={semestre} onChange={e => setSemestre(e.target.value)}
        placeholder="Ej: 2026-1" className={inputCls} />
      <p className="text-xs text-slate-400 mt-1">
        Aparecerá en el encabezado del reporte.
        Semestre actual: <strong>{getSemestreActual()}</strong>
      </p>
    </div>
  )

  return (
    <div className="mt-4">
      {/* Semestre compartido arriba */}
      <div className="max-w-xs mb-6">{campoSemestre}</div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Panel PDF */}
        <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
          <div>
            <h3 className="font-bold text-slate-800 flex items-center gap-2 mb-1">
              <Download size={16} className="text-slate-500" />
              Reporte PDF
            </h3>
            <p className="text-sm text-slate-500">
              Genera un PDF con la valorización del inventario agrupado
              por categoría, con el detalle de cada insumo.
            </p>
          </div>
          {errorPdf && (
            <div className="flex items-start gap-3 bg-rose-50 border border-rose-200
                            rounded-lg px-3 py-2 text-rose-700 text-sm">
              <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
              <span>{errorPdf}</span>
            </div>
          )}
          {okPdf && (
            <div className="bg-teal-50 border border-teal-200 rounded-lg px-3 py-2
                            text-teal-700 text-sm font-semibold">
              PDF descargado correctamente.
            </div>
          )}
          <button onClick={descargarPdf} disabled={descargandoPdf}
            className="flex items-center gap-2 w-full justify-center px-4 py-2.5
                       bg-teal-600 hover:bg-teal-700 text-white text-sm font-bold
                       rounded-lg disabled:opacity-50 transition-colors">
            <Download size={16} />
            {descargandoPdf ? 'Generando PDF...' : 'Descargar PDF'}
          </button>
        </div>

        {/* Panel Excel */}
        <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
          <div>
            <h3 className="font-bold text-slate-800 flex items-center gap-2 mb-1">
              <FileSpreadsheet size={16} className="text-emerald-600" />
              Reporte Excel
            </h3>
            <p className="text-sm text-slate-500">
              Genera un archivo Excel (.xlsx) con la valorización del
              inventario, paquetes de insumos y resumen por categoría.
            </p>
          </div>
          {errorXlsx && (
            <div className="flex items-start gap-3 bg-rose-50 border border-rose-200
                            rounded-lg px-3 py-2 text-rose-700 text-sm">
              <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
              <span>{errorXlsx}</span>
            </div>
          )}
          {okXlsx && (
            <div className="bg-teal-50 border border-teal-200 rounded-lg px-3 py-2
                            text-teal-700 text-sm font-semibold">
              Excel descargado correctamente.
            </div>
          )}
          <button onClick={descargarXlsx} disabled={descargandoXlsx}
            className="flex items-center gap-2 w-full justify-center px-4 py-2.5
                       bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold
                       rounded-lg disabled:opacity-50 transition-colors">
            <FileSpreadsheet size={16} />
            {descargandoXlsx ? 'Generando Excel...' : 'Descargar Excel'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Página principal
// ---------------------------------------------------------------------------
export function Reportes() {
  const [tab, setTab] = useState<Tab>('paquetes')
  const [refreshKey, setRefreshKey] = useState(0)

  const tabs: { id: Tab; label: string }[] = [
    { id: 'paquetes',  label: 'Paquetes de insumos' },
    { id: 'carreras',  label: 'Costo por carrera' },
    { id: 'exportar',  label: 'Exportar' },
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
            Paquetes de insumos, valorización y costo por carrera.
            Semestre actual: <strong>{getSemestreActual()}</strong>
          </p>
        </div>
        {tab === 'paquetes' && (
          <button onClick={() => setRefreshKey(k => k + 1)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg
                       border border-slate-200 text-slate-600
                       hover:bg-slate-100 text-sm font-semibold
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
            className={`px-4 py-2 text-sm font-semibold rounded-lg
              transition-colors ${
              tab === t.id
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'paquetes' && <TabPaquetes key={refreshKey} />}
      {tab === 'carreras' && <TabCarreras />}
      {tab === 'exportar' && <TabExportar />}
    </div>
  )
}
