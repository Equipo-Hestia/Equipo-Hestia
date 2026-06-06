from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import desc
from typing import Optional

from app.database import get_db
from app.models.orden_mantenimiento import (
    OrdenMantenimiento, OrdenMantenimientoItem,
    EstadoOrden, ResultadoItem,
)
from app.models.activo_fijo import ActivoFijo, EstadoActivo
from app.models.proveedor import Proveedor
from app.models.usuario import Usuario
from app.schemas.orden_mantenimiento import (
    OrdenMantenimientoCreate,
    OrdenMantenimientoUpdate,
    OrdenMantenimientoResponse,
    OrdenItemResponse,
    OrdenItemUpdate,
)
from app.schemas.comun import PaginatedResponse
from app.utils.deps import get_usuario_actual, require_operador
from app.utils.auditoria import registrar, get_ip

router = APIRouter(
    prefix="/ordenes-mantenimiento", tags=["Mantenimiento"]
)


# ── Helpers ──────────────────────────────────────────────────────────────────

def _load_orden(orden_id: int, db: Session) -> OrdenMantenimiento:
    orden = (
        db.query(OrdenMantenimiento)
        .options(
            joinedload(OrdenMantenimiento.proveedor),
            joinedload(OrdenMantenimiento.creado_por),
            joinedload(OrdenMantenimiento.items).joinedload(
                OrdenMantenimientoItem.activo_fijo
            ),
        )
        .filter(OrdenMantenimiento.id == orden_id)
        .first()
    )
    if not orden:
        raise HTTPException(status_code=404, detail="Orden no encontrada")
    return orden


def _item_response(item: OrdenMantenimientoItem) -> OrdenItemResponse:
    af = item.activo_fijo
    return OrdenItemResponse(
        id=item.id,
        activo_fijo_id=item.activo_fijo_id,
        activo_fijo_nombre=af.nombre if af else "Desconocido",
        activo_fijo_codigo=af.codigo_interno if af else None,
        resultado=item.resultado,
        fecha_envio=item.fecha_envio,
        fecha_retorno_estimada=item.fecha_retorno_estimada,
        fecha_retorno=item.fecha_retorno,
        descripcion_problema=item.descripcion_problema,
        descripcion_trabajo=item.descripcion_trabajo,
        costo=float(item.costo) if item.costo is not None else None,
    )


def _orden_response(o: OrdenMantenimiento) -> OrdenMantenimientoResponse:
    return OrdenMantenimientoResponse(
        id=o.id,
        proveedor_id=o.proveedor_id,
        proveedor_nombre=o.proveedor.nombre if o.proveedor else None,
        creado_por_id=o.creado_por_id,
        creado_por_nombre=o.creado_por.nombre if o.creado_por else None,
        estado=o.estado,
        fecha_visita=o.fecha_visita,
        notas=o.notas,
        activo=o.activo,
        items=[_item_response(i) for i in o.items],
    )


# ── Endpoints ────────────────────────────────────────────────────────────────

@router.get("/", response_model=PaginatedResponse[OrdenMantenimientoResponse])
def listar_ordenes(
    skip: int = 0,
    limit: int = 20,
    proveedor_id: Optional[int] = None,
    estado: Optional[EstadoOrden] = None,
    incluir_inactivas: bool = False,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(get_usuario_actual),
):
    q = (
        db.query(OrdenMantenimiento)
        .options(
            joinedload(OrdenMantenimiento.proveedor),
            joinedload(OrdenMantenimiento.creado_por),
            joinedload(OrdenMantenimiento.items).joinedload(
                OrdenMantenimientoItem.activo_fijo
            ),
        )
        .order_by(desc(OrdenMantenimiento.fecha_visita))
    )
    if not incluir_inactivas:
        q = q.filter(OrdenMantenimiento.activo.is_(True))
    if proveedor_id:
        q = q.filter(OrdenMantenimiento.proveedor_id == proveedor_id)
    if estado:
        q = q.filter(OrdenMantenimiento.estado == estado)
    total = q.count()
    return {
        "total": total, "skip": skip, "limit": limit,
        "data": [_orden_response(o) for o in q.offset(skip).limit(limit).all()],
    }


@router.get("/{orden_id}", response_model=OrdenMantenimientoResponse)
def obtener_orden(
    orden_id: int,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(get_usuario_actual),
):
    return _orden_response(_load_orden(orden_id, db))


@router.post("/", response_model=OrdenMantenimientoResponse, status_code=201)
def crear_orden(
    request: Request,
    datos: OrdenMantenimientoCreate,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(require_operador),
):
    """Abre una visita de mantenimiento para N Phantomas.

    Todos los Phantomas de la lista se marcan con estado en_mantenimiento.
    Cada uno genera un OrdenMantenimientoItem con resultado=pendiente.
    """
    if datos.proveedor_id:
        prov = db.query(Proveedor).filter(
            Proveedor.id == datos.proveedor_id,
            Proveedor.activo.is_(True),
        ).first()
        if not prov:
            raise HTTPException(status_code=404, detail="Proveedor no encontrado")

    activos = []
    for af_id in datos.activo_ids:
        af = db.query(ActivoFijo).filter(
            ActivoFijo.id == af_id,
            ActivoFijo.activo.is_(True),
        ).first()
        if not af:
            raise HTTPException(
                status_code=404,
                detail=f"Activo fijo id={af_id} no encontrado",
            )
        if af.estado == EstadoActivo.en_mantenimiento:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"'{af.nombre}' ya tiene una orden de mantenimiento activa.",
            )
        activos.append(af)

    orden = OrdenMantenimiento(
        proveedor_id=datos.proveedor_id,
        fecha_visita=datos.fecha_visita,
        notas=datos.notas,
        creado_por_id=usuario.id,
    )
    db.add(orden)
    db.flush()  # obtener orden.id antes de crear items

    for af in activos:
        item = OrdenMantenimientoItem(
            orden_id=orden.id,
            activo_fijo_id=af.id,
        )
        db.add(item)
        af.estado = EstadoActivo.en_mantenimiento

    db.commit()
    registrar(
        db, "CREAR_ORDEN_MANTENIMIENTO",
        usuario=usuario, entidad="orden_mantenimiento", entidad_id=orden.id,
        detalle=(
            f"{len(activos)} Phantomas · "
            f"proveedor_id={datos.proveedor_id} · "
            f"visita={datos.fecha_visita}"
        ),
        ip=get_ip(request),
    )
    return _orden_response(_load_orden(orden.id, db))


