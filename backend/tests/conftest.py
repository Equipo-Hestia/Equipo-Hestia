"""Infraestructura comun de las pruebas de Hestia.

Base de datos
-------------
Las pruebas corren contra PostgreSQL real (no SQLite), en una base temporal
``hestia_test_<aleatorio>`` que se crea al iniciar la sesion de pytest y se
borra al terminar. Nunca se usa la base de la aplicacion.

``app.database`` crea el engine con ``DATABASE_URL`` al importarse y
``app.main`` ejecuta ``create_all`` tambien al importarse. Por eso la base se
crea y ``DATABASE_URL`` se fija en ``pytest_configure``, ANTES de que se
importe cualquier modulo de ``app``. El esquema se arma igual que en
``start.sh`` para una instalacion limpia: ``alembic upgrade head`` y luego
``import app.main`` (``create_all``).

Variables de entorno
--------------------
TEST_DATABASE_ADMIN_URL  URL con permiso para CREATE/DROP DATABASE
                         (p. ej. postgresql://postgres:clave@localhost:5432/postgres).
                         Si no esta, se deriva de DATABASE_URL usando la base
                         ``postgres`` del mismo servidor.
HESTIA_REPORTE_PRUEBAS   Si se define, ruta donde escribir el reporte Markdown
                         (docs/PRUEBAS.md) con el resultado de esta ejecucion.
HESTIA_COMMIT            Commit (y rama) sobre el que se ejecutan las pruebas (para el
                         reporte).
"""
import os
import platform
import secrets
import sys
import uuid
from datetime import datetime
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit
from zoneinfo import ZoneInfo

import pytest

BACKEND = Path(__file__).resolve().parent.parent
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))

_ESTADO = {"db_url": None, "admin_url": None, "db_name": None, "pg_version": None}
_RESULTADOS = []
TZ_CHILE = ZoneInfo("America/Santiago")


# ---------------------------------------------------------------------------
# Base de datos temporal
# ---------------------------------------------------------------------------

def _con_base(url: str, base: str) -> str:
    partes = urlsplit(url)
    return urlunsplit((partes.scheme, partes.netloc, "/" + base, partes.query, ""))


def _url_admin() -> str:
    url = os.environ.get("TEST_DATABASE_ADMIN_URL")
    if url:
        return url
    app_url = os.environ.get("DATABASE_URL")
    if not app_url:
        raise pytest.UsageError(
            "Define TEST_DATABASE_ADMIN_URL (o DATABASE_URL) para crear la base "
            "de prueba temporal en PostgreSQL."
        )
    return _con_base(app_url, "postgres")


def _admin_exec(sentencia: str) -> None:
    import psycopg2

    con = psycopg2.connect(_ESTADO["admin_url"])
    con.autocommit = True
    try:
        with con.cursor() as cur:
            cur.execute(sentencia)
    finally:
        con.close()


def pytest_configure(config):
    import psycopg2

    admin_url = _url_admin()
    nombre = "hestia_test_" + uuid.uuid4().hex[:10]
    db_url = _con_base(admin_url, nombre)
    _ESTADO.update(admin_url=admin_url, db_name=nombre, db_url=db_url)

    _admin_exec(f'CREATE DATABASE "{nombre}"')
    con = psycopg2.connect(db_url)
    try:
        with con.cursor() as cur:
            cur.execute("SHOW server_version")
            _ESTADO["pg_version"] = cur.fetchone()[0]
    finally:
        con.close()

    # La app y Alembic leen estas variables al importarse.
    os.environ["DATABASE_URL"] = db_url
    os.environ["SECRET_KEY"] = "clave-de-prueba-" + secrets.token_hex(24)
    os.environ["ALGORITHM"] = "HS256"

    from alembic import command
    from alembic.config import Config

    cfg = Config(str(BACKEND / "alembic.ini"))
    cfg.set_main_option("script_location", str(BACKEND / "alembic"))
    command.upgrade(cfg, "head")

    import app.main  # noqa: F401  (create_all, igual que al arrancar la API)
    from app.database import engine

    # Proteccion: jamas operar sobre una base que no sea la temporal.
    if engine.url.database != nombre or not nombre.startswith("hestia_test_"):
        pytest.exit(f"Base inesperada: {engine.url.database}", returncode=3)


def pytest_unconfigure(config):
    if not _ESTADO["db_name"]:
        return
    try:
        from app.database import engine

        engine.dispose()
    except Exception:
        pass
    _admin_exec(f'DROP DATABASE IF EXISTS "{_ESTADO["db_name"]}" WITH (FORCE)')


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture(scope="session")
def app():
    from app.main import app as fastapi_app

    return fastapi_app


@pytest.fixture(scope="session")
def client(app):
    from fastapi.testclient import TestClient

    return TestClient(app)


