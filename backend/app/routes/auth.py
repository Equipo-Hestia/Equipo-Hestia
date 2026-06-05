import os
import re
import logging
import hashlib
import json
import secrets
import io
import base64
import pyotp
import qrcode
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel, field_validator
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.usuario import Usuario
from app.models.token_recuperacion import TokenRecuperacion
from app.utils.security import (
    verificar_password, crear_token, crear_pre_token, crear_setup_token,
    verificar_token, hashear_password,
)
from app.utils.deps import get_usuario_actual, oauth2_scheme
from app.utils.rate_limit import verificar_limite, registrar_fallo, limpiar, intentos_restantes
from app.utils.auditoria import registrar, get_ip
from app.utils.token_blacklist import revocar
from app.utils.email import enviar_email

router = APIRouter(prefix="/auth", tags=["Autenticacion"])

_log = logging.getLogger("hestia.auth")

# Zona horaria del sistema: America/Santiago
# Se usa para determinar si un login ocurre dentro del horario laboral.
# Chile opera principalmente en UTC-3 (CLST verano) y UTC-4 (CLT invierno).
_TZ_CHILE = ZoneInfo("America/Santiago")

TOTP_VALID_WINDOW = 1
NUM_RECOVERY_CODES = 10
CUENTA_INACTIVA_DETALLE = "Cuenta inactiva. Contacta al administrador."

# Horario laboral en hora local de Santiago.
# HORARIO_INICIO_H=7  → alertas si login antes de las 07:00 AM
# HORARIO_FIN_H=23    → alertas si login a las 23:00 en adelante
# El turno vespertino de DuocUC puede terminar cerca de las 22:00,
# por lo que 23h es un margen razonable para no generar falsos positivos.
HORARIO_INICIO_H = int(os.getenv("HORARIO_INICIO_H", "7"))
HORARIO_FIN_H = int(os.getenv("HORARIO_FIN_H", "23"))

_PASSWORD_REGLAS = [
    (r'[A-Z]', "al menos una letra mayuscula"),
    (r'[a-z]', "al menos una letra minuscula"),
    (r'\d', "al menos un numero"),
    (r'[^a-zA-Z0-9]', "al menos un caracter especial"),
]


# ---------------------------------------------------------------------------
# Schemas de request/response
# ---------------------------------------------------------------------------

class LoginResponse(BaseModel):
    requires_2fa: bool = False
    requires_2fa_setup: bool = False  # True: debe configurar 2FA (es obligatorio)
    access_token: Optional[str] = None
    token_type: str = "bearer"
    usuario: Optional[str] = None
    rol: Optional[str] = None
    pre_token: Optional[str] = None
    recovery_codes: Optional[list[str]] = None  # devueltos al activar 2FA inicial


class Setup2FAResponse(BaseModel):
    qr_code: str
    secret: str


class ActivarResponse(BaseModel):
    mensaje: str
    recovery_codes: list[str]


class Completar2FARequest(BaseModel):
    pre_token: str
    codigo: str


class RecuperoRequest(BaseModel):
    pre_token: str
    recovery_code: str


class CodigoTOTPRequest(BaseModel):
    codigo: str


class Setup2FAInicialRequest(BaseModel):
    setup_token: str


class Activar2FAInicialRequest(BaseModel):
    setup_token: str
    codigo: str


class SolicitarRecoveryRequest(BaseModel):
    email: str


