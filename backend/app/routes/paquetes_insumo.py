from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session, joinedload
from typing import Optional

from app.database import get_db
from app.models.paquete_insumo import PaqueteInsumo, PaqueteItem
from app.models.taller import Taller
from app.models.insumo import Insumo, TipoInsumo
from app.models.movimiento import Movimiento, TipoMovimiento, SubtipoMovimiento
from app.schemas.paquete_insumo import (
    PaqueteCreate, PaqueteUpdate, PaqueteResponse, PaqueteItemResponse,
    PaqueteItemCreate, ChecklistItemResponse, ChecklistResponse,
    ConfirmarPreparacionCreate, ConfirmarPreparacionResponse,
)
from app.utils.deps import get_usuario_actual, require_operador
from app.utils.auditoria import registrar, get_ip
from app.models.usuario import Usuario

router = APIRouter(prefix="/paquetes", tags=["Paquetes de insumos"])


def _cargar_paquete(db: Session, paquete_id: int) -> PaqueteInsumo:
    p = (
        db.query(PaqueteInsumo)
        .options(
            joinedload(PaqueteInsumo.taller),
            joinedload(PaqueteInsumo.creado_por),
            joinedload(PaqueteInsumo.items).joinedload(PaqueteItem.insumo),
        )
        .filter(PaqueteInsumo.id == paquete_id)
        .first()
    )
    if not p:
        raise HTTPException(status_code=404, detail="Paquete no encontrado")
    return p


def _construir_response(p: PaqueteInsumo) -> PaqueteResponse:
    items_resp = [
        PaqueteItemResponse(
            id=item.id,
            insumo_id=item.insumo_id,
            insumo_nombre=item.insumo.nombre if item.insumo else "Desconocido",
            insumo_tipo=item.insumo.tipo.value if item.insumo else "",
            insumo_unidad_medida=(
                item.insumo.unidad_medida if item.insumo else None
            ),
            insumo_costo_unitario=(
                item.insumo.costo_unitario if item.insumo else None
            ),
            cantidad_requerida=item.cantidad_requerida,
            notas=item.notas,
        )
        for item in p.items
    ]
    return PaqueteResponse(
        id=p.id,
        taller_id=p.taller_id,
        taller_nombre=p.taller.nombre if p.taller else "Desconocido",
        semestre=p.semestre,
        bloqueado=p.bloqueado,
        notas=p.notas,
        fecha_creacion=p.fecha_creacion,
        creado_por_nombre=p.creado_por.nombre if p.creado_por else None,
        items=items_resp,
    )


# ---------------------------------------------------------------------------
# Rutas estaticas ANTES de /{paquete_id}
# ---------------------------------------------------------------------------

@router.get("/", response_model=list[PaqueteResponse])
def listar_paquetes(
    taller_id: Optional[int] = None,
    semestre: Optional[str] = None,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(get_usuario_actual),
):
    """Lista paquetes. Filtrable por taller y/o semestre."""
    q = db.query(PaqueteInsumo).options(
        joinedload(PaqueteInsumo.taller),
        joinedload(PaqueteInsumo.creado_por),
        joinedload(PaqueteInsumo.items).joinedload(PaqueteItem.insumo),
    )
    if taller_id is not None:
        q = q.filter(PaqueteInsumo.taller_id == taller_id)
    if semestre is not None:
        q = q.filter(PaqueteInsumo.semestre == semestre)
    return [_construir_response(p) for p in q.all()]


# ---------------------------------------------------------------------------
# Checklist — GET estatico antes de /{paquete_id}
# ---------------------------------------------------------------------------

@router.get("/{paquete_id}/checklist", response_model=ChecklistResponse)
def obtener_checklist(
    paquete_id: int,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(get_usuario_actual),
):
    """Devuelve los items del paquete enriquecidos con stock_actual.

    Destinado a la vista 'Preparar taller' de la operadora. Cada item
    incluye el stock actual del insumo para contrastar con la cantidad
    requerida por la Guia de Taller sin llamadas adicionales.
    """
    p = _cargar_paquete(db, paquete_id)
    items = [
        ChecklistItemResponse(
            item_id=item.id,
            insumo_id=item.insumo_id,
            insumo_nombre=item.insumo.nombre if item.insumo else "Desconocido",
            insumo_tipo=(
                item.insumo.tipo.value if item.insumo else "insumo"
            ),
            cantidad_requerida=item.cantidad_requerida,
            stock_actual=(
                item.insumo.stock_actual if item.insumo else 0
            ),
            notas_guia=item.notas,
        )
        for item in p.items
    ]
    return ChecklistResponse(
        paquete_id=p.id,
        taller_nombre=p.taller.nombre if p.taller else "Desconocido",
        semestre=p.semestre,
        bloqueado=p.bloqueado,
        items=items,
    )


