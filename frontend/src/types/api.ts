// ---------------------------------------------------------------------------
// EstadoOrden - sincronizado con modelo OrdenMantenimiento (backend)
// Estados actuales: en_curso | cerrada | cancelada
// ---------------------------------------------------------------------------
export type EstadoOrden = 'en_curso' | 'cerrada' | 'cancelada'

export const ETIQUETA_ESTADO_ORDEN: Record<EstadoOrden, string> = {
  en_curso:  'En curso',
  cerrada:   'Cerrada',
  cancelada: 'Cancelada',
}

export type ResultadoItem = 'pendiente' | 'ok' | 'sale_a_taller' | 'dar_de_baja'

export const ETIQUETA_RESULTADO_ITEM: Record<ResultadoItem, string> = {
  pendiente:     'Pendiente',
  ok:            'OK - Operativo',
  sale_a_taller: 'Sale a taller externo',
  dar_de_baja:   'Dar de baja',
}

export interface OrdenItemResponse {
  id: number
  activo_fijo_id: number
  activo_fijo_nombre: string
  activo_fijo_codigo: string | null
  resultado: ResultadoItem
  fecha_envio: string | null
  fecha_retorno_estimada: string | null
  fecha_retorno: string | null
  descripcion_problema: string | null
  descripcion_trabajo: string | null
  costo: number | null
}

export interface OrdenMantenimientoResponse {
  id: number
  proveedor_id: number | null
  proveedor_nombre: string | null
  creado_por_id: number | null
  creado_por_nombre: string | null
  estado: EstadoOrden
  fecha_visita: string
  notas: string | null
  activo: boolean
  items: OrdenItemResponse[]
}

export interface OrdenMantenimientoCreate {
  proveedor_id?: number | null
  activo_ids: number[]
  fecha_visita: string
  notas?: string | null
}

export interface OrdenMantenimientoUpdate {
  proveedor_id?: number | null
  notas?: string | null
}

export interface OrdenItemUpdate {
  resultado: ResultadoItem
  fecha_envio?: string | null
  fecha_retorno_estimada?: string | null
  fecha_retorno?: string | null
  descripcion_problema?: string | null
  descripcion_trabajo?: string | null
  costo?: number | null
}

// ---------------------------------------------------------------------------
// ProgramacionTaller - sincronizado con modelo ProgramacionTaller (backend)
// ---------------------------------------------------------------------------
export interface ProgramacionTallerResponse {
  id: number
  taller_id: number
  taller_nombre: string | null
  asignatura_id: number | null
  asignatura_nombre: string | null
  sala_id: number
  sala_nombre: string | null
  fecha: string
  hora_inicio: string | null
  hora_fin: string | null
  docente_nombre: string | null
  seccion: string | null
  semestre: string | null
  notas: string | null
  activo: boolean
}

export interface ProgramacionTallerCreate {
  taller_id: number
  sala_id: number
  fecha: string
  hora_inicio?: string | null
  hora_fin?: string | null
  docente_nombre?: string | null
  seccion?: string | null
  semestre?: string | null
  notas?: string | null
}

export interface ProgramacionTallerUpdate {
  taller_id?: number
  sala_id?: number
  fecha?: string
  hora_inicio?: string | null
  hora_fin?: string | null
  docente_nombre?: string | null
  seccion?: string | null
  semestre?: string | null
  notas?: string | null
  activo?: boolean
}

export interface ImportarProgramacionResponse {
  importadas: number
  actualizadas: number
  omitidas: number
  errores: { hoja: string; fila: number; razon: string }[]
}

// ---------------------------------------------------------------------------
// RevisionSala - sincronizado con schemas revision_sala (backend)
// ---------------------------------------------------------------------------
export interface RevisionItemResponse {
  id: number
  tipo: string
  nombre: string
  cantidad_esperada: number | null
  cantidad_encontrada: number | null
  conforme: boolean | null
  notas_item: string | null
}

export interface RevisionResumenResponse {
  id: number
  programacion_id: number | null
  sala_id: number
  sala_nombre: string | null
  fecha: string
  operador_id: number | null
  operador_nombre: string | null
  estado: string
  hora_inicio_rev: string | null
  hora_fin_rev: string | null
}

export interface RevisionSalaResponse extends RevisionResumenResponse {
  notas: string | null
  items: RevisionItemResponse[]
}

export interface RevisionSalaCreate {
  programacion_id: number
  notas?: string | null
}

export interface RevisionItemUpdate {
  cantidad_encontrada?: number | null
  conforme?: boolean | null
  notas_item?: string | null
}

// ---------------------------------------------------------------------------
// EstadoUnidad - UnidadImplemento
// ---------------------------------------------------------------------------
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

export interface GenerarLoteRequest {
  implemento_id: number
  cantidad: number
}

export interface GenerarLoteResponse {
  creadas: number
  codigos_generados: string[]
}

// ---------------------------------------------------------------------------
// Tipos TypeScript sincronizados con los schemas Pydantic del backend.
// ---------------------------------------------------------------------------

