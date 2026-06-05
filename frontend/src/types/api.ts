export type EstadoUnidad = 'disponible' | 'en_uso' | 'dado_de_baja'

export interface UnidadImplementoResponse {
  id: number
  implemento_id: number
  implemento_nombre: string | null
  codigo: string | null
  estado: EstadoUnidad
  sala_id: number | null
  sala_nombre: string | null
  notas: string | null
  activo: boolean
}

export interface UnidadImplementoCreate {
  implemento_id: number
  sala_id?: number | null
  notas?: string | null
}

export interface UnidadImplementoUpdate {
  estado?: EstadoUnidad
  sala_id?: number | null
  notas?: string | null
  activo?: boolean
}

// ---------------------------------------------------------------------------
// Tipos TypeScript sincronizados con los schemas Pydantic del backend.
// ---------------------------------------------------------------------------

export interface LoginResponse {
  requires_2fa: boolean
  access_token: string | null
  token_type: string
  usuario: string | null
  rol: string | null
  pre_token: string | null
}

export interface UsuarioMe {
  id: number
  nombre: string
  email: string
  rol: string
  totp_habilitado: boolean
  activo: boolean
  avatar_b64: string | null
}

export interface Setup2FAResponse {
  qr_code: string
  secret: string
}

export interface ActivarResponse {
  mensaje: string
  recovery_codes: string[]
}

export interface ResumenResponse {
  total_insumos: number
  insumos_bajo_stock: number
  insumos_agotados: number
  movimientos_hoy: number
  entradas_hoy: number
  salidas_hoy: number
  total_salas: number
  total_usuarios: number
}

export interface DiaMovimiento {
  fecha: string
  entradas: number
  salidas: number
}

export interface ActividadReciente {
  id: number
  tipo: TipoMovimiento
  subtipo: SubtipoMovimiento
  insumo: string
  sala: string | null
  cantidad: number
  usuario: string
  fecha: string
}

export interface TopInsumo {
  nombre: string
  total_salidas: number
  sala: string | null
}

export type TipoInsumo = 'insumo' | 'implemento'

export interface InsumoAlerta {
  id: number
  nombre: string
  stock_actual: number
  stock_minimo: number
  deficit: number
  sala: string | null
  categoria: string | null
  tipo: string
}

export interface InsumoResponse {
  id: number
  nombre: string
  descripcion: string | null
  stock_actual: number
  stock_minimo: number
  sala_id: number | null
  categoria_id: number | null
  activo: boolean
  tipo: TipoInsumo
  sku: string | null
  codigo_barras: string | null
  costo_unitario: number | null
  unidad_medida: string | null
  fecha_vencimiento: string | null
}

export interface SalaResponse {
  id: number
  nombre: string
  tipo: string | null
  descripcion: string | null
}

export interface SalaCreate {
  nombre: string
  tipo?: string | null
  descripcion?: string | null
}

export interface CategoriaResponse {
  id: number
  nombre: string
}

export interface CategoriaCreate {
  nombre: string
}

// Tipo base del movimiento: direcci\u00f3n del flujo
export type TipoMovimiento = 'entrada' | 'salida' | 'interno'

// Subtipo: motivo espec\u00edfico que detalla el tipo base
export type SubtipoMovimiento =
  // Entradas
  | 'compra'
  | 'devolucion_proveedor_entrada'
  | 'ajuste_entrada'
  // Salidas
  | 'consumo_taller'
  | 'prestamo_implemento'
  | 'devolucion_proveedor_salida'
  | 'baja'
  | 'ajuste_salida'
  // Internos
  | 'enviado_mantenimiento'
  | 'reingreso_disponible'
  | 'devolucion_interna'

/** Mapa de subtipos v\u00e1lidos por tipo base. \u00datil para poblar selects. */
export const SUBTIPOS_POR_TIPO: Record<TipoMovimiento, SubtipoMovimiento[]> = {
  entrada: ['compra', 'devolucion_proveedor_entrada', 'ajuste_entrada'],
  salida: [
    'consumo_taller',
    'prestamo_implemento',
    'devolucion_proveedor_salida',
    'baja',
    'ajuste_salida',
  ],
  interno: ['enviado_mantenimiento', 'reingreso_disponible', 'devolucion_interna'],
}

/** Etiquetas en espa\u00f1ol para mostrar en la UI */
export const ETIQUETA_SUBTIPO: Record<SubtipoMovimiento, string> = {
  compra: 'Compra a proveedor',
  devolucion_proveedor_entrada: 'Devoluci\u00f3n de proveedor (reingreso)',
  ajuste_entrada: 'Ajuste de inventario (sobrante)',
  consumo_taller: 'Consumo en taller',
  prestamo_implemento: 'Pr\u00e9stamo de implemento',
  devolucion_proveedor_salida: 'Devoluci\u00f3n a proveedor',
  baja: 'Baja definitiva',
  ajuste_salida: 'Ajuste de inventario (faltante)',
  enviado_mantenimiento: 'Enviado a mantenimiento',
  reingreso_disponible: 'Reingreso tras mantenimiento',
  devolucion_interna: 'Devoluci\u00f3n interna a bodega',
}

