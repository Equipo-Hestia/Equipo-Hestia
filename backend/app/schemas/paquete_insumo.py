from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime


# ---------------------------------------------------------------------------
# Paquete
# ---------------------------------------------------------------------------

class PaqueteItemCreate(BaseModel):
    insumo_id: int
    cantidad_requerida: int = Field(..., ge=1)
    notas: Optional[str] = None


class PaqueteItemResponse(BaseModel):
    id: int
    insumo_id: int
    insumo_nombre: str
    insumo_tipo: str
    cantidad_requerida: int
    notas: Optional[str] = None

    class Config:
        from_attributes = True


class PaqueteCreate(BaseModel):
    taller_id: int
    semestre: str = Field(..., min_length=4, max_length=10)
    notas: Optional[str] = None
    items: List[PaqueteItemCreate] = Field(default_factory=list)


class PaqueteUpdate(BaseModel):
    notas: Optional[str] = None
    bloqueado: Optional[bool] = None


class PaqueteResponse(BaseModel):
    id: int
    taller_id: int
    taller_nombre: str
    semestre: str
    bloqueado: bool
    notas: Optional[str] = None
    fecha_creacion: datetime
    creado_por_nombre: Optional[str] = None
    items: List[PaqueteItemResponse] = []

    class Config:
        from_attributes = True
