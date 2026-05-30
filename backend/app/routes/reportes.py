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
from app.models.paquete_insumo import PaqueteInsumo, PaqueteItem
from app.models.taller import Taller
from app.schemas.reportes import (
    ValorizacionResponse, InsumoValorizado, InsumoSinCosto,
    GrupoValor, ConsumoCarrerasResponse, CarreraConsumo,
)
from app.utils.deps import require_reportes

router = APIRouter(prefix="/reportes", tags=["Reportes"])

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
    conteo_cat: dict[str, int] = {}

    for i in insumos:
        cat_nombre = i.categoria.nombre if i.categoria else "Sin categoria"
        if i.costo_unitario is not None:
            costo = Decimal(str(i.costo_unitario))
            vt = costo * i.stock_actual
            valor_total += vt
            por_categoria[cat_nombre] = (
                por_categoria.get(cat_nombre, Decimal("0")) + vt
            )
            conteo_cat[cat_nombre] = conteo_cat.get(cat_nombre, 0) + 1
            valorizados.append(InsumoValorizado(
                id=i.id,
                nombre=i.nombre,
                sku=i.sku,
                stock_actual=i.stock_actual,
                costo_unitario=costo,
                valor_total=vt,
                sala=None,
                categoria=cat_nombre if i.categoria else None,
            ))
        else:
            sin_costo.append(InsumoSinCosto(
                id=i.id,
                nombre=i.nombre,
                sku=i.sku,
                stock_actual=i.stock_actual,
                sala=None,
                categoria=cat_nombre if i.categoria else None,
            ))

    grupos_cat = [
        GrupoValor(
            nombre=nombre,
            valor_total=valor,
            cantidad_insumos=conteo_cat[nombre],
        )
        for nombre, valor in sorted(
            por_categoria.items(), key=lambda x: -x[1]
        )
    ]

    return ValorizacionResponse(
        valor_total_inventario=valor_total,
        total_insumos_valorados=len(valorizados),
        total_insumos_sin_costo=len(sin_costo),
        por_categoria=grupos_cat,
        por_sala=[],        # sala eliminada de insumos; no aplica
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
    """Genera el PDF de valorizacion usando fpdf2."""
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

    pdf = FPDF(orientation="L", format="A4")
    pdf.set_margins(15, 15, 15)
    pdf.set_auto_page_break(auto=True, margin=15)
    pdf.add_page()

    pdf.set_font("Helvetica", "B", 18)
    pdf.set_text_color(*TEAL)
    pdf.cell(PDF_USABLE_W, 10, "Reporte de Valorizacion de Inventario")
    pdf.ln()
    pdf.set_font("Helvetica", "", 9)
    pdf.set_text_color(*SLATE_MID)
    pdf.cell(PDF_USABLE_W, 6, f"Generado el {fecha}{semestre_str}")
    pdf.ln(10)

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

    COLS_GRUPO = [
        ("Nombre", 180, "L"),
        ("Valor Total", 57, "R"),
        ("Insumos", 30, "C"),
    ]

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

    if val.insumos:
        _seccion(
            f"Detalle de Insumos Valorizados ({val.total_insumos_valorados})"
        )
        cols_det = [
            ("Nombre", 95, "L"),
            ("SKU", 28, "L"),
            ("Stock", 18, "C"),
            ("Costo Unit.", 30, "R"),
            ("Valor Total", 32, "R"),
            ("Categoria", 64, "L"),
        ]
        _encabezado(cols_det)
        for idx, i in enumerate(val.insumos):
            _fila([
                (i.nombre[:45], 95, "L"),
                (i.sku or "-", 28, "L"),
                (str(i.stock_actual), 18, "C"),
                (f"${i.costo_unitario:,.0f}", 30, "R"),
                (f"${i.valor_total:,.0f}", 32, "R"),
                ((i.categoria or "-")[:35], 64, "L"),
            ], idx % 2 == 0)

    return bytes(pdf.output())


def _generar_xlsx_bytes(
    db: Session,
    val: ValorizacionResponse,
    semestre: Optional[str],
) -> bytes:
    """Genera un Excel (.xlsx) con valorizacion del inventario y paquetes.

    Hojas:
    1. Resumen - KPIs y totales por categoria
    2. Detalle Inventario - fila por insumo valorizado
    3. Paquetes de Insumos - todos los paquetes con sus items
    """
    try:
        import openpyxl
        from openpyxl.styles import (
            Font, PatternFill, Alignment, Border, Side
        )
        from openpyxl.utils import get_column_letter
        import io
    except ImportError:
        raise HTTPException(
            status_code=501,
            detail=(
                "openpyxl no esta instalado en el contenedor. "
                "Ejecuta: docker compose build --no-cache api"
            ),
        )

    # Estilos
    TEAL_HEX = "0D7377"
    HEADER_FILL = PatternFill("solid", fgColor=TEAL_HEX)
    HEADER_FONT = Font(color="FFFFFF", bold=True, size=10)
    ALT_FILL = PatternFill("solid", fgColor="F0FDFA")
    BOLD = Font(bold=True)
    CENTER = Alignment(horizontal="center", vertical="center")
    RIGHT = Alignment(horizontal="right", vertical="center")
    LEFT = Alignment(horizontal="left", vertical="center")
    THIN = Side(style="thin", color="E2E8F0")
    BORDER = Border(bottom=THIN)

    fecha = datetime.now(timezone.utc).strftime("%d/%m/%Y %H:%M UTC")
    semestre_str = semestre or "N/A"

    wb = openpyxl.Workbook()

    # -----------------------------------------------------------------------
    # Hoja 1: Resumen
    # -----------------------------------------------------------------------
    ws1 = wb.active
    ws1.title = "Resumen"

    ws1.append(["Reporte de Valorizacion de Inventario - Hestia"])
    ws1["A1"].font = Font(bold=True, size=14, color=TEAL_HEX)
    ws1.append([f"Generado el {fecha} | Semestre: {semestre_str}"])
    ws1.append([])

    # KPIs
    kpis = [
        ("Valor Total Inventario",
         float(val.valor_total_inventario)),
        ("Insumos con Costo",
         val.total_insumos_valorados),
        ("Insumos sin Costo",
         val.total_insumos_sin_costo),
    ]
    ws1.append(["KPI", "Valor"])
    for cell in ws1[ws1.max_row]:
        cell.fill = HEADER_FILL
        cell.font = HEADER_FONT
        cell.alignment = CENTER
    for label, value in kpis:
        ws1.append([label, value])

    ws1.append([])
    ws1.append(["Por Categoria", "Valor Total (CLP)", "Insumos"])
    for cell in ws1[ws1.max_row]:
        cell.fill = HEADER_FILL
        cell.font = HEADER_FONT
        cell.alignment = CENTER
    for idx, g in enumerate(val.por_categoria):
        ws1.append([g.nombre, float(g.valor_total), g.cantidad_insumos])
        if idx % 2 == 0:
            for cell in ws1[ws1.max_row]:
                cell.fill = ALT_FILL

    ws1.column_dimensions["A"].width = 40
    ws1.column_dimensions["B"].width = 22
    ws1.column_dimensions["C"].width = 12

    # -----------------------------------------------------------------------
    # Hoja 2: Detalle Inventario
    # -----------------------------------------------------------------------
    ws2 = wb.create_sheet("Detalle Inventario")
    headers2 = [
        "Nombre", "SKU", "Stock Actual",
        "Costo Unitario (CLP)", "Valor Total (CLP)", "Categoria",
    ]
    ws2.append(headers2)
    for cell in ws2[1]:
        cell.fill = HEADER_FILL
        cell.font = HEADER_FONT
        cell.alignment = CENTER

    for idx, i in enumerate(val.insumos):
        ws2.append([
            i.nombre,
            i.sku or "",
            i.stock_actual,
            float(i.costo_unitario),
            float(i.valor_total),
            i.categoria or "",
        ])
        if idx % 2 == 0:
            for cell in ws2[ws2.max_row]:
                cell.fill = ALT_FILL

    widths2 = [50, 15, 14, 22, 22, 30]
    for col_idx, w in enumerate(widths2, 1):
        ws2.column_dimensions[get_column_letter(col_idx)].width = w

    # Formato numerico para columnas de costo
    for row in ws2.iter_rows(min_row=2):
        row[2].alignment = RIGHT
        row[3].alignment = RIGHT
        row[4].alignment = RIGHT

    # -----------------------------------------------------------------------
    # Hoja 3: Paquetes de Insumos
    # -----------------------------------------------------------------------
    ws3 = wb.create_sheet("Paquetes de Insumos")

    paquetes = (
        db.query(PaqueteInsumo)
        .order_by(PaqueteInsumo.semestre, PaqueteInsumo.id)
        .all()
    )

    headers3 = [
        "Semestre", "Taller", "Asignatura", "Carrera",
        "Insumo / Implemento", "Tipo", "Cantidad Requerida", "Notas",
        "Estado Paquete",
    ]
    ws3.append(headers3)
    for cell in ws3[1]:
        cell.fill = HEADER_FILL
        cell.font = HEADER_FONT
        cell.alignment = CENTER

    row_idx = 2
    for paquete in paquetes:
        taller = (
            db.query(Taller).filter(Taller.id == paquete.taller_id).first()
        )
        asig = None
        if taller and taller.asignatura_id:
            asig = (
                db.query(Asignatura)
                .filter(Asignatura.id == taller.asignatura_id)
                .first()
            )
        taller_nombre = taller.nombre if taller else "-"
        asig_nombre = asig.nombre if asig else "-"
        carrera_val = asig.carrera.value if (asig and asig.carrera) else "-"
        estado_paq = "Bloqueado" if paquete.bloqueado else "Editable"

        items = (
            db.query(PaqueteItem)
            .filter(PaqueteItem.paquete_id == paquete.id)
            .all()
        )
        if not items:
            ws3.append([
                paquete.semestre, taller_nombre, asig_nombre,
                carrera_val, "(sin items)", "", "", "", estado_paq,
            ])
            row_idx += 1
            continue

        for item_idx, item in enumerate(items):
            insumo = (
                db.query(Insumo).filter(Insumo.id == item.insumo_id).first()
            )
            insumo_nombre = insumo.nombre if insumo else "-"
            tipo_str = insumo.tipo.value if insumo else "-"
            ws3.append([
                paquete.semestre if item_idx == 0 else "",
                taller_nombre if item_idx == 0 else "",
                asig_nombre if item_idx == 0 else "",
                carrera_val if item_idx == 0 else "",
                insumo_nombre,
                tipo_str,
                item.cantidad_requerida,
                item.notas or "",
                estado_paq if item_idx == 0 else "",
            ])
            if row_idx % 2 == 0:
                for cell in ws3[row_idx]:
                    cell.fill = ALT_FILL
            row_idx += 1

    widths3 = [12, 40, 45, 25, 45, 14, 20, 30, 14]
    for col_idx, w in enumerate(widths3, 1):
        ws3.column_dimensions[get_column_letter(col_idx)].width = w

    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


# IMPORTANTE: rutas estaticas ANTES de las dinamicas /{param}
# Orden: /valorizacion/pdf, /valorizacion/xlsx, /valorizacion, /consumo-carreras

@router.get("/valorizacion/pdf")
def exportar_valorizacion_pdf(
    semestre: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(require_reportes),
):
    """Exporta el reporte de valorizacion como PDF (fpdf2)."""
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


@router.get("/valorizacion/xlsx")
def exportar_valorizacion_xlsx(
    semestre: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(require_reportes),
):
    """Exporta el reporte de valorizacion + paquetes como Excel (openpyxl).

    3 hojas: Resumen (KPIs + por categoria), Detalle Inventario, Paquetes.
    Requiere rol admin, operador_coordinador o visor.
    """
    val = _obtener_valorizacion(db)
    try:
        xlsx_bytes = _generar_xlsx_bytes(db, val, semestre)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Error al generar Excel: {exc}",
        )
    nombre = f"valorizacion_hestia{f'_{semestre}' if semestre else ''}.xlsx"
    return Response(
        content=xlsx_bytes,
        media_type=(
            "application/vnd.openxmlformats-officedocument"
            ".spreadsheetml.sheet"
        ),
        headers={
            "Content-Disposition": f"attachment; filename={nombre}"
        },
    )


@router.get("/valorizacion", response_model=ValorizacionResponse)
def obtener_valorizacion(
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(require_reportes),
):
    """Valor del inventario activo agrupado por categoria."""
    return _obtener_valorizacion(db)


@router.get("/consumo-carreras", response_model=ConsumoCarrerasResponse)
def obtener_consumo_carreras(
    semestre: str = Query(..., description="Ej: 2026-1"),
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(require_reportes),
):
    """Costo de insumos consumidos por carrera en un semestre dado."""
    return _obtener_consumo_carreras(db, semestre)
