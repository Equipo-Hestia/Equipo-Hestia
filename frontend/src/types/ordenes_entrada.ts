// Tipos para el modulo de Ordenes de Entrada
// Sincronizados con backend/app/schemas/orden_entrada.py

export type TipoOrden = 'semanal' | 'semestral' | 'emergencia'
export type EstadoOrdenEntrada =
  | 'borrador' | 'confirmada' | 'en_recepcion' | 'cerrada' | 'cancelada'
export type EstadoItemOrden =
  | 'pendiente' | 'recibido' | 'recibido_parcial' | 'cancelado'
export type TipoItemOrden = 'insumo' | 'activo_fijo'

export const ETIQUETA_TIPO_ORDEN: Record<TipoOrden, string> = {
  semanal:   'Semanal',
  semestral: 'Semestral',
  emergencia: 'Emergencia',
}

export const ETIQUETA_ESTADO_ORDEN_ENTRADA: Record<EstadoOrdenEntrada, string> = {
  borrador:     'Borrador',
  confirmada:   'Confirmada',
  en_recepcion: 'En recepción',
  cerrada:      'Cerrada',
  cancelada:    'Cancelada',
}

export const ACTIVIDADES_DUOC: { codigo: string; nombre: string }[] = [
  { codigo: '1010', nombre: 'Materiales de enseñanza - talleres y laboratorios' },
  { codigo: '1060', nombre: 'Mantenciones varias de Equipos de Enseñanza' },
  { codigo: '1064', nombre: 'Materiales e insumos varios' },
  { codigo: '1084', nombre: 'Artículos escritorio, papelería y computación' },
  { codigo: '1137', nombre: 'Insumos académicos y tecnología' },
]

export interface OrdenEntradaItemResponse {
  id: number
  orden_id: number
  tipo_item: TipoItemOrden
  insumo_id: number | null
  insumo_nombre: string | null
  activo_fijo_id: number | null
  activo_fijo_nombre: string | null
  nombre_nuevo: string | null
  tipo_insumo_nuevo: string | null
  tipo_activo_nuevo: string | null
  cantidad_pedida: number
  cantidad_recibida: number | null
  costo_unitario: number | null
  estado: EstadoItemOrden
  notas_item: string | null
}

export interface OrdenEntradaResponse {
  id: number
  proveedor_id: number | null
  proveedor_nombre: string | null
  actividad_duoc: string | null
  actividad_nombre: string | null
  tipo: TipoOrden
  estado: EstadoOrdenEntrada
  notas: string | null
  creado_por_id: number | null
  creado_por_nombre: string | null
  cerrado_por_id: number | null
  cerrado_por_nombre: string | null
  created_at: string
  fecha_cierre: string | null
  items: OrdenEntradaItemResponse[]
  total_pedido: number
  total_recibido: number
}

export interface OrdenEntradaCreate {
  proveedor_id?: number | null
  actividad_duoc?: string | null
  tipo: TipoOrden
  notas?: string | null
  items: OrdenEntradaItemCreate[]
}

export interface OrdenEntradaItemCreate {
  tipo_item: TipoItemOrden
  insumo_id?: number | null
  activo_fijo_id?: number | null
  nombre_nuevo?: string | null
  tipo_insumo_nuevo?: string | null
  tipo_activo_nuevo?: string | null
  cantidad_pedida: number
  costo_unitario?: number | null
  notas_item?: string | null
}

export interface OrdenEntradaItemUpdate {
  cantidad_recibida?: number | null
  costo_unitario?: number | null
  notas_item?: string | null
}
