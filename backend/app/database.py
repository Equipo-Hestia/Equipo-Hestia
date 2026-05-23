from sqlalchemy import create_engine, text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from dotenv import load_dotenv
import logging
import os

load_dotenv()

log = logging.getLogger(__name__)

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    raise RuntimeError(
        "DATABASE_URL no esta configurada. "
        "Crea backend/.env con DATABASE_URL=postgresql://..."
    )

engine = create_engine(DATABASE_URL)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ---------------------------------------------------------------------------
# Mini-migraciones idempotentes
# ---------------------------------------------------------------------------
# Base.metadata.create_all() solo crea tablas nuevas; NO agrega columnas a
# tablas ya existentes. Mientras el proyecto no use Alembic, declaramos aqui
# las migraciones necesarias para evolucionar el esquema sin perder datos.
# ---------------------------------------------------------------------------

MIGRACIONES_COLUMNAS = [
    # Fase 0 - columnas de usuarios e insumos
    "ALTER TABLE IF EXISTS usuarios "
    "ADD COLUMN IF NOT EXISTS activo BOOLEAN NOT NULL DEFAULT TRUE",
    "ALTER TABLE IF EXISTS insumos "
    "ADD COLUMN IF NOT EXISTS activo BOOLEAN NOT NULL DEFAULT TRUE",
    "ALTER TABLE IF EXISTS usuarios "
    "ADD COLUMN IF NOT EXISTS avatar_b64 TEXT",
    # Fase 1 - identificadores, tipo y costo en insumos
    (
        "DO $$ BEGIN "
        "CREATE TYPE tipoinsumo AS ENUM ('insumo', 'implemento'); "
        "EXCEPTION WHEN duplicate_object THEN NULL; END $$"
    ),
    "ALTER TABLE IF EXISTS insumos "
    "ADD COLUMN IF NOT EXISTS tipo tipoinsumo NOT NULL DEFAULT 'insumo'",
    "ALTER TABLE IF EXISTS insumos ADD COLUMN IF NOT EXISTS sku VARCHAR(20)",
    "ALTER TABLE IF EXISTS insumos "
    "ADD COLUMN IF NOT EXISTS codigo_barras VARCHAR(100)",
    "ALTER TABLE IF EXISTS insumos "
    "ADD COLUMN IF NOT EXISTS costo_unitario NUMERIC(10,2)",
    "CREATE UNIQUE INDEX IF NOT EXISTS uix_insumos_sku "
    "ON insumos (sku) WHERE sku IS NOT NULL",
    "CREATE UNIQUE INDEX IF NOT EXISTS uix_insumos_codigo_barras "
    "ON insumos (codigo_barras) WHERE codigo_barras IS NOT NULL",
    # Fase 4 - trazabilidad academica en solicitudes
    "ALTER TABLE IF EXISTS solicitudes_retiro "
    "ADD COLUMN IF NOT EXISTS clase_docente_id INTEGER",
    # Fase 5 - fecha de vencimiento en insumos
    "ALTER TABLE IF EXISTS insumos "
    "ADD COLUMN IF NOT EXISTS fecha_vencimiento DATE",
    # Reportes - carrera en asignaturas y num_estudiantes en clases
    (
        "DO $$ BEGIN "
        "CREATE TYPE carreraasignatura AS ENUM "
        "('TENS', 'TQF', 'TLCBS', 'preparador_fisico'); "
        "EXCEPTION WHEN duplicate_object THEN NULL; END $$"
    ),
    "ALTER TABLE IF EXISTS asignaturas "
    "ADD COLUMN IF NOT EXISTS carrera carreraasignatura",
    "ALTER TABLE IF EXISTS clases_docente "
    "ADD COLUMN IF NOT EXISTS num_estudiantes INTEGER",
]

# (tabla, tipo_enum_pg, columna, valores_requeridos)
MIGRACIONES_ROL = [
    (
        "usuarios", "rolusuario", "rol",
        ("admin", "operador_coordinador", "operador", "visor", "docente"),
    ),
]


def aplicar_migraciones_pendientes() -> None:
    with engine.begin() as conn:
        for sql in MIGRACIONES_COLUMNAS:
            conn.execute(text(sql))
    try:
        _aplicar_migracion_rol()
    except Exception as exc:
        log.critical(
            "[Hestia] FALLO EN MIGRACION DE ROL. "
            "Ejecuta manualmente en la BD:\n"
            "  ALTER TYPE rolusuario ADD VALUE IF NOT EXISTS 'operador_coordinador';\n"
            "Error original: %s",
            exc,
        )
        raise


def _aplicar_migracion_rol() -> None:
    """Migra el campo 'rol' para aceptar los nuevos valores del enum."""
    import psycopg2

    dsn = (DATABASE_URL or "").replace("postgresql+psycopg2://", "postgresql://")
    log.info("[Hestia] Iniciando migracion de enum 'rol'...")
    conn = psycopg2.connect(dsn)
    conn.autocommit = True
    try:
        cur = conn.cursor()
        for tabla, tipo_enum, columna, valores in MIGRACIONES_ROL:
            cur.execute("SELECT 1 FROM pg_type WHERE typname = %s", (tipo_enum,))
            if cur.fetchone():
                log.info("[Hestia] Enum nativo '%s' encontrado.", tipo_enum)
                for valor in valores:
                    cur.execute(
                        "SELECT 1 FROM pg_enum e "
                        "JOIN pg_type t ON e.enumtypid = t.oid "
                        "WHERE t.typname = %s AND e.enumlabel = %s",
                        (tipo_enum, valor),
                    )
                    if not cur.fetchone():
                        log.info(
                            "[Hestia] Agregando '%s' al enum '%s'.",
                            valor, tipo_enum
                        )
                        cur.execute(
                            f"ALTER TYPE {tipo_enum} "
                            f"ADD VALUE IF NOT EXISTS '{valor}'"
                        )
                    else:
                        log.info(
                            "[Hestia] '%s' ya existe en '%s'.",
                            valor, tipo_enum
                        )
                continue
            log.info(
                "[Hestia] Enum '%s' no encontrado, revisando CHECK constraints.",
                tipo_enum,
            )
            cur.execute(
                "SELECT conname, pg_get_constraintdef(oid) "
                "FROM pg_constraint "
                "WHERE conrelid = %s::regclass AND contype = 'c'",
                (tabla,),
            )
            for conname, condef in cur.fetchall():
                if columna not in (condef or ""):
                    continue
                if all(v in (condef or "") for v in valores):
                    continue
                log.info("[Hestia] Eliminando constraint '%s'.", conname)
                cur.execute(
                    f"ALTER TABLE {tabla} DROP CONSTRAINT IF EXISTS {conname}"
                )
        cur.close()
        log.info("[Hestia] Migracion de rol completada.")
    finally:
        conn.close()