class ConfirmarResetRequest(BaseModel):
    token: str
    nueva_password: str

    @field_validator("nueva_password")
    @classmethod
    def _check_complexity(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Minimo 8 caracteres")
        for patron, msg in _PASSWORD_REGLAS:
            if not re.search(patron, v):
                raise ValueError(f"Debe contener {msg}")
        return v


# ---------------------------------------------------------------------------
# Helpers internos
# ---------------------------------------------------------------------------

def _generar_qr_base64(uri: str) -> str:
    qr = qrcode.QRCode(box_size=10, border=4)
    qr.add_data(uri)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")
    buffer = io.BytesIO()
    img.save(buffer, format="PNG")
    return "data:image/png;base64," + base64.b64encode(buffer.getvalue()).decode()


def _generar_recovery_codes() -> tuple[list[str], str]:
    """Genera NUM_RECOVERY_CODES codigos aleatorios.
    Devuelve (lista_plana, json_con_hashes).
    Los codigos planos se muestran al usuario UNA sola vez.
    """
    codigos: list[str] = []
    registros: list[dict] = []
    for _ in range(NUM_RECOVERY_CODES):
        parte1 = secrets.token_hex(4).upper()
        parte2 = secrets.token_hex(4).upper()
        codigo = f"{parte1}-{parte2}"
        hash_hex = hashlib.sha256(codigo.encode()).hexdigest()
        codigos.append(codigo)
        registros.append({"hash": hash_hex, "usado": False})
    return codigos, json.dumps(registros)


def _verificar_y_consumir_recovery_code(
    usuario: Usuario, codigo: str, db: Session
) -> bool:
    if not usuario.totp_recovery_codes:
        return False
    registros = json.loads(usuario.totp_recovery_codes)
    hash_input = hashlib.sha256(codigo.upper().encode()).hexdigest()
    for reg in registros:
        if not reg["usado"] and reg["hash"] == hash_input:
            reg["usado"] = True
            usuario.totp_recovery_codes = json.dumps(registros)
            db.commit()
            return True
    return False


# ---------------------------------------------------------------------------
# Login / Logout
# ---------------------------------------------------------------------------

@router.post("/login", response_model=LoginResponse)
def login(
    request: Request,
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db),
):
    """Login con rate limiting, audit log y alertas de comportamiento sospechoso.

    Flujo:
    1. verificar_limite() — bloquea antes de tocar la BD si la cuenta esta bloqueada.
       Si el limite se supera, registra ALERTA_CUENTA_BLOQUEADA en el audit log.
    2. Credenciales incorrectas -> LOGIN_FALLIDO.
       Si quedan <= 2 intentos, registra ALERTA_INTENTOS_FALLIDOS.
    3. Cuenta inactiva -> LOGIN_BLOQUEADO_INACTIVO.
    4. Login exitoso fuera del horario configurado -> ALERTA_ACCESO_FUERA_HORARIO.
       La comparacion usa hora local de Santiago (America/Santiago), NO UTC.
    Con 2FA habilitado: devuelve pre_token (5 min).
    Sin 2FA configurado (nuevo usuario o reset): devuelve setup_token (15 min)
    con requires_2fa_setup=True — el usuario DEBE configurar 2FA antes de entrar.
    """
    try:
        verificar_limite(form_data.username)
    except HTTPException as exc:
        if exc.status_code == status.HTTP_429_TOO_MANY_REQUESTS:
            registrar(
                db, "ALERTA_CUENTA_BLOQUEADA",
                detalle=form_data.username,
                ip=get_ip(request),
            )
        raise

    usuario = db.query(Usuario).filter(
        Usuario.email == form_data.username
    ).first()

    if not usuario or not verificar_password(
        form_data.password, usuario.password_hash
    ):
        registrar_fallo(form_data.username)
        restantes = intentos_restantes(form_data.username)
        registrar(
            db, "LOGIN_FALLIDO",
            usuario=usuario,
            detalle=form_data.username,
            ip=get_ip(request),
        )
        if 0 < restantes <= 2:
            registrar(
                db, "ALERTA_INTENTOS_FALLIDOS",
                usuario=usuario,
                detalle=f"{restantes} intento(s) restante(s) — {form_data.username}",
                ip=get_ip(request),
            )
        if restantes > 0:
            s = 's' if restantes != 1 else ''
            n = 'n' if restantes != 1 else ''
            detail = (
                f"Email o contrasena incorrectos. "
                f"Te queda{n} {restantes} intento{s} antes del bloqueo."
            )
        else:
            detail = "Email o contrasena incorrectos."
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=detail,
        )

    # Credenciales validas pero la cuenta esta desactivada (soft-deleted).
    # Se chequea DESPUES del password para no revelar existencia de cuentas.
    if not usuario.activo:
        registrar(
            db, "LOGIN_BLOQUEADO_INACTIVO",
            usuario=usuario,
            detalle=usuario.email,
            ip=get_ip(request),
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=CUENTA_INACTIVA_DETALLE,
        )

    limpiar(form_data.username)
    registrar(db, "LOGIN_EXITOSO", usuario=usuario, ip=get_ip(request))

    # Comparacion en hora local de Santiago, no UTC.
    # Evita falsos positivos cuando el vespertino termina tarde (22h+).
    hora_local = datetime.now(_TZ_CHILE).hour
    if hora_local < HORARIO_INICIO_H or hora_local >= HORARIO_FIN_H:
        registrar(
            db, "ALERTA_ACCESO_FUERA_HORARIO",
            usuario=usuario,
            detalle=(
                f"Login a las {hora_local:02d}h (hora Santiago) "
                f"(horario configurado: {HORARIO_INICIO_H}h-{HORARIO_FIN_H}h)"
            ),
            ip=get_ip(request),
        )

    if usuario.totp_habilitado:
        pre_token = crear_pre_token({"sub": str(usuario.id)})
        return LoginResponse(requires_2fa=True, pre_token=pre_token)

    # 2FA es obligatorio: el usuario no lo tiene configurado aun.
    # Emitir setup_token para que complete la configuracion antes de acceder.
    setup_token = crear_setup_token({"sub": str(usuario.id)})
    return LoginResponse(
        requires_2fa_setup=True,
        pre_token=setup_token,
    )


