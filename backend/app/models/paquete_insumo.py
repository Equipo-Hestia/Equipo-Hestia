from sqlalchemy import (
    Column, Integer, String, Boolean, Text, ForeignKey, DateTime, func
)
from sqlalchemy.orm import relationship
from app.database import Base


class PaqueteInsumo(Base):
    """Guia de Taller digital: lista de insumos requeridos para un taller.

    Cada paquete corresponde a un taller en un semestre especifico.
    Maritza lo prepara antes del semestre combinando la Ficha FER,
    el stock disponible y los pedidos de docentes.

    El campo 'bloqueado' permite congelar el paquete una vez que el
    semestre arranco, dejando trazabilidad auditada del estado original.

    Unicidad: (taller_id, semestre) — se valida en el router.
    """
    __tablename__ = "paquetes_insumo"

    id = Column(Integer, primary_key=True, index=True)
    taller_id = Column(
        Integer, ForeignKey("talleres.id", ondelete="CASCADE"), nullable=False
    )
    semestre = Column(String(10), nullable=False)  # ej: '2026-1'
    creado_por_id = Column(
        Integer, ForeignKey("usuarios.id", ondelete="SET NULL"), nullable=True
    )
    fecha_creacion = Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
    bloqueado = Column(
        Boolean, default=False, nullable=False, server_default="false"
    )
    notas = Column(Text, nullable=True)

    taller = relationship("Taller", back_populates="paquetes")
    creado_por = relationship("Usuario", foreign_keys=[creado_por_id])
    items = relationship(
        "PaqueteItem",
        back_populates="paquete",
        cascade="all, delete-orphan",
    )


class PaqueteItem(Base):
    """Linea de insumo dentro de un PaqueteInsumo.

    Indica cuantas unidades de un insumo o implemento se necesitan
    para ejecutar el taller completo (considerando todos los alumnos
    o estaciones de trabajo del grupo).
    """
    __tablename__ = "paquetes_items"

    id = Column(Integer, primary_key=True, index=True)
    paquete_id = Column(
        Integer, ForeignKey("paquetes_insumo.id", ondelete="CASCADE"),
        nullable=False,
    )
    insumo_id = Column(
        Integer, ForeignKey("insumos.id", ondelete="CASCADE"), nullable=False
    )
    cantidad_requerida = Column(Integer, nullable=False)
    notas = Column(Text, nullable=True)  # ej: 'talla M preferida'

    paquete = relationship("PaqueteInsumo", back_populates="items")
    insumo = relationship("Insumo")
