"""
Utilidades para el audit log de Hestia.

registrar() hace commit propio e inmediato para que el log persista
incluso si la operacion principal falla despues (ej: LOGIN_FALLIDO
que termina en HTTPException antes de cualquier otro commit).

get_ip() extrae la IP real del cliente considerando:
  1. X-Forwarded-For: enviado por proxies inversos (nginx, traefik).
  2. X-Real-IP: alternativa comun en algunos proxies.
  3. request.client.host: IP directa de la conexion TCP (en Docker,
     suele ser la IP interna del contenedor frontend).
"""

from typing import Optional
from sqlalchemy.orm import Session
from app.models.audit_log import AuditLog
from app.models.usuario import Usuario


def registrar(
    db: Session,
    accion: str,
    usuario: Optional[Usuario] = None,
    entidad: Optional[str] = None,
    entidad_id: Optional[int] = None,
    detalle: Optional[str] = None,
    ip: Optional[str] = None,
) -> None:
    """Inserta una entrada en audit_log con commit inmediato."""
    log = AuditLog(
        accion=accion,
        entidad=entidad,
        entidad_id=entidad_id,
        detalle=detalle,
        ip=ip,
        usuario_id=usuario.id if usuario else None,
        usuario_nombre=usuario.nombre if usuario else "sistema",
    )
    db.add(log)
    db.commit()


def get_ip(request) -> Optional[str]:
    """Extrae la IP real del cliente con soporte para proxies y Docker."""
    fwd = request.headers.get("X-Forwarded-For")
    if fwd:
        return fwd.split(",")[0].strip()
    real = request.headers.get("X-Real-IP")
    if real:
        return real
    if request.client:
        return request.client.host
    return None
