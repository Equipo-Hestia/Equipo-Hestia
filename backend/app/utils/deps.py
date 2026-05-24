from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.usuario import Usuario, RolUsuario
from app.utils.security import verificar_token
from app.utils.token_blacklist import esta_revocado

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")


def get_usuario_actual(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
) -> Usuario:
    """Cualquier usuario autenticado con token de acceso completo.
    Rechaza pre_tokens del flujo 2FA para evitar acceso parcial.
    Rechaza usuarios desactivados (soft-delete).
    Rechaza tokens revocados via logout (blacklist en memoria).
    """
    excepcion = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Token invalido o expirado",
        headers={"WWW-Authenticate": "Bearer"}
    )
    payload = verificar_token(token)
    if payload is None:
        raise excepcion

    # Los pre_tokens solo sirven para /auth/2fa/completar-login.
    if payload.get("tipo") == "pre_auth":
        raise excepcion

    # Verificar que el token no fue revocado via logout.
    jti = payload.get("jti")
    if jti and esta_revocado(jti):
        raise excepcion

    usuario_id = payload.get("sub")
    if usuario_id is None:
        raise excepcion

    try:
        uid = int(usuario_id)
    except (ValueError, TypeError):
        raise excepcion

    usuario = db.query(Usuario).filter(Usuario.id == uid).first()
    if usuario is None:
        raise excepcion
    if not usuario.activo:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cuenta inactiva. Contacta al administrador.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return usuario


def require_docente(usuario: Usuario = Depends(get_usuario_actual)) -> Usuario:
    """Requiere rol docente. Usado en endpoints exclusivos del flujo de retiro."""
    if usuario.rol != RolUsuario.docente:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Se requiere rol docente para esta accion"
        )
    return usuario


def require_operador(usuario: Usuario = Depends(get_usuario_actual)) -> Usuario:
    """Requiere rol admin, operador u operador_coordinador.
    Usado en endpoints de escritura general y bandeja operativa.
    """
    if usuario.rol not in [
        RolUsuario.admin,
        RolUsuario.operador,
        RolUsuario.operador_coordinador,
    ]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Se requiere rol operador o superior para esta accion"
        )
    return usuario


def require_admin(usuario: Usuario = Depends(get_usuario_actual)) -> Usuario:
    """Requiere rol admin. Usado en endpoints destructivos y gestion de usuarios."""
    if usuario.rol != RolUsuario.admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Se requiere rol administrador para esta accion"
        )
    return usuario


def require_reportes(usuario: Usuario = Depends(get_usuario_actual)) -> Usuario:
    """Requiere admin, operador_coordinador o visor para acceder a reportes.
    El rol operador no tiene acceso a montos ni datos financieros del sistema.
    """
    if usuario.rol not in [
        RolUsuario.admin,
        RolUsuario.operador_coordinador,
        RolUsuario.visor,
    ]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No tienes permiso para acceder a los reportes financieros"
        )
    return usuario
