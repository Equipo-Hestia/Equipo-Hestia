from sqlalchemy import Column, Integer, String, Boolean, ForeignKey
from sqlalchemy.orm import relationship
from app.database import Base


class ClaseDocente(Base):
    """Asignacion de un docente a una asignatura para un semestre especifico.

    Un docente puede tener multiples secciones de la misma asignatura en el
    mismo semestre (ej: Primeros Auxilios 001D y 002D los lunes). Cada fila
    representa una seccion independiente con su propio grupo de alumnos.

    Campos:
    - seccion:  codigo de seccion, ej '001D'. Se almacena en mayusculas.
    - semestre: periodo academico, ej '2025-1' o '2025-2'.
    - activa:   false si la clase ya termino o fue reasignada.
    """
    __tablename__ = "clases_docente"

    id = Column(Integer, primary_key=True, index=True)
    docente_id = Column(Integer, ForeignKey("usuarios.id"), nullable=False)
    asignatura_id = Column(Integer, ForeignKey("asignaturas.id"), nullable=False)
    seccion = Column(String(10), nullable=False)   # Ej: "001D"
    semestre = Column(String(10), nullable=False)  # Ej: "2025-1"
    activa = Column(
        Boolean, default=True, nullable=False, server_default="true"
    )

    docente = relationship(
        "Usuario", foreign_keys=[docente_id], back_populates="clases_docente"
    )
    asignatura = relationship("Asignatura", back_populates="clases")