@router.post("/logout")
def logout(
    token: str = Depends(oauth2_scheme),
    usuario: Usuario = Depends(get_usuario_actual),
):
    """Revoca el JWT activo del usuario. Efecto inmediato en todas las requests."""
    payload = verificar_token(token)
    if payload:
        jti = payload.get("jti")
        exp = payload.get("exp")
        if jti and exp:
            revocar(jti, float(exp))
    return {"mensaje": "Sesion cerrada correctamente"}


# ---------------------------------------------------------------------------
# 2FA — flujo de verificacion post-login
# ---------------------------------------------------------------------------

@router.post("/2fa/completar-login", response_model=LoginResponse)
def completar_login_2fa(
    datos: Completar2FARequest, db: Session = Depends(get_db)
):
    """Paso 2 con codigo TOTP. Devuelve JWT completo.

    Devuelve 403 (no 401) si el codigo es incorrecto para que el interceptor
    de Axios no fuerce un logout automatico al usuario.
    """
    payload = verificar_token(datos.pre_token)
    if payload is None or payload.get("tipo") != "pre_auth":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="pre_token invalido o expirado",
        )
    try:
        uid = int(payload["sub"])
    except (KeyError, ValueError, TypeError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="pre_token invalido o expirado",
        )
    usuario = db.query(Usuario).filter(Usuario.id == uid).first()
    if not usuario or not usuario.totp_habilitado or not usuario.totp_secret:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Usuario o configuracion 2FA no valida",
        )
    if not usuario.activo:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=CUENTA_INACTIVA_DETALLE,
        )
    verificar_limite(usuario.email)
    totp = pyotp.TOTP(usuario.totp_secret)
    if not totp.verify(datos.codigo, valid_window=TOTP_VALID_WINDOW):
        registrar_fallo(usuario.email)
        # 403 en lugar de 401: el usuario esta autenticado con credenciales validas;
        # solo el segundo factor es incorrecto. Un 401 dispararía el interceptor
        # de Axios y cerraría la sesion de forma incorrecta.
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Codigo 2FA incorrecto",
        )
    limpiar(usuario.email)
    token = crear_token({"sub": str(usuario.id), "rol": usuario.rol.value})
    return LoginResponse(
        requires_2fa=False,
        access_token=token,
        usuario=usuario.nombre,
        rol=usuario.rol.value,
    )


@router.post("/2fa/recuperar-acceso", response_model=LoginResponse)
def recuperar_acceso_2fa(
    datos: RecuperoRequest, db: Session = Depends(get_db)
):
    """Paso 2 alternativo usando un codigo de recuperacion de un solo uso.

    Tras consumir el codigo, el 2FA queda deshabilitado y se emite un
    setup_token para que el usuario lo reconfigure obligatoriamente.
    """
    payload = verificar_token(datos.pre_token)
    if payload is None or payload.get("tipo") != "pre_auth":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="pre_token invalido o expirado",
        )
    try:
        uid = int(payload["sub"])
    except (KeyError, ValueError, TypeError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="pre_token invalido o expirado",
        )
    usuario = db.query(Usuario).filter(Usuario.id == uid).first()
    if not usuario or not usuario.totp_habilitado:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Usuario o configuracion 2FA no valida",
        )
    if not usuario.activo:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=CUENTA_INACTIVA_DETALLE,
        )
    if not _verificar_y_consumir_recovery_code(usuario, datos.recovery_code, db):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Codigo de recuperacion invalido o ya utilizado",
        )
    # Deshabilitar 2FA y forzar reconfigurar (2FA es obligatorio)
    usuario.totp_habilitado = False
    usuario.totp_secret = None
    usuario.totp_recovery_codes = None
    db.commit()
    setup_token = crear_setup_token({"sub": str(usuario.id)})
    return LoginResponse(
        requires_2fa_setup=True,
        pre_token=setup_token,
    )