export interface MovimientoCreate {
  tipo: TipoMovimiento
  subtipo: SubtipoMovimiento
  cantidad: number
  insumo_id: number
  motivo?: string | null
  paquete_id?: number | null
  sala_id?: number | null
}

export interface MovimientoEnriquecido {
  id: number
  tipo: TipoMovimiento
  subtipo: SubtipoMovimiento
  cantidad: number
  motivo: string | null
  fecha: string
  insumo: string
  sala: string | null
  usuario: string
  paquete_id: number | null
}

export interface AuditLogEntry {
  id: number
  fecha: string
  accion: string
  entidad: string | null
  entidad_id: number | null
  detalle: string | null
  ip: string | null
  usuario_id: number | null
  usuario_nombre: string
}

export interface PaginatedResponse<T> {
  total: number
  skip: number
  limit: number
  data: T[]
}

// ---------------------------------------------------------------------------
// Asignaturas y Clases Docente
// ---------------------------------------------------------------------------

export type CarreraAsignatura =
  | 'TENS'
  | 'TQF'
  | 'TLCBS'
  | 'TONS'
  | 'preparador_fisico'

export interface AsignaturaResponse {
  id: number
  nombre: string
  codigo: string
  activa: boolean
  carrera: CarreraAsignatura | null
}

export interface ClaseDocenteResponse {
  id: number
  docente_id: number
  docente_nombre: string
  asignatura_id: number
  asignatura_nombre: string
  asignatura_codigo: string
  seccion: string
  semestre: string
  activa: boolean
  num_estudiantes: number | null
  dia_semana: string | null
  hora_inicio: string | null
  hora_fin: string | null
}

// ---------------------------------------------------------------------------
// Talleres y Paquetes de insumos (Gu\u00eda de Taller)
// ---------------------------------------------------------------------------

export interface TallerResponse {
  id: number
  nombre: string
  descripcion: string | null
  asignatura_id: number | null
  asignatura_nombre: string | null
  asignatura_codigo: string | null
  activo: boolean
}

export interface TallerCreate {
  nombre: string
  descripcion?: string | null
  asignatura_id?: number | null
}

export interface TallerUpdate {
  nombre?: string
  descripcion?: string | null
  asignatura_id?: number | null
  activo?: boolean
}

export interface PaqueteItemResponse {
  id: number
  insumo_id: number
  insumo_nombre: string
  insumo_tipo: TipoInsumo
  /** Unidad de medida registrada en el insumo (ej: 'caja x100', 'frasco 500 mL') */
  insumo_unidad_medida: string | null
  /** Costo unitario del insumo para calcular el costo estimado del paquete */
  insumo_costo_unitario: number | null
  cantidad_requerida: number
  notas: string | null
}

export interface PaqueteResponse {
  id: number
  taller_id: number
  taller_nombre: string
  semestre: string
  bloqueado: boolean
  notas: string | null
  fecha_creacion: string
  creado_por_nombre: string | null
  items: PaqueteItemResponse[]
}

export interface PaqueteCreate {
  taller_id: number
  semestre: string
  notas?: string | null
  items?: { insumo_id: number; cantidad_requerida: number; notas?: string | null }[]
}

export interface PaqueteItemCreate {
  insumo_id: number
  cantidad_requerida: number
  notas?: string | null
}

// ---------------------------------------------------------------------------
// Checklist de preparaci\u00f3n de taller
// ---------------------------------------------------------------------------

export interface ChecklistItemResponse {
  item_id: number
  insumo_id: number
  insumo_nombre: string
  insumo_tipo: TipoInsumo
  cantidad_requerida: number
  stock_actual: number
  notas_guia: string | null
}

export interface ChecklistResponse {
  paquete_id: number
  taller_nombre: string
  semestre: string
  bloqueado: boolean
  items: ChecklistItemResponse[]
}

export interface ConfirmarPreparacionItem {
  insumo_id: number
  cantidad: number
}

export interface ConfirmarPreparacionCreate {
  faltantes: ConfirmarPreparacionItem[]
  sala_id?: number | null
  notas?: string | null
}

export interface ConfirmarPreparacionResponse {
  mensaje: string
  movimientos_generados: number
  /** Nombres de insumos con stock insuficiente que no pudieron retirarse */
  items_sin_stock: string[]
}

// ---------------------------------------------------------------------------
// Reportes
// ---------------------------------------------------------------------------

export interface InsumoValorizado {
  id: number
  nombre: string
  sku: string | null
  stock_actual: number
  costo_unitario: number
  valor_total: number
  sala: string | null
  categoria: string | null
}

export interface InsumoSinCosto {
  id: number
  nombre: string
  sku: string | null
  stock_actual: number
  sala: string | null
  categoria: string | null
}

export interface GrupoValor {
  nombre: string
  valor_total: number
  cantidad_insumos: number
}

export interface ValorizacionResponse {
  valor_total_inventario: number
  total_insumos_valorados: number
  total_insumos_sin_costo: number
  por_categoria: GrupoValor[]
  por_sala: GrupoValor[]
  insumos: InsumoValorizado[]
  insumos_sin_costo: InsumoSinCosto[]
}

