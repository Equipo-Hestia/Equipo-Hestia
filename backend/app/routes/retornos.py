from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload
from datetime import datetime, timezone

from app.database import get_db
from app.models.retorno_implemento import RetornoImplemento, EstadoRetorno
from app.models.insumo import Insumo
from app.models.usuario import Usuario
from app.schemas.retorno import RetornoResponse, MarcarRetornoRequest
from app.utils.deps import require_operador

router = APIRouter(prefix="/retornos", tags=["Retornos"])


def _opts():
    """joinedload compartido para evitar N+1 queries en todas las rutas."""
    return [
        joinedload(RetornoImplemento.insumo),
        joinedload(RetornoImplemento.docente),
        joinedload(RetornoImplemento.sala),
        joinedload(RetornoImplemento.operador),
    ]


def _construir_response(r: RetornoImplemento) -> RetornoResponse:
    return RetornoResponse(
        id=r.id,
        insumo_id=r.insumo_id,
        insumo_nombre=r.insumo.nombre if r.insumo else "Desconocido",
        solicitud_id=r.solicitud_id,
        docente_nombre=r.docente.nombre if r.docente else None,
        sala_nombre=r.sala.nombre if r.sala else None,
        cantidad=r.cantidad,
        fecha_retiro=r.fecha_retiro,
        fecha_retorno=r.fecha_retorno,
        estado=r.estado.value if r.estado else "pendiente",
        operador_nombre=r.operador.nombre if r.operador else None,
        notas=r.notas,
    )


@router.get("/hoy", response_model=list[RetornoResponse])
def retornos_hoy(
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(require_operador),
):
    """Implementos retirados hoy (desde medianoche UTC) en todos los estados.

    Permite al operador ver el resumen completo del dia: pendientes,
    ya confirmados y mermas registradas.
    """
    inicio_hoy = datetime.now(timezone.utc).replace(
        hour=0, minute=0, second=0, microsecond=0
    )
    retornos = (
        db.query(RetornoImplemento)
        .options(*_opts())
        .filter(RetornoImplemento.fecha_retiro >= inicio_hoy)
        .order_by(RetornoImplemento.fecha_retiro.desc())
        .all()
    )
    return [_construir_response(r) for r in retornos]


@router.get("/pendientes", response_model=list[RetornoResponse])
def retornos_pendientes(
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(require_operador),
):
    """Todos los implementos retirados que aun no han sido confirmados.

    Util para detectar pendientes de dias anteriores que quedaron sin
    procesar (ej: fin de semana, dias sin operador).
    """
    retornos = (
        db.query(RetornoImplemento)
        .options(*_opts())
        .filter(RetornoImplemento.estado == EstadoRetorno.pendiente)
        .order_by(RetornoImplemento.fecha_retiro.desc())
        .all()
    )
    return [_construir_response(r) for r in retornos]


@router.put("/{retorno_id}/marcar", response_model=RetornoResponse)
def marcar_retorno(
    retorno_id: int,
    datos: MarcarRetornoRequest,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(require_operador),
):
    """Operador confirma el estado fisico de un implemento retirado.

    retornado:
        El implemento esta en el area comun. Se restaura el stock
        automaticamente con SELECT FOR UPDATE para evitar race conditions.

    no_retornado:
        No aparecio. Se registra como merma; el stock NO se restaura
        ya que el item se considera perdido o danado.
    """
    if datos.estado not in ("retornado", "no_retornado"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Estado invalido. Use 'retornado' o 'no_retornado'.",
        )

    retorno = (
        db.query(RetornoImplemento)
        .options(*_opts())
        .filter(RetornoImplemento.id == retorno_id)
        .first()
    )
    if not retorno:
        raise HTTPException(
            status_code=404, detail="Registro de retorno no encontrado."
        )

    if retorno.estado != EstadoRetorno.pendiente:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Este implemento ya fue marcado como '{retorno.estado.value}'.",
        )

    # Restaurar stock solo si el implemento fue devuelto
    if datos.estado == "retornado":
        insumo = (
            db.query(Insumo)
            .filter(Insumo.id == retorno.insumo_id)
            .with_for_update()
            .first()
        )
        if insumo:
            insumo.stock_actual += retorno.cantidad

    retorno.estado = EstadoRetorno(datos.estado)
    retorno.fecha_retorno = datetime.now(timezone.utc)
    retorno.operador_id = usuario.id
    retorno.notas = datos.notas

    db.commit()

    retorno = (
        db.query(RetornoImplemento)
        .options(*_opts())
        .filter(RetornoImplemento.id == retorno_id)
        .first()
    )
    return _construir_response(retorno)
