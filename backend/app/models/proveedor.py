from sqlalchemy import Column, Integer, String, Boolean, Text
from sqlalchemy.orm import relationship
from app.database import Base


class Proveedor(Base):
    """Proveedor externo de insumos, implementos o servicios de mantenimiento.

    El campo url_seneg almacena el enlace al perfil del proveedor en
    SeNegocia.com, plataforma usada por la Escuela de Salud para
    gestionar contratos y mantenciones de phantomas y equipos.
    """
    __tablename__ = "proveedores"

    id = Column(Integer, primary_key=True, index=True)
    nombre = Column(String(200), nullable=False)
    rut = Column(String(12), nullable=True, unique=True, index=True)
    contacto_nombre = Column(String(150), nullable=True)
    contacto_email = Column(String(150), nullable=True)
    telefono = Column(String(20), nullable=True)
    # Perfil en SeNegocia.com (plataforma de licitaciones DuocUC)
    url_seneg = Column(String(300), nullable=True)
    notas = Column(Text, nullable=True)
    # Soft-delete: el proveedor se desactiva sin borrar su historial
    activo = Column(Boolean, default=True, nullable=False, server_default="true")

    activos_fijos = relationship(
        "ActivoFijo",
        back_populates="proveedor",
        foreign_keys="ActivoFijo.proveedor_id",
    )
    ordenes_mantenimiento = relationship(
        "OrdenMantenimiento",
        back_populates="proveedor",
    )
