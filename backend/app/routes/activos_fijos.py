from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.activo_fijo import ActivoFijo, TipoActivo, EstadoActivo
from app.schemas.activo_fijo import (
    ActivoFijoCreate,
    ActivoFijoUpdate,
    ActivoFijoResponse,
)
from app.utils.deps import get_usuario_actual, require_operador, require_admin

router = APIRouter(prefix="/activos-fijos", tags=["activos-fijos"])


def _to_response(af: ActivoFijo) -> ActivoFijoResponse:
    """Serializa un ActivoFijo incluyendo el nombre de sala (lazy load)."""
    return ActivoFijoResponse(
        id=af.id,
        nombre=af.nombre,
        descripcion=af.descripcion,
        tipo=af.tipo,
        codigo_interno=af.codigo_interno,
        codigo_barras=af.codigo_barras,
        estado=af.estado,
        fidelidad=af.fidelidad,
        sala_id=af.sala_id,
        sala_nombre=af.sala.nombre if af.sala else None,
        notas=af.notas,
        activo=af.activo,
    )


# IMPORTANTE: rutas estaticas ANTES de /{activo_id}

@router.get("/sugerencias")
def sugerencias(
    q: str = Query("", min_length=0),
    db: Session = Depends(get_db),
    _=Depends(get_usuario_actual),
):
    """Autocompletado por nombre, codigo interno o codigo de barras."""
    if not q:
        return []
    filtro = f"%{q}%"
    resultados = (
        db.query(ActivoFijo)
        .filter(
            ActivoFijo.activo.is_(True),
            (
                ActivoFijo.nombre.ilike(filtro)
                | ActivoFijo.codigo_interno.ilike(filtro)
                | ActivoFijo.codigo_barras.ilike(filtro)
            ),
        )
        .limit(10)
        .all()
    )
    return [
        {
            "id": af.id,
            "nombre": af.nombre,
            "codigo_interno": af.codigo_interno,
            "tipo": af.tipo,
        }
        for af in resultados
    ]


@router.get("/", response_model=list[ActivoFijoResponse])
def listar(
    tipo: TipoActivo | None = Query(None),
    sala_id: int | None = Query(None),
    estado: EstadoActivo | None = Query(None),
    q: str | None = Query(None),
    incluir_inactivos: bool = Query(False),
    db: Session = Depends(get_db),
    _=Depends(get_usuario_actual),
):
    """Lista activos fijos con filtros opcionales."""
    query = db.query(ActivoFijo)
    if not incluir_inactivos:
        query = query.filter(ActivoFijo.activo.is_(True))
    if tipo:
        query = query.filter(ActivoFijo.tipo == tipo)
    if sala_id:
        query = query.filter(ActivoFijo.sala_id == sala_id)
    if estado:
        query = query.filter(ActivoFijo.estado == estado)
    if q:
        filtro = f"%{q}%"
        query = query.filter(
            ActivoFijo.nombre.ilike(filtro)
            | ActivoFijo.codigo_interno.ilike(filtro)
        )
    activos = query.order_by(ActivoFijo.nombre).all()
    return [_to_response(af) for af in activos]


@router.post("/", response_model=ActivoFijoResponse, status_code=201)
def crear(
    datos: ActivoFijoCreate,
    db: Session = Depends(get_db),
    _=Depends(require_operador),
):
    """Registra un nuevo activo fijo. Genera codigo_interno automaticamente."""
    if datos.codigo_barras:
        existente = (
            db.query(ActivoFijo)
            .filter(ActivoFijo.codigo_barras == datos.codigo_barras)
            .first()
        )
        if existente:
            raise HTTPException(
                status_code=400,
                detail="El codigo de barras ya esta registrado en otro activo",
            )

    af = ActivoFijo(**datos.model_dump())
    db.add(af)
    db.flush()  # necesario para obtener af.id antes del commit

    prefijo = "MUE" if af.tipo.value == "mueble" else "PHN"
    af.codigo_interno = f"{prefijo}-{af.id:05d}"

    db.commit()
    db.refresh(af)
    return _to_response(af)


@router.get("/{activo_id}", response_model=ActivoFijoResponse)
def obtener(
    activo_id: int,
    db: Session = Depends(get_db),
    _=Depends(get_usuario_actual),
):
    af = db.query(ActivoFijo).filter(ActivoFijo.id == activo_id).first()
    if not af:
        raise HTTPException(status_code=404, detail="Activo fijo no encontrado")
    return _to_response(af)


@router.put("/{activo_id}", response_model=ActivoFijoResponse)
def actualizar(
    activo_id: int,
    datos: ActivoFijoUpdate,
    db: Session = Depends(get_db),
    _=Depends(require_operador),
):
    af = db.query(ActivoFijo).filter(ActivoFijo.id == activo_id).first()
    if not af:
        raise HTTPException(status_code=404, detail="Activo fijo no encontrado")

    if datos.codigo_barras and datos.codigo_barras != af.codigo_barras:
        existente = (
            db.query(ActivoFijo)
            .filter(ActivoFijo.codigo_barras == datos.codigo_barras)
            .first()
        )
        if existente:
            raise HTTPException(
                status_code=400,
                detail="El codigo de barras ya esta registrado en otro activo",
            )

    for campo, valor in datos.model_dump(exclude_unset=True).items():
        setattr(af, campo, valor)

    db.commit()
    db.refresh(af)
    return _to_response(af)


@router.delete("/{activo_id}", status_code=204)
def eliminar(
    activo_id: int,
    db: Session = Depends(get_db),
    _=Depends(require_admin),
):
    """Soft-delete del activo. Solo admin."""
    af = db.query(ActivoFijo).filter(ActivoFijo.id == activo_id).first()
    if not af:
        raise HTTPException(status_code=404, detail="Activo fijo no encontrado")
    af.activo = False
    db.commit()
