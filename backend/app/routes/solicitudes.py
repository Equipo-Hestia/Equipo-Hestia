from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import asc, func
from datetime import datetime, timezone, timedelta
from typing import Optional


from app.database import get_db
from app.models.solicitud import SolicitudRetiro, SolicitudItem, EstadoSolicitud
from app.models.insumo import Insumo, TipoInsumo
from app.models.movimiento import Movimiento, TipoMovimiento
from app.models.retorno_implemento import RetornoImplemento
from app.models.usuario import Usuario
from app.schemas.solicitud import (
    SolicitudCreate, SolicitudResponse,
    SolicitudItemResponse, SolicitudUpdateEstado,
)
from app.utils.deps import require_docente, require_operador

router = APIRouter(prefix="/solicitudes", tags=["Solicitudes"])

# Ventana de solicitud (en minutos)
_MIN_ANTICIPACION = 120 # 2 horas  — menos de esto, ya no se puede pedir
_MAX_ANTICIPACION = 7 * 24 * 60 # 7 días — más de esto, es demasiado pronto


# ---------------------------------------------------------------------------
# Helpers internos
# ---------------------------------------------------------------------------

def _minutos_hasta_clase(fecha_clase: datetime) -> int:
    """Minutos que faltan para la clase (negativo si ya paso)."""
    diff = fecha_clase - datetime.now(timezone.utc)
    return int(diff.total_seconds() / 60)


def _cargar_solicitud(db: Session, solicitud_id: int) -> SolicitudRetiro:
    """Carga una solicitud con todas sus relaciones via joinedload."""
    s = (
        db.query(SolicitudRetiro)
        .options(
            joinedload(SolicitudRetiro.docente),
            joinedload(SolicitudRetiro.sala),
            joinedload(SolicitudRetiro.items).joinedload(SolicitudItem.insumo),
        )
        .filter(SolicitudRetiro.id == solicitud_id)
        .first()
    )
    if not s:
        raise HTTPException(status_code=404, detail="Solicitud no encontrada")
    return s


def _construir_response(s: SolicitudRetiro) -> SolicitudResponse:
    """Construye SolicitudResponse enriquecida desde el ORM."""
    items_response = [
        SolicitudItemResponse(
            id=item.id,
            insumo_id=item.insumo_id,
            insumo_nombre=item.insumo.nombre if item.insumo else "Desconocido",
            stock_actual=item.insumo.stock_actual if item.insumo else 0,
            cantidad_solicitada=item.cantidad_solicitada,
        )
        for item in s.items
    ]
    return SolicitudResponse(
        id=s.id,
        docente_id=s.docente_id,
        docente_nombre=s.docente.nombre if s.docente else "Desconocido",
        sala_id=s.sala_id,
        sala_nombre=s.sala.nombre if s.sala else "Desconocida",
        fecha_clase=s.fecha_clase,
        estado=s.estado,
        notas=s.notas,
        notas_operador=s.notas_operador,
        fecha_creacion=s.fecha_creacion,
        fecha_completada=s.fecha_completada,
        items=items_response,
        minutos_hasta_clase=_minutos_hasta_clase(s.fecha_clase),
    )


# ---------------------------------------------------------------------------
# IMPORTANTE: rutas estaticas (/mis-solicitudes) van ANTES que las dinamicas
# (/{solicitud_id}) aunque int != str — buena practica preventiva.
# ---------------------------------------------------------------------------

@router.get("/resumen-recientes")
def resumen_solicitudes_recientes(
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(require_operador),
):
    """Devuelve el conteo de solicitudes creadas desde el inicio del dia anterior."""
    inicio_ayer = datetime.now(timezone.utc).replace(
        hour=0, minute=0, second=0, microsecond=0
    ) - timedelta(days=1)

    total = (
        db.query(func.count(SolicitudRetiro.id))
        .filter(SolicitudRetiro.fecha_creacion >= inicio_ayer)
        .scalar()
    ) or 0

    pendientes = (
        db.query(func.count(SolicitudRetiro.id))
        .filter(
            SolicitudRetiro.fecha_creacion >= inicio_ayer,
            SolicitudRetiro.estado == EstadoSolicitud.pendiente,
        )
        .scalar()
    ) or 0

    return {"total": total, "pendientes": pendientes}


