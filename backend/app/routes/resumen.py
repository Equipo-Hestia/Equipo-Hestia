from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func, cast, Date, case, desc
from pydantic import BaseModel
from datetime import date, datetime, timedelta, timezone
from typing import List, Optional

from app.database import get_db
from app.models.insumo import Insumo
from app.models.movimiento import Movimiento, TipoMovimiento
from app.models.sala import Sala
from app.models.usuario import Usuario
from app.utils.deps import get_usuario_actual

router = APIRouter(prefix="/resumen", tags=["Resumen"])


# --- Schemas ---

class ResumenResponse(BaseModel):
    total_insumos: int
    insumos_bajo_stock: int
    insumos_agotados: int
    movimientos_hoy: int
    entradas_hoy: int
    salidas_hoy: int
    total_salas: int
    total_usuarios: int


class DiaMovimiento(BaseModel):
    fecha: str
    entradas: int
    salidas: int


class ActividadReciente(BaseModel):
    id: int
    tipo: str
    insumo: str
    sala: Optional[str]
    cantidad: int
    usuario: str
    fecha: str


class TopInsumo(BaseModel):
    nombre: str
    total_salidas: int
    sala: Optional[str]


# --- Endpoints ---

@router.get("/", response_model=ResumenResponse)
def obtener_resumen(
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(get_usuario_actual),
):
    """Fotografia general del sistema para el dashboard."""
    total_insumos = db.query(Insumo).filter(Insumo.activo.is_(True)).count()

    insumos_bajo_stock = (
        db.query(Insumo)
        .filter(Insumo.activo.is_(True))
        .filter(Insumo.stock_actual <= Insumo.stock_minimo)
        .count()
    )

    insumos_agotados = (
        db.query(Insumo)
        .filter(Insumo.activo.is_(True))
        .filter(Insumo.stock_actual == 0)
        .count()
    )

    hoy = date.today()

    movimientos_hoy = (
        db.query(Movimiento)
        .filter(cast(Movimiento.fecha, Date) == hoy)
        .count()
    )
    entradas_hoy = (
        db.query(Movimiento)
        .filter(
            cast(Movimiento.fecha, Date) == hoy,
            Movimiento.tipo == TipoMovimiento.entrada,
        )
        .count()
    )
    salidas_hoy = (
        db.query(Movimiento)
        .filter(
            cast(Movimiento.fecha, Date) == hoy,
            Movimiento.tipo == TipoMovimiento.salida,
        )
        .count()
    )

    total_salas = db.query(Sala).count()
    total_usuarios = db.query(Usuario).filter(Usuario.activo.is_(True)).count()

    return ResumenResponse(
        total_insumos=total_insumos,
        insumos_bajo_stock=insumos_bajo_stock,
        insumos_agotados=insumos_agotados,
        movimientos_hoy=movimientos_hoy,
        entradas_hoy=entradas_hoy,
        salidas_hoy=salidas_hoy,
        total_salas=total_salas,
        total_usuarios=total_usuarios,
    )


@router.get("/grafico-semana", response_model=List[DiaMovimiento])
def grafico_semana(
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(get_usuario_actual),
):
    """Movimientos de los ultimos 7 dias agrupados por dia.

    Siempre devuelve exactamente 7 elementos (dias sin actividad = 0).
    Usa agregacion condicional con CASE para contar entradas y salidas
    en una sola query en vez de dos queries separadas.
    """
    desde = datetime.now(timezone.utc) - timedelta(days=7)

    resultados = (
        db.query(
            cast(Movimiento.fecha, Date).label("dia"),
            func.sum(
                case((Movimiento.tipo == TipoMovimiento.entrada, 1), else_=0)
            ).label("entradas"),
            func.sum(
                case((Movimiento.tipo == TipoMovimiento.salida, 1), else_=0)
            ).label("salidas"),
        )
        .filter(Movimiento.fecha >= desde)
        .group_by(cast(Movimiento.fecha, Date))
        .order_by(cast(Movimiento.fecha, Date))
        .all()
    )

    hoy = date.today()
    serie: dict[str, dict] = {
        (hoy - timedelta(days=i)).isoformat(): {"entradas": 0, "salidas": 0}
        for i in range(6, -1, -1)
    }

    for r in resultados:
        clave = r.dia.isoformat()
        if clave in serie:
            serie[clave] = {
                "entradas": int(r.entradas or 0),
                "salidas": int(r.salidas or 0),
            }

    return [
        DiaMovimiento(fecha=fecha, entradas=v["entradas"], salidas=v["salidas"])
        for fecha, v in serie.items()
    ]


@router.get("/actividad-reciente", response_model=List[ActividadReciente])
def actividad_reciente(
    limit: int = 8,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(get_usuario_actual),
):
    """Ultimos N movimientos enriquecidos para el feed del dashboard.

    Devuelve tipo, insumo, sala, cantidad, usuario y fecha en ISO 8601
    para que el frontend calcule la antiguedad relativa (hace X min, etc.).
    """
    movimientos = (
        db.query(Movimiento)
        .options(
            joinedload(Movimiento.insumo).joinedload(Insumo.sala),
            joinedload(Movimiento.usuario),
        )
        .order_by(desc(Movimiento.fecha))
        .limit(max(1, min(limit, 20)))  # clampear entre 1 y 20
        .all()
    )

    return [
        ActividadReciente(
            id=m.id,
            tipo=m.tipo.value if hasattr(m.tipo, "value") else str(m.tipo),
            insumo=m.insumo.nombre if m.insumo else "Desconocido",
            sala=m.insumo.sala.nombre if m.insumo and m.insumo.sala else None,
            cantidad=m.cantidad,
            usuario=m.usuario.nombre if m.usuario else "Desconocido",
            fecha=m.fecha.isoformat() if m.fecha else "",
        )
        for m in movimientos
    ]


@router.get("/top-insumos-retirados", response_model=List[TopInsumo])
def top_insumos_retirados(
    dias: int = 30,
    limit: int = 8,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(get_usuario_actual),
):
    """Top N insumos con mas salidas en los ultimos `dias` dias.

    Util para identificar insumos de alta rotacion y planificar reposicion.
    Agrupa por insumo_id y suma las cantidades de todas las salidas del
    periodo — no cuenta movimientos sino unidades retiradas.
    """
    desde = datetime.now(timezone.utc) - timedelta(days=dias)

    resultados = (
        db.query(
            Movimiento.insumo_id,
            func.sum(Movimiento.cantidad).label("total"),
        )
        .filter(
            Movimiento.tipo == TipoMovimiento.salida,
            Movimiento.fecha >= desde,
        )
        .group_by(Movimiento.insumo_id)
        .order_by(desc("total"))
        .limit(max(1, min(limit, 20)))
        .all()
    )

    # Cargar los insumos correspondientes en una sola query (IN clause)
    ids = [r.insumo_id for r in resultados]
    insumos_map = {
        i.id: i
        for i in db.query(Insumo)
        .options(joinedload(Insumo.sala))
        .filter(Insumo.id.in_(ids))
        .all()
    }

    return [
        TopInsumo(
            nombre=insumos_map[r.insumo_id].nombre if r.insumo_id in insumos_map else "Desconocido",
            total_salidas=int(r.total),
            sala=(
                insumos_map[r.insumo_id].sala.nombre
                if r.insumo_id in insumos_map and insumos_map[r.insumo_id].sala
                else None
            ),
        )
        for r in resultados
    ]
