from pydantic import BaseModel, Field


class AsignaturaCreate(BaseModel):
    nombre: str = Field(..., min_length=2)
    codigo: str = Field(..., min_length=2, max_length=20)


class AsignaturaUpdate(BaseModel):
    nombre: str | None = None
    codigo: str | None = None
    activa: bool | None = None


class AsignaturaResponse(BaseModel):
    id: int
    nombre: str
    codigo: str
    activa: bool

    class Config:
        from_attributes = True
