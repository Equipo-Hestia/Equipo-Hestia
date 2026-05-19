from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError

from app.database import get_db
from app.models.asignatura import Asignatura
from app.models.usuario import Usuario
from app.schemas.asignatura import AsignaturaCreate, AsignaturaUpdate, AsignaturaResponse
from app.utils.deps import get_usuario_actual, require_admin

router = APIRouter(prefix="/asignaturas", tags=["Asignaturas"])


@router.get("/", response_model=list[AsignaturaResponse])
def listar_asignaturas(
    incluir_inactivas: bool = False,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(get_usuario_actual),
):
    """Lista asignaturas activas. Con incluir_inactivas=true devuelve todas."""
    q = db.query(Asignatura)
    if not incluir_inactivas:
        q = q.filter(Asignatura.activa.is_(True))
    return q.order_by(Asignatura.nombre).all()


@router.post("/", response_model=AsignaturaResponse)
def crear_asignatura(
    datos: AsignaturaCreate,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(require_admin),
):
    nueva = Asignatura(
        nombre=datos.nombre.strip(),
        codigo=datos.codigo.strip().upper(),
    )
    db.add(nueva)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="El codigo ya esta en uso.")
    db.refresh(nueva)
    return nueva


@router.put("/{asignatura_id}", response_model=AsignaturaResponse)
def actualizar_asignatura(
    asignatura_id: int,
    datos: AsignaturaUpdate,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(require_admin),
):
    asig = db.query(Asignatura).filter(Asignatura.id == asignatura_id).first()
    if not asig:
        raise HTTPException(status_code=404, detail="Asignatura no encontrada.")
    for campo, valor in datos.model_dump(exclude_unset=True).items():
        if isinstance(valor, str):
            valor = valor.strip()
            if campo == "codigo":
                valor = valor.upper()
        setattr(asig, campo, valor)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="El codigo ya esta en uso.")
    db.refresh(asig)
    return asig
