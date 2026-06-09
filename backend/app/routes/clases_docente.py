from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload
from typing import Optional

from app.database import get_db
from app.models.clase_docente import ClaseDocente
from app.models.docente import Docente
from app.models.asignatura import Asignatura
from app.models.usuario import Usuario, RolUsuario
from app.schemas.clase_docente import (
    ClaseDocenteCreate, ClaseDocenteUpdate, ClaseDocenteResponse
)
from app.utils.deps import get_usuario_actual, require_admin

router = APIRouter(prefix="/clases-docente", tags=["Clases Docente"])


def _opts():
    return [
        joinedload(ClaseDocente.docente),
        joinedload(ClaseDocente.asignatura),
    ]


def _construir(c: ClaseDocente) -> ClaseDocenteResponse:
    return ClaseDocenteResponse(
        id=c.id,
        docente_id=c.docente_id or 0,
        docente_nombre=c.docente.nombre if c.docente else "Sin docente",
        asignatura_id=c.asignatura_id,
        asignatura_nombre=(
            c.asignatura.nombre if c.asignatura else "Desconocida"
        ),
        asignatura_codigo=(
            c.asignatura.codigo if c.asignatura else ""
        ),
        seccion=c.seccion,
        semestre=c.semestre,
        activa=c.activa,
        num_estudiantes=c.num_estudiantes,
        dia_semana=c.dia_semana,
        hora_inicio=c.hora_inicio,
        hora_fin=c.hora_fin,
    )


# ---------------------------------------------------------------------------
# IMPORTANTE: /mis-clases es ruta estatica y va ANTES de /{clase_id}
# ---------------------------------------------------------------------------

@router.get("/mis-clases", response_model=list[ClaseDocenteResponse])
def mis_clases(
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(get_usuario_actual),
):
    """Clases activas del usuario autenticado (cualquier rol).

    Mantenido por compatibilidad; en el nuevo modelo los docentes
    no tienen cuenta de usuario, por lo que retorna lista vacia
    para roles que no son docentes externos.
    """
    return []


@router.get("/", response_model=list[ClaseDocenteResponse])
def listar_clases(
    docente_id: Optional[int] = None,
    semestre: Optional[str] = None,
    solo_activas: bool = True,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(get_usuario_actual),
):
    q = db.query(ClaseDocente).options(*_opts())
    if docente_id is not None:
        q = q.filter(ClaseDocente.docente_id == docente_id)
    if solo_activas:
        q = q.filter(ClaseDocente.activa.is_(True))
    if semestre:
        q = q.filter(ClaseDocente.semestre == semestre)
    clases = q.order_by(
        ClaseDocente.semestre.desc(),
        ClaseDocente.docente_id,
        ClaseDocente.seccion,
    ).all()
    return [_construir(c) for c in clases]


@router.post("/", response_model=ClaseDocenteResponse)
def crear_clase(
    datos: ClaseDocenteCreate,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(require_admin),
):
    docente = db.query(Docente).filter(Docente.id == datos.docente_id).first()
    if not docente:
        raise HTTPException(status_code=404, detail="Docente no encontrado.")
    asig = db.query(Asignatura).filter(
        Asignatura.id == datos.asignatura_id,
        Asignatura.activa.is_(True),
    ).first()
    if not asig:
        raise HTTPException(
            status_code=404, detail="Asignatura no encontrada o inactiva."
        )
    nueva = ClaseDocente(
        docente_id=datos.docente_id,
        asignatura_id=datos.asignatura_id,
        seccion=datos.seccion.strip().upper(),
        semestre=datos.semestre.strip(),
    )
    db.add(nueva)
    db.commit()
    db.refresh(nueva)
    return _construir(
        db.query(ClaseDocente)
        .options(*_opts())
        .filter(ClaseDocente.id == nueva.id)
        .first()
    )


@router.put("/{clase_id}", response_model=ClaseDocenteResponse)
def actualizar_clase(
    clase_id: int,
    datos: ClaseDocenteUpdate,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(require_admin),
):
    c = (
        db.query(ClaseDocente)
        .options(*_opts())
        .filter(ClaseDocente.id == clase_id)
        .first()
    )
    if not c:
        raise HTTPException(status_code=404, detail="Clase no encontrada.")
    for campo, valor in datos.model_dump(exclude_unset=True).items():
        if isinstance(valor, str):
            valor = valor.strip()
            if campo == "seccion":
                valor = valor.upper()
        setattr(c, campo, valor)
    db.commit()
    return _construir(
        db.query(ClaseDocente)
        .options(*_opts())
        .filter(ClaseDocente.id == clase_id)
        .first()
    )
