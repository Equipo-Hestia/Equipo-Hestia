from pydantic import BaseModel, Field
from typing import Optional


class ClaseDocenteCreate(BaseModel):
    docente_id: int
    asignatura_id: int
    seccion: str = Field(..., min_length=1, max_length=10)
    semestre: str = Field(..., min_length=4, max_length=10)  # Ej: "2025-1"
    num_estudiantes: Optional[int] = None


class ClaseDocenteUpdate(BaseModel):
    seccion: str | None = None
    semestre: str | None = None
    activa: bool | None = None
    num_estudiantes: Optional[int] = None


class ClaseDocenteResponse(BaseModel):
    """Representacion completa de una clase asignada, con datos denormalizados
    de docente y asignatura para evitar lookups adicionales en el frontend.
    """
    id: int
    docente_id: int
    docente_nombre: str
    asignatura_id: int
    asignatura_nombre: str
    asignatura_codigo: str
    seccion: str
    semestre: str
    activa: bool
    num_estudiantes: Optional[int] = None
    dia_semana: Optional[str] = None
    hora_inicio: Optional[str] = None
    hora_fin: Optional[str] = None

    class Config:
        from_attributes = True
