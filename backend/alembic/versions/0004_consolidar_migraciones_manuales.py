"""Consolidar migraciones manuales: absorbe MIGRACIONES_COLUMNAS y MIGRACIONES_ENUM.

Revision ID: 0004
Revises: c7f3a92e1b08
Create Date: 2026-07-05

Absorbe todo el DDL que antes ejecutaba aplicar_migraciones_pendientes()
en database.py. A partir de esta migracion, Alembic es el unico sistema
de migraciones activo. database.py queda solo con engine/Base/get_db.

Todas las operaciones son defensivas: IF EXISTS, IF NOT EXISTS, o bloques
DO ... EXCEPTION WHEN duplicate_object ... para tolerar cualquier estado
parcial (fresh install, DB antigua, reinstalacion parcial).
"""
from alembic import op
from sqlalchemy import text

revision = '0004'
down_revision = 'c7f3a92e1b08'
branch_labels = None
depends_on = None

# DDL consolidado de MIGRACIONES_COLUMNAS. Todas las sentencias son defensivas.
_DDL = [
    (
        "ALTER TABLE IF EXISTS usuarios "
        "ADD COLUMN IF NOT EXISTS activo BOOLEAN NOT NULL DEFAULT TRUE"
    ),
    (
        "ALTER TABLE IF EXISTS insumos "
        "ADD COLUMN IF NOT EXISTS activo BOOLEAN NOT NULL DEFAULT TRUE"
    ),
    "ALTER TABLE IF EXISTS usuarios ADD COLUMN IF NOT EXISTS avatar_b64 TEXT",
    (
        "DO $$ BEGIN "
        "CREATE TYPE tipoinsumo AS ENUM ('insumo', 'implemento'); "
        "EXCEPTION WHEN duplicate_object THEN NULL; END $$"
    ),
    (
        "ALTER TABLE IF EXISTS insumos "
        "ADD COLUMN IF NOT EXISTS tipo tipoinsumo NOT NULL DEFAULT 'insumo'"
    ),
    "ALTER TABLE IF EXISTS insumos ADD COLUMN IF NOT EXISTS sku VARCHAR(20)",
    "ALTER TABLE IF EXISTS insumos ADD COLUMN IF NOT EXISTS codigo_barras VARCHAR(100)",
    "ALTER TABLE IF EXISTS insumos ADD COLUMN IF NOT EXISTS costo_unitario NUMERIC(10,2)",
    (
        "CREATE UNIQUE INDEX IF NOT EXISTS uix_insumos_sku "
        "ON insumos (sku) WHERE sku IS NOT NULL"
    ),
    (
        "CREATE UNIQUE INDEX IF NOT EXISTS uix_insumos_codigo_barras "
        "ON insumos (codigo_barras) WHERE codigo_barras IS NOT NULL"
    ),
    (
        "ALTER TABLE IF EXISTS solicitudes_retiro "
        "ADD COLUMN IF NOT EXISTS clase_docente_id INTEGER"
    ),
    "ALTER TABLE IF EXISTS insumos ADD COLUMN IF NOT EXISTS fecha_vencimiento DATE",
    (
        "DO $$ BEGIN "
        "CREATE TYPE carreraasignatura AS ENUM "
        "('TENS', 'TQF', 'TLCBS', 'preparador_fisico'); "
        "EXCEPTION WHEN duplicate_object THEN NULL; END $$"
    ),
    (
        "ALTER TABLE IF EXISTS asignaturas "
        "ADD COLUMN IF NOT EXISTS carrera carreraasignatura"
    ),
    (
        "ALTER TABLE IF EXISTS clases_docente "
        "ADD COLUMN IF NOT EXISTS num_estudiantes INTEGER"
    ),
    (
        "ALTER TABLE IF EXISTS clases_docente "
        "ADD COLUMN IF NOT EXISTS dia_semana VARCHAR(15)"
    ),
    (
        "ALTER TABLE IF EXISTS clases_docente "
        "ADD COLUMN IF NOT EXISTS hora_inicio VARCHAR(5)"
    ),
    (
        "ALTER TABLE IF EXISTS clases_docente "
        "ADD COLUMN IF NOT EXISTS hora_fin VARCHAR(5)"
    ),
    "ALTER TABLE IF EXISTS insumos ADD COLUMN IF NOT EXISTS unidad_medida VARCHAR(60)",
    (
        "ALTER TABLE IF EXISTS unidades_implemento "
        "ADD COLUMN IF NOT EXISTS sala_id INTEGER "
        "REFERENCES salas(id) ON DELETE SET NULL"
    ),
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
    (
        "ALTER TABLE IF EXISTS movimientos "
        "ADD COLUMN IF NOT EXISTS subtipo subtipomovimiento"
    ),
    (
        "ALTER TABLE IF EXISTS movimientos "
        "ADD COLUMN IF NOT EXISTS paquete_id INTEGER "
        "REFERENCES paquetes_insumo(id) ON DELETE SET NULL"
    ),
    (
        "ALTER TABLE IF EXISTS movimientos "
        "ADD COLUMN IF NOT EXISTS sala_id INTEGER "
        "REFERENCES salas(id) ON DELETE SET NULL"
    ),
    (
        "ALTER TABLE IF EXISTS activos_fijos "
        "ADD COLUMN IF NOT EXISTS proveedor_id INTEGER "
        "REFERENCES proveedores(id) ON DELETE SET NULL"
    ),
    (
        "DO $$ BEGIN "
        "CREATE TYPE tipomantenimiento AS ENUM ("
        "'preventivo', 'correctivo', 'validacion_tecnica'"
        "); "
        "EXCEPTION WHEN duplicate_object THEN NULL; END $$"
    ),
    (
        "ALTER TABLE IF EXISTS ordenes_mantenimiento "
        "ADD COLUMN IF NOT EXISTS tipo_mantenimiento tipomantenimiento"
    ),
    (
        "ALTER TABLE IF EXISTS ordenes_mantenimiento "
        "ADD COLUMN IF NOT EXISTS fecha_retorno_estimada DATE"
    ),
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
    (
        "ALTER TABLE IF EXISTS ordenes_mantenimiento "
        "ADD COLUMN IF NOT EXISTS fecha_visita DATE"
    ),
    "ALTER TABLE IF EXISTS ordenes_mantenimiento ADD COLUMN IF NOT EXISTS notas TEXT",
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
    # Migrar FK clases_docente.docente_id de usuarios -> docentes
    (
        "DO $$ "
        "DECLARE fk_a_usuarios BOOLEAN; "
        "BEGIN "
        "  SELECT EXISTS ( "
        "    SELECT 1 FROM pg_constraint c "
        "    JOIN pg_class r ON c.confrelid = r.oid "
        "    WHERE c.conname = 'clases_docente_docente_id_fkey' "
        "      AND c.conrelid = 'clases_docente'::regclass "
        "      AND r.relname = 'usuarios' "
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
        "    WHERE conname = 'clases_docente_docente_id_fkey' "
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
        "CREATE TYPE tipoitemorden AS ENUM ('insumo', 'activo_fijo'); "
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

# Adiciones de valores a enums existentes (de MIGRACIONES_ENUM).
# ALTER TYPE ... ADD VALUE IF NOT EXISTS es seguro dentro de una transaccion
# en PostgreSQL 12+ (Hestia usa PG 16).
_ENUM_ADDITIONS = [
    ("rolusuario", ["admin", "operador_coordinador", "operador", "visor"]),
    ("carreraasignatura", ["TENS", "TQF", "TLCBS", "preparador_fisico", "TONS"]),
    ("tipomovimiento", ["entrada", "salida", "interno"]),
    ("estadoordenitem", ["en_curso", "cerrada", "cancelada"]),
    ("resultadoitem", ["pendiente", "ok", "sale_a_taller", "dar_de_baja"]),
    ("tipocomentario", ["positivo", "negativo", "neutro"]),
    ("tipoorden", ["semanal", "semestral", "emergencia"]),
    (
        "estadoordenentrada",
        ["borrador", "confirmada", "en_recepcion", "cerrada", "cancelada"],
    ),
    ("estadoitemorden", ["pendiente", "recibido", "recibido_parcial", "cancelado"]),
    ("tipoitemorden", ["insumo", "activo_fijo"]),
]


def upgrade() -> None:
    conn = op.get_bind()

    # Fase 1: columnas, indices y tipos de datos
    for sql in _DDL:
        conn.execute(text(sql))

    # Fase 2: valores de enums. Solo actua si el tipo ya existe en PG
    # (en fresh install los tipos son creados por create_all() despues
    # de este punto, por lo que esta fase es un no-op y se completa
    # correctamente en el siguiente arranque si fuera necesario).
    for tipo_enum, valores in _ENUM_ADDITIONS:
        existe = conn.execute(
            text("SELECT 1 FROM pg_type WHERE typname = :t"),
            {"t": tipo_enum},
        ).fetchone()
        if not existe:
            continue
        for valor in valores:
            conn.execute(
                text(
                    f"ALTER TYPE {tipo_enum} "
                    f"ADD VALUE IF NOT EXISTS '{valor}'"
                )
            )

    # Fase 3: migrar ordenes_mantenimiento.estado si usa un tipo enum antiguo
    row = conn.execute(text(
        "SELECT t.typname FROM pg_attribute a "
        "JOIN pg_class c ON a.attrelid = c.oid "
        "JOIN pg_type t ON a.atttypid = t.oid "
        "WHERE c.relname = 'ordenes_mantenimiento' "
        "AND a.attname = 'estado' AND a.attnum > 0"
    )).fetchone()
    tipo_actual = row[0] if row else None
    if tipo_actual and tipo_actual != 'estadoordenitem':
        conn.execute(text("DELETE FROM orden_mantenimiento_items"))
        conn.execute(text("DELETE FROM ordenes_mantenimiento"))
        conn.execute(text(
            "ALTER TABLE ordenes_mantenimiento "
            "ALTER COLUMN estado DROP DEFAULT"
        ))
        conn.execute(text(
            "ALTER TABLE ordenes_mantenimiento "
            "ALTER COLUMN estado TYPE estadoordenitem "
            "USING 'en_curso'::estadoordenitem"
        ))
        conn.execute(text(
            "ALTER TABLE ordenes_mantenimiento "
            "ALTER COLUMN estado SET DEFAULT 'en_curso'::estadoordenitem"
        ))


def downgrade() -> None:
    # Migracion de convergencia: el downgrade no tiene estado util.
    # Para revertir, usar docker compose down -v y reconstruir desde cero.
    pass
