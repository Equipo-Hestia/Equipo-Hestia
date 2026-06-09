from sqlalchemy import (
    Column, Integer, String, Date, Text, Boolean, ForeignKey,
)
from sqlalchemy.orm import relationship
from app.database import Base


class ProgramacionTaller(Base):
    """Instancia concreta de un Taller en una Sala en una fecha.

    Representa una fila de los xlsx de planificacion semestral de
    Maritza: que taller se dicta, en que sala, cuando, con quien y
    en que seccion.

    Campos:
        taller_id      FK al tipo de taller (plantilla reutilizable).
        sala_id        FK a la sala fisica donde se dicta.
        fecha          Fecha exacta del taller (no recurrente).
        hora_inicio    Hora de inicio normalizada 'HH:MM'.
        hora_fin       Hora de termino normalizada 'HH:MM'.
        docente_nombre Nombre del docente como dato de referencia.
        seccion        Seccion del curso (ej: '14', '15', '017D').
        semestre       Identificador del semestre (ej: '2026-1').
        notas          Observaciones adicionales opcionales.
        activo         Soft-delete.
    """
    __tablename__ = "programacion_talleres"

    id = Column(Integer, primary_key=True, index=True)

    taller_id = Column(
        Integer, ForeignKey("talleres.id"), nullable=False, index=True
    )
    sala_id = Column(
        Integer, ForeignKey("salas.id"), nullable=False, index=True
    )

    fecha = Column(Date, nullable=False, index=True)
    hora_inicio = Column(String(5), nullable=True)   # 'HH:MM'
    hora_fin = Column(String(5), nullable=True)       # 'HH:MM'

    docente_nombre = Column(String(150), nullable=True)
    seccion = Column(String(20), nullable=True)
    semestre = Column(String(20), nullable=True, index=True)

    notas = Column(Text, nullable=True)
    activo = Column(
        Boolean, default=True, nullable=False, server_default="true"
    )

    taller = relationship("Taller", backref="programaciones")
    sala = relationship("Sala", backref="programaciones")