@router.get("/mis-solicitudes", response_model=list[SolicitudResponse])
def mis_solicitudes(
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(require_docente),
):
    """Docente consulta sus propias solicitudes, de mas reciente a mas antigua."""
    solicitudes = (
        db.query(SolicitudRetiro)
        .options(
            joinedload(SolicitudRetiro.docente),
            joinedload(SolicitudRetiro.sala),
            joinedload(SolicitudRetiro.items).joinedload(SolicitudItem.insumo),
        )
        .filter(SolicitudRetiro.docente_id == usuario.id)
        .order_by(SolicitudRetiro.fecha_clase.desc())
        .all()
    )
    return [_construir_response(s) for s in solicitudes]


@router.get("/", response_model=list[SolicitudResponse])
def listar_solicitudes(
    estado: Optional[str] = None,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(require_operador),
):
    """Operador/admin lista todas las solicitudes ordenadas por fecha de clase."""
    q = (
        db.query(SolicitudRetiro)
        .options(
            joinedload(SolicitudRetiro.docente),
            joinedload(SolicitudRetiro.sala),
            joinedload(SolicitudRetiro.items).joinedload(SolicitudItem.insumo),
        )
        .order_by(asc(SolicitudRetiro.fecha_clase))
    )
    if estado and estado in EstadoSolicitud.__members__:
        q = q.filter(SolicitudRetiro.estado == estado)
    return [_construir_response(s) for s in q.all()]


@router.post("/", response_model=SolicitudResponse, status_code=status.HTTP_201_CREATED)
def crear_solicitud(
    datos: SolicitudCreate,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(require_docente),
):
    """Docente crea una solicitud de retiro de insumos para su clase.

    Ventana de solicitud:
    - Minimo: 2 horas antes de la clase (_MIN_ANTICIPACION = 120 min).
      Si queda menos tiempo el personal no puede preparar el pedido.
    - Maximo: 7 dias antes de la clase (_MAX_ANTICIPACION = 10080 min).
      La planificacion mas alla de una semana es prematura.
    """
    ahora = datetime.now(timezone.utc)
    minutos_hasta = (datos.fecha_clase - ahora).total_seconds() / 60

    if minutos_hasta < _MIN_ANTICIPACION:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Debes solicitar con al menos {_MIN_ANTICIPACION // 60} horas de "
                "anticipacion. El personal necesita tiempo para preparar el pedido."
            ),
        )

    if minutos_hasta > _MAX_ANTICIPACION:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Solo puedes solicitar hasta 1 semana (7 dias) antes de tu clase.",
        )

    # Validar sala
    from app.models.sala import Sala
    sala = db.query(Sala).filter(Sala.id == datos.sala_id).first()
    if not sala:
        raise HTTPException(status_code=404, detail="Sala no encontrada")

    # Acumular cantidades por insumo (por si el docente duplica un insumo)
    cantidades: dict[int, int] = {}
    for item in datos.items:
        cantidades[item.insumo_id] = (
            cantidades.get(item.insumo_id, 0) + item.cantidad_solicitada
        )

    for insumo_id, cantidad in cantidades.items():
        insumo = db.query(Insumo).filter(Insumo.id == insumo_id).first()
        if not insumo:
            raise HTTPException(
                status_code=404,
                detail=f"Insumo con id {insumo_id} no encontrado.",
            )
        if not insumo.activo:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"'{insumo.nombre}' esta inactivo y no puede retirarse.",
            )
        if insumo.stock_actual < cantidad:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    f"Stock insuficiente para '{insumo.nombre}'. "
                    f"Disponible: {insumo.stock_actual}, solicitado: {cantidad}."
                ),
            )

    solicitud = SolicitudRetiro(
        docente_id=usuario.id,
        sala_id=datos.sala_id,
        fecha_clase=datos.fecha_clase,
        notas=datos.notas,
    )
    db.add(solicitud)
    db.flush()

    for item_data in datos.items:
        db.add(SolicitudItem(
            solicitud_id=solicitud.id,
            insumo_id=item_data.insumo_id,
            cantidad_solicitada=item_data.cantidad_solicitada,
        ))

    db.commit()
    return _construir_response(_cargar_solicitud(db, solicitud.id))


