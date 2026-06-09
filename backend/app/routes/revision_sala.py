from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload
from datetime import date
from typing import Optional
import datetime as dt

from app.database import get_db
from app.models.revision_sala import RevisionSala, RevisionSalaItem
from app.models.programacion_taller import ProgramacionTaller
from app.models.paquete_insumo import PaqueteInsumo, PaqueteItem
from app.models.activo_fijo import ActivoFijo
from app.models.taller import Taller
from app.models.usuario import Usuario
from app.schemas.revision_sala import (
    RevisionSalaCreate,
    RevisionSalaResponse,
    RevisionResumenResponse,
    RevisionItemUpdate,
)
from app.utils.deps import get_usuario_actual, require_operador

router = APIRouter(prefix="/revisiones", tags=["Revisiones"])


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _cargar_revision(rev_id: int, db: Session) -> RevisionSala:
    r = (
        db.query(RevisionSala)
        .options(
            joinedload(RevisionSala.sala),
            joinedload(RevisionSala.operador),
            joinedload(RevisionSala.items),
        )
        .filter(RevisionSala.id == rev_id)
        .first()
    )
    if not r:
        raise HTTPException(status_code=404, detail="Revision no encontrada")
    return r


def _to_response(r: RevisionSala) -> RevisionSalaResponse:
    return RevisionSalaResponse(
        id=r.id,
        programacion_id=r.programacion_id,
        sala_id=r.sala_id,
        sala_nombre=r.sala.nombre if r.sala else None,
        fecha=r.fecha,
        operador_id=r.operador_id,
        operador_nombre=r.operador.nombre if r.operador else None,
        estado=r.estado,
        hora_inicio_rev=r.hora_inicio_rev,
        hora_fin_rev=r.hora_fin_rev,
        notas=r.notas,
        items=list(r.items),
    )


def _to_resumen(r: RevisionSala) -> RevisionResumenResponse:
    return RevisionResumenResponse(
        id=r.id,
        programacion_id=r.programacion_id,
        sala_id=r.sala_id,
        sala_nombre=r.sala.nombre if r.sala else None,
        fecha=r.fecha,
        operador_id=r.operador_id,
        operador_nombre=r.operador.nombre if r.operador else None,
        estado=r.estado,
        hora_inicio_rev=r.hora_inicio_rev,
        hora_fin_rev=r.hora_fin_rev,
    )


def _hora_ahora() -> str:
    return dt.datetime.now().strftime("%H:%M")


def _generar_items(
    programacion: ProgramacionTaller,
    db: Session,
) -> list[RevisionSalaItem]:
    """Genera los items del checklist combinando dos fuentes:

    1. Paquete de insumos del taller para el semestre de la programacion.
    2. Activos fijos asignados a la sala.

    Los datos se copian en el momento para preservar trazabilidad
    historica aunque el paquete o los activos cambien despues.
    """
    items: list[RevisionSalaItem] = []

    # ── Fuente 1: paquete de insumos ──────────────────────────────────────
    paquete = (
        db.query(PaqueteInsumo)
        .options(joinedload(PaqueteInsumo.items).joinedload(PaqueteItem.insumo))
        .filter(
            PaqueteInsumo.taller_id == programacion.taller_id,
            PaqueteInsumo.semestre == programacion.semestre,
        )
        .first()
    )

    if paquete:
        for pi in paquete.items:
            if not pi.insumo:
                continue
            tipo = pi.insumo.tipo if hasattr(pi.insumo, 'tipo') else 'insumo'
            items.append(RevisionSalaItem(
                tipo=tipo,
                nombre=pi.insumo.nombre,
                cantidad_esperada=pi.cantidad_requerida,
            ))

    # ── Fuente 2: activos fijos de la sala ────────────────────────────────
    activos = (
        db.query(ActivoFijo)
        .filter(
            ActivoFijo.sala_id == programacion.sala_id,
            ActivoFijo.activo.is_(True),
            ActivoFijo.estado != 'dado_de_baja',
        )
        .all()
    )

    for af in activos:
        items.append(RevisionSalaItem(
            tipo='activo_fijo',
            nombre=af.nombre
            + (f' [{af.codigo_interno}]' if af.codigo_interno else ''),
            cantidad_esperada=None,  # activos no tienen cantidad
        ))

    return items


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("/hoy", response_model=list[RevisionResumenResponse])
def revisiones_hoy(
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(get_usuario_actual),
):
    """Retorna las revisiones del dia de hoy (sin items) para el mapa."""
    hoy = date.today()
    rows = (
        db.query(RevisionSala)
        .options(
            joinedload(RevisionSala.sala),
            joinedload(RevisionSala.operador),
        )
        .filter(RevisionSala.fecha == hoy)
        .all()
    )
    return [_to_resumen(r) for r in rows]


