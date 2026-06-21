import { useEffect, useState, useCallback, useRef } from 'react'
import {
  Package, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight,
  Plus, Pencil, Archive, ArchiveRestore, CheckCircle, ShieldAlert,
  Download, FileText, X, SlidersHorizontal, Camera, Layers
} from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import { useAuthStore } from '../store/auth'
import type {
  InsumoResponse, CategoriaResponse, PaginatedResponse
} from '../types/api'
import { Badge } from '../components/ui/Badge'
import { TableRowSkeleton } from '../components/ui/Skeleton'
import { Modal } from '../components/ui/Modal'
import { SearchWithSuggestions } from '../components/ui/SearchSuggestions'
import { BarcodeScanner } from '../components/ui/BarcodeScanner'
import { HSelect } from '../components/ui/HSelect'

const PAGE_SIZE = 15

interface FormState {
  nombre: string; descripcion: string
  stock_actual: string; stock_minimo: string
  categoria_id: string
  tipo: string; sku: string; codigo_barras: string
  costo_unitario: string; fecha_vencimiento: string
  unidad_medida: string
}
const FORM_VACIO: FormState = {
  nombre: '', descripcion: '', stock_actual: '',
  stock_minimo: '', categoria_id: '',
  tipo: 'insumo', sku: '', codigo_barras: '',
  costo_unitario: '', fecha_vencimiento: '',
  unidad_medida: ''
}
function insumoAForm(i: InsumoResponse): FormState {
  return {
    nombre: i.nombre, descripcion: i.descripcion ?? '',
    stock_actual: String(i.stock_actual), stock_minimo: String(i.stock_minimo),
    categoria_id: i.categoria_id != null ? String(i.categoria_id) : '',
    tipo: i.tipo ?? 'insumo',
    sku: i.sku ?? '',
    codigo_barras: i.codigo_barras ?? '',
    costo_unitario: i.costo_unitario != null ? String(i.costo_unitario) : '',
    fecha_vencimiento: i.fecha_vencimiento ?? '',
    unidad_medida: i.unidad_medida ?? ''
  }
}

// Paginador con numeros

interface PaginatorProps {
  page:       number
  totalPages: number
  onPage:     (p: number) => void
}

function Paginator({ page, totalPages, onPage }: PaginatorProps) {
  if (totalPages <= 1) return null

  function pages(): (number | '...')[] {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i)
    const result: (number | '...')[] = []
    const left  = Math.max(1, page - 2)
    const right = Math.min(totalPages - 2, page + 2)
    result.push(0)
    if (left > 1) result.push('...')
    for (let i = left; i <= right; i++) result.push(i)
    if (right < totalPages - 2) result.push('...')
    result.push(totalPages - 1)
    return result
  }

  const btnBase = `
    min-w-[32px] h-8 flex items-center justify-center rounded-md text-xs font-medium
    transition-colors duration-150 border
  `
  const btnActive = `bg-h-highlight border-h-visible text-h-primary`
  const btnNormal = `bg-transparent border-transparent text-h-secondary
                     hover:bg-h-elevated hover:text-h-primary`
  const btnNav    = `bg-h-elevated border-h-subtle text-h-secondary
                     hover:bg-h-highlight hover:text-h-primary
                     disabled:opacity-30 disabled:cursor-not-allowed`

  return (
    <div className="flex items-center gap-1">
      <button
        onClick={() => onPage(0)} disabled={page === 0}
        className={`${btnBase} ${btnNav} px-1.5`} title="Primera pagina">
        <ChevronsLeft size={13} />
      </button>
      <button
        onClick={() => onPage(Math.max(0, page - 10))} disabled={page === 0}
        className={`${btnBase} ${btnNav} px-1.5`} title="Retroceder 10 paginas">
        <ChevronLeft size={13} />
        <span className="text-[10px] ml-0.5">10</span>
      </button>
      <button
        onClick={() => onPage(page - 1)} disabled={page === 0}
        className={`${btnBase} ${btnNav} px-1.5`} title="Pagina anterior">
        <ChevronLeft size={13} />
      </button>
      {pages().map((p, idx) =>
        p === '...'
          ? <span key={`e${idx}`} className="text-h-tertiary text-xs px-1">...</span>
          : (
            <button
              key={p} onClick={() => onPage(p as number)}
              className={`${btnBase} px-2 ${p === page ? btnActive : btnNormal}`}>
              {(p as number) + 1}
            </button>
          )
      )}
      <button
        onClick={() => onPage(page + 1)} disabled={page >= totalPages - 1}
        className={`${btnBase} ${btnNav} px-1.5`} title="Pagina siguiente">
        <ChevronRight size={13} />
      </button>
      <button
        onClick={() => onPage(Math.min(totalPages - 1, page + 10))}
        disabled={page >= totalPages - 1}
        className={`${btnBase} ${btnNav} px-1.5`} title="Avanzar 10 paginas">
        <span className="text-[10px] mr-0.5">10</span>
        <ChevronRight size={13} />
      </button>
      <button
        onClick={() => onPage(totalPages - 1)} disabled={page >= totalPages - 1}
        className={`${btnBase} ${btnNav} px-1.5`} title="Ultima pagina">
        <ChevronsRight size={13} />
      </button>
    </div>
  )
}

