from pydantic import BaseModel
from datetime import datetime


class RetornoResponse(BaseModel):
    id: int
    insumo_id: int
    insumo_nombre: str
    solicitud_id: int | None
    docente_nombre: str | None
    sala_nombre: str | None
    cantidad: int
    fecha_retiro: datetime
    fecha_retorno: datetime | None
    estado: str
    operador_nombre: str | None
    notas: str | None

    class Config:
        from_attributes = True


class MarcarRetornoRequest(BaseModel):
    """Payload para marcar un implemento como retornado o no retornado.

    estado debe ser 'retornado' o 'no_retornado'.
    notas es opcional; util para registrar observaciones de merma.
    """
    estado: str
    notas: str | None = None
