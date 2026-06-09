from pydantic import BaseModel
from typing import Optional


class ClaseDocenteCreate(BaseModel):
    docente_id: int
    asignatura_id: int
    seccion: str
    semestre: str


class ClaseDocenteUpdate(BaseModel):
    seccion: Optional[str] = None
    semestre: Optional[str] = None
    activa: Optional[bool] = None
    num_estudiantes: Optional[int] = None
    dia_semana: Optional[str] = None
    hora_inicio: Optional[str] = None
    hora_fin: Optional[str] = None


class ClaseDocenteResponse(BaseModel):
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
