from fastapi import APIRouter, Depends, HTTPException, Query
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
from app.utils.deps import require_reportes

router = APIRouter(prefix="/reportes", tags=["Reportes"])

# Ancho util: A4 landscape (297mm) - margenes (15+15) = 267mm
PDF_USABLE_W = 267


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


def _generar_pdf_bytes(
    val: ValorizacionResponse,
    semestre: Optional[str],
) -> bytes:
    """Genera el PDF de valorizacion usando fpdf2.

    Usa A4 landscape con margenes de 15mm (267mm utiles) para evitar el
    error 'Not enough horizontal space' de fpdf2 2.8.x que ocurre cuando
    las celdas llegan exactamente al limite de la pagina A4 portrait.
    Todos los anchos son numericos explicitos; no se usa width=0.
    """
    try:
        from fpdf import FPDF
    except ImportError:
        raise HTTPException(
            status_code=501,
            detail=(
                "fpdf2 no esta instalado en el contenedor. "
                "Ejecuta: docker compose build --no-cache api"
            ),
        )

    fecha = datetime.now(timezone.utc).strftime("%d/%m/%Y %H:%M UTC")
    semestre_str = f" - Semestre {semestre}" if semestre else ""

    TEAL = (13, 115, 119)
    SLATE_DARK = (30, 41, 59)
    SLATE_MID = (71, 85, 105)
    SLATE_LIGHT = (241, 245, 249)

    # A4 landscape: 297x210mm. Margenes 15mm => 267mm utiles.
    pdf = FPDF(orientation="L", format="A4")
    pdf.set_margins(15, 15, 15)
    pdf.set_auto_page_break(auto=True, margin=15)
    pdf.add_page()

    # --- Titulo ---
    pdf.set_font("Helvetica", "B", 18)
    pdf.set_text_color(*TEAL)
    pdf.cell(PDF_USABLE_W, 10, "Reporte de Valorizacion de Inventario")
    pdf.ln()
    pdf.set_font("Helvetica", "", 9)
    pdf.set_text_color(*SLATE_MID)
    pdf.cell(PDF_USABLE_W, 6, f"Generado el {fecha}{semestre_str}")
    pdf.ln(10)

    # --- KPIs: 3 cajas de 89mm = 267mm ---
    valor_fmt = f"${val.valor_total_inventario:,.0f}"
    kpis = [
        ("Valor Total Inventario", valor_fmt),
        ("Insumos con Costo", str(val.total_insumos_valorados)),
        ("Insumos sin Costo", str(val.total_insumos_sin_costo)),
    ]
    col_w = 89
    for _, value in kpis:
        pdf.set_fill_color(240, 253, 250)
        pdf.set_draw_color(153, 246, 228)
        pdf.set_font("Helvetica", "B", 14)
        pdf.set_text_color(*TEAL)
        pdf.cell(col_w, 10, value, border=1, align="C", fill=True)
    pdf.ln()
    x_inicio = pdf.l_margin
    for idx, (label, _) in enumerate(kpis):
        pdf.set_xy(x_inicio + idx * col_w, pdf.get_y())
        pdf.set_font("Helvetica", "", 8)
        pdf.set_text_color(*SLATE_MID)
        pdf.cell(col_w, 5, label, align="C")
    pdf.ln(10)

    def _seccion(titulo):
        pdf.set_font("Helvetica", "B", 11)
        pdf.set_text_color(*SLATE_DARK)
        pdf.set_fill_color(*SLATE_LIGHT)
        pdf.cell(PDF_USABLE_W, 7, f"  {titulo}", fill=True)
        pdf.ln()
        pdf.ln(1)

    def _encabezado(cols):
        pdf.set_font("Helvetica", "B", 8)
        pdf.set_text_color(*SLATE_MID)
        pdf.set_fill_color(*SLATE_LIGHT)
        for texto, ancho, alin in cols:
            pdf.cell(ancho, 6, texto, border="B", align=alin, fill=True)
        pdf.ln()

    def _fila(celdas, par):
        if par:
            pdf.set_fill_color(248, 250, 252)
        else:
            pdf.set_fill_color(255, 255, 255)
        pdf.set_draw_color(226, 232, 240)
        pdf.set_font("Helvetica", "", 8)
        pdf.set_text_color(*SLATE_DARK)
        for texto, ancho, alin in celdas:
            pdf.cell(ancho, 6, str(texto)[:55], border="B", align=alin, fill=True)
        pdf.ln()

    # Columnas grupo (categoria/sala): 180+57+30 = 267mm
    COLS_GRUPO = [
        ("Nombre", 180, "L"),
        ("Valor Total", 57, "R"),
        ("Insumos", 30, "C"),
    ]

    # --- Por Categoria ---
    if val.por_categoria:
        _seccion("Por Categoria")
        _encabezado(COLS_GRUPO)
        for idx, g in enumerate(val.por_categoria):
            _fila([
                (g.nombre, 180, "L"),
                (f"${g.valor_total:,.0f}", 57, "R"),
                (str(g.cantidad_insumos), 30, "C"),
            ], idx % 2 == 0)
        pdf.ln(4)

    # --- Por Sala ---
    if val.por_sala:
        _seccion("Por Sala")
        _encabezado(COLS_GRUPO)
        for idx, g in enumerate(val.por_sala):
            _fila([
                (g.nombre, 180, "L"),
                (f"${g.valor_total:,.0f}", 57, "R"),
                (str(g.cantidad_insumos), 30, "C"),
            ], idx % 2 == 0)
        pdf.ln(4)

    # --- Detalle: 85+28+18+30+32+42+32 = 267mm ---
    if val.insumos:
        _seccion(
            f"Detalle de Insumos Valorizados ({val.total_insumos_valorados})"
        )
        cols_det = [
            ("Nombre", 85, "L"),
            ("SKU", 28, "L"),
            ("Stock", 18, "C"),
            ("Costo Unit.", 30, "R"),
            ("Valor Total", 32, "R"),
            ("Categoria", 42, "L"),
            ("Sala", 32, "L"),
        ]
        _encabezado(cols_det)
        for idx, i in enumerate(val.insumos):
            _fila([
                (i.nombre[:40], 85, "L"),
                (i.sku or "-", 28, "L"),
                (str(i.stock_actual), 18, "C"),
                (f"${i.costo_unitario:,.0f}", 30, "R"),
                (f"${i.valor_total:,.0f}", 32, "R"),
                ((i.categoria or "-")[:22], 42, "L"),
                ((i.sala or "-")[:18], 32, "L"),
            ], idx % 2 == 0)

    return bytes(pdf.output())


