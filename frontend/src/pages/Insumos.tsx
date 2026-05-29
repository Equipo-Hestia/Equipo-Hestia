import { useEffect, useState, useCallback, useRef } from 'react'
import {
  Package, ChevronLeft, ChevronRight,
  Plus, Pencil, Archive, ArchiveRestore, CheckCircle, ShieldAlert,
  Download, FileText, X, SlidersHorizontal, Camera, CalendarClock, Layers
} from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import { useAuthStore } from '../store/auth'
import type {
  InsumoResponse, SalaResponse, CategoriaResponse, PaginatedResponse
} from '../types/api'
import { Badge } from '../components/ui/Badge'
import { TableRowSkeleton } from '../components/ui/Skeleton'
import { Modal } from '../components/ui/Modal'
import { SearchWithSuggestions } from '../components/ui/SearchSuggestions'
import { BarcodeScanner } from '../components/ui/BarcodeScanner'

const PAGE_SIZE = 15

interface FormState {
  nombre: string; descripcion: string
  stock_actual: string; stock_minimo: string
  sala_id: string; categoria_id: string
  tipo: string; sku: string; codigo_barras: string
  costo_unitario: string; fecha_vencimiento: string
  unidad_medida: string
}
const FORM_VACIO: FormState = {
  nombre: '', descripcion: '', stock_actual: '',
  stock_minimo: '', sala_id: '', categoria_id: '',
  tipo: 'insumo', sku: '', codigo_barras: '',
  costo_unitario: '', fecha_vencimiento: '',
  unidad_medida: ''
}
function insumoAForm(i: InsumoResponse): FormState {
  return {
    nombre: i.nombre, descripcion: i.descripcion ?? '',
    stock_actual: String(i.stock_actual), stock_minimo: String(i.stock_minimo),
    sala_id: i.sala_id != null ? String(i.sala_id) : '',
    categoria_id: i.categoria_id != null ? String(i.categoria_id) : '',
    tipo: i.tipo ?? 'insumo',
    sku: i.sku ?? '',
    codigo_barras: i.codigo_barras ?? '',
    costo_unitario: i.costo_unitario != null ? String(i.costo_unitario) : '',
    fecha_vencimiento: i.fecha_vencimiento ?? '',
    unidad_medida: i.unidad_medida ?? ''
  }
}

function diasHastaVencer(fechaISO: string): number {
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0)
  const venc = new Date(fechaISO + 'T00:00:00')
  return Math.round((venc.getTime() - hoy.getTime()) / 86_400_000)
}

