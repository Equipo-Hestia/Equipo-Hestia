from __future__ import annotations
from pydantic import BaseModel, Field
from app.models.orden_mantenimiento import EstadoOrden, ResultadoItem
from datetime import date
from typing import Optional, List


# ── Ítems ───────────────────────────────────────────────────────────────────

class OrdenItemResponse(BaseModel):
    id: int
    activo_fijo_id: int
    activo_fijo_nombre: str
    activo_fijo_codigo: Optional[str]
    resultado: ResultadoItem
    fecha_envio: Optional[date]
    fecha_retorno_estimada: Optional[date]
    fecha_retorno: Optional[date]
    descripcion_problema: Optional[str]
    descripcion_trabajo: Optional[str]
    costo: Optional[float]

    class Config:
        from_attributes = True


class OrdenItemUpdate(BaseModel):
    """Payload para actualizar el resultado de un ítem al cerrar la orden."""
    resultado: ResultadoItem
    fecha_envio: Optional[date] = None
    fecha_retorno_estimada: Optional[date] = None
    fecha_retorno: Optional[date] = None
    descripcion_problema: Optional[str] = None
    descripcion_trabajo: Optional[str] = None
    costo: Optional[float] = Field(default=None, ge=0)


# ── Cabecera ─────────────────────────────────────────────────────────────────

class OrdenMantenimientoCreate(BaseModel):
    """Apertura de una visita de mantenimiento.

    activo_ids: lista de IDs de Phantomas a incluir (mín. 1).
    """
    proveedor_id: Optional[int] = None
    activo_ids: List[int] = Field(..., min_length=1)
    fecha_visita: date
    notas: Optional[str] = None


class OrdenMantenimientoUpdate(BaseModel):
    """Edición menor de la cabecera (proveedor, notas)."""
    proveedor_id: Optional[int] = None
    notas: Optional[str] = None


class OrdenMantenimientoResponse(BaseModel):
    id: int
    proveedor_id: Optional[int]
    proveedor_nombre: Optional[str]
    creado_por_id: Optional[int]
    creado_por_nombre: Optional[str]
    estado: EstadoOrden
    fecha_visita: date
    notas: Optional[str]
    activo: bool
    items: List[OrdenItemResponse]

    class Config:
        from_attributes = True
