from sqlalchemy import Column, Integer, String, Boolean, Text, ForeignKey
from sqlalchemy.orm import relationship
from app.database import Base


class Taller(Base):
    """Tipo de clase practica vinculada a una asignatura.

    Un taller es la plantilla reusable que describe una actividad de
    laboratorio o simulacion dentro de una asignatura. Por ejemplo,
    'Taller de venopuncion' o 'Taller de sutura basica' son talleres
    distintos de la asignatura CIS1101.

    Cada taller puede tener multiples PaqueteInsumo (uno por semestre),
    lo que permite reutilizar la plantilla y ajustar cantidades periodo
    a periodo sin perder el historial.
    """
    __tablename__ = "talleres"

    id = Column(Integer, primary_key=True, index=True)
    nombre = Column(String(200), nullable=False)
    descripcion = Column(Text, nullable=True)
    asignatura_id = Column(
        Integer, ForeignKey("asignaturas.id"), nullable=True
    )
    activo = Column(
        Boolean, default=True, nullable=False, server_default="true"
    )

    asignatura = relationship("Asignatura", back_populates="talleres")
    paquetes = relationship(
        "PaqueteInsumo",
        back_populates="taller",
        cascade="all, delete-orphan",
    )