# IMPORTANTE: /valorizacion/pdf (ruta estatica) ANTES de /valorizacion
@router.get("/valorizacion/pdf")
def exportar_valorizacion_pdf(
    semestre: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(require_reportes),
):
    """Exporta el reporte de valorizacion como PDF (fpdf2).
    Requiere rol admin, operador_coordinador o visor.
    """
    val = _obtener_valorizacion(db)
    try:
        pdf_bytes = _generar_pdf_bytes(val, semestre)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Error al generar PDF: {exc}",
        )
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": "attachment; filename=valorizacion_hestia.pdf"
        },
    )


@router.get("/valorizacion", response_model=ValorizacionResponse)
def obtener_valorizacion(
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(require_reportes),
):
    """Valor del inventario activo agrupado por categoria y sala.
    Requiere rol admin, operador_coordinador o visor.
    """
    return _obtener_valorizacion(db)


@router.get("/consumo-carreras", response_model=ConsumoCarrerasResponse)
def obtener_consumo_carreras(
    semestre: str = Query(..., description="Ej: 2026-1"),
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(require_reportes),
):
    """Costo de insumos consumidos por carrera en un semestre dado.
    Requiere rol admin, operador_coordinador o visor.
    """
    return _obtener_consumo_carreras(db, semestre)
