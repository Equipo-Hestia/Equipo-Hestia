from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import desc
from typing import Optional

from app.database import get_db
from app.models.orden_mantenimiento import (
    OrdenMantenimiento, EstadoOrden, TipoMantenimiento,
)
from app.models.activo_fijo import ActivoFijo, EstadoActivo
from app.models.proveedor import Proveedor
from app.models.usuario import Usuario
from app.schemas.orden_mantenimiento import (
    OrdenMantenimientoCreate,
    OrdenMantenimientoUpdate,
    OrdenMantenimientoResponse,
)
from app.schemas.comun import PaginatedResponse
from app.utils.deps import get_usuario_actual, require_operador
from app.utils.auditoria import registrar, get_ip

router = APIRouter(
    prefix="/ordenes-mantenimiento", tags=["Mantenimiento"]
)


def _enriquecer(o: OrdenMantenimiento) -> OrdenMantenimientoResponse:
    return OrdenMantenimientoResponse(
        id=o.id,
        activo_fijo_id=o.activo_fijo_id,
        activo_fijo_nombre=(
            o.activo_fijo.nombre if o.activo_fijo else "Desconocido"
        ),
        activo_fijo_codigo=(
            o.activo_fijo.codigo_interno if o.activo_fijo else None
        ),
        proveedor_id=o.proveedor_id,
        proveedor_nombre=(
            o.proveedor.nombre if o.proveedor else None
        ),
        creado_por_id=o.creado_por_id,
        creado_por_nombre=(
            o.creado_por.nombre if o.creado_por else None
        ),
        estado=o.estado,
        tipo_mantenimiento=o.tipo_mantenimiento,
        fecha_envio=o.fecha_envio,
        fecha_retorno_estimada=o.fecha_retorno_estimada,
        fecha_retorno=o.fecha_retorno,
        descripcion_problema=o.descripcion_problema,
        descripcion_trabajo=o.descripcion_trabajo,
        costo=float(o.costo) if o.costo is not None else None,
        activo=o.activo,
    )


@router.get("/", response_model=PaginatedResponse[OrdenMantenimientoResponse])
def listar_ordenes(
    skip: int = 0,
    limit: int = 20,
    activo_fijo_id: Optional[int] = None,
    proveedor_id: Optional[int] = None,
    estado: Optional[EstadoOrden] = None,
    incluir_inactivas: bool = False,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(get_usuario_actual),
):
    """Lista ordenes de mantenimiento con filtros opcionales."""
    q = (
        db.query(OrdenMantenimiento)
        .options(
            joinedload(OrdenMantenimiento.activo_fijo),
            joinedload(OrdenMantenimiento.proveedor),
            joinedload(OrdenMantenimiento.creado_por),
        )
        .order_by(desc(OrdenMantenimiento.fecha_envio))
    )
    if not incluir_inactivas:
        q = q.filter(OrdenMantenimiento.activo.is_(True))
    if activo_fijo_id:
        q = q.filter(OrdenMantenimiento.activo_fijo_id == activo_fijo_id)
    if proveedor_id:
        q = q.filter(OrdenMantenimiento.proveedor_id == proveedor_id)
    if estado:
        q = q.filter(OrdenMantenimiento.estado == estado)
    total = q.count()
    return {
        "total": total,
        "skip": skip,
        "limit": limit,
        "data": [_enriquecer(o) for o in q.offset(skip).limit(limit).all()],
    }


@router.get("/{orden_id}", response_model=OrdenMantenimientoResponse)
def obtener_orden(
    orden_id: int,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(get_usuario_actual),
):
    orden = (
        db.query(OrdenMantenimiento)
        .options(
            joinedload(OrdenMantenimiento.activo_fijo),
            joinedload(OrdenMantenimiento.proveedor),
            joinedload(OrdenMantenimiento.creado_por),
        )
        .filter(OrdenMantenimiento.id == orden_id)
        .first()
    )
    if not orden:
        raise HTTPException(
            status_code=404, detail="Orden no encontrada"
        )
    return _enriquecer(orden)


