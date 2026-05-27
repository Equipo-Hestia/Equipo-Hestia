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

    Resuelve la ambiguedad de retornos cuando varios docentes retiran
    unidades del mismo implemento: en lugar de contar 'N oximetros',
    cada unidad tiene su propio codigo (ej. OXI-00001) y puede
    rastrearse de forma independiente.

    El codigo se auto-genera al crear: primeros 3 chars del nombre del
    implemento (mayus, alfanumericos) + id con padding de 5 digitos.
    Ejemplo: implemento 'Oximetro' → OXI-00001, OXI-00002, ...
             implemento 'Fonendoscopio' → FON-00001, ...

    Estados:
    - disponible:  en el area comun, lista para retiro.
    - en_uso:      actualmente retirada por un docente.
    - dado_de_baja: fuera de servicio permanente (baja logica).
    """
    __tablename__ = "unidades_implemento"

    id = Column(Integer, primary_key=True, index=True)

    # FK al Insumo de tipo=implemento al que pertenece esta unidad.
    implemento_id = Column(Integer, ForeignKey("insumos.id"), nullable=False)

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
