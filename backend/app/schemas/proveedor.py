from pydantic import BaseModel, Field, EmailStr
from datetime import datetime


class ProveedorBase(BaseModel):
    nombre: str = Field(min_length=1, max_length=200)
    rut: str | None = Field(default=None, max_length=12)
    contacto_nombre: str | None = Field(default=None, max_length=150)
    contacto_email: str | None = None
    telefono: str | None = Field(default=None, max_length=20)
    url_seneg: str | None = Field(default=None, max_length=300)
    notas: str | None = None


class ProveedorCreate(ProveedorBase):
    pass


class ProveedorUpdate(BaseModel):
    nombre: str | None = Field(default=None, min_length=1, max_length=200)
    rut: str | None = Field(default=None, max_length=12)
    contacto_nombre: str | None = None
    contacto_email: str | None = None
    telefono: str | None = None
    url_seneg: str | None = None
    notas: str | None = None
    activo: bool | None = None


class ProveedorResponse(ProveedorBase):
    id: int
    activo: bool

    class Config:
        from_attributes = True
