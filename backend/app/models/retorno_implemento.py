from sqlalchemy import Column, Integer, ForeignKey, DateTime, Text
from sqlalchemy import Enum as SAEnum
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base
import enum


class EstadoRetorno(str, enum.Enum):
    pendiente = "pendiente"
    retornado = "retornado"
    no_retornado = "no_retornado"


class RetornoImplemento(Base):
    """Registro de retorno para cada implemento retirado via solicitud.

    Se crea automaticamente al completar una solicitud que incluye items
    de tipo 'implemento'. El operador debe confirmar al final del dia
    cuales fueron devueltos al area comun y cuales no.

    Estados:
    - pendiente:     retirado, aun no confirmado su retorno.
    - retornado:     devuelto al area comun; stock restaurado.
    - no_retornado:  no aparecio; registrado como merma sin restaurar stock.
    """
    __tablename__ = "retornos_implemento"

    id = Column(Integer, primary_key=True, index=True)

    # Que implemento se retiro y en que cantidad
    insumo_id = Column(Integer, ForeignKey("insumos.id"), nullable=False)
    cantidad = Column(Integer, nullable=False)

    # Trazabilidad: de que solicitud vino, quién lo retiro y desde que sala
    solicitud_id = Column(
        Integer, ForeignKey("solicitudes_retiro.id"), nullable=True
    )
    docente_id = Column(Integer, ForeignKey("usuarios.id"), nullable=True)
    sala_id = Column(Integer, ForeignKey("salas.id"), nullable=True)

    # Timestamps
    fecha_retiro = Column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    fecha_retorno = Column(DateTime(timezone=True), nullable=True)

    # Estado del retorno y quien lo proceso
    estado = Column(
        SAEnum(EstadoRetorno, name="estadoretorno"),
        nullable=False,
        default=EstadoRetorno.pendiente,
        server_default=EstadoRetorno.pendiente.value,
    )
    operador_id = Column(Integer, ForeignKey("usuarios.id"), nullable=True)
    notas = Column(Text, nullable=True)

    # Relaciones — foreign_keys explicitas por multiples FKs a usuarios
    insumo = relationship("Insumo")
    solicitud = relationship("SolicitudRetiro")
    sala = relationship("Sala")
    docente = relationship(
        "Usuario", foreign_keys=[docente_id]
    )
    operador = relationship(
        "Usuario", foreign_keys=[operador_id]
    )
