from fastapi import APIRouter, Depends, Query
from fastapi.responses import Response
from sqlalchemy.orm import Session
from sqlalchemy import func
from decimal import Decimal
from typing import Optional
from datetime import datetime, timezone

from app.database import get_db
from app.models.insumo import Insumo
from app.models.solicitud import SolicitudRetiro, SolicitudItem, EstadoSolicitud
from app.models.clase_docente import ClaseDocente
from app.models.asignatura import Asignatura
from app.models.usuario import Usuario
from app.schemas.reportes import (
    ValorizacionResponse, InsumoValorizado, InsumoSinCosto,
    GrupoValor, ConsumoCarrerasResponse, CarreraConsumo,
)
from app.utils.deps import get_usuario_actual

router = APIRouter(prefix="/reportes", tags=["Reportes"])


def _obtener_valorizacion(db: Session) -> ValorizacionResponse:
    insumos = (
        db.query(Insumo)
        .filter(Insumo.activo.is_(True))
        .order_by(Insumo.nombre)
        .all()
    )

    valorizados: list[InsumoValorizado] = []
    sin_costo: list[InsumoSinCosto] = []
    valor_total = Decimal("0")
    por_categoria: dict[str, Decimal] = {}
    por_sala: dict[str, Decimal] = {}
    conteo_cat: dict[str, int] = {}
    conteo_sala: dict[str, int] = {}

    for i in insumos:
        cat_nombre = i.categoria.nombre if i.categoria else "Sin categoria"
        sala_nombre = i.sala.nombre if i.sala else "Sin sala"
        if i.costo_unitario is not None:
            costo = Decimal(str(i.costo_unitario))
            vt = costo * i.stock_actual
            valor_total += vt
            por_categoria[cat_nombre] = (
                por_categoria.get(cat_nombre, Decimal("0")) + vt
            )
            por_sala[sala_nombre] = por_sala.get(sala_nombre, Decimal("0")) + vt
            conteo_cat[cat_nombre] = conteo_cat.get(cat_nombre, 0) + 1
            conteo_sala[sala_nombre] = conteo_sala.get(sala_nombre, 0) + 1
            valorizados.append(InsumoValorizado(
                id=i.id,
                nombre=i.nombre,
                sku=i.sku,
                stock_actual=i.stock_actual,
                costo_unitario=costo,
                valor_total=vt,
                sala=sala_nombre if i.sala else None,
                categoria=cat_nombre if i.categoria else None,
            ))
        else:
            sin_costo.append(InsumoSinCosto(
                id=i.id,
                nombre=i.nombre,
                sku=i.sku,
                stock_actual=i.stock_actual,
                sala=sala_nombre if i.sala else None,
                categoria=cat_nombre if i.categoria else None,
            ))

    grupos_cat = [
        GrupoValor(
            nombre=nombre,
            valor_total=valor,
            cantidad_insumos=conteo_cat[nombre],
        )
        for nombre, valor in sorted(por_categoria.items(), key=lambda x: -x[1])
    ]
    grupos_sala = [
        GrupoValor(
            nombre=nombre,
            valor_total=valor,
            cantidad_insumos=conteo_sala[nombre],
        )
        for nombre, valor in sorted(por_sala.items(), key=lambda x: -x[1])
    ]

    return ValorizacionResponse(
        valor_total_inventario=valor_total,
        total_insumos_valorados=len(valorizados),
        total_insumos_sin_costo=len(sin_costo),
        por_categoria=grupos_cat,
        por_sala=grupos_sala,
        insumos=valorizados,
        insumos_sin_costo=sin_costo,
    )


def _obtener_consumo_carreras(db: Session, semestre: str) -> ConsumoCarrerasResponse:
    filas = (
        db.query(
            Asignatura.carrera,
            func.sum(
                SolicitudItem.cantidad_solicitada * Insumo.costo_unitario
            ).label("costo_total"),
            func.count(func.distinct(SolicitudRetiro.id)).label("num_solicitudes"),
            func.sum(ClaseDocente.num_estudiantes).label("num_estudiantes"),
        )
        .join(SolicitudItem, SolicitudItem.solicitud_id == SolicitudRetiro.id)
        .join(Insumo, Insumo.id == SolicitudItem.insumo_id)
        .join(ClaseDocente, ClaseDocente.id == SolicitudRetiro.clase_docente_id)
        .join(Asignatura, Asignatura.id == ClaseDocente.asignatura_id)
        .filter(
            SolicitudRetiro.estado == EstadoSolicitud.completada,
            ClaseDocente.semestre == semestre,
            Insumo.costo_unitario.isnot(None),
            Asignatura.carrera.isnot(None),
        )
        .group_by(Asignatura.carrera)
        .all()
    )

    costo_total_semestre = Decimal("0")
    carreras: list[CarreraConsumo] = []
    for fila in filas:
        costo = Decimal(str(fila.costo_total or 0))
        num_est = int(fila.num_estudiantes or 0)
        costo_total_semestre += costo
        cpp = (costo / num_est) if num_est > 0 else None
        carreras.append(CarreraConsumo(
            carrera=fila.carrera.value if fila.carrera else "Sin carrera",
            costo_total=costo,
            num_solicitudes=fila.num_solicitudes or 0,
            num_estudiantes_total=num_est,
            costo_por_estudiante=cpp,
        ))

    carreras.sort(key=lambda c: -c.costo_total)
    return ConsumoCarrerasResponse(
        semestre=semestre,
        costo_total_semestre=costo_total_semestre,
        carreras=carreras,
    )