// Mini barra de stock

function StockBar({ actual, minimo }: { actual: number; minimo: number }) {
  if (minimo === 0) {
    return (
      <div className="mt-1 h-[2px] w-full rounded-full"
        style={{ background: 'var(--h-teal-hover)' }} />
    )
  }
  const pct   = Math.min(100, (actual / (minimo * 2)) * 100)
  const color = actual === 0
    ? 'var(--h-sem-danger-border)'
    : actual <= minimo
      ? '#EF9F27'
      : 'var(--h-teal-hover)'
  return (
    <div className="mt-1 h-[2px] w-full rounded-full bg-h-elevated overflow-hidden">
      <div className="h-full rounded-full transition-all duration-500"
        style={{ width: `${pct}%`, background: color }} />
    </div>
  )
}

// Pagina principal

export function Insumos() {
  const { user } = useAuthStore()
  const navigate = useNavigate()
  const puedeEscribir = user?.rol === 'admin' || user?.rol === 'operador'
    || user?.rol === 'operador_coordinador'
  const puedeEliminar = user?.rol === 'admin'

  const [insumos, setInsumos]       = useState<InsumoResponse[]>([])
  const [total, setTotal]           = useState(0)
  const [page, setPage]             = useState(0)
  const [loading, setLoading]       = useState(true)
  const [categorias, setCategorias] = useState<CategoriaResponse[]>([])
  const [userHas2FA, setUserHas2FA] = useState<boolean | null>(null)

  const [searchInput, setSearchInput]   = useState('')
  const [nombreFiltro, setNombreFiltro] = useState('')
  const [catFiltro, setCatFiltro]       = useState('')
  const [tipoFiltro, setTipoFiltro]     = useState('')
  const [bajoStock, setBajoStock]       = useState(false)
  const [mostrarInactivos, setMostrar]  = useState(false)
  const hasFilters = nombreFiltro || catFiltro || bajoStock || mostrarInactivos || tipoFiltro

  const [editTarget, setEditTarget]     = useState<InsumoResponse | null>(null)
  const [showCrear, setShowCrear]       = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<InsumoResponse | null>(null)
  const [reactivarTarget, setReactivar] = useState<InsumoResponse | null>(null)
  const [deleteStep, setDeleteStep]     = useState<'confirm' | 'totp'>('confirm')
  const [deleteTotp, setDeleteTotp]     = useState('')
  const [form, setForm]                 = useState<FormState>(FORM_VACIO)
  const [saving, setSaving]             = useState(false)
  const [formError, setFormError]       = useState<string | null>(null)
  const [deleting, setDeleting]         = useState(false)
  const [toast, setToast]               = useState<string | null>(null)
  const [exporting, setExporting]       = useState(false)
  const [showExportMenu, setShowExportMenu] = useState(false)
  const [showScanner, setShowScanner]   = useState(false)

  const [hoveredId, setHoveredId] = useState<number | null>(null)
  const exportRef                 = useRef<HTMLDivElement>(null)
  const mainRef                   = useRef<HTMLDivElement>(null)

  function showToast(msg: string) {
    setToast(msg); setTimeout(() => setToast(null), 3000)
  }

  function goToPage(p: number) {
    setPage(p)
    setHoveredId(null)
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior })
  }

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) {
        setShowExportMenu(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  useEffect(() => {
    Promise.all([
      api.get<PaginatedResponse<CategoriaResponse>>('/categorias/', { params: { limit: 200 } }),
      api.get<{ totp_habilitado: boolean }>('/usuarios/me')
    ]).then(([c, me]) => {
      setCategorias(c.data.data)
      setUserHas2FA(me.data.totp_habilitado)
    })
  }, [])

  const load = useCallback(async (
    skip: number, nombre: string,
    categoria_id: string, bajo_stock: boolean, incluir_inactivos: boolean,
    tipo: string
  ) => {
    setLoading(true)
    try {
      const params: Record<string, string | number | boolean> = { skip, limit: PAGE_SIZE }
      if (nombre) params.nombre = nombre
      if (categoria_id) params.categoria_id = parseInt(categoria_id)
      if (bajo_stock) params.bajo_stock = true
      if (incluir_inactivos) params.incluir_inactivos = true
      if (tipo) params.tipo = tipo
      const { data } = await api.get<PaginatedResponse<InsumoResponse>>('/insumos/', { params })
      setInsumos(data.data); setTotal(data.total)
    } finally { setLoading(false) }
  }, [])

  useEffect(() => {
    load(page * PAGE_SIZE, nombreFiltro, catFiltro, bajoStock, mostrarInactivos, tipoFiltro)
  }, [page, nombreFiltro, catFiltro, bajoStock, mostrarInactivos, tipoFiltro, load])

  function aplicarBusqueda(val: string) { setNombreFiltro(val); goToPage(0) }

  function limpiarFiltros() {
    setSearchInput(''); setNombreFiltro('')
    setCatFiltro(''); setBajoStock(false); setMostrar(false)
    setTipoFiltro(''); goToPage(0)
  }

  async function handleExportar(formato: 'csv' | 'xlsx') {
    setExporting(true); setShowExportMenu(false)
    try {
      const params: Record<string, string | number | boolean> = { formato }
      if (nombreFiltro) params.nombre = nombreFiltro
      if (catFiltro)    params.categoria_id = parseInt(catFiltro)
      if (bajoStock)    params.bajo_stock = true
      if (mostrarInactivos) params.incluir_inactivos = true
      if (tipoFiltro)   params.tipo = tipoFiltro
      const res = await api.get('/insumos/exportar', { params, responseType: 'blob' })
      const ext  = formato === 'xlsx' ? 'xlsx' : 'csv'
      const mime = formato === 'xlsx'
        ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        : 'text/csv'
      const url = URL.createObjectURL(new Blob([res.data], { type: mime }))
      const a   = document.createElement('a')
      a.href = url; a.download = `inventario_hestia.${ext}`; a.click()
      URL.revokeObjectURL(url)
      showToast(`Exportado como ${ext.toUpperCase()}`)
    } finally { setExporting(false) }
  }

  function abrirCrear() { setForm(FORM_VACIO); setFormError(null); setShowCrear(true) }
  function abrirEditar(i: InsumoResponse) {
    setForm(insumoAForm(i)); setFormError(null); setEditTarget(i)
  }
  function abrirEliminar(i: InsumoResponse) {
    setDeleteTarget(i); setDeleteStep('confirm'); setDeleteTotp(''); setFormError(null)
  }
  function abrirReactivar(i: InsumoResponse) { setReactivar(i); setFormError(null) }
  function cerrarModal() {
    setShowCrear(false); setEditTarget(null); setDeleteTarget(null); setReactivar(null)
    setFormError(null); setDeleteTotp(''); setShowScanner(false)
  }
  function setField(k: keyof FormState, v: string) { setForm(f => ({ ...f, [k]: v })) }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setSaving(true); setFormError(null)
    const payload = {
      nombre: form.nombre.trim(), descripcion: form.descripcion.trim() || null,
      stock_actual: parseInt(form.stock_actual) || 0,
      stock_minimo: parseInt(form.stock_minimo) || 0,
      categoria_id: form.categoria_id ? parseInt(form.categoria_id) : null,
      tipo: form.tipo, sku: form.sku.trim() || null,
      codigo_barras: form.codigo_barras.trim() || null,
      costo_unitario: form.costo_unitario ? parseFloat(form.costo_unitario) : null,
      fecha_vencimiento: form.fecha_vencimiento || null,
      unidad_medida: form.unidad_medida.trim() || null,
    }
    try {
      if (editTarget) {
        await api.put(`/insumos/${editTarget.id}`, payload); showToast('Insumo actualizado')
      } else {
        await api.post('/insumos/', payload); showToast('Insumo creado')
      }
      cerrarModal()
      load(page * PAGE_SIZE, nombreFiltro, catFiltro, bajoStock, mostrarInactivos, tipoFiltro)
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
      setFormError(msg ?? 'Error al guardar.')
    } finally { setSaving(false) }
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await api.delete(`/insumos/${deleteTarget.id}`, {
        headers: { 'x-totp-code': deleteTotp },
      })
      showToast(`'${deleteTarget.nombre}' desactivado`); cerrarModal()
      load(page * PAGE_SIZE, nombreFiltro, catFiltro, bajoStock, mostrarInactivos, tipoFiltro)
    } catch (err: unknown) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const detail = (err as any)?.response?.data?.detail
      setFormError(typeof detail === 'string' ? detail : 'Error al desactivar.')
    } finally { setDeleting(false) }
  }

  async function handleReactivar() {
    if (!reactivarTarget) return
    setDeleting(true)
    try {
      await api.put(`/insumos/${reactivarTarget.id}`, { activo: true })
      showToast(`'${reactivarTarget.nombre}' reactivado`); cerrarModal()
      load(page * PAGE_SIZE, nombreFiltro, catFiltro, bajoStock, mostrarInactivos, tipoFiltro)
    } catch (err: unknown) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const detail = (err as any)?.response?.data?.detail
      setFormError(typeof detail === 'string' ? detail : 'Error al reactivar.')
    } finally { setDeleting(false) }
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const showModal  = showCrear || editTarget !== null

  function stockBadge(i: InsumoResponse) {
    if (i.stock_actual === 0) return <Badge variant="danger">Agotado</Badge>
    if (i.stock_actual <= i.stock_minimo) return <Badge variant="warning">Bajo stock</Badge>
    return <Badge variant="success">OK</Badge>
  }

  // Opciones para HSelect de filtros
  const catOpts = categorias.map(c => ({ value: String(c.id), label: c.nombre }))
  const tipoOpts = [
    { value: 'insumo',      label: 'Insumos desechables' },
    { value: 'implemento',  label: 'Implementos retornables' },
  ]
  // Opciones para HSelect de categoria en formulario
  const catFormOpts = categorias.map(c => ({ value: String(c.id), label: c.nombre }))

  const inputCls = `w-full px-3 py-2.5 rounded-lg text-h-primary text-sm
    focus:outline-none transition-all bg-h-elevated border border-h-visible
    focus:border-h-strong placeholder:text-h-tertiary`
  const labelCls = `block text-[10px] font-semibold text-h-tertiary
    uppercase tracking-widest mb-1.5`

  return (
    <div ref={mainRef} className="p-8 w-full">

      {/* Toast */}
      {toast && (
        <div className="fixed top-6 right-6 z-50 flex items-center gap-2 px-4 py-3
                        rounded-xl shadow-lg text-sm font-semibold text-white"
          style={{ background: 'var(--h-teal-rest)' }}>
          <CheckCircle size={16} />{toast}
        </div>
      )}

      {showScanner && (
        <BarcodeScanner
          onScan={(barcode) => { setField('codigo_barras', barcode); setShowScanner(false) }}
          onClose={() => setShowScanner(false)}
        />
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-h-primary flex items-center gap-2">
            <Package size={22} className="text-h-accent" />
            Insumos e Implementos</h1>
          <p className="text-h-secondary text-sm mt-0.5">
            {loading ? '...' : `${total} items`}{hasFilters && ' (filtrado)'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {puedeEscribir && (
            <div className="relative" ref={exportRef}>
              <button
                onClick={() => setShowExportMenu(v => !v)} disabled={exporting}
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium
                           transition-colors duration-150 disabled:opacity-50
                           text-h-secondary bg-h-elevated border border-h-subtle
                           hover:bg-h-highlight hover:text-h-primary">
                <Download size={14} />{exporting ? 'Exportando...' : 'Exportar'}
              </button>
              {showExportMenu && (
                <div className="absolute right-0 top-full mt-1 bg-h-surface border border-h-subtle
                                rounded-xl shadow-lg z-20 overflow-hidden min-w-36">
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
          )}
          {puedeEscribir && (
            <button onClick={abrirCrear}
              className="flex items-center gap-2 text-white font-semibold
                         px-4 py-2.5 rounded-xl text-sm transition-colors duration-150"
              style={{ background: 'var(--h-teal-rest)' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--h-teal-hover)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'var(--h-teal-rest)')}>
              <Plus size={16} /> Nuevo item
            </button>
          )}
        </div>
      </div>

      {/* Toolbar */}
      <div className="bg-h-surface rounded-xl border border-h-subtle p-4 mb-4">
        <div className="flex gap-2 mb-3">
          <SearchWithSuggestions
            value={searchInput}
            onChange={val => { setSearchInput(val); if (!val) aplicarBusqueda('') }}
            onSearch={aplicarBusqueda}
            placeholder="Buscar por nombre..."
          />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <SlidersHorizontal size={14} className="text-h-tertiary" />

          {/* Filtro categoria con HSelect */}
          <HSelect
            value={catFiltro}
            onChange={v => { setCatFiltro(v); goToPage(0) }}
            options={catOpts}
            placeholder="Todas las categorias"
            size="sm"
            className="flex-1 min-w-36"
          />

          {/* Filtro tipo con HSelect */}
          <HSelect
            value={tipoFiltro}
            onChange={v => { setTipoFiltro(v); goToPage(0) }}
            options={tipoOpts}
            placeholder="Todos los tipos"
            size="sm"
            className="flex-1 min-w-36"
          />

          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input type="checkbox" checked={bajoStock}
              onChange={e => { setBajoStock(e.target.checked); goToPage(0) }}
              className="w-4 h-4 rounded" style={{ accentColor: 'var(--h-teal-hover)' }} />
            <span className="text-sm font-medium text-h-secondary">Bajo stock</span>
          </label>
          {puedeEliminar && (
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input type="checkbox" checked={mostrarInactivos}
                onChange={e => { setMostrar(e.target.checked); goToPage(0) }}
                className="w-4 h-4 rounded" style={{ accentColor: 'var(--h-teal-hover)' }} />
              <span className="text-sm font-medium text-h-secondary">Mostrar inactivos</span>
            </label>
          )}
          {hasFilters && (
            <button onClick={limpiarFiltros}
              className="flex items-center gap-1 text-xs font-semibold ml-auto
                         transition-colors duration-150"
              style={{ color: 'var(--h-sem-danger-text)' }}>
              <X size={12} /> Limpiar filtros
            </button>
          )}
        </div>
      </div>

      {/* Tabla */}
      <div className="bg-h-surface rounded-xl border border-h-subtle overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-h-subtle bg-h-elevated">
              <th className="text-left px-4 py-3 text-[10px] font-semibold
                             text-h-tertiary uppercase tracking-widest">Nombre</th>
              <th className="text-right px-4 py-3 text-[10px] font-semibold
                             text-h-tertiary uppercase tracking-widest">Stock</th>
              <th className="text-right px-4 py-3 text-[10px] font-semibold
                             text-h-tertiary uppercase tracking-widest">Minimo</th>
              <th className="text-center px-4 py-3 text-[10px] font-semibold
                             text-h-tertiary uppercase tracking-widest">Estado</th>
              {puedeEscribir && <th className="w-10 px-4 py-3" aria-label="Acciones" />}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: PAGE_SIZE }).map((_, idx) => (
                <TableRowSkeleton key={idx} cols={puedeEscribir ? 5 : 4} />
              ))
            ) : insumos.length === 0 ? (
              <tr>
                <td colSpan={puedeEscribir ? 5 : 4}
                  className="text-center py-16 text-h-tertiary">
                  <Package size={32} className="mx-auto mb-2 opacity-30" />
                  <p className="font-medium">Sin items que mostrar</p>
                  {hasFilters && (
                    <button onClick={limpiarFiltros}
                      className="text-xs mt-1 font-semibold"
                      style={{ color: 'var(--h-teal-hover)' }}>
                      Limpiar filtros
                    </button>
                  )}
                </td>
              </tr>
            ) : insumos.map(i => {
              const isHovered = hoveredId === i.id
              return (
                <tr key={i.id}
                  onMouseEnter={() => setHoveredId(i.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  className={`
                    border-b border-h-subtle last:border-0 relative
                    transition-colors duration-150
                    ${isHovered ? 'bg-h-elevated' : ''}
                    ${!i.activo ? 'opacity-50' : ''}
                  `}
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-h-primary">{i.nombre}</span>
                      {!i.activo && <Badge variant="danger">Inactivo</Badge>}
                      {i.tipo === 'implemento' && <Badge variant="info">Implemento</Badge>}
                    </div>
                    <div className="text-[11px] text-h-tertiary font-mono mt-0.5">
                      {[i.sku, i.unidad_medida].filter(Boolean).join(' · ') || ''}
                    </div>
                  </td>

                  <td className="px-4 py-3 text-right">
                    <span className="text-sm font-bold" style={{
                      color: i.stock_actual === 0
                        ? 'var(--h-sem-danger-text)'
                        : i.stock_actual <= i.stock_minimo
                          ? 'var(--h-sem-warning-text)'
                          : 'var(--h-text-primary)',
                    }}>
                      {i.stock_actual}
                    </span>
                    <StockBar actual={i.stock_actual} minimo={i.stock_minimo} />
                  </td>

                  <td className="px-4 py-3 text-right text-h-tertiary text-sm">
                    {i.stock_minimo}
                  </td>

                  <td className="px-4 py-3 text-center">{stockBadge(i)}</td>

                  {puedeEscribir && (
                    <td className="px-3 py-3 w-10">
                      <div className="flex items-center justify-end gap-1
                                      transition-opacity duration-150"
                        style={{ opacity: isHovered ? 1 : 0 }}>
                        {i.tipo === 'implemento' && i.activo && (
                          <button
                            onClick={() => navigate(`/insumos/${i.id}/unidades`)}
                            title="Ver unidades fisicas"
                            className="p-1.5 rounded-md text-h-tertiary
                                       transition-colors duration-150
                                       hover:bg-h-highlight hover:text-h-secondary">
                            <Layers size={14} />
                          </button>
                        )}
                        {i.activo ? (
                          <>
                            <button onClick={() => abrirEditar(i)} title="Editar"
                              className="p-1.5 rounded-md text-h-tertiary
                                         transition-colors duration-150
                                         hover:bg-h-highlight hover:text-h-secondary">
                              <Pencil size={14} />
                            </button>
                            {puedeEliminar && (
                              <button onClick={() => abrirEliminar(i)} title="Desactivar"
                                className="p-1.5 rounded-md transition-colors duration-150"
                                style={{ color: 'var(--h-text-tertiary)' }}
                                onMouseEnter={e => {
                                  const b = e.currentTarget as HTMLButtonElement
                                  b.style.background = 'var(--h-sem-danger-bg)'
                                  b.style.color = 'var(--h-sem-danger-text)'
                                }}
                                onMouseLeave={e => {
                                  const b = e.currentTarget as HTMLButtonElement
                                  b.style.background = ''
                                  b.style.color = 'var(--h-text-tertiary)'
                                }}>
                                <Archive size={14} />
                              </button>
                            )}
                          </>
                        ) : (
                          puedeEliminar && (
                            <button onClick={() => abrirReactivar(i)} title="Reactivar"
                              className="flex items-center gap-1 px-2 py-1 rounded-md
                                         text-xs font-medium transition-colors duration-150"
                              style={{
                                background: 'var(--h-sem-success-bg)',
                                color: 'var(--h-sem-success-text)',
                              }}>
                              <ArchiveRestore size={12} /> Reactivar
                            </button>
                          )
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>

        {!loading && totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3
                          border-t border-h-subtle">
            <p className="text-xs text-h-tertiary">
              Pagina {page + 1} de {totalPages} - {total} items en total
            </p>
            <Paginator page={page} totalPages={totalPages} onPage={goToPage} />
          </div>
        )}
      </div>

      {/* Modal crear/editar */}
      {showModal && (
        <Modal
          title={editTarget ? 'Editar item' : 'Nuevo insumo o implemento'}
          onClose={cerrarModal} size="lg">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className={labelCls}>Tipo de item *</label>
              <div className="flex rounded-xl border border-h-subtle overflow-hidden">
                <button type="button" onClick={() => setField('tipo', 'insumo')}
                  className={`flex-1 py-2.5 text-sm font-semibold transition-colors ${
                    form.tipo === 'insumo' ? 'text-white' : 'text-h-secondary hover:bg-h-elevated'
                  }`}
                  style={form.tipo === 'insumo' ? { background: 'var(--h-teal-rest)' } : {}}>
                  Insumo desechable
                </button>
                <button type="button" onClick={() => setField('tipo', 'implemento')}
                  className={`flex-1 py-2.5 text-sm font-semibold border-l border-h-subtle
                               transition-colors ${
                    form.tipo === 'implemento' ? 'text-white' : 'text-h-secondary hover:bg-h-elevated'
                  }`}
                  style={form.tipo === 'implemento'
                    ? { background: 'var(--h-teal-rest)', borderColor: 'var(--h-teal-rest)' }
                    : {}}>
                  Implemento retornable
                </button>
              </div>
              <p className="text-xs text-h-tertiary mt-1">
                {form.tipo === 'insumo'
                  ? 'Se consume durante la clase y se descuenta del stock en bodega'
                  : 'Puede asignarse a salas clinicas; sus unidades fisicas se rastrean individualmente'}
              </p>
            </div>

            <div>
              <label className={labelCls}>Nombre *</label>
              <input type="text" required value={form.nombre}
                onChange={e => setField('nombre', e.target.value)}
                className={inputCls} placeholder="Ej: Guantes de nitrilo talla M" />
            </div>

            <div>
              <label className={labelCls}>Unidad de medida</label>
              <input type="text" value={form.unidad_medida}
                onChange={e => setField('unidad_medida', e.target.value)}
                className={inputCls}
                placeholder="Ej: caja x100, frasco 500 mL, unidad, par, rollo 5 m" />
              <p className="text-xs text-h-tertiary mt-1">
                Para liquidos y reactivos, indica el volumen del envase (ej: "frasco 500 mL").
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>SKU</label>
                <input type="text" value={form.sku}
                  onChange={e => setField('sku', e.target.value)}
                  className={inputCls} placeholder="Auto-generado si se deja vacio" />
              </div>
              <div>
                <label className={labelCls}>Codigo de barras</label>
                <div className="flex gap-2">
                  <input type="text" value={form.codigo_barras}
                    onChange={e => setField('codigo_barras', e.target.value)}
                    className={`${inputCls} flex-1`} placeholder="Escanear o escribir" />
                  <button type="button" onClick={() => setShowScanner(true)}
                    className="flex-shrink-0 px-3 rounded-lg border border-h-subtle
                               bg-h-elevated text-h-tertiary transition-colors duration-150
                               hover:border-h-visible hover:text-h-secondary"
                    title="Escanear con camara">
                    <Camera size={16} />
                  </button>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Stock actual *</label>
                <input type="number" min="0" required value={form.stock_actual}
                  onChange={e => setField('stock_actual', e.target.value)}
                  className={inputCls} />
                <p className="text-xs text-h-tertiary mt-1">Total de unidades en bodega y salas.</p>
              </div>
              <div>
                <label className={labelCls}>Stock minimo *</label>
                <input type="number" min="0" required value={form.stock_minimo}
                  onChange={e => setField('stock_minimo', e.target.value)}
                  className={inputCls} />
              </div>
            </div>

            <div>
              <label className={labelCls}>Fecha de vencimiento</label>
              <input type="date" value={form.fecha_vencimiento}
                onChange={e => setField('fecha_vencimiento', e.target.value)}
                className={inputCls} />
              <p className="text-xs text-h-tertiary mt-1">
                Util para reactivos, insumos de enfermeria y banco de sangre.
              </p>
            </div>

            {/* Categoria con HSelect */}
            <div>
              <label className={labelCls}>Categoria</label>
              <HSelect
                value={form.categoria_id}
                onChange={v => setField('categoria_id', v)}
                options={catFormOpts}
                placeholder="Sin categoria"
                className="w-full"
              />
            </div>

            <div>
              <label className={labelCls}>Descripcion</label>
              <input type="text" value={form.descripcion}
                onChange={e => setField('descripcion', e.target.value)}
                className={inputCls} placeholder="Opcional" />
            </div>

            {formError && (
              <p className="text-xs px-3 py-2 rounded-lg font-medium" style={{
                background: 'var(--h-sem-danger-bg)',
                color: 'var(--h-sem-danger-text)',
                border: '1px solid var(--h-sem-danger-border)',
              }}>{formError}</p>
            )}
            <div className="flex gap-3 pt-2">
              <button type="button" onClick={cerrarModal}
                className="flex-1 py-2.5 rounded-xl border border-h-subtle
                           text-h-secondary font-medium hover:bg-h-elevated
                           transition-colors duration-150">Cancelar</button>
              <button type="submit" disabled={saving}
                className="flex-1 py-2.5 rounded-xl text-white font-semibold
                           disabled:opacity-50 transition-colors duration-150"
                style={{ background: 'var(--h-teal-rest)' }}
                onMouseEnter={e => { if (!saving) (e.currentTarget.style.background = 'var(--h-teal-hover)') }}
                onMouseLeave={e => { (e.currentTarget.style.background = 'var(--h-teal-rest)') }}>
                {saving ? 'Guardando...' : editTarget ? 'Guardar cambios' : 'Crear'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Modal desactivar */}
      {deleteTarget && (
        <Modal title="Desactivar item" onClose={cerrarModal} size="sm">
          {deleteStep === 'confirm' ? (
            <div className="text-center">
              <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4"
                style={{ background: 'var(--h-sem-danger-bg)' }}>
                <Archive size={24} style={{ color: 'var(--h-sem-danger-text)' }} />
              </div>
              <p className="font-semibold text-h-primary mb-1">Desactivar este item?</p>
              <p className="text-h-secondary text-sm mb-3">
                <strong>{deleteTarget.nombre}</strong> desaparecera de los listados
                y no se le podran registrar movimientos. Su historial se conserva
                y puede reactivarse cuando quieras.
              </p>
              {userHas2FA === false ? (
                <div className="rounded-xl p-4 text-left border" style={{
                  background: 'var(--h-sem-warning-bg)',
                  borderColor: 'var(--h-sem-warning-border)',
                }}>
                  <div className="flex items-start gap-2">
                    <ShieldAlert size={16} className="mt-0.5 flex-shrink-0"
                      style={{ color: 'var(--h-sem-warning-text)' }} />
                    <div>
                      <p className="font-bold text-xs"
                        style={{ color: 'var(--h-sem-warning-text)' }}>2FA requerido</p>
                      <p className="text-xs mt-0.5"
                        style={{ color: 'var(--h-sem-warning-text)' }}>
                        Activa la verificacion en dos pasos para desactivar items.
                      </p>
                    </div>
                  </div>
                  <Link to="/seguridad" onClick={cerrarModal}
                    className="mt-3 flex items-center justify-center gap-1.5
                               text-white text-xs font-semibold py-2 rounded-lg transition-colors"
                    style={{ background: 'var(--h-teal-rest)' }}>
                    Activar 2FA ahora
                  </Link>
                </div>
              ) : (
                <>
                  <p className="text-h-tertiary text-xs mb-5">
                    Necesitaras tu codigo TOTP para confirmar.
                  </p>
                  <div className="flex gap-3">
                    <button onClick={cerrarModal}
                      className="flex-1 py-2.5 rounded-xl border border-h-subtle
                                 text-h-secondary font-medium hover:bg-h-elevated
                                 transition-colors">Cancelar</button>
                    <button onClick={() => setDeleteStep('totp')}
                      className="flex-1 py-2.5 rounded-xl text-white font-semibold transition-colors"
                      style={{ background: 'var(--h-sem-danger-border)' }}>
                      Continuar
                    </button>
                  </div>
                </>
              )}
            </div>
          ) : (
            <div>
              <p className="text-h-secondary text-sm mb-5 text-center">
                Ingresa tu codigo TOTP para confirmar la desactivacion de
                <strong> {deleteTarget.nombre}</strong>.
              </p>
              <input type="text" inputMode="numeric" maxLength={6} value={deleteTotp}
                onChange={e => { setDeleteTotp(e.target.value.replace(/\D/g, '')); setFormError(null) }}
                className="w-full px-4 py-4 rounded-xl text-h-primary text-4xl text-center
                           font-black tracking-[0.7em] focus:outline-none bg-h-elevated
                           border border-h-visible focus:border-h-strong mb-4
                           placeholder:text-h-tertiary transition-all"
                placeholder="000000" autoFocus />
              {formError && (
                <p className="text-xs px-3 py-2 rounded-lg font-medium mb-4" style={{
                  background: 'var(--h-sem-danger-bg)',
                  color: 'var(--h-sem-danger-text)',
                  border: '1px solid var(--h-sem-danger-border)',
                }}>{formError}</p>
              )}
              <div className="flex gap-3">
                <button onClick={() => { setDeleteStep('confirm'); setFormError(null) }}
                  className="flex-1 py-2.5 rounded-xl border border-h-subtle
                             text-h-secondary font-medium hover:bg-h-elevated
                             transition-colors">Volver</button>
                <button onClick={confirmDelete} disabled={deleting || deleteTotp.length !== 6}
                  className="flex-1 py-2.5 rounded-xl text-white font-semibold
                             disabled:opacity-50 transition-colors"
                  style={{ background: 'var(--h-sem-danger-border)' }}>
                  {deleting ? 'Desactivando...' : 'Desactivar'}
                </button>
              </div>
            </div>
          )}
        </Modal>
      )}

      {/* Modal reactivar */}
      {reactivarTarget && (
        <Modal title="Reactivar item" onClose={cerrarModal} size="sm">
          <div className="text-center">
            <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4"
              style={{ background: 'var(--h-sem-success-bg)' }}>
              <ArchiveRestore size={24} style={{ color: 'var(--h-sem-success-text)' }} />
            </div>
            <p className="font-semibold text-h-primary mb-1">Reactivar este item?</p>
            <p className="text-h-secondary text-sm mb-5">
              <strong>{reactivarTarget.nombre}</strong> volvera a aparecer en
              los listados y podra recibir movimientos de stock.
            </p>
            {formError && (
              <p className="text-xs px-3 py-2 rounded-lg mb-4" style={{
                background: 'var(--h-sem-danger-bg)',
                color: 'var(--h-sem-danger-text)',
                border: '1px solid var(--h-sem-danger-border)',
              }}>{formError}</p>
            )}
            <div className="flex gap-3">
              <button onClick={cerrarModal}
                className="flex-1 py-2.5 rounded-xl border border-h-subtle
                           text-h-secondary font-medium hover:bg-h-elevated
                           transition-colors">Cancelar</button>
              <button onClick={handleReactivar} disabled={deleting}
                className="flex-1 py-2.5 rounded-xl text-white font-semibold
                           disabled:opacity-50 transition-colors"
                style={{ background: 'var(--h-sem-success-border)' }}>
                {deleting ? 'Reactivando...' : 'Reactivar'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
