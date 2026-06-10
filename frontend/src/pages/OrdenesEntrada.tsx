import { useEffect, useState, useCallback, Fragment } from 'react'
import {
  ShoppingCart, Plus, ChevronDown, ChevronRight,
  CheckCircle, RefreshCw, Lock, Unlock,
  PackageCheck, XCircle, FileText, FileSpreadsheet,
  AlertTriangle, Trash2,
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
  TipoItemOrden,
  OrdenEntradaItemCreate,
} from '../types/ordenes_entrada'
import { Badge } from '../components/ui/Badge'
import { Modal } from '../components/ui/Modal'
import { HSelect } from '../components/ui/HSelect'
import { TableRowSkeleton } from '../components/ui/Skeleton'
import { useLastUpdated } from '../hooks/useLastUpdated'
import { useAuthStore } from '../store/auth'

function estadoBadge(estado: EstadoOrdenEntrada) {
  const map: Record<EstadoOrdenEntrada, 'info' | 'warning' | 'success' | 'danger' | 'default'> = {
    borrador:     'default',
    confirmada:   'info',
    en_recepcion: 'warning',
    cerrada:      'success',
    cancelada:    'danger',
  }
  return <Badge variant={map[estado]}>{ETIQUETA_ESTADO_ORDEN_ENTRADA[estado]}</Badge>
}

function formatCLP(n: number | null | undefined) {
  if (n == null) return '\u2014'
  return new Intl.NumberFormat('es-CL', {
    style: 'currency', currency: 'CLP', maximumFractionDigits: 0,
  }).format(n)
}

function formatFecha(iso: string) {
  return new Date(iso).toLocaleDateString('es-CL', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  })
}

interface FormOrden {
  proveedor_id:   string
  actividad_duoc: string
  tipo:           TipoOrden
  notas:          string
}

interface FormItem {
  tipo_item:         TipoItemOrden
  insumo_id:         string
  activo_fijo_id:    string
  nombre_nuevo:      string
  tipo_insumo_nuevo: string
  tipo_activo_nuevo: string
  es_nuevo:          boolean
  cantidad_pedida:   string
  costo_unitario:    string
  notas_item:        string
}

const ORDEN_VACIA: FormOrden = {
  proveedor_id: '', actividad_duoc: '', tipo: 'semanal', notas: '',
}

const ITEM_VACIO: FormItem = {
  tipo_item: 'insumo', insumo_id: '', activo_fijo_id: '',
  nombre_nuevo: '', tipo_insumo_nuevo: 'insumo', tipo_activo_nuevo: 'mueble',
  es_nuevo: false, cantidad_pedida: '', costo_unitario: '', notas_item: '',
}