function formatFechaVenc(fechaISO: string): string {
  return new Date(fechaISO + 'T00:00:00').toLocaleDateString('es-CL', {
    day: '2-digit', month: '2-digit', year: 'numeric'
  })
}

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
  const [salas, setSalas]           = useState<SalaResponse[]>([])
  const [categorias, setCategorias] = useState<CategoriaResponse[]>([])
  const [userHas2FA, setUserHas2FA] = useState<boolean | null>(null)

  const [searchInput, setSearchInput]   = useState('')
  const [nombreFiltro, setNombreFiltro] = useState('')
  const [salaFiltro, setSalaFiltro]     = useState('')
  const [catFiltro, setCatFiltro]       = useState('')
  const [tipoFiltro, setTipoFiltro]     = useState('')
  const [bajoStock, setBajoStock]       = useState(false)
  const [mostrarInactivos, setMostrar]  = useState(false)
  const hasFilters = nombreFiltro || salaFiltro || catFiltro || bajoStock || mostrarInactivos || tipoFiltro

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
  const exportRef = useRef<HTMLDivElement>(null)

  function showToast(msg: string) {
    setToast(msg); setTimeout(() => setToast(null), 3000)
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
      api.get<PaginatedResponse<SalaResponse>>('/salas/', { params: { limit: 200 } }),
      api.get<PaginatedResponse<CategoriaResponse>>('/categorias/', { params: { limit: 200 } }),
      api.get<{ totp_habilitado: boolean }>('/usuarios/me')
    ]).then(([s, c, me]) => {
      setSalas(s.data.data)
      setCategorias(c.data.data)
      setUserHas2FA(me.data.totp_habilitado)
    })
  }, [])

  const load = useCallback(async (
    skip: number, nombre: string, sala_id: string,
    categoria_id: string, bajo_stock: boolean, incluir_inactivos: boolean,
    tipo: string
  ) => {
    setLoading(true)
    try {
      const params: Record<string, string | number | boolean> = { skip, limit: PAGE_SIZE }
      if (nombre) params.nombre = nombre
      if (sala_id) params.sala_id = parseInt(sala_id)
      if (categoria_id) params.categoria_id = parseInt(categoria_id)
      if (bajo_stock) params.bajo_stock = true
      if (incluir_inactivos) params.incluir_inactivos = true
      if (tipo) params.tipo = tipo
      const { data } = await api.get<PaginatedResponse<InsumoResponse>>('/insumos/', { params })
      setInsumos(data.data); setTotal(data.total)
    } finally { setLoading(false) }
  }, [])

  useEffect(() => {
    load(page * PAGE_SIZE, nombreFiltro, salaFiltro, catFiltro, bajoStock, mostrarInactivos, tipoFiltro)
  }, [page, nombreFiltro, salaFiltro, catFiltro, bajoStock, mostrarInactivos, tipoFiltro, load])

  function aplicarBusqueda(val: string) { setNombreFiltro(val); setPage(0) }

  function limpiarFiltros() {
    setSearchInput(''); setNombreFiltro('')
    setSalaFiltro(''); setCatFiltro('')
    setBajoStock(false); setMostrar(false)
    setTipoFiltro(''); setPage(0)
  }

  async function handleExportar(formato: 'csv' | 'xlsx') {
    setExporting(true); setShowExportMenu(false)
    try {
      const params: Record<string, string | number | boolean> = { formato }
      if (nombreFiltro) params.nombre = nombreFiltro
      if (salaFiltro)   params.sala_id = parseInt(salaFiltro)
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
  function abrirEditar(i: InsumoResponse) { setForm(insumoAForm(i)); setFormError(null); setEditTarget(i) }
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
      sala_id: form.sala_id ? parseInt(form.sala_id) : null,
      categoria_id: form.categoria_id ? parseInt(form.categoria_id) : null,
      tipo: form.tipo,
      sku: form.sku.trim() || null,
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
      load(page * PAGE_SIZE, nombreFiltro, salaFiltro, catFiltro, bajoStock, mostrarInactivos, tipoFiltro)
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
      setFormError(msg ?? 'Error al guardar.')
    } finally { setSaving(false) }
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await api.delete(`/insumos/${deleteTarget.id}`, { headers: { 'x-totp-code': deleteTotp } })
      showToast(`'${deleteTarget.nombre}' desactivado`); cerrarModal()
      load(page * PAGE_SIZE, nombreFiltro, salaFiltro, catFiltro, bajoStock, mostrarInactivos, tipoFiltro)
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
      load(page * PAGE_SIZE, nombreFiltro, salaFiltro, catFiltro, bajoStock, mostrarInactivos, tipoFiltro)
    } catch (err: unknown) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const detail = (err as any)?.response?.data?.detail
      setFormError(typeof detail === 'string' ? detail : 'Error al reactivar.')
    } finally { setDeleting(false) }
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const showModal  = showCrear || editTarget !== null
  // Columnas: Nombre | Unidad | Stock | Mínimo | Vencimiento | Estado | [Acciones]
  const totalCols  = puedeEscribir ? 7 : 6

  function stockBadge(i: InsumoResponse) {
    if (i.stock_actual === 0) return <Badge variant="danger">Agotado</Badge>
    if (i.stock_actual <= i.stock_minimo) return <Badge variant="warning">Bajo stock</Badge>
    return <Badge variant="success">OK</Badge>
  }

  function vencimientoCelda(i: InsumoResponse) {
    if (!i.fecha_vencimiento) {
      return <span className="text-slate-300 text-xs">—</span>
    }
    const dias = diasHastaVencer(i.fecha_vencimiento)
    const fecha = formatFechaVenc(i.fecha_vencimiento)
    if (dias < 0) return <Badge variant="danger">Vencido</Badge>
    if (dias <= 30) {
      return (
        <span className="inline-flex flex-col items-center gap-0.5">
          <Badge variant="warning">{dias === 0 ? 'Hoy' : `${dias}d`}</Badge>
          <span className="text-[10px] text-slate-400 font-mono">{fecha}</span>
        </span>
      )
    }
    return <span className="text-xs text-slate-500 font-mono">{fecha}</span>
  }

  const inputCls = `w-full px-3 py-2.5 rounded-lg border border-slate-200 text-slate-900 text-sm
    focus:outline-none focus:ring-2 focus:ring-teal-500 bg-slate-50 focus:bg-white
    placeholder:text-slate-400 transition-all`
  const labelCls = "block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5"
  const selectCls = `${inputCls} cursor-pointer`

  return (
    <div className="p-8 max-w-6xl mx-auto">
      {toast && (
        <div className="fixed top-6 right-6 z-50 flex items-center gap-2 bg-teal-600
                        text-white px-4 py-3 rounded-xl shadow-lg text-sm font-semibold">
          <CheckCircle size={16} />{toast}
        </div>
      )}

      {showScanner && (
        <BarcodeScanner
          onScan={(barcode) => { setField('codigo_barras', barcode); setShowScanner(false) }}
          onClose={() => setShowScanner(false)}
        />
      )}

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-slate-50">
            Insumos e Implementos
          </h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-0.5">
            {loading ? '...' : `${total} ítems`}{hasFilters && ' (filtrado)'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {puedeEscribir && (
            <div className="relative" ref={exportRef}>
              <button
                onClick={() => setShowExportMenu(v => !v)}
                disabled={exporting}
                className="flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200
                           text-slate-600 hover:bg-slate-50 text-sm font-semibold
                           transition-colors disabled:opacity-50">
                <Download size={14} />{exporting ? 'Exportando...' : 'Exportar'}
              </button>
              {showExportMenu && (
                <div className="absolute right-0 top-full mt-1 bg-white border border-slate-200
                                rounded-xl shadow-lg z-20 overflow-hidden min-w-36">
                  <button onClick={() => handleExportar('csv')}
                    className="w-full flex items-center gap-2 px-4 py-2.5 text-sm
                               text-slate-700 hover:bg-slate-50 font-semibold">
                    <FileText size={14} className="text-slate-400" /> CSV
                  </button>
                  <button onClick={() => handleExportar('xlsx')}
                    className="w-full flex items-center gap-2 px-4 py-2.5 text-sm
                               text-slate-700 hover:bg-slate-50 font-semibold">
                    <FileText size={14} className="text-teal-500" /> Excel (.xlsx)
                  </button>
                </div>
              )}
            </div>
          )}
          {puedeEscribir && (
            <button onClick={abrirCrear}
              className="flex items-center gap-2 bg-teal-600 hover:bg-teal-700 text-white
                         font-bold px-4 py-2.5 rounded-xl text-sm transition-colors">
              <Plus size={16} /> Nuevo ítem
            </button>
          )}
        </div>
      </div>

      {/* Búsqueda + Filtros */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200
                      dark:border-slate-700 shadow-sm p-4 mb-5">
        <div className="flex gap-2 mb-3">
          <SearchWithSuggestions
            value={searchInput}
            onChange={val => { setSearchInput(val); if (!val) aplicarBusqueda('') }}
            onSearch={aplicarBusqueda}
            placeholder="Buscar por nombre..."
          />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <SlidersHorizontal size={14} className="text-slate-400" />
          <select value={salaFiltro} onChange={e => { setSalaFiltro(e.target.value); setPage(0) }}
            className="flex-1 min-w-36 px-3 py-1.5 rounded-lg border border-slate-200
                       dark:border-slate-600 text-sm text-slate-600 dark:text-slate-300
                       bg-white dark:bg-slate-700 focus:outline-none
                       focus:ring-2 focus:ring-teal-500 cursor-pointer">
            <option value="">Todas las salas</option>
            {salas.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
          </select>
          <select value={catFiltro} onChange={e => { setCatFiltro(e.target.value); setPage(0) }}
            className="flex-1 min-w-36 px-3 py-1.5 rounded-lg border border-slate-200
                       dark:border-slate-600 text-sm text-slate-600 dark:text-slate-300
                       bg-white dark:bg-slate-700 focus:outline-none
                       focus:ring-2 focus:ring-teal-500 cursor-pointer">
            <option value="">Todas las categorías</option>
            {categorias.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
          <select value={tipoFiltro} onChange={e => { setTipoFiltro(e.target.value); setPage(0) }}
            className="flex-1 min-w-36 px-3 py-1.5 rounded-lg border border-slate-200
                       dark:border-slate-600 text-sm text-slate-600 dark:text-slate-300
                       bg-white dark:bg-slate-700 focus:outline-none
                       focus:ring-2 focus:ring-teal-500 cursor-pointer">
            <option value="">Todos los tipos</option>
            <option value="insumo">Insumos</option>
            <option value="implemento">Implementos</option>
          </select>
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input type="checkbox" checked={bajoStock}
              onChange={e => { setBajoStock(e.target.checked); setPage(0) }}
              className="w-4 h-4 rounded accent-teal-600" />
            <span className="text-sm font-semibold text-slate-600 dark:text-slate-300">
              Sólo bajo stock
            </span>
          </label>
          {puedeEliminar && (
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input type="checkbox" checked={mostrarInactivos}
                onChange={e => { setMostrar(e.target.checked); setPage(0) }}
                className="w-4 h-4 rounded accent-teal-600" />
              <span className="text-sm font-semibold text-slate-600 dark:text-slate-300">
                Mostrar inactivos
              </span>
            </label>
          )}
          {hasFilters && (
            <button onClick={limpiarFiltros}
              className="flex items-center gap-1 text-xs font-bold text-rose-500
                         hover:text-rose-700 transition-colors ml-auto">
              <X size={12} /> Limpiar filtros
            </button>
          )}
        </div>
      </div>

      {/* Tabla */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200
                      dark:border-slate-700 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-700
                           bg-slate-50 dark:bg-slate-900/50">
              <th className="text-left px-4 py-3 text-xs font-bold text-slate-500
                             uppercase tracking-wide">Nombre</th>
              <th className="text-left px-4 py-3 text-xs font-bold text-slate-500
                             uppercase tracking-wide">Unidad de medida</th>
              <th className="text-center px-4 py-3 text-xs font-bold text-slate-500
                             uppercase tracking-wide">Stock</th>
              <th className="text-center px-4 py-3 text-xs font-bold text-slate-500
                             uppercase tracking-wide">Mínimo</th>
              <th className="text-center px-4 py-3 text-xs font-bold text-slate-500
                             uppercase tracking-wide">
                <span className="flex items-center justify-center gap-1">
                  <CalendarClock size={11} /> Vencimiento
                </span>
              </th>
              <th className="text-center px-4 py-3 text-xs font-bold text-slate-500
                             uppercase tracking-wide">Estado</th>
              {puedeEscribir && (
                <th className="text-center px-4 py-3 text-xs font-bold text-slate-500
                               uppercase tracking-wide">Acciones</th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
            {loading ? (
              Array.from({ length: PAGE_SIZE }).map((_, i) => (
                <TableRowSkeleton key={i} cols={totalCols} />
              ))
            ) : insumos.length === 0 ? (
              <tr>
                <td colSpan={totalCols} className="text-center py-16 text-slate-400">
                  <Package size={32} className="mx-auto mb-2 opacity-30" />
                  <p className="font-semibold">Sin ítems que mostrar</p>
                  {hasFilters && (
                    <button onClick={limpiarFiltros} className="text-teal-600 text-xs mt-1 font-bold">
                      Limpiar filtros
                    </button>
                  )}
                </td>
              </tr>
            ) : insumos.map(i => (
              <tr key={i.id}
                className={`hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors
                            ${i.activo ? '' : 'opacity-60'}`}>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-slate-900 dark:text-slate-50">
                      {i.nombre}
                    </span>
                    {!i.activo && <Badge variant="danger">Inactivo</Badge>}
                    {i.tipo === 'implemento' && <Badge variant="info">Implemento</Badge>}
                  </div>
                  {i.sku && (
                    <div className="text-xs text-slate-400 font-mono mt-0.5">{i.sku}</div>
                  )}
                </td>
                <td className="px-4 py-3 text-slate-500 dark:text-slate-400 text-sm">
                  {i.unidad_medida
                    ? i.unidad_medida
                    : <span className="text-slate-300 dark:text-slate-600">—</span>
                  }
                </td>
                <td className="px-4 py-3 text-center font-bold text-slate-900 dark:text-slate-50">
                  {i.stock_actual}
                </td>
                <td className="px-4 py-3 text-center text-slate-500 dark:text-slate-400">
                  {i.stock_minimo}
                </td>
                <td className="px-4 py-3 text-center">{vencimientoCelda(i)}</td>
                <td className="px-4 py-3 text-center">{stockBadge(i)}</td>
                {puedeEscribir && (
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-center gap-1.5">
                      {i.tipo === 'implemento' && i.activo && (
                        <button
                          onClick={() => navigate(`/insumos/${i.id}/unidades`)}
                          title="Ver unidades físicas"
                          className="p-1.5 rounded-lg text-slate-400 hover:text-violet-600
                                     hover:bg-violet-50 dark:hover:bg-violet-900/30
                                     transition-colors">
                          <Layers size={14} />
                        </button>
                      )}
                      {i.activo ? (
                        <>
                          <button onClick={() => abrirEditar(i)}
                            className="p-1.5 rounded-lg text-slate-400 hover:bg-teal-50
                                       dark:hover:bg-teal-900/30 hover:text-teal-600
                                       transition-colors" title="Editar">
                            <Pencil size={14} />
                          </button>
                          {puedeEliminar && (
                            <button onClick={() => abrirEliminar(i)}
                              className="p-1.5 rounded-lg text-slate-400 hover:bg-rose-50
                                         dark:hover:bg-rose-900/30 hover:text-rose-600
                                         transition-colors"
                              title="Desactivar">
                              <Archive size={14} />
                            </button>
                          )}
                        </>
                      ) : (
                        puedeEliminar && (
                          <button onClick={() => abrirReactivar(i)}
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg
                                       bg-emerald-50 hover:bg-emerald-100 text-emerald-700
                                       text-xs font-bold transition-colors"
                            title="Reactivar">
                            <ArchiveRestore size={12} /> Reactivar
                          </button>
                        )
                      )}
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>

        {!loading && totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t
                          border-slate-200 dark:border-slate-700">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Página {page + 1} de {totalPages}
            </p>
            <div className="flex items-center gap-1">
              <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
                className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700
                           disabled:opacity-40">
                <ChevronLeft size={16} className="text-slate-600 dark:text-slate-400" />
              </button>
              <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700
                           disabled:opacity-40">
                <ChevronRight size={16} className="text-slate-600 dark:text-slate-400" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modal crear/editar */}
      {showModal && (
        <Modal
          title={editTarget ? 'Editar ítem' : 'Nuevo insumo o implemento'}
          onClose={cerrarModal}
          size="lg"
        >
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Tipo de ítem */}
            <div>
              <label className={labelCls}>Tipo de ítem *</label>
              <div className="flex rounded-xl border border-slate-200 overflow-hidden">
                <button type="button"
                  onClick={() => setField('tipo', 'insumo')}
                  className={`flex-1 py-2.5 text-sm font-bold transition-colors ${
                    form.tipo === 'insumo'
                      ? 'bg-teal-600 text-white'
                      : 'text-slate-500 hover:bg-slate-50'
                  }`}>
                  Insumo
                </button>
                <button type="button"
                  onClick={() => setField('tipo', 'implemento')}
                  className={`flex-1 py-2.5 text-sm font-bold transition-colors border-l border-slate-200 ${
                    form.tipo === 'implemento'
                      ? 'bg-teal-600 text-white border-teal-600'
                      : 'text-slate-500 hover:bg-slate-50'
                  }`}>
                  Implemento
                </button>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                {form.tipo === 'insumo'
                  ? 'Desechable — se consume durante la clase y no retorna al stock'
                  : 'Retornable — debe devolverse al área común al finalizar la clase'}
              </p>
            </div>

            {/* Nombre */}
            <div>
              <label className={labelCls}>Nombre *</label>
              <input type="text" required value={form.nombre}
                onChange={e => setField('nombre', e.target.value)}
                className={inputCls} placeholder="Ej: Guantes de nitrilo talla M" />
            </div>

            {/* Unidad de medida */}
            <div>
              <label className={labelCls}>Unidad de medida</label>
              <input type="text" value={form.unidad_medida}
                onChange={e => setField('unidad_medida', e.target.value)}
                className={inputCls}
                placeholder="Ej: caja x100, frasco 500 mL, unidad, par, rollo 5 m" />
              <p className="text-xs text-slate-400 mt-1">
                Describe cómo se cuantifica el stock. Para líquidos y reactivos,
                indica el volumen del envase (ej: “frasco 500 mL”).
              </p>
            </div>

            {/* SKU y código de barras */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>SKU</label>
                <input type="text" value={form.sku}
                  onChange={e => setField('sku', e.target.value)}
                  className={inputCls} placeholder="Auto-generado si se deja vacío" />
              </div>
              <div>
                <label className={labelCls}>Código de barras</label>
                <div className="flex gap-2">
                  <input type="text" value={form.codigo_barras}
                    onChange={e => setField('codigo_barras', e.target.value)}
                    className={`${inputCls} flex-1`} placeholder="Escanear o escribir" />
                  <button type="button" onClick={() => setShowScanner(true)}
                    className="flex-shrink-0 px-3 rounded-lg border border-slate-200
                               bg-slate-50 hover:bg-teal-50 hover:border-teal-300
                               hover:text-teal-600 text-slate-500 transition-colors"
                    title="Escanear con cámara">
                    <Camera size={16} />
                  </button>
                </div>
              </div>
            </div>

            {/* Stock */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Stock actual *</label>
                <input type="number" min="0" required value={form.stock_actual}
                  onChange={e => setField('stock_actual', e.target.value)}
                  className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Stock mínimo *</label>
                <input type="number" min="0" required value={form.stock_minimo}
                  onChange={e => setField('stock_minimo', e.target.value)}
                  className={inputCls} />
              </div>
            </div>

            {/* Fecha de vencimiento */}
            <div>
              <label className={labelCls}>Fecha de vencimiento</label>
              <input
                type="date"
                value={form.fecha_vencimiento}
                onChange={e => setField('fecha_vencimiento', e.target.value)}
                className={inputCls}
              />
              <p className="text-xs text-slate-400 mt-1">
                Útil para reactivos, insumos de enfermería y banco de sangre.
              </p>
            </div>

            {/* Sala y Categoría */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Sala</label>
                <select value={form.sala_id} onChange={e => setField('sala_id', e.target.value)}
                  className={selectCls}>
                  <option value="">Sin sala</option>
                  {salas.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Categoría</label>
                <select value={form.categoria_id} onChange={e => setField('categoria_id', e.target.value)}
                  className={selectCls}>
                  <option value="">Sin categoría</option>
                  {categorias.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                </select>
              </div>
            </div>

            {/* Descripción */}
            <div>
              <label className={labelCls}>Descripción</label>
              <input type="text" value={form.descripcion}
                onChange={e => setField('descripcion', e.target.value)}
                className={inputCls} placeholder="Opcional" />
            </div>

            {formError && (
              <p className="text-rose-600 text-sm bg-rose-50 border border-rose-200
                            px-3 py-2 rounded-lg font-semibold">{formError}</p>
            )}
            <div className="flex gap-3 pt-2">
              <button type="button" onClick={cerrarModal}
                className="flex-1 py-2.5 rounded-xl border border-slate-200
                           text-slate-600 font-bold hover:bg-slate-50">Cancelar</button>
              <button type="submit" disabled={saving}
                className="flex-1 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700
                           text-white font-bold disabled:opacity-50">
                {saving ? 'Guardando...' : editTarget ? 'Guardar cambios' : 'Crear'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Modal desactivar */}
      {deleteTarget && (
        <Modal title="Desactivar ítem" onClose={cerrarModal} size="sm">
          {deleteStep === 'confirm' ? (
            <div className="text-center">
              <div className="w-14 h-14 bg-rose-100 rounded-full flex items-center
                              justify-center mx-auto mb-4">
                <Archive size={24} className="text-rose-600" />
              </div>
              <p className="font-bold text-slate-900 dark:text-slate-50 mb-1">
                ¿Desactivar este ítem?
              </p>
              <p className="text-slate-500 text-sm mb-3">
                <strong>{deleteTarget.nombre}</strong> desaparecerá de los listados
                y no se le podrán registrar movimientos. Su historial se conserva
                y puede reactivarse cuando quieras.
              </p>
              {userHas2FA === false ? (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-left">
                  <div className="flex items-start gap-2">
                    <ShieldAlert size={16} className="text-amber-600 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-amber-800 font-bold text-xs">2FA requerido</p>
                      <p className="text-amber-700 text-xs mt-0.5">
                        Activa la verificación en dos pasos para desactivar ítems.
                      </p>
                    </div>
                  </div>
                  <Link to="/seguridad" onClick={cerrarModal}
                    className="mt-3 flex items-center justify-center gap-1.5
                               bg-amber-600 hover:bg-amber-700 text-white text-xs
                               font-bold py-2 rounded-lg transition-colors">
                    Activar 2FA ahora
                  </Link>
                </div>
              ) : (
                <>
                  <p className="text-slate-400 text-xs mb-5">
                    Necesitarás tu código TOTP para confirmar.
                  </p>
                  <div className="flex gap-3">
                    <button onClick={cerrarModal}
                      className="flex-1 py-2.5 rounded-xl border border-slate-200
                                 text-slate-600 font-bold hover:bg-slate-50">Cancelar</button>
                    <button onClick={() => setDeleteStep('totp')}
                      className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700
                                 text-white font-bold">Continuar</button>
                  </div>
                </>
              )}
            </div>
          ) : (
            <div>
              <p className="text-slate-600 text-sm mb-5 text-center">
                Ingresa tu código TOTP para confirmar la desactivación de
                <strong> {deleteTarget.nombre}</strong>.
              </p>
              <input type="text" inputMode="numeric" maxLength={6} value={deleteTotp}
                onChange={e => { setDeleteTotp(e.target.value.replace(/\D/g, '')); setFormError(null) }}
                className="w-full px-4 py-4 rounded-xl border-2 border-slate-200
                           text-slate-900 text-4xl text-center font-black tracking-[0.7em]
                           focus:outline-none focus:border-rose-400 bg-slate-50 mb-4
                           placeholder:text-slate-200"
                placeholder="000000" autoFocus
              />
              {formError && (
                <p className="text-rose-600 text-xs bg-rose-50 border border-rose-200
                              px-3 py-2 rounded-lg font-semibold mb-4">{formError}</p>
              )}
              <div className="flex gap-3">
                <button onClick={() => { setDeleteStep('confirm'); setFormError(null) }}
                  className="flex-1 py-2.5 rounded-xl border border-slate-200
                             text-slate-600 font-bold hover:bg-slate-50">← Volver</button>
                <button onClick={confirmDelete} disabled={deleting || deleteTotp.length !== 6}
                  className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700
                             text-white font-bold disabled:opacity-50">
                  {deleting ? 'Desactivando...' : 'Desactivar'}
                </button>
              </div>
            </div>
          )}
        </Modal>
      )}

      {/* Modal reactivar */}
      {reactivarTarget && (
        <Modal title="Reactivar ítem" onClose={cerrarModal} size="sm">
          <div className="text-center">
            <div className="w-14 h-14 bg-emerald-100 rounded-full flex items-center
                            justify-center mx-auto mb-4">
              <ArchiveRestore size={24} className="text-emerald-600" />
            </div>
            <p className="font-bold text-slate-900 dark:text-slate-50 mb-1">
              ¿Reactivar este ítem?
            </p>
            <p className="text-slate-500 text-sm mb-5">
              <strong>{reactivarTarget.nombre}</strong> volverá a aparecer en
              los listados y podrá recibir movimientos de stock.
            </p>
            {formError && (
              <p className="text-rose-600 text-xs bg-rose-50 border border-rose-200
                            px-3 py-2 rounded-lg mb-4">{formError}</p>
            )}
            <div className="flex gap-3">
              <button onClick={cerrarModal}
                className="flex-1 py-2.5 rounded-xl border border-slate-200
                           text-slate-600 font-bold hover:bg-slate-50">Cancelar</button>
              <button onClick={handleReactivar} disabled={deleting}
                className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700
                           text-white font-bold disabled:opacity-50">
                {deleting ? 'Reactivando...' : 'Reactivar'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
