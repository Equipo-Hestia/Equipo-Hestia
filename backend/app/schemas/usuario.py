import re
from typing import Optional
from pydantic import BaseModel, EmailStr, field_validator
from app.models.usuario import RolUsuario

_PASSWORD_REGLAS = [
    (r'[A-Z]', "al menos una letra mayuscula"),
    (r'[a-z]', "al menos una letra minuscula"),
    (r'\d', "al menos un numero"),
    (r'[^a-zA-Z0-9]', "al menos un caracter especial (!@#$%, etc.)"),
]


def _validar_complejidad_password(v: str) -> str:
    """Valida politica de seguridad de contrasena."""
    if len(v) < 8:
        raise ValueError("Minimo 8 caracteres")
    for patron, mensaje in _PASSWORD_REGLAS:
        if not re.search(patron, v):
            raise ValueError(f"Debe contener {mensaje}")
    return v


class UsuarioCreate(BaseModel):
    nombre: str
    email: EmailStr
    password: str
    rol: RolUsuario = RolUsuario.visor

    @field_validator('password')
    @classmethod
    def validar_password(cls, v: str) -> str:
        return _validar_complejidad_password(v)


class UsuarioUpdate(BaseModel):
    """Actualiza un usuario existente.

    password es opcional: si se omite o es None, se conserva el actual.
    activo es opcional: permite reactivar (true) o desactivar (false) sin
    pasar por el flujo DELETE con TOTP. Por seguridad, un admin no puede
    desactivarse a si mismo via este endpoint (validacion en el route).
    """
    nombre: str
    email: EmailStr
    rol: RolUsuario
    password: Optional[str] = None
    activo: Optional[bool] = None

    @field_validator('password', mode='before')
    @classmethod
    def validar_password_opcional(cls, v):
        if v is None:
            return v
        return _validar_complejidad_password(str(v))


class AvatarUpdate(BaseModel):
    """Actualiza la foto de perfil del usuario autenticado.

    avatar_b64 debe ser un data URL completo: data:image/<tipo>;base64,...
    El frontend redimensiona la imagen a max 256x256 con Canvas antes de
    enviarla, por lo que el string resultante ocupa aprox. 30-80 KB.
    El backend rechaza strings que superen 3 MB (~2 MB de imagen original).
    """
    avatar_b64: str


class UsuarioResponse(BaseModel):
    id: int
    nombre: str
    email: str
    rol: RolUsuario
    totp_habilitado: bool = False
    activo: bool = True
    avatar_b64: Optional[str] = None

    class Config:
        from_attributes = True


class CambiarPassword(BaseModel):
    """Schema para cambiar la contrasena del usuario autenticado."""
    password_actual: str
    password_nueva: str

    @field_validator('password_nueva')
    @classmethod
    def validar_complejidad(cls, v: str) -> str:
        return _validar_complejidad_password(v)