# ---------------------------------------------------------------------------
# Confirmar preparacion — POST estatico antes de /{paquete_id}
# ---------------------------------------------------------------------------

@router.post(
    "/{paquete_id}/confirmar-preparacion",
    response_model=ConfirmarPreparacionResponse,
    status_code=status.HTTP_200_OK,
)
def confirmar_preparacion(
    paquete_id: int,
    request: Request,
    datos: ConfirmarPreparacionCreate,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(require_operador),
):
    """Registra los retiros de bodega al confirmar 'Sala lista'.

    Solo genera movimientos para los items marcados como faltantes
    (los que NO estaban en sala y la operadora fue a buscar a bodega).
    Los items marcados OK no generan movimiento: ya estaban en sala y
    Hestia no los toco.

    Logica de stock:
    - Insumo desechable -> subtipo consumo_taller  (reduce stock)
    - Implemento        -> subtipo prestamo_implemento (reduce stock)

    Si un item tiene stock insuficiente se omite el movimiento y se
    incluye en items_sin_stock del response para que la operadora lo
    vea. No se hace rollback total: se procesan los que tienen stock.
    """
    p = _cargar_paquete(db, paquete_id)

    movimientos_generados = 0
    items_sin_stock: list[str] = []

    motivo_base = (
        f"Preparacion taller: {p.taller.nombre if p.taller else ''} "
        f"\u2014 semestre {p.semestre}"
    )
    if datos.notas:
        motivo_base += f" \u2014 {datos.notas}"

    for faltante in datos.faltantes:
        # Bloquear fila para evitar race condition con otros retiros
        insumo = (
            db.query(Insumo)
            .filter(
                Insumo.id == faltante.insumo_id,
                Insumo.activo.is_(True),
            )
            .with_for_update()
            .first()
        )
        if not insumo:
            continue

        if insumo.stock_actual < faltante.cantidad:
            items_sin_stock.append(
                f"{insumo.nombre} "
                f"(solicitado: {faltante.cantidad}, "
                f"disponible: {insumo.stock_actual})"
            )
            continue

        subtipo = (
            SubtipoMovimiento.prestamo_implemento
            if insumo.tipo == TipoInsumo.implemento
            else SubtipoMovimiento.consumo_taller
        )

        insumo.stock_actual -= faltante.cantidad
        db.add(Movimiento(
            tipo=TipoMovimiento.salida,
            subtipo=subtipo,
            cantidad=faltante.cantidad,
            insumo_id=insumo.id,
            usuario_id=usuario.id,
            paquete_id=paquete_id,
            sala_id=datos.sala_id,
            motivo=motivo_base,
        ))
        movimientos_generados += 1

    db.commit()

    registrar(
        db,
        "CONFIRMAR_PREPARACION_TALLER",
        usuario=usuario,
        entidad="paquete_insumo",
        entidad_id=paquete_id,
        detalle=(
            f"{movimientos_generados} retiro(s) \u2014 "
            f"{p.taller.nombre if p.taller else ''} {p.semestre}"
            + (f" \u2014 sin stock: {len(items_sin_stock)}" if items_sin_stock else "")
        ),
        ip=get_ip(request),
    )

    if movimientos_generados == 0 and not datos.faltantes:
        mensaje = "Sala lista confirmada. No hubo retiros de bodega."
    elif items_sin_stock:
        mensaje = (
            f"{movimientos_generados} retiro(s) registrado(s). "
            f"{len(items_sin_stock)} item(s) omitido(s) por stock insuficiente."
        )
    else:
        mensaje = (
            f"Sala lista confirmada. "
            f"{movimientos_generados} retiro(s) registrado(s) desde bodega."
        )

    return ConfirmarPreparacionResponse(
        mensaje=mensaje,
        movimientos_generados=movimientos_generados,
        items_sin_stock=items_sin_stock,
    )


@router.get("/{paquete_id}", response_model=PaqueteResponse)
def obtener_paquete(
    paquete_id: int,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(get_usuario_actual),
):
    return _construir_response(_cargar_paquete(db, paquete_id))


