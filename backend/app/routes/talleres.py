from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload
from typing import Optional

from app.database import get_db
from app.models.taller import Taller
from app.models.asignatura import Asignatura
from app.schemas.taller import TallerCreate, TallerUpdate, TallerResponse
from app.utils.deps import get_usuario_actual, require_operador, require_admin
from app.models.usuario import Usuario

router = APIRouter(prefix="/talleres", tags=["Talleres"])


def _construir_response(t: Taller) -> TallerResponse:
    return TallerResponse(
        id=t.id,
        nombre=t.nombre,
        descripcion=t.descripcion,
        asignatura_id=t.asignatura_id,
        asignatura_nombre=(
            t.asignatura.nombre if t.asignatura else None
        ),
        asignatura_codigo=(
            t.asignatura.codigo if t.asignatura else None
        ),
        activo=t.activo,
    )


@router.get("/", response_model=list[TallerResponse])
def listar_talleres(
    asignatura_id: Optional[int] = None,
    incluir_inactivos: bool = False,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(get_usuario_actual),
):
    """Lista talleres. Filtrable por asignatura.

    Cualquier usuario autenticado puede consultarlos (lectura).
    """
    q = db.query(Taller).options(joinedload(Taller.asignatura))
    if not incluir_inactivos:
        q = q.filter(Taller.activo.is_(True))
    if asignatura_id is not None:
        q = q.filter(Taller.asignatura_id == asignatura_id)
    talleres = q.order_by(Taller.nombre).all()
    return [_construir_response(t) for t in talleres]


@router.get("/{taller_id}", response_model=TallerResponse)
def obtener_taller(
    taller_id: int,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(get_usuario_actual),
):
    t = (
        db.query(Taller)
        .options(joinedload(Taller.asignatura))
        .filter(Taller.id == taller_id)
        .first()
    )
    if not t:
        raise HTTPException(status_code=404, detail="Taller no encontrado")
    return _construir_response(t)


@router.post("/", response_model=TallerResponse, status_code=status.HTTP_201_CREATED)
def crear_taller(
    datos: TallerCreate,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(require_operador),
):
    """Crea un nuevo taller. Requiere rol operador o superior."""
    if datos.asignatura_id is not None:
        asig = db.query(Asignatura).filter(
            Asignatura.id == datos.asignatura_id
        ).first()
        if not asig:
            raise HTTPException(status_code=404, detail="Asignatura no encontrada")

    taller = Taller(
        nombre=datos.nombre,
        descripcion=datos.descripcion,
        asignatura_id=datos.asignatura_id,
    )
    db.add(taller)
    db.commit()
    db.refresh(taller)
    # Recargar con asignatura
    return _construir_response(
        db.query(Taller)
        .options(joinedload(Taller.asignatura))
        .filter(Taller.id == taller.id)
        .first()
    )


@router.put("/{taller_id}", response_model=TallerResponse)
def actualizar_taller(
    taller_id: int,
    datos: TallerUpdate,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(require_operador),
):
    t = (
        db.query(Taller)
        .options(joinedload(Taller.asignatura))
        .filter(Taller.id == taller_id)
        .first()
    )
    if not t:
        raise HTTPException(status_code=404, detail="Taller no encontrado")

    if datos.asignatura_id is not None:
        asig = db.query(Asignatura).filter(
            Asignatura.id == datos.asignatura_id
        ).first()
        if not asig:
            raise HTTPException(status_code=404, detail="Asignatura no encontrada")

    if datos.nombre is not None:
        t.nombre = datos.nombre
    if datos.descripcion is not None:
        t.descripcion = datos.descripcion
    if datos.asignatura_id is not None:
        t.asignatura_id = datos.asignatura_id
    if datos.activo is not None:
        t.activo = datos.activo

    db.commit()
    return _construir_response(
        db.query(Taller)
        .options(joinedload(Taller.asignatura))
        .filter(Taller.id == taller_id)
        .first()
    )


@router.delete("/{taller_id}", status_code=status.HTTP_204_NO_CONTENT)
def desactivar_taller(
    taller_id: int,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(require_admin),
):
    """Soft-delete: marca el taller como inactivo. Solo admin."""
    t = db.query(Taller).filter(Taller.id == taller_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Taller no encontrado")
    t.activo = False
    db.commit()
