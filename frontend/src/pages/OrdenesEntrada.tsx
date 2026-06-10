import { useEffect, useState, useCallback, Fragment } from 'react'
import {
  ShoppingCart, Plus, ChevronDown, ChevronRight,
  CheckCircle, RefreshCw, Lock, Unlock,
  PackageCheck, XCircle, FileText, FileSpreadsheet,
  AlertTriangle, Trash2, Search, X,
} from 'lucide-react'
import { api } from '../api/client'
import type { ProveedorResponse, InsumoResponse, ActivoFijoResponse } from '../types/api'
import {
  ETIQUETA_TIPO_ORDEN,
  ETIQUETA_ESTADO_ORDEN_ENTRADA,
  ACTIVIDADES_DUOC,
} from '../types/ordenes_entrada'
import type {
  OrdenEntradaResponse,
  TipoOrden,
  EstadoOrdenEntrada,
  OrdenEntradaItemCreate,
} from '../types/ordenes_entrada'
import { Badge } from '../components/ui/Badge'
import { Modal } from '../components/ui/Modal'
import { HSelect } from '../components/ui/HSelect'
import { TableRowSkeleton } from '../components/ui/Skeleton'
import { useLastUpdated } from '../hooks/useLastUpdated'
import { useAuthStore } from '../store/auth'

// ---------------------------------------------------------------------------
// Helpers visuales
// ---------------------------------------------------------------------------

const ESTADOS_CON_EXPORT: EstadoOrdenEntrada[] = ['borrador', 'confirmada', 'cerrada']

function estadoBadge(estado: EstadoOrdenEntrada) {
  const map: Record<EstadoOrdenEntrada, 'info' | 'warning' | 'success' | 'danger' | 'default'> = {
    borrador: 'default', confirmada: 'info',
    en_recepcion: 'warning', cerrada: 'success', cancelada: 'danger',
  }
  return <Badge variant={map[estado]}>{ETIQUETA_ESTADO_ORDEN_ENTRADA[estado]}</Badge>
}

function formatCLP(n: number | null | undefined) {
  if (n == null) return '—'
  return new Intl.NumberFormat('es-CL', {
    style: 'currency', currency: 'CLP', maximumFractionDigits: 0,
  }).format(n)
}

function formatFecha(iso: string) {
  return new Date(iso).toLocaleDateString('es-CL', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  })
}

// ---------------------------------------------------------------------------
// Tipos internos
// ---------------------------------------------------------------------------

interface FormOrden {
  proveedor_id: string; actividad_duoc: string
  tipo: TipoOrden;     notas: string
}

/** Item en el carrito antes de ser guardado */
interface CarritoItem {
  id: string  // uuid temporal para key React
  tipo_item: 'insumo' | 'activo_fijo'
  // referencia existente
  ref_id: number | null
  ref_nombre: string
  // nuevo
  es_nuevo: boolean
  nombre_nuevo: string
  tipo_insumo_nuevo: string
  tipo_activo_nuevo: string
  // cantidades
  cantidad: string
  costo_unitario: string
}

const ORDEN_VACIA: FormOrden = { proveedor_id: '', actividad_duoc: '', tipo: 'semanal', notas: '' }
type ItemOrden = OrdenEntradaResponse['items'][0]

function uid() { return Math.random().toString(36).slice(2) }

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------

