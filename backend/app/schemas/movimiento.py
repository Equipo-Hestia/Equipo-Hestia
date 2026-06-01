from pydantic import BaseModel, Field
from app.models.movimiento import TipoMovimiento, SubtipoMovimiento
from datetime import datetime


class MovimientoCreate(BaseModel):
    tipo: TipoMovimiento
    subtipo: SubtipoMovimiento
    cantidad: int = Field(gt=0)
    motivo: str | None = None
    insumo_id: int
    paquete_id: int | None = None
    sala_id: int | None = None


class MovimientoResponse(BaseModel):
    id: int
    tipo: TipoMovimiento
    subtipo: SubtipoMovimiento
    cantidad: int
    motivo: str | None = None
    fecha: datetime
    insumo_id: int
    usuario_id: int
    paquete_id: int | None = None
    sala_id: int | None = None

    class Config:
        from_attributes = True


class MovimientoEnriquecido(BaseModel):
    id: int
    tipo: TipoMovimiento
    subtipo: SubtipoMovimiento
    cantidad: int
    motivo: str | None = None
    fecha: datetime
    insumo: str
    sala: str | None = None
    usuario: str
    paquete_id: int | None = None

    class Config:
        from_attributes = True


# ---------------------------------------------------------------------------
# Entrega directa: retiro presencial sin solicitud previa
# ---------------------------------------------------------------------------

class EntregaDirectaItem(BaseModel):
    insumo_id: int
    cantidad: int = Field(gt=0)


class EntregaDirectaCreate(BaseModel):
    sala_id: int
    docente_id: int  # obligatorio para mantener trazabilidad
    items: list[EntregaDirectaItem] = Field(min_length=1)
    notas: str | None = None


class EntregaDirectaResponse(BaseModel):
    mensaje: str
    items_procesados: int
    retornos_pendientes: int  # implementos que quedaron con retorno pendiente
