from sqlalchemy import (
    Column, Integer, String, Text, ForeignKey,
    Date, Numeric, Boolean,
)
from sqlalchemy import Enum as SAEnum
from sqlalchemy.orm import relationship
from app.database import Base
import enum


class EstadoOrden(str, enum.Enum):
    enviado = "enviado"           # activo entregado al proveedor
    en_proceso = "en_proceso"     # proveedor confirmó recepción
    completado = "completado"     # activo devuelto y operativo
    cancelado = "cancelado"       # orden anulada


class OrdenMantenimiento(Base):
    """Registro de una mantención externa de un activo fijo (phantoma,
    mueble clínico o implemento).

    Ciclo de vida esperado:
        enviado -> en_proceso -> completado
                             -> cancelado

    proveedor_id es nullable: si el proveedor no está registrado en
    Hestia (ej. contactado por primera vez vía SeNegocia), la orden
    puede crearse sin proveedor y asociarse después.
    """
    __tablename__ = "ordenes_mantenimiento"

    id = Column(Integer, primary_key=True, index=True)

    activo_fijo_id = Column(
        Integer, ForeignKey("activos_fijos.id"), nullable=False
    )
    proveedor_id = Column(
        Integer, ForeignKey("proveedores.id"), nullable=True
    )
    creado_por_id = Column(
        Integer, ForeignKey("usuarios.id"), nullable=True
    )

    estado = Column(
        SAEnum(EstadoOrden, name="estadoorden"),
        nullable=False,
        default=EstadoOrden.enviado,
        server_default=EstadoOrden.enviado.value,
    )

    fecha_envio = Column(Date, nullable=False)
    fecha_retorno = Column(Date, nullable=True)  # se completa al cerrar

    descripcion_problema = Column(Text, nullable=True)
    descripcion_trabajo = Column(Text, nullable=True)  # relleno al completar
    costo = Column(Numeric(12, 2), nullable=True)

    # Soft-delete por si se crea una orden por error
    activo = Column(
        Boolean, default=True, nullable=False, server_default="true"
    )

    activo_fijo = relationship("ActivoFijo", back_populates="ordenes_mantenimiento")
    proveedor = relationship("Proveedor", back_populates="ordenes_mantenimiento")
    creado_por = relationship("Usuario", backref="ordenes_mantenimiento")
