import { useEffect, useState, useCallback, useRef } from 'react'
import {
  ArrowUpCircle, ArrowDownCircle, ArrowRightLeft,
  Plus, RefreshCw, CheckCircle,
  Download, FileText, X, SlidersHorizontal
} from 'lucide-react'
import { api } from '../api/client'
import { useAuthStore } from '../store/auth'
import type {
  MovimientoEnriquecido, MovimientoCreate,
  InsumoResponse, PaginatedResponse,
  TipoMovimiento, SubtipoMovimiento,
} from '../types/api'
import {
  ETIQUETA_SUBTIPO,
  SUBTIPOS_POR_TIPO as SUBTIPOS_MAP,
} from '../types/api'
import { Badge } from '../components/ui/Badge'
import { Modal } from '../components/ui/Modal'
import { TableRowSkeleton } from '../components/ui/Skeleton'
import { SearchWithSuggestions } from '../components/ui/SearchSuggestions'
import { useLastUpdated } from '../hooks/useLastUpdated'

const PAGE_SIZE = 20

function formatFecha(fecha: string) {
  return new Date(fecha).toLocaleString('es-CL', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function TipoBadge({ tipo, subtipo }: { tipo: TipoMovimiento; subtipo: SubtipoMovimiento | null }) {
  const icono = tipo === 'entrada'
    ? <ArrowUpCircle size={14} className="text-teal-600" />
    : tipo === 'salida'
      ? <ArrowDownCircle size={14} className="text-amber-500" />
      : <ArrowRightLeft size={14} className="text-blue-500" />
  const variante = tipo === 'entrada' ? 'success' : tipo === 'salida' ? 'warning' : 'info'
  const etiquetaSubtipo = subtipo ? ETIQUETA_SUBTIPO[subtipo] : null
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center gap-1.5">
        {icono}
        <Badge variant={variante}>
          {tipo === 'entrada' ? 'Entrada' : tipo === 'salida' ? 'Salida' : 'Interno'}
        </Badge>
      </div>
      {etiquetaSubtipo && (
        <span className="text-xs text-h-tertiary pl-0.5">{etiquetaSubtipo}</span>
      )}
    </div>
  )
}

interface Filtros {
  insumo: string
  tipo: TipoMovimiento | 'todos'
  fecha_desde: string
  fecha_hasta: string
}

const FILTROS_VACIOS: Filtros = { insumo: '', tipo: 'todos', fecha_desde: '', fecha_hasta: '' }

export function Movimientos() {
  const { user } = useAuthStore()
  const puedeRegistrar = user?.rol === 'admin' || user?.rol === 'operador'
    || user?.rol === 'operador_coordinador'

  const [movimientos, setMovimientos] = useState<MovimientoEnriquecido[]>([])
  const [total, setTotal]             = useState(0)
  const [page, setPage]               = useState(0)
  const [loading, setLoading]         = useState(true)
  const { labelTiempo, marcarActualizado } = useLastUpdated()

  const [filtros, setFiltros]         = useState<Filtros>(FILTROS_VACIOS)
  const [searchInput, setSearchInput] = useState('')
  const hasFilters = filtros.insumo || filtros.tipo !== 'todos' || filtros.fecha_desde || filtros.fecha_hasta

  const [showExportMenu, setShowExportMenu] = useState(false)
  const [exporting, setExporting]           = useState(false)
  const exportRef                           = useRef<HTMLDivElement>(null)

  const [showModal, setShowModal]   = useState(false)
  const [insumos, setInsumos]       = useState<InsumoResponse[]>([])
  const [tipo, setTipo]             = useState<TipoMovimiento>('entrada')
  const [subtipo, setSubtipo]       = useState<SubtipoMovimiento>('compra')
  const [insumoId, setInsumoId]     = useState('')
  const [cantidad, setCantidad]     = useState('')
  const [motivo, setMotivo]         = useState('')
  const [saving, setSaving]         = useState(false)
  const [formError, setFormError]   = useState<string | null>(null)
  const [toast, setToast]           = useState<string | null>(null)

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(null), 3000) }

  useEffect(() => {
    const opciones = SUBTIPOS_MAP[tipo]
    if (opciones.length > 0) setSubtipo(opciones[0])
  }, [tipo])

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) {
        setShowExportMenu(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const load = useCallback(async (skip: number, f: Filtros) => {
    setLoading(true)
    try {
      const params: Record<string, string | number> = { skip, limit: PAGE_SIZE }
      if (f.insumo)           params.insumo     = f.insumo
      if (f.tipo !== 'todos') params.tipo        = f.tipo
      if (f.fecha_desde)      params.fecha_desde = f.fecha_desde
      if (f.fecha_hasta)      params.fecha_hasta = f.fecha_hasta
      const { data } = await api.get<PaginatedResponse<MovimientoEnriquecido>>(
        '/movimientos/', { params }
      )
      setMovimientos(data.data); setTotal(data.total)
      marcarActualizado()
    } finally { setLoading(false) }
  }, [marcarActualizado])

  useEffect(() => { load(page * PAGE_SIZE, filtros) }, [page, filtros, load])

  function aplicarBusqueda(val: string) { setFiltros(f => ({ ...f, insumo: val })); setPage(0) }
  function setFiltro<K extends keyof Filtros>(key: K, value: Filtros[K]) {
    setFiltros(f => ({ ...f, [key]: value })); setPage(0)
  }
  function limpiarFiltros() { setFiltros(FILTROS_VACIOS); setSearchInput(''); setPage(0) }

  async function handleExportar(formato: 'csv' | 'xlsx') {
    setExporting(true); setShowExportMenu(false)
    try {
      const params: Record<string, string> = { formato }
      if (filtros.insumo)           params.insumo     = filtros.insumo
      if (filtros.tipo !== 'todos') params.tipo        = filtros.tipo
      if (filtros.fecha_desde)      params.fecha_desde = filtros.fecha_desde
      if (filtros.fecha_hasta)      params.fecha_hasta = filtros.fecha_hasta
      const res = await api.get('/movimientos/exportar', { params, responseType: 'blob' })
      const ext  = formato === 'xlsx' ? 'xlsx' : 'csv'
      const mime = formato === 'xlsx'
        ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'text/csv'
      const url = URL.createObjectURL(new Blob([res.data], { type: mime }))
      const a = document.createElement('a')
      a.href = url; a.download = `movimientos_hestia.${ext}`; a.click()
      URL.revokeObjectURL(url)
      showToast(`Exportado como ${ext.toUpperCase()}`)
    } finally { setExporting(false) }
  }

  async function abrirModal() {
    setTipo('entrada'); setSubtipo('compra'); setInsumoId('')
    setCantidad(''); setMotivo(''); setFormError(null)
    if (insumos.length === 0) {
      const { data } = await api.get<PaginatedResponse<InsumoResponse>>(
        '/insumos/', { params: { limit: 200 } }
      )
      setInsumos(data.data)
    }
    setShowModal(true)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setSaving(true); setFormError(null)
    const payload: MovimientoCreate = {
      tipo, subtipo, insumo_id: parseInt(insumoId),
      cantidad: parseInt(cantidad), motivo: motivo.trim() || null,
    }
    try {
      await api.post('/movimientos/', payload)
      showToast('Movimiento registrado correctamente')
      setShowModal(false); load(0, filtros); setPage(0)
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
      setFormError(msg ?? 'Error al registrar el movimiento.')
    } finally { setSaving(false) }
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const inputCls = `w-full px-3 py-2.5 rounded-lg text-h-primary text-sm
    focus:outline-none transition-all bg-h-elevated border border-h-visible
    focus:border-h-strong placeholder:text-h-tertiary`
  const labelCls = 'block text-[10px] font-semibold text-h-tertiary uppercase tracking-widest mb-1.5'
  const dateCls  = `px-3 py-1.5 rounded-lg border text-sm cursor-pointer
    bg-h-elevated border-h-subtle text-h-primary
    focus:outline-none focus:border-h-visible transition-colors`

  return (
    <div className="p-8 w-full">
      {toast && (
        <div className="fixed top-6 right-6 z-50 flex items-center gap-2
                        text-white px-4 py-3 rounded-xl shadow-lg text-sm font-semibold"
          style={{ background: 'var(--h-teal-rest)' }}>
          <CheckCircle size={16} />{toast}
        </div>
      )}

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-h-primary">Movimientos</h1>
          <p className="text-h-secondary text-sm mt-0.5">
            {loading ? '...' : `${total} movimientos`}{hasFilters && ' (filtrado)'}
          </p>
          {labelTiempo && (
            <p className="text-xs text-h-tertiary mt-1">{labelTiempo}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => load(page * PAGE_SIZE, filtros)}
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
          <div className="relative" ref={exportRef}>
            <button onClick={() => setShowExportMenu(v => !v)} disabled={exporting}
              className="flex items-center gap-2 px-3 py-2 rounded-lg border border-h-subtle
                         text-h-secondary text-sm font-semibold transition-colors
                         disabled:opacity-50 bg-h-elevated hover:bg-h-highlight">
              <Download size={14} />{exporting ? 'Exportando...' : 'Exportar'}
            </button>
            {showExportMenu && (
              <div className="absolute right-0 top-full mt-1 border rounded-xl shadow-lg z-20
                              overflow-hidden min-w-36"
                style={{ background: 'var(--h-bg-surface)', borderColor: 'var(--h-border-subtle)' }}>
                <button onClick={() => handleExportar('csv')}
                  className="w-full flex items-center gap-2 px-4 py-2.5 text-sm
                             text-h-secondary hover:bg-h-elevated font-medium">
                  <FileText size={14} className="text-h-tertiary" /> CSV
                </button>
                <button onClick={() => handleExportar('xlsx')}
                  className="w-full flex items-center gap-2 px-4 py-2.5 text-sm
                             text-h-secondary hover:bg-h-elevated font-medium">
                  <FileText size={14} style={{ color: 'var(--h-teal-hover)' }} /> Excel (.xlsx)
                </button>
              </div>
            )}
          </div>
          {puedeRegistrar && (
            <button onClick={abrirModal}
              className="flex items-center gap-2 text-white font-semibold
                         px-4 py-2.5 rounded-xl text-sm transition-colors"
              style={{ background: 'var(--h-teal-rest)' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--h-teal-hover)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'var(--h-teal-rest)')}>
              <Plus size={16} /> Registrar
            </button>
          )}
        </div>
      </div>

      {/* Filtros */}
      <div className="rounded-xl border border-h-subtle p-4 mb-5"
        style={{ background: 'var(--h-bg-surface)' }}>
        <div className="flex gap-2 mb-3">
          <SearchWithSuggestions
            value={searchInput}
            onChange={val => { setSearchInput(val); if (!val) aplicarBusqueda('') }}
            onSearch={aplicarBusqueda}
            placeholder="Buscar por nombre de insumo..."
          />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <SlidersHorizontal size={14} className="text-h-tertiary" />
          <div className="flex gap-1">
            {(['todos', 'entrada', 'salida', 'interno'] as const).map(f => (
              <button key={f} onClick={() => setFiltro('tipo', f)}
                className={`px-3 py-1 rounded-full text-xs font-bold transition-colors`}
                style={filtros.tipo === f ? {
                  background: 'var(--h-teal-rest)', color: 'white',
                } : {
                  background: 'var(--h-bg-elevated)', color: 'var(--h-text-secondary)',
                }}>
                {f === 'todos' ? 'Todos'
                  : f === 'entrada' ? 'Entradas'
                  : f === 'salida' ? 'Salidas'
                  : 'Internos'}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-h-tertiary font-semibold">Desde</span>
            <input type="date" value={filtros.fecha_desde}
              onChange={e => setFiltro('fecha_desde', e.target.value)} className={dateCls} />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-h-tertiary font-semibold">Hasta</span>
            <input type="date" value={filtros.fecha_hasta}
              onChange={e => setFiltro('fecha_hasta', e.target.value)} className={dateCls} />
          </div>
          {hasFilters && (
            <button onClick={limpiarFiltros}
              className="flex items-center gap-1 text-xs font-bold ml-auto transition-colors"
              style={{ color: 'var(--h-sem-danger-text)' }}>
              <X size={12} /> Limpiar filtros
            </button>
          )}
        </div>
      </div>

      {/* Tabla */}
      <div className="rounded-xl border border-h-subtle overflow-x-auto"
        style={{ background: 'var(--h-bg-surface)' }}>
        <table className="w-full min-w-[780px] text-sm">
          <thead>
            <tr className="border-b border-h-subtle"
              style={{ background: 'var(--h-bg-elevated)' }}>
              {['Tipo / Subtipo', 'Insumo', 'Sala', 'Cantidad', 'Motivo', 'Fecha', 'Usuario']
                .map(col => (
                  <th key={col} className="text-left px-4 py-3 text-[10px] font-semibold
                                           text-h-tertiary uppercase tracking-widest">
                    {col}
                  </th>
                ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 10 }).map((_, i) => <TableRowSkeleton key={i} cols={7} />)
            ) : movimientos.length === 0 ? (
              <tr><td colSpan={7} className="text-center py-16 text-h-secondary">
                <ArrowUpCircle size={32} className="mx-auto mb-2 opacity-30" />
                <p className="font-semibold">Sin movimientos que mostrar</p>
                {hasFilters && (
                  <button onClick={limpiarFiltros}
                    className="text-xs mt-1 font-bold"
                    style={{ color: 'var(--h-teal-hover)' }}>
                    Limpiar filtros
                  </button>
                )}
              </td></tr>
            ) : movimientos.map(m => (
              <tr key={m.id}
                className="border-b border-h-subtle transition-colors"
                style={{}}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--h-bg-elevated)')}
                onMouseLeave={e => (e.currentTarget.style.background = '')}
              >
                <td className="px-4 py-3"><TipoBadge tipo={m.tipo} subtipo={m.subtipo} /></td>
                <td className="px-4 py-3 font-semibold text-h-primary max-w-xs truncate">{m.insumo}</td>
                <td className="px-4 py-3 text-h-secondary whitespace-nowrap">
                  {m.sala ?? <span className="text-h-tertiary">—</span>}
                </td>
                <td className="px-4 py-3 text-center">
                  <span className={`font-bold ${
                    m.tipo === 'entrada' ? 'text-teal-500'
                      : m.tipo === 'salida' ? 'text-amber-500'
                      : 'text-blue-500'
                  }`}>
                    {m.tipo === 'entrada' ? '+' : m.tipo === 'salida' ? '-' : '⇄'}{m.cantidad}
                  </span>
                </td>
                <td className="px-4 py-3 text-h-secondary max-w-xs truncate">
                  {m.motivo ?? <span className="text-h-tertiary">—</span>}
                </td>
                <td className="px-4 py-3 text-h-secondary whitespace-nowrap">{formatFecha(m.fecha)}</td>
                <td className="px-4 py-3 text-h-secondary whitespace-nowrap">{m.usuario}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {!loading && totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-h-subtle">
            <p className="text-xs text-h-tertiary">Pagina {page + 1} de {totalPages}</p>
            <div className="flex gap-1">
              <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
                className="px-3 py-1 text-xs rounded-lg border border-h-subtle text-h-secondary
                           disabled:opacity-40 hover:bg-h-elevated">&#8592;</button>
              <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="px-3 py-1 text-xs rounded-lg border border-h-subtle text-h-secondary
                           disabled:opacity-40 hover:bg-h-elevated">&#8594;</button>
            </div>
          </div>
        )}
      </div>

      {showModal && (
        <Modal title="Registrar movimiento" onClose={() => setShowModal(false)}>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className={labelCls}>Tipo *</label>
              <div className="grid grid-cols-3 gap-2">
                {(['entrada', 'salida', 'interno'] as TipoMovimiento[]).map(t => (
                  <button key={t} type="button" onClick={() => setTipo(t)}
                    className={`py-2.5 rounded-xl border-2 font-bold text-sm
                                flex items-center justify-center gap-1.5 transition-all ${
                      tipo === t
                        ? t === 'entrada'
                          ? 'border-teal-500 text-white'
                          : t === 'salida'
                            ? 'border-amber-500 text-white'
                            : 'border-blue-500 text-white'
                        : 'border-h-subtle text-h-secondary hover:border-h-visible'
                    }`}
                    style={tipo === t ? {
                      background: t === 'entrada' ? 'var(--h-teal-rest)'
                        : t === 'salida' ? '#d97706' : '#3b82f6',
                    } : {}}>
                    {t === 'entrada' ? <ArrowUpCircle size={14} />
                      : t === 'salida' ? <ArrowDownCircle size={14} />
                      : <ArrowRightLeft size={14} />}
                    {t.charAt(0).toUpperCase() + t.slice(1)}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className={labelCls}>Subtipo *</label>
              <select required value={subtipo}
                onChange={e => setSubtipo(e.target.value as SubtipoMovimiento)}
                className={inputCls}>
                {SUBTIPOS_MAP[tipo].map(s => (
                  <option key={s} value={s}>{ETIQUETA_SUBTIPO[s]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Insumo *</label>
              <select required value={insumoId}
                onChange={e => setInsumoId(e.target.value)} className={inputCls}>
                <option value="">Seleccionar insumo...</option>
                {insumos.map(i => (
                  <option key={i.id} value={i.id}>
                    {i.nombre} (stock: {i.stock_actual})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Cantidad *</label>
              <input type="number" min="1" required value={cantidad}
                onChange={e => setCantidad(e.target.value)} className={inputCls} placeholder="0" />
            </div>
            <div>
              <label className={labelCls}>Motivo</label>
              <input type="text" value={motivo} onChange={e => setMotivo(e.target.value)}
                className={inputCls}
                placeholder="Ej: Reposicion mensual, Uso en practica clinica..." />
            </div>
            {formError && (
              <p className="text-xs px-3 py-2 rounded-lg font-medium"
                style={{
                  background: 'var(--h-sem-danger-bg)',
                  color: 'var(--h-sem-danger-text)',
                  border: '1px solid var(--h-sem-danger-border)',
                }}>{formError}</p>
            )}
            <div className="flex gap-3 pt-2">
              <button type="button" onClick={() => setShowModal(false)}
                className="flex-1 py-2.5 rounded-xl border border-h-subtle
                           text-h-secondary font-bold hover:bg-h-elevated">Cancelar</button>
              <button type="submit" disabled={saving || !insumoId || !cantidad}
                className="flex-1 py-2.5 rounded-xl text-white font-bold
                           disabled:opacity-50 transition-colors"
                style={{ background: 'var(--h-teal-rest)' }}
                onMouseEnter={e => { if (!saving) (e.currentTarget.style.background = 'var(--h-teal-hover)') }}
                onMouseLeave={e => { (e.currentTarget.style.background = 'var(--h-teal-rest)') }}>
                {saving ? 'Registrando...' : 'Registrar'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
