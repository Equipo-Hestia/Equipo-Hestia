from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from sqlalchemy.orm import Session
import pyotp

from app.database import get_db
from app.models.usuario import Usuario
from app.schemas.usuario import (
    UsuarioCreate, UsuarioUpdate, AvatarUpdate, UsuarioResponse, CambiarPassword
)
from app.schemas.comun import PaginatedResponse
from app.utils.deps import get_usuario_actual, require_admin
from app.utils.security import hashear_password, verificar_password
from app.utils.auditoria import registrar, get_ip

router = APIRouter(prefix="/usuarios", tags=["Usuarios"])

TOTP_VALID_WINDOW = 1

# Limite de tamano del avatar como string base64 (~3 MB = ~2 MB imagen original).
_AVATAR_MAX_LEN = 3_000_000


@router.get("/", response_model=PaginatedResponse[UsuarioResponse])
def listar_usuarios(
    skip: int = 0,
    limit: int = 20,
    incluir_inactivos: bool = False,
    db: Session = Depends(get_db),
    admin: Usuario = Depends(require_admin),
):
    """Lista usuarios. Por defecto excluye los desactivados (soft-deleted).
    Pasar incluir_inactivos=true para verlos todos en el panel de admin.
    """
    q = db.query(Usuario)
    if not incluir_inactivos:
        q = q.filter(Usuario.activo.is_(True))
    total = q.count()
    usuarios = q.offset(skip).limit(limit).all()
    return {"total": total, "skip": skip, "limit": limit, "data": usuarios}


@router.get("/me", response_model=UsuarioResponse)
def perfil_propio(usuario: Usuario = Depends(get_usuario_actual)):
    return usuario


@router.post("/me/cambiar-password")
def cambiar_password(
    datos: CambiarPassword,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(get_usuario_actual),
):
    """Permite al usuario autenticado cambiar su propia contrasena."""
    if not verificar_password(datos.password_actual, usuario.password_hash):
        raise HTTPException(status_code=400, detail="Contrasena actual incorrecta")
    usuario.password_hash = hashear_password(datos.password_nueva)
    db.commit()
    return {"mensaje": "Contrasena actualizada correctamente"}


@router.put("/me/avatar", response_model=UsuarioResponse)
def actualizar_avatar(
    datos: AvatarUpdate,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(get_usuario_actual),
):
    """Actualiza la foto de perfil del usuario autenticado.

    Recibe un data URL base64 (data:image/<tipo>;base64,...). El frontend
    se encarga de redimensionar la imagen a max 256x256 con Canvas antes
    de enviarsela, por lo que el string deberia ser pequeno.

    Validaciones:
    - Debe comenzar con 'data:image/' para garantizar que es una imagen.
    - No puede superar _AVATAR_MAX_LEN caracteres (~2 MB de imagen original).
    """
    if not datos.avatar_b64.startswith("data:image/"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Formato invalido. La imagen debe ser un data URL (data:image/...).",
        )
    if len(datos.avatar_b64) > _AVATAR_MAX_LEN:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="La imagen es demasiado grande. Maximo 2 MB.",
        )
    usuario.avatar_b64 = datos.avatar_b64
    db.commit()
    db.refresh(usuario)
    return usuario


@router.post("/", response_model=UsuarioResponse)
def crear_usuario(
    request: Request,
    datos: UsuarioCreate,
    db: Session = Depends(get_db),
    admin: Usuario = Depends(require_admin),
):
    existente = db.query(Usuario).filter(Usuario.email == datos.email).first()
    if existente:
        raise HTTPException(status_code=400, detail="El email ya esta registrado")
    nuevo = Usuario(
        nombre=datos.nombre,
        email=datos.email,
        password_hash=hashear_password(datos.password),
        rol=datos.rol,
    )
    db.add(nuevo)
    db.commit()
    db.refresh(nuevo)
    registrar(
        db, "CREAR_USUARIO", usuario=admin,
        entidad="usuario", entidad_id=nuevo.id,
        detalle=nuevo.email, ip=get_ip(request),
    )
    return nuevo


@router.get("/{usuario_id}", response_model=UsuarioResponse)
def obtener_usuario(
    usuario_id: int,
    db: Session = Depends(get_db),
    admin: Usuario = Depends(require_admin),
):
    encontrado = db.query(Usuario).filter(Usuario.id == usuario_id).first()
    if not encontrado:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    return encontrado