export interface CarreraConsumo {
  carrera: string
  costo_total: number
  num_solicitudes: number
  num_estudiantes_total: number
  costo_por_estudiante: number | null
}

export interface ConsumoCarrerasResponse {
  semestre: string
  costo_total_semestre: number
  carreras: CarreraConsumo[]
}

export interface HorarioFila {
  email_docente: string
  codigo_asignatura: string
  seccion: string
  semestre: string
  sala?: string
  dia_semana?: string
  hora_inicio?: string
  hora_fin?: string
}

export interface HorarioImportResponse {
  importados: number
  actualizados: number
  omitidos: number
  errores: { fila: number; razon: string }[]
}

export type TipoActivo = 'mueble' | 'phantoma'
export type EstadoActivo = 'disponible' | 'en_uso' | 'en_mantenimiento' | 'dado_de_baja'
export type FidelidadPhantoma = 'baja' | 'media' | 'alta'

export interface ActivoFijoResponse {
  id: number
  nombre: string
  descripcion: string | null
  tipo: TipoActivo
  codigo_interno: string | null
  codigo_barras: string | null
  estado: EstadoActivo
  fidelidad: FidelidadPhantoma | null
  sala_id: number | null
  sala_nombre: string | null
  proveedor_id: number | null
  proveedor_nombre: string | null
  notas: string | null
  activo: boolean
}

export interface ActivoFijoCreate {
  nombre: string
  descripcion?: string | null
  tipo: TipoActivo
  codigo_barras?: string | null
  estado?: EstadoActivo
  fidelidad?: FidelidadPhantoma | null
  sala_id?: number | null
  proveedor_id?: number | null
  notas?: string | null
}

export interface ActivoFijoUpdate {
  nombre?: string
  descripcion?: string | null
  codigo_barras?: string | null
  estado?: EstadoActivo
  fidelidad?: FidelidadPhantoma | null
  sala_id?: number | null
  proveedor_id?: number | null
  notas?: string | null
  activo?: boolean
}

export interface EntregaDirectaItem {
  insumo_id: number
  cantidad: number
}

export interface EntregaDirectaCreate {
  sala_id: number
  docente_id: number
  items: EntregaDirectaItem[]
  notas?: string | null
}

export interface EntregaDirectaResponse {
  mensaje: string
  items_procesados: number
  retornos_pendientes: number
}

// ---------------------------------------------------------------------------
// Proveedores
// ---------------------------------------------------------------------------

export interface ProveedorResponse {
  id: number
  nombre: string
  rut: string | null
  contacto_nombre: string | null
  contacto_email: string | null
  telefono: string | null
  /** URL al perfil del proveedor en SeNegocia.com */
  url_seneg: string | null
  notas: string | null
  activo: boolean
}

export interface ProveedorCreate {
  nombre: string
  rut?: string | null
  contacto_nombre?: string | null
  contacto_email?: string | null
  telefono?: string | null
  url_seneg?: string | null
  notas?: string | null
}

export interface ProveedorUpdate {
  nombre?: string
  rut?: string | null
  contacto_nombre?: string | null
  contacto_email?: string | null
  telefono?: string | null
  url_seneg?: string | null
  notas?: string | null
  activo?: boolean
}

// ---------------------------------------------------------------------------
// \u00d3rdenes de Mantenimiento
// ---------------------------------------------------------------------------

export type EstadoOrden = 'enviado' | 'en_proceso' | 'completado' | 'cancelado'

export const ETIQUETA_ESTADO_ORDEN: Record<EstadoOrden, string> = {
  enviado: 'Enviado al proveedor',
  en_proceso: 'En proceso',
  completado: 'Completado',
  cancelado: 'Cancelado',
}

export interface OrdenMantenimientoResponse {
  id: number
  activo_fijo_id: number
  activo_fijo_nombre: string
  activo_fijo_codigo: string | null
  proveedor_id: number | null
  proveedor_nombre: string | null
  creado_por_id: number | null
  creado_por_nombre: string | null
  estado: EstadoOrden
  fecha_envio: string
  fecha_retorno: string | null
  descripcion_problema: string | null
  descripcion_trabajo: string | null
  costo: number | null
  activo: boolean
}

export interface OrdenMantenimientoCreate {
  activo_fijo_id: number
  proveedor_id?: number | null
  fecha_envio: string
  descripcion_problema?: string | null
}

export interface OrdenMantenimientoUpdate {
  proveedor_id?: number | null
  estado?: EstadoOrden
  fecha_retorno?: string | null
  descripcion_trabajo?: string | null
  costo?: number | null
  activo?: boolean
}

// ---------------------------------------------------------------------------
// Vencimientos (Alertas)
// ---------------------------------------------------------------------------

export interface InsumoVencimiento {
  id: number
  nombre: string
  sku: string | null
  stock_actual: number
  fecha_vencimiento: string
  dias_para_vencer: number
  vencido: boolean
  sala: string | null
  categoria: string | null
  tipo: string
}