type ItemOrden = OrdenEntradaResponse['items'][0]

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
  const [filtroEstado, setFiltroEstado] = useState<string>('')
  const [saving,       setSaving]      = useState(false)
  const [formError,    setFormError]   = useState<string | null>(null)
  const [similares,    setSimilares]   = useState<InsumoResponse[]>([])

  const [showModalOrden,     setShowModalOrden]     = useState(false)
  const [showModalItem,      setShowModalItem]      = useState(false)
  const [showModalRecepcion, setShowModalRecepcion] = useState(false)
  const [ordenActiva,        setOrdenActiva]        = useState<OrdenEntradaResponse | null>(null)
  const [itemRecepcion,      setItemRecepcion]      = useState<ItemOrden | null>(null)
  const [formOrden,          setFormOrden]          = useState<FormOrden>(ORDEN_VACIA)
  const [formItem,           setFormItem]           = useState<FormItem>(ITEM_VACIO)
  const [cantRecibida,       setCantRecibida]       = useState('')
  const [costoUnit,          setCostoUnit]          = useState('')

  const { labelTiempo, marcarActualizado } = useLastUpdated()

  function showToast(msg: string, tipo: 'ok' | 'err' = 'ok') {
    setToast({ msg, tipo })
    setTimeout(() => setToast(null), 3500)
  }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params: Record<string, string> = {}
      if (filtroEstado) params.estado = filtroEstado
      const { data } = await api.get<OrdenEntradaResponse[]>(
        '/ordenes-entrada/', { params }
      )
      setOrdenes(data)
      marcarActualizado()
    } finally {
      setLoading(false)
    }
  }, [filtroEstado, marcarActualizado])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    // /proveedores/ devuelve PaginatedResponse -> extraer .data
    // /insumos/ devuelve PaginatedResponse -> extraer .data
    // /activos-fijos/ devuelve array directo
    Promise.all([
      api.get<{ data: ProveedorResponse[]; total: number }>(
        '/proveedores/', { params: { limit: 200 } }
      ),
      api.get<{ data: InsumoResponse[]; total: number }>(
        '/insumos/', { params: { limit: 500 } }
      ),
      api.get<ActivoFijoResponse[]>('/activos-fijos/'),
    ]).then(([prov, ins, act]) => {
      setProveedores(prov.data.data)
      setInsumos(ins.data.data)
      setActivos(act.data)
    }).catch(() => {})
  }, [])

  useEffect(() => {
    if (!formItem.es_nuevo || formItem.nombre_nuevo.length < 3) {
      setSimilares([])
      return
    }
    const q = formItem.nombre_nuevo.toLowerCase()
    setSimilares(insumos.filter(i => i.nombre.toLowerCase().includes(q)).slice(0, 5))
  }, [formItem.nombre_nuevo, formItem.es_nuevo, insumos])

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
      setShowModalOrden(false)
      setFormOrden(ORDEN_VACIA)
      setExpandido(data.id)
      load()
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })
        .response?.data?.detail
      setFormError(msg ?? 'Error al crear la orden.')
    } finally { setSaving(false) }
  }

  async function confirmar(id: number) {
    try {
      await api.post(`/ordenes-entrada/${id}/confirmar`)
      showToast('Orden confirmada'); load()
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })
        .response?.data?.detail
      showToast(msg ?? 'Error al confirmar.', 'err')
    }
  }

  async function cerrar(id: number) {
    try {
      await api.post(`/ordenes-entrada/${id}/cerrar`)
      showToast('Orden cerrada. Stock actualizado.'); load()
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })
        .response?.data?.detail
      showToast(msg ?? 'Error al cerrar.', 'err')
    }
  }

  async function cancelar(id: number) {
    if (!confirm('\u00bfCancelar esta orden?')) return
    try {
      await api.post(`/ordenes-entrada/${id}/cancelar`)
      showToast('Orden cancelada'); load()
    } catch { showToast('Error al cancelar.', 'err') }
  }

  async function agregarItem() {
    if (!ordenActiva) return
    setSaving(true); setFormError(null)
    try {
      const payload: OrdenEntradaItemCreate = {
        tipo_item:       formItem.tipo_item,
        cantidad_pedida: parseInt(formItem.cantidad_pedida),
        costo_unitario:  formItem.costo_unitario
          ? parseFloat(formItem.costo_unitario)
          : null,
        notas_item: formItem.notas_item || null,
      }
      if (formItem.es_nuevo) {
        payload.nombre_nuevo = formItem.nombre_nuevo
        if (formItem.tipo_item === 'insumo') {
          payload.tipo_insumo_nuevo = formItem.tipo_insumo_nuevo
        } else {
          payload.tipo_activo_nuevo = formItem.tipo_activo_nuevo
        }
      } else {
        if (formItem.tipo_item === 'insumo' && formItem.insumo_id) {
          payload.insumo_id = parseInt(formItem.insumo_id)
        } else if (formItem.tipo_item === 'activo_fijo' && formItem.activo_fijo_id) {
          payload.activo_fijo_id = parseInt(formItem.activo_fijo_id)
        }
      }
      await api.post(`/ordenes-entrada/${ordenActiva.id}/items`, payload)
      showToast('\u00cdtem agregado')
      setShowModalItem(false)
      setFormItem(ITEM_VACIO)
      load()
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })
        .response?.data?.detail
      setFormError(msg ?? 'Error al agregar item.')
    } finally { setSaving(false) }
  }

  async function eliminarItem(ordenId: number, itemId: number) {
    if (!confirm('\u00bfEliminar este item?')) return
    try {
      await api.delete(`/ordenes-entrada/${ordenId}/items/${itemId}`)
      showToast('\u00cdtem eliminado'); load()
    } catch { showToast('Error al eliminar.', 'err') }
  }

  async function guardarRecepcion() {
    if (!ordenActiva || !itemRecepcion) return
    setSaving(true)
    try {
      await api.patch(
        `/ordenes-entrada/${ordenActiva.id}/items/${itemRecepcion.id}/recepcion`,
        {
          cantidad_recibida: parseInt(cantRecibida),
          costo_unitario:    costoUnit ? parseFloat(costoUnit) : undefined,
        },
      )
      showToast('Recepci\u00f3n registrada')
      setShowModalRecepcion(false)
      load()
    } catch { showToast('Error al registrar.', 'err') }
    finally { setSaving(false) }
  }

  function descargarPdf(id: number) {
    window.open(`/ordenes-entrada/${id}/exportar-pdf`, '_blank')
  }
  function descargarExcel(id: number) {
    window.open(`/ordenes-entrada/${id}/exportar-excel`, '_blank')
  }

  function abrirModalItem(o: OrdenEntradaResponse) {
    setOrdenActiva(o); setFormItem(ITEM_VACIO)
    setFormError(null); setShowModalItem(true)
  }

  function abrirRecepcion(o: OrdenEntradaResponse, it: ItemOrden) {
    setOrdenActiva(o); setItemRecepcion(it)
    setCantRecibida(String(it.cantidad_recibida ?? ''))
    setCostoUnit(String(it.costo_unitario ?? ''))
    setShowModalRecepcion(true)
  }

  const provOpts   = proveedores.map(p => ({ value: String(p.id), label: p.nombre }))
  const actOpts    = ACTIVIDADES_DUOC.map(a => ({
    value: a.codigo, label: `(${a.codigo}) ${a.nombre}`,
  }))
  const tipoOpts   = [
    { value: 'semanal',    label: 'Semanal'    },
    { value: 'semestral',  label: 'Semestral'  },
    { value: 'emergencia', label: 'Emergencia' },
  ]
  const estadoOpts = [
    { value: 'borrador',     label: 'Borrador'     },
    { value: 'confirmada',   label: 'Confirmada'   },
    { value: 'en_recepcion', label: 'En recepcion' },
    { value: 'cerrada',      label: 'Cerrada'      },
    { value: 'cancelada',    label: 'Cancelada'    },
  ]
  const insumoOpts = insumos.map(i => ({ value: String(i.id), label: i.nombre }))
  const activoOpts = activos.map(a => ({
    value: String(a.id),
    label: `${a.nombre}${a.codigo_interno ? ` [${a.codigo_interno}]` : ''}`,
  }))

  const inputCls = [
    'w-full px-3 py-2.5 rounded-lg border border-h-visible',
    'text-h-primary text-sm bg-h-elevated',
    'placeholder:text-h-tertiary focus:outline-none transition-all',
  ].join(' ')

  return (
    <div className="p-8 w-full">

      {toast && (
        <div
          className="fixed top-6 right-6 z-50 flex items-center gap-2
                     px-4 py-3 rounded-xl shadow-lg text-sm font-semibold text-white"
          style={{
            background: toast.tipo === 'ok'
              ? 'var(--h-teal-rest)'
              : 'var(--h-sem-danger-text)',
          }}
        >
          <CheckCircle size={16} />{toast.msg}
        </div>
      )}

      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-black text-h-primary flex items-center gap-2">
            <ShoppingCart size={22} className="text-h-accent" />
            \u00d3rdenes de Entrada
          </h1>
          <p className="text-h-secondary text-sm mt-0.5">
            {loading ? '...' : `${ordenes.length} orden${ordenes.length !== 1 ? 'es' : ''}`}
          </p>
          <p className="text-xs text-h-tertiary mt-1">{labelTiempo}</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={load} title="Actualizar"
            className="p-2 rounded-lg border border-h-subtle bg-h-elevated
                       text-h-tertiary transition-colors duration-150"
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--h-bg-highlight)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'var(--h-bg-elevated)')}
          >
            <RefreshCw size={15} />
          </button>
          <HSelect
            value={filtroEstado}
            onChange={v => setFiltroEstado(v)}
            options={estadoOpts}
            placeholder="Todos los estados"
            size="sm"
          />
          {esCoord && (
            <button
              onClick={() => { setFormOrden(ORDEN_VACIA); setFormError(null); setShowModalOrden(true) }}
              className="flex items-center gap-2 text-white font-bold
                         px-4 py-2.5 rounded-xl text-sm transition-colors duration-150"
              style={{ background: 'var(--h-teal-rest)' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--h-teal-hover)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'var(--h-teal-rest)')}
            >
              <Plus size={16} /> Nueva orden
            </button>
          )}
        </div>
      </div>

      <div className="bg-h-surface rounded-xl border border-h-subtle overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-h-subtle bg-h-elevated">
              <th className="w-8 px-3 py-3" />
              {([
                ['Proveedor',         'left'  ],
                ['Actividad DuocUC',  'left'  ],
                ['Tipo',              'center'],
                ['Items',             'center'],
                ['Recibido / Pedido', 'center'],
                ['Fecha',             'center'],
                ['Estado',            'center'],
                ['Acciones',          'center'],
              ] as [string, string][]).map(([label, align]) => (
                <th
                  key={label}
                  className={[
                    'px-4 py-3 text-xs font-bold text-h-tertiary uppercase tracking-wide',
                    align === 'left' ? 'text-left' : 'text-center',
                  ].join(' ')}
                >
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 4 }).map((_, i) => <TableRowSkeleton key={i} cols={9} />)
            ) : ordenes.length === 0 ? (
              <tr>
                <td colSpan={9} className="text-center py-14">
                  <ShoppingCart size={28} className="mx-auto mb-2 text-h-tertiary opacity-40" />
                  <p className="font-semibold text-h-secondary">Sin \u00f3rdenes registradas</p>
                </td>
              </tr>
            ) : ordenes.map(o => {
              const abierto = expandido === o.id
              return (
                <Fragment key={o.id}>
                  <tr
                    style={{ background: rowHover === o.id ? 'var(--h-bg-highlight)' : 'transparent' }}
                    className="border-b border-h-subtle transition-colors cursor-pointer"
                    onMouseEnter={() => setRowHover(o.id)}
                    onMouseLeave={() => setRowHover(null)}
                    onClick={() => setExpandido(abierto ? null : o.id)}
                  >
                    <td className="px-3 py-3.5 text-h-tertiary">
                      {abierto ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </td>
                    <td className="px-4 py-3.5 font-semibold text-h-primary">
                      {o.proveedor_nombre ?? <span className="text-h-tertiary">\u2014</span>}
                    </td>
                    <td className="px-4 py-3.5 text-h-secondary text-xs">
                      {o.actividad_duoc
                        ? `(${o.actividad_duoc}) ${o.actividad_nombre ?? ''}`
                        : <span className="text-h-tertiary">\u2014</span>
                      }
                    </td>
                    <td className="px-4 py-3.5 text-center">
                      <span className="font-mono text-xs text-h-secondary
                                       bg-h-elevated border border-h-subtle
                                       px-2 py-0.5 rounded-full">
                        {ETIQUETA_TIPO_ORDEN[o.tipo]}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-center text-h-secondary">{o.items.length}</td>
                    <td className="px-4 py-3.5 text-center text-h-secondary">
                      {o.total_recibido} / {o.total_pedido}
                    </td>
                    <td className="px-4 py-3.5 text-center text-h-tertiary text-xs">
                      {formatFecha(o.created_at)}
                    </td>
                    <td className="px-4 py-3.5 text-center">{estadoBadge(o.estado)}</td>
                    <td className="px-4 py-3.5 text-center" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center justify-center gap-1">
                        <button onClick={() => descargarPdf(o.id)} title="PDF"
                          className="p-1.5 rounded-lg text-h-tertiary transition-colors duration-150"
                          onMouseEnter={e => { e.currentTarget.style.background = 'var(--h-teal-subtle)'; e.currentTarget.style.color = 'var(--h-teal-hover)' }}
                          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--h-text-tertiary)' }}>
                          <FileText size={14} />
                        </button>
                        <button onClick={() => descargarExcel(o.id)} title="Excel"
                          className="p-1.5 rounded-lg text-h-tertiary transition-colors duration-150"
                          onMouseEnter={e => { e.currentTarget.style.background = 'var(--h-teal-subtle)'; e.currentTarget.style.color = 'var(--h-teal-hover)' }}
                          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--h-text-tertiary)' }}>
                          <FileSpreadsheet size={14} />
                        </button>
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
                    <tr>
                      <td colSpan={9} className="bg-h-elevated border-b border-h-subtle px-6 py-4">
                        <div className="flex items-center justify-between mb-3">
                          <p className="text-xs font-bold text-h-tertiary uppercase tracking-wide">
                            Items de la orden
                          </p>
                          {esCoord && o.estado === 'borrador' && (
                            <button onClick={() => abrirModalItem(o)}
                              className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5
                                         rounded-lg text-white transition-colors duration-150"
                              style={{ background: 'var(--h-teal-rest)' }}
                              onMouseEnter={e => (e.currentTarget.style.background = 'var(--h-teal-hover)')}
                              onMouseLeave={e => (e.currentTarget.style.background = 'var(--h-teal-rest)')}>
                              <Plus size={12} /> Agregar item
                            </button>
                          )}
                        </div>
                        {o.items.length === 0 ? (
                          <p className="text-h-tertiary text-sm italic">
                            Sin items. Agrega items antes de confirmar.
                          </p>
                        ) : (
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="text-h-tertiary font-bold uppercase tracking-wide">
                                <th className="text-left py-1.5 pr-4">Item</th>
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
                                  <tr key={it.id} className="border-t"
                                    style={{ borderColor: 'var(--h-border-subtle)' }}>
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
                                    <td className="py-2 pr-4 text-center text-h-secondary">
                                      {it.cantidad_recibida ?? '\u2014'}
                                    </td>
                                    <td className="py-2 pr-4 text-right text-h-secondary tabular-nums">
                                      {formatCLP(it.costo_unitario)}
                                    </td>
                                    <td className="py-2 pr-4 text-right font-semibold text-h-primary tabular-nums">
                                      {formatCLP(subtotal)}
                                    </td>
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
                                          <button onClick={() => abrirRecepcion(o, it)} title="Recepcion"
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
                          </table>
                        )}
                        {o.notas && (
                          <p className="text-xs text-h-tertiary mt-3 italic">Notas: {o.notas}</p>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* MODAL: Crear Orden */}
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

      {/* MODAL: Agregar Item */}
      {showModalItem && ordenActiva && (
        <Modal title="Agregar item" onClose={() => setShowModalItem(false)} size="sm">
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-h-tertiary uppercase tracking-wide mb-1.5">Tipo de item</label>
              <HSelect value={formItem.tipo_item}
                onChange={v => setFormItem(f => ({ ...f, tipo_item: v as TipoItemOrden, insumo_id: '', activo_fijo_id: '', nombre_nuevo: '', es_nuevo: false }))}
                options={[{ value: 'insumo', label: 'Insumo / Implemento' }, { value: 'activo_fijo', label: 'Activo Fijo' }]}
                className="w-full" />
            </div>
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input type="checkbox" checked={formItem.es_nuevo}
                onChange={e => setFormItem(f => ({ ...f, es_nuevo: e.target.checked, insumo_id: '', activo_fijo_id: '', nombre_nuevo: '' }))}
                className="w-4 h-4 rounded" />
              <span className="text-sm text-h-secondary font-semibold">Es un item nuevo (no existe en Hestia)</span>
            </label>
            {formItem.es_nuevo ? (
              <>
                <div>
                  <label className="block text-xs font-bold text-h-tertiary uppercase tracking-wide mb-1.5">Nombre *</label>
                  <input type="text" value={formItem.nombre_nuevo}
                    onChange={e => setFormItem(f => ({ ...f, nombre_nuevo: e.target.value }))}
                    className={inputCls} placeholder="Ej: Guante nitrilo talla M" autoFocus />
                </div>
                {similares.length > 0 && (
                  <div className="rounded-xl border p-3"
                    style={{ background: 'var(--h-sem-warning-bg)', borderColor: 'var(--h-sem-warning-border)' }}>
                    <div className="flex items-center gap-1.5 mb-2">
                      <AlertTriangle size={13} style={{ color: 'var(--h-sem-warning-text)' }} />
                      <p className="text-xs font-bold" style={{ color: 'var(--h-sem-warning-text)' }}>
                        Insumos similares. \u00bfEs alguno de estos?
                      </p>
                    </div>
                    {similares.map(s => (
                      <button key={s.id}
                        onClick={() => setFormItem(f => ({ ...f, es_nuevo: false, insumo_id: String(s.id), nombre_nuevo: '' }))}
                        className="block w-full text-left text-xs px-2 py-1.5 rounded mb-1 font-semibold"
                        style={{ color: 'var(--h-sem-warning-text)' }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'var(--h-sem-warning-border)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                        {s.nombre} (stock: {s.stock_actual})
                      </button>
                    ))}
                  </div>
                )}
                {formItem.tipo_item === 'insumo' && (
                  <div>
                    <label className="block text-xs font-bold text-h-tertiary uppercase tracking-wide mb-1.5">Tipo</label>
                    <HSelect value={formItem.tipo_insumo_nuevo}
                      onChange={v => setFormItem(f => ({ ...f, tipo_insumo_nuevo: v }))}
                      options={[{ value: 'insumo', label: 'Insumo (desechable)' }, { value: 'implemento', label: 'Implemento (retornable)' }]}
                      className="w-full" />
                  </div>
                )}
                {formItem.tipo_item === 'activo_fijo' && (
                  <div>
                    <label className="block text-xs font-bold text-h-tertiary uppercase tracking-wide mb-1.5">Tipo de activo</label>
                    <HSelect value={formItem.tipo_activo_nuevo}
                      onChange={v => setFormItem(f => ({ ...f, tipo_activo_nuevo: v }))}
                      options={[{ value: 'mueble', label: 'Mueble' }, { value: 'phantoma', label: 'Phantoma' }]}
                      className="w-full" />
                  </div>
                )}
              </>
            ) : (
              <div>
                <label className="block text-xs font-bold text-h-tertiary uppercase tracking-wide mb-1.5">
                  {formItem.tipo_item === 'insumo' ? 'Insumo / Implemento' : 'Activo Fijo'} *
                </label>
                {formItem.tipo_item === 'insumo' ? (
                  <HSelect value={formItem.insumo_id}
                    onChange={v => setFormItem(f => ({ ...f, insumo_id: v }))}
                    options={insumoOpts} placeholder="Buscar insumo..." className="w-full" />
                ) : (
                  <HSelect value={formItem.activo_fijo_id}
                    onChange={v => setFormItem(f => ({ ...f, activo_fijo_id: v }))}
                    options={activoOpts} placeholder="Buscar activo fijo..." className="w-full" />
                )}
              </div>
            )}
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="block text-xs font-bold text-h-tertiary uppercase tracking-wide mb-1.5">Cantidad *</label>
                <input type="number" min="1" value={formItem.cantidad_pedida}
                  onChange={e => setFormItem(f => ({ ...f, cantidad_pedida: e.target.value }))}
                  className={inputCls} placeholder="0" />
              </div>
              <div className="flex-1">
                <label className="block text-xs font-bold text-h-tertiary uppercase tracking-wide mb-1.5">Costo unit. ($)</label>
                <input type="number" min="0" value={formItem.costo_unitario}
                  onChange={e => setFormItem(f => ({ ...f, costo_unitario: e.target.value }))}
                  className={inputCls} placeholder="Opcional" />
              </div>
            </div>
            {formError && (
              <p className="text-sm px-3 py-2 rounded-lg border"
                style={{ background: 'var(--h-sem-danger-bg)', borderColor: 'var(--h-sem-danger-border)', color: 'var(--h-sem-danger-text)' }}>
                {formError}
              </p>
            )}
            <div className="flex gap-3 pt-1">
              <button onClick={() => setShowModalItem(false)}
                className="flex-1 py-2.5 rounded-xl border border-h-visible text-h-secondary font-bold"
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--h-bg-highlight)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>Cancelar</button>
              <button onClick={agregarItem} disabled={saving}
                className="flex-1 py-2.5 rounded-xl text-white font-bold disabled:opacity-50"
                style={{ background: 'var(--h-teal-rest)' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--h-teal-hover)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'var(--h-teal-rest)')}>
                {saving ? 'Agregando...' : 'Agregar'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* MODAL: Recepcion */}
      {showModalRecepcion && itemRecepcion && (
        <Modal
          title={`Recepci\u00f3n \u2014 ${itemRecepcion.insumo_nombre ?? itemRecepcion.nombre_nuevo ?? 'Item'}`}
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
