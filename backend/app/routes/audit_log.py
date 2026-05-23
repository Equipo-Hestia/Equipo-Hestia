from typing import Optional
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.audit_log import AuditLog
from app.models.usuario import Usuario
from app.schemas.audit_log import AuditLogResponse
from app.schemas.comun import PaginatedResponse
from app.utils.deps import require_admin

router = APIRouter(prefix="/audit-log", tags=["Audit Log"])


@router.get("/", response_model=PaginatedResponse[AuditLogResponse])
def listar_audit_log(
    skip: int = 0,
    limit: int = 50,
    accion: Optional[str] = None,
    entidad: Optional[str] = None,
    usuario_id: Optional[int] = None,
    db: Session = Depends(get_db),
    admin: Usuario = Depends(require_admin),
):
    """Lista el audit log ordenado del mas reciente al mas antiguo.
    Solo administradores.

    Filtros opcionales:
    - accion: texto parcial (ej: 'LOGIN' devuelve LOGIN_EXITOSO y LOGIN_FALLIDO)
    - entidad: valor exacto (ej: 'insumo', 'usuario', 'movimiento')
    - usuario_id: restringe a las acciones de un usuario especifico
    """
    q = db.query(AuditLog)
    if accion:
        q = q.filter(AuditLog.accion.ilike(f"%{accion}%"))
    if entidad:
        q = q.filter(AuditLog.entidad == entidad)
    if usuario_id is not None:
        q = q.filter(AuditLog.usuario_id == usuario_id)

    total = q.count()
    logs = q.order_by(AuditLog.fecha.desc()).offset(skip).limit(limit).all()
    return {"total": total, "skip": skip, "limit": limit, "data": logs}
