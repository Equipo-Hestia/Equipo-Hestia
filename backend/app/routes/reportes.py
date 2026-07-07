from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from sqlalchemy.orm import Session
from sqlalchemy import func
from decimal import Decimal
from typing import Optional
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

from app.database import get_db
from app.models.insumo import Insumo
from app.models.solicitud import SolicitudRetiro, SolicitudItem, EstadoSolicitud
from app.models.clase_docente import ClaseDocente
from app.models.asignatura import Asignatura
from app.models.usuario import Usuario
from app.models.paquete_insumo import PaqueteInsumo, PaqueteItem
from app.models.taller import Taller
from app.models.programacion_taller import ProgramacionTaller
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
    # 1. Costo de insumos y cantidad de talleres ejecutados por carrera
    filas_costo = (
        db.query(
            Asignatura.carrera,
            func.sum(PaqueteItem.cantidad_requerida * Insumo.costo_unitario).label("costo"),
            func.count(func.distinct(ProgramacionTaller.id)).label("num_talleres"),
        )
        .select_from(ProgramacionTaller)
        .join(Taller, Taller.id == ProgramacionTaller.taller_id)
        .join(Asignatura, Asignatura.id == Taller.asignatura_id)
        .join(
            PaqueteInsumo,
            (PaqueteInsumo.taller_id == Taller.id)
            & (PaqueteInsumo.semestre == semestre)
        )
        .join(PaqueteItem, PaqueteItem.paquete_id == PaqueteInsumo.id)
        .join(Insumo, Insumo.id == PaqueteItem.insumo_id)
        .filter(
            ProgramacionTaller.semestre == semestre,
            ProgramacionTaller.activo.is_(True),
            Insumo.costo_unitario.isnot(None),
            Asignatura.carrera.isnot(None),
        )
        .group_by(Asignatura.carrera)
        .all()
    )

    # 2. Total real de estudiantes matriculados por carrera (evitando duplicados)
    filas_estudiantes = (
        db.query(
            Asignatura.carrera,
            func.sum(ClaseDocente.num_estudiantes).label("estudiantes"),
        )
        .select_from(ClaseDocente)
        .join(Asignatura, Asignatura.id == ClaseDocente.asignatura_id)
        .filter(
            ClaseDocente.semestre == semestre,
            ClaseDocente.activa.is_(True),
            Asignatura.carrera.isnot(None),
        )
        .group_by(Asignatura.carrera)
        .all()
    )

    # Convertimos los estudiantes a un diccionario para acceso rápido O(1)
    mapa_estudiantes = {f.carrera: (f.estudiantes or 0) for f in filas_estudiantes}

    costo_total_semestre = Decimal("0")
    carreras: list[CarreraConsumo] = []

    for fila in filas_costo:
        costo = Decimal(str(fila.costo or 0))
        num_est = int(mapa_estudiantes.get(fila.carrera, 0))
        costo_total_semestre += costo
        cpp = (costo / num_est) if num_est > 0 else None

        carreras.append(CarreraConsumo(
            carrera=fila.carrera.value if fila.carrera else "Sin carrera",
            costo_total=costo,
            num_solicitudes=fila.num_talleres or 0,
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
    db: Session,
    val: ValorizacionResponse,
    consumo: ConsumoCarrerasResponse,
    semestre: str,
    usuario: Usuario,
) -> bytes:
    """Genera el PDF consolidado usando fpdf2."""
    try:
        from fpdf import FPDF
    except ImportError:
        raise HTTPException(
            status_code=501, detail="fpdf2 no esta instalado."
        )

    # Forzamos hora de Chile (UTC-4/-3 dependiendo de horario de verano)
    zona_chile = ZoneInfo("America/Santiago")
    fecha = datetime.now(zona_chile).strftime("%d/%m/%Y %H:%M")

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
    pdf.cell(PDF_USABLE_W, 10, "Reporte Consolidado de Hestia")
    pdf.ln()
    pdf.set_font("Helvetica", "", 9)
    pdf.set_text_color(*SLATE_MID)
    # Metadatos requeridos: Origen, Quién, Cuándo, Semestre
    meta_str = (
        f"Sistema: Hestia | Generado por: {usuario.nombre} | "
        f"Fecha: {fecha} | Semestre: {semestre}"
    )
    pdf.cell(PDF_USABLE_W, 6, meta_str)
    pdf.ln(10)

    # Obtenemos conteos rapidos de paquetes para los KPIs
    paquetes_count = (
        db.query(PaqueteInsumo)
        .filter(PaqueteInsumo.semestre == semestre)
        .count()
    )

    valor_fmt = f"${val.valor_total_inventario:,.0f}"
    costo_sem_fmt = f"${consumo.costo_total_semestre:,.0f}"
    kpis = [
        ("Valor Inventario Bodega", valor_fmt),
        ("Costo Total Semestre", costo_sem_fmt),
        ("Paquetes Configurados", str(paquetes_count)),
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

    # 1. Costo por carrera
    if consumo.carreras:
        _seccion("Costo por Carrera")
        _encabezado([
            ("Carrera", 100, "L"),
            ("Talleres Ejecutados", 35, "R"),
            ("Total Estudiantes", 35, "R"),
            ("Costo Total", 45, "R"),
            ("Costo Prom. Estudiante", 52, "R"),
        ])
        for idx, c in enumerate(consumo.carreras):
            cpp = f"${c.costo_por_estudiante:,.0f}" if c.costo_por_estudiante else "-"
            _fila([
                (c.carrera, 100, "L"),
                (str(c.num_solicitudes), 35, "R"),
                (str(c.num_estudiantes_total), 35, "R"),
                (f"${c.costo_total:,.0f}", 45, "R"),
                (cpp, 52, "R"),
            ], idx % 2 == 0)
        pdf.ln(6)

    # 2. Resumen Categorías
    if val.por_categoria:
        _seccion("Valorizacion por Categoria en Bodega")
        _encabezado([
            ("Nombre", 160, "L"),
            ("Valor Total", 67, "R"),
            ("Cantidad Insumos", 40, "C"),
        ])
        for idx, g in enumerate(val.por_categoria):
            _fila([
                (g.nombre, 160, "L"),
                (f"${g.valor_total:,.0f}", 67, "R"),
                (str(g.cantidad_insumos), 40, "C"),
            ], idx % 2 == 0)

    return bytes(pdf.output())


def _generar_xlsx_bytes(
    db: Session,
    val: ValorizacionResponse,
    consumo: ConsumoCarrerasResponse,
    semestre: str,
    usuario: Usuario,
) -> bytes:
    """Genera Excel (.xlsx) con KPIs, Carreras, Bodega y Paquetes."""
    try:
        import openpyxl
        from openpyxl.styles import Font, PatternFill, Alignment
        from openpyxl.utils import get_column_letter
        import io
    except ImportError:
        raise HTTPException(
            status_code=501, detail="openpyxl no esta instalado."
        )

    TEAL_HEX = "0D7377"
    HEADER_FILL = PatternFill("solid", fgColor=TEAL_HEX)
    HEADER_FONT = Font(color="FFFFFF", bold=True, size=10)
    ALT_FILL = PatternFill("solid", fgColor="F0FDFA")
    CENTER = Alignment(horizontal="center", vertical="center")

    zona_chile = ZoneInfo("America/Santiago")
    fecha = datetime.now(zona_chile).strftime("%d/%m/%Y %H:%M")

    wb = openpyxl.Workbook()

    # -----------------------------------------------------------------------
    # Hoja 1: Resumen General
    # -----------------------------------------------------------------------
    ws1 = wb.active
    ws1.title = "Resumen"

    ws1.append(["Reporte Consolidado - Hestia"])
    ws1["A1"].font = Font(bold=True, size=14, color=TEAL_HEX)

    meta_str = (
        f"Generado por: {usuario.nombre} | Fecha: {fecha} | "
        f"Sistema: Hestia | Semestre: {semestre}"
    )
    ws1.append([meta_str])
    ws1.append([])

    # Costo Carrera
    ws1.append(["Consumo por Carrera (Semestre Actual)"])
    ws1[ws1.max_row][0].font = Font(bold=True, size=12)

    h_carr = [
        "Carrera", "Talleres", "Estudiantes",
        "Costo Total", "Costo/Estudiante"
    ]
    ws1.append(h_carr)
    for cell in ws1[ws1.max_row]:
        cell.fill = HEADER_FILL
        cell.font = HEADER_FONT
        cell.alignment = CENTER

    for idx, c in enumerate(consumo.carreras):
        ws1.append([
            c.carrera,
            c.num_solicitudes,
            c.num_estudiantes_total,
            float(c.costo_total),
            float(c.costo_por_estudiante) if c.costo_por_estudiante else 0,
        ])
        if idx % 2 == 0:
            for cell in ws1[ws1.max_row]:
                cell.fill = ALT_FILL

    ws1.append([])

    # Categorias Bodega
    ws1.append(["Valorizacion por Categoria (Bodega Actual)"])
    ws1[ws1.max_row][0].font = Font(bold=True, size=12)

    ws1.append(["Categoria", "Valor Total (CLP)", "Cant. Insumos"])
    for cell in ws1[ws1.max_row]:
        cell.fill = HEADER_FILL
        cell.font = HEADER_FONT
        cell.alignment = CENTER

    for idx, g in enumerate(val.por_categoria):
        ws1.append([g.nombre, float(g.valor_total), g.cantidad_insumos])
        if idx % 2 == 0:
            for cell in ws1[ws1.max_row]:
                cell.fill = ALT_FILL

    ws1.column_dimensions["A"].width = 45
    ws1.column_dimensions["B"].width = 25
    ws1.column_dimensions["C"].width = 20
    ws1.column_dimensions["D"].width = 20
    ws1.column_dimensions["E"].width = 20

    # -----------------------------------------------------------------------
    # Hoja 2: Detalle Inventario (Se mantiene igual, solo ajusta anchos)
    # -----------------------------------------------------------------------
    ws2 = wb.create_sheet("Bodega Detalle")
    headers2 = [
        "Nombre", "SKU", "Stock Actual",
        "Costo Unitario (CLP)", "Valor Total (CLP)", "Categoria",
    ]
    ws2.append(headers2)
    for cell in ws2[1]:
        cell.fill = HEADER_FILL
        cell.font = HEADER_FONT

    for idx, i in enumerate(val.insumos):
        ws2.append([
            i.nombre, i.sku or "", i.stock_actual,
            float(i.costo_unitario), float(i.valor_total), i.categoria or "",
        ])
        if idx % 2 == 0:
            for cell in ws2[ws2.max_row]:
                cell.fill = ALT_FILL

    for w, col in zip([50, 15, 14, 22, 22, 30], range(1, 7)):
        ws2.column_dimensions[get_column_letter(col)].width = w

    # -----------------------------------------------------------------------
    # Hoja 3: Paquetes de Insumos (Se mantiene intacto)
    # -----------------------------------------------------------------------
    ws3 = wb.create_sheet("Paquetes de Insumos")
    paquetes = (
        db.query(PaqueteInsumo)
        .order_by(PaqueteInsumo.semestre, PaqueteInsumo.id)
        .all()
    )

    headers3 = [
        "Semestre", "Taller", "Asignatura", "Carrera",
        "Insumo / Implemento", "Tipo", "Cantidad Requerida", "Notas", "Estado"
    ]
    ws3.append(headers3)
    for cell in ws3[1]:
        cell.fill = HEADER_FILL
        cell.font = HEADER_FONT

    row_idx = 2
    for paquete in paquetes:
        taller = db.query(Taller).filter(Taller.id == paquete.taller_id).first()
        asig = db.query(Asignatura).filter(Asignatura.id == taller.asignatura_id).first() if taller and taller.asignatura_id else None

        taller_nombre = taller.nombre if taller else "-"
        asig_nombre = asig.nombre if asig else "-"
        carrera_val = asig.carrera.value if (asig and asig.carrera) else "-"
        estado_paq = "Bloqueado" if paquete.bloqueado else "Editable"

        items = db.query(PaqueteItem).filter(PaqueteItem.paquete_id == paquete.id).all()
        if not items:
            ws3.append([paquete.semestre, taller_nombre, asig_nombre, carrera_val, "(sin items)", "", "", "", estado_paq])
            row_idx += 1
            continue

        for item_idx, item in enumerate(items):
            insumo = db.query(Insumo).filter(Insumo.id == item.insumo_id).first()
            ws3.append([
                paquete.semestre if item_idx == 0 else "",
                taller_nombre if item_idx == 0 else "",
                asig_nombre if item_idx == 0 else "",
                carrera_val if item_idx == 0 else "",
                insumo.nombre if insumo else "-",
                insumo.tipo.value if insumo else "-",
                item.cantidad_requerida,
                item.notas or "",
                estado_paq if item_idx == 0 else "",
            ])
            if row_idx % 2 == 0:
                for cell in ws3[row_idx]:
                    cell.fill = ALT_FILL
            row_idx += 1

    for w, col in zip([12, 40, 45, 25, 45, 14, 20, 30, 14], range(1, 10)):
        ws3.column_dimensions[get_column_letter(col)].width = w

    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


# ---------------------------------------------------------------------------
# Rutas de la API (Mantener este orden: estaticas antes de dinamicas)
# ---------------------------------------------------------------------------

@router.get("/exportar/pdf")
def exportar_reportes_pdf(
    semestre: str = Query(..., description="Ej: 2026-1"),
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(require_reportes),
):
    """Exporta el reporte consolidado PDF con la informacion real."""
    val = _obtener_valorizacion(db)
    consumo = _obtener_consumo_carreras(db, semestre)
    try:
        pdf_bytes = _generar_pdf_bytes(db, val, consumo, semestre, usuario)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=500, detail=f"Error al generar PDF: {exc}"
        )
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f"attachment; filename=reporte_hestia_{semestre}.pdf"
        },
    )


@router.get("/exportar/xlsx")
def exportar_reportes_xlsx(
    semestre: str = Query(..., description="Ej: 2026-1"),
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(require_reportes),
):
    """Exporta el Excel consolidado con KPIs, Carreras, Paquetes e Inventario."""
    val = _obtener_valorizacion(db)
    consumo = _obtener_consumo_carreras(db, semestre)
    try:
        xlsx_bytes = _generar_xlsx_bytes(db, val, consumo, semestre, usuario)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=500, detail=f"Error al generar Excel: {exc}"
        )
    nombre = f"reporte_hestia_{semestre}.xlsx"
    return Response(
        content=xlsx_bytes,
        media_type=(
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
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
