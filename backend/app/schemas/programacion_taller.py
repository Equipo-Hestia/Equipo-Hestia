from __future__ import annotations
from pydantic import BaseModel
from datetime import date
from typing import Optional


class ProgramacionTallerCreate(BaseModel):
    taller_id: int
    sala_id: int
    fecha: date
    hora_inicio: Optional[str] = None
    hora_fin: Optional[str] = None
    docente_nombre: Optional[str] = None
    seccion: Optional[str] = None
    semestre: Optional[str] = None
    notas: Optional[str] = None


class ProgramacionTallerUpdate(BaseModel):
    taller_id: Optional[int] = None
    sala_id: Optional[int] = None
    fecha: Optional[date] = None
    hora_inicio: Optional[str] = None
    hora_fin: Optional[str] = None
    docente_nombre: Optional[str] = None
    seccion: Optional[str] = None
    semestre: Optional[str] = None
    notas: Optional[str] = None
    activo: Optional[bool] = None


class ProgramacionTallerResponse(BaseModel):
    id: int
    taller_id: int
    taller_nombre: Optional[str]
    asignatura_id: Optional[int]
    asignatura_nombre: Optional[str]
    sala_id: int
    sala_nombre: Optional[str]
    fecha: date
    hora_inicio: Optional[str]
    hora_fin: Optional[str]
    docente_nombre: Optional[str]
    seccion: Optional[str]
    semestre: Optional[str]
    notas: Optional[str]
    activo: bool

    class Config:
        from_attributes = True


class ImportarProgramacionResponse(BaseModel):
    importadas: int
    actualizadas: int
    omitidas: int
    errores: list[dict]
