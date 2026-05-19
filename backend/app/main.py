import os
from fastapi import FastAPI, Request, Response
from fastapi.openapi.utils import get_openapi
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from app.database import Base, engine, aplicar_migraciones_pendientes
# Importar todos los modelos para que SQLAlchemy registre sus tablas.
# create_all() necesita conocer TODOS los modelos antes de ejecutarse.
from app.models import sala, categoria, usuario, movimiento, insumo  # noqa
from app.models import audit_log  # noqa
from app.models import solicitud  # noqa  <- SolicitudRetiro y SolicitudItem
from app.models import token_recuperacion  # noqa  <- TokenRecuperacion
from app.routes import (
    salas, categorias, usuarios, movimientos, insumos, auth, resumen, importar
)
from app.routes import audit_log as audit_log_routes
from app.routes import solicitudes

# 1) crea tablas que no existen. 2) aplica ALTER TABLE / ALTER TYPE idempotentes
# para columnas y valores de enum agregados a tablas ya existentes.
Base.metadata.create_all(bind=engine)
aplicar_migraciones_pendientes()

# /docs y /redoc solo se habilitan si DOCS_HABILITADOS=true en el entorno.
# En produccion debe quedar en false (valor por defecto).
_docs_habilitados = os.getenv("DOCS_HABILITADOS", "false").lower() == "true"

# Origen del frontend permitido por CORS. En LAN usar la IP del servidor.
# Ej: CORS_ORIGIN=http://192.168.1.50:3000
_cors_origin = os.getenv("CORS_ORIGIN", "http://localhost:3000")

app = FastAPI(
    title="Hestia",
    description="Sistema de gestion de insumos - DuocUC",
    version="0.1.0",
    docs_url="/docs" if _docs_habilitados else None,
    redoc_url="/redoc" if _docs_habilitados else None,
)


# ---------------------------------------------------------------------------
# Security Headers Middleware
# ---------------------------------------------------------------------------
_CSP = (
    "default-src 'self'; "
    "script-src 'self' 'unsafe-inline'; "
    "style-src 'self' 'unsafe-inline'; "
    "img-src 'self' data:; "
    "font-src 'self'; "
    "connect-src 'self' ws: wss:; "
    "frame-ancestors 'none'; "
    "base-uri 'self'; "
    "form-action 'self'"
)

SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "X-XSS-Protection": "1; mode=block",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    # camera=(self) permite que el frontend use la camara del dispositivo
    # para escanear codigos de barras desde movil. Restringido al origen propio.
    "Permissions-Policy": "camera=(self), microphone=(), geolocation=()",
    "Content-Security-Policy": _CSP,
}


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        response = await call_next(request)
        for header, value in SECURITY_HEADERS.items():
            response.headers[header] = value
        return response


# SecurityHeadersMiddleware es interior; CORSMiddleware es exterior para que
# responda a preflight OPTIONS antes de que el request llegue a las rutas.
app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[_cors_origin],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

app.include_router(salas.router)
app.include_router(categorias.router)
app.include_router(usuarios.router)
app.include_router(movimientos.router)
app.include_router(insumos.router)
app.include_router(auth.router)
app.include_router(resumen.router)
app.include_router(importar.router)
app.include_router(audit_log_routes.router)
app.include_router(solicitudes.router)


@app.get("/")
def raiz():
    return {"mensaje": "Bienvenido a Hestia", "estado": "activo"}


def custom_openapi():
    if app.openapi_schema:
        return app.openapi_schema
    schema = get_openapi(
        title=app.title,
        version=app.version,
        description=app.description,
        routes=app.routes,
    )
    schema.setdefault("components", {}).setdefault("securitySchemes", {})
    schema["components"]["securitySchemes"]["BearerAuth"] = {
        "type": "http",
        "scheme": "bearer",
        "bearerFormat": "JWT",
        "description": "Pega aqui el access_token obtenido desde /auth/login",
    }
    for path_data in schema.get("paths", {}).values():
        for operation in path_data.values():
            if isinstance(operation, dict) and "security" in operation:
                operation["security"].append({"BearerAuth": []})
    app.openapi_schema = schema
    return app.openapi_schema


app.openapi = custom_openapi
