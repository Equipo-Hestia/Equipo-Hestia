from fastapi import (
    APIRouter, Depends, File, Form, Header, UploadFile,
    HTTPException, status,
)
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from pydantic import BaseModel
from typing import Optional
import csv
import io
import pyotp

from app.database import get_db
from app.models.asignatura import Asignatura
from app.models.clase_docente import ClaseDocente
from app.models.insumo import Insumo, TipoInsumo
from app.models.sala import Sala
from app.models.categoria import Categoria
from app.models.usuario import Usuario
from app.utils.deps import require_admin

router = APIRouter(prefix="/importar", tags=["Importacion"])

TOTP_VALID_WINDOW = 1
COLUMNAS_REQUERIDAS = {"nombre", "stock_actual", "stock_minimo"}

# Caracteres que inician formulas en Excel/Calc (CSV Formula Injection).
_FORMULA_PREFIXES = ('=', '+', '-', '@', '\t', '\r')

COLUMNAS_HORARIO = [
    "email_docente", "codigo_asignatura", "seccion", "semestre",
    "sala", "dia_semana", "hora_inicio", "hora_fin",
]

EJEMPLO_HORARIO = [
    [
        "docente@duoc.cl", "ENF001", "001D", "2025-1",
        "Sala de Simulacion 1", "lunes", "08:30", "12:00",
    ],
    [
        "docente2@duoc.cl", "ENF002", "002J", "2025-1",
        "Laboratorio Clinico", "martes", "14:00", "17:30",
    ],
]

# Mapa de normalizacion de nombres de dia a forma canonica sin tildes.
_DIAS_MAP = {
    'lunes': 'lunes', 'lun': 'lunes', 'monday': 'lunes', 'mon': 'lunes',
    'martes': 'martes', 'mar': 'martes', 'tuesday': 'martes', 'tue': 'martes',
    'miercoles': 'miercoles', 'mie': 'miercoles',
    'miércoles': 'miercoles', 'mié': 'miercoles',
    'wednesday': 'miercoles', 'wed': 'miercoles',
    'jueves': 'jueves', 'jue': 'jueves', 'thursday': 'jueves', 'thu': 'jueves',
    'viernes': 'viernes', 'vie': 'viernes', 'friday': 'viernes', 'fri': 'viernes',
}


class ErrorFila(BaseModel):
    fila: int
    razon: str


class ImportarResponse(BaseModel):
    importados: int
    omitidos: int
    errores: list[ErrorFila]


class HorarioFila(BaseModel):
    email_docente: str
    codigo_asignatura: str
    seccion: str
    semestre: str
    sala: Optional[str] = None
    dia_semana: Optional[str] = None
    hora_inicio: Optional[str] = None
    hora_fin: Optional[str] = None


class HorarioPayload(BaseModel):
    filas: list[HorarioFila]


class HorarioImportResponse(BaseModel):
    importados: int
    actualizados: int
    omitidos: int
    errores: list[ErrorFila]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _sanitizar_texto(valor: str) -> str:
    """Elimina prefijos de formula para prevenir CSV/Formula Injection."""
    while valor and valor[0] in _FORMULA_PREFIXES:
        valor = valor[1:].strip()
    return valor


def _normalizar_dia(dia: Optional[str]) -> Optional[str]:
    """Convierte el nombre del dia a su forma canonica en minusculas.

    Acepta variantes con/sin tilde, abreviaturas de 3 letras e ingles.
    Devuelve None si dia es None o vacio.
    """
    if not dia or not dia.strip():
        return None
    return _DIAS_MAP.get(dia.strip().lower(), dia.strip().lower())


def _verificar_totp(usuario: Usuario, codigo: str) -> None:
    """Lanza 403 si el codigo TOTP no es valido o 2FA no esta habilitado.

    Se usa 403 Forbidden (no 401 Unauthorized) para que el interceptor
    de axios no interprete el error como sesion expirada y cierre la sesion.
    """
    if not usuario.totp_habilitado or not usuario.totp_secret:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Debes tener el 2FA activado para importar archivos."
        )
    totp = pyotp.TOTP(usuario.totp_secret)
    if not totp.verify(codigo, valid_window=TOTP_VALID_WINDOW):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Codigo 2FA incorrecto. Verifica el codigo e intenta nuevamente."
        )


