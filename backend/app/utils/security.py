from jose import JWTError, jwt
from datetime import datetime, timedelta, timezone
from dotenv import load_dotenv
import hashlib
import bcrypt
import uuid
import os

load_dotenv()

SECRET_KEY = os.getenv("SECRET_KEY")
ALGORITHM = os.getenv("ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", 30))

if not SECRET_KEY:
    raise RuntimeError(
        "SECRET_KEY no esta configurada. "
        "Crea backend/.env con SECRET_KEY=<clave-segura>."
    )


def _prehash(password: str) -> bytes:
    return hashlib.sha256(password.encode()).hexdigest().encode("utf-8")


def hashear_password(password: str) -> str:
    return bcrypt.hashpw(_prehash(password), bcrypt.gensalt()).decode("utf-8")


def verificar_password(password: str, hash: str) -> bool:
    return bcrypt.checkpw(_prehash(password), hash.encode("utf-8"))


def crear_token(data: dict) -> str:
    """JWT de acceso completo con expiracion configurada en el .env.
    Incluye jti (JWT ID) para permitir revocacion individual via logout."""
    payload = data.copy()
    payload.update({
        "exp": datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES),
        "jti": str(uuid.uuid4()),
    })
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def crear_pre_token(data: dict) -> str:
    """JWT de vida corta (5 min) para el segundo paso del login con 2FA.
    Lleva tipo='pre_auth' para diferenciarlo de un token de acceso completo.
    Los endpoints protegidos rechazan este tipo de token."""
    payload = data.copy()
    payload.update({
        "exp": datetime.now(timezone.utc) + timedelta(minutes=5),
        "tipo": "pre_auth"
    })
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def crear_setup_token(data: dict) -> str:
    """JWT de vida corta (15 min) para el flujo de configuracion inicial de 2FA.
    Lleva tipo='setup_2fa' para diferenciarlo del pre_auth y del access token.
    Se emite cuando el usuario inicia sesion sin tener el 2FA habilitado,
    forzando la configuracion antes de acceder al sistema."""
    payload = data.copy()
    payload.update({
        "exp": datetime.now(timezone.utc) + timedelta(minutes=15),
        "tipo": "setup_2fa"
    })
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def verificar_token(token: str) -> dict | None:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except JWTError:
        return None
