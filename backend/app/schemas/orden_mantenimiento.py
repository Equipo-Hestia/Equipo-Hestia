from pydantic import BaseModel, Field
from app.models.orden_mantenimiento import EstadoOrden, TipoMantenimiento
from datetime import date


class OrdenMantenimientoCreate(BaseModel):
    activo_fijo_id: int
    proveedor_id: int | None = None
    tipo_mantenimiento: TipoMantenimiento | None = None
    fecha_envio: date
    fecha_retorno_estimada: date | None = None
    descripcion_problema: str | None = None
    notas: str | None = None


class OrdenMantenimientoUpdate(BaseModel):
    proveedor_id: int | None = None
    tipo_mantenimiento: TipoMantenimiento | None = None
    estado: EstadoOrden | None = None
    fecha_retorno_estimada: date | None = None
    fecha_retorno: date | None = None
    descripcion_trabajo: str | None = None
    costo: float | None = Field(default=None, ge=0)
    activo: bool | None = None


class OrdenMantenimientoResponse(BaseModel):
    id: int
    activo_fijo_id: int
    activo_fijo_nombre: str
    activo_fijo_codigo: str | None
    proveedor_id: int | None
    proveedor_nombre: str | None
    creado_por_id: int | None
    creado_por_nombre: str | None
    estado: EstadoOrden
    tipo_mantenimiento: TipoMantenimiento | None
    fecha_envio: date
    fecha_retorno_estimada: date | None
    fecha_retorno: date | None
    descripcion_problema: str | None
    descripcion_trabajo: str | None
    costo: float | None
    activo: bool

    class Config:
        from_attributes = True