@router.put("/{solicitud_id}/en-preparacion", response_model=SolicitudResponse)
def marcar_en_preparacion(
    solicitud_id: int,
    datos: SolicitudUpdateEstado,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(require_operador),
):
    s = _cargar_solicitud(db, solicitud_id)
    if s.estado != EstadoSolicitud.pendiente:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"La solicitud tiene estado '{s.estado.value}' "
                "y no puede marcarse en preparacion."
            ),
        )
    s.estado = EstadoSolicitud.en_preparacion
    if datos.notas_operador is not None:
        s.notas_operador = datos.notas_operador
    db.commit()
    return _construir_response(_cargar_solicitud(db, solicitud_id))


@router.post("/{solicitud_id}/completar", response_model=SolicitudResponse)
def completar_solicitud(
    solicitud_id: int,
    datos: SolicitudUpdateEstado,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(require_operador),
):
    """Operador despacha el pedido: descuenta stock y registra movimientos.

    Para items de tipo 'implemento' crea ademas un RetornoImplemento pendiente.
    """
    s = _cargar_solicitud(db, solicitud_id)
    if s.estado not in (EstadoSolicitud.pendiente, EstadoSolicitud.en_preparacion):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Solo se pueden completar solicitudes pendientes o en preparacion.",
        )

    insumos_bloqueados: dict[int, Insumo] = {}
    for item in s.items:
        insumo = (
            db.query(Insumo)
            .filter(Insumo.id == item.insumo_id)
            .with_for_update()
            .first()
        )
        nombre = insumo.nombre if insumo else str(item.insumo_id)
        if not insumo or not insumo.activo:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"El insumo '{nombre}' ya no esta disponible.",
            )
        if insumo.stock_actual < item.cantidad_solicitada:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    f"Stock insuficiente para '{nombre}'. "
                    f"Disponible: {insumo.stock_actual}, "
                    f"requerido: {item.cantidad_solicitada}."
                ),
            )
        insumos_bloqueados[item.insumo_id] = insumo

    docente_nombre = s.docente.nombre if s.docente else "Docente"
    sala_nombre = s.sala.nombre if s.sala else "Sala"
    motivo = f"Solicitud #{s.id} \u2014 {docente_nombre} \u2014 {sala_nombre}"
    ahora = datetime.now(timezone.utc)

    for item in s.items:
        insumo = insumos_bloqueados[item.insumo_id]
        insumo.stock_actual -= item.cantidad_solicitada
        db.add(Movimiento(
            tipo=TipoMovimiento.salida,
            cantidad=item.cantidad_solicitada,
            insumo_id=item.insumo_id,
            usuario_id=usuario.id,
            motivo=motivo,
        ))
        if insumo.tipo == TipoInsumo.implemento:
            db.add(RetornoImplemento(
                insumo_id=item.insumo_id,
                solicitud_id=s.id,
                docente_id=s.docente_id,
                sala_id=s.sala_id,
                cantidad=item.cantidad_solicitada,
                fecha_retiro=ahora,
            ))

    s.estado = EstadoSolicitud.completada
    s.fecha_completada = ahora
    if datos.notas_operador is not None:
        s.notas_operador = datos.notas_operador

    db.commit()
    return _construir_response(_cargar_solicitud(db, solicitud_id))
