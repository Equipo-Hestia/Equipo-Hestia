from pydantic import BaseModel
from app.models.unidad_implemento import EstadoUnidad


class UnidadImplementoCreate(BaseModel):
    implemento_id: int
    notas: str | None = None
    # codigo se auto-genera; estado empieza siempre en disponible


class UnidadImplementoUpdate(BaseModel):
    estado: EstadoUnidad | None = None
    notas: str | None = None
    activo: bool | None = None


class UnidadImplementoResponse(BaseModel):
    id: int
    implemento_id: int
    implemento_nombre: str | None = None
    codigo: str | None = None
    estado: EstadoUnidad
    notas: str | None = None
    activo: bool

    class Config:
        from_attributes = True
