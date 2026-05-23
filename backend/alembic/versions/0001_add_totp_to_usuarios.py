"""Agrega campos TOTP al modelo Usuario para soporte de 2FA.

Revision ID: 0001
Revises: aaf389229667
Create Date: 2026-05-11

Migracion defensiva en dos niveles:
1. Si la tabla 'usuarios' no existe aun (DB completamente vacia), se omite.
   create_all() la creara despues con el modelo actualizado que ya incluye
   totp_secret y totp_habilitado desde el inicio.
2. Si la tabla existe pero le faltan las columnas TOTP (DB pre-existente),
   las agrega. Esto cubre el caso de quien ya tenia datos antes de este cambio.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision = '0001'
down_revision = 'aaf389229667'
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = inspect(conn)

    # Nivel 1: si la tabla no existe, la migracion no tiene nada que hacer.
    # Ocurre en DBs completamente nuevas donde create_all aun no corrio.
    if 'usuarios' not in inspector.get_table_names():
        return

    # Nivel 2: la tabla existe pero puede que le falten las columnas TOTP.
    # Ocurre en DBs pre-existentes que no tenian 2FA.
    columnas_existentes = {col['name'] for col in inspector.get_columns('usuarios')}

    if 'totp_secret' not in columnas_existentes:
        op.add_column('usuarios', sa.Column('totp_secret', sa.String(), nullable=True))

    if 'totp_habilitado' not in columnas_existentes:
        op.add_column(
            'usuarios',
            sa.Column('totp_habilitado', sa.Boolean(), nullable=False, server_default='false')
        )


def downgrade() -> None:
    op.drop_column('usuarios', 'totp_habilitado')
    op.drop_column('usuarios', 'totp_secret')
