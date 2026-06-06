from sqlalchemy import (
    Column, Integer, String, Text, ForeignKey,
    Date, Numeric, Boolean,
)
from sqlalchemy import Enum as SAEnum
from sqlalchemy.orm import relationship
from app.database import Base
import enum


class EstadoOrden(str, enum.Enum):
    en_curso = "en_curso"  # orden abierta, técnicos trabajando
    cerrada = "cerrada"  # Maritza cerró la orden tras el cierre
    cancelada = "cancelada"  # orden anulada antes de iniciar


class ResultadoItem(str, enum.Enum):
    pendiente = "pendiente"  # sin resultado aún (orden abierta)
    ok = "ok"  # revisado, queda operativo
    sale_a_taller = "sale_a_taller"  # debe salir a reparación externa
    dar_de_baja = "dar_de_baja"  # equipo irrecuperable / a reemplazar


class OrdenMantenimiento(Base):
    """Cabecera de una visita de mantenimiento del proveedor.

    Una visita puede abarcar N Phantomas (ítems). El resultado
    de cada Phantoma se registra en OrdenMantenimientoItem.
    Ciclo: en_curso -> cerrada | cancelada
    """
    __tablename__ = "ordenes_mantenimiento"

    id = Column(Integer, primary_key=True, index=True)

    proveedor_id = Column(
        Integer, ForeignKey("proveedores.id"), nullable=True
    )
    creado_por_id = Column(
        Integer, ForeignKey("usuarios.id"), nullable=True
    )

    estado = Column(
        SAEnum(EstadoOrden, name="estadoordenitem",
               create_type=False),
        nullable=False,
        default=EstadoOrden.en_curso,
        server_default=EstadoOrden.en_curso.value,
    )

    # Fecha del día de la visita del proveedor
    fecha_visita = Column(Date, nullable=False)

    # Observaciones generales de la visita
    notas = Column(Text, nullable=True)

    # Soft-delete
    activo = Column(
        Boolean, default=True, nullable=False, server_default="true"
    )

    proveedor = relationship("Proveedor", back_populates="ordenes_mantenimiento")
    creado_por = relationship("Usuario", backref="ordenes_mantenimiento")
    items = relationship(
        "OrdenMantenimientoItem",
        back_populates="orden",
        cascade="all, delete-orphan",
    )


class OrdenMantenimientoItem(Base):
    """Resultado de un Phantoma individual dentro de una orden de visita.

    Al abrir la orden todos los ítems nacen con resultado=pendiente.
    Al cerrar la orden Maritza actualiza cada ítem con el resultado real.
    Si el resultado es sale_a_taller, se rellenan fecha_envio y
    fecha_retorno_estimada. Si es dar_de_baja, se rellena descripcion_problema.
    """
    __tablename__ = "orden_mantenimiento_items"

    id = Column(Integer, primary_key=True, index=True)

    orden_id = Column(
        Integer, ForeignKey("ordenes_mantenimiento.id"), nullable=False
    )
    activo_fijo_id = Column(
        Integer, ForeignKey("activos_fijos.id"), nullable=False
    )

    resultado = Column(
        SAEnum(ResultadoItem, name="resultadoitem", create_type=False),
        nullable=False,
        default=ResultadoItem.pendiente,
        server_default=ResultadoItem.pendiente.value,
    )

    # Campos relevantes solo si resultado = sale_a_taller
    fecha_envio = Column(Date, nullable=True)
    fecha_retorno_estimada = Column(Date, nullable=True)
    fecha_retorno = Column(Date, nullable=True)  # se completa al volver

    # Descripción del problema (sale_a_taller o dar_de_baja)
    descripcion_problema = Column(Text, nullable=True)
    # Trabajo realizado por el proveedor
    descripcion_trabajo = Column(Text, nullable=True)
    # Costo de esta reparación/servicio individual
    costo = Column(Numeric(12, 2), nullable=True)

    orden = relationship("OrdenMantenimiento", back_populates="items")
    activo_fijo = relationship("ActivoFijo")
