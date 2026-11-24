from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from dotenv import load_dotenv
import os

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    raise RuntimeError(
        "DATABASE_URL no esta configurada. "
        "Crea backend/.env con DATABASE_URL=postgresql://..."
    )

# La sesion de PostgreSQL usa la hora de Santiago: asi cast(timestamptz, Date)
# y los filtros por dia agrupan por el dia chileno y no por el dia UTC.
# Los timestamptz guardados no cambian; solo su representacion al leerlos.
# pool_pre_ping: valida cada conexion del pool antes de usarla; si PostgreSQL
# se reinicio, descarta la conexion rota y abre otra en vez de responder 500.
engine = create_engine(
    DATABASE_URL,
    connect_args={"options": "-c timezone=America/Santiago"},
    pool_pre_ping=True,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
