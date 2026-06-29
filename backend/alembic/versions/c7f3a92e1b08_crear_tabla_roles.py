"""crear tabla roles y agregar rol_id a usuarios (Fase 2 - Etapa expand)

Revision ID: c7f3a92e1b08
Revises: bd64cf275c37
Create Date: 2026-06-29

Primer paso del patron expand/contract para migrar el catalogo de roles
desde el ENUM nativo `rolusuario` a una tabla relacional (ver CLAUDE.md
secciones 3.1 y 3.5). La columna `usuarios.rol` (enum) se mantiene
intacta y sigue siendo la fuente de verdad para el RBAC; `rol_id` queda
como FK nullable, poblada por referencia cruzada con el enum. El resto
del codigo (deps.py, schemas, frontend) sigue usando `usuarios.rol`
hasta la etapa de "contract", en la que se elimina el enum.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision = 'c7f3a92e1b08'
down_revision = 'bd64cf275c37'
branch_labels = None
depends_on = None

ROLES = [
    (
        "admin",
        "Acceso completo: usuarios, insumos, activos fijos, asignaturas, "
        "talleres, paquetes, clases, importar, audit log",
    ),
    (
        "operador_coordinador",
        "Igual que operador; permisos adicionales por definir",
    ),
    (
        "operador",
        "Insumos, activos fijos, movimientos, alertas, salas, categorias, "
        "paquetes de insumos",
    ),
    (
        "visor",
        "Solo lectura: dashboard, insumos, activos fijos, movimientos, "
        "alertas, salas, categorias",
    ),
]


def upgrade() -> None:
    conn = op.get_bind()
    inspector = inspect(conn)

    if 'roles' not in inspector.get_table_names():
        op.create_table(
            'roles',
            sa.Column('id', sa.Integer(), primary_key=True),
            sa.Column(
                'nombre', sa.String(length=50),
                nullable=False, unique=True,
            ),
            sa.Column('descripcion', sa.String(length=255), nullable=True),
            sa.Column(
                'activo', sa.Boolean(),
                nullable=False, server_default=sa.true(),
            ),
        )

    roles_table = sa.table(
        'roles',
        sa.column('nombre', sa.String),
        sa.column('descripcion', sa.String),
        sa.column('activo', sa.Boolean),
    )
    existentes = {
        fila[0] for fila in conn.execute(sa.text("SELECT nombre FROM roles"))
    }
    nuevos = [
        {'nombre': nombre, 'descripcion': desc, 'activo': True}
        for nombre, desc in ROLES if nombre not in existentes
    ]
    if nuevos:
        op.bulk_insert(roles_table, nuevos)

    cols = {c['name'] for c in inspector.get_columns('usuarios')}
    if 'rol_id' not in cols:
        op.add_column(
            'usuarios',
            sa.Column(
                'rol_id', sa.Integer(),
                sa.ForeignKey('roles.id'), nullable=True,
            ),
        )

    # Backfill: cada usuario apunta a la fila de roles con el mismo nombre
    # que su valor actual del enum `rol`.
    conn.execute(sa.text(
        "UPDATE usuarios SET rol_id = roles.id "
        "FROM roles WHERE roles.nombre = usuarios.rol::text "
        "AND usuarios.rol_id IS NULL"
    ))


def downgrade() -> None:
    op.drop_column('usuarios', 'rol_id')
    op.drop_table('roles')
