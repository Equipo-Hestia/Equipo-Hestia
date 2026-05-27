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
  tipo: 'entrada' | 'salida'
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

export type TipoMovimiento = 'entrada' | 'salida'

export interface MovimientoCreate {
  tipo: TipoMovimiento
  cantidad: number
  insumo_id: number
  motivo?: string | null
}

export interface MovimientoEnriquecido {
  id: number
  tipo: TipoMovimiento
  cantidad: number
  motivo: string | null
  fecha: string
  insumo: string
  sala: string | null
  usuario: string
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
// Solicitudes de retiro (flujo docente)
// ---------------------------------------------------------------------------

export type EstadoSolicitud = 'pendiente' | 'en_preparacion' | 'completada'

export interface SolicitudItemResponse {
  id: number
  insumo_id: number
  insumo_nombre: string
  stock_actual: number
  cantidad_solicitada: number
}

export interface SolicitudResponse {
  id: number
  docente_id: number
  docente_nombre: string
  sala_id: number
  sala_nombre: string
  fecha_clase: string
  estado: EstadoSolicitud
  notas: string | null
  notas_operador: string | null
  fecha_creacion: string
  fecha_completada: string | null
  items: SolicitudItemResponse[]
  minutos_hasta_clase: number
  // Trazabilidad academica (Fase 4)
  clase_docente_id: number | null
  asignatura_nombre: string | null
  seccion: string | null
  semestre: string | null
}

// ---------------------------------------------------------------------------
// Retornos de implementos (Fase 2)
// ---------------------------------------------------------------------------

export type EstadoRetorno = 'pendiente' | 'retornado' | 'no_retornado'

export interface RetornoResponse {
  id: number
  insumo_id: number
  insumo_nombre: string
  solicitud_id: number | null
  docente_nombre: string | null
  sala_nombre: string | null
  cantidad: number
  fecha_retiro: string
  fecha_retorno: string | null
  estado: EstadoRetorno
  operador_nombre: string | null
  notas: string | null
}

// ---------------------------------------------------------------------------
// Asignaturas y Clases Docente (Fase 4)
// ---------------------------------------------------------------------------

export type CarreraAsignatura = 'TENS' | 'TQF' | 'TLCBS' | 'preparador_fisico'

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
  // Horario (Fase 5)
  dia_semana: string | null
  hora_inicio: string | null
  hora_fin: string | null
}

// ---------------------------------------------------------------------------
// Reportes de valorizacion e inventario
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

// ---------------------------------------------------------------------------
// Importacion de horario academico
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Activos Fijos: muebles clinicos y phantomas (Fase 5)
// ---------------------------------------------------------------------------

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
  notas?: string | null
}

export interface ActivoFijoUpdate {
  nombre?: string
  descripcion?: string | null
  codigo_barras?: string | null
  estado?: EstadoActivo
  fidelidad?: FidelidadPhantoma | null
  sala_id?: number | null
  notas?: string | null
  activo?: boolean
}

// ---------------------------------------------------------------------------
// Entrega directa: retiro presencial sin solicitud previa (Fase 5)
// ---------------------------------------------------------------------------

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