@router.get("/", response_model=list[RevisionResumenResponse])
def listar_revisiones(
    sala_id: Optional[int] = None,
    fecha: Optional[date] = None,
    operador_id: Optional[int] = None,
    estado: Optional[str] = None,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(get_usuario_actual),
):
    q = db.query(RevisionSala).options(
        joinedload(RevisionSala.sala),
        joinedload(RevisionSala.operador),
    )
    if sala_id:
        q = q.filter(RevisionSala.sala_id == sala_id)
    if fecha:
        q = q.filter(RevisionSala.fecha == fecha)
    if operador_id:
        q = q.filter(RevisionSala.operador_id == operador_id)
    if estado:
        q = q.filter(RevisionSala.estado == estado)
    rows = q.order_by(RevisionSala.fecha.desc()).offset(skip).limit(limit).all()
    return [_to_resumen(r) for r in rows]


@router.get("/{rev_id}", response_model=RevisionSalaResponse)
def obtener_revision(
    rev_id: int,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(get_usuario_actual),
):
    return _to_response(_cargar_revision(rev_id, db))


@router.post("/", response_model=RevisionSalaResponse, status_code=201)
def crear_revision(
    datos: RevisionSalaCreate,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(require_operador),
):
    """Crea una nueva revision para una programacion.

    Genera automaticamente los items del checklist combinando el
    paquete de insumos del taller y los activos fijos de la sala.
    Si ya existe una revision activa para esa programacion devuelve
    la existente en lugar de crear un duplicado.
    """
    prog = (
        db.query(ProgramacionTaller)
        .options(
            joinedload(ProgramacionTaller.taller),
            joinedload(ProgramacionTaller.sala),
        )
        .filter(ProgramacionTaller.id == datos.programacion_id)
        .first()
    )
    if not prog:
        raise HTTPException(
            status_code=404, detail="Programacion no encontrada"
        )

    # Idempotente: si ya existe retorna la existente
    existente = (
        db.query(RevisionSala)
        .filter(
            RevisionSala.programacion_id == datos.programacion_id,
            RevisionSala.estado != 'completada',
        )
        .first()
    )
    if existente:
        return _to_response(_cargar_revision(existente.id, db))

    revision = RevisionSala(
        programacion_id=datos.programacion_id,
        sala_id=prog.sala_id,
        fecha=prog.fecha,
        operador_id=usuario.id,
        estado='en_revision',
        hora_inicio_rev=_hora_ahora(),
        notas=datos.notas,
    )
    db.add(revision)
    db.flush()  # obtener revision.id antes de generar items

    items = _generar_items(prog, db)
    for item in items:
        item.revision_id = revision.id
        db.add(item)

    db.commit()
    return _to_response(_cargar_revision(revision.id, db))


@router.patch(
    "/{rev_id}/items/{item_id}",
    response_model=RevisionSalaResponse,
)
def actualizar_item(
    rev_id: int,
    item_id: int,
    datos: RevisionItemUpdate,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(require_operador),
):
    """Actualiza un item del checklist (cantidad encontrada + conforme)."""
    revision = _cargar_revision(rev_id, db)
    if revision.estado == 'completada':
        raise HTTPException(
            status_code=400,
            detail="La revision ya esta completada y no puede modificarse",
        )

    item = db.query(RevisionSalaItem).filter(
        RevisionSalaItem.id == item_id,
        RevisionSalaItem.revision_id == rev_id,
    ).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item no encontrado")

    for campo, valor in datos.model_dump(exclude_unset=True).items():
        setattr(item, campo, valor)

    db.commit()
    return _to_response(_cargar_revision(rev_id, db))


@router.post(
    "/{rev_id}/completar",
    response_model=RevisionSalaResponse,
)
def completar_revision(
    rev_id: int,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(require_operador),
):
    """Marca la revision como completada y registra la hora de cierre."""
    revision = _cargar_revision(rev_id, db)
    if revision.estado == 'completada':
        return _to_response(revision)
    revision.estado = 'completada'
    revision.hora_fin_rev = _hora_ahora()
    db.commit()
    return _to_response(_cargar_revision(rev_id, db))
