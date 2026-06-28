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
# Mini-migraciones idempotentes (CONGELADO desde junio 2026)
#
# No agregar nuevas entradas aqui. Todo cambio de esquema nuevo se hace
# con Alembic (ver backend/alembic/ y CLAUDE.md seccion 3.5). Este sistema
# se mantiene activo solo como puente de compatibilidad con entornos que
# aun no corrieron las migraciones de Alembic, y se elimina por completo
# una vez migrados los enums de catalogo de negocio (`carreraasignatura`,
# `rolusuario`) a tablas relacionales.
# ---------------------------------------------------------------------------

MIGRACIONES_COLUMNAS = [
    "ALTER TABLE IF EXISTS usuarios "
    "ADD COLUMN IF NOT EXISTS activo BOOLEAN NOT NULL DEFAULT TRUE",
    "ALTER TABLE IF EXISTS insumos "
    "ADD COLUMN IF NOT EXISTS activo BOOLEAN NOT NULL DEFAULT TRUE",
    "ALTER TABLE IF EXISTS usuarios "
    "ADD COLUMN IF NOT EXISTS avatar_b64 TEXT",
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
    "ALTER TABLE IF EXISTS solicitudes_retiro "
    "ADD COLUMN IF NOT EXISTS clase_docente_id INTEGER",
    "ALTER TABLE IF EXISTS insumos "
    "ADD COLUMN IF NOT EXISTS fecha_vencimiento DATE",
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
    "ALTER TABLE IF EXISTS clases_docente "
    "ADD COLUMN IF NOT EXISTS dia_semana VARCHAR(15)",
    "ALTER TABLE IF EXISTS clases_docente "
    "ADD COLUMN IF NOT EXISTS hora_inicio VARCHAR(5)",
    "ALTER TABLE IF EXISTS clases_docente "
    "ADD COLUMN IF NOT EXISTS hora_fin VARCHAR(5)",
    "ALTER TABLE IF EXISTS insumos "
    "ADD COLUMN IF NOT EXISTS unidad_medida VARCHAR(60)",
    "ALTER TABLE IF EXISTS unidades_implemento "
    "ADD COLUMN IF NOT EXISTS sala_id INTEGER "
    "REFERENCES salas(id) ON DELETE SET NULL",
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
    "ALTER TABLE IF EXISTS movimientos "
    "ADD COLUMN IF NOT EXISTS paquete_id INTEGER "
    "REFERENCES paquetes_insumo(id) ON DELETE SET NULL",
    "ALTER TABLE IF EXISTS movimientos "
    "ADD COLUMN IF NOT EXISTS sala_id INTEGER "
    "REFERENCES salas(id) ON DELETE SET NULL",
    "ALTER TABLE IF EXISTS activos_fijos "
    "ADD COLUMN IF NOT EXISTS proveedor_id INTEGER "
    "REFERENCES proveedores(id) ON DELETE SET NULL",
    (
        "DO $$ BEGIN "
        "CREATE TYPE tipomantenimiento AS ENUM ("
        "'preventivo', 'correctivo', 'validacion_tecnica'"
        "); "
        "EXCEPTION WHEN duplicate_object THEN NULL; END $$"
    ),
    "ALTER TABLE IF EXISTS ordenes_mantenimiento "
    "ADD COLUMN IF NOT EXISTS tipo_mantenimiento tipomantenimiento",
    "ALTER TABLE IF EXISTS ordenes_mantenimiento "
    "ADD COLUMN IF NOT EXISTS fecha_retorno_estimada DATE",
    (
        "DO $$ BEGIN "
        "CREATE TYPE estadoordenitem AS ENUM ("
        "'en_curso', 'cerrada', 'cancelada'"
        "); "
        "EXCEPTION WHEN duplicate_object THEN NULL; END $$"
    ),
    (
        "DO $$ BEGIN "
        "CREATE TYPE resultadoitem AS ENUM ("
        "'pendiente', 'ok', 'sale_a_taller', 'dar_de_baja'"
        "); "
        "EXCEPTION WHEN duplicate_object THEN NULL; END $$"
    ),
    "ALTER TABLE IF EXISTS ordenes_mantenimiento "
    "ADD COLUMN IF NOT EXISTS fecha_visita DATE",
    "ALTER TABLE IF EXISTS ordenes_mantenimiento "
    "ADD COLUMN IF NOT EXISTS notas TEXT",
    (
        "DO $$ BEGIN "
        "IF EXISTS ("
        "  SELECT 1 FROM information_schema.columns "
        "  WHERE table_name = 'ordenes_mantenimiento' "
        "  AND column_name = 'activo_fijo_id'"
        ") THEN "
        "  ALTER TABLE ordenes_mantenimiento DROP COLUMN activo_fijo_id; "
        "END IF; "
        "END $$"
    ),
    (
        "DO $$ BEGIN "
        "CREATE TYPE tipocomentario AS ENUM "
        "('positivo', 'negativo', 'neutro'); "
        "EXCEPTION WHEN duplicate_object THEN NULL; END $$"
    ),
    # Migracion clases_docente FK -> docentes (usa pg_constraint)
    (
        "DO $$ "
        "DECLARE fk_a_usuarios BOOLEAN; "
        "BEGIN "
        "  SELECT EXISTS ( "
        "    SELECT 1 FROM pg_constraint c "
        "    JOIN pg_class r ON c.confrelid = r.oid "
        "    WHERE c.conname  = 'clases_docente_docente_id_fkey' "
        "      AND c.conrelid = 'clases_docente'::regclass "
        "      AND r.relname  = 'usuarios' "
        "  ) INTO fk_a_usuarios; "
        "  IF fk_a_usuarios THEN "
        "    DELETE FROM clases_docente; "
        "    ALTER TABLE clases_docente "
        "      DROP CONSTRAINT clases_docente_docente_id_fkey; "
        "    ALTER TABLE clases_docente "
        "      ALTER COLUMN docente_id DROP NOT NULL; "
        "  END IF; "
        "END $$"
    ),
    (
        "DO $$ "
        "BEGIN "
        "  IF NOT EXISTS ( "
        "    SELECT 1 FROM pg_constraint "
        "    WHERE conname  = 'clases_docente_docente_id_fkey' "
        "      AND conrelid = 'clases_docente'::regclass "
        "  ) THEN "
        "    IF EXISTS ( "
        "      SELECT 1 FROM pg_class WHERE relname = 'docentes' "
        "    ) THEN "
        "      ALTER TABLE clases_docente "
        "        ADD CONSTRAINT clases_docente_docente_id_fkey "
        "        FOREIGN KEY (docente_id) "
        "        REFERENCES docentes(id) ON DELETE SET NULL; "
        "    END IF; "
        "  END IF; "
        "END $$"
    ),
    # Enums para OrdenEntrada
    (
        "DO $$ BEGIN "
        "CREATE TYPE tipoorden AS ENUM "
        "('semanal', 'semestral', 'emergencia'); "
        "EXCEPTION WHEN duplicate_object THEN NULL; END $$"
    ),
    (
        "DO $$ BEGIN "
        "CREATE TYPE estadoordenentrada AS ENUM "
        "('borrador', 'confirmada', 'en_recepcion', 'cerrada', 'cancelada'); "
        "EXCEPTION WHEN duplicate_object THEN NULL; END $$"
    ),
    (
        "DO $$ BEGIN "
        "CREATE TYPE estadoitemorden AS ENUM "
        "('pendiente', 'recibido', 'recibido_parcial', 'cancelado'); "
        "EXCEPTION WHEN duplicate_object THEN NULL; END $$"
    ),
    (
        "DO $$ BEGIN "
        "CREATE TYPE tipoitemorden AS ENUM "
        "('insumo', 'activo_fijo'); "
        "EXCEPTION WHEN duplicate_object THEN NULL; END $$"
    ),
    # Enums para Incidencia
    (
        "DO $$ BEGIN "
        "CREATE TYPE tipoincidencia AS ENUM ("
        "'dano_fisico', 'pieza_perdida', 'mal_funcionamiento', 'otro'"
        "); "
        "EXCEPTION WHEN duplicate_object THEN NULL; END $$"
    ),
    (
        "DO $$ BEGIN "
        "CREATE TYPE severidadincidencia AS ENUM "
        "('leve', 'moderada', 'critica'); "
        "EXCEPTION WHEN duplicate_object THEN NULL; END $$"
    ),
    (
        "DO $$ BEGIN "
        "CREATE TYPE estadoincidencia AS ENUM "
        "('abierta', 'en_revision', 'resuelta'); "
        "EXCEPTION WHEN duplicate_object THEN NULL; END $$"
    ),
]

