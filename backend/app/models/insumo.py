from sqlalchemy import Column, Integer, String, ForeignKey, Boolean
from sqlalchemy import Enum as SAEnum, Numeric
from sqlalchemy.orm import relationship
from app.database import Base
import enum


class TipoInsumo(str, enum.Enum):
    insumo = "insumo"
    implemento = "implemento"


class Insumo(Base):
    __tablename__ = "insumos"

    id = Column(Integer, primary_key=True, index=True)
    nombre = Column(String, nullable=False)
    descripcion = Column(String)

    # Identificadores unicos por item
    sku = Column(String(20), unique=True, nullable=True, index=True)
    codigo_barras = Column(String(100), unique=True, nullable=True, index=True)

    # Clasificacion: desechable (insumo) vs retornable al stock (implemento)
    tipo = Column(
        SAEnum(TipoInsumo, name="tipoinsumo"),
        nullable=False,
        default=TipoInsumo.insumo,
        server_default=TipoInsumo.insumo.value,
    )

    # Valoracion economica para reportes de costo por estudiante y ABC
    costo_unitario = Column(Numeric(10, 2), nullable=True)

    stock_actual = Column(Integer, default=0)
    stock_minimo = Column(Integer, default=0)

    # Soft-delete: un insumo inactivo desaparece de listados, alertas y
    # exportaciones, pero su fila se conserva para no romper la trazabilidad
    # de movimientos historicos (movimientos.insumo_id es FK NOT NULL).
    # Reactivable via PUT activo=true.
    activo = Column(
        Boolean, default=True, nullable=False, server_default="true"
    )

    sala_id = Column(Integer, ForeignKey("salas.id"))
    categoria_id = Column(Integer, ForeignKey("categorias.id"))

    sala = relationship("Sala", back_populates="insumos")
    categoria = relationship("Categoria", back_populates="insumos")
    movimientos = relationship("Movimiento", back_populates="insumo")
