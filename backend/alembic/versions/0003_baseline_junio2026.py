"""Punto de anclaje del esquema actual (junio 2026).

Revision ID: 0003
Revises: 0002
Create Date: 2026-06-27

Hasta esta revision, el esquema de Hestia se construyo con una mezcla de
`Base.metadata.create_all()` (tablas nuevas) y el sistema manual de
`MIGRACIONES_COLUMNAS` / `MIGRACIONES_ENUM` en `app/database.py` (columnas
y enums agregados a tablas existentes). Esta migracion no recrea nada:
solo marca que, a partir de aqui, todo cambio de esquema nuevo se hace
exclusivamente con Alembic (`alembic revision --autogenerate` + revision
manual).

El sistema manual de `database.py` queda congelado como referencia
historica y se elimina por completo en una fase posterior, una vez
migrados los enums de catalogo de negocio (`carreraasignatura`,
`rolusuario`) a tablas relacionales.
"""
from alembic import op
from sqlalchemy import inspect

revision = '0003'
down_revision = '0002'
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = inspect(conn)

    # Limpieza defensiva: una version antigua y abandonada de la migracion
    # 0002 creaba por error una columna `totp_recovery_codes` que nunca
    # coincidio con el modelo real (`recovery_codes`). Si algun entorno de
    # desarrollo llego a ejecutarla, se elimina la columna huerfana aqui.
    if 'usuarios' in inspector.get_table_names():
        cols = {c['name'] for c in inspector.get_columns('usuarios')}
        if 'totp_recovery_codes' in cols:
            op.drop_column('usuarios', 'totp_recovery_codes')


def downgrade() -> None:
    pass
