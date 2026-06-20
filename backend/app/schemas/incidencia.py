from datetime import datetime
from pydantic import BaseModel
from app.models.incidencia import TipoIncidencia, SeveridadIncidencia, EstadoIncidencia


class IncidenciaCreate(BaseModel):
    activo_fijo_id: int
    tipo: TipoIncidencia
    descripcion: str
    sala_id: int
    responsable_nombre: str | None = None
    fecha_hora: datetime | None = None
    severidad: SeveridadIncidencia
    estado: EstadoIncidencia = EstadoIncidencia.abierta
    foto_b64: str | None = None


class IncidenciaUpdate(BaseModel):
    tipo: TipoIncidencia | None = None
    descripcion: str | None = None
    sala_id: int | None = None
    fecha_hora: datetime | None = None
    responsable_nombre: str | None = None
    severidad: SeveridadIncidencia | None = None
    estado: EstadoIncidencia | None = None
    foto_b64: str | None = None


class IncidenciaResponse(BaseModel):
    id: int
    activo_fijo_id: int
    activo_fijo_nombre: str | None = None
    activo_fijo_codigo: str | None = None
    tipo: TipoIncidencia
    descripcion: str
    sala_id: int | None = None
    sala_nombre: str | None = None
    fecha_hora: datetime
    responsable_nombre: str | None = None
    severidad: SeveridadIncidencia
    estado: EstadoIncidencia
    foto_b64: str | None = None
    activo: bool

    class Config:
        from_attributes = True
