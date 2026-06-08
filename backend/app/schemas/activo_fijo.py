from pydantic import BaseModel
from app.models.activo_fijo import TipoActivo, EstadoActivo, FidelidadPhantoma


class ActivoFijoCreate(BaseModel):
    nombre: str
    descripcion: str | None = None
    tipo: TipoActivo
    codigo_barras: str | None = None
    estado: EstadoActivo = EstadoActivo.disponible
    fidelidad: FidelidadPhantoma | None = None
    sala_id: int | None = None
    proveedor_id: int | None = None
    notas: str | None = None


class ActivoFijoUpdate(BaseModel):
    nombre: str | None = None
    descripcion: str | None = None
    codigo_barras: str | None = None
    estado: EstadoActivo | None = None
    fidelidad: FidelidadPhantoma | None = None
    sala_id: int | None = None
    proveedor_id: int | None = None
    notas: str | None = None
    activo: bool | None = None


class ActivoFijoResponse(BaseModel):
    id: int
    nombre: str
    descripcion: str | None = None
    tipo: TipoActivo
    codigo_interno: str | None = None
    codigo_barras: str | None = None
    estado: EstadoActivo
    fidelidad: FidelidadPhantoma | None = None
    sala_id: int | None = None
    sala_nombre: str | None = None
    proveedor_id: int | None = None
    proveedor_nombre: str | None = None
    notas: str | None = None
    activo: bool

    class Config:
        from_attributes = True