def _fila_xlsx_a_dict(encabezados: list, fila: tuple) -> dict:
    """Convierte una fila de XLSX a dict usando los encabezados."""
    return {
        encabezados[i]: (str(v).strip() if v is not None else "")
        for i, v in enumerate(fila)
    }


def _leer_filas(contenido: bytes, nombre_archivo: str) -> list[dict]:
    """Parsea CSV o XLSX y devuelve una lista de dicts con las filas."""
    extension = nombre_archivo.rsplit(".", 1)[-1].lower()

    if extension == "csv":
        texto = contenido.decode("utf-8-sig")
        reader = csv.DictReader(io.StringIO(texto))
        return [dict(fila) for fila in reader]

    elif extension in ("xlsx", "xls"):
        try:
            import openpyxl
        except ImportError:
            raise HTTPException(status_code=500, detail="openpyxl no instalado.")
        wb = openpyxl.load_workbook(
            io.BytesIO(contenido), read_only=True, data_only=True
        )
        ws = wb.active
        filas = list(ws.iter_rows(values_only=True))
        if not filas:
            return []
        encabezados = [str(c).strip().lower() if c else "" for c in filas[0]]
        return [
            _fila_xlsx_a_dict(encabezados, fila)
            for fila in filas[1:]
            if not all(c is None for c in fila)
        ]

    else:
        raise HTTPException(
            status_code=400,
            detail="Formato no soportado. Usa CSV o XLSX."
        )


def _normalizar_encabezados(filas: list[dict]) -> list[dict]:
    """Convierte todas las claves a minusculas y elimina espacios."""
    return [
        {
            k.strip().lower(): v.strip() if isinstance(v, str) else v
            for k, v in fila.items()
        }
        for fila in filas
    ]


def _buscar_o_crear_sala(nombre: str, db: Session) -> Optional[int]:
    if not nombre:
        return None
    sala = db.query(Sala).filter(Sala.nombre.ilike(nombre.strip())).first()
    if sala:
        return sala.id
    nueva = Sala(nombre=nombre.strip())
    db.add(nueva)
    db.flush()
    return nueva.id


def _buscar_o_crear_categoria(nombre: str, db: Session) -> Optional[int]:
    if not nombre:
        return None
    cat = db.query(Categoria).filter(
        Categoria.nombre.ilike(nombre.strip())
    ).first()
    if cat:
        return cat.id
    nueva = Categoria(nombre=nombre.strip())
    db.add(nueva)
    db.flush()
    return nueva.id


