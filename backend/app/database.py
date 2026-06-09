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
#
# REGLA CRITICA: MIGRACIONES_COLUMNAS solo debe contener ALTER TABLE y CREATE
# INDEX sobre tablas que ya existen (creadas por Base.metadata.create_all).
# Nunca CREATE TABLE aqui: las tablas nuevas deben ser modelos ORM para que
# create_all las cree en el orden correcto segun las FK.
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
    "ALTER TABLE IF EXISTS unidades_implemento "
    "ADD COLUMN IF NOT EXISTS sala_id INTEGER "
    "REFERENCES salas(id) ON DELETE SET NULL",
    # Tipo base + subtipo en movimientos
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
    # Proveedor original del activo fijo
    "ALTER TABLE IF EXISTS activos_fijos "
    "ADD COLUMN IF NOT EXISTS proveedor_id INTEGER "
    "REFERENCES proveedores(id) ON DELETE SET NULL",
    # TipoMantenimiento
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
    # Enums para el modelo de mantenimiento por items
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
    # Columnas adicionales en cabecera de ordenes_mantenimiento
    "ALTER TABLE IF EXISTS ordenes_mantenimiento "
    "ADD COLUMN IF NOT EXISTS fecha_visita DATE",
    "ALTER TABLE IF EXISTS ordenes_mantenimiento "
    "ADD COLUMN IF NOT EXISTS notas TEXT",
    # Eliminar FK huerfana activo_fijo_id si aun existe en la cabecera
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
    # Modulo Docentes: enum tipocomentario
    (
        "DO $$ BEGIN "
        "CREATE TYPE tipocomentario AS ENUM "
        "('positivo', 'negativo', 'neutro'); "
        "EXCEPTION WHEN duplicate_object THEN NULL; END $$"
    ),
    # Migracion clases_docente: FK docente_id -> docentes.id
    # Paso 1: borrar clases existentes (entorno desarrollo)
    (
        "DO $$ BEGIN "
        "IF EXISTS ("
        "  SELECT 1 FROM information_schema.columns "
        "  WHERE table_name='clases_docente' "
        "  AND column_name='docente_id'"
        ") THEN "
        "  IF EXISTS ("
        "    SELECT 1 FROM information_schema.table_constraints tc "
        "    JOIN information_schema.constraint_column_usage ccu "
        "      ON tc.constraint_name = ccu.constraint_name "
        "    WHERE tc.table_name='clases_docente' "
        "      AND ccu.column_name='docente_id' "
        "      AND tc.constraint_type='FOREIGN KEY' "
        "      AND ccu.table_name='usuarios' "
        "  ) THEN "
        "    DELETE FROM clases_docente; "
        "    ALTER TABLE clases_docente "
        "      DROP CONSTRAINT IF EXISTS "
        "        clases_docente_docente_id_fkey; "
        "    ALTER TABLE clases_docente "
        "      ALTER COLUMN docente_id DROP NOT NULL; "
        "  END IF; "
        "END IF; "
        "END $$"
    ),
    # Paso 2: crear la tabla docentes si no existe aun
    # (create_all la crea antes de llegar aqui, pero por si acaso)
    # Paso 3: agregar FK a docentes si no existe
    (
        "DO $$ BEGIN "
        "IF NOT EXISTS ("
        "  SELECT 1 FROM information_schema.table_constraints tc "
        "  JOIN information_schema.constraint_column_usage ccu "
        "    ON tc.constraint_name = ccu.constraint_name "
        "  WHERE tc.table_name='clases_docente' "
        "    AND ccu.column_name='docente_id' "
        "    AND tc.constraint_type='FOREIGN KEY' "
        "    AND ccu.table_name='docentes' "
        ") THEN "
        "  IF EXISTS ("
        "    SELECT 1 FROM information_schema.tables "
        "    WHERE table_name='docentes'"
        "  ) THEN "
        "    ALTER TABLE clases_docente "
        "      ADD CONSTRAINT clases_docente_docente_id_fkey "
        "      FOREIGN KEY (docente_id) "
        "      REFERENCES docentes(id) ON DELETE SET NULL; "
        "  END IF; "
        "END IF; "
        "END $$"
    ),
]

MIGRACIONES_ENUM = [
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
    (
        "estadoordenitem",
        ["en_curso", "cerrada", "cancelada"],
    ),
    (
        "resultadoitem",
        ["pendiente", "ok", "sale_a_taller", "dar_de_baja"],
    ),
    (
        "tipocomentario",
        ["positivo", "negativo", "neutro"],
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

    Incluye la migracion de ordenes_mantenimiento.estado desde el
    enum antiguo (estadoorden) al nuevo (estadoordenitem). Se detecta
    verificando si la columna aun usa el tipo 'estadoorden' via pg_attribute.
    """
    import psycopg2

    dsn = (DATABASE_URL or "").replace("postgresql+psycopg2://", "postgresql://")
    log.info("[Hestia] Iniciando migracion de enums...")
    conn = psycopg2.connect(dsn)
    conn.autocommit = True
    try:
        cur = conn.cursor()

        # -- Agregar valores faltantes a enums existentes --
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

        # -- Migrar ordenes_mantenimiento.estado al nuevo enum --
        cur.execute(
            "SELECT t.typname "
            "FROM pg_attribute a "
            "JOIN pg_class c ON a.attrelid = c.oid "
            "JOIN pg_type t ON a.atttypid = t.oid "
            "WHERE c.relname = 'ordenes_mantenimiento' "
            "AND a.attname = 'estado' "
            "AND a.attnum > 0"
        )
        row = cur.fetchone()
        tipo_actual = row[0] if row else None
        log.info(
            "[Hestia] ordenes_mantenimiento.estado tipo actual: %s",
            tipo_actual,
        )

        if tipo_actual and tipo_actual != "estadoordenitem":
            log.info(
                "[Hestia] Migrando columna estado de '%s' a estadoordenitem...",
                tipo_actual,
            )
            cur.execute("DELETE FROM orden_mantenimiento_items")
            cur.execute("DELETE FROM ordenes_mantenimiento")
            cur.execute(
                "ALTER TABLE ordenes_mantenimiento "
                "ALTER COLUMN estado DROP DEFAULT"
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
            log.info(
                "[Hestia] Columna estado migrada a estadoordenitem."
            )
        else:
            log.info(
                "[Hestia] Columna estado ya es estadoordenitem, sin cambios."
            )

        cur.close()
        log.info("[Hestia] Migracion de enums completada.")
    finally:
        conn.close()
