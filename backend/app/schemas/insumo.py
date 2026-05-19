from pydantic import BaseModel
from app.models.insumo import TipoInsumo


class InsumoCreate(BaseModel):
    nombre: str
    descripcion: str | None = None
    stock_actual: int = 0
    stock_minimo: int = 0
    sala_id: int | None = None
    categoria_id: int | None = None
    tipo: TipoInsumo = TipoInsumo.insumo
    sku: str | None = None
    codigo_barras: str | None = None
    costo_unitario: float | None = None


class InsumoUpdate(BaseModel):
    """Actualiza un insumo existente.

    activo es opcional: permite reactivar (true) un insumo previamente
    desactivado, sin pasar por el flujo DELETE con TOTP. La validacion
    de rol (solo admin puede tocar 'activo') se hace en el route handler.
    """
    nombre: str | None = None
    descripcion: str | None = None
    stock_actual: int | None = None
    stock_minimo: int | None = None
    sala_id: int | None = None
    categoria_id: int | None = None
    activo: bool | None = None
    tipo: TipoInsumo | None = None
    sku: str | None = None
    codigo_barras: str | None = None
    costo_unitario: float | None = None


class InsumoResponse(BaseModel):
    id: int
    nombre: str
    descripcion: str | None = None
    stock_actual: int
    stock_minimo: int
    sala_id: int | None = None
    categoria_id: int | None = None
    activo: bool = True
    tipo: TipoInsumo = TipoInsumo.insumo
    sku: str | None = None
    codigo_barras: str | None = None
    costo_unitario: float | None = None

    class Config:
        from_attributes = True