# ---------------------------------------------------------------------------
# 2FA — gestion de configuracion
# ---------------------------------------------------------------------------

@router.post("/2fa/setup", response_model=Setup2FAResponse)
def setup_2fa(
    usuario: Usuario = Depends(get_usuario_actual),
    db: Session = Depends(get_db),
):
    if not usuario.totp_secret:
        usuario.totp_secret = pyotp.random_base32()
        db.commit()
    totp = pyotp.TOTP(usuario.totp_secret)
    uri = totp.provisioning_uri(name=usuario.email, issuer_name="Hestia")
    return Setup2FAResponse(
        qr_code=_generar_qr_base64(uri),
        secret=usuario.totp_secret,
    )


@router.post("/2fa/activar", response_model=ActivarResponse)
def activar_2fa(
    datos: CodigoTOTPRequest,
    usuario: Usuario = Depends(get_usuario_actual),
    db: Session = Depends(get_db),
):
    """Confirma el QR y activa 2FA. Devuelve 10 codigos de recuperacion."""
    if usuario.totp_habilitado:
        raise HTTPException(status_code=400, detail="El 2FA ya esta habilitado")
    if not usuario.totp_secret:
        raise HTTPException(status_code=400, detail="Primero llama a /auth/2fa/setup")
    totp = pyotp.TOTP(usuario.totp_secret)
    if not totp.verify(datos.codigo, valid_window=TOTP_VALID_WINDOW):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Codigo incorrecto. Asegurate de haber escaneado el QR.",
        )
    codigos_planos, json_hashes = _generar_recovery_codes()
    usuario.totp_habilitado = True
    usuario.totp_recovery_codes = json_hashes
    db.commit()
    return ActivarResponse(
        mensaje="2FA activado correctamente.",
        recovery_codes=codigos_planos,
    )


@router.post("/2fa/desactivar")
def desactivar_2fa(
    datos: CodigoTOTPRequest,
    usuario: Usuario = Depends(get_usuario_actual),
    db: Session = Depends(get_db),
):
    """El 2FA es obligatorio en Hestia y no puede desactivarse por el usuario.
    Solo un administrador puede resetear el 2FA desde el panel de usuarios
    (/usuarios/{id}/reset-2fa).
    """
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail=(
            "El 2FA es obligatorio en Hestia y no puede desactivarse. "
            "Contacta al administrador si necesitas resetear tu configuracion."
        ),
    )


@router.post("/2fa/setup-inicial", response_model=Setup2FAResponse)
def setup_2fa_inicial(
    datos: Setup2FAInicialRequest, db: Session = Depends(get_db)
):
    """Setup inicial de 2FA usando un setup_token.

    El setup_token se obtiene en dos casos:
    - Usuario que inicia sesion por primera vez (sin 2FA configurado).
    - Usuario que uso un codigo de recuperacion (2FA reseteado).
    Tiene una validez de 15 minutos. Devuelve QR y clave manual.
    """
    payload = verificar_token(datos.setup_token)
    if payload is None or payload.get("tipo") != "setup_2fa":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token de configuracion invalido o expirado",
        )
    try:
        uid = int(payload["sub"])
    except (KeyError, ValueError, TypeError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token de configuracion invalido",
        )
    usuario = db.query(Usuario).filter(
        Usuario.id == uid, Usuario.activo.is_(True)
    ).first()
    if not usuario:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Usuario no valido",
        )
    if not usuario.totp_secret:
        usuario.totp_secret = pyotp.random_base32()
        db.commit()
    totp = pyotp.TOTP(usuario.totp_secret)
    uri = totp.provisioning_uri(name=usuario.email, issuer_name="Hestia")
    return Setup2FAResponse(
        qr_code=_generar_qr_base64(uri),
        secret=usuario.totp_secret,
    )


