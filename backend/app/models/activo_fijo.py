from sqlalchemy import Column, Integer, String, ForeignKey, Boolean, Text
from sqlalchemy import Enum as SAEnum
from sqlalchemy.orm import relationship
from app.database import Base
import enum


class TipoActivo(str, enum.Enum):
    mueble = "mueble"
    phantoma = "phantoma"


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

    # mueble = mobiliario clinico (camilla, carro de paro, etc.)
    # phantoma = maniqui/simulador de fidelidad variable
    tipo = Column(
        SAEnum(TipoActivo, name="tipoactivo"),
        nullable=False,
    )

    # Codigo interno auto-generado al crear: MUE-XXXXX o PHN-XXXXX.
    # Se genera con db.flush() para obtener el ID antes del commit.
    codigo_interno = Column(String(15), unique=True, nullable=True, index=True)

    # Codigo de barras de la etiqueta fisica pegada al activo.
    # Para phantomas, este es el codigo que usa el proveedor para
    # identificar el maniqui en mantenimientos preventivos/correctivos.
    codigo_barras = Column(String(100), unique=True, nullable=True, index=True)

    estado = Column(
        SAEnum(EstadoActivo, name="estadoactivo"),
        nullable=False,
        default=EstadoActivo.disponible,
        server_default=EstadoActivo.disponible.value,
    )

    # Solo relevante para phantomas: nivel de simulacion del maniqui.
    # Nullable: los muebles no tienen fidelidad.
    fidelidad = Column(
        SAEnum(FidelidadPhantoma, name="fidelidadphantoma"),
        nullable=True,
    )

    # Sala de origen: sala donde este activo debe residir normalmente.
    # Al generar una orden de traspaso (futura Fase), este campo es
    # la referencia para saber adonde debe regresar el activo.
    sala_id = Column(Integer, ForeignKey("salas.id"), nullable=True)

    notas = Column(Text, nullable=True)

    # Soft-delete: dado_de_baja logico sin borrar el registro.
    activo = Column(Boolean, default=True, nullable=False, server_default="true")

    sala = relationship("Sala", backref="activos_fijos")
