from sqlalchemy import Column, Integer, String, ForeignKey, Boolean, Text
from sqlalchemy import Enum as SAEnum
from sqlalchemy.orm import relationship
from app.database import Base
import enum


class EstadoUnidad(str, enum.Enum):
    disponible = "disponible"
    en_uso = "en_uso"
    dado_de_baja = "dado_de_baja"


class UnidadImplemento(Base):
    """Unidad fisica individual de un implemento retornable.

    Cada unidad tiene su propio codigo (ej. OXI-00001) y puede
    rastrearse de forma independiente: estado, sala donde esta
    asignada y notas de mantenimiento.

    Ubicacion:
    - sala_id = NULL   → la unidad esta en Bodega (sin asignar).
    - sala_id = X      → asignada permanentemente a esa sala clinica.
      La operadora verifica fisicamente que este alli al inicio del
      semestre y reporta si hay unidades danadas para reemplazarlas
      desde Bodega.

    Estados:
    - disponible:    en la sala o bodega asignada, en buen estado.
    - en_uso:        actualmente retirada para un taller.
    - dado_de_baja:  danada o fuera de servicio (baja logica).
    """
    __tablename__ = "unidades_implemento"

    id = Column(Integer, primary_key=True, index=True)

    # FK al Insumo de tipo=implemento al que pertenece esta unidad.
    implemento_id = Column(Integer, ForeignKey("insumos.id"), nullable=False)

    # Sala donde esta asignada fisicamente esta unidad.
    # NULL = en Bodega (sin asignar a sala especifica).
    # Ej: 10 gafas en sala 010, 10 en sala 011, 30 en Bodega.
    sala_id = Column(
        Integer, ForeignKey("salas.id", ondelete="SET NULL"), nullable=True
    )

    # Codigo auto-generado: prefijo 3 chars + id con padding.
    # Unico globalmente; indexado para busqueda por escaner.
    codigo = Column(String(15), unique=True, nullable=True, index=True)

    estado = Column(
        SAEnum(EstadoUnidad, name="estadounidad"),
        nullable=False,
        default=EstadoUnidad.disponible,
        server_default=EstadoUnidad.disponible.value,
    )

    notas = Column(Text, nullable=True)

    # Soft-delete: la unidad se da de baja logicamente sin borrar el registro.
    activo = Column(Boolean, default=True, nullable=False, server_default="true")

    implemento = relationship("Insumo", backref="unidades")
    sala = relationship("Sala")
