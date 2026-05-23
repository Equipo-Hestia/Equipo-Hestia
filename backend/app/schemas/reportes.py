from pydantic import BaseModel
from typing import Optional
from decimal import Decimal


class InsumoValorizado(BaseModel):
    id: int
    nombre: str
    sku: Optional[str]
    stock_actual: int
    costo_unitario: Decimal
    valor_total: Decimal
    sala: Optional[str]
    categoria: Optional[str]


class InsumoSinCosto(BaseModel):
    id: int
    nombre: str
    sku: Optional[str]
    stock_actual: int
    sala: Optional[str]
    categoria: Optional[str]


class GrupoValor(BaseModel):
    nombre: str
    valor_total: Decimal
    cantidad_insumos: int


class ValorizacionResponse(BaseModel):
    valor_total_inventario: Decimal
    total_insumos_valorados: int
    total_insumos_sin_costo: int
    por_categoria: list[GrupoValor]
    por_sala: list[GrupoValor]
    insumos: list[InsumoValorizado]
    insumos_sin_costo: list[InsumoSinCosto]


class CarreraConsumo(BaseModel):
    carrera: str
    costo_total: Decimal
    num_solicitudes: int
    num_estudiantes_total: int
    costo_por_estudiante: Optional[Decimal]


class ConsumoCarrerasResponse(BaseModel):
    semestre: str
    costo_total_semestre: Decimal
    carreras: list[CarreraConsumo]
