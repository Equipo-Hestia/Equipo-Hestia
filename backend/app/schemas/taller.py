from pydantic import BaseModel, Field
from typing import Optional


class TallerCreate(BaseModel):
    nombre: str = Field(..., min_length=2, max_length=200)
    descripcion: Optional[str] = None
    asignatura_id: Optional[int] = None


class TallerUpdate(BaseModel):
    nombre: Optional[str] = Field(None, min_length=2, max_length=200)
    descripcion: Optional[str] = None
    asignatura_id: Optional[int] = None
    activo: Optional[bool] = None


class TallerResponse(BaseModel):
    id: int
    nombre: str
    descripcion: Optional[str] = None
    asignatura_id: Optional[int] = None
    asignatura_nombre: Optional[str] = None
    asignatura_codigo: Optional[str] = None
    activo: bool

    class Config:
        from_attributes = True
