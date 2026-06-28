"""Agrega columna recovery_codes a usuarios para codigos de recuperacion 2FA.

Revision ID: 0002
Revises: 0001
Create Date: 2026-05-11

Defensiva: si la tabla no existe, la omite (create_all la crea con el modelo actual).
Si la tabla existe pero no tiene la columna, la agrega.

NOTA (corregido junio 2026): la version original de esta migracion creaba
por error una columna llamada `totp_recovery_codes`, que nunca coincidio
con el nombre real usado en el modelo `Usuario` (`recovery_codes`). Se
corrige aqui para usar el nombre correcto; la columna huerfana que algun
entorno de desarrollo pueda tener se limpia en la migracion 0003.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision = '0002'
down_revision = '0001'
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = inspect(conn)
    if 'usuarios' not in inspector.get_table_names():
        return
    cols = {c['name'] for c in inspector.get_columns('usuarios')}
    if 'recovery_codes' not in cols:
        op.add_column(
            'usuarios',
            sa.Column('recovery_codes', sa.Text(), nullable=True)
        )


def downgrade() -> None:
    op.drop_column('usuarios', 'recovery_codes')
