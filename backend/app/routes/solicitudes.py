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
# Se añade otra ruta estatica (/resumen-recientes)
# para el pop-up de bienvenida del operador, que muestra un
# resumen de las solicitudes recientes.
# ---------------------------------------------------------------------------

@router.get("/resumen-recientes")
def resumen_solicitudes_recientes(
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(require_operador),
):
    """Devuelve el conteo de solicitudes creadas desde el inicio del dia anterior.

    Usado por el pop-up de bienvenida del operador al iniciar sesion.
    Solo accesible para operador y admin.
    """
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
    """Operador/admin lista todas las solicitudes ordenadas por fecha de clase.

    Ordenadas ascendente: las mas proximas (urgentes) aparecen primero.
    Filtro opcional por estado: pendiente | en_preparacion | completada.
    """
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

    Validaciones:
    - fecha_clase no puede ser mas de 5 minutos en el pasado.
    - Cada insumo debe existir, estar activo y tener stock suficiente.
      Si se repite un insumo en los items, se suman las cantidades.
    """
    # Validar fecha_clase (tolerancia de 5 minutos para desfases de reloj)
    ahora = datetime.now(timezone.utc)
    segundos_en_pasado = (ahora - datos.fecha_clase).total_seconds()
    if segundos_en_pasado > 300:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="La fecha de clase no puede ser en el pasado.",
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

    # Crear la solicitud y sus items
    solicitud = SolicitudRetiro(
        docente_id=usuario.id,
        sala_id=datos.sala_id,
        fecha_clase=datos.fecha_clase,
        notas=datos.notas,
    )
    db.add(solicitud)
    db.flush()  # Obtiene el id sin hacer commit

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
    """Operador toma la solicitud e indica que esta preparando el pedido.

    Solo transiciona desde 'pendiente'. Si ya esta en otro estado, retorna 409.
    """
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

    Flujo:
    1. Verifica estado pendiente o en_preparacion.
    2. Re-verifica stock actual por cada item (puede haber cambiado).
    3. Descuenta stock_actual de cada insumo.
    4. Crea un Movimiento de salida por item con referencia a la solicitud.
    5. Para items de tipo 'implemento', crea un RetornoImplemento pendiente.
    6. Marca la solicitud como 'completada' y guarda fecha_completada.

    El stock se descuenta aqui (no al crear la solicitud) porque la solicitud
    es una intencion, no una reserva. El movimiento fisico ocurre al despachar.
    """
    s = _cargar_solicitud(db, solicitud_id)
    if s.estado not in (EstadoSolicitud.pendiente, EstadoSolicitud.en_preparacion):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Solo se pueden completar solicitudes pendientes o en preparacion.",
        )

    # Re-verificar stock con bloqueo pesimista para evitar race conditions.
    # Con FOR UPDATE, dos completar_solicitud concurrentes se serializan.
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

    # Descontar stock, registrar movimientos y crear retornos para implementos
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
        # Los implementos deben retornar al area comun; se registra el pendiente
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
