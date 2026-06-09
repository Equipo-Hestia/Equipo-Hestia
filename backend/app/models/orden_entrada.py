from sqlalchemy import (
    Column, Integer, String, Text, Numeric,
    DateTime, ForeignKey, Enum as SAEnum,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base
import enum


class TipoOrden(str, enum.Enum):
    semanal = "semanal"
    semestral = "semestral"
    emergencia = "emergencia"


class EstadoOrden(str, enum.Enum):
    borrador = "borrador"
    confirmada = "confirmada"
    en_recepcion = "en_recepcion"
    cerrada = "cerrada"
    cancelada = "cancelada"


class EstadoItem(str, enum.Enum):
    pendiente = "pendiente"
    recibido = "recibido"
    recibido_parcial = "recibido_parcial"
    cancelado = "cancelado"


class TipoItemOrden(str, enum.Enum):
    insumo = "insumo"
    activo_fijo = "activo_fijo"


# Actividades/centros de costo DuocUC relevantes para Hestia
ACTIVIDADES_DUOC = {
    "1010": "Materiales de ensenanza - talleres y laboratorios",
    "1060": "Mantenciones varias de Equipos de Ensenanza",
    "1064": "Materiales e insumos varios",
    "1084": "Articulos escritorio, papeleria y computacion",
    "1137": "Insumos academicos y tecnologia",
}


class OrdenEntrada(Base):
    """Orden de entrada de mercaderia al inventario de Hestia.

    Flujo: borrador -> confirmada -> en_recepcion -> cerrada.
    El stock solo se actualiza cuando Maritza (op_coord/admin) cierra la orden.
    """
    __tablename__ = "ordenes_entrada"

    id = Column(Integer, primary_key=True, index=True)
    proveedor_id = Column(
        Integer, ForeignKey("proveedores.id", ondelete="SET NULL"), nullable=True
    )
    actividad_duoc = Column(String(10), nullable=True)   # codigo: '1010', '1060'...
    tipo = Column(
        SAEnum(TipoOrden, name="tipoorden", create_type=False),
        nullable=False,
        default=TipoOrden.semanal,
    )
    estado = Column(
        SAEnum(EstadoOrden, name="estadoordenentrada", create_type=False),
        nullable=False,
        default=EstadoOrden.borrador,
    )
    notas = Column(Text, nullable=True)
    creado_por_id = Column(
        Integer, ForeignKey("usuarios.id", ondelete="SET NULL"), nullable=True
    )
    cerrado_por_id = Column(
        Integer, ForeignKey("usuarios.id", ondelete="SET NULL"), nullable=True
    )
    created_at = Column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    fecha_cierre = Column(DateTime(timezone=True), nullable=True)

    proveedor = relationship("Proveedor", foreign_keys=[proveedor_id])
    creado_por = relationship("Usuario", foreign_keys=[creado_por_id])
    cerrado_por = relationship("Usuario", foreign_keys=[cerrado_por_id])
    items = relationship(
        "OrdenEntradaItem",
        back_populates="orden",
        cascade="all, delete-orphan",
    )


class OrdenEntradaItem(Base):
    """Item de una orden de entrada.

    tipo_item discrimina si referencia insumos o activos_fijos.
    Cuando insumo_id / activo_fijo_id es NULL, nombre_nuevo se usa
    para crear el registro al cerrar la orden.
    """
    __tablename__ = "orden_entrada_items"

    id = Column(Integer, primary_key=True, index=True)
    orden_id = Column(
        Integer, ForeignKey("ordenes_entrada.id", ondelete="CASCADE"), nullable=False
    )
    tipo_item = Column(
        SAEnum(TipoItemOrden, name="tipoitemorden", create_type=False),
        nullable=False,
        default=TipoItemOrden.insumo,
    )
    # Referencia a existente (nullable si es nuevo)
    insumo_id = Column(
        Integer, ForeignKey("insumos.id", ondelete="SET NULL"), nullable=True
    )
    activo_fijo_id = Column(
        Integer, ForeignKey("activos_fijos.id", ondelete="SET NULL"), nullable=True
    )
    # Datos para crear nuevo registro al cierre
    nombre_nuevo = Column(String(200), nullable=True)
    tipo_insumo_nuevo = Column(String(20), nullable=True)  # 'insumo'|'implemento'
    tipo_activo_nuevo = Column(String(20), nullable=True)  # 'mueble'|'phantoma'
    # Cantidades
    cantidad_pedida = Column(Integer, nullable=False)
    cantidad_recibida = Column(Integer, nullable=True)
    costo_unitario = Column(Numeric(10, 2), nullable=True)
    estado = Column(
        SAEnum(EstadoItem, name="estadoitemorden", create_type=False),
        nullable=False,
        default=EstadoItem.pendiente,
    )
    notas_item = Column(Text, nullable=True)

    orden = relationship("OrdenEntrada", back_populates="items")
    insumo = relationship("Insumo", foreign_keys=[insumo_id])
    activo_fijo = relationship("ActivoFijo", foreign_keys=[activo_fijo_id])
