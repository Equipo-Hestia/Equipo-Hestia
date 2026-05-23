from pydantic import BaseModel, Field
from typing import Optional
from app.models.asignatura import CarreraAsignatura


class AsignaturaCreate(BaseModel):
    nombre: str = Field(..., min_length=2)
    codigo: str = Field(..., min_length=2, max_length=20)
    carrera: Optional[CarreraAsignatura] = None


class AsignaturaUpdate(BaseModel):
    nombre: str | None = None
    codigo: str | None = None
    activa: bool | None = None
    carrera: Optional[CarreraAsignatura] = None


class AsignaturaResponse(BaseModel):
    id: int
    nombre: str
    codigo: str
    activa: bool
    carrera: Optional[CarreraAsignatura] = None

    class Config:
        from_attributes = True
