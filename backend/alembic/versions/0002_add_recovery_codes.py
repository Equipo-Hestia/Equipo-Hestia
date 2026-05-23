"""Agrega columna totp_recovery_codes a usuarios para codigos de recuperacion 2FA.

Revision ID: 0002
Revises: 0001
Create Date: 2026-05-11

Defensiva: si la tabla no existe, la omite (create_all la crea con el modelo actual).
Si la tabla existe pero no tiene la columna, la agrega.
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
    if 'totp_recovery_codes' not in cols:
        op.add_column(
            'usuarios',
            sa.Column('totp_recovery_codes', sa.Text(), nullable=True)
        )


def downgrade() -> None:
    op.drop_column('usuarios', 'totp_recovery_codes')
