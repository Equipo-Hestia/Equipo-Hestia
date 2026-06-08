import re
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload
from app.database import get_db
from app.models.unidad_implemento import UnidadImplemento, EstadoUnidad
from app.models.insumo import Insumo, TipoInsumo
from app.models.sala import Sala
from app.schemas.unidad_implemento import (
    UnidadImplementoCreate,
    UnidadImplementoGenerarLote,
    UnidadImplementoUpdate,
    UnidadImplementoResponse,
    GenerarLoteResponse,
)
from app.utils.deps import get_usuario_actual, require_operador, require_admin

router = APIRouter(prefix="/unidades-implemento", tags=["unidades-implemento"])

MAX_LOTE = 500  # tope de seguridad para generacion masiva


def _prefijo(nombre: str) -> str:
    """Genera un prefijo de 3 chars a partir del nombre del implemento.

    Elimina tildes y caracteres no alfanumericos, toma los 3 primeros en
    mayusculas y completa con 'X' si el nombre es muy corto.
    Ej: 'Oximetro' -> 'OXI', 'Fonendoscopio' -> 'FON', 'BP' -> 'BPX'
    """
    nombre_norm = (
        nombre.upper()
        .replace("\u00c1", "A").replace("\u00c9", "E").replace("\u00cd", "I")
        .replace("\u00d3", "O").replace("\u00da", "U").replace("\u00d1", "N")
    )
    solo_alfanum = re.sub(r"[^A-Z0-9]", "", nombre_norm)
    return solo_alfanum[:3].ljust(3, "X")


def _cargar(db: Session, unidad_id: int) -> UnidadImplemento:
    u = (
        db.query(UnidadImplemento)
        .options(
            joinedload(UnidadImplemento.implemento),
            joinedload(UnidadImplemento.sala),
        )
        .filter(UnidadImplemento.id == unidad_id)
        .first()
    )
    if not u:
        raise HTTPException(status_code=404, detail="Unidad no encontrada")
    return u


def _to_response(u: UnidadImplemento) -> UnidadImplementoResponse:
    return UnidadImplementoResponse(
        id=u.id,
        implemento_id=u.implemento_id,
        implemento_nombre=u.implemento.nombre if u.implemento else None,
        codigo=u.codigo,
        estado=u.estado,
        sala_id=u.sala_id,
        sala_nombre=u.sala.nombre if u.sala else None,
        notas=u.notas,
        activo=u.activo,
    )


# ---------------------------------------------------------------------------
# Rutas estaticas ANTES de /{unidad_id}
# ---------------------------------------------------------------------------

@router.get("/", response_model=list[UnidadImplementoResponse])
def listar(
    implemento_id: int | None = Query(None),
    sala_id: int | None = Query(None),
    estado: EstadoUnidad | None = Query(None),
    incluir_inactivas: bool = Query(False),
    db: Session = Depends(get_db),
    _=Depends(get_usuario_actual),
):
    """Lista unidades. Filtrable por implemento_id, sala_id y estado."""
    q = (
        db.query(UnidadImplemento)
        .options(
            joinedload(UnidadImplemento.implemento),
            joinedload(UnidadImplemento.sala),
        )
    )
    if not incluir_inactivas:
        q = q.filter(UnidadImplemento.activo.is_(True))
    if implemento_id:
        q = q.filter(UnidadImplemento.implemento_id == implemento_id)
    if sala_id is not None:
        q = q.filter(UnidadImplemento.sala_id == sala_id)
    if estado:
        q = q.filter(UnidadImplemento.estado == estado)
    return [
        _to_response(u)
        for u in q.order_by(UnidadImplemento.codigo).all()
    ]


