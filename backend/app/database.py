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
    # Horario en clases_docente (Fase 5)
    "ALTER TABLE IF EXISTS clases_docente "
    "ADD COLUMN IF NOT EXISTS dia_semana VARCHAR(15)",
    "ALTER TABLE IF EXISTS clases_docente "
    "ADD COLUMN IF NOT EXISTS hora_inicio VARCHAR(5)",
    "ALTER TABLE IF EXISTS clases_docente "
    "ADD COLUMN IF NOT EXISTS hora_fin VARCHAR(5)",
    # Unidad de medida en insumos
    "ALTER TABLE IF EXISTS insumos "
    "ADD COLUMN IF NOT EXISTS unidad_medida VARCHAR(60)",
    # Sala asignada por unidad fisica de implemento
    # NULL = en Bodega; valor = sala donde esta fisicamente asignada
    "ALTER TABLE IF EXISTS unidades_implemento "
    "ADD COLUMN IF NOT EXISTS sala_id INTEGER "
    "REFERENCES salas(id) ON DELETE SET NULL",
    # Tipo base + subtipo en movimientos (refactor trazabilidad)
    # subtipo nullable en migracion para no romper filas historicas;
    # las filas nuevas lo requieren a nivel de aplicacion.
    (
        "DO $$ BEGIN "
        "CREATE TYPE subtipomovimiento AS ENUM ("
        "'compra', 'devolucion_proveedor_entrada', 'ajuste_entrada', "
        "'consumo_taller', 'prestamo_implemento', "
        "'devolucion_proveedor_salida', 'baja', 'ajuste_salida', "
        "'enviado_mantenimiento', 'reingreso_disponible', "
        "'devolucion_interna'"
        "); "
        "EXCEPTION WHEN duplicate_object THEN NULL; END $$"
    ),
    "ALTER TABLE IF EXISTS movimientos "
    "ADD COLUMN IF NOT EXISTS subtipo subtipomovimiento",
    # FK al paquete de insumos que origino el movimiento (nullable)
    "ALTER TABLE IF EXISTS movimientos "
    "ADD COLUMN IF NOT EXISTS paquete_id INTEGER "
    "REFERENCES paquetes_insumo(id) ON DELETE SET NULL",
    # FK a la sala destino/origen del movimiento (nullable)
    "ALTER TABLE IF EXISTS movimientos "
    "ADD COLUMN IF NOT EXISTS sala_id INTEGER "
    "REFERENCES salas(id) ON DELETE SET NULL",
    # Proveedor original del activo fijo (nullable)
    "ALTER TABLE IF EXISTS activos_fijos "
    "ADD COLUMN IF NOT EXISTS proveedor_id INTEGER "
    "REFERENCES proveedores(id) ON DELETE SET NULL",
]

# Valores requeridos en cada enum nativo de PostgreSQL.
# El sistema agrega los que falten de forma idempotente.
MIGRACIONES_ENUM = [
    # (nombre_tipo_pg, [valores_requeridos])
    (
        "rolusuario",
        ["admin", "operador_coordinador", "operador", "visor"],
    ),
    (
        "carreraasignatura",
        ["TENS", "TQF", "TLCBS", "preparador_fisico", "TONS"],
    ),
    (
        "tipomovimiento",
        ["entrada", "salida", "interno"],
    ),
]


def aplicar_migraciones_pendientes() -> None:
    with engine.begin() as conn:
        for sql in MIGRACIONES_COLUMNAS:
            conn.execute(text(sql))
    try:
        _aplicar_migraciones_enum()
    except Exception as exc:
        log.critical(
            "[Hestia] FALLO EN MIGRACION DE ENUM. "
            "Ejecuta manualmente en la BD si es necesario.\n"
            "Error original: %s",
            exc,
        )
        raise


def _aplicar_migraciones_enum() -> None:
    """Agrega valores faltantes a enums nativos de PostgreSQL.

    Usa psycopg2 directamente porque ALTER TYPE ... ADD VALUE no puede
    ejecutarse dentro de una transaccion en PostgreSQL < 12. Cada ADD VALUE
    es idempotente gracias a IF NOT EXISTS.
    """
    import psycopg2

    dsn = (DATABASE_URL or "").replace("postgresql+psycopg2://", "postgresql://")
    log.info("[Hestia] Iniciando migracion de enums...")
    conn = psycopg2.connect(dsn)
    conn.autocommit = True
    try:
        cur = conn.cursor()
        for tipo_enum, valores in MIGRACIONES_ENUM:
            cur.execute(
                "SELECT 1 FROM pg_type WHERE typname = %s", (tipo_enum,)
            )
            if not cur.fetchone():
                log.info(
                    "[Hestia] Enum '%s' no encontrado en PG, omitiendo.",
                    tipo_enum,
                )
                continue
            for valor in valores:
                cur.execute(
                    "SELECT 1 FROM pg_enum e "
                    "JOIN pg_type t ON e.enumtypid = t.oid "
                    "WHERE t.typname = %s AND e.enumlabel = %s",
                    (tipo_enum, valor),
                )
                if not cur.fetchone():
                    log.info(
                        "[Hestia] Agregando '%s' a enum '%s'.",
                        valor, tipo_enum,
                    )
                    cur.execute(
                        f"ALTER TYPE {tipo_enum} "
                        f"ADD VALUE IF NOT EXISTS '{valor}'"
                    )
                else:
                    log.info(
                        "[Hestia] '%s' ya existe en enum '%s'.",
                        valor, tipo_enum,
                    )
        cur.close()
        log.info("[Hestia] Migracion de enums completada.")
    finally:
        conn.close()
