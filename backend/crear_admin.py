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
# antes de cualquier consulta ORM. SQLAlchemy resuelve las relaciones entre
# modelos (relationship()) usando el mapper registry: si un modelo no fue
# importado, la resolucion falla con KeyError al intentar usar otro modelo
# que tiene una relacion apuntando al que falta.
# solicitud define SolicitudRetiro, que Usuario referencia via
# relationship("SolicitudRetiro", ...). Sin este import, db.query(Usuario)
# falla con InvalidRequestError al intentar configurar el mapper.
from app.models import solicitud  # noqa  <- SolicitudRetiro y SolicitudItem
from app.models import audit_log  # noqa  <- AuditLog
from app.models.clase_docente import ClaseDocente  # noqa  <- ClaseDocente
from app.models.asignatura import Asignatura  # noqa  <- Asignatura

# --- Leer credenciales desde el entorno, sin defaults ---
# Si alguna variable falta, el script falla con un mensaje claro.
# Nunca escribir contrasenas en el codigo fuente.
admin_email = os.getenv("ADMIN_EMAIL")
admin_password = os.getenv("ADMIN_PASSWORD")

if not admin_email or not admin_password:
    print("[ERROR] Las variables ADMIN_EMAIL y ADMIN_PASSWORD deben estar definidas en el .env")
    print("        Copia backend/.env.example a backend/.env y completa los valores.")
    sys.exit(1)

# 1) Crear tablas que no existen (basado en los modelos SQLAlchemy actuales).
#    create_all() necesita conocer TODOS los modelos registrados para crear
#    las tablas con las relaciones correctas. Por eso los imports de arriba
#    deben ir antes de esta llamada.
Base.metadata.create_all(bind=engine)

# 2) Aplicar migraciones idempotentes (columnas nuevas en tablas existentes
#    y valores nuevos en tipos ENUM). Seguro de llamar multiples veces.
aplicar_migraciones_pendientes()

db = SessionLocal()

admin_existente = db.query(Usuario).filter(Usuario.email == admin_email).first()

if admin_existente:
    print(f"[Hestia] Admin ya existe: {admin_email}")
    if admin_existente.rol != RolUsuario.admin:
        admin_existente.rol = RolUsuario.admin
        db.commit()
        print(f"[Hestia] Rol actualizado a admin")
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