@pytest.fixture
def db():
    from app.database import SessionLocal

    sesion = SessionLocal()
    try:
        yield sesion
    finally:
        sesion.close()


@pytest.fixture(autouse=True)
def _limpiar_rate_limit():
    """El rate limit de login vive en memoria del proceso: se limpia por prueba."""
    from app.utils import rate_limit

    rate_limit._intentos.clear()
    rate_limit._bloqueados.clear()
    yield
    rate_limit._intentos.clear()
    rate_limit._bloqueados.clear()


def unico(prefijo: str) -> str:
    return f"{prefijo} {uuid.uuid4().hex[:8]}"


class UsuarioPrueba:
    def __init__(self, id, email, password, rol, totp_secret):
        self.id = id
        self.email = email
        self.password = password
        self.rol = rol
        self.totp_secret = totp_secret

    def codigo_totp(self) -> str:
        import pyotp

        return pyotp.TOTP(self.totp_secret).now()


@pytest.fixture
def crear_usuario(db):
    """Crea un usuario en la base temporal. Por defecto con 2FA activo."""
    import pyotp
    from app.models.usuario import RolUsuario, Usuario
    from app.utils.security import hashear_password

    def _crear(rol: str = "operador", con_2fa: bool = True) -> UsuarioPrueba:
        password = "Prueba#2026x"
        secreto = pyotp.random_base32() if con_2fa else None
        email = f"{rol}.{uuid.uuid4().hex[:8]}@prueba.hestia.cl"
        u = Usuario(
            nombre=f"Prueba {rol}",
            email=email,
            password_hash=hashear_password(password),
            rol=RolUsuario(rol),
            activo=True,
            totp_habilitado=con_2fa,
            totp_secret=secreto,
        )
        db.add(u)
        db.commit()
        return UsuarioPrueba(u.id, email, password, rol, secreto)

    return _crear


@pytest.fixture
def login(client):
    """Login completo (contrasena + TOTP) por la API. Devuelve el access_token."""

    def _login(usuario: UsuarioPrueba) -> str:
        r = client.post(
            "/auth/login",
            data={"username": usuario.email, "password": usuario.password},
        )
        assert r.status_code == 200, r.text
        r2 = client.post(
            "/auth/2fa/completar-login",
            json={"pre_token": r.json()["pre_token"], "codigo": usuario.codigo_totp()},
        )
        assert r2.status_code == 200, r2.text
        return r2.json()["access_token"]

    return _login


@pytest.fixture
def headers_de(crear_usuario, login):
    """Devuelve headers Authorization para un usuario nuevo con el rol pedido."""

    def _headers(rol: str) -> dict:
        return {"Authorization": "Bearer " + login(crear_usuario(rol))}

    return _headers


@pytest.fixture
def crear_insumo(db):
    from app.models.insumo import Insumo, TipoInsumo

    def _crear(stock: int, minimo: int = 0, tipo: str = "insumo",
               nombre: str | None = None, costo=None) -> int:
        i = Insumo(
            nombre=nombre or unico("Insumo prueba"),
            stock_actual=stock,
            stock_minimo=minimo,
            tipo=TipoInsumo(tipo),
            activo=True,
            costo_unitario=costo,
        )
        db.add(i)
        db.commit()
        return i.id

    return _crear


@pytest.fixture
def stock_de(db):
    from app.models.insumo import Insumo

    def _stock(insumo_id: int) -> int:
        db.expire_all()
        return db.get(Insumo, insumo_id).stock_actual

    return _stock


# ---------------------------------------------------------------------------
# Reporte docs/PRUEBAS.md
# ---------------------------------------------------------------------------

@pytest.hookimpl(hookwrapper=True)
def pytest_runtest_makereport(item, call):
    outcome = yield
    rep = outcome.get_result()
    marca = item.get_closest_marker("caso")
    if marca is None:
        return
    es_fallo = rep.failed
    if rep.when == "call" or (rep.when == "setup" and (rep.failed or rep.skipped)):
        caso_id, descripcion, esperado = marca.args
        obtenido = dict(rep.user_properties).get("obtenido", "")
        motivo_xfail = ""
        if hasattr(rep, "wasxfail"):
            estado = "Fallo esperado" if rep.skipped else "Pasó (se esperaba fallo)"
            motivo_xfail = rep.wasxfail
            obtenido = obtenido or rep.wasxfail
        elif rep.failed and "XPASS(strict)" in str(rep.longrepr):
            estado = "Pasó (se esperaba fallo)"
            motivo_xfail = str(rep.longrepr).replace("[XPASS(strict)]", "").strip()
        elif rep.passed:
            estado = "Aprobado"
        elif rep.skipped:
            estado = "Omitido"
        else:
            estado = "Fallido"
            linea = str(rep.longrepr).strip().splitlines()[-1] if rep.longrepr else ""
            obtenido = (obtenido + " — " if obtenido else "") + linea
        _RESULTADOS.append({
            "id": caso_id,
            "descripcion": descripcion,
            "esperado": esperado,
            "obtenido": obtenido,
            "estado": estado,
            "fallo": es_fallo,
            "motivo_xfail": motivo_xfail,
            "prueba": item.nodeid,
            "fecha": datetime.now(TZ_CHILE),
            "duracion": rep.duration,
        })