@router.post("/2fa/activar-inicial", response_model=LoginResponse)
def activar_2fa_inicial(
    datos: Activar2FAInicialRequest, db: Session = Depends(get_db)
):
    """Confirma el QR, activa el 2FA y devuelve JWT completo + recovery codes.

    Finaliza el flujo de configuracion inicial obligatoria: el usuario pasa
    directamente a estar autenticado tras configurar correctamente el 2FA.

    Devuelve 403 (no 401) si el codigo es incorrecto para preservar el estado
    del setup en el frontend y evitar que el interceptor de Axios cierre la
    sesion. Esto permite al usuario corregir el codigo sin perder el QR ya
    escaneado ni tener que reiniciar el flujo desde el login.
    """
    payload = verificar_token(datos.setup_token)
    if payload is None or payload.get("tipo") != "setup_2fa":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token de configuracion invalido o expirado",
        )
    try:
        uid = int(payload["sub"])
    except (KeyError, ValueError, TypeError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token de configuracion invalido",
        )
    usuario = db.query(Usuario).filter(
        Usuario.id == uid, Usuario.activo.is_(True)
    ).first()
    if not usuario or not usuario.totp_secret:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Usuario no valido o configuracion 2FA no iniciada",
        )
    if usuario.totp_habilitado:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El 2FA ya esta habilitado",
        )
    totp = pyotp.TOTP(usuario.totp_secret)
    if not totp.verify(datos.codigo, valid_window=TOTP_VALID_WINDOW):
        # 403 en lugar de 401: el usuario llego hasta aqui con credenciales
        # validas y un QR ya escaneado. Un 401 dispararía el interceptor de
        # Axios, destruiría el estado del componente Login y forzaría un nuevo
        # QR al reiniciar sesion, invalidando la cuenta TOTP ya vinculada.
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Codigo incorrecto. Asegurate de haber escaneado el QR.",
        )
    codigos_planos, json_hashes = _generar_recovery_codes()
    usuario.totp_habilitado = True
    usuario.totp_recovery_codes = json_hashes
    db.commit()
    token = crear_token({"sub": str(usuario.id), "rol": usuario.rol.value})
    return LoginResponse(
        access_token=token,
        usuario=usuario.nombre,
        rol=usuario.rol.value,
        recovery_codes=codigos_planos,
    )


# ---------------------------------------------------------------------------
# Recuperacion de contrasena sin dependencia del admin
# ---------------------------------------------------------------------------

@router.post("/recuperar-password")
def solicitar_recuperacion(
    datos: SolicitarRecoveryRequest,
    db: Session = Depends(get_db),
):
    """Genera un token de recuperacion y lo envia por email (o loguea si no hay SMTP).

    Siempre responde con el mismo mensaje para no revelar si el email existe.
    Token valido por 1 hora, de un solo uso.
    """
    usuario = db.query(Usuario).filter(
        Usuario.email == datos.email,
        Usuario.activo.is_(True),
    ).first()
    if usuario:
        token = secrets.token_urlsafe(32)
        token_hash = hashlib.sha256(token.encode()).hexdigest()
        expira = datetime.now(timezone.utc) + timedelta(hours=1)
        db.add(TokenRecuperacion(
            email=datos.email,
            token_hash=token_hash,
            expira_en=expira,
        ))
        db.commit()
        base_url = os.getenv("BASE_URL", "http://localhost:3000")
        link = f"{base_url}/reset-password?token={token}"
        try:
            enviar_email(
                datos.email,
                "Recuperar contrasena — Hestia",
                f"<p>Hola {usuario.nombre},</p>"
                f"<p>Usa este enlace para restablecer tu contrasena "
                f"(valido por 1 hora):</p>"
                f"<p><a href='{link}'>{link}</a></p>"
                f"<p>Si no solicitaste este cambio, ignora este mensaje.</p>",
            )
        except Exception:
            _log.info("Recovery link (sin SMTP): %s -> %s", datos.email, link)
    return {"mensaje": "Si el email existe en el sistema, recibiras instrucciones."}


@router.post("/confirmar-reset")
def confirmar_reset(
    datos: ConfirmarResetRequest,
    db: Session = Depends(get_db),
):
    """Valida el token de recuperacion y actualiza la contrasena.

    El token es de un solo uso y expira en 1 hora.
    La nueva contrasena debe cumplir la politica de complejidad.
    """
    token_hash = hashlib.sha256(datos.token.encode()).hexdigest()
    ahora = datetime.now(timezone.utc)
    registro = db.query(TokenRecuperacion).filter(
        TokenRecuperacion.token_hash == token_hash,
        TokenRecuperacion.usado.is_(False),
        TokenRecuperacion.expira_en > ahora,
    ).first()
    if not registro:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Token invalido o expirado",
        )
    usuario = db.query(Usuario).filter(
        Usuario.email == registro.email,
        Usuario.activo.is_(True),
    ).first()
    if not usuario:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Token invalido o expirado",
        )
    registro.usado = True
    usuario.password_hash = hashear_password(datos.nueva_password)
    db.commit()
    return {"mensaje": "Contrasena actualizada correctamente"}
