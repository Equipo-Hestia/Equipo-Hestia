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
import { useLastUpdated } from '../hooks/useLastUpdated'

type Tab = 'paquetes' | 'carreras' | 'exportar'

const CARRERA_NOMBRES: Record<string, string> = {
  TENS: 'Tecnico en Enfermeria',
  TQF: 'Tecnico en Quimica y Farmacia',
  TLCBS: 'Tecnico de Laboratorio Clinico y Banco de Sangre',
  TONS: 'Tecnico en Odontologia',
  preparador_fisico: 'Preparador Fisico',
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
// Tab: Paquetes de insumos
// ---------------------------------------------------------------------------
function TabPaquetes({ refreshKey }: { refreshKey: number }) {
  const [paquetes, setPaquetes]       = useState<PaqueteResponse[]>([])
  const [talleres, setTalleres]       = useState<TallerResponse[]>([])
  const [asignaturas, setAsignaturas] = useState<AsignaturaResponse[]>([])
  const [val, setVal]                 = useState<ValorizacionResponse | null>(null)
  const [loading, setLoading]         = useState(true)
  const [error, setError]             = useState<string | null>(null)
  const [expandido, setExpandido]     = useState<number | null>(null)
  const { labelTiempo, marcarActualizado } = useLastUpdated()

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
      marcarActualizado()
    } catch {
      setError('No se pudo cargar la informacion de paquetes.')
    } finally {
      setLoading(false)
    }
  }, [marcarActualizado])

  useEffect(() => { load() }, [load, refreshKey])

  if (loading) return (
    <div className="space-y-3 mt-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="skeleton h-16 rounded-xl" />
      ))}
    </div>
  )

  if (error) return (
    <div className="flex items-center gap-3 rounded-xl px-4 py-3 mt-4 text-sm"
      style={{
        background: 'var(--h-sem-danger-bg)',
        color: 'var(--h-sem-danger-text)',
        border: '1px solid var(--h-sem-danger-border)',
      }}>
      <AlertCircle size={16} className="flex-shrink-0" />
      {error}
    </div>
  )

  return (
    <div className="mt-4 space-y-6">

      {/* Label de tiempo debajo del contenido */}
      {labelTiempo && (
        <p className="text-xs text-h-tertiary -mt-2">{labelTiempo}</p>
      )}

      {val && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="rounded-xl border border-h-subtle p-5"
            style={{ background: 'var(--h-bg-surface)' }}>
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 rounded-lg" style={{ background: 'var(--h-teal-subtle)' }}>
                <DollarSign size={18} style={{ color: 'var(--h-teal-hover)' }} />
              </div>
              <p className="text-xs font-bold text-h-tertiary uppercase tracking-wide">
                Valor Total Inventario
              </p>
            </div>
            <p className="text-2xl font-black text-h-primary">
              {fmt(val.valor_total_inventario)}
            </p>
          </div>
          <div className="rounded-xl border border-h-subtle p-5"
            style={{ background: 'var(--h-bg-surface)' }}>
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 rounded-lg" style={{ background: 'var(--h-sem-success-bg)' }}>
                <Package size={18} style={{ color: 'var(--h-sem-success-text)' }} />
              </div>
              <p className="text-xs font-bold text-h-tertiary uppercase tracking-wide">
                Total Paquetes
              </p>
            </div>
            <p className="text-2xl font-black text-h-primary">{paquetes.length}</p>
          </div>
          <div className="rounded-xl border border-h-subtle p-5"
            style={{ background: 'var(--h-bg-surface)' }}>
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 rounded-lg"
                style={{ background: 'rgba(139,92,246,0.15)' }}>
                <TrendingUp size={18} style={{ color: '#a78bfa' }} />
              </div>
              <p className="text-xs font-bold text-h-tertiary uppercase tracking-wide">
                Total Talleres
              </p>
            </div>
            <p className="text-2xl font-black text-h-primary">{talleres.length}</p>
          </div>
        </div>
      )}

      {/* Tabla de paquetes */}
      <div className="rounded-xl border border-h-subtle overflow-hidden"
        style={{ background: 'var(--h-bg-surface)' }}>
        <div className="px-5 py-4 border-b border-h-subtle">
          <h3 className="font-bold text-h-primary">Paquetes de insumos ({paquetes.length})</h3>
          <p className="text-xs text-h-tertiary mt-0.5">
            Haz clic en una fila para ver el detalle de insumos del paquete y su valorización.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-h-subtle"
                style={{ background: 'var(--h-bg-elevated)' }}>
                <th className="w-8 px-3 py-3"></th>
                {[
                  { l: 'Taller',     a: 'left'   },
                  { l: 'Asignatura', a: 'left'   },
                  { l: 'Carrera',    a: 'left'   },
                  { l: 'Semestre',   a: 'center' },
                  { l: 'Ítems',      a: 'center' },
                  { l: 'Estado',     a: 'center' },
                ].map(h => (
                  <th key={h.l}
                    className={`px-4 py-3 text-[10px] font-semibold text-h-tertiary
                                uppercase tracking-widest text-${h.a}`}>
                    {h.l}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paquetes.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-h-secondary">
                    <Package size={28} className="mx-auto mb-2 opacity-30" />
                    <p className="font-semibold text-sm">No hay paquetes registrados.</p>
                  </td>
                </tr>
              ) : paquetes.map(p => {
                const taller = talleres.find(t => t.id === p.taller_id)
                const asig   = asignaturas.find(a => a.id === taller?.asignatura_id)
                const abierto = expandido === p.id

                const costoTotal = p.items.reduce((acc, item) => {
                  if (item.insumo_costo_unitario == null) return acc
                  return acc + Number(item.insumo_costo_unitario) * item.cantidad_requerida
                }, 0)
                const tieneCostos = p.items.some(i => i.insumo_costo_unitario != null)

                return (
                  <div key={p.id} className="contents">
                    <tr
                      className="border-b border-h-subtle transition-colors cursor-pointer"
                      onClick={() => setExpandido(abierto ? null : p.id)}
                      onMouseEnter={e =>
                        (e.currentTarget.style.background = 'var(--h-bg-elevated)')}
                      onMouseLeave={e =>
                        (e.currentTarget.style.background = '')}
                    >
                      <td className="px-3 py-3 text-h-tertiary">
                        {abierto
                          ? <span style={{ color: 'var(--h-teal-hover)' }}>&#9650;</span>
                          : <span>&#9660;</span>}
                      </td>
                      <td className="px-4 py-3 font-semibold text-h-primary">
                        {p.taller_nombre}
                      </td>
                      <td className="px-4 py-3 text-h-secondary text-sm max-w-[220px]">
                        {asig?.nombre ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-h-secondary text-sm">
                        {asig ? nombreCarrera(asig.carrera ?? '') : '—'}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="font-mono text-xs px-2 py-0.5 rounded-full"
                          style={{ background: 'var(--h-bg-highlight)', color: 'var(--h-text-secondary)' }}>
                          {p.semestre}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center font-semibold text-h-primary">
                        {p.items.length}
                      </td>
                      <td className="px-4 py-3 text-center text-xs">
                        {p.bloqueado
                          ? <span style={{ color: 'var(--h-sem-warning-text)' }} className="font-semibold">Bloqueado</span>
                          : <span style={{ color: 'var(--h-teal-hover)' }} className="font-semibold">Editable</span>}
                      </td>
                    </tr>
                    {abierto && (
                      <tr key={`${p.id}-det`}>
                        <td colSpan={7} className="px-8 py-5 border-b border-h-subtle"
                          style={{ background: 'var(--h-bg-elevated)' }}>
                          {p.items.length === 0 ? (
                            <p className="text-h-tertiary text-xs italic">Sin ítems.</p>
                          ) : (
                            <>
                              <table className="w-full text-xs mb-3">
                                <thead>
                                  <tr className="text-h-tertiary font-bold uppercase tracking-wide">
                                    <th className="text-left py-1 pr-4">Insumo / implemento</th>
                                    <th className="text-center py-1 pr-4">Tipo</th>
                                    <th className="text-center py-1 pr-4">Cantidad</th>
                                    <th className="text-right py-1 pr-4">Costo unit.</th>
                                    <th className="text-right py-1 pr-4">Subtotal</th>
                                    <th className="text-left py-1">Notas</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-h-subtle">
                                  {p.items.map(it => {
                                    const subtotal = it.insumo_costo_unitario != null
                                        ? Number(it.insumo_costo_unitario) * it.cantidad_requerida
                                        : null
                                    return (
                                      <tr key={it.id}>
                                        <td className="py-2 pr-4 font-semibold text-h-primary">
                                          {it.insumo_nombre}
                                        </td>
                                        <td className="py-2 pr-4 text-center text-h-secondary">
                                          {it.insumo_tipo}
                                        </td>
                                        <td className="py-2 pr-4 text-center font-bold text-h-primary">
                                          {it.cantidad_requerida}
                                          {it.insumo_unidad_medida && (
                                            <span className="ml-1 text-[10px] font-normal text-h-tertiary">
                                              {it.insumo_unidad_medida}
                                            </span>
                                          )}
                                        </td>
                                        <td className="py-2 pr-4 text-right text-h-secondary tabular-nums">
                                          {it.insumo_costo_unitario != null ? fmt(Number(it.insumo_costo_unitario)) : '—'}
                                        </td>
                                        <td className="py-2 pr-4 text-right font-semibold text-h-primary tabular-nums">
                                          {subtotal != null ? fmt(subtotal) : '—'}
                                        </td>
                                        <td className="py-2 text-h-tertiary">{it.notas ?? '—'}</td>
                                      </tr>
                                    )
                                  })}
                                </tbody>
                              </table>
                              
                              <div className="pt-3 border-t border-h-subtle flex items-center justify-between gap-4">
                                <p className="text-xs text-h-tertiary">
                                  {p.creado_por_nombre ? `Creado por ${p.creado_por_nombre}` : ''}
                                </p>
                                {tieneCostos && (
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs font-semibold text-h-tertiary uppercase tracking-wide">
                                      Costo estimado del paquete
                                    </span>
                                    <span
                                      className="text-base font-black tabular-nums"
                                      style={{ color: 'var(--h-teal-hover)' }}
                                    >
                                      {fmt(costoTotal)}
                                    </span>
                                    <span className="text-xs text-h-tertiary">
                                      (solo ítems con costo registrado)
                                    </span>
                                  </div>
                                )}
                              </div>
                            </>
                          )}
                        </td>
                      </tr>
                    )}
                  </div>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {val && val.insumos.length > 0 && (
        <div className="rounded-xl border border-h-subtle overflow-hidden"
          style={{ background: 'var(--h-bg-surface)' }}>
          <div className="px-5 py-4 border-b border-h-subtle">
            <h3 className="font-bold text-h-primary">
              Valorizacion del inventario ({val.total_insumos_valorados} insumos)
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-h-subtle"
                  style={{ background: 'var(--h-bg-elevated)' }}>
                  {[
                    { label: 'Nombre',      align: 'left'  },
                    { label: 'SKU',         align: 'left'  },
                    { label: 'Stock',       align: 'right' },
                    { label: 'Costo Unit.', align: 'right' },
                    { label: 'Valor Total', align: 'right' },
                    { label: 'Categoria',   align: 'left'  },
                  ].map(h => (
                    <th key={h.label}
                      className={`px-4 py-3 text-[10px] font-semibold text-h-tertiary
                                  uppercase tracking-widest whitespace-nowrap
                                  text-${h.align}`}>
                      {h.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {val.insumos.map(i => (
                  <tr key={i.id}
                    className="border-b border-h-subtle transition-colors"
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--h-bg-elevated)')}
                    onMouseLeave={e => (e.currentTarget.style.background = '')}>
                    <td className="px-4 py-3 font-medium text-h-primary">{i.nombre}</td>
                    <td className="px-4 py-3 font-mono text-xs text-h-tertiary">{i.sku ?? '—'}</td>
                    <td className="px-4 py-3 text-h-secondary text-right">{i.stock_actual}</td>
                    <td className="px-4 py-3 text-h-secondary text-right">${fmtDec(i.costo_unitario)}</td>
                    <td className="px-4 py-3 font-semibold text-right"
                      style={{ color: 'var(--h-teal-hover)' }}>
                      {fmt(i.valor_total)}
                    </td>
                    <td className="px-4 py-3 text-xs text-h-tertiary">{i.categoria ?? '—'}</td>
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
  const [semestre, setSemestre]   = useState(semestreActual)
  const [buscando, setBuscando]   = useState('')
  const [data, setData]           = useState<ConsumoCarrerasResponse | null>(null)
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState<string | null>(null)

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

  const inputCls = `px-3 py-2 text-sm rounded-lg border border-h-subtle
    focus:outline-none focus:border-h-visible bg-h-elevated text-h-primary
    placeholder:text-h-tertiary`

  return (
    <div className="mt-4 space-y-5">
      <div className="flex gap-3 items-end">
        <div>
          <label className="block text-[10px] font-semibold text-h-tertiary mb-1
                            uppercase tracking-widest">
            Semestre
          </label>
          <input value={semestre} onChange={e => setSemestre(e.target.value)}
            placeholder="Ej: 2026-1" className={`${inputCls} w-40`}
            onKeyDown={e => e.key === 'Enter' && buscar()} />
          <p className="text-xs text-h-tertiary mt-1">
            Semestre actual: <strong>{semestreActual}</strong>
          </p>
        </div>
        <button onClick={buscar} disabled={!semestre.trim() || loading}
          className="px-4 py-2 text-white text-sm font-bold rounded-lg
                     disabled:opacity-50 transition-colors mb-5"
          style={{ background: 'var(--h-teal-rest)' }}
          onMouseEnter={e => { if (!loading) (e.currentTarget.style.background = 'var(--h-teal-hover)') }}
          onMouseLeave={e => { (e.currentTarget.style.background = 'var(--h-teal-rest)') }}>
          {loading ? 'Cargando...' : 'Consultar'}
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm"
          style={{
            background: 'var(--h-sem-danger-bg)',
            color: 'var(--h-sem-danger-text)',
            border: '1px solid var(--h-sem-danger-border)',
          }}>
          <AlertCircle size={16} className="flex-shrink-0" />
          {error}
        </div>
      )}

      {data && (
        <>
          <p className="text-sm font-semibold text-h-primary">
            Semestre {buscando} — Costo total:
            <span className="ml-2 font-black" style={{ color: 'var(--h-teal-hover)' }}>
              {fmt(data.costo_total_semestre)}
            </span>
          </p>
          {data.carreras.length === 0 ? (
            <div className="text-center py-12 text-h-secondary">
              <TrendingUp size={28} className="mx-auto mb-2 opacity-30" />
              <p className="font-semibold text-sm">Sin datos de consumo para este semestre.</p>
            </div>
          ) : (
            <div className="rounded-xl border border-h-subtle overflow-hidden"
              style={{ background: 'var(--h-bg-surface)' }}>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-h-subtle"
                    style={{ background: 'var(--h-bg-elevated)' }}>
                    {COLS.map(col => (
                      <th key={col.label}
                        className={`px-4 py-3 text-[10px] font-semibold text-h-tertiary
                                    uppercase tracking-widest whitespace-nowrap
                                    text-${col.align}`}>
                        {col.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.carreras.map(c => (
                    <tr key={c.carrera}
                      className="border-b border-h-subtle transition-colors"
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--h-bg-elevated)')}
                      onMouseLeave={e => (e.currentTarget.style.background = '')}>
                      <td className="px-4 py-3 font-semibold text-h-primary">
                        {nombreCarrera(c.carrera)}
                      </td>
                      <td className="px-4 py-3 text-h-secondary text-right">{c.num_solicitudes}</td>
                      <td className="px-4 py-3 text-h-secondary text-right">
                        {c.num_estudiantes_total > 0
                          ? c.num_estudiantes_total
                          : <span className="text-h-tertiary">—</span>}
                      </td>
                      <td className="px-4 py-3 font-bold text-right"
                        style={{ color: 'var(--h-teal-hover)' }}>
                        {fmt(c.costo_total)}
                      </td>
                      <td className="px-4 py-3 text-h-secondary text-right">
                        {c.costo_por_estudiante != null
                          ? fmt(c.costo_por_estudiante)
                          : <span className="text-h-tertiary">—</span>}
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
// Tab: Exportar
// ---------------------------------------------------------------------------
function TabExportar() {
  const [semestre, setSemestre]           = useState(getSemestreActual)
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
      } catch { return 'Error desconocido' }
    }
    return (response?.data as { detail?: string } | undefined)?.detail ?? 'Error desconocido'
  }

  async function descargarPdf() {
    setDescargandoPdf(true); setErrorPdf(null); setOkPdf(false)
    try {
      const params = semestre.trim()
        ? `?semestre=${encodeURIComponent(semestre.trim())}` : ''
      const resp = await api.get(`/reportes/valorizacion/pdf${params}`, { responseType: 'blob' })
      const url = URL.createObjectURL(new Blob([resp.data], { type: 'application/pdf' }))
      const a = document.createElement('a')
      a.href = url
      a.download = `valorizacion_hestia${semestre ? `_${semestre}` : ''}.pdf`
      a.click()
      URL.revokeObjectURL(url)
      setOkPdf(true); setTimeout(() => setOkPdf(false), 3000)
    } catch (err) { setErrorPdf(await _blobError(err))
    } finally { setDescargandoPdf(false) }
  }

  async function descargarXlsx() {
    setDescargandoXlsx(true); setErrorXlsx(null); setOkXlsx(false)
    try {
      const params = semestre.trim()
        ? `?semestre=${encodeURIComponent(semestre.trim())}` : ''
      const resp = await api.get(`/reportes/valorizacion/xlsx${params}`, { responseType: 'blob' })
      const mime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      const url = URL.createObjectURL(new Blob([resp.data], { type: mime }))
      const a = document.createElement('a')
      a.href = url
      a.download = `valorizacion_hestia${semestre ? `_${semestre}` : ''}.xlsx`
      a.click()
      URL.revokeObjectURL(url)
      setOkXlsx(true); setTimeout(() => setOkXlsx(false), 3000)
    } catch (err) { setErrorXlsx(await _blobError(err))
    } finally { setDescargandoXlsx(false) }
  }

  const inputCls = `w-full px-3 py-2 text-sm rounded-lg border border-h-subtle
    focus:outline-none focus:border-h-visible bg-h-elevated text-h-primary
    placeholder:text-h-tertiary`

  const campoSemestre = (
    <div>
      <label className="block text-[10px] font-semibold text-h-tertiary mb-1
                        uppercase tracking-widest">
        Semestre (opcional)
      </label>
      <input value={semestre} onChange={e => setSemestre(e.target.value)}
        placeholder="Ej: 2026-1" className={inputCls} />
      <p className="text-xs text-h-tertiary mt-1">
        Semestre actual: <strong>{getSemestreActual()}</strong>
      </p>
    </div>
  )

  return (
    <div className="mt-4">
      <div className="max-w-xs mb-6">{campoSemestre}</div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

        {/* Panel PDF */}
        <div className="rounded-xl border border-h-subtle p-6 space-y-4"
          style={{ background: 'var(--h-bg-surface)' }}>
          <div>
            <h3 className="font-bold text-h-primary flex items-center gap-2 mb-1">
              <Download size={16} className="text-h-tertiary" />
              Reporte PDF
            </h3>
            <p className="text-sm text-h-secondary">
              Genera un PDF con la valorizacion del inventario agrupado por categoria.
            </p>
          </div>
          {errorPdf && (
            <div className="flex items-start gap-3 rounded-lg px-3 py-2 text-sm"
              style={{
                background: 'var(--h-sem-danger-bg)',
                color: 'var(--h-sem-danger-text)',
                border: '1px solid var(--h-sem-danger-border)',
              }}>
              <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
              <span>{errorPdf}</span>
            </div>
          )}
          {okPdf && (
            <div className="rounded-lg px-3 py-2 text-sm font-semibold"
              style={{
                background: 'var(--h-sem-success-bg)',
                color: 'var(--h-sem-success-text)',
                border: '1px solid var(--h-sem-success-border)',
              }}>
              PDF descargado correctamente.
            </div>
          )}
          <button onClick={descargarPdf} disabled={descargandoPdf}
            className="flex items-center gap-2 w-full justify-center px-4 py-2.5
                       text-white text-sm font-bold rounded-lg disabled:opacity-50
                       transition-colors"
            style={{ background: 'var(--h-teal-rest)' }}
            onMouseEnter={e => { if (!descargandoPdf) (e.currentTarget.style.background = 'var(--h-teal-hover)') }}
            onMouseLeave={e => { (e.currentTarget.style.background = 'var(--h-teal-rest)') }}>
            <Download size={16} />
            {descargandoPdf ? 'Generando PDF...' : 'Descargar PDF'}
          </button>
        </div>

        {/* Panel Excel */}
        <div className="rounded-xl border border-h-subtle p-6 space-y-4"
          style={{ background: 'var(--h-bg-surface)' }}>
          <div>
            <h3 className="font-bold text-h-primary flex items-center gap-2 mb-1">
              <FileSpreadsheet size={16} style={{ color: 'var(--h-sem-success-text)' }} />
              Reporte Excel
            </h3>
            <p className="text-sm text-h-secondary">
              Genera un archivo Excel (.xlsx) con la valorizacion del inventario,
              paquetes de insumos y resumen por categoria.
            </p>
          </div>
          {errorXlsx && (
            <div className="flex items-start gap-3 rounded-lg px-3 py-2 text-sm"
              style={{
                background: 'var(--h-sem-danger-bg)',
                color: 'var(--h-sem-danger-text)',
                border: '1px solid var(--h-sem-danger-border)',
              }}>
              <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
              <span>{errorXlsx}</span>
            </div>
          )}
          {okXlsx && (
            <div className="rounded-lg px-3 py-2 text-sm font-semibold"
              style={{
                background: 'var(--h-sem-success-bg)',
                color: 'var(--h-sem-success-text)',
                border: '1px solid var(--h-sem-success-border)',
              }}>
              Excel descargado correctamente.
            </div>
          )}
          <button onClick={descargarXlsx} disabled={descargandoXlsx}
            className="flex items-center gap-2 w-full justify-center px-4 py-2.5
                       text-white text-sm font-bold rounded-lg disabled:opacity-50
                       transition-colors"
            style={{ background: 'var(--h-sem-success-border)' }}
            onMouseEnter={e => { if (!descargandoXlsx) (e.currentTarget.style.background = 'var(--h-teal-hover)') }}
            onMouseLeave={e => { (e.currentTarget.style.background = 'var(--h-sem-success-border)') }}>
            <FileSpreadsheet size={16} />
            {descargandoXlsx ? 'Generando Excel...' : 'Descargar Excel'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Pagina principal
// ---------------------------------------------------------------------------
export function Reportes() {
  const [tab, setTab]           = useState<Tab>('paquetes')
  const [refreshKey, setRefreshKey] = useState(0)

  const tabs: { id: Tab; label: string }[] = [
    { id: 'paquetes', label: 'Paquetes de insumos' },
    { id: 'carreras', label: 'Costo por carrera' },
    { id: 'exportar', label: 'Exportar' },
  ]

  return (
    <div className="p-8 w-full">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-h-primary flex items-center gap-2">
            <BarChart2 size={22} style={{ color: 'var(--h-teal-hover)' }} />
            Reportes
          </h1>
          <p className="text-h-secondary text-sm mt-0.5">
            Paquetes de insumos, valorizacion y costo por carrera.
            Semestre actual: <strong>{getSemestreActual()}</strong>
          </p>
        </div>
        {tab === 'paquetes' && (
          <button onClick={() => setRefreshKey(k => k + 1)}
            className="p-2 rounded-lg border border-h-subtle text-h-tertiary transition-colors"
            style={{ background: 'var(--h-bg-elevated)' }}
            onMouseEnter={e => {
              e.currentTarget.style.background = 'var(--h-bg-highlight)'
              e.currentTarget.style.color = 'var(--h-text-secondary)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'var(--h-bg-elevated)'
              e.currentTarget.style.color = ''
            }}
            title="Actualizar">
            <RefreshCw size={15} />
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-xl mb-6 w-fit"
        style={{ background: 'var(--h-bg-elevated)' }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={[
              'px-4 py-2 text-sm font-semibold rounded-lg transition-colors',
              tab === t.id ? 'text-h-primary shadow-sm' : 'text-h-tertiary hover:text-h-secondary',
            ].join(' ')}
            style={tab === t.id ? { background: 'var(--h-bg-surface)' } : {}}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'paquetes' && <TabPaquetes key={refreshKey} refreshKey={refreshKey} />}
      {tab === 'carreras' && <TabCarreras />}
      {tab === 'exportar' && <TabExportar />}
    </div>
  )
}
