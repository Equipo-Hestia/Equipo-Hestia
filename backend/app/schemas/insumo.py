from datetime import date
from pydantic import BaseModel, Field, field_validator
from app.models.insumo import TipoInsumo


class InsumoCreate(BaseModel):
    nombre: str
    descripcion: str | None = None
    stock_actual: int = Field(default=0, ge=0)
    stock_minimo: int = Field(default=0, ge=0)
    sala_id: int | None = None
    categoria_id: int | None = None
    tipo: TipoInsumo = TipoInsumo.insumo
    sku: str | None = None
    codigo_barras: str | None = None
    costo_unitario: float | None = None
    unidad_medida: str | None = None
    fecha_vencimiento: date | None = None


class InsumoUpdate(BaseModel):
    """Actualiza un insumo existente.

    activo es opcional: permite reactivar (true) un insumo previamente
    desactivado, sin pasar por el flujo DELETE con TOTP. La validacion
    de rol (solo admin puede tocar 'activo') se hace en el route handler.
    """
    nombre: str | None = None
    descripcion: str | None = None
    stock_actual: int | None = Field(default=None, ge=0)
    stock_minimo: int | None = Field(default=None, ge=0)
    sala_id: int | None = None
    categoria_id: int | None = None
    activo: bool | None = None
    tipo: TipoInsumo | None = None
    sku: str | None = None
    codigo_barras: str | None = None
    costo_unitario: float | None = None
    unidad_medida: str | None = None
    fecha_vencimiento: date | None = None

    @field_validator("stock_actual")
    @classmethod
    def _stock_actual_no_vacio(cls, valor):
        # Omitirlo deja el stock como esta; enviarlo explicitamente como null
        # lo dejaria vacio, y la columna es NOT NULL (migracion 0005).
        if valor is None:
            raise ValueError("El stock actual no puede quedar vacío.")
        return valor


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
    unidad_medida: str | None = None
    fecha_vencimiento: date | None = None

    class Config:
        from_attributes = True
