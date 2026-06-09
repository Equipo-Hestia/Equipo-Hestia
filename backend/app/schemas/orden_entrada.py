from pydantic import BaseModel
from typing import Optional
from datetime import datetime


# ---------------------------------------------------------------------------
# Items
# ---------------------------------------------------------------------------

class OrdenEntradaItemCreate(BaseModel):
    tipo_item:         str          # 'insumo' | 'activo_fijo'
    insumo_id:         Optional[int]  = None
    activo_fijo_id:    Optional[int]  = None
    nombre_nuevo:      Optional[str]  = None
    tipo_insumo_nuevo: Optional[str]  = None  # 'insumo' | 'implemento'
    tipo_activo_nuevo: Optional[str]  = None  # 'mueble' | 'phantoma'
    cantidad_pedida:   int
    costo_unitario:    Optional[float] = None
    notas_item:        Optional[str]  = None


class OrdenEntradaItemUpdate(BaseModel):
    cantidad_recibida: Optional[int]   = None
    costo_unitario:    Optional[float] = None
    notas_item:        Optional[str]   = None
    estado:            Optional[str]   = None


class OrdenEntradaItemResponse(BaseModel):
    id:                 int
    orden_id:           int
    tipo_item:          str
    insumo_id:          Optional[int]   = None
    insumo_nombre:      Optional[str]   = None
    activo_fijo_id:     Optional[int]   = None
    activo_fijo_nombre: Optional[str]   = None
    nombre_nuevo:       Optional[str]   = None
    tipo_insumo_nuevo:  Optional[str]   = None
    tipo_activo_nuevo:  Optional[str]   = None
    cantidad_pedida:    int
    cantidad_recibida:  Optional[int]   = None
    costo_unitario:     Optional[float] = None
    estado:             str
    notas_item:         Optional[str]   = None

    class Config:
        from_attributes = True


# ---------------------------------------------------------------------------
# Orden
# ---------------------------------------------------------------------------

class OrdenEntradaCreate(BaseModel):
    proveedor_id:   Optional[int]  = None
    actividad_duoc: Optional[str]  = None
    tipo:           str            = "semanal"
    notas:          Optional[str]  = None
    items:          list[OrdenEntradaItemCreate] = []


class OrdenEntradaUpdate(BaseModel):
    proveedor_id:   Optional[int] = None
    actividad_duoc: Optional[str] = None
    tipo:           Optional[str] = None
    notas:          Optional[str] = None


class OrdenEntradaResponse(BaseModel):
    id:              int
    proveedor_id:    Optional[int]  = None
    proveedor_nombre: Optional[str] = None
    actividad_duoc:  Optional[str]  = None
    actividad_nombre: Optional[str] = None
    tipo:            str
    estado:          str
    notas:           Optional[str]  = None
    creado_por_id:   Optional[int]  = None
    creado_por_nombre: Optional[str] = None
    cerrado_por_id:  Optional[int]  = None
    cerrado_por_nombre: Optional[str] = None
    created_at:      datetime
    fecha_cierre:    Optional[datetime] = None
    items:           list[OrdenEntradaItemResponse] = []
    total_pedido:    int = 0
    total_recibido:  int = 0

    class Config:
        from_attributes = True