def _generar_html_pdf(val: ValorizacionResponse, semestre: Optional[str]) -> str:
    fecha = datetime.now(timezone.utc).strftime("%d/%m/%Y %H:%M UTC")
    rows_cat = "".join(
        f"<tr><td>{g.nombre}</td><td>${g.valor_total:,.2f}</td>"
        f"<td>{g.cantidad_insumos}</td></tr>"
        for g in val.por_categoria
    )
    rows_sala = "".join(
        f"<tr><td>{g.nombre}</td><td>${g.valor_total:,.2f}</td>"
        f"<td>{g.cantidad_insumos}</td></tr>"
        for g in val.por_sala
    )
    rows_insumos = "".join(
        f"<tr><td>{i.nombre}</td><td>{i.sku or '-'}</td>"
        f"<td>{i.stock_actual}</td><td>${i.costo_unitario:,.2f}</td>"
        f"<td>${i.valor_total:,.2f}</td>"
        f"<td>{i.categoria or '-'}</td><td>{i.sala or '-'}</td></tr>"
        for i in val.insumos
    )
    semestre_str = f" &mdash; Semestre {semestre}" if semestre else ""
    return f"""<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8"/>
<style>
  body {{ font-family: Arial, sans-serif; font-size: 11px; margin: 30px; color: #1a1a1a; }}
  h1 {{ font-size: 18px; color: #0d7377; margin-bottom: 4px; }}
  h2 {{ font-size: 13px; color: #334155; margin-top: 20px; margin-bottom: 6px;
        border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; }}
  .meta {{ color: #64748b; font-size: 10px; margin-bottom: 16px; }}
  .kpi {{ display: flex; gap: 20px; margin-bottom: 16px; }}
  .kpi-box {{ background: #f0fdfa; border: 1px solid #99f6e4;
               border-radius: 6px; padding: 8px 14px; }}
  .kpi-val {{ font-size: 20px; font-weight: bold; color: #0d7377; }}
  .kpi-lbl {{ font-size: 9px; color: #475569; }}
  table {{ width: 100%; border-collapse: collapse; margin-bottom: 12px; }}
  th {{ background: #f1f5f9; padding: 5px 8px; text-align: left;
        font-size: 10px; color: #475569; border-bottom: 2px solid #e2e8f0; }}
  td {{ padding: 4px 8px; border-bottom: 1px solid #f1f5f9; }}
  tr:nth-child(even) td {{ background: #f8fafc; }}
</style>
</head>
<body>
<h1>Reporte de Valorizacion de Inventario</h1>
<p class="meta">Generado el {fecha}{semestre_str}</p>
<div class="kpi">
  <div class="kpi-box">
    <div class="kpi-val">${{val.valor_total_inventario:,.2f}}</div>
    <div class="kpi-lbl">Valor total inventario</div>
  </div>
  <div class="kpi-box">
    <div class="kpi-val">{val.total_insumos_valorados}</div>
    <div class="kpi-lbl">Insumos con costo</div>
  </div>
  <div class="kpi-box">
    <div class="kpi-val">{val.total_insumos_sin_costo}</div>
    <div class="kpi-lbl">Insumos sin costo</div>
  </div>
</div>
<h2>Por Categoria</h2>
<table><tr><th>Categoria</th><th>Valor Total</th><th>Insumos</th></tr>
{rows_cat}</table>
<h2>Por Sala</h2>
<table><tr><th>Sala</th><th>Valor Total</th><th>Insumos</th></tr>
{rows_sala}</table>
<h2>Detalle de Insumos Valorizados</h2>
<table>
<tr><th>Nombre</th><th>SKU</th><th>Stock</th><th>Costo Unit.</th>
    <th>Valor Total</th><th>Categoria</th><th>Sala</th></tr>
{rows_insumos}
</table>
</body></html>"""


# IMPORTANTE: /valorizacion/pdf (ruta estatica) ANTES de /valorizacion
@router.get("/valorizacion/pdf")
def exportar_valorizacion_pdf(
    semestre: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(get_usuario_actual),
):
    """Exporta el reporte de valorizacion como PDF (WeasyPrint)."""
    try:
        import weasyprint
    except ImportError:
        from fastapi import HTTPException
        raise HTTPException(
            status_code=501,
            detail="WeasyPrint no esta instalado en este entorno.",
        )

    val = _obtener_valorizacion(db)
    html = _generar_html_pdf(val, semestre)
    pdf_bytes = weasyprint.HTML(string=html).write_pdf()
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": "attachment; filename=valorizacion_hestia.pdf"},
    )


@router.get("/valorizacion", response_model=ValorizacionResponse)
def obtener_valorizacion(
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(get_usuario_actual),
):
    """Valor del inventario activo agrupado por categoria y sala."""
    return _obtener_valorizacion(db)


@router.get("/consumo-carreras", response_model=ConsumoCarrerasResponse)
def obtener_consumo_carreras(
    semestre: str = Query(..., description="Ej: 2025-1"),
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(get_usuario_actual),
):
    """Costo de insumos consumidos por carrera en un semestre dado."""
    return _obtener_consumo_carreras(db, semestre)
