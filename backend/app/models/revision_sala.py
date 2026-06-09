from sqlalchemy import (
    Column, Integer, String, Date, Text, Boolean,
    ForeignKey, DateTime, func,
)
from sqlalchemy.orm import relationship
from app.database import Base


class RevisionSala(Base):
    """Revision operativa de una sala tras finalizar un taller.

    Se crea automaticamente cuando una Operadora abre el checklist
    de una sala cuyo horario ya termino.  Registra quien reviso,
    cuando empezo y cuando completo, y sirve como base de reporteria
    de desempeno por operador.
    """
    __tablename__ = "revisiones_sala"

    id = Column(Integer, primary_key=True, index=True)

    programacion_id = Column(
        Integer,
        ForeignKey("programacion_talleres.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    sala_id = Column(
        Integer, ForeignKey("salas.id"), nullable=False, index=True
    )
    fecha = Column(Date, nullable=False, index=True)

    operador_id = Column(
        Integer,
        ForeignKey("usuarios.id", ondelete="SET NULL"),
        nullable=True,
    )

    # pendiente | en_revision | completada
    estado = Column(
        String(20), nullable=False, default="pendiente",
        server_default="pendiente",
    )

    hora_inicio_rev = Column(String(5), nullable=True)   # 'HH:MM'
    hora_fin_rev    = Column(String(5), nullable=True)   # 'HH:MM'
    notas           = Column(Text, nullable=True)

    creado_en = Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )

    programacion = relationship("ProgramacionTaller", backref="revisiones")
    sala         = relationship("Sala",               backref="revisiones")
    operador     = relationship("Usuario",            backref="revisiones")
    items        = relationship(
        "RevisionSalaItem",
        back_populates="revision",
        cascade="all, delete-orphan",
        order_by="RevisionSalaItem.tipo, RevisionSalaItem.nombre",
    )


class RevisionSalaItem(Base):
    """Item del checklist de una RevisionSala.

    Los datos se copian desde el paquete / activos en el momento de
    crear la revision para preservar trazabilidad historica aunque
    el paquete cambie despues.
    """
    __tablename__ = "revisiones_sala_items"

    id = Column(Integer, primary_key=True, index=True)
    revision_id = Column(
        Integer,
        ForeignKey("revisiones_sala.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # insumo | implemento | activo_fijo
    tipo               = Column(String(20), nullable=False)
    nombre             = Column(String(200), nullable=False)
    cantidad_esperada  = Column(Integer, nullable=True)   # null = activo fijo
    cantidad_encontrada = Column(Integer, nullable=True)  # null = sin revisar
    conforme           = Column(Boolean, nullable=True)   # null/True/False
    notas_item         = Column(Text, nullable=True)

    revision = relationship("RevisionSala", back_populates="items")
