from datetime import datetime
from typing import Optional
from pydantic import BaseModel


class AuditLogResponse(BaseModel):
    id: int
    fecha: datetime
    accion: str
    entidad: Optional[str] = None
    entidad_id: Optional[int] = None
    detalle: Optional[str] = None
    ip: Optional[str] = None
    usuario_id: Optional[int] = None
    usuario_nombre: str

    class Config:
        from_attributes = True