@router.put("/{orden_id}", response_model=OrdenMantenimientoResponse)
def actualizar_cabecera(
    orden_id: int,
    request: Request,
    datos: OrdenMantenimientoUpdate,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(require_operador),
):
    """Edita proveedor y notas de la cabecera (solo mientras en_curso)."""
    orden = _load_orden(orden_id, db)
    if orden.estado != EstadoOrden.en_curso:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Solo se puede editar la cabecera de una orden en_curso.",
        )
    for campo, valor in datos.model_dump(exclude_unset=True).items():
        setattr(orden, campo, valor)
    db.commit()
    return _orden_response(_load_orden(orden_id, db))


@router.patch(
    "/items/{item_id}",
    response_model=OrdenItemResponse,
)
def actualizar_item(
    item_id: int,
    request: Request,
    datos: OrdenItemUpdate,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(require_operador),
):
    """Actualiza el resultado de un Phantoma individual durante el cierre.

    Validaciones:
    - Si resultado=sale_a_taller: fecha_envio obligatoria.
    - Si resultado=dar_de_baja: descripcion_problema recomendada.
    La orden debe estar en_curso.
    """
    item = (
        db.query(OrdenMantenimientoItem)
        .options(
            joinedload(OrdenMantenimientoItem.orden),
            joinedload(OrdenMantenimientoItem.activo_fijo),
        )
        .filter(OrdenMantenimientoItem.id == item_id)
        .first()
    )
    if not item:
        raise HTTPException(status_code=404, detail="Ítem no encontrado")
    if item.orden.estado != EstadoOrden.en_curso:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="La orden ya está cerrada o cancelada.",
        )
    if (
        datos.resultado == ResultadoItem.sale_a_taller
        and not datos.fecha_envio
    ):
        raise HTTPException(
            status_code=422,
            detail="fecha_envio es obligatoria cuando el Phantoma sale a taller.",
        )

    for campo, valor in datos.model_dump(exclude_unset=True).items():
        setattr(item, campo, valor)

    # Si sale a taller, el activo permanece en_mantenimiento hasta el retorno.
    # Si da de baja, el activo pasa a dado_de_baja.
    af = item.activo_fijo
    if datos.resultado == ResultadoItem.dar_de_baja and af:
        af.estado = EstadoActivo.dado_de_baja

    db.commit()
    db.refresh(item)
    return _item_response(item)


@router.post(
    "/{orden_id}/cerrar",
    response_model=OrdenMantenimientoResponse,
)
def cerrar_orden(
    orden_id: int,
    request: Request,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(require_operador),
):
    """Cierra la orden de mantenimiento (contrafirma de Maritza).

    Requisito: todos los ítems deben tener resultado != pendiente.
    Al cerrar:
    - Los ítems 'ok' vuelven a EstadoActivo.disponible.
    - Los ítems 'sale_a_taller' permanecen en_mantenimiento.
    - Los ítems 'dar_de_baja' ya fueron marcados dado_de_baja en PATCH.
    """
    orden = _load_orden(orden_id, db)
    if orden.estado != EstadoOrden.en_curso:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="La orden ya está cerrada o cancelada.",
        )
    pendientes = [
        i for i in orden.items
        if i.resultado == ResultadoItem.pendiente
    ]
    if pendientes:
        codigos = ", ".join(
            i.activo_fijo.codigo_interno
            for i in pendientes
            if i.activo_fijo
        )
        raise HTTPException(
            status_code=422,
            detail=(
                f"Faltan {len(pendientes)} ítems sin resultado: {codigos}. "
                "Completa todos antes de cerrar."
            ),
        )

    for item in orden.items:
        if item.resultado == ResultadoItem.ok and item.activo_fijo:
            item.activo_fijo.estado = EstadoActivo.disponible

    orden.estado = EstadoOrden.cerrada
    db.commit()
    registrar(
        db, "CERRAR_ORDEN_MANTENIMIENTO",
        usuario=usuario, entidad="orden_mantenimiento", entidad_id=orden.id,
        detalle=f"{len(orden.items)} ítems procesados",
        ip=get_ip(request),
    )
    return _orden_response(_load_orden(orden_id, db))


@router.delete("/{orden_id}", status_code=204)
def cancelar_orden(
    orden_id: int,
    request: Request,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(require_operador),
):
    """Cancela una orden en_curso y devuelve los activos a disponible."""
    orden = _load_orden(orden_id, db)
    if orden.estado != EstadoOrden.en_curso:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Solo se puede cancelar una orden en_curso.",
        )
    for item in orden.items:
        if item.activo_fijo:
            item.activo_fijo.estado = EstadoActivo.disponible
    orden.estado = EstadoOrden.cancelada
    orden.activo = False
    db.commit()
    registrar(
        db, "CANCELAR_ORDEN_MANTENIMIENTO",
        usuario=usuario, entidad="orden_mantenimiento", entidad_id=orden.id,
        detalle="cancelada", ip=get_ip(request),
    )
