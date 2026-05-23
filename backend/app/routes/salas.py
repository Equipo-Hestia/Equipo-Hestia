from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.sala import Sala
from app.models.usuario import Usuario
from app.schemas.sala import SalaCreate, SalaResponse
from app.schemas.comun import PaginatedResponse
from app.utils.deps import get_usuario_actual, require_operador, require_admin

router = APIRouter(prefix="/salas", tags=["Salas"])


@router.get("/", response_model=PaginatedResponse[SalaResponse])
def listar_salas(
    skip: int = 0,
    limit: int = 20,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(get_usuario_actual)  # visor, operador y admin
):
    total = db.query(Sala).count()
    salas = db.query(Sala).offset(skip).limit(limit).all()
    return {"total": total, "skip": skip, "limit": limit, "data": salas}


@router.get("/{sala_id}", response_model=SalaResponse)
def obtener_sala(
    sala_id: int,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(get_usuario_actual)  # visor, operador y admin
):
    sala = db.query(Sala).filter(Sala.id == sala_id).first()
    if not sala:
        raise HTTPException(status_code=404, detail="Sala no encontrada")
    return sala


@router.post("/", response_model=SalaResponse)
def crear_sala(
    sala: SalaCreate,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(require_operador)  # operador y admin
):
    nueva = Sala(**sala.model_dump())
    db.add(nueva)
    db.commit()
    db.refresh(nueva)
    return nueva


@router.put("/{sala_id}", response_model=SalaResponse)
def actualizar_sala(
    sala_id: int,
    datos: SalaCreate,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(require_operador)  # operador y admin
):
    sala = db.query(Sala).filter(Sala.id == sala_id).first()
    if not sala:
        raise HTTPException(status_code=404, detail="Sala no encontrada")
    for campo, valor in datos.model_dump(exclude_unset=True).items():
        setattr(sala, campo, valor)
    db.commit()
    db.refresh(sala)
    return sala


@router.delete("/{sala_id}")
def eliminar_sala(
    sala_id: int,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(require_admin)  # solo admin
):
    sala = db.query(Sala).filter(Sala.id == sala_id).first()
    if not sala:
        raise HTTPException(status_code=404, detail="Sala no encontrada")
    db.delete(sala)
    db.commit()
    return {"mensaje": "Sala eliminada"}