def _procesar_filas(
    filas: list[dict], db: Session
) -> tuple[int, list[ErrorFila]]:
    """Valida e inserta cada fila. Devuelve (importados, errores)."""
    importados = 0
    errores: list[ErrorFila] = []

    for idx, fila in enumerate(filas, start=2):
        nombre = _sanitizar_texto(fila.get("nombre", "").strip())
        if not nombre:
            errores.append(ErrorFila(fila=idx, razon="Campo 'nombre' vacio o ausente."))
            continue

        try:
            stock_actual = int(float(fila.get("stock_actual", "")))
        except (ValueError, TypeError):
            errores.append(ErrorFila(
                fila=idx,
                razon=f"'stock_actual' no es un numero valido: "
                      f"'{fila.get('stock_actual')}'"
            ))
            continue

        try:
            stock_minimo = int(float(fila.get("stock_minimo", "")))
        except (ValueError, TypeError):
            errores.append(ErrorFila(
                fila=idx,
                razon=f"'stock_minimo' no es un numero valido: "
                      f"'{fila.get('stock_minimo')}'"
            ))
            continue

        if stock_actual < 0 or stock_minimo < 0:
            errores.append(ErrorFila(
                fila=idx,
                razon="Los valores de stock no pueden ser negativos."
            ))
            continue

        tipo_raw = _sanitizar_texto(
            (fila.get("tipo", "") or "").strip().lower()
        ) or "insumo"
        if tipo_raw not in ("insumo", "implemento"):
            errores.append(ErrorFila(
                fila=idx,
                razon=f"'tipo' invalido: '{tipo_raw}'. Use 'insumo' o 'implemento'."
            ))
            continue
        tipo = TipoInsumo(tipo_raw)

        sku_raw = _sanitizar_texto((fila.get("sku", "") or "").strip()) or None
        codigo_barras_raw = _sanitizar_texto(
            (fila.get("codigo_barras", "") or "").strip()
        ) or None

        costo_raw = (fila.get("costo_unitario", "") or "").strip()
        costo_unitario = None
        if costo_raw:
            try:
                costo_unitario = float(costo_raw)
                if costo_unitario < 0:
                    raise ValueError("negativo")
            except (ValueError, TypeError):
                errores.append(ErrorFila(
                    fila=idx,
                    razon=f"'costo_unitario' invalido: '{costo_raw}'."
                ))
                continue

        sala_nombre = _sanitizar_texto(fila.get("sala", "").strip())
        categoria_nombre = _sanitizar_texto(fila.get("categoria", "").strip())
        descripcion_raw = _sanitizar_texto(
            (fila.get("descripcion", "") or "").strip()
        )

        sala_id = _buscar_o_crear_sala(sala_nombre, db)
        categoria_id = _buscar_o_crear_categoria(categoria_nombre, db)

        insumo = Insumo(
            nombre=nombre,
            descripcion=descripcion_raw or None,
            stock_actual=stock_actual,
            stock_minimo=stock_minimo,
            sala_id=sala_id,
            categoria_id=categoria_id,
            tipo=tipo,
            sku=sku_raw,
            codigo_barras=codigo_barras_raw,
            costo_unitario=costo_unitario,
        )
        db.add(insumo)
        db.flush()
        if not insumo.sku:
            insumo.sku = f"HST-{insumo.id:05d}"
        importados += 1

    return importados, errores


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("/plantilla")
def descargar_plantilla(
    usuario: Usuario = Depends(require_admin)
):
    """Descarga un CSV de ejemplo con el formato esperado por el importador."""
    filas = [
        [
            "nombre", "tipo", "sku", "codigo_barras", "descripcion",
            "stock_actual", "stock_minimo", "costo_unitario", "sala", "categoria"
        ],
        [
            "Guantes de nitrilo talla M", "insumo", "", "",
            "Caja x100 unidades", "50", "20", "1200",
            "Laboratorio Clinico", "Proteccion personal"
        ],
        [
            "Mascarilla KN95", "insumo", "", "",
            "", "30", "15", "800",
            "Sala de Simulacion", "Proteccion personal"
        ],
        [
            "Jeringa 5ml", "insumo", "", "",
            "Con aguja 21G", "200", "50", "350",
            "Sala de Procedimientos", "Insumos clinicos"
        ],
        [
            "Alcohol isopropilico 70%", "insumo", "", "",
            "Frasco 500ml", "10", "5", "2500", "", "Desinfeccion"
        ],
        [
            "Manikin de RCP adulto", "implemento", "", "",
            "Para practica de reanimacion", "5", "2", "85000",
            "Sala de Simulacion", "Implementos de practica"
        ],
    ]
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerows(filas)
    output.seek(0)
    return StreamingResponse(
        io.BytesIO(output.getvalue().encode("utf-8-sig")),
        media_type="text/csv",
        headers={
            "Content-Disposition": "attachment; filename=plantilla_insumos_hestia.csv"
        }
    )


@router.get("/plantilla-horario")
def descargar_plantilla_horario(
    formato: str = "csv",
    usuario: Usuario = Depends(require_admin),
):
    """Descarga la plantilla de horario academico en CSV o XLSX."""
    filas = [COLUMNAS_HORARIO] + EJEMPLO_HORARIO

    if formato == "xlsx":
        try:
            import openpyxl
        except ImportError:
            raise HTTPException(status_code=500, detail="openpyxl no instalado.")
        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = "Plantilla Horario"
        for fila in filas:
            ws.append(fila)
        salida = io.BytesIO()
        wb.save(salida)
        salida.seek(0)
        return StreamingResponse(
            salida,
            media_type=(
                "application/vnd.openxmlformats-officedocument"
                ".spreadsheetml.sheet"
            ),
            headers={
                "Content-Disposition": (
                    "attachment; filename=plantilla_horario_hestia.xlsx"
                )
            },
        )

    salida = io.StringIO()
    writer = csv.writer(salida)
    writer.writerows(filas)
    salida.seek(0)
    return StreamingResponse(
        io.BytesIO(salida.getvalue().encode("utf-8-sig")),
        media_type="text/csv",
        headers={
            "Content-Disposition": (
                "attachment; filename=plantilla_horario_hestia.csv"
            )
        },
    )


