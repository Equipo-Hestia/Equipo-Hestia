from sqlalchemy import Column, Integer, String, Boolean
from sqlalchemy.orm import relationship
from app.database import Base


class Asignatura(Base):
    """Asignatura academica de la Escuela de Salud.

    El codigo es un identificador corto unico (ej: 'PAU-101') que se usa
    como referencia rapida en reportes y en la vista del docente.
    """
    __tablename__ = "asignaturas"

    id = Column(Integer, primary_key=True, index=True)
    nombre = Column(String, nullable=False)
    codigo = Column(String(20), unique=True, nullable=False, index=True)
    activa = Column(
        Boolean, default=True, nullable=False, server_default="true"
    )

    clases = relationship("ClaseDocente", back_populates="asignatura")
