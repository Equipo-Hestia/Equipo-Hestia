import re
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.unidad_implemento import UnidadImplemento, EstadoUnidad
from app.models.insumo import Insumo, TipoInsumo
from app.schemas.unidad_implemento import (
    UnidadImplementoCreate,
    UnidadImplementoUpdate,
    UnidadImplementoResponse,
)
from app.utils.deps import get_usuario_actual, require_operador, require_admin

router = APIRouter(prefix="/unidades-implemento", tags=["unidades-implemento"])


def _prefijo(nombre: str) -> str:
    """Genera un prefijo de 3 chars a partir del nombre del implemento.

    Elimina tildes y caracteres no alfanumericos, toma los 3 primeros en
    mayusculas y completa con 'X' si el nombre es muy corto.
    Ej: 'Oximetro' → 'OXI', 'Fonendoscopio' → 'FON', 'BP' → 'BPX'
    """
    # Normalizar tildes basicas antes de limpiar
    nombre_norm = (
        nombre.upper()
        .replace("Á", "A").replace("É", "E").replace("Í", "I")
        .replace("Ó", "O").replace("Ú", "U").replace("Ñ", "N")
    )
    solo_alfanum = re.sub(r"[^A-Z0-9]", "", nombre_norm)
    return solo_alfanum[:3].ljust(3, "X")


def _to_response(u: UnidadImplemento) -> UnidadImplementoResponse:
    return UnidadImplementoResponse(
        id=u.id,
        implemento_id=u.implemento_id,
        implemento_nombre=u.implemento.nombre if u.implemento else None,
        codigo=u.codigo,
        estado=u.estado,
        notas=u.notas,
        activo=u.activo,
    )


# Rutas estaticas ANTES de /{unidad_id}

@router.get("/", response_model=list[UnidadImplementoResponse])
def listar(
    implemento_id: int | None = Query(None),
    estado: EstadoUnidad | None = Query(None),
    incluir_inactivas: bool = Query(False),
    db: Session = Depends(get_db),
    _=Depends(get_usuario_actual),
):
    """Lista unidades. Filtrable por implemento_id y estado."""
    q = db.query(UnidadImplemento)
    if not incluir_inactivas:
        q = q.filter(UnidadImplemento.activo.is_(True))
    if implemento_id:
        q = q.filter(UnidadImplemento.implemento_id == implemento_id)
    if estado:
        q = q.filter(UnidadImplemento.estado == estado)
    return [_to_response(u) for u in q.order_by(UnidadImplemento.codigo).all()]


@router.post("/", response_model=UnidadImplementoResponse, status_code=201)
def crear(
    datos: UnidadImplementoCreate,
    db: Session = Depends(get_db),
    _=Depends(require_operador),
):
    """Registra una nueva unidad fisica de un implemento.

    Solo se puede crear sobre insumos de tipo=implemento.
    El codigo se genera automaticamente: prefijo 3 chars + id con padding.
    """
    implemento = db.query(Insumo).filter(Insumo.id == datos.implemento_id).first()
    if not implemento:
        raise HTTPException(status_code=404, detail="Implemento no encontrado")
    if implemento.tipo != TipoInsumo.implemento:
        raise HTTPException(
            status_code=400,
            detail=f"'{implemento.nombre}' es de tipo insumo, no implemento. "
                   "Solo se pueden registrar unidades para implementos.",
        )

    unidad = UnidadImplemento(
        implemento_id=datos.implemento_id,
        notas=datos.notas,
    )
    db.add(unidad)
    db.flush()  # obtener id para generar codigo

    prefijo = _prefijo(implemento.nombre)
    unidad.codigo = f"{prefijo}-{unidad.id:05d}"

    db.commit()
    db.refresh(unidad)
    return _to_response(unidad)


@router.get("/{unidad_id}", response_model=UnidadImplementoResponse)
def obtener(
    unidad_id: int,
    db: Session = Depends(get_db),
    _=Depends(get_usuario_actual),
):
    u = db.query(UnidadImplemento).filter(UnidadImplemento.id == unidad_id).first()
    if not u:
        raise HTTPException(status_code=404, detail="Unidad no encontrada")
    return _to_response(u)


@router.put("/{unidad_id}", response_model=UnidadImplementoResponse)
def actualizar(
    unidad_id: int,
    datos: UnidadImplementoUpdate,
    db: Session = Depends(get_db),
    _=Depends(require_operador),
):
    u = db.query(UnidadImplemento).filter(UnidadImplemento.id == unidad_id).first()
    if not u:
        raise HTTPException(status_code=404, detail="Unidad no encontrada")
    for campo, valor in datos.model_dump(exclude_unset=True).items():
        setattr(u, campo, valor)
    db.commit()
    db.refresh(u)
    return _to_response(u)


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
