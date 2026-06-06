from sqlalchemy import Column, Integer, String, ForeignKey, Boolean, Text
from sqlalchemy import Enum as SAEnum
from sqlalchemy.orm import relationship
from app.database import Base
import enum


class TipoActivo(str, enum.Enum):
    mueble = "mueble"
    phantoma = "phantoma"


# Alias para compatibilidad con imports que usan TipoActivoFijo
TipoActivoFijo = TipoActivo


class EstadoActivo(str, enum.Enum):
    disponible = "disponible"
    en_uso = "en_uso"
    en_mantenimiento = "en_mantenimiento"
    dado_de_baja = "dado_de_baja"


class FidelidadPhantoma(str, enum.Enum):
    baja = "baja"
    media = "media"
    alta = "alta"


class ActivoFijo(Base):
    """Unidad fisica identificable: mueble clinico o phantoma de simulacion.

    A diferencia de los insumos (cantidad agregada), cada ActivoFijo
    representa UNA sola unidad fisica con su propio codigo de barras
    y codigo interno auto-generado (MUE-XXXXX / PHN-XXXXX).
    """
    __tablename__ = "activos_fijos"

    id = Column(Integer, primary_key=True, index=True)
    nombre = Column(String, nullable=False)
    descripcion = Column(String, nullable=True)

    tipo = Column(
        SAEnum(TipoActivo, name="tipoactivo"),
        nullable=False,
    )

    # Codigo interno auto-generado al crear: MUE-XXXXX o PHN-XXXXX.
    codigo_interno = Column(String(15), unique=True, nullable=True, index=True)

    # Codigo de barras de la etiqueta fisica pegada al activo.
    codigo_barras = Column(String(100), unique=True, nullable=True, index=True)

    estado = Column(
        SAEnum(EstadoActivo, name="estadoactivo"),
        nullable=False,
        default=EstadoActivo.disponible,
        server_default=EstadoActivo.disponible.value,
    )

    fidelidad = Column(
        SAEnum(FidelidadPhantoma, name="fidelidadphantoma"),
        nullable=True,
    )

    sala_id = Column(Integer, ForeignKey("salas.id"), nullable=True)

    # Proveedor original del activo (quien lo vendio y suele hacer
    # la mantencion preventiva, especialmente para phantomas).
    proveedor_id = Column(
        Integer, ForeignKey("proveedores.id"), nullable=True
    )

    notas = Column(Text, nullable=True)
    activo = Column(Boolean, default=True, nullable=False, server_default="true")

    sala = relationship("Sala", backref="activos_fijos")
    proveedor = relationship(
        "Proveedor",
        back_populates="activos_fijos",
        foreign_keys=[proveedor_id],
    )
    # Relacion con items de ordenes de mantenimiento (via OrdenMantenimientoItem).
    # La FK vive en OrdenMantenimientoItem.activo_fijo_id, no en OrdenMantenimiento.
    items_mantenimiento = relationship(
        "OrdenMantenimientoItem",
        back_populates="activo_fijo",
    )
