from sqlalchemy import Column, Integer, String, Boolean, Text, DateTime
from sqlalchemy import Enum as SAEnum
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base
import enum


class TipoComentario(str, enum.Enum):
    positivo = "positivo"
    negativo = "negativo"
    neutro = "neutro"


class Docente(Base):
    """Docente externo de la Escuela de Salud.

    Entidad independiente de Usuario: los docentes no inician sesion
    en Hestia. Son gestionados por el operador coordinador (Maritza)
    y se vinculan a ClaseDocente para la planificacion de talleres.
    """
    __tablename__ = "docentes"

    id = Column(Integer, primary_key=True, index=True)
    nombre = Column(String(120), nullable=False)
    email = Column(String(120), unique=True, nullable=False, index=True)
    rut = Column(String(20), nullable=True)
    telefono = Column(String(30), nullable=True)
    activo = Column(
        Boolean, default=True, nullable=False, server_default="true"
    )
    created_at = Column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    clases = relationship("ClaseDocente", back_populates="docente")
    comentarios = relationship(
        "ComentarioDocente",
        back_populates="docente",
        order_by="ComentarioDocente.created_at.desc()",
    )


class ComentarioDocente(Base):
    """Comentario operativo sobre un docente, gestionado por Maritza.

    Solo el rol operador_coordinador puede crear y consultar comentarios.
    Estos comentarios son de caracter interno y confidencial.
    """
    __tablename__ = "comentarios_docente"

    id = Column(Integer, primary_key=True, index=True)
    docente_id = Column(
        Integer,
        __import__('sqlalchemy').ForeignKey("docentes.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    tipo = Column(
        SAEnum(
            TipoComentario,
            name="tipocomentario",
            create_type=False,
        ),
        nullable=False,
        default=TipoComentario.neutro,
    )
    contenido = Column(Text, nullable=False)
    creado_por_id = Column(
        Integer,
        __import__('sqlalchemy').ForeignKey("usuarios.id", ondelete="SET NULL"),
        nullable=True,
    )
    created_at = Column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    docente = relationship("Docente", back_populates="comentarios")
    creado_por = relationship("Usuario", foreign_keys=[creado_por_id])
