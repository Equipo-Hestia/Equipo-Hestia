"""Respuesta 503 cuando PostgreSQL no esta disponible.

Mientras PostgreSQL arranca (por ejemplo, tras una caida o un reinicio del
contenedor `db`) rechaza conexiones con "the database system is starting up".
Sin este manejador ese error llegaba al cliente como un 500 generico. Ahora se
responde 503 con un mensaje claro y `Retry-After`, y el log registra una sola
linea en vez de un traceback.

Solo se tratan asi los errores de *disponibilidad* (no se puede conectar o la
conexion se corto). Cualquier otro error de base de datos (una consulta
cancelada, un bloqueo, etc.) se vuelve a lanzar y sigue siendo un 500.
"""
import logging

from fastapi import Request
from fastapi.responses import JSONResponse
from sqlalchemy.exc import DBAPIError

logger = logging.getLogger("hestia.bd")

MENSAJE = "La base de datos se está iniciando, intenta en unos segundos."
REINTENTAR_EN_SEGUNDOS = "5"

# SQLSTATE de PostgreSQL que significan "el servidor no atiende conexiones":
# admin_shutdown, crash_shutdown, cannot_connect_now (arrancando o en recuperacion).
_CODIGOS_NO_DISPONIBLE = {"57P01", "57P02", "57P03"}

# Errores de conexion de libpq/psycopg2 (no traen SQLSTATE).
_MENSAJES_NO_DISPONIBLE = (
    "the database system is starting up",
    "the database system is shutting down",
    "the database system is in recovery mode",
    "connection refused",
    "could not connect to server",
    "could not translate host name",
    "server closed the connection unexpectedly",
    "terminating connection",
    "no route to host",
    "timeout expired",
)


def es_bd_no_disponible(exc: DBAPIError) -> bool:
    codigo = getattr(exc.orig, "pgcode", None)
    if codigo in _CODIGOS_NO_DISPONIBLE:
        return True
    if exc.connection_invalidated:
        return True
    if codigo:
        return False
    mensaje = str(exc.orig).lower()
    return any(m in mensaje for m in _MENSAJES_NO_DISPONIBLE)


async def manejar_bd_no_disponible(request: Request, exc: DBAPIError):
    if not es_bd_no_disponible(exc):
        raise exc
    detalle = str(exc.orig).strip().splitlines()[-1] if str(exc.orig).strip() else ""
    logger.warning(
        "Base de datos no disponible (%s %s): %s",
        request.method, request.url.path, detalle,
    )
    return JSONResponse(
        status_code=503,
        content={"detail": MENSAJE},
        headers={"Retry-After": REINTENTAR_EN_SEGUNDOS},
    )
