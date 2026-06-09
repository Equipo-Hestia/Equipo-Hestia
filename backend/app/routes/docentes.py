from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session, joinedload
from typing import Optional

from app.database import get_db
from app.models.docente import Docente, ComentarioDocente, TipoComentario
from app.models.clase_docente import ClaseDocente
from app.models.usuario import RolUsuario
from app.schemas.docente import (
    DocenteCreate, DocenteUpdate, DocenteResponse,
    ComentarioCreate, ComentarioResponse,
)
from app.utils.deps import get_usuario_actual, require_admin
from app.utils.auditoria import registrar, get_ip

router = APIRouter(prefix="/docentes", tags=["Docentes"])


# ---------------------------------------------------------------------------
# Helpers RBAC
# ---------------------------------------------------------------------------

def _require_coord_o_admin(usuario=Depends(get_usuario_actual)):
    """Permite acceso a admin y operador_coordinador."""
    if usuario.rol not in (RolUsuario.admin, RolUsuario.operador_coordinador):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Solo el administrador o el operador coordinador "
                   "pueden acceder a esta funcion.",
        )
    return usuario


def _require_coord(usuario=Depends(get_usuario_actual)):
    """Solo operador_coordinador puede gestionar comentarios."""
    if usuario.rol != RolUsuario.operador_coordinador:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Solo el operador coordinador (Maritza) puede gestionar "
                   "los comentarios de docentes.",
        )
    return usuario


def _to_response(d: Docente, db: Session) -> DocenteResponse:
    num_clases = (
        db.query(ClaseDocente)
        .filter(
            ClaseDocente.docente_id == d.id,
            ClaseDocente.activa.is_(True),
        )
        .count()
    )
    return DocenteResponse(
        id=d.id,
        nombre=d.nombre,
        email=d.email,
        rut=d.rut,
        telefono=d.telefono,
        activo=d.activo,
        created_at=d.created_at,
        num_clases=num_clases,
    )


# ---------------------------------------------------------------------------
# Docentes CRUD
# ---------------------------------------------------------------------------

@router.get("/", response_model=list[DocenteResponse])
def listar(
    incluir_inactivos: bool = False,
    db: Session = Depends(get_db),
    usuario=Depends(_require_coord_o_admin),
):
    q = db.query(Docente)
    if not incluir_inactivos:
        q = q.filter(Docente.activo.is_(True))
    docentes = q.order_by(Docente.nombre).all()
    return [_to_response(d, db) for d in docentes]


@router.post("/", response_model=DocenteResponse, status_code=201)
def crear(
    request: Request,
    datos: DocenteCreate,
    db: Session = Depends(get_db),
    usuario=Depends(_require_coord_o_admin),
):
    existente = db.query(Docente).filter(
        Docente.email == datos.email.lower().strip()
    ).first()
    if existente:
        raise HTTPException(
            status_code=409,
            detail="Ya existe un docente registrado con ese email.",
        )
    d = Docente(
        nombre=datos.nombre.strip(),
        email=datos.email.lower().strip(),
        rut=datos.rut.strip() if datos.rut else None,
        telefono=datos.telefono.strip() if datos.telefono else None,
    )
    db.add(d)
    db.commit()
    db.refresh(d)
    registrar(
        db, "CREAR_DOCENTE", usuario=usuario,
        entidad="docente", entidad_id=d.id,
        detalle=d.nombre, ip=get_ip(request),
    )
    return _to_response(d, db)


@router.put("/{docente_id}", response_model=DocenteResponse)
def actualizar(
    docente_id: int,
    request: Request,
    datos: DocenteUpdate,
    db: Session = Depends(get_db),
    usuario=Depends(_require_coord_o_admin),
):
    d = db.query(Docente).filter(Docente.id == docente_id).first()
    if not d:
        raise HTTPException(status_code=404, detail="Docente no encontrado.")
    if datos.email:
        dup = db.query(Docente).filter(
            Docente.email == datos.email.lower().strip(),
            Docente.id != docente_id,
        ).first()
        if dup:
            raise HTTPException(
                status_code=409,
                detail="Ese email ya esta registrado en otro docente.",
            )
    for campo, valor in datos.model_dump(exclude_unset=True).items():
        if isinstance(valor, str):
            valor = valor.strip()
            if campo == "email":
                valor = valor.lower()
        setattr(d, campo, valor)
    db.commit()
    db.refresh(d)
    registrar(
        db, "EDITAR_DOCENTE", usuario=usuario,
        entidad="docente", entidad_id=d.id,
        detalle=d.nombre, ip=get_ip(request),
    )
    return _to_response(d, db)


# ---------------------------------------------------------------------------
# Comentarios (solo operador_coordinador)
# ---------------------------------------------------------------------------

@router.get(
    "/{docente_id}/comentarios",
    response_model=list[ComentarioResponse],
)
def listar_comentarios(
    docente_id: int,
    db: Session = Depends(get_db),
    usuario=Depends(_require_coord),
):
    d = db.query(Docente).filter(Docente.id == docente_id).first()
    if not d:
        raise HTTPException(status_code=404, detail="Docente no encontrado.")
    coms = (
        db.query(ComentarioDocente)
        .options(joinedload(ComentarioDocente.creado_por))
        .filter(ComentarioDocente.docente_id == docente_id)
        .order_by(ComentarioDocente.created_at.desc())
        .all()
    )
    return [
        ComentarioResponse(
            id=c.id,
            docente_id=c.docente_id,
            tipo=c.tipo.value if hasattr(c.tipo, 'value') else c.tipo,
            contenido=c.contenido,
            creado_por_id=c.creado_por_id,
            creado_por_nombre=(
                c.creado_por.nombre if c.creado_por else None
            ),
            created_at=c.created_at,
        )
        for c in coms
    ]


@router.post(
    "/{docente_id}/comentarios",
    response_model=ComentarioResponse,
    status_code=201,
)
def crear_comentario(
    docente_id: int,
    request: Request,
    datos: ComentarioCreate,
    db: Session = Depends(get_db),
    usuario=Depends(_require_coord),
):
    """Crea un comentario sobre un docente.

    Solo el operador coordinador puede usar este endpoint.
    Los comentarios quedan vinculados al usuario que los crea
    y son de su exclusiva responsabilidad.
    """
    d = db.query(Docente).filter(Docente.id == docente_id).first()
    if not d:
        raise HTTPException(status_code=404, detail="Docente no encontrado.")

    tipo_valido = datos.tipo if datos.tipo in (
        "positivo", "negativo", "neutro"
    ) else "neutro"

    c = ComentarioDocente(
        docente_id=docente_id,
        tipo=TipoComentario(tipo_valido),
        contenido=datos.contenido.strip(),
        creado_por_id=usuario.id,
    )
    db.add(c)
    db.commit()
    db.refresh(c)
    registrar(
        db, "COMENTARIO_DOCENTE", usuario=usuario,
        entidad="docente", entidad_id=docente_id,
        detalle=f"{d.nombre} [{tipo_valido}]",
        ip=get_ip(request),
    )
    return ComentarioResponse(
        id=c.id,
        docente_id=c.docente_id,
        tipo=tipo_valido,
        contenido=c.contenido,
        creado_por_id=c.creado_por_id,
        creado_por_nombre=usuario.nombre,
        created_at=c.created_at,
    )
