from sqlalchemy import Column, Integer, String, Boolean, Text, ForeignKey
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
    
    # Mantenemos la columna ENUM original intacta por ahora (Fase 2 - Etapa 1)
    rol = Column(
        SAEnum(RolUsuario, name="rolusuario", create_type=False),
        default=RolUsuario.visor,
        nullable=False,
    )
    
    # NUEVO: La llave foránea hacia la nueva tabla de roles (nullable=True por ahora)
    rol_id = Column(Integer, ForeignKey("roles.id"), nullable=True)

    # NUEVO: Relación con el modelo Rol (nombre temporal para no chocar con el enum 'rol')
    rol_asociado = relationship("Rol", back_populates="usuarios")

    activo = Column(Boolean, default=True, nullable=False, server_default="true")
    avatar_b64 = Column(Text, nullable=True)

    # 2FA
    totp_habilitado = Column(Boolean, default=False, nullable=False)
    totp_secret = Column(String, nullable=True)
    recovery_codes = Column(Text, nullable=True)

    # Relaciones explicitas
    # NOTA: 'movimientos' no se declara aqui porque Movimiento.usuario
    # usa backref='movimientos', que lo crea automaticamente en este mapper.
    # Declararlo aqui ademas causaria ArgumentError: property name conflict.
    #
    # NOTA: 'clases_docente' fue eliminado. Los docentes ya no son usuarios;
    # tienen su propia tabla. Ver models/docente.py.
    solicitudes_retiro = relationship(
        "SolicitudRetiro", back_populates="docente"
    )