def _celda(texto: str) -> str:
    return str(texto).replace("|", "\\|").replace("\n", " ")


def pytest_sessionfinish(session, exitstatus):
    destino = os.environ.get("HESTIA_REPORTE_PRUEBAS")
    if not destino or not _RESULTADOS:
        return
    filas = sorted(_RESULTADOS, key=lambda r: r["id"])
    aprobados = sum(r["estado"] == "Aprobado" for r in filas)
    fallidos = sum(r["estado"] in ("Fallido", "Pasó (se esperaba fallo)") for r in filas)
    esperados = sum(r["estado"] == "Fallo esperado" for r in filas)
    inicio = min(r["fecha"] for r in filas)
    commit = os.environ.get("HESTIA_COMMIT", "desconocido")

    lineas = [
        "# Pruebas automáticas de Hestia",
        "",
        "> Archivo generado automáticamente por `pytest` "
        "(`backend/tests/conftest.py`) a partir de una ejecución real. "
        "No editar a mano: volver a ejecutar las pruebas para actualizarlo.",
        "",
        "## Resumen",
        "",
        "| Dato | Valor |",
        "|---|---|",
        f"| Versión del código (commit) | {commit} |",
        f"| Fecha de ejecución | {inicio:%d-%m-%Y %H:%M} (hora de Chile) |",
        f"| Total de casos | {len(filas)} |",
        f"| Aprobados | {aprobados} |",
        f"| Fallidos | {fallidos} |",
        f"| Fallos esperados (defectos conocidos) | {esperados} |",
        f"| Base de datos | PostgreSQL {_ESTADO['pg_version']}, base temporal "
        f"`{_ESTADO['db_name']}` (creada y borrada en la ejecución) |",
        f"| Python | {platform.python_version()} |",
        "",
        "## Casos",
        "",
        "| ID | Qué se prueba | Resultado esperado | Resultado obtenido | Estado "
        "| Fecha de ejecución |",
        "|---|---|---|---|---|---|",
    ]
    for r in filas:
        lineas.append(
            f"| {r['id']} | {_celda(r['descripcion'])} | {_celda(r['esperado'])} "
            f"| {_celda(r['obtenido'])} | {r['estado']} | {r['fecha']:%d-%m-%Y %H:%M:%S} |"
        )
    conocidos = [r for r in filas if r["motivo_xfail"]]
    if conocidos:
        lineas += [
            "",
            "## Defectos conocidos (fallos esperados)",
            "",
            "Estos casos prueban una regla que hoy el sistema **no cumple**. Se dejaron "
            "marcados como *fallo esperado* (`xfail`) para no corregir la aplicación "
            "en el mismo cambio que agrega las pruebas: no bloquean la integración "
            "continua, pero si el defecto se corrige la prueba empieza a pasar y "
            "pytest avisa para quitar la marca.",
            "",
        ]
        for r in conocidos:
            lineas.append(f"- **{r['id']}** — {r['motivo_xfail']}")
    lineas += [
        "",
        "## Cómo ejecutar las pruebas",
        "",
        "Con el stack levantado (`docker compose up -d`), desde la raíz del repositorio:",
        "",
        "```powershell",
        "docker compose run --rm --no-deps -v ./docs:/docs "
        "-e HESTIA_REPORTE_PRUEBAS=/docs/PRUEBAS.md api "
        "sh -c \"pip install -q -r requirements-dev.txt && pytest\"",
        "```",
        "",
        "Las pruebas crean una base PostgreSQL temporal (`hestia_test_…`) en el "
        "servidor `db`, la usan y la borran al terminar; la base de la aplicación "
        "(`hestia_db`) no se toca. Sin `HESTIA_REPORTE_PRUEBAS` no se reescribe "
        "este archivo. En GitHub Actions las pruebas corren en cada push y pull "
        "request contra un servicio `postgres:16` y bloquean si alguna falla.",
        "",
        "## Detalle técnico",
        "",
        "| ID | Prueba (pytest) | Duración |",
        "|---|---|---|",
    ]
    for r in filas:
        lineas.append(f"| {r['id']} | `{r['prueba']}` | {r['duracion']:.2f} s |")
    Path(destino).write_text("\n".join(lineas) + "\n", encoding="utf-8")
