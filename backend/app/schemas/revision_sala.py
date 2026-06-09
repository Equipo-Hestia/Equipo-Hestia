from __future__ import annotations
from pydantic import BaseModel
from datetime import date
from typing import Optional


class RevisionItemUpdate(BaseModel):
    cantidad_encontrada: Optional[int] = None
    conforme: Optional[bool] = None
    notas_item: Optional[str] = None


class RevisionItemResponse(BaseModel):
    id: int
    tipo: str
    nombre: str
    cantidad_esperada: Optional[int]
    cantidad_encontrada: Optional[int]
    conforme: Optional[bool]
    notas_item: Optional[str]

    class Config:
        from_attributes = True


class RevisionSalaCreate(BaseModel):
    programacion_id: int
    notas: Optional[str] = None


class RevisionSalaResponse(BaseModel):
    id: int
    programacion_id: Optional[int]
    sala_id: int
    sala_nombre: Optional[str]
    fecha: date
    operador_id: Optional[int]
    operador_nombre: Optional[str]
    estado: str
    hora_inicio_rev: Optional[str]
    hora_fin_rev: Optional[str]
    notas: Optional[str]
    items: list[RevisionItemResponse] = []

    class Config:
        from_attributes = True


class RevisionResumenResponse(BaseModel):
    """Version ligera sin items para el mapa (GET /revisiones/hoy)."""
    id: int
    programacion_id: Optional[int]
    sala_id: int
    sala_nombre: Optional[str]
    fecha: date
    operador_id: Optional[int]
    operador_nombre: Optional[str]
    estado: str
    hora_inicio_rev: Optional[str]
    hora_fin_rev: Optional[str]

    class Config:
        from_attributes = True