@router.post(
    "/generar-lote",
    response_model=GenerarLoteResponse,
    status_code=201,
)
def generar_lote(
    datos: UnidadImplementoGenerarLote,
    db: Session = Depends(get_db),
    _=Depends(require_operador),
):
    """Crea N unidades en Bodega (sala_id=NULL) para un implemento.

    Util para sincronizar unidades fisicas con el stock_actual cuando
    hay menos unidades registradas que stock. Tope: MAX_LOTE unidades
    por llamada para evitar timeouts.
    """
    if datos.cantidad < 1 or datos.cantidad > MAX_LOTE:
        raise HTTPException(
            status_code=422,
            detail=f"La cantidad debe estar entre 1 y {MAX_LOTE}.",
        )

    implemento = db.query(Insumo).filter(Insumo.id == datos.implemento_id).first()
    if not implemento:
        raise HTTPException(status_code=404, detail="Implemento no encontrado")
    if implemento.tipo != TipoInsumo.implemento:
        raise HTTPException(
            status_code=400,
            detail="Solo se pueden generar unidades para insumos de tipo implemento.",
        )

    prefijo = _prefijo(implemento.nombre)
    creadas = []
    for _ in range(datos.cantidad):
        u = UnidadImplemento(
            implemento_id=datos.implemento_id,
            sala_id=None,
            notas=None,
        )
        db.add(u)
        db.flush()
        u.codigo = f"{prefijo}-{u.id:05d}"
        creadas.append(u.id)

    db.commit()
    return GenerarLoteResponse(
        creadas=len(creadas),
        codigos_generados=[
            f"{prefijo}-{uid:05d}" for uid in creadas
        ],
    )


@router.post("/", response_model=UnidadImplementoResponse, status_code=201)
def crear(
    datos: UnidadImplementoCreate,
    db: Session = Depends(get_db),
    _=Depends(require_operador),
):
    """Registra una nueva unidad fisica de un implemento.

    Solo se puede crear sobre insumos de tipo=implemento.
    sala_id=NULL significa que la unidad esta en Bodega.
    El codigo se genera automaticamente: prefijo 3 chars + id con padding.
    """
    implemento = db.query(Insumo).filter(Insumo.id == datos.implemento_id).first()
    if not implemento:
        raise HTTPException(status_code=404, detail="Implemento no encontrado")
    if implemento.tipo != TipoInsumo.implemento:
        raise HTTPException(
            status_code=400,
            detail=(
                f"'{implemento.nombre}' es de tipo insumo, no implemento. "
                "Solo se pueden registrar unidades para implementos."
            ),
        )

    if datos.sala_id is not None:
        sala = db.query(Sala).filter(Sala.id == datos.sala_id).first()
        if not sala:
            raise HTTPException(status_code=404, detail="Sala no encontrada")

    unidad = UnidadImplemento(
        implemento_id=datos.implemento_id,
        sala_id=datos.sala_id,
        notas=datos.notas,
    )
    db.add(unidad)
    db.flush()

    prefijo = _prefijo(implemento.nombre)
    unidad.codigo = f"{prefijo}-{unidad.id:05d}"

    db.commit()
    return _to_response(_cargar(db, unidad.id))


@router.get("/{unidad_id}", response_model=UnidadImplementoResponse)
def obtener(
    unidad_id: int,
    db: Session = Depends(get_db),
    _=Depends(get_usuario_actual),
):
    return _to_response(_cargar(db, unidad_id))


@router.put("/{unidad_id}", response_model=UnidadImplementoResponse)
def actualizar(
    unidad_id: int,
    datos: UnidadImplementoUpdate,
    db: Session = Depends(get_db),
    _=Depends(require_operador),
):
    """Actualiza estado, sala y notas de una unidad.

    El campo sala_id solo deberia ser modificado por el sistema
    (flujo de retiro) o por un administrador de forma excepcional.
    Para mover una unidad de Bodega a una sala: sala_id=<id_sala>.
    Para devolverla a Bodega: sala_id=null.
    """
    u = _cargar(db, unidad_id)

    if datos.sala_id is not None:
        sala = db.query(Sala).filter(Sala.id == datos.sala_id).first()
        if not sala:
            raise HTTPException(status_code=404, detail="Sala no encontrada")

    for campo, valor in datos.model_dump(exclude_unset=True).items():
        setattr(u, campo, valor)
    db.commit()
    return _to_response(_cargar(db, unidad_id))


@router.delete("/{unidad_id}", status_code=204)
def eliminar(
    unidad_id: int,
    db: Session = Depends(get_db),
    _=Depends(require_admin),
):
    """Soft-delete. Solo admin."""
    u = db.query(UnidadImplemento).filter(UnidadImplemento.id == unidad_id).first()
    if not u:
        raise HTTPException(status_code=404, detail="Unidad no encontrada")
    u.activo = False
    db.commit()
