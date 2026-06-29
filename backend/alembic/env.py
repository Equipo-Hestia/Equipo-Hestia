from logging.config import fileConfig
from sqlalchemy import engine_from_config, pool
from alembic import context
from dotenv import load_dotenv
import os
import sys

# Agregar el directorio backend al path para poder importar app
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

load_dotenv()

# Importar Base y TODOS los modelos para que Alembic los detecte.
# Mismo orden que backend/app/main.py (resuelve dependencias de FK y
# relaciones lazy de SQLAlchemy, p.ej. Asignatura -> Taller).
from app.database import Base
from app.models import rol
from app.models import sala, categoria, usuario, movimiento, insumo
from app.models import audit_log
from app.models import asignatura
from app.models import docente            # antes que clase_docente
from app.models import clase_docente
from app.models import solicitud
from app.models import token_recuperacion
from app.models import retorno_implemento
from app.models import activo_fijo
from app.models import unidad_implemento
from app.models import taller
from app.models import paquete_insumo
from app.models import proveedor
from app.models import orden_mantenimiento
from app.models import programacion_taller
from app.models import revision_sala
from app.models import orden_entrada
from app.models import incidencia

config = context.config

# Leer la URL desde el .env
config.set_main_option("sqlalchemy.url", os.getenv("DATABASE_URL"))

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata

def run_migrations_offline() -> None:
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()

def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata
        )
        with context.begin_transaction():
            context.run_migrations()

if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
