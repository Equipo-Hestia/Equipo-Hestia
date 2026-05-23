from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Text
from sqlalchemy.sql import func
from app.database import Base


class AuditLog(Base):
    __tablename__ = "audit_log"

    id = Column(Integer, primary_key=True, index=True)
    fecha = Column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    # Accion realizada: LOGIN_EXITOSO, CREAR_USUARIO, ELIMINAR_INSUMO, etc.
    accion = Column(String(64), nullable=False, index=True)
    # Entidad afectada: 'usuario', 'insumo', 'movimiento', etc.
    entidad = Column(String(64), nullable=True)
    entidad_id = Column(Integer, nullable=True)
    # Informacion extra libre (email afectado, motivo, etc.)
    detalle = Column(Text, nullable=True)
    # IP del cliente. En Docker suele ser la IP del contenedor frontend
    # a menos que se configure X-Forwarded-For en el proxy.
    ip = Column(String(64), nullable=True)

    # FK nullable: si el usuario es eliminado, SET NULL conserva el log.
    # usuario_nombre se almacena denormalizado para preservar el historial.
    usuario_id = Column(
        Integer,
        ForeignKey("usuarios.id", ondelete="SET NULL"),
        nullable=True,
    )
    usuario_nombre = Column(String(256), nullable=False, default="sistema")