@router.post("/insumos", response_model=ImportarResponse)
def importar_insumos(
    archivo: UploadFile = File(...),
    codigo_totp: str = Form(...),
    usuario: Usuario = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """Importa insumos desde CSV o XLSX. Requiere rol admin + TOTP valido."""
    _verificar_totp(usuario, codigo_totp)

    nombre = archivo.filename or ""
    if not nombre.lower().endswith((".csv", ".xlsx", ".xls")):
        raise HTTPException(
            status_code=400,
            detail="Solo se aceptan archivos .csv o .xlsx"
        )

    contenido = archivo.file.read()
    filas_raw = _leer_filas(contenido, nombre)
    filas = _normalizar_encabezados(filas_raw)

    if not filas:
        raise HTTPException(status_code=400, detail="El archivo esta vacio.")

    columnas_archivo = set(filas[0].keys())
    faltantes = COLUMNAS_REQUERIDAS - columnas_archivo
    if faltantes:
        cols = ', '.join(sorted(faltantes))
        raise HTTPException(
            status_code=400,
            detail=(
                f"Columnas faltantes: {cols}. "
                "Descarga la plantilla para ver el formato."
            )
        )

    importados, errores = _procesar_filas(filas, db)

    if importados > 0:
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
            raise HTTPException(
                status_code=409,
                detail="Conflicto: existen SKUs o codigos de barras duplicados "
                       "en el archivo o ya registrados en el sistema.",
            )
    else:
        db.rollback()

    return ImportarResponse(
        importados=importados,
        omitidos=len(errores),
        errores=errores
    )


@router.post("/horario-academico", response_model=HorarioImportResponse)
def importar_horario_academico(
    payload: HorarioPayload,
    x_totp_code: str = Header(...),
    usuario: Usuario = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Importa horario academico. Crea o actualiza ClaseDocente. Requiere TOTP."""
    _verificar_totp(usuario, x_totp_code)

    importados = 0
    actualizados = 0
    errores: list[ErrorFila] = []

    for idx, fila in enumerate(payload.filas, start=1):
        docente = db.query(Usuario).filter(
            Usuario.email == fila.email_docente.strip(),
            Usuario.activo.is_(True),
        ).first()
        if not docente:
            errores.append(ErrorFila(
                fila=idx,
                razon=f"Docente no encontrado: '{fila.email_docente}'"
            ))
            continue

        asignatura = db.query(Asignatura).filter(
            Asignatura.codigo == fila.codigo_asignatura.strip()
        ).first()
        if not asignatura:
            errores.append(ErrorFila(
                fila=idx,
                razon=(
                    f"Asignatura '{fila.codigo_asignatura}' no encontrada. "
                    "Crearla primero en el modulo de Asignaturas."
                )
            ))
            continue

        dia_norm = _normalizar_dia(fila.dia_semana)
        hora_ini = fila.hora_inicio.strip() if fila.hora_inicio else None
        hora_fin = fila.hora_fin.strip() if fila.hora_fin else None

        clase = db.query(ClaseDocente).filter(
            ClaseDocente.docente_id == docente.id,
            ClaseDocente.asignatura_id == asignatura.id,
            ClaseDocente.seccion == fila.seccion.strip(),
            ClaseDocente.semestre == fila.semestre.strip(),
        ).first()

        if clase:
            clase.activa = True
            if dia_norm:
                clase.dia_semana = dia_norm
            if hora_ini:
                clase.hora_inicio = hora_ini
            if hora_fin:
                clase.hora_fin = hora_fin
            actualizados += 1
        else:
            nueva_clase = ClaseDocente(
                docente_id=docente.id,
                asignatura_id=asignatura.id,
                seccion=fila.seccion.strip(),
                semestre=fila.semestre.strip(),
                activa=True,
                dia_semana=dia_norm,
                hora_inicio=hora_ini,
                hora_fin=hora_fin,
            )
            db.add(nueva_clase)
            importados += 1

    if importados > 0 or actualizados > 0:
        db.commit()

    return HorarioImportResponse(
        importados=importados,
        actualizados=actualizados,
        omitidos=len(errores),
        errores=errores,
    )
