import sys
import os
sys.path.append(".")

from app.database import SessionLocal, Base, engine, aplicar_migraciones_pendientes
from app.models.usuario import Usuario, RolUsuario
from app.utils.security import hashear_password
from app.models.sala import Sala
from app.models.categoria import Categoria
from app.models.insumo import Insumo
from app.models.movimiento import Movimiento
# IMPORTANTE: todos los modelos deben importarse antes de create_all() y
# antes de cualquier consulta ORM. SQLAlchemy resuelve las relaciones
# usando el mapper registry: si un modelo no fue importado, falla con
# KeyError o InvalidRequestError al configurar cualquier mapper relacionado.
from app.models import solicitud             # noqa
from app.models import audit_log             # noqa
from app.models import docente               # noqa  <- antes que clase_docente
from app.models.clase_docente import ClaseDocente  # noqa
from app.models.asignatura import Asignatura       # noqa
from app.models import taller                # noqa
from app.models import paquete_insumo        # noqa
from app.models import activo_fijo           # noqa
from app.models import proveedor             # noqa
from app.models import orden_mantenimiento   # noqa
from app.models import programacion_taller   # noqa
from app.models import revision_sala         # noqa
from app.models import unidad_implemento     # noqa
from app.models import retorno_implemento    # noqa
from app.models import orden_entrada         # noqa  <- OrdenEntrada, OrdenEntradaItem

admin_email = os.getenv("ADMIN_EMAIL")
admin_password = os.getenv("ADMIN_PASSWORD")

if not admin_email or not admin_password:
    print("[ERROR] Las variables ADMIN_EMAIL y ADMIN_PASSWORD deben estar definidas en el .env")
    print("        Copia backend/.env.example a backend/.env y completa los valores.")
    sys.exit(1)

Base.metadata.create_all(bind=engine)
aplicar_migraciones_pendientes()

db = SessionLocal()

admin_existente = db.query(Usuario).filter(Usuario.email == admin_email).first()

if admin_existente:
    print(f"[Hestia] Admin ya existe: {admin_email}")
    if admin_existente.rol != RolUsuario.admin:
        admin_existente.rol = RolUsuario.admin
        db.commit()
        print("[Hestia] Rol actualizado a admin")
else:
    admin = Usuario(
        nombre="Administrador Hestia",
        email=admin_email,
        password_hash=hashear_password(admin_password),
        rol=RolUsuario.admin,
    )
    db.add(admin)
    db.commit()
    print(f"[Hestia] Admin creado: {admin_email}")

db.close()
