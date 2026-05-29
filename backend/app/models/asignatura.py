from sqlalchemy import Column, Integer, String, Boolean
from sqlalchemy import Enum as SAEnum
from sqlalchemy.orm import relationship
from app.database import Base
import enum


class CarreraAsignatura(str, enum.Enum):
    TENS = "TENS"
    TQF = "TQF"
    TLCBS = "TLCBS"
    TONS = "TONS"
    preparador_fisico = "preparador_fisico"


class Asignatura(Base):
    """Asignatura academica de la Escuela de Salud.

    El codigo es el identificador oficial DuocUC (ej: 'CIS1101') unico
    por carrera, usado como referencia en reportes y planificacion.
    """
    __tablename__ = "asignaturas"

    id = Column(Integer, primary_key=True, index=True)
    nombre = Column(String, nullable=False)
    codigo = Column(String(20), unique=True, nullable=False, index=True)
    activa = Column(
        Boolean, default=True, nullable=False, server_default="true"
    )
    carrera = Column(
        SAEnum(CarreraAsignatura, name="carreraasignatura", create_type=False),
        nullable=True,
    )

    clases = relationship("ClaseDocente", back_populates="asignatura")
