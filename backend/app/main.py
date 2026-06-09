import os
from fastapi import FastAPI, Request, Response
from fastapi.openapi.utils import get_openapi
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from app.database import Base, engine, aplicar_migraciones_pendientes
# Importar todos los modelos para que SQLAlchemy registre sus tablas antes de
# create_all(). El orden importa: modelos con FK deben cargarse despues del
# modelo referenciado.
from app.models import sala, categoria, usuario, movimiento, insumo  # noqa
from app.models import audit_log          # noqa
from app.models import asignatura         # noqa  <- Fase 4
from app.models import clase_docente      # noqa  <- Fase 4 (FK a asignatura y usuario)
from app.models import solicitud          # noqa  <- FK a clase_docente
from app.models import token_recuperacion  # noqa
from app.models import retorno_implemento  # noqa
from app.models import activo_fijo        # noqa  <- Fase 5 (muebles y phantomas)
from app.models import unidad_implemento  # noqa  <- Fase 5 (sub-codigos implementos)
from app.models import taller             # noqa  <- Guia de Taller (FK a asignatura)
from app.models import paquete_insumo     # noqa  <- Guia de Taller (FK a taller e insumo)
from app.models import proveedor          # noqa  <- antes de orden_mantenimiento
from app.models import orden_mantenimiento  # noqa  <- FK a activo_fijo y proveedor
from app.models import programacion_taller  # noqa  <- FK a taller y sala
from app.routes import (
    salas, categorias, usuarios, movimientos, insumos, auth, resumen, importar
)
from app.routes import audit_log as audit_log_routes
from app.routes import solicitudes
from app.routes import retornos
from app.routes import asignaturas
from app.routes import clases_docente
from app.routes import reportes
from app.routes import activos_fijos
from app.routes import unidades_implemento
from app.routes import talleres
from app.routes import paquetes_insumo
from app.routes import proveedores
from app.routes import ordenes_mantenimiento
from app.routes import programacion_taller as programacion_taller_routes

# 1) crea tablas nuevas. 2) aplica ALTER TABLE / ALTER TYPE idempotentes.
Base.metadata.create_all(bind=engine)
aplicar_migraciones_pendientes()

_docs_habilitados = os.getenv("DOCS_HABILITADOS", "false").lower() == "true"
_cors_origin = os.getenv("CORS_ORIGIN", "http://localhost:3000")

app = FastAPI(
    title="Hestia",
    description="Sistema de gestion de insumos - DuocUC",
    version="0.1.0",
    docs_url="/docs" if _docs_habilitados else None,
    redoc_url="/redoc" if _docs_habilitados else None,
)

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
    "Permissions-Policy": "camera=(self), microphone=(), geolocation=()",
    "Content-Security-Policy": _CSP,
}


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        response = await call_next(request)
        for header, value in SECURITY_HEADERS.items():
            response.headers[header] = value
        return response


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
app.include_router(retornos.router)
app.include_router(asignaturas.router)
app.include_router(clases_docente.router)
app.include_router(reportes.router)
app.include_router(activos_fijos.router)
app.include_router(unidades_implemento.router)
app.include_router(talleres.router)
app.include_router(paquetes_insumo.router)
app.include_router(proveedores.router)
app.include_router(ordenes_mantenimiento.router)
app.include_router(programacion_taller_routes.router)


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
