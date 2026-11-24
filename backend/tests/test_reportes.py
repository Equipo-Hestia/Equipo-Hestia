"""Exportacion de reportes en PDF (fpdf2) y Excel (openpyxl)."""
import io

import pytest
from openpyxl import load_workbook

from conftest import unico

SEMESTRE = "2026-1"


@pytest.fixture
def datos_reporte(db, crear_insumo):
    """Datos minimos para que el reporte tenga contenido real."""
    from app.models.asignatura import Asignatura, CarreraAsignatura
    from app.models.categoria import Categoria
    from app.models.insumo import Insumo
    from app.models.paquete_insumo import PaqueteInsumo, PaqueteItem
    from app.models.taller import Taller

    categoria = Categoria(nombre=unico("Categoría reporte"))
    asignatura = Asignatura(nombre=unico("Asignatura reporte"),
                            codigo="R" + unico("")[-8:].upper(),
                            carrera=CarreraAsignatura.TENS)
    db.add_all([categoria, asignatura])
    db.flush()
    insumo_id = crear_insumo(stock=40, minimo=10, costo=1250,
                             nombre=unico("Guantes nitrilo reporte"))
    db.get(Insumo, insumo_id).categoria_id = categoria.id
    taller = Taller(nombre=unico("Taller reporte"), asignatura_id=asignatura.id)
    db.add(taller)
    db.flush()
    paquete = PaqueteInsumo(taller_id=taller.id, semestre=SEMESTRE)
    db.add(paquete)
    db.flush()
    db.add(PaqueteItem(paquete_id=paquete.id, insumo_id=insumo_id, cantidad_requerida=4))
    db.commit()


@pytest.mark.caso(
    "P12",
    "Descargar el reporte consolidado del semestre en PDF y en Excel",
    "Ambos archivos se generan, no están vacíos y son válidos: el PDF tiene "
    "formato PDF y el Excel se puede abrir y tiene hojas con datos",
)
def test_exportar_reportes_pdf_y_excel(client, headers_de, datos_reporte, record_property):
    h = headers_de("operador_coordinador")

    pdf = client.get("/reportes/exportar/pdf", params={"semestre": SEMESTRE}, headers=h)
    xlsx = client.get("/reportes/exportar/xlsx", params={"semestre": SEMESTRE}, headers=h)

    assert pdf.status_code == 200, pdf.text
    assert pdf.headers["content-type"] == "application/pdf"
    assert pdf.content.startswith(b"%PDF-")
    assert b"%%EOF" in pdf.content[-1024:]
    assert len(pdf.content) > 1000

    assert xlsx.status_code == 200, xlsx.text
    assert "spreadsheetml" in xlsx.headers["content-type"]
    libro = load_workbook(io.BytesIO(xlsx.content))
    hojas = {ws.title: ws.max_row for ws in libro.worksheets}
    assert hojas and all(filas > 1 for filas in hojas.values())

    def miles(n: int) -> str:
        return f"{n:,}".replace(",", ".")

    record_property(
        "obtenido",
        f"PDF: {miles(len(pdf.content))} bytes, formato PDF válido. "
        f"Excel: {miles(len(xlsx.content))} bytes, {len(hojas)} hojas con datos "
        f"({', '.join(hojas)})",
    )
