from sqlalchemy import Column, Integer, String, ForeignKey, Boolean, Text, DateTime
from sqlalchemy import Enum as SAEnum
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base
import enum


class TipoIncidencia(str, enum.Enum):
    dano_fisico = "dano_fisico"
    pieza_perdida = "pieza_perdida"
    mal_funcionamiento = "mal_funcionamiento"
    otro = "otro"


class SeveridadIncidencia(str, enum.Enum):
    leve = "leve"
    moderada = "moderada"
    critica = "critica"


class EstadoIncidencia(str, enum.Enum):
    abierta = "abierta"
    en_revision = "en_revision"
    resuelta = "resuelta"


class Incidencia(Base):
    """Registro de incidencias sobre activos fijos (muebles y phantomas).

    Captura daños, piezas perdidas o mal funcionamiento ocurridos durante el
    uso de un equipo en una sala. Entidad independiente de OrdenMantenimiento:
    una incidencia puede o no derivar en una orden de mantenimiento.
    """
    __tablename__ = "incidencias"

    id = Column(Integer, primary_key=True, index=True)

    activo_fijo_id = Column(
        Integer, ForeignKey("activos_fijos.id"), nullable=False, index=True
    )

    tipo = Column(
        SAEnum(TipoIncidencia, name="tipoincidencia"),
        nullable=False,
    )

    descripcion = Column(Text, nullable=False)

    sala_id = Column(Integer, ForeignKey("salas.id"), nullable=False)

    fecha_hora = Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )

    responsable_nombre = Column(String(200), nullable=True)

    severidad = Column(
        SAEnum(SeveridadIncidencia, name="severidadincidencia"),
        nullable=False,
    )

    estado = Column(
        SAEnum(EstadoIncidencia, name="estadoincidencia"),
        nullable=False,
        default=EstadoIncidencia.abierta,
        server_default=EstadoIncidencia.abierta.value,
    )

    # Foto adjunta almacenada como base64 (opcional, red LAN interna).
    foto_b64 = Column(Text, nullable=True)

    activo = Column(Boolean, default=True, nullable=False, server_default="true")

    activo_fijo = relationship("ActivoFijo", backref="incidencias")
    sala = relationship("Sala", backref="incidencias_sala")
