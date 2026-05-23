"""
Blacklist en memoria de JWT revocados (logout).

Cada entrada es jti -> timestamp_expiry (float UTC). Las entradas se
purgan automaticamente cuando el token habria expirado de todos modos,
evitando crecimiento ilimitado de la estructura.

Limitacion conocida: la blacklist se pierde al reiniciar el proceso, y no
se comparte entre workers. Para despliegues multi-proceso o si se necesita
persistencia entre reinicios, reemplazar por Redis.
"""
import threading
from datetime import datetime, timezone

_lock = threading.Lock()
_blacklist: dict[str, float] = {}  # jti -> timestamp UTC de expiracion


def revocar(jti: str, exp: float) -> None:
    """Agrega un jti al blacklist. exp es el timestamp UTC del claim 'exp' del JWT."""
    with _lock:
        _blacklist[jti] = exp
        _purgar()


def esta_revocado(jti: str) -> bool:
    """Devuelve True si el jti fue revocado y el token aun no ha expirado."""
    with _lock:
        _purgar()
        return jti in _blacklist


def _purgar() -> None:
    """Elimina entradas vencidas. Debe llamarse dentro del lock."""
    ahora = datetime.now(timezone.utc).timestamp()
    vencidos = [j for j, exp in _blacklist.items() if exp < ahora]
    for j in vencidos:
        del _blacklist[j]
