from sqlalchemy import Column, Integer, String, Boolean, Text
from sqlalchemy import Enum as SAEnum
from sqlalchemy.orm import relationship
from app.database import Base
import enum


class RolUsuario(str, enum.Enum):
    admin = "admin"
    operador_coordinador = "operador_coordinador"
    operador = "operador"
    visor = "visor"


class Usuario(Base):
    __tablename__ = "usuarios"

    id = Column(Integer, primary_key=True, index=True)
    nombre = Column(String, nullable=False)
    email = Column(String, unique=True, index=True, nullable=False)
    password_hash = Column(String, nullable=False)
    rol = Column(
        SAEnum(RolUsuario, name="rolusuario", create_type=False),
        default=RolUsuario.visor,
        nullable=False,
    )
    activo = Column(Boolean, default=True, nullable=False, server_default="true")
    avatar_b64 = Column(Text, nullable=True)

    # 2FA
    totp_habilitado = Column(Boolean, default=False, nullable=False)
    totp_secret = Column(String, nullable=True)
    recovery_codes = Column(Text, nullable=True)

    # Relaciones
    # NOTA: clases_docente fue eliminado — los docentes ya no son usuarios;
    # tienen su propia tabla 'docentes'. Ver models/docente.py.
    solicitudes_retiro = relationship(
        "SolicitudRetiro", back_populates="docente"
    )
    movimientos = relationship("Movimiento", back_populates="usuario")
