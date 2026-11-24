"""insumos.stock_actual: CHECK (>= 0) y NOT NULL.

Revision ID: 0005
Revises: 0004
Create Date: 2026-11-24

Segunda proteccion, a nivel de base de datos, ademas de los bloqueos de fila
(SELECT ... FOR UPDATE) y de las validaciones de la API: ningun camino
(una ruta nueva, un script, un UPDATE manual) puede dejar un insumo con
stock negativo o vacio.

Antes de crear las restricciones se verifica que no existan filas que las
violen. Si existen, la migracion falla con un mensaje que las lista y no
modifica ningun dato: hay que corregirlas a mano (revisando sus movimientos)
y volver a ejecutar `alembic upgrade head`.

En una instalacion nueva la tabla `insumos` todavia no existe en este punto
(la crea `Base.metadata.create_all()` despues de las migraciones, ya con
estas restricciones declaradas en el modelo): en ese caso no se hace nada.
"""
from alembic import op
from sqlalchemy import text

revision = '0005'
down_revision = '0004'
branch_labels = None
depends_on = None

TABLA = "insumos"
CHECK = "ck_insumos_stock_actual_no_negativo"
MAX_EJEMPLOS = 10


def _filas_invalidas(conn, condicion: str) -> tuple[int, list]:
    total = conn.execute(
        text(f"SELECT count(*) FROM insumos WHERE {condicion}")
    ).scalar()
    ejemplos = conn.execute(
        text(
            f"SELECT id, nombre, stock_actual FROM insumos WHERE {condicion} "
            f"ORDER BY id LIMIT {MAX_EJEMPLOS}"
        )
    ).fetchall()
    return total, ejemplos


def upgrade():
    conn = op.get_bind()
    existe = conn.execute(text("SELECT to_regclass('public.insumos')")).scalar()
    if existe is None:
        return

    problemas = []
    for condicion, descripcion in (
        ("stock_actual < 0", "con stock_actual negativo"),
        ("stock_actual IS NULL", "con stock_actual vacio (NULL)"),
    ):
        total, ejemplos = _filas_invalidas(conn, condicion)
        if total:
            detalle = "; ".join(
                f"id={f.id} '{f.nombre}' stock_actual={f.stock_actual}" for f in ejemplos
            )
            mas = f" (y {total - len(ejemplos)} mas)" if total > len(ejemplos) else ""
            problemas.append(f"- {total} insumo(s) {descripcion}: {detalle}{mas}")

    if problemas:
        raise RuntimeError(
            "Migracion 0005 detenida: no se puede exigir stock_actual >= 0 y NOT NULL "
            "en la tabla insumos porque hay filas que no lo cumplen.\n"
            + "\n".join(problemas)
            + "\nNo se modifico ningun dato. Corrige esas filas (revisando sus "
            "movimientos) y vuelve a ejecutar `alembic upgrade head`."
        )

    op.alter_column(TABLA, "stock_actual", nullable=False)
    op.create_check_constraint(CHECK, TABLA, "stock_actual >= 0")


def downgrade():
    conn = op.get_bind()
    existe = conn.execute(text("SELECT to_regclass('public.insumos')")).scalar()
    if existe is None:
        return
    op.execute(f"ALTER TABLE {TABLA} DROP CONSTRAINT IF EXISTS {CHECK}")
    op.alter_column(TABLA, "stock_actual", nullable=True)