export function OrdenesEntrada() {
  const { user } = useAuthStore()
  const esCoord    = user?.rol === 'operador_coordinador' || user?.rol === 'admin'
  const esOperador = ['admin', 'operador_coordinador', 'operador'].includes(user?.rol ?? '')

  const [ordenes,      setOrdenes]     = useState<OrdenEntradaResponse[]>([])
  const [loading,      setLoading]     = useState(true)
  const [proveedores,  setProveedores] = useState<ProveedorResponse[]>([])
  const [insumos,      setInsumos]     = useState<InsumoResponse[]>([])
  const [activos,      setActivos]     = useState<ActivoFijoResponse[]>([])
  const [expandido,    setExpandido]   = useState<number | null>(null)
  const [rowHover,     setRowHover]    = useState<number | null>(null)
  const [toast,        setToast]       = useState<{ msg: string; tipo: 'ok' | 'err' } | null>(null)
  const [filtroEstado, setFiltroEstado] = useState('')
  const [saving,       setSaving]      = useState(false)
  const [formError,    setFormError]   = useState<string | null>(null)

  // Modal orden
  const [showModalOrden, setShowModalOrden] = useState(false)
  const [formOrden,      setFormOrden]      = useState<FormOrden>(ORDEN_VACIA)

  // Modal carrito
  const [showCarrito,  setShowCarrito]  = useState(false)
  const [ordenActiva,  setOrdenActiva]  = useState<OrdenEntradaResponse | null>(null)
  const [carrito,      setCarrito]      = useState<CarritoItem[]>([])
  const [busqueda,     setBusqueda]     = useState('')
  const [tipoItem,     setTipoItem]     = useState<'insumo' | 'activo_fijo'>('insumo')
  const [sugerencias,  setSugerencias]  = useState<(InsumoResponse | ActivoFijoResponse)[]>([])

  // Modal recepcion
  const [showModalRecepcion, setShowModalRecepcion] = useState(false)
  const [itemRecepcion,      setItemRecepcion]      = useState<ItemOrden | null>(null)
  const [cantRecibida,       setCantRecibida]       = useState('')
  const [costoUnit,          setCostoUnit]          = useState('')
  const [ordenRecepcion,     setOrdenRecepcion]     = useState<OrdenEntradaResponse | null>(null)

  const { labelTiempo, marcarActualizado } = useLastUpdated()

  function showToast(msg: string, tipo: 'ok' | 'err' = 'ok') {
    setToast({ msg, tipo }); setTimeout(() => setToast(null), 3500)
  }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params: Record<string, string> = {}
      if (filtroEstado) params.estado = filtroEstado
      const { data } = await api.get<OrdenEntradaResponse[]>('/ordenes-entrada/', { params })
      setOrdenes(data); marcarActualizado()
    } finally { setLoading(false) }
  }, [filtroEstado, marcarActualizado])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    Promise.all([
      api.get<{ data: ProveedorResponse[]; total: number }>('/proveedores/', { params: { limit: 200 } }),
      api.get<{ data: InsumoResponse[]; total: number }>('/insumos/', { params: { limit: 500 } }),
      api.get<ActivoFijoResponse[]>('/activos-fijos/'),
    ]).then(([prov, ins, act]) => {
      setProveedores(prov.data.data)
      setInsumos(ins.data.data)
      setActivos(act.data)
    }).catch(() => {})
  }, [])

  // Sugerencias de búsqueda en carrito
  useEffect(() => {
    const q = busqueda.toLowerCase().trim()
    if (q.length < 2) { setSugerencias([]); return }
    if (tipoItem === 'insumo') {
      setSugerencias(insumos.filter(i => i.nombre.toLowerCase().includes(q)).slice(0, 8))
    } else {
      setSugerencias(activos.filter(a => a.nombre.toLowerCase().includes(q)).slice(0, 8))
    }
  }, [busqueda, tipoItem, insumos, activos])

  // ---------------------------------------------------------------------------
  // Carrito helpers
  // ---------------------------------------------------------------------------

  function agregarExistente(item: InsumoResponse | ActivoFijoResponse) {
    const esInsumo = tipoItem === 'insumo'
    const nuevo: CarritoItem = {
      id: uid(),
      tipo_item: tipoItem,
      ref_id: item.id,
      ref_nombre: item.nombre,
      es_nuevo: false,
      nombre_nuevo: '',
      tipo_insumo_nuevo: 'insumo',
      tipo_activo_nuevo: 'mueble',
      cantidad: '',
      costo_unitario: esInsumo
        ? String((item as InsumoResponse).costo_unitario ?? '')
        : '',
    }
    setCarrito(c => [...c, nuevo])
    setBusqueda('')
    setSugerencias([])
  }

  function agregarNuevo() {
    if (!busqueda.trim()) return
    const nuevo: CarritoItem = {
      id: uid(),
      tipo_item: tipoItem,
      ref_id: null,
      ref_nombre: busqueda.trim(),
      es_nuevo: true,
      nombre_nuevo: busqueda.trim(),
      tipo_insumo_nuevo: 'insumo',
      tipo_activo_nuevo: 'mueble',
      cantidad: '',
      costo_unitario: '',
    }
    setCarrito(c => [...c, nuevo])
    setBusqueda('')
    setSugerencias([])
  }

  function actualizarCarritoItem(
    id: string,
    campo: keyof CarritoItem,
    valor: string,
  ) {
    setCarrito(c => c.map(it => it.id === id ? { ...it, [campo]: valor } : it))
  }

  function quitarCarritoItem(id: string) {
    setCarrito(c => c.filter(it => it.id !== id))
  }

  function abrirCarrito(o: OrdenEntradaResponse) {
    setOrdenActiva(o); setCarrito([]); setBusqueda('')
    setTipoItem('insumo'); setFormError(null); setShowCarrito(true)
  }

  async function guardarCarrito() {
    if (!ordenActiva || carrito.length === 0) return
    for (const it of carrito) {
      if (!it.cantidad || parseInt(it.cantidad) <= 0) {
        setFormError(`"${it.ref_nombre}": la cantidad es obligatoria.`); return
      }
      if (!it.costo_unitario || parseFloat(it.costo_unitario) <= 0) {
        setFormError(`"${it.ref_nombre}": el costo unitario es obligatorio.`); return
      }
    }
    setSaving(true); setFormError(null)
    try {
      const items: OrdenEntradaItemCreate[] = carrito.map(it => {
        const base: OrdenEntradaItemCreate = {
          tipo_item: it.tipo_item,
          cantidad_pedida: parseInt(it.cantidad),
          costo_unitario: parseFloat(it.costo_unitario),
        }
        if (it.es_nuevo) {
          base.nombre_nuevo = it.nombre_nuevo
          if (it.tipo_item === 'insumo') base.tipo_insumo_nuevo = it.tipo_insumo_nuevo
          else base.tipo_activo_nuevo = it.tipo_activo_nuevo
        } else {
          if (it.tipo_item === 'insumo') base.insumo_id = it.ref_id!
          else base.activo_fijo_id = it.ref_id!
        }
        return base
      })
      await api.post(`/ordenes-entrada/${ordenActiva.id}/items/bulk`, { items })
      showToast(
        `${carrito.length} item${carrito.length !== 1 ? 's' : ''} agregado${carrito.length !== 1 ? 's' : ''}`,
      )
      setShowCarrito(false)
      load()
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
      setFormError(msg ?? 'Error al guardar los items.')
    } finally { setSaving(false) }
  }

  // ---------------------------------------------------------------------------
  // Acciones sobre ordenes
  // ---------------------------------------------------------------------------

  async function crearOrden() {
    setSaving(true); setFormError(null)
    try {
      const { data } = await api.post<OrdenEntradaResponse>('/ordenes-entrada/', {
        proveedor_id:   formOrden.proveedor_id ? parseInt(formOrden.proveedor_id) : null,
        actividad_duoc: formOrden.actividad_duoc || null,
        tipo:           formOrden.tipo,
        notas:          formOrden.notas || null,
        items:          [],
      })
      showToast('Orden creada')
      setShowModalOrden(false); setFormOrden(ORDEN_VACIA)
      setExpandido(data.id); load()
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
      setFormError(msg ?? 'Error al crear la orden.')
    } finally { setSaving(false) }
  }

  async function confirmar(id: number) {
    try {
      await api.post(`/ordenes-entrada/${id}/confirmar`)
      showToast('Orden confirmada'); load()
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
      showToast(msg ?? 'Error al confirmar.', 'err')
    }
  }

  async function cerrar(id: number) {
    try {
      await api.post(`/ordenes-entrada/${id}/cerrar`)
      showToast('Orden cerrada. Stock actualizado.'); load()
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
      showToast(msg ?? 'Error al cerrar.', 'err')
    }
  }

  async function cancelar(id: number) {
    if (!confirm('¿Cancelar esta orden?')) return
    try { await api.post(`/ordenes-entrada/${id}/cancelar`); showToast('Orden cancelada'); load() }
    catch { showToast('Error al cancelar.', 'err') }
  }

  async function eliminarItem(ordenId: number, itemId: number) {
    if (!confirm('¿Eliminar este item?')) return
    try {
      await api.delete(`/ordenes-entrada/${ordenId}/items/${itemId}`)
      showToast('Ítem eliminado'); load()
    }
    catch { showToast('Error al eliminar.', 'err') }
  }

  async function guardarRecepcion() {
    if (!ordenRecepcion || !itemRecepcion) return
    setSaving(true)
    try {
      await api.patch(
        `/ordenes-entrada/${ordenRecepcion.id}/items/${itemRecepcion.id}/recepcion`,
        {
          cantidad_recibida: parseInt(cantRecibida),
          costo_unitario: costoUnit ? parseFloat(costoUnit) : undefined,
        },
      )
      showToast('Recepción registrada'); setShowModalRecepcion(false); load()
    } catch { showToast('Error al registrar.', 'err') }
    finally { setSaving(false) }
  }

  async function descargarArchivo(id: number, tipo: 'pdf' | 'excel') {
    try {
      const ext = tipo === 'pdf' ? 'exportar-pdf' : 'exportar-excel'
      const { data, headers } = await api.get(
        `/ordenes-entrada/${id}/${ext}`, { responseType: 'blob' },
      )
      const mime = headers['content-type'] ?? (
        tipo === 'pdf' ? 'application/pdf'
          : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      )
      const url = URL.createObjectURL(new Blob([data], { type: mime }))
      const a = document.createElement('a')
      a.href = url
      a.download = `orden_entrada_${id}.${tipo === 'pdf' ? 'pdf' : 'xlsx'}`
      a.click()
      URL.revokeObjectURL(url)
    } catch { showToast('Error al descargar.', 'err') }
  }

  // ---------------------------------------------------------------------------
  // Opciones select
  // ---------------------------------------------------------------------------

  const provOpts   = proveedores.map(p => ({ value: String(p.id), label: p.nombre }))
  const actOpts    = ACTIVIDADES_DUOC.map(a => ({ value: a.codigo, label: `(${a.codigo}) ${a.nombre}` }))
  const tipoOpts   = [
    { value: 'semanal', label: 'Semanal' },
    { value: 'semestral', label: 'Semestral' },
    { value: 'emergencia', label: 'Emergencia' },
  ]
  const estadoOpts = [
    { value: 'borrador',     label: 'Borrador'     },
    { value: 'confirmada',   label: 'Confirmada'   },
    { value: 'en_recepcion', label: 'En recepción' },
    { value: 'cerrada',      label: 'Cerrada'      },
    { value: 'cancelada',    label: 'Cancelada'    },
  ]

  const inputCls = [
    'w-full px-3 py-2 rounded-lg border border-h-visible',
    'text-h-primary text-sm bg-h-elevated placeholder:text-h-tertiary focus:outline-none',
  ].join(' ')

  const totalCarrito = carrito.reduce((acc, it) => {
    const c = parseFloat(it.costo_unitario)
    const q = parseInt(it.cantidad)
    if (!isNaN(c) && !isNaN(q)) return acc + c * q
    return acc
  }, 0)

  const busquedaTrim = busqueda.trim()
  const sugEstado: 'hint' | 'empty' | 'results' =
    busquedaTrim.length < 2 ? 'hint'
      : sugerencias.length > 0 ? 'results'
      : 'empty'

  return (
    <div className="p-8 w-full">

      {toast && (
        <div
          className="fixed top-6 right-6 z-50 flex items-center gap-2
                     px-4 py-3 rounded-xl shadow-lg text-sm font-semibold text-white"
          style={{ background: toast.tipo === 'ok' ? 'var(--h-teal-rest)' : 'var(--h-sem-danger-text)' }}>
          <CheckCircle size={16} />{toast.msg}
        </div>
      )}

      {/* Encabezado */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-black text-h-primary flex items-center gap-2">
            <ShoppingCart size={22} className="text-h-accent" />
            Órdenes de Entrada
          </h1>
          <p className="text-h-secondary text-sm mt-0.5">
            {loading ? '...' : `${ordenes.length} orden${ordenes.length !== 1 ? 'es' : ''}`}
          </p>
          <p className="text-xs text-h-tertiary mt-1">{labelTiempo}</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={load} title="Actualizar"
            className="p-2 rounded-lg border border-h-subtle bg-h-elevated text-h-tertiary transition-colors duration-150"
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--h-bg-highlight)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'var(--h-bg-elevated)')}
          >
            <RefreshCw size={15} />
          </button>
          <HSelect value={filtroEstado} onChange={v => setFiltroEstado(v)}
            options={estadoOpts} placeholder="Todos los estados" size="sm" />
          {esCoord && (
            <button
              onClick={() => { setFormOrden(ORDEN_VACIA); setFormError(null); setShowModalOrden(true) }}
              className="flex items-center gap-2 text-white font-bold px-4 py-2.5 rounded-xl text-sm transition-colors duration-150"
              style={{ background: 'var(--h-teal-rest)' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--h-teal-hover)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'var(--h-teal-rest)')}>
              <Plus size={16} /> Nueva orden
            </button>
          )}
        </div>
      </div>

      {/* Tabla */}
      <div className="bg-h-surface rounded-xl border border-h-subtle overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-h-subtle bg-h-elevated">
              <th className="w-8 px-3 py-3" />
              {([
                ['Proveedor', 'left'], ['Actividad DuocUC', 'left'],
                ['Tipo', 'center'], ['Ítems', 'center'],
                ['Recibido / Pedido', 'center'], ['Fecha', 'center'],
                ['Estado', 'center'], ['Acciones', 'center'],
              ] as [string, string][]).map(([label, align]) => (
                <th key={label}
                  className={`px-4 py-3 text-xs font-bold text-h-tertiary uppercase tracking-wide ${
                    align === 'left' ? 'text-left' : 'text-center'
                  }`}>
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 4 }).map((_, i) => <TableRowSkeleton key={i} cols={9} />)
            ) : ordenes.length === 0 ? (
              <tr><td colSpan={9} className="text-center py-14">
                <ShoppingCart size={28} className="mx-auto mb-2 text-h-tertiary opacity-40" />
                <p className="font-semibold text-h-secondary">Sin órdenes registradas</p>
              </td></tr>
            ) : ordenes.map(o => {
              const abierto = expandido === o.id
              const puedeExportar = ESTADOS_CON_EXPORT.includes(o.estado)
              const totalOrden = o.items.reduce((acc, it) => {
                if (it.costo_unitario == null) return acc
                const qty = it.cantidad_recibida ?? it.cantidad_pedida
                return acc + it.costo_unitario * qty
              }, 0)
              return (
                <Fragment key={o.id}>
                  <tr
                    style={{ background: rowHover === o.id ? 'var(--h-bg-highlight)' : 'transparent' }}
                    className="border-b border-h-subtle transition-colors cursor-pointer"
                    onMouseEnter={() => setRowHover(o.id)}
                    onMouseLeave={() => setRowHover(null)}
                    onClick={() => setExpandido(abierto ? null : o.id)}>
                    <td className="px-3 py-3.5 text-h-tertiary">
                      {abierto ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </td>
                    <td className="px-4 py-3.5 font-semibold text-h-primary">
                      {o.proveedor_nombre ?? <span className="text-h-tertiary">—</span>}
                    </td>
                    <td className="px-4 py-3.5 text-h-secondary text-xs">
                      {o.actividad_duoc
                        ? `(${o.actividad_duoc}) ${o.actividad_nombre ?? ''}`
                        : <span className="text-h-tertiary">—</span>}
                    </td>
                    <td className="px-4 py-3.5 text-center">
                      <span className="font-mono text-xs text-h-secondary bg-h-elevated border border-h-subtle px-2 py-0.5 rounded-full">
                        {ETIQUETA_TIPO_ORDEN[o.tipo]}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-center text-h-secondary">{o.items.length}</td>
                    <td className="px-4 py-3.5 text-center text-h-secondary">
                      {o.total_recibido} / {o.total_pedido}
                    </td>
                    <td className="px-4 py-3.5 text-center text-h-tertiary text-xs">{formatFecha(o.created_at)}</td>
                    <td className="px-4 py-3.5 text-center">{estadoBadge(o.estado)}</td>
                    <td className="px-4 py-3.5 text-center" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center justify-center gap-1">
                        {puedeExportar && (
                          <>
                            <button onClick={() => descargarArchivo(o.id, 'pdf')} title="PDF"
                              className="p-1.5 rounded-lg text-h-tertiary transition-colors duration-150"
                              onMouseEnter={e => { e.currentTarget.style.background = 'var(--h-teal-subtle)'; e.currentTarget.style.color = 'var(--h-teal-hover)' }}
                              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--h-text-tertiary)' }}>
                              <FileText size={14} />
                            </button>
                            <button onClick={() => descargarArchivo(o.id, 'excel')} title="Excel"
                              className="p-1.5 rounded-lg text-h-tertiary transition-colors duration-150"
                              onMouseEnter={e => { e.currentTarget.style.background = 'var(--h-teal-subtle)'; e.currentTarget.style.color = 'var(--h-teal-hover)' }}
                              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--h-text-tertiary)' }}>
                              <FileSpreadsheet size={14} />
                            </button>
                          </>
                        )}
                        {esCoord && o.estado === 'borrador' && (
                          <button onClick={() => confirmar(o.id)} title="Confirmar"
                            className="p-1.5 rounded-lg text-h-tertiary transition-colors duration-150"
                            onMouseEnter={e => { e.currentTarget.style.background = 'var(--h-sem-info-bg)'; e.currentTarget.style.color = 'var(--h-sem-info-text)' }}
                            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--h-text-tertiary)' }}>
                            <Lock size={14} />
                          </button>
                        )}
                        {esCoord && (o.estado === 'confirmada' || o.estado === 'en_recepcion') && (
                          <button onClick={() => cerrar(o.id)} title="Cerrar y actualizar stock"
                            className="p-1.5 rounded-lg text-h-tertiary transition-colors duration-150"
                            onMouseEnter={e => { e.currentTarget.style.background = 'var(--h-sem-success-bg)'; e.currentTarget.style.color = 'var(--h-sem-success-text)' }}
                            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--h-text-tertiary)' }}>
                            <PackageCheck size={14} />
                          </button>
                        )}
                        {esCoord && o.estado !== 'cerrada' && o.estado !== 'cancelada' && (
                          <button onClick={() => cancelar(o.id)} title="Cancelar"
                            className="p-1.5 rounded-lg text-h-tertiary transition-colors duration-150"
                            onMouseEnter={e => { e.currentTarget.style.background = 'var(--h-sem-danger-bg)'; e.currentTarget.style.color = 'var(--h-sem-danger-text)' }}
                            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--h-text-tertiary)' }}>
                            <XCircle size={14} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>

                  {abierto && (
                    <tr><td colSpan={9} className="bg-h-elevated border-b border-h-subtle px-6 py-4">
                      <div className="flex items-center justify-between mb-3">
                        <p className="text-xs font-bold text-h-tertiary uppercase tracking-wide">Items de la orden</p>
                        {esCoord && o.estado === 'borrador' && (
                          <button onClick={() => abrirCarrito(o)}
                            className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg text-white transition-colors duration-150"
                            style={{ background: 'var(--h-teal-rest)' }}
                            onMouseEnter={e => (e.currentTarget.style.background = 'var(--h-teal-hover)')}
                            onMouseLeave={e => (e.currentTarget.style.background = 'var(--h-teal-rest)')}>
                            <Plus size={12} /> Agregar ítems
                          </button>
                        )}
                      </div>
                      {o.items.length === 0 ? (
                        <p className="text-h-tertiary text-sm italic">Sin ítems. Agrega ítems antes de confirmar.</p>
                      ) : (
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="text-h-tertiary font-bold uppercase tracking-wide">
                              <th className="text-left py-1.5 pr-4">Ítem</th>
                              <th className="text-center py-1.5 pr-4">Tipo</th>
                              <th className="text-center py-1.5 pr-4">Pedido</th>
                              <th className="text-center py-1.5 pr-4">Recibido</th>
                              <th className="text-right py-1.5 pr-4">Costo</th>
                              <th className="text-right py-1.5 pr-4">Subtotal</th>
                              <th className="text-center py-1.5 pr-4">Estado</th>
                              <th className="text-center py-1.5" />
                            </tr>
                          </thead>
                          <tbody>
                            {o.items.map(it => {
                              const nombre = it.insumo_nombre ?? it.activo_fijo_nombre ?? it.nombre_nuevo ?? 'Nuevo'
                              const esNuevo = !it.insumo_id && !it.activo_fijo_id
                              const subtotal = it.costo_unitario
                                ? it.costo_unitario * (it.cantidad_recibida ?? it.cantidad_pedida)
                                : null
                              return (
                                <tr key={it.id} className="border-t" style={{ borderColor: 'var(--h-border-subtle)' }}>
                                  <td className="py-2 pr-4 text-h-primary font-semibold">
                                    {nombre}
                                    {esNuevo && (
                                      <span className="ml-1.5 text-[10px] font-bold px-1.5 py-0.5 rounded"
                                        style={{ background: 'var(--h-sem-warning-bg)', color: 'var(--h-sem-warning-text)' }}>
                                        NUEVO
                                      </span>
                                    )}
                                  </td>
                                  <td className="py-2 pr-4 text-center text-h-secondary">{it.tipo_item}</td>
                                  <td className="py-2 pr-4 text-center font-bold text-h-primary">{it.cantidad_pedida}</td>
                                  <td className="py-2 pr-4 text-center text-h-secondary">{it.cantidad_recibida ?? '—'}</td>
                                  <td className="py-2 pr-4 text-right text-h-secondary tabular-nums">{formatCLP(it.costo_unitario)}</td>
                                  <td className="py-2 pr-4 text-right font-semibold text-h-primary tabular-nums">{formatCLP(subtotal)}</td>
                                  <td className="py-2 pr-4 text-center">
                                    <Badge variant={
                                      it.estado === 'recibido' ? 'success'
                                        : it.estado === 'cancelado' ? 'danger'
                                        : it.estado === 'recibido_parcial' ? 'warning'
                                        : 'default'
                                    }>{it.estado}</Badge>
                                  </td>
                                  <td className="py-2 text-center">
                                    <div className="flex items-center justify-center gap-1">
                                      {esOperador && (o.estado === 'confirmada' || o.estado === 'en_recepcion') && (
                                        <button onClick={() => {
                                          setOrdenRecepcion(o); setItemRecepcion(it)
                                          setCantRecibida(String(it.cantidad_recibida ?? ''))
                                          setCostoUnit(String(it.costo_unitario ?? ''))
                                          setShowModalRecepcion(true)
                                        }} title="Registrar recepción"
                                          className="p-1 rounded text-h-tertiary transition-colors duration-150"
                                          onMouseEnter={e => { e.currentTarget.style.background = 'var(--h-teal-subtle)'; e.currentTarget.style.color = 'var(--h-teal-hover)' }}
                                          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--h-text-tertiary)' }}>
                                          <Unlock size={12} />
                                        </button>
                                      )}
                                      {esCoord && o.estado === 'borrador' && (
                                        <button onClick={() => eliminarItem(o.id, it.id)} title="Eliminar"
                                          className="p-1 rounded text-h-tertiary transition-colors duration-150"
                                          onMouseEnter={e => { e.currentTarget.style.background = 'var(--h-sem-danger-bg)'; e.currentTarget.style.color = 'var(--h-sem-danger-text)' }}
                                          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--h-text-tertiary)' }}>
                                          <Trash2 size={12} />
                                        </button>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                          {totalOrden > 0 && (
                            <tfoot>
                              <tr>
                                <td colSpan={5} className="pt-3 text-right text-xs font-bold text-h-tertiary uppercase tracking-wide">
                                  Total estimado
                                </td>
                                <td className="pt-3 text-right font-black tabular-nums text-sm" style={{ color: 'var(--h-teal-hover)' }}>
                                  {formatCLP(totalOrden)}
                                </td>
                                <td colSpan={2} />
                              </tr>
                            </tfoot>
                          )}
                        </table>
                      )}
                      {o.notas && <p className="text-xs text-h-tertiary mt-3 italic">Notas: {o.notas}</p>}
                    </td></tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* ================================================================
          MODAL: Crear Orden
      ================================================================ */}
      {showModalOrden && (
        <Modal title="Nueva orden de entrada" onClose={() => setShowModalOrden(false)} size="sm">
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-h-tertiary uppercase tracking-wide mb-1.5">Proveedor</label>
              <HSelect value={formOrden.proveedor_id}
                onChange={v => setFormOrden(f => ({ ...f, proveedor_id: v }))}
                options={provOpts} placeholder="Sin proveedor" className="w-full" />
            </div>
            <div>
              <label className="block text-xs font-bold text-h-tertiary uppercase tracking-wide mb-1.5">Actividad DuocUC</label>
              <HSelect value={formOrden.actividad_duoc}
                onChange={v => setFormOrden(f => ({ ...f, actividad_duoc: v }))}
                options={actOpts} placeholder="Sin actividad" className="w-full" />
            </div>
            <div>
              <label className="block text-xs font-bold text-h-tertiary uppercase tracking-wide mb-1.5">Tipo de compra</label>
              <HSelect value={formOrden.tipo}
                onChange={v => setFormOrden(f => ({ ...f, tipo: v as TipoOrden }))}
                options={tipoOpts} className="w-full" />
            </div>
            <div>
              <label className="block text-xs font-bold text-h-tertiary uppercase tracking-wide mb-1.5">Notas</label>
              <textarea value={formOrden.notas}
                onChange={e => setFormOrden(f => ({ ...f, notas: e.target.value }))}
                rows={2} className={`${inputCls} resize-none`} placeholder="Opcional..." />
            </div>
            {formError && (
              <p className="text-sm px-3 py-2 rounded-lg border"
                style={{ background: 'var(--h-sem-danger-bg)', borderColor: 'var(--h-sem-danger-border)', color: 'var(--h-sem-danger-text)' }}>
                {formError}
              </p>
            )}
            <div className="flex gap-3 pt-1">
              <button type="button" onClick={() => setShowModalOrden(false)}
                className="flex-1 py-2.5 rounded-xl border border-h-visible text-h-secondary font-bold"
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--h-bg-highlight)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>Cancelar</button>
              <button onClick={crearOrden} disabled={saving}
                className="flex-1 py-2.5 rounded-xl text-white font-bold disabled:opacity-50"
                style={{ background: 'var(--h-teal-rest)' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--h-teal-hover)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'var(--h-teal-rest)')}>
                {saving ? 'Creando...' : 'Crear orden'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ================================================================
          MODAL: Carrito de ítems
      ================================================================ */}
      {showCarrito && ordenActiva && (
        <Modal title={`Agregar ítems — Orden #${ordenActiva.id}`}
          onClose={() => setShowCarrito(false)} size="xl">
          <div className="flex flex-col gap-4">

            {/* Buscador */}
            <div className="flex gap-2">
              <div className="flex gap-1 rounded-lg border border-h-visible overflow-hidden">
                <button
                  onClick={() => { setTipoItem('insumo'); setBusqueda(''); setSugerencias([]) }}
                  className="px-3 py-2 text-xs font-bold transition-colors duration-150"
                  style={{
                    background: tipoItem === 'insumo' ? 'var(--h-teal-rest)' : 'var(--h-bg-elevated)',
                    color: tipoItem === 'insumo' ? 'white' : 'var(--h-text-secondary)',
                  }}>
                  Insumo / Implemento
                </button>
                <button
                  onClick={() => { setTipoItem('activo_fijo'); setBusqueda(''); setSugerencias([]) }}
                  className="px-3 py-2 text-xs font-bold transition-colors duration-150"
                  style={{
                    background: tipoItem === 'activo_fijo' ? 'var(--h-teal-rest)' : 'var(--h-bg-elevated)',
                    color: tipoItem === 'activo_fijo' ? 'white' : 'var(--h-text-secondary)',
                  }}>
                  Activo Fijo
                </button>
              </div>
              <div className="relative flex-1">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-h-tertiary" />
                <input
                  type="text" value={busqueda}
                  onChange={e => setBusqueda(e.target.value)}
                  placeholder={tipoItem === 'insumo' ? 'Buscar insumo o implemento...' : 'Buscar activo fijo...'}
                  className={`${inputCls} pl-9`}
                  autoFocus
                />
                {busqueda && (
                  <button onClick={() => { setBusqueda(''); setSugerencias([]) }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-h-tertiary">
                    <X size={13} />
                  </button>
                )}
              </div>
            </div>

            {/* Zona de sugerencias — siempre visible, tres estados */}
            <div
              className="rounded-xl border overflow-hidden"
              style={{
                borderColor: sugEstado === 'empty'
                  ? 'var(--h-sem-warning-border)'
                  : 'var(--h-border-subtle)',
                background: sugEstado === 'empty'
                  ? 'var(--h-sem-warning-bg)'
                  : 'var(--h-bg-elevated)',
              }}
            >
              {sugEstado === 'hint' && (
                <div className="flex items-center gap-2 px-4 py-3">
                  <Search size={13} className="text-h-tertiary shrink-0" />
                  <span className="text-xs text-h-tertiary">
                    Escribe al menos 2 caracteres para ver sugerencias
                  </span>
                </div>
              )}

              {sugEstado === 'empty' && (
                <div className="px-4 py-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <AlertTriangle size={13} style={{ color: 'var(--h-sem-warning-text)' }} className="shrink-0" />
                      <span className="text-xs font-bold" style={{ color: 'var(--h-sem-warning-text)' }}>
                        Sin coincidencias para &ldquo;{busquedaTrim}&rdquo;
                      </span>
                    </div>
                    <button onClick={agregarNuevo}
                      className="text-xs font-bold px-3 py-1.5 rounded-lg text-white shrink-0"
                      style={{ background: 'var(--h-sem-warning-text)' }}>
                      + Agregar nuevo
                    </button>
                  </div>
                </div>
              )}

              {sugEstado === 'results' && (
                <div style={{ animation: 'hestia-sug-in 150ms ease-out both' }}>
                  <style>{`
                    @keyframes hestia-sug-in {
                      from { opacity: 0; transform: translateY(-4px); }
                      to   { opacity: 1; transform: translateY(0); }
                    }
                  `}</style>
                  {sugerencias.map(s => (
                    <button key={s.id}
                      onClick={() => agregarExistente(s)}
                      className="w-full text-left px-4 py-2.5 text-sm text-h-primary font-semibold
                                 border-b border-h-subtle last:border-0 transition-colors duration-100"
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--h-bg-highlight)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                      {s.nombre}
                      {'stock_actual' in s && (
                        <span className="ml-2 text-xs font-normal text-h-tertiary">
                          stock: {s.stock_actual}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Carrito */}
            {carrito.length > 0 && (
              <div className="rounded-xl border border-h-subtle overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-h-elevated border-b border-h-subtle">
                      <th className="text-left px-3 py-2 text-h-tertiary font-bold uppercase tracking-wide">Ítem</th>
                      <th className="text-center px-3 py-2 text-h-tertiary font-bold uppercase tracking-wide">Cantidad *</th>
                      <th className="text-center px-3 py-2 text-h-tertiary font-bold uppercase tracking-wide">Costo unit. ($) *</th>
                      <th className="text-right px-3 py-2 text-h-tertiary font-bold uppercase tracking-wide">Subtotal</th>
                      <th className="w-8" />
                    </tr>
                  </thead>
                  <tbody>
                    {carrito.map(it => {
                      const c = parseFloat(it.costo_unitario)
                      const q = parseInt(it.cantidad)
                      const sub = !isNaN(c) && !isNaN(q) ? c * q : null
                      return (
                        <tr key={it.id} className="border-t" style={{ borderColor: 'var(--h-border-subtle)' }}>
                          <td className="px-3 py-2 text-h-primary font-semibold">
                            {it.ref_nombre}
                            {it.es_nuevo && (
                              <span className="ml-1.5 text-[10px] font-bold px-1 py-0.5 rounded"
                                style={{ background: 'var(--h-sem-warning-bg)', color: 'var(--h-sem-warning-text)' }}>
                                NUEVO
                              </span>
                            )}
                            {it.es_nuevo && (
                              <div className="flex gap-2 mt-1">
                                <select
                                  value={it.tipo_item === 'insumo' ? it.tipo_insumo_nuevo : it.tipo_activo_nuevo}
                                  onChange={e => actualizarCarritoItem(
                                    it.id,
                                    it.tipo_item === 'insumo' ? 'tipo_insumo_nuevo' : 'tipo_activo_nuevo',
                                    e.target.value,
                                  )}
                                  className="text-[11px] px-1.5 py-0.5 rounded border border-h-visible bg-h-elevated text-h-secondary">
                                  {it.tipo_item === 'insumo'
                                    ? (<><option value="insumo">Insumo</option><option value="implemento">Implemento</option></>)
                                    : (<><option value="mueble">Mueble</option><option value="phantoma">Phantoma</option></>)
                                  }
                                </select>
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            <input type="number" min="1" value={it.cantidad}
                              onChange={e => actualizarCarritoItem(it.id, 'cantidad', e.target.value)}
                              className="w-20 px-2 py-1 rounded border border-h-visible bg-h-elevated text-h-primary text-center text-xs focus:outline-none"
                              placeholder="0" />
                          </td>
                          <td className="px-3 py-2">
                            <input type="number" min="0" value={it.costo_unitario}
                              onChange={e => actualizarCarritoItem(it.id, 'costo_unitario', e.target.value)}
                              className="w-28 px-2 py-1 rounded border border-h-visible bg-h-elevated text-h-primary text-right text-xs focus:outline-none"
                              placeholder="0" />
                          </td>
                          <td className="px-3 py-2 text-right font-semibold text-h-primary tabular-nums">
                            {sub != null ? formatCLP(sub) : '—'}
                          </td>
                          <td className="px-2 py-2 text-center">
                            <button onClick={() => quitarCarritoItem(it.id)}
                              className="p-1 rounded text-h-tertiary transition-colors duration-150"
                              onMouseEnter={e => { e.currentTarget.style.background = 'var(--h-sem-danger-bg)'; e.currentTarget.style.color = 'var(--h-sem-danger-text)' }}
                              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--h-text-tertiary)' }}>
                              <X size={12} />
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                  {totalCarrito > 0 && (
                    <tfoot>
                      <tr className="border-t" style={{ borderColor: 'var(--h-border-subtle)' }}>
                        <td colSpan={3} className="px-3 py-2 text-right text-xs font-bold text-h-tertiary uppercase tracking-wide">Total estimado</td>
                        <td className="px-3 py-2 text-right font-black tabular-nums text-sm" style={{ color: 'var(--h-teal-hover)' }}>
                          {formatCLP(totalCarrito)}
                        </td>
                        <td />
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            )}

            {formError && (
              <p className="text-sm px-3 py-2 rounded-lg border"
                style={{ background: 'var(--h-sem-danger-bg)', borderColor: 'var(--h-sem-danger-border)', color: 'var(--h-sem-danger-text)' }}>
                {formError}
              </p>
            )}

            <div className="flex gap-3 pt-1">
              <button onClick={() => setShowCarrito(false)}
                className="flex-1 py-2.5 rounded-xl border border-h-visible text-h-secondary font-bold"
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--h-bg-highlight)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>Cancelar</button>
              <button onClick={guardarCarrito}
                disabled={saving || carrito.length === 0}
                className="flex-1 py-2.5 rounded-xl text-white font-bold disabled:opacity-50"
                style={{ background: 'var(--h-teal-rest)' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--h-teal-hover)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'var(--h-teal-rest)')}>
                {saving ? 'Guardando...' : `Guardar ${
                  carrito.length > 0
                    ? `${carrito.length} ítem${carrito.length !== 1 ? 's' : ''}`
                    : 'ítems'
                }`}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ================================================================
          MODAL: Recepción
      ================================================================ */}
      {showModalRecepcion && itemRecepcion && (
        <Modal
          title={`Recepción — ${
            itemRecepcion.insumo_nombre ?? itemRecepcion.nombre_nuevo ?? 'Ítem'
          }`}
          onClose={() => setShowModalRecepcion(false)} size="sm">
          <div className="space-y-4">
            <p className="text-h-secondary text-sm">
              Pedido: <strong className="text-h-primary">{itemRecepcion.cantidad_pedida}</strong>
            </p>
            <div>
              <label className="block text-xs font-bold text-h-tertiary uppercase tracking-wide mb-1.5">Cantidad recibida *</label>
              <input type="number" min="0" value={cantRecibida}
                onChange={e => setCantRecibida(e.target.value)} className={inputCls} autoFocus />
            </div>
            <div>
              <label className="block text-xs font-bold text-h-tertiary uppercase tracking-wide mb-1.5">Costo unitario ($)</label>
              <input type="number" min="0" value={costoUnit}
                onChange={e => setCostoUnit(e.target.value)} className={inputCls} placeholder="Opcional" />
            </div>
            <div className="flex gap-3 pt-1">
              <button onClick={() => setShowModalRecepcion(false)}
                className="flex-1 py-2.5 rounded-xl border border-h-visible text-h-secondary font-bold"
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--h-bg-highlight)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>Cancelar</button>
              <button onClick={guardarRecepcion} disabled={saving || !cantRecibida}
                className="flex-1 py-2.5 rounded-xl text-white font-bold disabled:opacity-50"
                style={{ background: 'var(--h-teal-rest)' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--h-teal-hover)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'var(--h-teal-rest)')}>
                {saving ? 'Guardando...' : 'Registrar'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
