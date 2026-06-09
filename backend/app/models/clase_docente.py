from sqlalchemy import Column, Integer, String, Boolean, ForeignKey
from sqlalchemy.orm import relationship
from app.database import Base


class ClaseDocente(Base):
    """Asignacion de un docente a una asignatura para un semestre especifico.

    Un docente puede tener multiples secciones de la misma asignatura en el
    mismo semestre (ej: Primeros Auxilios 001D y 002D los lunes). Cada fila
    representa una seccion independiente con su propio grupo de alumnos.

    Campos:
    - seccion:     codigo de seccion, ej '001D'. Se almacena en mayusculas.
    - semestre:    periodo academico, ej '2025-1' o '2025-2'.
    - activa:      false si la clase ya termino o fue reasignada.
    - dia_semana:  dia de la semana en minusculas, ej 'lunes', 'miercoles'.
    - hora_inicio: hora de inicio, ej '08:30'.
    - hora_fin:    hora de termino, ej '12:00'.

    NOTA: docente_id referencia la tabla 'docentes' (entidad externa),
    NO la tabla 'usuarios'. Los docentes no tienen cuenta en Hestia.
    """
    __tablename__ = "clases_docente"

    id = Column(Integer, primary_key=True, index=True)
    docente_id = Column(
        Integer, ForeignKey("docentes.id", ondelete="SET NULL"), nullable=True
    )
    asignatura_id = Column(
        Integer, ForeignKey("asignaturas.id"), nullable=False
    )
    seccion = Column(String(10), nullable=False)
    semestre = Column(String(10), nullable=False)
    activa = Column(
        Boolean, default=True, nullable=False, server_default="true"
    )
    num_estudiantes = Column(Integer, nullable=True)
    dia_semana = Column(String(15), nullable=True)
    hora_inicio = Column(String(5), nullable=True)
    hora_fin = Column(String(5), nullable=True)

    docente = relationship("Docente", back_populates="clases")
    asignatura = relationship("Asignatura", back_populates="clases")
