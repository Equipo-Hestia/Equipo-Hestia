from pydantic import BaseModel, Field
from datetime import datetime
from typing import Optional
from app.models.solicitud import EstadoSolicitud


# ---------------------------------------------------------------------------
# Items
# ---------------------------------------------------------------------------

class SolicitudItemCreate(BaseModel):
    insumo_id: int = Field(..., gt=0)
    cantidad_solicitada: int = Field(..., gt=0, description="Debe ser mayor a 0")


class SolicitudItemResponse(BaseModel):
    id: int
    insumo_id: int
    insumo_nombre: str
    stock_actual: int
    cantidad_solicitada: int

    class Config:
        from_attributes = True


# ---------------------------------------------------------------------------
# Solicitud
# ---------------------------------------------------------------------------

class SolicitudCreate(BaseModel):
    """Payload que envia el docente al crear una solicitud.

    clase_docente_id es opcional. Si se provee, debe pertenecer al docente
    autenticado y estar activa. Permite ligar la solicitud a una asignatura
    y seccion especificas para trazabilidad y reportes.
    """
    sala_id: int = Field(..., gt=0)
    fecha_clase: datetime
    notas: Optional[str] = None
    clase_docente_id: Optional[int] = None
    items: list[SolicitudItemCreate] = Field(
        ..., min_length=1, description="Debe tener al menos un insumo"
    )


class SolicitudResponse(BaseModel):
    id: int
    docente_id: int
    docente_nombre: str
    sala_id: int
    sala_nombre: str
    fecha_clase: datetime
    estado: EstadoSolicitud
    notas: Optional[str]
    notas_operador: Optional[str]
    fecha_creacion: datetime
    fecha_completada: Optional[datetime]
    items: list[SolicitudItemResponse]
    minutos_hasta_clase: int
    # Campos de trazabilidad academica (Fase 4)
    clase_docente_id: Optional[int] = None
    asignatura_nombre: Optional[str] = None
    seccion: Optional[str] = None
    semestre: Optional[str] = None

    class Config:
        from_attributes = True


class SolicitudUpdateEstado(BaseModel):
    notas_operador: Optional[str] = None