@router.post("/", response_model=PaqueteResponse, status_code=status.HTTP_201_CREATED)
def crear_paquete(
    datos: PaqueteCreate,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(require_operador),
):
    """Crea un paquete de insumos (Guia de Taller) para un semestre.

    No puede haber dos paquetes para el mismo taller y semestre.
    """
    taller = db.query(Taller).filter(
        Taller.id == datos.taller_id, Taller.activo.is_(True)
    ).first()
    if not taller:
        raise HTTPException(status_code=404, detail="Taller no encontrado o inactivo")

    existente = db.query(PaqueteInsumo).filter(
        PaqueteInsumo.taller_id == datos.taller_id,
        PaqueteInsumo.semestre == datos.semestre,
    ).first()
    if existente:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"Ya existe un paquete para el taller '{taller.nombre}' "
                f"en el semestre {datos.semestre}."
            ),
        )

    for item_data in datos.items:
        insumo = db.query(Insumo).filter(
            Insumo.id == item_data.insumo_id, Insumo.activo.is_(True)
        ).first()
        if not insumo:
            raise HTTPException(
                status_code=404,
                detail=f"Insumo con id {item_data.insumo_id} no encontrado o inactivo.",
            )

    paquete = PaqueteInsumo(
        taller_id=datos.taller_id,
        semestre=datos.semestre,
        creado_por_id=usuario.id,
        notas=datos.notas,
    )
    db.add(paquete)
    db.flush()

    for item_data in datos.items:
        db.add(PaqueteItem(
            paquete_id=paquete.id,
            insumo_id=item_data.insumo_id,
            cantidad_requerida=item_data.cantidad_requerida,
            notas=item_data.notas,
        ))

    db.commit()
    return _construir_response(_cargar_paquete(db, paquete.id))


@router.put("/{paquete_id}", response_model=PaqueteResponse)
def actualizar_paquete(
    paquete_id: int,
    datos: PaqueteUpdate,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(require_operador),
):
    """Actualiza notas y estado de bloqueo de un paquete.

    Cuando el paquete esta bloqueado, solo se permite cambiar el campo
    'bloqueado' (desbloquear). Modificar 'notas' con el paquete bloqueado
    sigue siendo rechazado con 409.
    """
    p = _cargar_paquete(db, paquete_id)

    # Determinar si el unico cambio solicitado es desbloquear el paquete.
    # En ese caso se permite aunque este bloqueado (es la accion inversa).
    solo_desbloqueo = (
        datos.bloqueado is not None
        and not datos.bloqueado
        and datos.notas is None
    )

    if p.bloqueado and not solo_desbloqueo:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="El paquete esta bloqueado y no puede modificarse.",
        )

    if datos.notas is not None:
        p.notas = datos.notas
    if datos.bloqueado is not None:
        p.bloqueado = datos.bloqueado
    db.commit()
    return _construir_response(_cargar_paquete(db, paquete_id))


# ---------------------------------------------------------------------------
# Gestion de items dentro de un paquete
# ---------------------------------------------------------------------------

@router.post(
    "/{paquete_id}/items",
    response_model=PaqueteResponse,
    status_code=status.HTTP_201_CREATED,
)
def agregar_item(
    paquete_id: int,
    datos: PaqueteItemCreate,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(require_operador),
):
    """Agrega un insumo al paquete.

    Si el insumo ya existe en el paquete, actualiza la cantidad.
    """
    p = _cargar_paquete(db, paquete_id)
    if p.bloqueado:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="El paquete esta bloqueado y no puede modificarse.",
        )

    insumo = db.query(Insumo).filter(
        Insumo.id == datos.insumo_id, Insumo.activo.is_(True)
    ).first()
    if not insumo:
        raise HTTPException(
            status_code=404,
            detail=f"Insumo con id {datos.insumo_id} no encontrado o inactivo.",
        )

    item_existente = next(
        (i for i in p.items if i.insumo_id == datos.insumo_id), None
    )
    if item_existente:
        item_existente.cantidad_requerida = datos.cantidad_requerida
        if datos.notas is not None:
            item_existente.notas = datos.notas
    else:
        db.add(PaqueteItem(
            paquete_id=paquete_id,
            insumo_id=datos.insumo_id,
            cantidad_requerida=datos.cantidad_requerida,
            notas=datos.notas,
        ))

    db.commit()
    return _construir_response(_cargar_paquete(db, paquete_id))


@router.delete(
    "/{paquete_id}/items/{item_id}",
    response_model=PaqueteResponse,
)
def eliminar_item(
    paquete_id: int,
    item_id: int,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(require_operador),
):
    """Elimina un item del paquete. No permitido si el paquete esta bloqueado."""
    p = _cargar_paquete(db, paquete_id)
    if p.bloqueado:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="El paquete esta bloqueado y no puede modificarse.",
        )
    item = db.query(PaqueteItem).filter(
        PaqueteItem.id == item_id,
        PaqueteItem.paquete_id == paquete_id,
    ).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item no encontrado")
    db.delete(item)
    db.commit()
    return _construir_response(_cargar_paquete(db, paquete_id))