@router.post("/", response_model=OrdenMantenimientoResponse, status_code=201)
def crear_orden(
    request: Request,
    datos: OrdenMantenimientoCreate,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(require_operador),
):
    """Crea una orden y pone el activo en estado en_mantenimiento."""
    activo = db.query(ActivoFijo).filter(
        ActivoFijo.id == datos.activo_fijo_id,
        ActivoFijo.activo.is_(True),
    ).first()
    if not activo:
        raise HTTPException(
            status_code=404, detail="Activo fijo no encontrado"
        )
    if activo.estado == EstadoActivo.en_mantenimiento:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"'{activo.nombre}' ya tiene una orden de mantenimiento "
                "activa."
            ),
        )
    if datos.proveedor_id:
        prov = db.query(Proveedor).filter(
            Proveedor.id == datos.proveedor_id,
            Proveedor.activo.is_(True),
        ).first()
        if not prov:
            raise HTTPException(
                status_code=404, detail="Proveedor no encontrado"
            )
    orden = OrdenMantenimiento(
        activo_fijo_id=datos.activo_fijo_id,
        proveedor_id=datos.proveedor_id,
        tipo_mantenimiento=datos.tipo_mantenimiento,
        fecha_envio=datos.fecha_envio,
        fecha_retorno_estimada=datos.fecha_retorno_estimada,
        descripcion_problema=datos.descripcion_problema,
        creado_por_id=usuario.id,
    )
    activo.estado = EstadoActivo.en_mantenimiento
    db.add(orden)
    db.commit()
    db.refresh(orden)
    registrar(
        db, "CREAR_ORDEN_MANTENIMIENTO",
        usuario=usuario, entidad="orden_mantenimiento", entidad_id=orden.id,
        detalle=(
            f"{activo.nombre} ({activo.codigo_interno}) "
            f"-> {orden.estado.value}"
        ),
        ip=get_ip(request),
    )
    return _enriquecer(
        db.query(OrdenMantenimiento)
        .options(
            joinedload(OrdenMantenimiento.activo_fijo),
            joinedload(OrdenMantenimiento.proveedor),
            joinedload(OrdenMantenimiento.creado_por),
        )
        .filter(OrdenMantenimiento.id == orden.id)
        .first()
    )


@router.put("/{orden_id}", response_model=OrdenMantenimientoResponse)
def actualizar_orden(
    orden_id: int,
    request: Request,
    datos: OrdenMantenimientoUpdate,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(require_operador),
):
    """Actualiza estado, proveedor, tipo, costo y descripcion de trabajo.

    Transiciones de estado permitidas:
        enviado     -> en_proceso | cancelado
        en_proceso  -> completado | cancelado
        completado  -> (bloqueado)
        cancelado   -> (bloqueado)

    Al completar: activo vuelve a 'disponible' y se registra fecha_retorno.
    Al cancelar:  activo vuelve a 'disponible'.
    """
    orden = (
        db.query(OrdenMantenimiento)
        .options(
            joinedload(OrdenMantenimiento.activo_fijo),
            joinedload(OrdenMantenimiento.proveedor),
            joinedload(OrdenMantenimiento.creado_por),
        )
        .filter(OrdenMantenimiento.id == orden_id)
        .first()
    )
    if not orden:
        raise HTTPException(
            status_code=404, detail="Orden no encontrada"
        )
    if orden.estado in (EstadoOrden.completado, EstadoOrden.cancelado):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="No se puede modificar una orden completada o cancelada.",
        )

    _TRANSICIONES = {
        EstadoOrden.enviado: {EstadoOrden.en_proceso, EstadoOrden.cancelado},
        EstadoOrden.en_proceso: {EstadoOrden.completado, EstadoOrden.cancelado},
    }
    if datos.estado and datos.estado != orden.estado:
        permitidos = _TRANSICIONES.get(orden.estado, set())
        if datos.estado not in permitidos:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    f"Transicion '{orden.estado.value}' -> "
                    f"'{datos.estado.value}' no permitida."
                ),
            )

    for campo, valor in datos.model_dump(exclude_unset=True).items():
        setattr(orden, campo, valor)

    if datos.estado == EstadoOrden.completado:
        orden.activo_fijo.estado = EstadoActivo.disponible
    elif datos.estado == EstadoOrden.cancelado:
        orden.activo_fijo.estado = EstadoActivo.disponible

    db.commit()
    registrar(
        db, "ACTUALIZAR_ORDEN_MANTENIMIENTO",
        usuario=usuario, entidad="orden_mantenimiento", entidad_id=orden.id,
        detalle=orden.estado.value,
        ip=get_ip(request),
    )
    return _enriquecer(
        db.query(OrdenMantenimiento)
        .options(
            joinedload(OrdenMantenimiento.activo_fijo),
            joinedload(OrdenMantenimiento.proveedor),
            joinedload(OrdenMantenimiento.creado_por),
        )
        .filter(OrdenMantenimiento.id == orden_id)
        .first()
    )
