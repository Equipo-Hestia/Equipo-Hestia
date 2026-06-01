from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime


# ---------------------------------------------------------------------------
# Paquete
# ---------------------------------------------------------------------------

class PaqueteItemCreate(BaseModel):
    insumo_id: int
    cantidad_requerida: int = Field(..., ge=1)
    notas: Optional[str] = None


class PaqueteItemResponse(BaseModel):
    id: int
    insumo_id: int
    insumo_nombre: str
    insumo_tipo: str
    cantidad_requerida: int
    notas: Optional[str] = None

    class Config:
        from_attributes = True


class PaqueteCreate(BaseModel):
    taller_id: int
    semestre: str = Field(..., min_length=4, max_length=10)
    notas: Optional[str] = None
    items: List[PaqueteItemCreate] = Field(default_factory=list)


class PaqueteUpdate(BaseModel):
    notas: Optional[str] = None
    bloqueado: Optional[bool] = None


class PaqueteResponse(BaseModel):
    id: int
    taller_id: int
    taller_nombre: str
    semestre: str
    bloqueado: bool
    notas: Optional[str] = None
    fecha_creacion: datetime
    creado_por_nombre: Optional[str] = None
    items: List[PaqueteItemResponse] = []

    class Config:
        from_attributes = True


# ---------------------------------------------------------------------------
# Checklist de preparacion de taller
# ---------------------------------------------------------------------------

class ChecklistItemResponse(BaseModel):
    """Item del paquete enriquecido con stock actual para la vista operadora."""
    item_id: int
    insumo_id: int
    insumo_nombre: str
    insumo_tipo: str          # 'insumo' | 'implemento'
    cantidad_requerida: int
    stock_actual: int         # stock_actual del insumo en el sistema
    notas_guia: Optional[str] = None  # notas del item en la guia de taller

    class Config:
        from_attributes = True


class ChecklistResponse(BaseModel):
    paquete_id: int
    taller_nombre: str
    semestre: str
    bloqueado: bool
    items: List[ChecklistItemResponse]


# ---------------------------------------------------------------------------
# Confirmacion de preparacion de taller
# ---------------------------------------------------------------------------

class ConfirmarPreparacionItem(BaseModel):
    """Un faltante que la operadora fue a buscar a bodega."""
    insumo_id: int
    cantidad: int = Field(gt=0)


class ConfirmarPreparacionCreate(BaseModel):
    """Payload de POST /paquetes/{id}/confirmar-preparacion.

    faltantes: lista de insumos que NO estaban en sala y se retiraron
               de bodega para completar el taller. Puede ser vacia si
               todos los items estaban OK en sala.
    sala_id:   sala donde se preparo el taller (para trazabilidad).
    notas:     observaciones opcionales de la operadora.
    """
    faltantes: List[ConfirmarPreparacionItem] = Field(default_factory=list)
    sala_id: Optional[int] = None
    notas: Optional[str] = None


class ConfirmarPreparacionResponse(BaseModel):
    mensaje: str
    movimientos_generados: int
    items_sin_stock: List[str]  # nombres de insumos con stock insuficiente
