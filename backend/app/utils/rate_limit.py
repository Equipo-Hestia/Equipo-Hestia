"""
Rate limiter en memoria para el endpoint de login.

Por que limitamos por EMAIL y no por IP:
  En la arquitectura Docker Compose de Hestia, las peticiones del frontend
  llegan a la API desde la IP interna del contenedor (ej. 172.18.0.3),
  no desde la IP real del dispositivo cliente. Usar la IP como clave daria
  un rate limit compartido entre TODOS los usuarios, que es inutil.

  El email es el objetivo real de un ataque de fuerza bruta: el atacante
  quiere entrar a UNA cuenta especifica. Limitar por email protege exactamente
  lo que hay que proteger, independiente de donde venga el trafico.

Limites configurados:
  MAX_INTENTOS  = 5  intentos fallidos
  VENTANA_SEG   = 300 (5 min)  ventana de tiempo que se observa
  BLOQUEO_SEG   = 900 (15 min) tiempo de bloqueo al superar el limite

Thread-safety:
  Se usa threading.Lock porque uvicorn corre con un solo proceso por defecto.
  Si en el futuro se escala a multiples workers (--workers N), habria que
  reemplazar este store en memoria por Redis.
"""

import threading
from collections import defaultdict
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, status

MAX_INTENTOS = 5
VENTANA_SEG = 300   # 5 minutos
BLOQUEO_SEG = 900   # 15 minutos

_lock = threading.Lock()
_intentos: dict[str, list[datetime]] = defaultdict(list)
_bloqueados: dict[str, datetime] = {}


def _clave(email: str) -> str:
    """Normaliza el email para que no haya bypass con mayusculas."""
    return email.strip().lower()


def verificar_limite(email: str) -> None:
    """Lanza HTTP 429 si la cuenta esta bloqueada o supero el limite.
    Llamar ANTES de validar credenciales.
    """
    clave = _clave(email)
    ahora = datetime.now(timezone.utc)

    with _lock:
        # 1. Chequear bloqueo activo
        if clave in _bloqueados:
            if ahora < _bloqueados[clave]:
                restantes = int((_bloqueados[clave] - ahora).total_seconds())
                minutos = restantes // 60 or 1
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail=(
                        f"Demasiados intentos fallidos. "
                        f"Intenta de nuevo en {minutos} minuto{'s' if minutos != 1 else ''}."
                    )
                )
            # Bloqueo expirado: limpiar
            del _bloqueados[clave]
            _intentos[clave] = []

        # 2. Descartar intentos fuera de la ventana
        ventana_inicio = ahora - timedelta(seconds=VENTANA_SEG)
        _intentos[clave] = [
            t for t in _intentos[clave] if t > ventana_inicio
        ]

        # 3. Verificar si ya supero el limite
        if len(_intentos[clave]) >= MAX_INTENTOS:
            _bloqueados[clave] = ahora + timedelta(seconds=BLOQUEO_SEG)
            _intentos[clave] = []
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=(
                    f"Demasiados intentos fallidos. "
                    f"Cuenta bloqueada por {BLOQUEO_SEG // 60} minutos."
                )
            )


def registrar_fallo(email: str) -> None:
    """Registra un intento fallido. Llamar cuando las credenciales son incorrectas."""
    clave = _clave(email)
    ahora = datetime.now(timezone.utc)
    with _lock:
        _intentos[clave].append(ahora)


def limpiar(email: str) -> None:
    """Limpia el contador de la cuenta tras un login exitoso."""
    clave = _clave(email)
    with _lock:
        _intentos.pop(clave, None)
        _bloqueados.pop(clave, None)


def intentos_restantes(email: str) -> int:
    """Devuelve cuantos intentos quedan antes del bloqueo.
    Llamar despues de registrar_fallo().
    """
    clave = _clave(email)
    ahora = datetime.now(timezone.utc)
    with _lock:
        ventana_inicio = ahora - timedelta(seconds=VENTANA_SEG)
        recientes = [t for t in _intentos[clave] if t > ventana_inicio]
        return max(0, MAX_INTENTOS - len(recientes))
