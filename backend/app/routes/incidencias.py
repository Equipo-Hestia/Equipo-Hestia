from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session, joinedload
from app.database import get_db
from app.models.incidencia import Incidencia, EstadoIncidencia, SeveridadIncidencia
from app.models.activo_fijo import ActivoFijo
from app.models.programacion_taller import ProgramacionTaller
from app.schemas.incidencia import IncidenciaCreate, IncidenciaUpdate, IncidenciaResponse
from app.utils.deps import get_usuario_actual, require_operador, require_admin
from app.utils.auditoria import registrar, get_ip

router = APIRouter(prefix="/incidencias", tags=["incidencias"])


def _cargar(db: Session, incidencia_id: int) -> Incidencia:
    inc = (
        db.query(Incidencia)
        .options(
            joinedload(Incidencia.activo_fijo),
            joinedload(Incidencia.sala),
        )
        .filter(Incidencia.id == incidencia_id)
        .first()
    )
    if not inc:
        raise HTTPException(status_code=404, detail="Incidencia no encontrada")
    return inc


def _to_response(inc: Incidencia) -> IncidenciaResponse:
    return IncidenciaResponse(
        id=inc.id,
        activo_fijo_id=inc.activo_fijo_id,
        activo_fijo_nombre=inc.activo_fijo.nombre if inc.activo_fijo else None,
        activo_fijo_codigo=inc.activo_fijo.codigo_interno if inc.activo_fijo else None,
        tipo=inc.tipo,
        descripcion=inc.descripcion,
        sala_id=inc.sala_id,
        sala_nombre=inc.sala.nombre if inc.sala else None,
        fecha_hora=inc.fecha_hora,
        responsable_nombre=inc.responsable_nombre,
        severidad=inc.severidad,
        estado=inc.estado,
        foto_b64=inc.foto_b64,
        activo=inc.activo,
    )


# IMPORTANTE: rutas estaticas ANTES de /{incidencia_id}

@router.get("/docente-sugerido")
def docente_sugerido(
    sala_id: int = Query(...),
    fecha: str = Query(...),
    db: Session = Depends(get_db),
    _=Depends(get_usuario_actual),
):
    """Devuelve el docente_nombre de la ProgramacionTaller mas proxima
    a la fecha dada en la sala indicada. Retorna null si no hay match."""
    try:
        fecha_date = datetime.strptime(fecha, "%Y-%m-%d").date()
    except ValueError:
        return {"docente_nombre": None}

    prog = (
        db.query(ProgramacionTaller)
        .filter(
            ProgramacionTaller.sala_id == sala_id,
            ProgramacionTaller.fecha == fecha_date,
            ProgramacionTaller.activo.is_(True),
        )
        .order_by(ProgramacionTaller.hora_inicio)
        .first()
    )
    return {"docente_nombre": prog.docente_nombre if prog else None}


@router.get("/", response_model=list[IncidenciaResponse])
def listar(
    activo_fijo_id: int | None = Query(None),
    sala_id: int | None = Query(None),
    estado: EstadoIncidencia | None = Query(None),
    severidad: SeveridadIncidencia | None = Query(None),
    incluir_inactivos: bool = Query(False),
    db: Session = Depends(get_db),
    _=Depends(get_usuario_actual),
):
    query = (
        db.query(Incidencia)
        .options(
            joinedload(Incidencia.activo_fijo),
            joinedload(Incidencia.sala),
        )
    )
    if not incluir_inactivos:
        query = query.filter(Incidencia.activo.is_(True))
    if activo_fijo_id:
        query = query.filter(Incidencia.activo_fijo_id == activo_fijo_id)
    if sala_id:
        query = query.filter(Incidencia.sala_id == sala_id)
    if estado:
        query = query.filter(Incidencia.estado == estado)
    if severidad:
        query = query.filter(Incidencia.severidad == severidad)
    incidencias = query.order_by(Incidencia.fecha_hora.desc()).all()
    return [_to_response(i) for i in incidencias]


@router.post("/", response_model=IncidenciaResponse, status_code=201)
def crear(
    request: Request,
    datos: IncidenciaCreate,
    db: Session = Depends(get_db),
    usuario=Depends(require_operador),
):
    af = db.query(ActivoFijo).filter(ActivoFijo.id == datos.activo_fijo_id).first()
    if not af:
        raise HTTPException(status_code=404, detail="Activo fijo no encontrado")

    datos_dict = datos.model_dump()
    if datos_dict.get("fecha_hora") is None:
        datos_dict["fecha_hora"] = datetime.now(timezone.utc)

    inc = Incidencia(**datos_dict)
    db.add(inc)
    db.commit()
    db.refresh(inc)

    registrar(
        db, "CREAR_INCIDENCIA", usuario=usuario,
        entidad="incidencia", entidad_id=inc.id,
        detalle=f"{af.nombre} [{af.codigo_interno}] - {inc.tipo.value}",
        ip=get_ip(request),
    )
    return _to_response(_cargar(db, inc.id))


@router.get("/{incidencia_id}", response_model=IncidenciaResponse)
def obtener(
    incidencia_id: int,
    db: Session = Depends(get_db),
    _=Depends(get_usuario_actual),
):
    return _to_response(_cargar(db, incidencia_id))


@router.patch("/{incidencia_id}", response_model=IncidenciaResponse)
def actualizar(
    incidencia_id: int,
    request: Request,
    datos: IncidenciaUpdate,
    db: Session = Depends(get_db),
    usuario=Depends(require_operador),
):
    inc = _cargar(db, incidencia_id)

    for campo, valor in datos.model_dump(exclude_unset=True).items():
        setattr(inc, campo, valor)

    db.commit()
    registrar(
        db, "EDITAR_INCIDENCIA", usuario=usuario,
        entidad="incidencia", entidad_id=inc.id,
        detalle=f"id={inc.id} estado={inc.estado.value}",
        ip=get_ip(request),
    )
    return _to_response(_cargar(db, incidencia_id))


@router.delete("/{incidencia_id}", status_code=204)
def eliminar(
    incidencia_id: int,
    request: Request,
    db: Session = Depends(get_db),
    usuario=Depends(require_admin),
):
    inc = db.query(Incidencia).filter(Incidencia.id == incidencia_id).first()
    if not inc:
        raise HTTPException(status_code=404, detail="Incidencia no encontrada")
    inc.activo = False
    db.commit()
    registrar(
        db, "ELIMINAR_INCIDENCIA", usuario=usuario,
        entidad="incidencia", entidad_id=inc.id,
        detalle=f"id={inc.id}",
        ip=get_ip(request),
    )
