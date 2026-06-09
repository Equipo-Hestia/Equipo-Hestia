from pydantic import BaseModel, EmailStr
from typing import Optional
from datetime import datetime


# ---------------------------------------------------------------------------
# Docente
# ---------------------------------------------------------------------------

class DocenteCreate(BaseModel):
    nombre:   str
    email:    EmailStr
    rut:      Optional[str] = None
    telefono: Optional[str] = None


class DocenteUpdate(BaseModel):
    nombre:   Optional[str]      = None
    email:    Optional[EmailStr] = None
    rut:      Optional[str]      = None
    telefono: Optional[str]      = None
    activo:   Optional[bool]     = None


class DocenteResponse(BaseModel):
    id:           int
    nombre:       str
    email:        str
    rut:          Optional[str] = None
    telefono:     Optional[str] = None
    activo:       bool
    created_at:   datetime
    num_clases:   int = 0

    class Config:
        from_attributes = True


# ---------------------------------------------------------------------------
# ComentarioDocente
# ---------------------------------------------------------------------------

class ComentarioCreate(BaseModel):
    tipo:      str  # positivo | negativo | neutro
    contenido: str


class ComentarioResponse(BaseModel):
    id:                int
    docente_id:        int
    tipo:              str
    contenido:         str
    creado_por_id:     Optional[int]  = None
    creado_por_nombre: Optional[str]  = None
    created_at:        datetime

    class Config:
        from_attributes = True