MIGRACIONES_ENUM = [
    ("rolusuario", ["admin", "operador_coordinador", "operador", "visor"]),
    ("carreraasignatura", ["TENS", "TQF", "TLCBS", "preparador_fisico", "TONS"]),
    ("tipomovimiento", ["entrada", "salida", "interno"]),
    ("estadoordenitem", ["en_curso", "cerrada", "cancelada"]),
    ("resultadoitem", ["pendiente", "ok", "sale_a_taller", "dar_de_baja"]),
    ("tipocomentario", ["positivo", "negativo", "neutro"]),
    ("tipoorden", ["semanal", "semestral", "emergencia"]),
    ("estadoordenentrada", ["borrador", "confirmada", "en_recepcion", "cerrada", "cancelada"]),
    ("estadoitemorden", ["pendiente", "recibido", "recibido_parcial", "cancelado"]),
    ("tipoitemorden", ["insumo", "activo_fijo"]),
]


def aplicar_migraciones_pendientes() -> None:
    """Puente de compatibilidad CONGELADO. Ver nota junto a
    MIGRACIONES_COLUMNAS: las migraciones nuevas van en Alembic."""
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
    import psycopg2
    dsn = (DATABASE_URL or "").replace("postgresql+psycopg2://", "postgresql://")
    log.info("[Hestia] Iniciando migracion de enums...")
    conn = psycopg2.connect(dsn)
    conn.autocommit = True
    try:
        cur = conn.cursor()
        for tipo_enum, valores in MIGRACIONES_ENUM:
            cur.execute("SELECT 1 FROM pg_type WHERE typname = %s", (tipo_enum,))
            if not cur.fetchone():
                log.info("[Hestia] Enum '%s' no encontrado, omitiendo.", tipo_enum)
                continue
            for valor in valores:
                cur.execute(
                    "SELECT 1 FROM pg_enum e "
                    "JOIN pg_type t ON e.enumtypid = t.oid "
                    "WHERE t.typname = %s AND e.enumlabel = %s",
                    (tipo_enum, valor),
                )
                if not cur.fetchone():
                    log.info("[Hestia] Agregando '%s' a '%s'.", valor, tipo_enum)
                    cur.execute(
                        f"ALTER TYPE {tipo_enum} ADD VALUE IF NOT EXISTS '{valor}'"
                    )

        # Migrar ordenes_mantenimiento.estado si aun usa enum antiguo
        cur.execute(
            "SELECT t.typname FROM pg_attribute a "
            "JOIN pg_class c ON a.attrelid = c.oid "
            "JOIN pg_type t ON a.atttypid = t.oid "
            "WHERE c.relname = 'ordenes_mantenimiento' "
            "AND a.attname = 'estado' AND a.attnum > 0"
        )
        row = cur.fetchone()
        tipo_actual = row[0] if row else None
        if tipo_actual and tipo_actual != "estadoordenitem":
            cur.execute("DELETE FROM orden_mantenimiento_items")
            cur.execute("DELETE FROM ordenes_mantenimiento")
            cur.execute(
                "ALTER TABLE ordenes_mantenimiento ALTER COLUMN estado DROP DEFAULT"
            )
            cur.execute(
                "ALTER TABLE ordenes_mantenimiento "
                "ALTER COLUMN estado TYPE estadoordenitem "
                "USING 'en_curso'::estadoordenitem"
            )
            cur.execute(
                "ALTER TABLE ordenes_mantenimiento "
                "ALTER COLUMN estado SET DEFAULT 'en_curso'::estadoordenitem"
            )
        cur.close()
        log.info("[Hestia] Migracion de enums completada.")
    finally:
        conn.close()