export interface LoginResponse {
  requires_2fa: boolean
  requires_2fa_setup?: boolean
  access_token: string | null
  token_type: string
  usuario: string | null
  rol: string | null
  pre_token: string | null
  recovery_codes?: string[] | null
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

export interface SalaHoy {
  sala_nombre: string
  taller_nombre: string
  hora_inicio: string | null
  hora_fin: string | null
  docente_nombre: string | null
  seccion: string | null
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

export type TipoMovimiento = 'entrada' | 'salida' | 'interno'

export type SubtipoMovimiento =
  | 'compra'
  | 'devolucion_proveedor_entrada'
  | 'ajuste_entrada'
  | 'consumo_taller'
  | 'prestamo_implemento'
  | 'devolucion_proveedor_salida'
  | 'baja'
  | 'ajuste_salida'
  | 'enviado_mantenimiento'
  | 'reingreso_disponible'
  | 'devolucion_interna'

export const SUBTIPOS_POR_TIPO: Record<TipoMovimiento, SubtipoMovimiento[]> = {
  entrada: ['compra', 'devolucion_proveedor_entrada', 'ajuste_entrada'],
  salida: [
    'consumo_taller', 'prestamo_implemento',
    'devolucion_proveedor_salida', 'baja', 'ajuste_salida',
  ],
  interno: ['enviado_mantenimiento', 'reingreso_disponible', 'devolucion_interna'],
}

export const ETIQUETA_SUBTIPO: Record<SubtipoMovimiento, string> = {
  compra: 'Compra a proveedor',
  devolucion_proveedor_entrada: 'Devolucion de proveedor (reingreso)',
  ajuste_entrada: 'Ajuste de inventario (sobrante)',
  consumo_taller: 'Consumo en taller',
  prestamo_implemento: 'Prestamo de implemento',
  devolucion_proveedor_salida: 'Devolucion a proveedor',
  baja: 'Baja definitiva',
  ajuste_salida: 'Ajuste de inventario (faltante)',
  enviado_mantenimiento: 'Enviado a mantenimiento',
  reingreso_disponible: 'Reingreso tras mantenimiento',
  devolucion_interna: 'Devolucion interna a bodega',
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

export type CarreraAsignatura =
  | 'TENS' | 'TQF' | 'TLCBS' | 'TONS' | 'preparador_fisico'

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
// Docente (entidad externa, no usuario del sistema)
// ---------------------------------------------------------------------------
export interface DocenteResponse {
  id: number
  nombre: string
  email: string
  rut: string | null
  telefono: string | null
  activo: boolean
  created_at: string
  num_clases: number
}

export interface DocenteCreate {
  nombre: string
  email: string
  rut?: string | null
  telefono?: string | null
}

export interface DocenteUpdate {
  nombre?: string
  email?: string
  rut?: string | null
  telefono?: string | null
  activo?: boolean
}

export type TipoComentario = 'positivo' | 'negativo' | 'neutro'

export interface ComentarioDocenteResponse {
  id: number
  docente_id: number
  tipo: TipoComentario
  contenido: string
  creado_por_id: number | null
  creado_por_nombre: string | null
  created_at: string
}

export interface ComentarioDocenteCreate {
  tipo: TipoComentario
  contenido: string
}

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
  insumo_unidad_medida: string | null
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
  items_sin_stock: string[]
}

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

export interface ProveedorResponse {
  id: number
  nombre: string
  rut: string | null
  contacto_nombre: string | null
  contacto_email: string | null
  telefono: string | null
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

// ---------------------------------------------------------------------------
// Incidencia - sincronizado con modelo Incidencia (backend)
// ---------------------------------------------------------------------------
export type TipoIncidencia =
  | 'dano_fisico'
  | 'pieza_perdida'
  | 'mal_funcionamiento'
  | 'otro'

export type SeveridadIncidencia = 'leve' | 'moderada' | 'critica'

export type EstadoIncidencia = 'abierta' | 'en_revision' | 'resuelta'

export interface IncidenciaResponse {
  id: number
  activo_fijo_id: number
  activo_fijo_nombre: string | null
  activo_fijo_codigo: string | null
  tipo: TipoIncidencia
  descripcion: string
  sala_id: number | null
  sala_nombre: string | null
  fecha_hora: string
  responsable_nombre: string | null
  severidad: SeveridadIncidencia
  estado: EstadoIncidencia
  foto_b64: string | null
  activo: boolean
}

export interface IncidenciaCreate {
  activo_fijo_id: number
  tipo: TipoIncidencia
  descripcion: string
  sala_id: number
  responsable_nombre?: string | null
  fecha_hora?: string | null
  severidad: SeveridadIncidencia
  estado?: EstadoIncidencia
  foto_b64?: string | null
}

export interface IncidenciaUpdate {
  tipo?: TipoIncidencia
  descripcion?: string
  sala_id?: number | null
  fecha_hora?: string | null
  responsable_nombre?: string | null
  severidad?: SeveridadIncidencia
  estado?: EstadoIncidencia
  foto_b64?: string | null
}
