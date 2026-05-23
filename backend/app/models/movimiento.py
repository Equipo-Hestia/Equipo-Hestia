from sqlalchemy import Column, Integer, String, Enum, ForeignKey, DateTime
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base
import enum

class TipoMovimiento(str, enum.Enum):
    entrada = "entrada"
    salida = "salida"

class Movimiento(Base):
    __tablename__ = "movimientos"

    id = Column(Integer, primary_key=True, index=True)
    tipo = Column(Enum(TipoMovimiento), nullable=False)
    cantidad = Column(Integer, nullable=False)
    motivo = Column(String)
    fecha = Column(DateTime(timezone=True), server_default=func.now())

    insumo_id = Column(Integer, ForeignKey("insumos.id"), nullable=False)
    usuario_id = Column(Integer, ForeignKey("usuarios.id"), nullable=False)

    insumo = relationship("Insumo", back_populates="movimientos")
    usuario = relationship("Usuario", backref="movimientos")