@router.put("/{usuario_id}", response_model=UsuarioResponse)
def actualizar_usuario(
    usuario_id: int,
    request: Request,
    datos: UsuarioUpdate,
    db: Session = Depends(get_db),
    admin: Usuario = Depends(require_admin),
):
    """Actualiza nombre, email, rol, contrasena (opcional) y estado activo.

    - Validacion de email: si cambia, verifica que no exista en otro usuario.
    - Cambio de activo: queda registrado en audit_log como REACTIVAR_USUARIO o
      DESACTIVAR_USUARIO. Un admin no puede desactivarse a si mismo.
    """
    encontrado = db.query(Usuario).filter(Usuario.id == usuario_id).first()
    if not encontrado:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    if datos.email != encontrado.email:
        colision = db.query(Usuario).filter(Usuario.email == datos.email).first()
        if colision:
            raise HTTPException(status_code=400, detail="El email ya esta registrado")

    cambio_activo: str | None = None
    if datos.activo is not None and datos.activo != encontrado.activo:
        if encontrado.id == admin.id and datos.activo is False:
            raise HTTPException(
                status_code=400,
                detail="No puedes desactivarte a ti mismo",
            )
        cambio_activo = (
            "REACTIVAR_USUARIO" if datos.activo else "DESACTIVAR_USUARIO"
        )

    encontrado.nombre = datos.nombre
    encontrado.email = datos.email
    encontrado.rol = datos.rol
    if datos.password:
        encontrado.password_hash = hashear_password(datos.password)
    if datos.activo is not None:
        encontrado.activo = datos.activo

    db.commit()
    db.refresh(encontrado)
    registrar(
        db, "EDITAR_USUARIO", usuario=admin,
        entidad="usuario", entidad_id=encontrado.id,
        detalle=encontrado.email, ip=get_ip(request),
    )
    if cambio_activo:
        registrar(
            db, cambio_activo, usuario=admin,
            entidad="usuario", entidad_id=encontrado.id,
            detalle=encontrado.email, ip=get_ip(request),
        )
    return encontrado


@router.delete("/{usuario_id}")
def eliminar_usuario(
    usuario_id: int,
    request: Request,
    codigo_totp: str = Header(alias="x-totp-code"),
    db: Session = Depends(get_db),
    admin: Usuario = Depends(require_admin),
):
    """Soft-delete: marca al usuario como inactivo (activo=false).

    Antes este endpoint hacia DELETE fisico y fallaba con FK violation cuando
    el usuario tenia movimientos asociados (movimientos.usuario_id es NOT NULL
    sin ON DELETE policy). El resultado era un 500 sin JSON y el frontend
    mostraba un generico 'Error al eliminar' sin detalle.

    Ahora la fila se conserva: el usuario pierde acceso (no puede iniciar
    sesion, ni con sesion activa, ver deps.get_usuario_actual) pero su
    historial de movimientos sigue siendo trazable. Reactivable via
    PUT /usuarios/{id} con activo=true.

    Requiere rol admin + codigo TOTP valido (header x-totp-code).
    """
    if not admin.totp_habilitado or not admin.totp_secret:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Debes tener el 2FA activado para desactivar usuarios."
        )
    totp = pyotp.TOTP(admin.totp_secret)
    if not totp.verify(codigo_totp, valid_window=TOTP_VALID_WINDOW):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Codigo 2FA incorrecto. El usuario no fue desactivado."
        )
    encontrado = db.query(Usuario).filter(Usuario.id == usuario_id).first()
    if not encontrado:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    if encontrado.id == admin.id:
        raise HTTPException(
            status_code=400, detail="No puedes desactivarte a ti mismo"
        )
    if not encontrado.activo:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"{encontrado.nombre} ya esta inactivo",
        )
    encontrado.activo = False
    db.commit()
    registrar(
        db, "DESACTIVAR_USUARIO", usuario=admin,
        entidad="usuario", entidad_id=encontrado.id,
        detalle=encontrado.email, ip=get_ip(request),
    )
    return {"mensaje": f"Usuario {encontrado.nombre} desactivado"}


@router.post("/{usuario_id}/reset-2fa")
def reset_2fa_usuario(
    usuario_id: int,
    request: Request,
    db: Session = Depends(get_db),
    admin: Usuario = Depends(require_admin),
):
    """Desactiva el 2FA de cualquier usuario. Solo administradores."""
    target = db.query(Usuario).filter(Usuario.id == usuario_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    target.totp_habilitado = False
    target.totp_secret = None
    target.totp_recovery_codes = None
    db.commit()
    registrar(
        db, "RESET_2FA_USUARIO", usuario=admin,
        entidad="usuario", entidad_id=target.id,
        detalle=target.email, ip=get_ip(request),
    )
    return {"mensaje": f"2FA desactivado para {target.email}"}
