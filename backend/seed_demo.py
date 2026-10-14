#!/usr/bin/env python3
"""
Script de datos de demo para Hestia — Escuela de Salud DuocUC, sede San Bernardo.

Uso:
    docker compose exec api python seed_demo.py   # responder "s"

Borra todos los datos y carga un año académico 2026 completo del Centro de
Simulación Clínica, hasta el momento en que se ejecuta el seed:

    - Enero y febrero: sin clases (inventario inicial, compras, mantenimiento).
    - Semestre 2026-1: 9 de marzo al 3 de julio.
    - Receso de invierno: julio (solo bodega y mantenimiento).
    - Semestre 2026-2: 3 de agosto al 11 de diciembre.
    - Cierre de año: 14 al 30 de diciembre (inventario, devoluciones, bajas).
    - Sin talleres en los feriados chilenos que caen en día hábil.

Ningún movimiento, orden, revisión, incidencia ni registro de auditoría queda
con fecha posterior a la ejecución; solo las programaciones de talleres que
aún no ocurren tienen fecha futura (y las fechas de retorno *estimadas* de
mantenimiento, que son por naturaleza una estimación).

Carreras: las 5 que usan el Centro de Simulación — TENS, TQF, TLCBS, TONS y
Preparador Físico — todas con asignaturas, secciones, talleres y paquetes en
ambos semestres. Preparador Físico usa las salas de RCP y de simulación
general (012, 020, 021 y 022) e insumos propios (categoría Preparación Física).

Siglas: las asignaturas usan siglas reales DuocUC, excepto estas, que son
ILUSTRATIVAS (no confirmadas): tres de TQF del semestre 2026-2 (PFS2111,
PFS2121, PFS2131) y las cinco de Preparador Físico (PRF1111, PRF1121, PRF3111,
PRF2111, PRF4111). Ver docs/DEMO.md.

Contenido (cifras de una carga a mediados de diciembre; antes hay menos historia):
    - 18 salas, 14 categorías, 5 proveedores
    - 6 usuarios con 2FA TOTP ya configurado (secretos fijos de demo)
    - 24 docentes (sin cuenta de usuario) y 8 comentarios de coordinación
    - 37 asignaturas de 5 carreras y 90 secciones con horario (45 por semestre)
    - 112 insumos e implementos (14 bajo mínimo, 3 de ellos agotados);
      los 29 implementos tienen 318 unidades operativas y 11 dadas de baja
    - 30 activos fijos en todos sus estados
    - 50 talleres y 59 paquetes de insumos (30 en 2026-1, 29 en 2026-2)
    - ~1.470 programaciones de taller; las pasadas con su revisión de sala
      (~1.465 revisiones, ~12.000 ítems)
    - 5 programaciones para hoy (Vista de Salas en vivo, ver docs/DEMO.md)
    - ~11.200 movimientos de los 11 subtipos; stock = entradas - salidas
    - ~60 órdenes de entrada en todos los estados del ciclo
    - 10 órdenes de mantenimiento, 17 incidencias, ~7.550 registros de auditoría

El seed es determinista: dos ejecuciones el mismo día producen los mismos
datos (solo cambian las horas relativas de las programaciones de hoy y el
hash bcrypt de las contraseñas, que siempre lleva una sal aleatoria).
Termina con una autoverificación (stock, fechas, Vista de Salas de hoy, guion,
2FA, calendario y cobertura de las 5 carreras en ambos semestres); si falla,
deshace todo y sale con error.

Credenciales (detalle y secretos TOTP en docs/DEMO.md):
    admin@hestia.duoc.cl          / Admin2024!
    psoto@hestia.duoc.cl          / Coord2024!
    mgonzalez@hestia.duoc.cl      / Oper2024!
    cfuentes@hestia.duoc.cl       / Oper2024!
    amartinez@hestia.duoc.cl      / Visor2024!
    lperez@hestia.duoc.cl         / Visor2024!
"""

import hashlib
import json
import os
import random
import re
import sys
import time as time_mod
from collections import defaultdict
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.database import SessionLocal  # noqa: E402
from app.models import rol  # noqa: F401,E402  <- antes de usuario (FK roles)
from app.models.rol import Rol  # noqa: E402
from app.models.sala import Sala  # noqa: E402
from app.models.insumo import Insumo, TipoInsumo  # noqa: E402
from app.models.movimiento import (  # noqa: E402
    Movimiento, TipoMovimiento, SubtipoMovimiento,
)
from app.models.usuario import Usuario, RolUsuario  # noqa: E402
from app.models.audit_log import AuditLog  # noqa: E402
from app.models.solicitud import SolicitudRetiro, SolicitudItem  # noqa: E402
from app.models.asignatura import Asignatura, CarreraAsignatura  # noqa: E402
# Docente y ComentarioDocente deben importarse ANTES de ClaseDocente para que
# el mapper de SQLAlchemy pueda resolver relationship("Docente", ...).
from app.models.docente import (  # noqa: E402
    Docente, ComentarioDocente, TipoComentario,
)
from app.models.clase_docente import ClaseDocente  # noqa: E402
from app.models.retorno_implemento import RetornoImplemento  # noqa: E402
from app.models.activo_fijo import (  # noqa: E402
    ActivoFijo, TipoActivo, EstadoActivo, FidelidadPhantoma,
)
from app.models.unidad_implemento import UnidadImplemento, EstadoUnidad  # noqa: E402
# IMPORTANTE: taller y paquete_insumo deben importarse antes de cualquier
# query ORM para que el mapper registre las relaciones de Asignatura.
from app.models.taller import Taller  # noqa: E402
from app.models.paquete_insumo import PaqueteInsumo, PaqueteItem  # noqa: E402
from app.models.proveedor import Proveedor  # noqa: E402
from app.models.orden_mantenimiento import (  # noqa: E402
    OrdenMantenimiento, OrdenMantenimientoItem,
    EstadoOrden as EstadoOrdenMant, ResultadoItem, TipoMantenimiento,
)
from app.models.programacion_taller import ProgramacionTaller  # noqa: E402
from app.models.revision_sala import RevisionSala, RevisionSalaItem  # noqa: E402
from app.models.incidencia import (  # noqa: E402
    Incidencia, TipoIncidencia, SeveridadIncidencia, EstadoIncidencia,
)
from app.models.orden_entrada import (  # noqa: E402
    OrdenEntrada, OrdenEntradaItem,
    TipoOrden, EstadoOrden as EstadoOrdenEntrada,
    EstadoItem as EstadoItemOrden, TipoItemOrden,
)
from app.models.token_recuperacion import TokenRecuperacion  # noqa: E402
from app.utils.security import hashear_password  # noqa: E402
from sqlalchemy import text  # noqa: E402

try:
    from app.models.categoria import Categoria  # noqa: E402
except ImportError:
    from app.models.categoria import Categorium as Categoria  # noqa: E402

ZONA = ZoneInfo("America/Santiago")


def _ahora() -> datetime:
    """Momento de ejecución en hora de Santiago (punto único de "ahora")."""
    return datetime.now(ZONA)


# ===========================================================================
# Calendario académico 2026
# ===========================================================================

SEMESTRES = {
    "2026-1": (date(2026, 3, 9), date(2026, 7, 3)),
    "2026-2": (date(2026, 8, 3), date(2026, 12, 11)),
}
INICIO_ANIO = date(2026, 1, 5)
FIN_ANIO = date(2026, 12, 30)

# Feriados nacionales de Chile 2026 (los que caen en día hábil se omiten del
# calendario de talleres y de la operación de bodega).
FERIADOS = {
    date(2026, 1, 1): "Año Nuevo",
    date(2026, 4, 3): "Viernes Santo",
    date(2026, 4, 4): "Sábado Santo",
    date(2026, 5, 1): "Día del Trabajo",
    date(2026, 5, 21): "Día de las Glorias Navales",
    date(2026, 6, 21): "Día Nacional de los Pueblos Indígenas",
    date(2026, 6, 29): "San Pedro y San Pablo",
    date(2026, 7, 16): "Virgen del Carmen",
    date(2026, 8, 15): "Asunción de la Virgen",
    date(2026, 9, 18): "Independencia Nacional",
    date(2026, 9, 19): "Día de las Glorias del Ejército",
    date(2026, 10, 12): "Encuentro de Dos Mundos",
    date(2026, 10, 31): "Día de las Iglesias Evangélicas",
    date(2026, 11, 1): "Día de Todos los Santos",
    date(2026, 12, 8): "Inmaculada Concepción",
    date(2026, 12, 25): "Navidad",
}

# Bloques horarios del Centro de Simulación (sin vespertino tardío).
BLOQUES = [
    ("08:30", "10:50"),
    ("11:00", "13:20"),
    ("14:30", "16:50"),
    ("17:00", "19:20"),
]
# Claves sin tilde a propósito: Ver Horario agrupa por estas claves exactas
# ('miercoles'); con tilde la columna Miércoles quedaría vacía.
DIAS_SEMANA = ["lunes", "martes", "miercoles", "jueves", "viernes"]

SALAS_PISO1 = [f"Sala {n:03d}" for n in range(10, 23)]

# ===========================================================================
# Catálogos
# ===========================================================================

TENS = CarreraAsignatura.TENS
TQF = CarreraAsignatura.TQF
TLCBS = CarreraAsignatura.TLCBS
TONS = CarreraAsignatura.TONS
PF = CarreraAsignatura.preparador_fisico
# Las 5 carreras de la Escuela de Salud que usan el Centro de Simulación.
CARRERAS = [TENS, TQF, TLCBS, TONS, PF]
ETIQUETA_CARRERA = {PF: "Preparador Físico"}
IN = "insumo"
IM = "implemento"

SIM = "Sala de simulación clínica - piso -1"
LAB = "Laboratorio clínico de simulación - piso -1"
FAR = "Laboratorio de farmacia - piso -1"
ODO = "Box de odontología - edificio anexo"
SALAS = [
    ("Sala 010", "simulación", "Sala de simulación de alta fidelidad - piso -1"),
    ("Sala 011", "simulación", SIM),
    ("Sala 012", "simulación", "Sala de RCP y urgencias - piso -1"),
    ("Sala 013", "simulación", "Sala de simulación pediátrica - piso -1"),
    ("Sala 014", "simulación", SIM),
    ("Sala 015", "simulación", SIM),
    ("Sala 016", "simulación", LAB),
    ("Sala 017", "simulación", LAB),
    ("Sala 018", "simulación", FAR),
    ("Sala 019", "simulación", FAR),
    ("Sala 020", "simulación", SIM),
    ("Sala 021", "simulación", SIM),
    ("Sala 022", "simulación", SIM),
    ("Bodega", "bodega", "Bodega central de insumos - piso -1"),
    ("Oficina", "oficina", "Oficina de coordinación - piso -1"),
    ("Sala 07 - Odontología", "odontología", ODO),
    ("Sala 08 - Odontología", "odontología", ODO),
    ("Sala 09 - Odontología", "odontología", ODO),
]
ODO7, ODO8, ODO9 = (
    "Sala 07 - Odontología", "Sala 08 - Odontología", "Sala 09 - Odontología",
)

CATEGORIAS = [
    "Protección Personal (EPP)",        # 0
    "Vendajes y Apósitos",              # 1
    "Material de Sutura",               # 2
    "Instrumental de Diagnóstico",      # 3
    "Cateterismo y Venoclisis",         # 4
    "Inyectología",                     # 5
    "Oxigenoterapia",                   # 6
    "Gestión de Residuos",              # 7
    "Medicamentos de Emergencia",       # 8
    "Higiene y Antisépticos",           # 9
    "Laboratorio Clínico",              # 10
    "Odontología",                      # 11
    "Farmacia",                         # 12
    "Preparación Física",               # 13
]

USUARIOS = [
    ("Administrador Hestia", "admin@hestia.duoc.cl", "Admin2024!", RolUsuario.admin),
    (
        "Patricia Soto", "psoto@hestia.duoc.cl", "Coord2024!",
        RolUsuario.operador_coordinador,
    ),
    ("María González", "mgonzalez@hestia.duoc.cl", "Oper2024!", RolUsuario.operador),
    ("Carlos Fuentes", "cfuentes@hestia.duoc.cl", "Oper2024!", RolUsuario.operador),
    ("Ana Martínez", "amartinez@hestia.duoc.cl", "Visor2024!", RolUsuario.visor),
    ("Luis Pérez", "lperez@hestia.duoc.cl", "Visor2024!", RolUsuario.visor),
]

# ---------------------------------------------------------------------------
# 2FA de demo
# ---------------------------------------------------------------------------
# ADVERTENCIA: estos secretos TOTP son EXCLUSIVOS DE DEMO. Están publicados en
# el repositorio y en docs/DEMO.md, por lo que cualquiera puede generar los
# códigos. NO usarlos en ningún otro entorno (ni producción, ni datos reales).
TOTP_DEMO = {
    "admin@hestia.duoc.cl": "LXMXOC2QI77XU53MY56KUUAIXWA425JK",
    "psoto@hestia.duoc.cl": "5WD44E4LF2UCHICON3T3UHIELEA2BYSV",
    "mgonzalez@hestia.duoc.cl": "YWZ3PHGDHRPASDRM2TIOW4HQH7BV2OCP",
    "cfuentes@hestia.duoc.cl": "KWKFKT4AE4VP4MFTYJXORR2DNU4567VR",
    "amartinez@hestia.duoc.cl": "DZDWCIWYM3NF43AJEGHWI23J5EJJD46X",
    "lperez@hestia.duoc.cl": "XDGZQ733L6F4SENXAPQAYMN2E6XL7HE2",
}


def _recovery_codes_demo(n_usuario: int) -> list[str]:
    """Códigos de recuperación conocidos (EXCLUSIVOS DE DEMO).

    Patrón DE0{n}000{k}-DE0{n}000{k}, con n = posición del usuario en
    USUARIOS (1-6) y k = 0-9. Mismo formato hex XXXXXXXX-XXXXXXXX que
    genera la app, para que el input del login los acepte.
    """
    return [f"DE0{n_usuario}000{k}-DE0{n_usuario}000{k}" for k in range(10)]


def _recovery_codes_json(codigos: list[str]) -> str:
    """Mismo formato que app/routes/auth.py: lista de {hash sha256, usado}."""
    return json.dumps([
        {"hash": hashlib.sha256(c.encode()).hexdigest(), "usado": False}
        for c in codigos
    ])


PROVEEDORES = {
    "laerdal": dict(
        nombre="Laerdal Medical Chile SpA", rut="76.543.210-K",
        contacto_nombre="Roberto Salas", contacto_email="rsalas@laerdal.cl",
        telefono="+56 2 2345 6789",
        url_seneg="https://www.senegocia.com/proveedor/laerdal-chile",
        notas=(
            "Proveedor oficial de phantomas Laerdal. "
            "Mantenimiento preventivo semestral incluido en contrato."
        ),
    ),
    "medsupply": dict(
        nombre="MedSupply SpA", rut="76.111.222-3",
        contacto_nombre="Patricia Vega", contacto_email="pvega@medsupply.cl",
        telefono="+56 9 8765 4321", url_seneg=None,
        notas="Proveedor general de insumos médicos desechables.",
    ),
    "biomed": dict(
        nombre="Equipos Médicos del Sur SpA", rut="76.845.120-5",
        contacto_nombre="Andrés Muñoz", contacto_email="amunoz@equiposdelsur.cl",
        telefono="+56 2 2987 1122", url_seneg=None,
        notas=(
            "Instrumental de diagnóstico, calibración y servicio técnico "
            "de equipos biomédicos."
        ),
    ),
    "dental": dict(
        nombre="Dental Maipo Ltda.", rut="77.210.334-8",
        contacto_nombre="Fernanda Rivas", contacto_email="frivas@dentalmaipo.cl",
        telefono="+56 2 2856 4410", url_seneg=None,
        notas="Insumos odontológicos y servicio técnico de equipos dentales.",
    ),
    "quimica": dict(
        nombre="Química Analítica Central SpA", rut="76.990.441-2",
        contacto_nombre="Jorge Castillo", contacto_email="jcastillo@qacentral.cl",
        telefono="+56 2 2733 9051", url_seneg=None,
        notas="Material de laboratorio clínico y farmacéutico.",
    ),
}

# Formato: (nombre, email, rut, carrera_principal)
# Los docentes NO tienen cuenta en Hestia; son registros de la coordinación.
DOCENTES_DATA = [
    ("Olga Tapia", "olga.tapia@duoc.cl", "13.456.789-0", TENS),
    ("Damaris Rojas", "damaris.rojas@duoc.cl", "14.567.890-1", TENS),
    ("Diego Pérez", "diego.perez@duoc.cl", "15.678.901-2", TENS),
    ("David Contreras", "david.contreras@duoc.cl", "16.789.012-3", TENS),
    ("Felipe Alegría", "felipe.alegria@duoc.cl", "17.890.123-4", TENS),
    ("Claudia Romero", "claudia.romero@duoc.cl", "18.901.234-5", TENS),
    ("María José Toro", "mariajose.toro@duoc.cl", "19.012.345-6", TENS),
    ("Daniela Soto", "daniela.soto@duoc.cl", "20.123.456-7", TENS),
    ("Constanza Zúñiga", "constanza.zuniga@duoc.cl", "21.234.567-8", TENS),
    ("Lissett Ayala", "lissett.ayala@duoc.cl", "22.345.678-9", TLCBS),
    ("Carolina Quinio", "carolina.quinio@duoc.cl", "23.456.789-0", TLCBS),
    ("Alicia Díaz", "alicia.diaz@duoc.cl", "24.567.890-1", TLCBS),
    ("Javiera Fuentes Torres", "javiera.fuentes@duoc.cl", "25.678.901-2", TONS),
    ("Daniela Muñoz", "daniela.munoz@duoc.cl", "26.789.012-3", TONS),
    ("Francisco Garay", "francisco.garay@duoc.cl", "27.890.123-4", TQF),
    ("Ignacio Bravo", "ignacio.bravo@duoc.cl", "15.234.876-5", TENS),
    ("Sebastián Núñez", "sebastian.nunez@duoc.cl", "16.345.987-K", TENS),
    ("Marcela Ortiz", "marcela.ortiz@duoc.cl", "17.456.098-7", TLCBS),
    ("Verónica Lagos", "veronica.lagos@duoc.cl", "18.567.109-8", TLCBS),
    ("Camila Riquelme", "camila.riquelme@duoc.cl", "19.678.210-9", TONS),
    ("Rodrigo Valdés", "rodrigo.valdes@duoc.cl", "14.789.321-0", TQF),
    ("Paula Henríquez", "paula.henriquez@duoc.cl", "13.890.432-1", TQF),
    ("Matías Carrasco", "matias.carrasco@duoc.cl", "17.234.567-1", PF),
    ("Fernanda Leiva", "fernanda.leiva@duoc.cl", "18.345.678-2", PF),
]
# Docentes incorporados para el segundo semestre (fecha de registro en julio).
DOCENTES_2026_2 = {
    "Ignacio Bravo", "Sebastián Núñez", "Marcela Ortiz", "Camila Riquelme",
    "Rodrigo Valdés", "Paula Henríquez",
}

# Formato: (nombre, codigo, carrera, {semestre: n_secciones}, salas, frecuencia)
# frecuencia 1 = taller semanal, 2 = cada dos semanas.
# El nivel de la sigla define el semestre (niveles 1 y 3 en 2026-1, 2 y 4 en
# 2026-2); AXS1102, EBS1111, CES3121 y TMS1111 se dictan en ambos semestres.
S1 = "2026-1"
S2 = "2026-2"
ASIGNATURAS = [
    # TENS (siglas reales)
    ("Técnicas de Primeros Auxilios", "AXS1102", TENS, {S1: 4, S2: 3},
     ["Sala 012", "Sala 020", "Sala 021"], 1),
    ("Técnicas Básicas de Enfermería", "EBS1111", TENS, {S1: 4, S2: 3},
     ["Sala 011", "Sala 014", "Sala 015"], 1),
    ("Bioseguridad en Enfermería", "EBS1121", TENS, {S1: 3},
     ["Sala 014", "Sala 022"], 1),
    ("Cuidados de Enfermería en Pediatría", "CES3111", TENS, {S1: 3},
     ["Sala 013"], 1),
    ("Cuidados de Enfermería en Urgencias", "CES3121", TENS, {S1: 3, S2: 3},
     ["Sala 010", "Sala 012"], 1),
    ("Manejo de Equipos e Insumos", "MES3111", TENS, {S1: 3},
     ["Sala 015", "Sala 022"], 1),
    ("Anatomía (malla vigente)", "AFS1111", TENS, {S1: 2},
     ["Sala 020", "Sala 021"], 1),
    ("Anatomía (malla nueva 2026)", "CIS1103", TENS, {S1: 2},
     ["Sala 021", "Sala 020"], 1),
    ("Administración de Fármacos", "EBS2111", TENS, {S2: 4},
     ["Sala 014", "Sala 015", "Sala 022"], 1),
    ("Médico Quirúrgico", "CES2121", TENS, {S2: 4},
     ["Sala 010", "Sala 011", "Sala 013"], 1),
    ("Habilidades para el Trabajo", "HES4111", TENS, {S2: 2},
     ["Sala 021", "Sala 020"], 1),
    ("Promoción en Salud", "PMS4111", TENS, {S2: 3},
     ["Sala 022", "Sala 020"], 1),
    # TQF (PFS1115 real; PFS2111, PFS2121 y PFS2131 son siglas ilustrativas)
    ("Química Analítica e Instrumental", "PFS1115", TQF, {S1: 2},
     ["Sala 018", "Sala 019"], 2),
    ("Farmacología General", "PFS2111", TQF, {S2: 1},
     ["Sala 019", "Sala 018"], 2),
    ("Dispensación y Atención Farmacéutica", "PFS2121", TQF, {S2: 1},
     ["Sala 018", "Sala 019"], 2),
    ("Operaciones Farmacéuticas", "PFS2131", TQF, {S2: 1},
     ["Sala 019", "Sala 018"], 2),
    # TLCBS (siglas reales; carrera real: TSLB)
    ("Preparación de Laboratorio Clínico", "LCS1111", TLCBS, {S1: 2},
     ["Sala 017", "Sala 016"], 1),
    ("Administración de Toma de Muestras", "ATS1111", TLCBS, {S1: 1},
     ["Sala 016", "Sala 017"], 1),
    ("Bioseguridad de Laboratorio Clínico", "BIS1111", TLCBS, {S1: 2},
     ["Sala 017", "Sala 016"], 1),
    ("Microbiología para el Laboratorio Clínico", "LCS3111", TLCBS, {S1: 1},
     ["Sala 017", "Sala 016"], 1),
    ("Toma de Muestra y Flebotomía", "TMS1111", TLCBS, {S1: 3, S2: 3},
     ["Sala 016", "Sala 017"], 1),
    ("Preparación del Paciente para Toma de Muestra", "APS1121", TLCBS, {S1: 1},
     ["Sala 016", "Sala 017"], 1),
    ("Técnicas de Banco de Sangre", "BSS3111", TLCBS, {S1: 1},
     ["Sala 016", "Sala 017"], 1),
    ("Banco de Sangre - Organización y Fraccionamiento", "BSS2111", TLCBS, {S2: 2},
     ["Sala 016", "Sala 017"], 1),
    ("Técnicas de Laboratorio Clínico", "LCS2111", TLCBS, {S2: 3},
     ["Sala 017", "Sala 016"], 1),
    # TONS (siglas reales)
    ("Técnicas de Diagnóstico en Odontología", "EOD3141", TONS, {S1: 1},
     [ODO7, ODO8], 1),
    ("Odontología Restauradora", "EOS3111", TONS, {S1: 1}, [ODO8, ODO7], 1),
    ("Asistencia en Endodoncia", "EOS3131", TONS, {S1: 1}, [ODO9, ODO8], 1),
    ("Bioseguridad y Ergonomía Clínica", "BOS2121", TONS, {S2: 3},
     [ODO9, ODO7], 1),
    ("Asistencia en Rehabilitación Oral", "EOS4111", TONS, {S2: 1},
     [ODO7, ODO8], 1),
    ("Asistencia en Periodoncia", "EOS4121", TONS, {S2: 2}, [ODO8, ODO9], 1),
    ("Asistencia en Ortodoncia y Ortopedia", "EOS4141", TONS, {S2: 1},
     [ODO7, ODO9], 1),
    # Preparador Físico (siglas PRF ilustrativas; ver SIGLAS_ILUSTRATIVAS).
    # Usa las salas de RCP y de simulación general (012, 020-022).
    ("Primeros Auxilios en la Actividad Física", "PRF1111", PF, {S1: 2, S2: 2},
     ["Sala 012", "Sala 020"], 1),
    ("Anatomía Funcional y Kinesiología", "PRF1121", PF, {S1: 2},
     ["Sala 021", "Sala 020"], 2),
    ("Evaluación de la Condición Física", "PRF3111", PF, {S1: 1},
     ["Sala 021", "Sala 022"], 2),
    ("Prevención y Manejo de Lesiones Deportivas", "PRF2111", PF, {S2: 2},
     ["Sala 021", "Sala 022"], 2),
    ("Fisiología del Ejercicio Aplicada", "PRF4111", PF, {S2: 1},
     ["Sala 022", "Sala 020"], 2),
]
# Siglas no confirmadas (solo ilustrativas): tres de TQF 2026-2 y todas las de
# Preparador Físico.
SIGLAS_ILUSTRATIVAS = {
    "PFS2111", "PFS2121", "PFS2131",
    "PRF1111", "PRF1121", "PRF3111", "PRF2111", "PRF4111",
}

# Docentes fijos por (sigla, semestre): las secciones del guion de hoy.
DOCENTE_FIJO = {
    ("CES3121", S1): "David Contreras",
    ("CES3121", S2): "David Contreras",
    ("EBS1111", S1): "María José Toro",
    ("EBS1111", S2): "María José Toro",
}

# Formato: (nombre, unidad, stock_final, minimo, cat_idx, tipo, costo, proveedor)
# stock_final es el stock al momento de ejecutar el seed para los insumos
# desechables (el historial se reconstruye hacia atrás para llegar a él) y el
# stock al 30 de diciembre para los implementos (ver IMPL_COMPRAS/IMPL_BAJAS).
MS, LA, BM, DE, QU = "medsupply", "laerdal", "biomed", "dental", "quimica"
INSUMOS = [
    # EPP (cat 0)
    ("Guantes de látex talla S", "Caja x100 unidades", 38, 15, 0, IN, 3200, MS),
    ("Guantes de látex talla M", "Caja x100 unidades", 52, 20, 0, IN, 3500, MS),
    ("Guantes de látex talla L", "Caja x100 unidades", 24, 10, 0, IN, 3200, MS),
    ("Guantes nitrilo sin polvo talla M", "Caja x100 unidades", 30, 12, 0, IN, 4200, MS),
    ("Mascarillas quirúrgicas", "Caja x50 unidades", 6, 12, 0, IN, 4000, MS),
    ("Mascarillas N95 FFP2", "Unidad", 3, 20, 0, IN, 2800, MS),
    ("Gafas de protección", "Unidad reutilizable", 30, 10, 0, IM, 3500, MS),
    ("Pecheras desechables", "Unidad", 140, 60, 0, IN, 280, MS),
    ("Gorro quirúrgico", "Bolsa x100 unidades", 3, 6, 0, IN, 1800, MS),
    ("Polainas quirúrgicas", "Par", 70, 20, 0, IN, 450, MS),
    ("Careta de protección facial", "Unidad reutilizable", 12, 5, 0, IM, 5500, MS),
    # Vendajes y apósitos (cat 1)
    ("Gasa estéril 10x10 cm", "Sobre x5 unidades", 380, 100, 1, IN, 650, MS),
    ("Gasa no estéril 10x10 cm", "Rollo", 45, 15, 1, IN, 420, MS),
    ("Apósito adhesivo 10x8 cm", "Unidad", 140, 50, 1, IN, 380, MS),
    ("Venda de gasa 10cm x 5m", "Rollo", 75, 25, 1, IN, 520, MS),
    ("Venda elástica 10cm", "Rollo", 55, 20, 1, IN, 850, MS),
    ("Venda de yeso 15cm", "Unidad", 18, 8, 1, IN, 1200, MS),
    ("Esparadrapo 5cm x 5m", "Rollo", 32, 12, 1, IN, 1850, MS),
    ("Algodón hidrófilo 500g", "Rollo", 14, 5, 1, IN, 2400, MS),
    ("Apósito hidrocoloide 10x10 cm", "Unidad", 25, 10, 1, IN, 2800, MS),
    ("Tela adhesiva 10cm x 5m", "Rollo", 20, 8, 1, IN, 1650, MS),
    ("Parche ocular estéril", "Unidad", 30, 10, 1, IN, 580, MS),
    # Sutura (cat 2)
    ("Seda 2-0 con aguja triangular", "Sobre", 28, 10, 2, IN, 1200, MS),
    ("Nylon 3-0 con aguja", "Sobre", 22, 10, 2, IN, 1350, MS),
    ("Poliglactina 2-0 Vicryl", "Sobre", 15, 8, 2, IN, 2800, MS),
    ("Seda 0 con aguja", "Sobre", 12, 5, 2, IN, 1100, MS),
    ("Nylon 4-0 piel", "Sobre", 0, 5, 2, IN, 1450, MS),
    ("Pinza Adson con dientes", "Unidad reutilizable", 8, 3, 2, IM, 18000, MS),
    ("Tijera de Mayo recta", "Unidad reutilizable", 5, 2, 2, IM, 24000, MS),
    ("Porta aguja Hegar", "Unidad reutilizable", 6, 2, 2, IM, 21000, MS),
    # Diagnóstico (cat 3)
    ("Esfigmomanómetro aneroide", "Unidad reutilizable", 12, 4, 3, IM, 28000, BM),
    ("Estetoscopio adulto", "Unidad reutilizable", 18, 6, 3, IM, 38000, BM),
    ("Termómetro digital axilar", "Unidad reutilizable", 22, 8, 3, IM, 9500, BM),
    ("Oxímetro de pulso digital", "Unidad reutilizable", 8, 3, 3, IM, 22000, BM),
    ("Otoscopio diagnóstico", "Unidad reutilizable", 4, 2, 3, IM, 95000, BM),
    ("Martillo de reflejos neurológico", "Unidad reutilizable", 6, 2, 3, IM, 14000, BM),
    ("Glucómetro portátil", "Unidad reutilizable", 5, 2, 3, IM, 38000, BM),
    ("Tiras reactivas glucómetro x50", "Caja", 8, 4, 3, IN, 12000, BM),
    ("Linterna diagnóstica", "Unidad reutilizable", 10, 3, 3, IM, 9500, BM),
    ("Cinta métrica flexible", "Unidad reutilizable", 15, 5, 3, IM, 2200, BM),
    # Cateterismo y venoclisis (cat 4)
    ("Catéter venoso periférico 18G", "Unidad", 35, 15, 4, IN, 1450, MS),
    ("Catéter venoso periférico 20G", "Unidad", 48, 20, 4, IN, 1350, MS),
    ("Catéter venoso periférico 22G", "Unidad", 28, 12, 4, IN, 1450, MS),
    ("Equipo de venoclisis con cámara", "Unidad", 22, 10, 4, IN, 1850, MS),
    ("Llave de tres pasos", "Unidad", 15, 8, 4, IN, 2200, MS),
    ("Bolsa colectora de orina 2000ml", "Unidad", 12, 5, 4, IN, 2800, MS),
    ("Sonda Foley N14 con globo", "Unidad", 6, 4, 4, IN, 3500, MS),
    ("Sonda Foley N16 con globo", "Unidad", 5, 3, 4, IN, 3500, MS),
    ("Sonda nasogástrica N14", "Unidad", 5, 3, 4, IN, 2800, MS),
    ("Jeringa 10ml con aguja 21G", "Unidad", 85, 30, 4, IN, 380, MS),
    ("Jeringa 20ml", "Unidad", 42, 15, 4, IN, 320, MS),
    ("Torniquete venoso", "Unidad reutilizable", 8, 3, 4, IM, 4500, MS),
    # Inyectología (cat 5)
    ("Jeringa insulina 1ml", "Unidad", 160, 50, 5, IN, 120, MS),
    ("Aguja hipodérmica 21G x 1.5", "Unidad", 210, 80, 5, IN, 95, MS),
    ("Aguja hipodérmica 23G x 1", "Unidad", 185, 70, 5, IN, 95, MS),
    ("Aguja hipodérmica 25G x 5/8", "Unidad", 125, 50, 5, IN, 95, MS),
    ("Lancetas descartables x100", "Caja", 8, 4, 5, IN, 4500, MS),
    ("Contenedor cortopunzante 3L", "Unidad", 2, 8, 5, IN, 4200, MS),
    ("Contenedor cortopunzante 3L APS", "Unidad", 0, 6, 5, IN, 4200, MS),
    # Oxigenoterapia (cat 6)
    ("Mascarilla de oxígeno adulto", "Unidad reutilizable", 8, 4, 6, IM, 4800, LA),
    ("Mascarilla Venturi adulto", "Unidad reutilizable", 4, 2, 6, IM, 8500, LA),
    ("Cánula nasal adulto", "Unidad", 14, 5, 6, IN, 850, MS),
    ("Cánula nasal pediátrica", "Unidad", 3, 3, 6, IN, 850, MS),
    ("Bolsa autoinflable AMBU adulto", "Unidad reutilizable", 3, 2, 6, IM, 95000, LA),
    ("Bolsa autoinflable AMBU pediátrico", "Unidad reutilizable", 2, 2, 6, IM, 85000, LA),
    ("Resucitador AMBU con mascarilla", "Unidad reutilizable", 4, 2, 6, IM, 110000, LA),
    # Residuos (cat 7)
    ("Bolsa roja residuos peligrosos 60L", "Unidad", 4, 12, 7, IN, 380, MS),
    ("Bolsa amarilla residuos especiales", "Unidad", 14, 8, 7, IN, 320, MS),
    ("Caja cartón cortopunzantes grande", "Unidad", 6, 4, 7, IN, 2800, MS),
    ("Contenedor biohazard 30L", "Unidad", 3, 2, 7, IN, 18000, MS),
    # Medicamentos de emergencia (cat 8)
    ("Adrenalina 1mg/ml ampolla 1ml", "Ampolla 1 mL", 5, 3, 8, IN, 2500, MS),
    ("Glucosa 50% ampolla 20ml", "Ampolla 20 mL", 10, 4, 8, IN, 1800, MS),
    ("Suero fisiológico NaCl 0.9% 1L", "Bolsa 1 L", 2, 10, 8, IN, 3500, MS),
    ("Suero glucosado 5% 500ml", "Bolsa 500 mL", 6, 5, 8, IN, 2800, MS),
    ("Solución Ringer Lactato 1L", "Bolsa 1 L", 5, 4, 8, IN, 3200, MS),
    ("Suero fisiológico 0.9% 250ml", "Bolsa 250 mL", 12, 6, 8, IN, 1800, MS),
    ("Cloruro de sodio 20% ampolla", "Ampolla 20 mL", 8, 3, 8, IN, 1200, MS),
    # Higiene y antisépticos (cat 9)
    ("Alcohol isopropílico 70% 1000ml", "Frasco 1000 mL", 12, 5, 9, IN, 5500, MS),
    ("Clorhexidina gluconato 4% 500ml", "Frasco 500 mL", 8, 4, 9, IN, 6800, MS),
    ("Povidona yodada 10% 100ml", "Frasco 100 mL", 10, 4, 9, IN, 3500, MS),
    ("Jabón clínico antiséptico 500ml", "Frasco 500 mL", 16, 6, 9, IN, 4200, MS),
    ("Gel antibacterial 500ml Sim1", "Frasco 500 mL", 3, 12, 9, IN, 3800, MS),
    ("Gel antibacterial 500ml APS", "Frasco 500 mL", 4, 10, 9, IN, 3800, MS),
    ("Solución glutaraldehído 2%", "Frasco 1 L", 4, 2, 9, IN, 8500, MS),
    ("Hipoclorito de sodio 5% 1L", "Frasco 1 L", 8, 3, 9, IN, 2800, MS),
    ("Gasas con clorhexidina CHG", "Sobre", 40, 15, 9, IN, 1200, MS),
    # Laboratorio clínico (cat 10)
    ("Tubo al vacío tapa lila EDTA 4 mL", "Caja x100 unidades", 9, 4, 10, IN, 14500, QU),
    ("Tubo al vacío tapa roja 6 mL", "Caja x100 unidades", 7, 3, 10, IN, 13800, QU),
    ("Tubo al vacío tapa celeste citrato 2.7 mL", "Caja x100 unidades", 5, 3, 10,
     IN, 15200, QU),
    ("Aguja de extracción múltiple 21G", "Caja x100 unidades", 6, 3, 10, IN, 9800, QU),
    ("Portatubo para extracción al vacío", "Unidad", 120, 40, 10, IN, 120, QU),
    ("Portaobjetos de vidrio", "Caja x50 unidades", 18, 6, 10, IN, 2600, QU),
    ("Placa Petri desechable 90 mm", "Paquete x20 unidades", 12, 5, 10, IN, 4800, QU),
    ("Micropipeta automática 100-1000 µL", "Unidad reutilizable", 6, 2, 10,
     IM, 145000, QU),
    ("Puntas para micropipeta 1000 µL", "Bolsa x500 unidades", 10, 4, 10, IN, 6900, QU),
    ("Gradilla para tubos", "Unidad reutilizable", 16, 6, 10, IM, 4500, QU),
    # Odontología (cat 11)
    ("Espejo bucal plano N°5", "Unidad reutilizable", 30, 10, 11, IM, 2900, DE),
    ("Sonda periodontal OMS", "Unidad reutilizable", 20, 8, 11, IM, 5200, DE),
    ("Eyector de saliva desechable", "Bolsa x100 unidades", 9, 4, 11, IN, 3900, DE),
    ("Babero dental desechable", "Paquete x125 unidades", 6, 3, 11, IN, 6500, DE),
    ("Alginato para impresión dental 450g", "Bolsa 450 g", 5, 3, 11, IN, 7800, DE),
    ("Resina compuesta fotocurable A2", "Jeringa 4 g", 4, 4, 11, IN, 18000, DE),
    # Farmacia (cat 12)
    ("Vaso precipitado de vidrio 250 mL", "Unidad reutilizable", 20, 6, 12, IM, 3800, QU),
    ("Probeta graduada 100 mL", "Unidad reutilizable", 12, 4, 12, IM, 5200, QU),
    ("Papel filtro cualitativo", "Caja x100 unidades", 0, 3, 12, IN, 4200, QU),
    ("Frasco gotario ámbar 30 mL", "Unidad", 150, 50, 12, IN, 290, QU),
    # Preparación física (cat 13)
    ("Compresa fría instantánea", "Unidad", 40, 15, 13, IN, 900, MS),
    ("Cinta kinesiológica 5cm x 5m", "Rollo", 18, 8, 13, IN, 4500, MS),
    ("Lápiz dermográfico", "Unidad", 20, 6, 13, IN, 900, MS),
    ("Goniómetro universal 30 cm", "Unidad reutilizable", 10, 4, 13, IM, 8500, BM),
    ("Plicómetro de pliegues cutáneos", "Unidad reutilizable", 8, 3, 13, IM, 32000, BM),
    ("Férula inflable de extremidades", "Unidad reutilizable", 6, 2, 13, IM, 26000, MS),
]
SUERO_GUION = "Suero fisiológico NaCl 0.9% 1L"

VENCIMIENTOS = {
    "Adrenalina 1mg/ml ampolla 1ml": date(2027, 2, 28),
    "Glucosa 50% ampolla 20ml": date(2027, 5, 31),
    "Suero fisiológico NaCl 0.9% 1L": date(2027, 9, 30),
    "Suero glucosado 5% 500ml": date(2027, 6, 30),
    "Solución Ringer Lactato 1L": date(2027, 8, 31),
    "Suero fisiológico 0.9% 250ml": date(2027, 7, 31),
    "Cloruro de sodio 20% ampolla": date(2027, 11, 30),
    "Povidona yodada 10% 100ml": date(2027, 4, 30),
}

# Salas donde quedan asignadas fijas algunas unidades de cada implemento
# (una unidad por sala); el resto permanece en Bodega.
TENS_SALAS = ["Sala 010", "Sala 011", "Sala 012", "Sala 013", "Sala 014", "Sala 015"]
IMPL_SALAS = {
    "Gafas de protección": ["Sala 014", "Sala 016", "Sala 017", "Sala 018"],
    "Careta de protección facial": [ODO7, ODO8, ODO9],
    "Esfigmomanómetro aneroide": TENS_SALAS,
    "Estetoscopio adulto": TENS_SALAS,
    "Termómetro digital axilar": TENS_SALAS,
    "Oxímetro de pulso digital": ["Sala 010", "Sala 013"],
    "Bolsa autoinflable AMBU adulto": ["Sala 010"],
    "Resucitador AMBU con mascarilla": ["Sala 012"],
    "Micropipeta automática 100-1000 µL": ["Sala 016", "Sala 017"],
    "Gradilla para tubos": ["Sala 016", "Sala 017"],
    "Espejo bucal plano N°5": [ODO7, ODO8, ODO9],
    "Vaso precipitado de vidrio 250 mL": ["Sala 018", "Sala 019"],
}

# Compras de implementos (entran como ítems de órdenes de entrada cerradas).
# Formato: (implemento, proveedor, fecha del cierre de la orden, cantidad)
IMPL_COMPRAS = [
    ("Termómetro digital axilar", BM, date(2026, 2, 19), 6),
    ("Oxímetro de pulso digital", BM, date(2026, 2, 19), 2),
    ("Gafas de protección", MS, date(2026, 2, 26), 10),
    ("Espejo bucal plano N°5", DE, date(2026, 7, 30), 10),
    ("Sonda periodontal OMS", DE, date(2026, 7, 30), 4),
    ("Micropipeta automática 100-1000 µL", QU, date(2026, 7, 30), 2),
    ("Vaso precipitado de vidrio 250 mL", QU, date(2026, 7, 30), 6),
    ("Esfigmomanómetro aneroide", BM, date(2026, 9, 24), 2),
]
# Bajas de implementos: (implemento, fecha, cantidad, motivo)
IMPL_BAJAS = [
    ("Porta aguja Hegar", date(2026, 3, 27), 1,
     "Baja: unidad no devuelta tras taller de sutura"),
    ("Gafas de protección", date(2026, 5, 8), 2, "Baja: vidrio rayado"),
    ("Termómetro digital axilar", date(2026, 6, 12), 2,
     "Baja: falla de sensor, sin reparación"),
    ("Linterna diagnóstica", date(2026, 8, 21), 1, "Baja: carcasa quebrada"),
    ("Esfigmomanómetro aneroide", date(2026, 9, 25), 1,
     "Baja: manguito con fuga, reemplazado por unidad nueva"),
    ("Torniquete venoso", date(2026, 10, 20), 1, "Baja: elástico vencido"),
    ("Espejo bucal plano N°5", date(2026, 11, 13), 3,
     "Baja: espejos rayados tras esterilización"),
]

# Formato: (nombre, descripcion, sigla_asignatura, nota_paquete, items)
# items: [(insumo, cantidad, nota)]; las cantidades van en la unidad de
# medida del insumo (cajas, sobres, unidades...).
TALLERES_DATA = [
    # --- TENS ---
    ("Taller de RCP básico y DEA",
     "Reanimación cardiopulmonar básica y uso del desfibrilador externo automático",
     "AXS1102", "Usar Fantoma RCP adulto y pediátrico de la Sala 012.",
     [("Guantes nitrilo sin polvo talla M", 1, None),
      ("Mascarillas quirúrgicas", 1, None),
      ("Gasas con clorhexidina CHG", 6, "Limpieza de fantomas entre alumnos"),
      ("Resucitador AMBU con mascarilla", 2, None)]),
    ("Taller de vendajes e inmovilización",
     "Vendajes funcionales, inmovilización de extremidades y manejo de esguinces",
     "AXS1102", None,
     [("Venda elástica 10cm", 8, None),
      ("Venda de gasa 10cm x 5m", 8, None),
      ("Venda de yeso 15cm", 3, None),
      ("Esparadrapo 5cm x 5m", 2, None),
      ("Algodón hidrófilo 500g", 1, None),
      ("Guantes de látex talla M", 1, None)]),
    ("Taller de venopunción",
     "Práctica de cateterización venosa periférica y toma de muestras",
     "EBS1111", "Para 30 alumnos. Verificar stock de catéteres 20G antes del semestre.",
     [("Guantes de látex talla S", 1, "Talla S/M según alumno"),
      ("Guantes de látex talla M", 1, None),
      ("Mascarillas quirúrgicas", 1, None),
      ("Catéter venoso periférico 18G", 4, None),
      ("Catéter venoso periférico 20G", 8, None),
      ("Jeringa 10ml con aguja 21G", 12, None),
      ("Gasa estéril 10x10 cm", 12, None),
      ("Contenedor cortopunzante 3L", 1, None),
      ("Torniquete venoso", 5, "Torniquete por estación")]),
    ("Taller de control de signos vitales",
     "Medición de presión arterial, pulso, temperatura y saturación",
     "EBS1111", None,
     [("Esfigmomanómetro aneroide", 6, None),
      ("Estetoscopio adulto", 6, None),
      ("Termómetro digital axilar", 6, None),
      ("Oxímetro de pulso digital", 4, None),
      ("Gasas con clorhexidina CHG", 4, None)]),
    ("Taller de bioseguridad y EPP",
     "Uso correcto de equipos de protección personal en enfermería",
     "EBS1121", "EPP completo por alumno. Verificar stock de mascarillas N95.",
     [("Guantes nitrilo sin polvo talla M", 1, None),
      ("Mascarillas quirúrgicas", 1, None),
      ("Mascarillas N95 FFP2", 10, None),
      ("Pecheras desechables", 20, None),
      ("Gorro quirúrgico", 1, None),
      ("Polainas quirúrgicas", 10, None),
      ("Gafas de protección", 10, None)]),
    ("Taller de lavado clínico de manos",
     "Técnica de lavado clínico y quirúrgico de manos",
     "EBS1121", None,
     [("Jabón clínico antiséptico 500ml", 1, None),
      ("Gel antibacterial 500ml APS", 1, None),
      ("Clorhexidina gluconato 4% 500ml", 1, None)]),
    ("Taller de cuidados al recién nacido",
     "Atención y cuidados del recién nacido en simulador neonatal",
     "CES3111", "Requiere simulador neonatal. Coordinar con docente asignado.",
     [("Guantes de látex talla S", 1, "Talla S/XS"),
      ("Mascarillas quirúrgicas", 1, None),
      ("Gasa estéril 10x10 cm", 8, None),
      ("Apósito adhesivo 10x8 cm", 8, None),
      ("Cánula nasal pediátrica", 1, None),
      ("Termómetro digital axilar", 4, None),
      ("Oxímetro de pulso digital", 3, None),
      ("Cinta métrica flexible", 4, None)]),
    ("Taller de RCP pediátrico",
     "Reanimación cardiopulmonar en lactantes y niños",
     "CES3111", None,
     [("Guantes de látex talla S", 1, None),
      ("Mascarillas quirúrgicas", 1, None),
      ("Bolsa autoinflable AMBU pediátrico", 2, None)]),
    ("Taller de RCP avanzado",
     "Reanimación cardiopulmonar con maniquí de alta fidelidad",
     "CES3121",
     "Usar Fantoma adulto alta fidelidad y Fantoma adulto para entrenamiento "
     "de enfermería. Verificar AMBU antes de la clase.",
     [("Guantes de látex talla M", 1, None),
      ("Mascarillas quirúrgicas", 1, None),
      ("Contenedor cortopunzante 3L", 1, None),
      ("Adrenalina 1mg/ml ampolla 1ml", 1, "Ampolla de práctica"),
      ("Jeringa 10ml con aguja 21G", 4, None),
      ("Catéter venoso periférico 18G", 2, None),
      ("Mascarilla de oxígeno adulto", 2, None),
      ("Bolsa autoinflable AMBU adulto", 2, None)]),
    ("Taller de triage y politrauma",
     "Clasificación de pacientes y atención inicial del politraumatizado",
     "CES3121", None,
     [("Guantes nitrilo sin polvo talla M", 1, None),
      ("Venda elástica 10cm", 4, None),
      ("Gasa estéril 10x10 cm", 8, None),
      ("Suero fisiológico 0.9% 250ml", 2, None),
      ("Equipo de venoclisis con cámara", 2, None),
      ("Linterna diagnóstica", 3, None)]),
    ("Taller de sutura básica",
     "Técnicas de sutura y curación de heridas en simulador",
     "MES3111", "Incluye set de instrumental de sutura por pareja de alumnos.",
     [("Guantes de látex talla S", 1, None),
      ("Guantes de látex talla M", 1, None),
      ("Seda 2-0 con aguja triangular", 8, None),
      ("Nylon 3-0 con aguja", 6, None),
      ("Poliglactina 2-0 Vicryl", 3, None),
      ("Gasa estéril 10x10 cm", 10, None),
      ("Povidona yodada 10% 100ml", 1, None),
      ("Pinza Adson con dientes", 4, "Una pinza por pareja"),
      ("Tijera de Mayo recta", 4, "Una tijera por pareja"),
      ("Porta aguja Hegar", 4, None)]),
    ("Taller de oxigenoterapia",
     "Administración de oxígeno con distintos dispositivos",
     "MES3111", None,
     [("Cánula nasal adulto", 3, None),
      ("Mascarilla de oxígeno adulto", 4, None),
      ("Mascarilla Venturi adulto", 2, None),
      ("Oxímetro de pulso digital", 3, None)]),
    ("Taller de anatomía de superficie",
     "Reconocimiento de reparos anatómicos y examen físico segmentario",
     "AFS1111", None,
     [("Guantes nitrilo sin polvo talla M", 1, None),
      ("Cinta métrica flexible", 6, None),
      ("Martillo de reflejos neurológico", 4, None)]),
    ("Taller de anatomía aplicada con simulador",
     "Anatomía aplicada a procedimientos de enfermería en simulador",
     "CIS1103", None,
     [("Guantes nitrilo sin polvo talla M", 1, None),
      ("Gasas con clorhexidina CHG", 4, None),
      ("Linterna diagnóstica", 3, None)]),
    ("Taller de administración de medicamentos",
     "Vías de administración: intramuscular, subcutánea e intradérmica",
     "EBS2111", "Usar ampollas de práctica. Contenedor cortopunzante por mesa.",
     [("Guantes de látex talla M", 1, None),
      ("Jeringa insulina 1ml", 15, None),
      ("Aguja hipodérmica 23G x 1", 15, None),
      ("Aguja hipodérmica 25G x 5/8", 12, None),
      ("Jeringa 10ml con aguja 21G", 8, None),
      ("Algodón hidrófilo 500g", 1, None),
      ("Alcohol isopropílico 70% 1000ml", 1, None),
      ("Suero fisiológico 0.9% 250ml", 2, None),
      ("Cloruro de sodio 20% ampolla", 1, None),
      ("Contenedor cortopunzante 3L", 1, None)]),
    ("Taller de fleboclisis y goteo",
     "Instalación de fleboclisis, cálculo de goteo y manejo de vías",
     "EBS2111", None,
     [("Guantes de látex talla M", 1, None),
      ("Equipo de venoclisis con cámara", 5, None),
      ("Llave de tres pasos", 3, None),
      ("Suero fisiológico NaCl 0.9% 1L", 1, None),
      ("Suero glucosado 5% 500ml", 1, None),
      ("Solución Ringer Lactato 1L", 1, None),
      ("Catéter venoso periférico 20G", 5, None),
      ("Tela adhesiva 10cm x 5m", 1, None)]),
    ("Taller de ECG y monitorización",
     "Electrocardiograma y monitoreo de signos vitales en paciente crítico",
     "CES2121", "Monitoreo de signos vitales y trazado ECG en paciente crítico.",
     [("Guantes de látex talla S", 1, None),
      ("Mascarillas quirúrgicas", 1, None),
      ("Estetoscopio adulto", 4, None),
      ("Termómetro digital axilar", 4, None),
      ("Oxímetro de pulso digital", 4, None)]),
    ("Taller de curaciones y manejo de heridas",
     "Curación simple y avanzada de heridas en simulador",
     "CES2121", None,
     [("Guantes de látex talla M", 1, None),
      ("Gasa estéril 10x10 cm", 12, None),
      ("Apósito adhesivo 10x8 cm", 8, None),
      ("Apósito hidrocoloide 10x10 cm", 3, None),
      ("Suero fisiológico 0.9% 250ml", 2, None),
      ("Povidona yodada 10% 100ml", 1, None),
      ("Tela adhesiva 10cm x 5m", 1, None),
      ("Pinza Adson con dientes", 4, None)]),
    ("Taller de cateterismo urinario",
     "Instalación de sonda Foley con técnica aséptica",
     "CES2121", None,
     [("Guantes de látex talla M", 1, None),
      ("Sonda Foley N14 con globo", 1, None),
      ("Sonda Foley N16 con globo", 1, None),
      ("Bolsa colectora de orina 2000ml", 2, None),
      ("Jeringa 20ml", 3, None),
      ("Clorhexidina gluconato 4% 500ml", 1, None),
      ("Gasa estéril 10x10 cm", 6, None)]),
    ("Taller de comunicación con paciente simulado",
     "Entrevista clínica y entrega de indicaciones con paciente simulado",
     "HES4111", None,
     [("Guantes nitrilo sin polvo talla M", 1, None),
      ("Mascarillas quirúrgicas", 1, None),
      ("Estetoscopio adulto", 2, None)]),
    ("Taller de control de salud y glicemia capilar",
     "Control de salud en atención primaria y medición de glicemia capilar",
     "PMS4111", None,
     [("Guantes de látex talla S", 1, None),
      ("Tiras reactivas glucómetro x50", 1, None),
      ("Lancetas descartables x100", 1, None),
      ("Algodón hidrófilo 500g", 1, None),
      ("Glucómetro portátil", 4, None),
      ("Esfigmomanómetro aneroide", 4, None)]),
    # --- TQF ---
    ("Taller de química analítica",
     "Preparación de reactivos y técnicas de laboratorio farmacéutico",
     "PFS1115", "Insumos de higiene y seguridad para laboratorio químico.",
     [("Guantes nitrilo sin polvo talla M", 1, None),
      ("Papel filtro cualitativo", 1, None),
      ("Bolsa amarilla residuos especiales", 2, None),
      ("Vaso precipitado de vidrio 250 mL", 8, None),
      ("Probeta graduada 100 mL", 6, None),
      ("Gafas de protección", 8, None)]),
    ("Taller de preparación de soluciones",
     "Cálculo y preparación de soluciones de uso farmacéutico",
     "PFS1115", None,
     [("Guantes nitrilo sin polvo talla M", 1, None),
      ("Frasco gotario ámbar 30 mL", 15, None),
      ("Vaso precipitado de vidrio 250 mL", 6, None),
      ("Probeta graduada 100 mL", 6, None)]),
    ("Taller de formas farmacéuticas",
     "Reconocimiento y manejo de formas farmacéuticas sólidas y líquidas",
     "PFS2111", None,
     [("Guantes nitrilo sin polvo talla M", 1, None),
      ("Frasco gotario ámbar 30 mL", 12, None),
      ("Jeringa 10ml con aguja 21G", 8, None)]),
    ("Taller de dispensación de recetas",
     "Dispensación de recetas simuladas y atención farmacéutica",
     "PFS2121", None,
     [("Guantes nitrilo sin polvo talla M", 1, None),
      ("Mascarillas quirúrgicas", 1, None),
      ("Frasco gotario ámbar 30 mL", 8, None)]),
    ("Taller de fraccionamiento y envasado",
     "Fraccionamiento, envasado y rotulado de preparados",
     "PFS2131", None,
     [("Guantes nitrilo sin polvo talla M", 1, None),
      ("Frasco gotario ámbar 30 mL", 20, None),
      ("Papel filtro cualitativo", 1, None),
      ("Vaso precipitado de vidrio 250 mL", 6, None),
      ("Probeta graduada 100 mL", 4, None),
      ("Gafas de protección", 6, None)]),
    # --- TLCBS ---
    ("Taller de preparación de material de laboratorio",
     "Preparación, rotulado y descontaminación de material de laboratorio",
     "LCS1111", None,
     [("Guantes nitrilo sin polvo talla M", 1, None),
      ("Portaobjetos de vidrio", 1, None),
      ("Puntas para micropipeta 1000 µL", 1, None),
      ("Hipoclorito de sodio 5% 1L", 1, None),
      ("Gradilla para tubos", 6, None),
      ("Micropipeta automática 100-1000 µL", 3, None)]),
    ("Taller de toma de muestra",
     "Técnicas de extracción de muestra y flebotomía en laboratorio",
     "TMS1111", "Técnicas de flebotomía. Cada alumno usa su propio kit de punción.",
     [("Guantes de látex talla S", 1, None),
      ("Tubo al vacío tapa lila EDTA 4 mL", 1, None),
      ("Tubo al vacío tapa roja 6 mL", 1, None),
      ("Aguja de extracción múltiple 21G", 1, None),
      ("Portatubo para extracción al vacío", 12, None),
      ("Gasas con clorhexidina CHG", 8, None),
      ("Algodón hidrófilo 500g", 1, None),
      ("Contenedor cortopunzante 3L", 1, None),
      ("Torniquete venoso", 6, None)]),
    ("Taller de recepción y rotulado de muestras",
     "Recepción, rotulado y criterios de rechazo de muestras",
     "ATS1111", None,
     [("Guantes nitrilo sin polvo talla M", 1, None),
      ("Tubo al vacío tapa celeste citrato 2.7 mL", 1, None),
      ("Gradilla para tubos", 6, None)]),
    ("Taller de preparación del paciente",
     "Condiciones preanalíticas e instrucciones al paciente",
     "APS1121", None,
     [("Guantes de látex talla S", 1, None),
      ("Alcohol isopropílico 70% 1000ml", 1, None),
      ("Esfigmomanómetro aneroide", 2, None)]),
    ("Taller de bioseguridad de laboratorio",
     "Uso correcto de EPP y manejo de residuos en laboratorio clínico",
     "BIS1111", "Manejo correcto de residuos biológicos y EPP de laboratorio.",
     [("Guantes nitrilo sin polvo talla M", 1, None),
      ("Mascarillas quirúrgicas", 1, None),
      ("Bolsa roja residuos peligrosos 60L", 3, None),
      ("Bolsa amarilla residuos especiales", 3, None),
      ("Caja cartón cortopunzantes grande", 1, None),
      ("Solución glutaraldehído 2%", 1, None),
      ("Gafas de protección", 8, None)]),
    ("Taller de siembra y tinción microbiológica",
     "Siembra en placa y tinción de Gram",
     "LCS3111", None,
     [("Guantes nitrilo sin polvo talla M", 1, None),
      ("Mascarillas quirúrgicas", 1, None),
      ("Placa Petri desechable 90 mm", 2, None),
      ("Portaobjetos de vidrio", 1, None),
      ("Bolsa roja residuos peligrosos 60L", 1, None),
      ("Micropipeta automática 100-1000 µL", 2, None)]),
    ("Taller de tipificación sanguínea",
     "Determinación de grupo ABO y factor Rh",
     "BSS3111", None,
     [("Guantes nitrilo sin polvo talla M", 1, None),
      ("Tubo al vacío tapa lila EDTA 4 mL", 1, None),
      ("Portaobjetos de vidrio", 1, None),
      ("Puntas para micropipeta 1000 µL", 1, None),
      ("Micropipeta automática 100-1000 µL", 2, None)]),
    ("Taller de fraccionamiento de hemocomponentes",
     "Centrifugación y separación de hemocomponentes",
     "BSS2111", "Requiere centrífuga de laboratorio operativa (Sala 016).",
     [("Guantes nitrilo sin polvo talla M", 1, None),
      ("Tubo al vacío tapa roja 6 mL", 1, None),
      ("Bolsa roja residuos peligrosos 60L", 1, None),
      ("Gradilla para tubos", 4, None)]),
    ("Taller de técnicas de laboratorio clínico",
     "Pipeteo, diluciones y control de calidad analítico",
     "LCS2111", None,
     [("Guantes nitrilo sin polvo talla M", 1, None),
      ("Tubo al vacío tapa roja 6 mL", 1, None),
      ("Portaobjetos de vidrio", 1, None),
      ("Puntas para micropipeta 1000 µL", 1, None),
      ("Micropipeta automática 100-1000 µL", 3, None)]),
    # --- TONS ---
    ("Taller de examen clínico odontológico",
     "Examen intraoral, odontograma y registro clínico",
     "EOD3141", None,
     [("Guantes nitrilo sin polvo talla M", 1, None),
      ("Mascarillas quirúrgicas", 1, None),
      ("Babero dental desechable", 1, None),
      ("Espejo bucal plano N°5", 10, None),
      ("Sonda periodontal OMS", 10, None)]),
    ("Taller de asistencia en operatoria y resinas",
     "Asistencia a cuatro manos en operatoria dental",
     "EOS3111", None,
     [("Guantes nitrilo sin polvo talla M", 1, None),
      ("Resina compuesta fotocurable A2", 1, None),
      ("Eyector de saliva desechable", 1, None),
      ("Babero dental desechable", 1, None),
      ("Espejo bucal plano N°5", 8, None)]),
    ("Taller de asistencia en endodoncia",
     "Preparación de bandeja e irrigación en endodoncia",
     "EOS3131", None,
     [("Guantes nitrilo sin polvo talla M", 1, None),
      ("Eyector de saliva desechable", 1, None),
      ("Hipoclorito de sodio 5% 1L", 1, None),
      ("Gasa estéril 10x10 cm", 5, None),
      ("Espejo bucal plano N°5", 6, None)]),
    ("Taller de primeros auxilios odontológicos",
     "Manejo de emergencias y bioseguridad en clínica dental",
     "BOS2121", "Protocolo de emergencias en clínica dental.",
     [("Guantes de látex talla S", 1, None),
      ("Mascarillas quirúrgicas", 1, None),
      ("Gasa estéril 10x10 cm", 8, None),
      ("Glucosa 50% ampolla 20ml", 1, None),
      ("Esfigmomanómetro aneroide", 3, None),
      ("Estetoscopio adulto", 3, None),
      ("Oxímetro de pulso digital", 2, None)]),
    ("Taller de bioseguridad en clínica dental",
     "Esterilización, desinfección y barreras de protección en el box",
     "BOS2121", None,
     [("Guantes nitrilo sin polvo talla M", 1, None),
      ("Solución glutaraldehído 2%", 1, None),
      ("Babero dental desechable", 1, None),
      ("Gafas de protección", 6, None),
      ("Careta de protección facial", 6, None)]),
    ("Taller de toma de impresiones con alginato",
     "Preparación de alginato y toma de impresiones en tipodonto",
     "EOS4111", None,
     [("Guantes nitrilo sin polvo talla M", 1, None),
      ("Alginato para impresión dental 450g", 1, None),
      ("Babero dental desechable", 1, None),
      ("Espejo bucal plano N°5", 6, None)]),
    ("Taller de asistencia en periodoncia",
     "Sondaje periodontal y asistencia en destartraje",
     "EOS4121", None,
     [("Guantes nitrilo sin polvo talla M", 1, None),
      ("Eyector de saliva desechable", 1, None),
      ("Gasa estéril 10x10 cm", 6, None),
      ("Sonda periodontal OMS", 8, None),
      ("Espejo bucal plano N°5", 8, None)]),
    ("Taller de asistencia en ortodoncia",
     "Asistencia en instalación y control de aparatos de ortodoncia",
     "EOS4141", None,
     [("Guantes nitrilo sin polvo talla M", 1, None),
      ("Alginato para impresión dental 450g", 1, None),
      ("Babero dental desechable", 1, None),
      ("Espejo bucal plano N°5", 6, None)]),
    # --- Preparador Físico ---
    ("Taller de RCP y DEA en el deporte",
     "Reanimación cardiopulmonar y uso del DEA ante un paro en la actividad física",
     "PRF1111", "Usar Fantoma RCP adulto (Sala 012; trasladarlo si la clase es en "
     "otra sala).",
     [("Guantes nitrilo sin polvo talla M", 1, None),
      ("Mascarillas quirúrgicas", 1, None),
      ("Gasas con clorhexidina CHG", 6, "Limpieza de fantomas entre alumnos"),
      ("Resucitador AMBU con mascarilla", 2, None)]),
    ("Taller de atención inicial de lesiones en terreno",
     "Evaluación primaria, inmovilización y traslado del deportista lesionado",
     "PRF1111", None,
     [("Guantes de látex talla M", 1, None),
      ("Venda elástica 10cm", 6, None),
      ("Compresa fría instantánea", 8, None),
      ("Apósito adhesivo 10x8 cm", 6, None),
      ("Férula inflable de extremidades", 4, None)]),
    ("Taller de palpación anatómica y goniometría",
     "Reconocimiento de estructuras musculoesqueléticas y medición de rangos articulares",
     "PRF1121", None,
     [("Lápiz dermográfico", 6, None),
      ("Goniómetro universal 30 cm", 8, None),
      ("Cinta métrica flexible", 6, None)]),
    ("Taller de evaluación antropométrica",
     "Medición de pliegues cutáneos, perímetros y composición corporal",
     "PRF3111", "Calibrar plicómetros antes de la clase.",
     [("Lápiz dermográfico", 6, None),
      ("Plicómetro de pliegues cutáneos", 6, None),
      ("Cinta métrica flexible", 6, None)]),
    ("Taller de vendaje funcional y cinta kinesiológica",
     "Vendaje funcional de tobillo y rodilla, y aplicación de cinta kinesiológica",
     "PRF2111", None,
     [("Cinta kinesiológica 5cm x 5m", 4, None),
      ("Venda elástica 10cm", 6, None),
      ("Esparadrapo 5cm x 5m", 3, None),
      ("Tela adhesiva 10cm x 5m", 2, None)]),
    ("Taller de manejo de lesiones agudas (PRICE)",
     "Protección, reposo, hielo, compresión y elevación en lesiones deportivas",
     "PRF2111", None,
     [("Compresa fría instantánea", 10, None),
      ("Venda elástica 10cm", 6, None),
      ("Férula inflable de extremidades", 4, None)]),
    ("Taller de signos vitales en el ejercicio",
     "Control de frecuencia cardíaca, presión arterial y saturación en esfuerzo",
     "PRF4111", None,
     [("Esfigmomanómetro aneroide", 6, None),
      ("Estetoscopio adulto", 6, None),
      ("Oxímetro de pulso digital", 4, None),
      ("Gasas con clorhexidina CHG", 4, None)]),
]

# Formato: (nombre, descripcion, tipo, sala, fidelidad, notas, proveedor, alta)
# alta = fecha en que el activo entra al inventario (None = antes de 2026).
PH, MU = TipoActivo.phantoma, TipoActivo.mueble
ALTA, MEDIA, BAJA = FidelidadPhantoma.alta, FidelidadPhantoma.media, FidelidadPhantoma.baja
LITTLE_JUNIOR = "Fantoma RCP pediátrico Little Junior"
ACTIVOS_FIJOS_DEMO = [
    ("Fantoma adulto alta fidelidad",
     "Maniquí adulto alta fidelidad para simulación clínica avanzada",
     PH, "Sala 010", ALTA, "Mantenimiento preventivo semestral requerido", LA, None),
    ("Fantoma recién nacido soporte vital avanzado",
     "Maniquí neonatal para soporte vital avanzado en pediatría",
     PH, "Sala 010", ALTA, None, LA, None),
    ("Fantoma adulto para entrenamiento de enfermería",
     "Maniquí adulto básico para técnicas de enfermería y venopunción",
     PH, "Sala 011", BAJA, None, LA, None),
    ("Fantoma RCP adulto",
     "Maniquí adulto para entrenamiento de RCP y uso de DEA",
     PH, "Sala 012", BAJA, None, LA, None),
    ("Fantoma RCP pediátrico",
     "Maniquí pediátrico para entrenamiento de RCP (unidad 2016)",
     PH, "Sala 012", BAJA, None, LA, None),
    (LITTLE_JUNIOR,
     "Maniquí pediátrico para RCP, reemplazo de la unidad 2016",
     PH, "Sala 012", BAJA, "Ingresó por orden de entrada de julio 2026", LA,
     date(2026, 7, 23)),
    ("Fantoma politrauma",
     "Maniquí politraumatizado para triage y atención de urgencias",
     PH, "Sala 012", MEDIA, None, LA, None),
    ("Brazo de punción adulto",
     "Brazo sintético para práctica de venopunción y flebotomía",
     PH, "Sala 011", BAJA, None, LA, None),
    ("Brazo de venopunción para laboratorio",
     "Brazo sintético con circuito de sangre simulada para flebotomía",
     PH, "Sala 016", MEDIA, None, LA, None),
    ("Fantoma recién nacido básico",
     "Maniquí neonatal para control del niño sano y antropometría",
     PH, "Sala 013", BAJA, None, LA, None),
    ("Fantoma adulto de cuidados de enfermería",
     "Maniquí adulto de fidelidad media para cuidados básicos",
     PH, "Sala 014", MEDIA, None, LA, None),
    ("Fantoma odontológico con tipodonto - box 1",
     "Simulador de cabeza con tipodonto para prácticas odontológicas",
     PH, ODO7, MEDIA, None, DE, None),
    ("Fantoma odontológico con tipodonto - box 2",
     "Simulador de cabeza con tipodonto para prácticas odontológicas",
     PH, ODO8, MEDIA, None, DE, None),
    ("Mesa Mayo",
     "Mesa auxiliar acero inoxidable con ruedas para procedimientos",
     MU, "Sala 010", None, None, None, None),
    ("Cama clínica articulada",
     "Cama clínica articulada para simulación de paciente hospitalizado",
     MU, "Sala 010", None, None, None, None),
    ("Maletín de emergencia clínica",
     "Maletín equipado con insumos para urgencias simuladas",
     MU, "Sala 010", None, "Revisión mensual de contenido obligatoria", None, None),
    ("Electrocardiógrafo",
     "Electrocardiógrafo para taller de ECG y monitorización",
     MU, "Sala 010", None, None, BM, None),
    ("Monitor multiparámetro",
     "Monitor de signos vitales para simulación clínica",
     MU, "Sala 010", None, None, BM, None),
    ("Desfibrilador",
     "Desfibrilador bifásico para urgencias y manejo de equipos",
     MU, "Sala 012", None, None, BM, None),
    ("DEA Desfibrilador Externo Automático",
     "DEA para entrenamiento de RCP y primeros auxilios",
     MU, "Sala 012", None, None, BM, None),
    ("Camilla de transporte",
     "Camilla con barandas para traslado de paciente simulado",
     MU, "Sala 012", None, None, None, None),
    ("Cama clínica pediátrica",
     "Cuna clínica con barandas para simulación pediátrica",
     MU, "Sala 013", None, None, None, None),
    ("Centrífuga de laboratorio",
     "Centrífuga para fraccionamiento de muestras en laboratorio clínico",
     MU, "Sala 016", None, None, QU, None),
    ("Refrigerador de laboratorio",
     "Refrigerador para conservación de muestras y reactivos",
     MU, "Sala 016", None, None, QU, None),
    ("Microscopio óptico binocular",
     "Microscopio para observación de preparados y tinciones",
     MU, "Sala 017", None, None, QU, None),
    ("Balanza analítica de precisión",
     "Balanza analítica 0,1 mg para laboratorio de farmacia",
     MU, "Sala 018", None, None, QU, None),
    ("Sillón dental clínico - box 1",
     "Unidad dental con sillón, lámpara y escupidera",
     MU, ODO7, None, None, DE, None),
    ("Sillón dental clínico - box 2",
     "Unidad dental con sillón, lámpara y escupidera",
     MU, ODO8, None, None, DE, None),
    ("Lámpara de fotocurado LED",
     "Lámpara LED para polimerización de resinas",
     MU, ODO8, None, None, DE, None),
    ("Autoclave de mesa 18 L",
     "Autoclave para esterilización de instrumental odontológico",
     MU, ODO9, None, None, DE, None),
]
# Activos en uso en la clase en curso de hoy (Sala 011).
ACTIVOS_EN_USO_HOY = [
    "Fantoma adulto para entrenamiento de enfermería", "Brazo de punción adulto",
]

# Órdenes de mantenimiento. Formato: dict con claves
#   prov, tipo, visita, cierre_dias, estado ('cerrada'|'cancelada'|'en_curso'),
#   notas, items: [(activo, resultado, problema, trabajo, costo,
#                   envio, retorno_estimado, retorno)]
# visita=None indica la orden del guion (hoy - 12 días). Si la visita aún no
# ocurre se omite; si ocurrió pero el cierre cae después de hoy, queda en_curso.
PV, CO, VT = (
    TipoMantenimiento.preventivo, TipoMantenimiento.correctivo,
    TipoMantenimiento.validacion_tecnica,
)
OK_, TALLER_, BAJA_ = (
    ResultadoItem.ok, ResultadoItem.sale_a_taller, ResultadoItem.dar_de_baja,
)
MANTENIMIENTOS = [
    dict(
        prov=LA, tipo=PV, visita=date(2026, 2, 16), cierre_dias=3, estado="cerrada",
        notas="Visita preventiva de inicio de año Laerdal Chile.",
        items=[
            ("Fantoma adulto alta fidelidad", OK_, None,
             "Revisión general, actualización de firmware", 45000, None, None, None),
            ("Fantoma recién nacido soporte vital avanzado", OK_, None,
             "Revisión general y prueba de sensores", 45000, None, None, None),
            ("Fantoma RCP adulto", OK_, None, "Cambio de pulmones desechables",
             28000, None, None, None),
            ("Fantoma RCP pediátrico", OK_, "Resorte de compresión con desgaste",
             "Ajuste de resorte; se recomienda reemplazo en el año", 28000,
             None, None, None),
            ("Fantoma politrauma", OK_, None, "Revisión de heridas intercambiables",
             32000, None, None, None),
        ],
    ),
    dict(
        prov=LA, tipo=CO, visita=date(2026, 4, 27), cierre_dias=2, estado="cerrada",
        notas="Correctivo por falla de batería durante taller de abril.",
        items=[
            ("Fantoma recién nacido soporte vital avanzado", OK_,
             "Batería principal sin carga tras 40 minutos de uso",
             "Reemplazo de batería principal", 180000, None, None, None),
        ],
    ),
    dict(
        prov=QU, tipo=CO, visita=date(2026, 6, 15), cierre_dias=1, estado="cancelada",
        notas=(
            "Cancelada: la falla del microscopio se resolvió internamente con "
            "limpieza de óptica."
        ),
        items=[
            ("Microscopio óptico binocular", ResultadoItem.pendiente,
             "Imagen borrosa en objetivo 100x", None, None, None, None, None),
        ],
    ),
    dict(
        prov=LA, tipo=PV, visita=date(2026, 7, 13), cierre_dias=4, estado="cerrada",
        notas="Visita semestral preventiva Laerdal Chile (receso de invierno).",
        items=[
            ("Fantoma adulto alta fidelidad", OK_, None, "Mantención semestral",
             45000, None, None, None),
            ("Fantoma RCP adulto", OK_, None, "Mantención semestral", 28000,
             None, None, None),
            ("Fantoma RCP pediátrico", BAJA_,
             "Carcasa torácica fracturada y resorte de compresión roto",
             "Reparación supera el valor del equipo; se recomienda reemplazo",
             None, None, None, None),
            ("Fantoma politrauma", TALLER_, "Módulo de sangrado sin presión",
             "Sale a taller Laerdal para cambio de bomba", 120000,
             date(2026, 7, 14), date(2026, 8, 7), date(2026, 8, 6)),
            ("Brazo de punción adulto", OK_, None, "Cambio de piel y venas",
             65000, None, None, None),
        ],
    ),
    dict(
        prov=BM, tipo=VT, visita=date(2026, 7, 20), cierre_dias=2, estado="cerrada",
        notas="Validación técnica anual de equipos biomédicos.",
        items=[
            ("Desfibrilador", OK_, None, "Prueba de descarga y certificación",
             55000, None, None, None),
            ("DEA Desfibrilador Externo Automático", OK_, None,
             "Cambio de electrodos de entrenamiento", 38000, None, None, None),
            ("Monitor multiparámetro", OK_, None, "Calibración de módulos",
             48000, None, None, None),
            ("Electrocardiógrafo", OK_, None, "Calibración", 42000, None, None, None),
        ],
    ),
    dict(
        prov=QU, tipo=CO, visita=date(2026, 8, 24), cierre_dias=1, estado="cerrada",
        notas="Correctivo por vibración excesiva de la centrífuga.",
        items=[
            ("Centrífuga de laboratorio", OK_, "Vibración excesiva a 3.000 rpm",
             "Balanceo de rotor y cambio de amortiguadores", 85000, None, None, None),
        ],
    ),
    dict(
        prov=BM, tipo=VT, visita=date(2026, 9, 28), cierre_dias=None, estado="en_curso",
        notas=(
            "Validación técnica del monitor multiparámetro tras falla en "
            "taller de septiembre. En espera de repuesto."
        ),
        items=[
            ("Monitor multiparámetro", ResultadoItem.pendiente,
             "Se apaga al cambiar a batería", None, None, None, None, None),
        ],
    ),
    dict(
        prov=DE, tipo=CO, visita=date(2026, 10, 9), cierre_dias=3, estado="cerrada",
        notas="Servicio técnico de equipos dentales.",
        items=[
            ("Autoclave de mesa 18 L", TALLER_, "No alcanza presión de trabajo",
             "Sale a taller del proveedor para cambio de válvula", 210000,
             date(2026, 10, 13), date(2026, 12, 18), None),
            ("Sillón dental clínico - box 1", OK_, "Pedal de control intermitente",
             "Cambio de pedal", 75000, None, None, None),
        ],
    ),
    dict(
        prov=LA, tipo=PV, visita=date(2026, 11, 16), cierre_dias=0, estado="cancelada",
        notas=(
            "Cancelada: el proveedor no tuvo técnico disponible; "
            "se reprogramó la visita."
        ),
        items=[
            ("Fantoma adulto alta fidelidad", ResultadoItem.pendiente, None,
             None, None, None, None, None),
            ("Fantoma recién nacido soporte vital avanzado", ResultadoItem.pendiente,
             None, None, None, None, None, None),
        ],
    ),
    # Orden del guion (docs/DEMO.md, Operador paso 14): siempre en_curso.
    dict(
        prov=LA, tipo=PV, visita=None, cierre_dias=None, estado="en_curso",
        notas=(
            "Visita semestral preventiva Laerdal Chile. "
            "Fantoma adulto alta fidelidad: falla en módulo de sonidos. "
            "Fantoma RN soporte vital avanzado: revisión de batería y sensores."
        ),
        items=[
            ("Fantoma adulto alta fidelidad", ResultadoItem.pendiente,
             "Falla en módulo de sonidos respiratorios. No reproduce ruidos "
             "pulmonares durante simulación de insuficiencia respiratoria.",
             None, None, None, None, None),
            ("Fantoma recién nacido soporte vital avanzado", ResultadoItem.pendiente,
             "Revisión preventiva de batería y calibración de sensores.",
             None, None, None, None, None),
        ],
    ),
]

# Incidencias: (activo, fecha_objetivo, tipo, severidad, estado, descripcion,
#               nota del ítem de revisión)
# Se registran en la última clase de la sala del activo en o antes de la fecha
# objetivo (responsable = docente de esa clase). fecha_objetivo=None indica la
# incidencia del guion: 16 días antes de hoy (antes de la visita Laerdal).
T_DANO, T_PIEZA, T_FALLA, T_OTRO = (
    TipoIncidencia.dano_fisico, TipoIncidencia.pieza_perdida,
    TipoIncidencia.mal_funcionamiento, TipoIncidencia.otro,
)
LEVE, MODERADA, CRITICA = (
    SeveridadIncidencia.leve, SeveridadIncidencia.moderada,
    SeveridadIncidencia.critica,
)
ABIERTA, EN_REV, RESUELTA = (
    EstadoIncidencia.abierta, EstadoIncidencia.en_revision,
    EstadoIncidencia.resuelta,
)
INCIDENCIAS_DATA = [
    ("Fantoma adulto para entrenamiento de enfermería", date(2026, 3, 26),
     T_PIEZA, LEVE, RESUELTA,
     "Brazalete de identificación y capucha de simulación no encontrados al "
     "cierre de sala. Aparecieron en bodega durante la limpieza.",
     "Faltan brazalete y capucha"),
    ("DEA Desfibrilador Externo Automático", date(2026, 4, 15),
     T_OTRO, LEVE, RESUELTA,
     "Electrodos de entrenamiento con fecha de vencimiento cumplida.",
     "Electrodos vencidos"),
    ("Fantoma recién nacido soporte vital avanzado", date(2026, 4, 23),
     T_FALLA, CRITICA, RESUELTA,
     "Batería principal con descarga completa durante taller. "
     "Equipo se apagó a los 40 minutos de uso.",
     "Batería baja, enviado a mantenimiento"),
    ("Fantoma RCP pediátrico", date(2026, 5, 6),
     T_DANO, CRITICA, RESUELTA,
     "Carcasa torácica fisurada; las compresiones no recuperan posición.",
     "Carcasa fisurada"),
    ("Brazo de punción adulto", date(2026, 5, 20),
     T_DANO, MODERADA, RESUELTA,
     "Piel sintética perforada en zona antecubital; filtra sangre simulada.",
     "Piel perforada"),
    ("Microscopio óptico binocular", date(2026, 6, 10),
     T_FALLA, LEVE, RESUELTA,
     "Imagen borrosa con objetivo de inmersión 100x.",
     "Óptica sucia"),
    ("Sillón dental clínico - box 1", date(2026, 6, 17),
     T_FALLA, MODERADA, RESUELTA,
     "Pedal de control responde de forma intermitente.",
     "Pedal intermitente"),
    ("Centrífuga de laboratorio", date(2026, 8, 19),
     T_FALLA, MODERADA, RESUELTA,
     "Vibración excesiva al superar 3.000 rpm.",
     "Vibración excesiva"),
    ("Balanza analítica de precisión", date(2026, 9, 2),
     T_OTRO, LEVE, RESUELTA,
     "Certificado de calibración vencido; lecturas con desviación de 0,3 mg.",
     "Calibración vencida"),
    ("Monitor multiparámetro", date(2026, 9, 23),
     T_FALLA, CRITICA, EN_REV,
     "El monitor se apaga al desconectarlo de la red eléctrica.",
     "Se apaga con batería"),
    ("Cama clínica pediátrica", date(2026, 9, 30),
     T_DANO, LEVE, ABIERTA,
     "Baranda lateral derecha suelta; no queda trabada en posición alta.",
     "Baranda suelta"),
    ("Autoclave de mesa 18 L", date(2026, 10, 7),
     T_FALLA, CRITICA, EN_REV,
     "El autoclave no alcanza la presión de trabajo; ciclo abortado.",
     "No alcanza presión"),
    ("Fantoma adulto de cuidados de enfermería", date(2026, 10, 21),
     T_PIEZA, MODERADA, ABIERTA,
     "Falta la sonda nasogástrica de entrenamiento del maniquí.",
     "Falta sonda de entrenamiento"),
    ("Lámpara de fotocurado LED", date(2026, 11, 4),
     T_OTRO, LEVE, EN_REV,
     "Cargador de la lámpara no encontrado; batería al 10 %.",
     "Sin cargador"),
    ("Camilla de transporte", date(2026, 11, 18),
     T_DANO, MODERADA, ABIERTA,
     "Rueda delantera con freno trabado.",
     "Freno trabado"),
    ("Fantoma politrauma", date(2026, 12, 2),
     T_PIEZA, LEVE, ABIERTA,
     "Falta una herida intercambiable del kit de trauma.",
     "Falta herida del kit"),
    # Incidencia del guion (antes de la orden Laerdal en curso).
    ("Fantoma adulto alta fidelidad", None,
     T_FALLA, MODERADA, EN_REV,
     "Módulo de sonidos respiratorios sin respuesta durante simulación de "
     "insuficiencia respiratoria. No reproduce ruidos pulmonares ni cardíacos.",
     "Falla en módulo de sonidos"),
]

COMENTARIOS_DOCENTES = [
    ("María José Toro", TipoComentario.positivo, date(2026, 4, 2),
     "Devuelve la sala ordenada y deja registro de insumos usados."),
    ("David Contreras", TipoComentario.neutro, date(2026, 4, 10),
     "Solicita confirmar el estado del Fantoma alta fidelidad antes de cada RCP."),
    ("Felipe Alegría", TipoComentario.negativo, date(2026, 5, 15),
     "Avisó cambio de horario con menos de 24 horas de anticipación."),
    ("Carolina Quinio", TipoComentario.positivo, date(2026, 6, 5),
     "Excelente manejo de residuos en laboratorio; buena referencia para alumnos."),
    ("Javiera Fuentes Torres", TipoComentario.neutro, date(2026, 6, 19),
     "Pide sumar espejos bucales para el segundo semestre."),
    ("Diego Pérez", TipoComentario.negativo, date(2026, 8, 27),
     "Quedaron catéteres fuera del contenedor cortopunzante al cierre."),
    ("Rodrigo Valdés", TipoComentario.positivo, date(2026, 9, 10),
     "Buena coordinación previa del material de fraccionamiento."),
    ("Constanza Zúñiga", TipoComentario.neutro, date(2026, 10, 15),
     "Consulta por reemplazo del Fantoma RCP pediátrico para su sección."),
]

# Programaciones de hoy (Vista de Salas en vivo). Horas relativas a la
# ejecución, en minutos: (sala, taller, inicio, fin, revision, notas)
# revision: None | 'completada' | 'en_revision'
PROGRAMACIONES_HOY = [
    ("Sala 010", "Taller de RCP avanzado", -150, -30, None,
     "Requiere Fantoma adulto alta fidelidad operativo"),   # pendiente revisión
    ("Sala 011", "Taller de venopunción", -60, 120, None, None),   # en clase
    ("Sala 016", "Taller de toma de muestra", -300, -180, "completada", None),
    ("Sala 013", "Taller de vendajes e inmovilización", -240, -100,
     "en_revision", None),
    ("Sala 014", "Taller de control de signos vitales", 180, 300, None, None),
]
ESTADO_ESPERADO_HOY = {
    "Sala 010": "pendiente_revision",
    "Sala 011": "en_clase",
    "Sala 016": "revisada",
    "Sala 013": "en_revision",
    "Sala 014": "proxima",
}
DOCENTE_HOY_RESPALDO = {
    "Taller de RCP avanzado": "David Contreras",
    "Taller de venopunción": "María José Toro",
    "Taller de toma de muestra": "Lissett Ayala",
    "Taller de vendajes e inmovilización": "Olga Tapia",
    "Taller de control de signos vitales": "María José Toro",
}

# Insumos de alta rotación que se reponen en las últimas semanas: alimentan la
# pestaña "Alertas resueltas" (7, 14 y 30 días). (insumo, slot desde el final)
REPOSICIONES_RECIENTES = [
    ("Guantes de látex talla M", 1),
    ("Gasa estéril 10x10 cm", 1),
    ("Jeringa 10ml con aguja 21G", 2),
    ("Catéter venoso periférico 20G", 2),
    ("Guantes nitrilo sin polvo talla M", 3),
    ("Apósito adhesivo 10x8 cm", 4),
]
# Órdenes de emergencia: (fecha cierre, proveedor, nota, [(insumo, cantidad)])
EMERGENCIAS = [
    (datetime(2026, 5, 13, 12, 30, tzinfo=ZONA), MS,
     "Reposición urgente de EPP respiratorio por alza de cuadros respiratorios",
     [("Mascarillas N95 FFP2", 60), ("Mascarillas quirúrgicas", 15)]),
    (datetime(2026, 9, 9, 12, 30, tzinfo=ZONA), MS,
     "Reposición urgente de sueros y contenedores - stock crítico",
     [(SUERO_GUION, 20), ("Contenedor cortopunzante 3L", 10)]),
]
# Órdenes canceladas: (creación, proveedor, tipo, actividad, nota, items)
CANCELADAS = [
    (datetime(2026, 5, 11, 10, 20, tzinfo=ZONA), MS, TipoOrden.semanal, "1010",
     "Cancelada: el proveedor no tenía stock de N95; se reemplazó por una "
     "orden de emergencia.",
     [("Mascarillas N95 FFP2", 80), ("Pecheras desechables", 100)]),
    (datetime(2026, 9, 14, 11, 0, tzinfo=ZONA), QU, TipoOrden.semanal, "1064",
     "Cancelada: cotización vencida; se volverá a cotizar.",
     [("Placa Petri desechable 90 mm", 10), ("Portaobjetos de vidrio", 10)]),
]
ACTIVIDAD_PROV = {MS: "1010", LA: "1060", BM: "1060", DE: "1064", QU: "1064"}

# Proveedores no generales: cierres de órdenes (jueves) en el año.
SLOTS_PROVEEDOR = {
    LA: [date(2026, 2, 19), date(2026, 6, 18), date(2026, 7, 23), date(2026, 10, 15)],
    BM: [date(2026, 2, 19), date(2026, 5, 14), date(2026, 7, 23), date(2026, 9, 24),
         date(2026, 12, 10)],
    DE: [date(2026, 2, 26), date(2026, 5, 20), date(2026, 7, 30), date(2026, 10, 1),
         date(2026, 11, 26)],
    QU: [date(2026, 2, 26), date(2026, 4, 23), date(2026, 7, 30), date(2026, 9, 24),
         date(2026, 11, 19)],
}
FECHAS_SEMESTRALES = {date(2026, 2, 19), date(2026, 2, 26), date(2026, 7, 23),
                      date(2026, 7, 30)}

OPERADORES_IDX = (2, 3)        # María González, Carlos Fuentes
IP_USUARIO = ["192.168.1.20", "192.168.1.21", "192.168.1.32", "192.168.1.33",
              "192.168.1.45", "192.168.1.46"]


# ===========================================================================
# Utilidades
# ===========================================================================

def _rng(*partes) -> random.Random:
    """Generador determinista por clave (independiente del orden de uso)."""
    return random.Random("|".join(str(p) for p in partes))


def _prefijo_codigo(nombre: str) -> str:
    """Misma lógica que el backend para generar prefijo de 3 caracteres."""
    n = (
        nombre.upper()
        .replace("Á", "A").replace("É", "E").replace("Í", "I")
        .replace("Ó", "O").replace("Ú", "U").replace("Ñ", "N")
    )
    return re.sub(r"[^A-Z0-9]", "", n)[:3].ljust(3, "X")


def _en(d: date, hhmm: str, delta_min: int = 0) -> datetime:
    h, m = (int(x) for x in hhmm.split(":"))
    return datetime(d.year, d.month, d.day, h, m, tzinfo=ZONA) + timedelta(
        minutes=delta_min,
    )


def _hhmm(dt: datetime) -> str:
    return dt.strftime("%H:%M")


def _es_habil(d: date) -> bool:
    return d.weekday() < 5 and d not in FERIADOS


def _dias_habiles(desde: date, hasta: date) -> list[date]:
    dias, d = [], desde
    while d <= hasta:
        if _es_habil(d):
            dias.append(d)
        d += timedelta(days=1)
    return dias


def _semestre_de(d: date) -> str:
    """Misma regla que la Vista de Salas: enero-junio = -1, julio-dic = -2."""
    return f"{d.year}-1" if d.month <= 6 else f"{d.year}-2"


def _habil_anterior(d: date) -> date:
    d -= timedelta(days=1)
    while not _es_habil(d):
        d -= timedelta(days=1)
    return d


def _estado_vista(prog, rev_estado, ahora_hhmm: str) -> str:
    """Réplica de calcularEstado() de VistaSalas.tsx para el día de hoy."""
    if rev_estado == "completada":
        return "revisada"
    if rev_estado == "en_revision":
        return "en_revision"
    if prog.hora_inicio and ahora_hhmm < prog.hora_inicio:
        return "proxima"
    if prog.hora_fin and ahora_hhmm >= prog.hora_fin:
        return "pendiente_revision"
    return "en_clase"


class Ctx:
    """Estado compartido de la carga (mapas por nombre y acumuladores)."""

    def __init__(self, db, ahora: datetime):
        self.db = db
        self.ahora = ahora
        self.hoy = ahora.date()
        self.inicio_hoy = ahora.replace(hour=0, minute=0, second=0, microsecond=0)
        self.fin_hoy = ahora.replace(hour=23, minute=59, second=0, microsecond=0)
        self.salas = {}
        self.cats = []
        self.usuarios = []
        self.provs = {}
        self.docentes = {}
        self.asigs = {}
        self.insumos = {}
        self.talleres = {}
        self.talleres_por_asig = defaultdict(list)
        self.paquetes = {}          # (taller, semestre) -> PaqueteInsumo
        self.paquete_items = {}     # (taller, semestre) -> [(insumo, cant)]
        self.activos = {}
        self.activo_alta = {}
        self.activo_baja = {}
        self.secciones = []
        self.progs = []             # [(ProgramacionTaller, meta)]
        self.progs_hoy = {}         # sala -> ProgramacionTaller
        self.revisiones = {}        # prog.id -> RevisionSala
        self.no_conformes = defaultdict(dict)   # prog.id -> {activo: nota}
        self.movs = []              # dicts de movimientos
        self.audit = []             # tuplas (fecha, accion, usuario, ...)
        self.prestamos = []         # préstamos de implementos por reintegrar
        self.fijas_entrada = []     # entradas manuales (ajustes, reposiciones)
        self.n = defaultdict(int)   # conteos para el resumen

    def rel(self, delta_min: int) -> datetime:
        """Hora de hoy relativa a la ejecución, acotada a 00:00-23:59."""
        t = self.ahora + timedelta(minutes=delta_min)
        return min(max(t, self.inicio_hoy), self.fin_hoy)

    @property
    def admin(self):
        return self.usuarios[0]

    @property
    def coord(self):
        return self.usuarios[1]

    def operador(self, *clave):
        r = _rng("operador", *clave).random()
        if r < 0.08:
            return self.coord
        return self.usuarios[OPERADORES_IDX[0] if r < 0.55 else OPERADORES_IDX[1]]

    def log(self, fecha, accion, usuario=None, entidad=None, entidad_id=None,
            detalle=None):
        self.audit.append((fecha, accion, usuario, entidad, entidad_id, detalle))

    def mov(self, fecha, insumo, subtipo, cantidad, motivo, usuario,
            sala=None, paquete=None, manual=False):
        tipo = _TIPO_DE_SUBTIPO[subtipo]
        self.movs.append(dict(
            fecha=fecha, insumo=insumo, tipo=tipo, subtipo=subtipo,
            cantidad=cantidad, motivo=motivo, usuario=usuario,
            sala=sala, paquete=paquete,
        ))
        if manual:
            self.log(
                fecha + timedelta(seconds=5), "REGISTRAR_MOVIMIENTO", usuario,
                "movimiento", None,
                f"{tipo.value}/{subtipo.value} {cantidad}x {insumo}",
            )


_ST = SubtipoMovimiento
_TIPO_DE_SUBTIPO = {
    _ST.compra: TipoMovimiento.entrada,
    _ST.devolucion_proveedor_entrada: TipoMovimiento.entrada,
    _ST.ajuste_entrada: TipoMovimiento.entrada,
    _ST.consumo_taller: TipoMovimiento.salida,
    _ST.prestamo_implemento: TipoMovimiento.salida,
    _ST.devolucion_proveedor_salida: TipoMovimiento.salida,
    _ST.baja: TipoMovimiento.salida,
    _ST.ajuste_salida: TipoMovimiento.salida,
    _ST.enviado_mantenimiento: TipoMovimiento.interno,
    _ST.reingreso_disponible: TipoMovimiento.interno,
    _ST.devolucion_interna: TipoMovimiento.interno,
}


# ===========================================================================
# Limpieza y catálogos
# ===========================================================================

def _limpiar(db) -> None:
    """Vacía las tablas de datos y reinicia sus secuencias.

    TRUNCATE ... RESTART IDENTITY deja los IDs (y con ellos los SKU, códigos
    internos y números de orden) iguales en cada ejecución. Corre dentro de la
    misma transacción que la carga: si algo falla, el rollback lo deshace.
    La tabla roles (poblada por migración) no se toca.
    """
    print("\nLimpiando datos existentes...")
    tablas = [m.__tablename__ for m in (
        RevisionSalaItem, RevisionSala, OrdenMantenimientoItem, PaqueteItem,
        Movimiento, PaqueteInsumo, ProgramacionTaller, Taller, UnidadImplemento,
        OrdenMantenimiento, Incidencia, OrdenEntradaItem, OrdenEntrada,
        ActivoFijo, Proveedor, RetornoImplemento, AuditLog, SolicitudItem,
        SolicitudRetiro, ClaseDocente, ComentarioDocente, Docente, Insumo,
        Asignatura, Sala, Categoria, TokenRecuperacion, Usuario,
    )]
    db.execute(text(f"TRUNCATE TABLE {', '.join(tablas)} RESTART IDENTITY CASCADE"))
    print("  OK")


def _insertar_catalogos(ctx: Ctx) -> None:
    db = ctx.db
    print("Insertando salas, categorías, usuarios y proveedores...")
    for nombre, tipo, desc in SALAS:
        ctx.salas[nombre] = Sala(nombre=nombre, tipo=tipo, descripcion=desc)
    ctx.cats = [Categoria(nombre=n) for n in CATEGORIAS]
    db.add_all(list(ctx.salas.values()) + ctx.cats)

    # La tabla roles la puebla la migración c7f3a92e1b08 (Fase 2 expand).
    rol_ids = {r.nombre: r.id for r in db.query(Rol).all()}
    for n_usuario, (nombre, email, pwd, rol_usuario) in enumerate(USUARIOS, 1):
        ctx.usuarios.append(Usuario(
            nombre=nombre, email=email,
            password_hash=hashear_password(pwd), rol=rol_usuario,
            rol_id=rol_ids.get(rol_usuario.value),
            totp_secret=TOTP_DEMO[email],
            totp_habilitado=True,
            recovery_codes=_recovery_codes_json(_recovery_codes_demo(n_usuario)),
        ))
    for clave, datos in PROVEEDORES.items():
        ctx.provs[clave] = Proveedor(**datos)
    db.add_all(ctx.usuarios + list(ctx.provs.values()))
    db.flush()

    alta = datetime(2026, 1, 5, 8, 40, tzinfo=ZONA)
    for i, u in enumerate(ctx.usuarios[1:], 1):
        ctx.log(alta + timedelta(minutes=2 * i), "CREAR_USUARIO", ctx.admin,
                "usuario", u.id, u.email)
    for i, clave in enumerate((BM, DE, QU)):
        p = ctx.provs[clave]
        ctx.log(datetime(2026, 1, 7, 10, 5 + i, tzinfo=ZONA), "CREAR_PROVEEDOR",
                ctx.coord, "proveedor", p.id, p.nombre)


def _insertar_docentes(ctx: Ctx) -> None:
    print("Insertando docentes y asignaturas...")
    db = ctx.db
    for i, (nombre, email, rut, _) in enumerate(DOCENTES_DATA):
        nuevo = nombre in DOCENTES_2026_2
        creado = datetime(2026, 7, 20, 9, 0, tzinfo=ZONA) if nuevo else datetime(
            2026, 1, 12, 9, 0, tzinfo=ZONA)
        creado = min(creado + timedelta(minutes=3 * i), ctx.ahora)
        d = Docente(nombre=nombre, email=email, rut=rut, activo=True,
                    created_at=creado)
        ctx.docentes[nombre] = d
    db.add_all(list(ctx.docentes.values()))
    for nombre, codigo, carrera, *_ in ASIGNATURAS:
        ctx.asigs[codigo] = Asignatura(nombre=nombre, codigo=codigo, carrera=carrera)
    db.add_all(list(ctx.asigs.values()))
    db.flush()
    for d in ctx.docentes.values():
        ctx.log(d.created_at, "CREAR_DOCENTE", ctx.coord, "docente", d.id, d.nombre)

    for nombre, tipo, dia, texto in COMENTARIOS_DOCENTES:
        cuando = datetime(dia.year, dia.month, dia.day, 17, 10, tzinfo=ZONA)
        if cuando > ctx.ahora:
            continue
        doc = ctx.docentes[nombre]
        db.add(ComentarioDocente(docente_id=doc.id, tipo=tipo, contenido=texto,
                                 creado_por_id=ctx.coord.id, created_at=cuando))
        ctx.log(cuando, "COMENTARIO_DOCENTE", ctx.coord, "docente", doc.id,
                f"{doc.nombre} [{tipo.value}]")
        ctx.n["comentarios"] += 1


def _insertar_insumos(ctx: Ctx) -> None:
    print("Insertando insumos e implementos...")
    db = ctx.db
    for nombre, unidad, stock, minimo, cat_idx, tipo, costo, prov in INSUMOS:
        ctx.insumos[nombre] = Insumo(
            nombre=nombre, descripcion=unidad, unidad_medida=unidad,
            stock_actual=0, stock_minimo=minimo, sala_id=None,
            categoria_id=ctx.cats[cat_idx].id, tipo=TipoInsumo(tipo),
            costo_unitario=costo, fecha_vencimiento=VENCIMIENTOS.get(nombre),
        )
    db.add_all(list(ctx.insumos.values()))
    db.flush()
    for ins in ctx.insumos.values():
        ins.sku = f"HST-{ins.id:05d}"
    ctx.log(datetime(2026, 1, 5, 9, 5, tzinfo=ZONA), "IMPORTAR_INSUMOS", ctx.admin,
            "insumo", None,
            f"{len(INSUMOS)} insumos importados desde inventario_inicial_2026.xlsx")


def _insertar_talleres_paquetes(ctx: Ctx) -> None:
    print("Insertando talleres y paquetes...")
    db = ctx.db
    semestres_asig = {a[1]: a[3] for a in ASIGNATURAS}
    for nombre, desc, sigla, *_ in TALLERES_DATA:
        t = Taller(nombre=nombre, descripcion=desc,
                   asignatura_id=ctx.asigs[sigla].id)
        ctx.talleres[nombre] = t
        ctx.talleres_por_asig[sigla].append(nombre)
    db.add_all(list(ctx.talleres.values()))
    db.flush()
    paquetes = []
    for i, (nombre, _, sigla, nota, items) in enumerate(TALLERES_DATA):
        for sem in semestres_asig[sigla]:
            base = date(2026, 2, 20) if sem == S1 else date(2026, 7, 20)
            creado = min(
                datetime(base.year, base.month, base.day, 10, 0, tzinfo=ZONA)
                + timedelta(days=i % 6, minutes=7 * i),
                ctx.ahora,
            )
            p = PaqueteInsumo(
                taller_id=ctx.talleres[nombre].id, semestre=sem,
                creado_por_id=(ctx.coord if i % 3 else ctx.usuarios[2]).id,
                fecha_creacion=creado, notas=nota,
                bloqueado=(sem == S1 and ctx.hoy > SEMESTRES[S1][1]),
            )
            ctx.paquetes[(nombre, sem)] = p
            lista = []
            for insumo, cant, nota_item in items:
                if insumo not in ctx.insumos:
                    raise ValueError(f"Paquete '{nombre}': insumo '{insumo}' no existe")
                p.items.append(PaqueteItem(
                    insumo_id=ctx.insumos[insumo].id, cantidad_requerida=cant,
                    notas=nota_item,
                ))
                lista.append((insumo, cant))
            ctx.paquete_items[(nombre, sem)] = lista
            paquetes.append(p)
    db.add_all(paquetes)
    db.flush()


def _insertar_activos(ctx: Ctx) -> None:
    print("Insertando activos fijos...")
    db = ctx.db
    for nombre, desc, tipo, sala, fid, notas, prov, alta in ACTIVOS_FIJOS_DEMO:
        if alta and alta > ctx.hoy:
            continue
        af = ActivoFijo(
            nombre=nombre, descripcion=desc, tipo=tipo,
            sala_id=ctx.salas[sala].id, fidelidad=fid,
            estado=EstadoActivo.disponible, notas=notas,
            proveedor_id=ctx.provs[prov].id if prov else None,
        )
        ctx.activos[nombre] = af
        ctx.activo_alta[nombre] = alta
    db.add_all(list(ctx.activos.values()))
    db.flush()
    for af in ctx.activos.values():
        af.codigo_interno = f"{'MUE' if af.tipo == MU else 'PHN'}-{af.id:05d}"


# ===========================================================================
# Calendario: secciones y programaciones
# ===========================================================================

def _planificar_secciones(ctx: Ctx) -> None:
    """Asigna a cada sección una celda única (día, bloque, sala) por semestre.

    La unicidad de la celda garantiza que no haya choques de sala y hora; los
    docentes tampoco se repiten en el mismo día y bloque.
    """
    print("Planificando secciones (horario semanal)...")
    db = ctx.db
    pool = defaultdict(list)
    for nombre, _, _, carrera in DOCENTES_DATA:
        pool[carrera].append(nombre)
    for sem in (S1, S2):
        ocup_sala, ocup_doc = set(), set()
        carga_dia = [0] * 5
        carga_doc = defaultdict(int)
        for nombre, sigla, carrera, secs, salas, freq in ASIGNATURAS:
            dias_asig = set()
            for k in range(secs.get(sem, 0)):
                elegido = None
                orden = sorted(range(5), key=lambda d: (
                    d in dias_asig, carga_dia[d], (d + k + len(sigla)) % 5))
                for d in orden:
                    for b in range(len(BLOQUES)):
                        for sala in salas:
                            if (d, b, sala) in ocup_sala:
                                continue
                            fijo = DOCENTE_FIJO.get((sigla, sem))
                            candidatos = [fijo] if fijo else sorted(
                                (n for n in pool[carrera]
                                 if sem == S2 or n not in DOCENTES_2026_2),
                                key=lambda n: (carga_doc[n], n),
                            )
                            doc = next(
                                (n for n in candidatos if (n, d, b) not in ocup_doc),
                                None,
                            )
                            if doc:
                                elegido = (d, b, sala, doc)
                                break
                        if elegido:
                            break
                    if elegido:
                        break
                if not elegido:
                    raise RuntimeError(f"Sin celda libre para {sigla} {sem}")
                d, b, sala, doc = elegido
                ocup_sala.add((d, b, sala))
                ocup_doc.add((doc, d, b))
                carga_dia[d] += 1
                carga_doc[doc] += 1
                dias_asig.add(d)
                seccion = f"{(k + 1) if sem == S1 else (k + 11):03d}D"
                r = _rng("est", sigla, sem, k)
                n_est = r.randint(26, 34) if carrera == TENS else r.randint(16, 26)
                inicio, fin = BLOQUES[b]
                clase = ClaseDocente(
                    docente_id=ctx.docentes[doc].id,
                    asignatura_id=ctx.asigs[sigla].id,
                    seccion=seccion, semestre=sem, num_estudiantes=n_est,
                    dia_semana=DIAS_SEMANA[d], hora_inicio=inicio, hora_fin=fin,
                )
                db.add(clase)
                ctx.secciones.append(dict(
                    sigla=sigla, sem=sem, k=k, seccion=seccion, docente=doc,
                    dia=d, bloque=b, sala=sala, freq=freq, carrera=carrera,
                ))
    db.flush()
    for sem in (S1, S2):
        n = sum(1 for s in ctx.secciones if s["sem"] == sem)
        cuando = (datetime(2026, 2, 27, 11, 0, tzinfo=ZONA) if sem == S1
                  else datetime(2026, 7, 30, 11, 0, tzinfo=ZONA))
        if cuando <= ctx.ahora:
            ctx.log(cuando, "IMPORTAR_HORARIO", ctx.admin, "clase_docente", None,
                    f"{n} creadas, 0 actualizadas")


def _insertar_programaciones(ctx: Ctx) -> None:
    print("Insertando programaciones de talleres...")
    db = ctx.db
    nuevas = []
    for sem, (inicio, fin) in SEMESTRES.items():
        lunes0 = inicio - timedelta(days=inicio.weekday())
        semana = 0
        while lunes0 + timedelta(days=7 * semana) <= fin:
            lunes = lunes0 + timedelta(days=7 * semana)
            for sec in (s for s in ctx.secciones if s["sem"] == sem):
                if sec["freq"] == 2 and semana % 2 != sec["k"] % 2:
                    continue
                dia = lunes + timedelta(days=sec["dia"])
                if dia < inicio or dia > fin or not _es_habil(dia) or dia == ctx.hoy:
                    continue
                opciones = ctx.talleres_por_asig[sec["sigla"]]
                taller = opciones[(semana + sec["k"]) % len(opciones)]
                h_ini, h_fin = BLOQUES[sec["bloque"]]
                p = ProgramacionTaller(
                    taller_id=ctx.talleres[taller].id,
                    sala_id=ctx.salas[sec["sala"]].id, fecha=dia,
                    hora_inicio=h_ini, hora_fin=h_fin,
                    docente_nombre=sec["docente"], seccion=sec["seccion"],
                    semestre=sem,
                )
                nuevas.append(p)
                ctx.progs.append((p, dict(taller=taller, sala=sec["sala"], sem=sem)))
            semana += 1

    # Programaciones de hoy (horas relativas a la ejecución).
    sem_hoy = _semestre_de(ctx.hoy)
    for sala, taller, d_ini, d_fin, _, notas in PROGRAMACIONES_HOY:
        sigla = next(t[2] for t in TALLERES_DATA if t[0] == taller)
        sec = next((s for s in ctx.secciones
                    if s["sigla"] == sigla and s["sem"] == sem_hoy), None)
        p = ProgramacionTaller(
            taller_id=ctx.talleres[taller].id, sala_id=ctx.salas[sala].id,
            fecha=ctx.hoy, hora_inicio=_hhmm(ctx.rel(d_ini)),
            hora_fin=_hhmm(ctx.rel(d_fin)),
            docente_nombre=sec["docente"] if sec else DOCENTE_HOY_RESPALDO[taller],
            seccion=sec["seccion"] if sec else "001D", semestre=sem_hoy, notas=notas,
        )
        nuevas.append(p)
        ctx.progs_hoy[sala] = p
        ctx.progs.append((p, dict(taller=taller, sala=sala, sem=sem_hoy, hoy=True)))
    db.add_all(nuevas)
    db.flush()
    ctx.n["programaciones"] = len(nuevas)


# ===========================================================================
# Mantenimiento e incidencias
# ===========================================================================

def _insertar_mantenimiento(ctx: Ctx) -> None:
    print("Insertando órdenes de mantenimiento...")
    db = ctx.db
    estado_af = {n: EstadoActivo.disponible for n in ctx.activos}
    for i, m in enumerate(sorted(
            MANTENIMIENTOS, key=lambda x: x["visita"] or ctx.hoy - timedelta(days=12))):
        visita = m["visita"] or ctx.hoy - timedelta(days=12)
        if visita > ctx.hoy:
            continue
        items = [it for it in m["items"] if it[0] in ctx.activos]
        if not items:
            continue
        cierre = (visita + timedelta(days=m["cierre_dias"])
                  if m["cierre_dias"] is not None else None)
        estado = m["estado"]
        if estado != "en_curso" and (cierre is None or cierre > ctx.hoy):
            estado = "en_curso"
        creador = ctx.operador("mant", i)
        orden = OrdenMantenimiento(
            proveedor_id=ctx.provs[m["prov"]].id, creado_por_id=creador.id,
            estado=EstadoOrdenMant(estado), tipo_mantenimiento=m["tipo"],
            fecha_visita=visita, notas=m["notas"],
            activo=(estado != "cancelada"),   # la app oculta las canceladas
        )
        for (af, res, prob, trab, costo, envio, ret_est, ret) in items:
            if estado == "en_curso":
                res, trab, costo, envio, ret_est, ret = (
                    ResultadoItem.pendiente, None, None, None, None, None)
            if ret and ret > ctx.hoy:
                ret = None
            orden.items.append(OrdenMantenimientoItem(
                activo_fijo_id=ctx.activos[af].id, resultado=res,
                descripcion_problema=prob, descripcion_trabajo=trab, costo=costo,
                fecha_envio=envio, fecha_retorno_estimada=ret_est, fecha_retorno=ret,
            ))
            if estado == "en_curso":
                estado_af[af] = EstadoActivo.en_mantenimiento
            elif estado == "cancelada":
                estado_af[af] = EstadoActivo.disponible
            elif res == BAJA_:
                estado_af[af] = EstadoActivo.dado_de_baja
                ctx.activo_baja[af] = cierre
            elif res == TALLER_ and not ret:
                estado_af[af] = EstadoActivo.en_mantenimiento
            else:
                estado_af[af] = EstadoActivo.disponible
        db.add(orden)
        db.flush()
        creado = datetime(visita.year, visita.month, visita.day, 9, 15, tzinfo=ZONA)
        creado = min(creado, ctx.ahora - timedelta(minutes=30))
        ctx.log(creado, "CREAR_ORDEN_MANTENIMIENTO", creador, "orden_mantenimiento",
                orden.id, f"{len(items)} Phantomas · proveedor_id="
                f"{orden.proveedor_id} · visita={visita}")
        if estado != "en_curso":
            cuando = datetime(cierre.year, cierre.month, cierre.day, 16, 30,
                              tzinfo=ZONA)
            accion = ("CERRAR_ORDEN_MANTENIMIENTO" if estado == "cerrada"
                      else "CANCELAR_ORDEN_MANTENIMIENTO")
            detalle = (f"{len(items)} ítems procesados" if estado == "cerrada"
                       else "cancelada")
            ctx.log(min(cuando, ctx.ahora), accion, ctx.coord,
                    "orden_mantenimiento", orden.id, detalle)
        ctx.n["mantenimiento"] += 1
        ctx.n[f"mant_{estado}"] += 1

    for nombre, estado in estado_af.items():
        ctx.activos[nombre].estado = estado
    if ctx.progs_hoy:
        for nombre in ACTIVOS_EN_USO_HOY:
            if estado_af.get(nombre) == EstadoActivo.disponible:
                ctx.activos[nombre].estado = EstadoActivo.en_uso


def _insertar_incidencias(ctx: Ctx) -> None:
    print("Insertando incidencias...")
    db = ctx.db
    sala_de = {a[0]: a[3] for a in ACTIVOS_FIJOS_DEMO}
    pasadas = defaultdict(list)
    for p, meta in ctx.progs:
        if p.fecha < ctx.hoy:
            pasadas[meta["sala"]].append(p)
    for (af, objetivo, tipo, sev, estado, desc, nota) in INCIDENCIAS_DATA:
        if af not in ctx.activos:
            continue
        objetivo = objetivo or ctx.hoy - timedelta(days=16)
        if objetivo >= ctx.hoy:
            continue
        candidatas = [p for p in pasadas[sala_de[af]]
                      if objetivo - timedelta(days=21) <= p.fecha <= objetivo]
        if not candidatas:
            continue
        prog = max(candidatas, key=lambda p: (p.fecha, p.hora_inicio))
        cuando = _en(prog.fecha, prog.hora_fin, -10)
        inc = Incidencia(
            activo_fijo_id=ctx.activos[af].id, tipo=tipo, descripcion=desc,
            sala_id=prog.sala_id, fecha_hora=cuando,
            responsable_nombre=prog.docente_nombre, severidad=sev, estado=estado,
        )
        db.add(inc)
        db.flush()
        ctx.no_conformes[prog.id][af] = nota
        quien = ctx.operador("inc", af)
        ctx.log(cuando + timedelta(minutes=25), "CREAR_INCIDENCIA", quien,
                "incidencia", inc.id, f"{af} [{ctx.activos[af].codigo_interno}] - "
                f"{tipo.value}")
        if estado != ABIERTA:
            cambio = min(cuando + timedelta(days=2, hours=1), ctx.ahora)
            ctx.log(cambio, "EDITAR_INCIDENCIA", ctx.coord, "incidencia", inc.id,
                    f"id={inc.id} estado={estado.value}")
        ctx.n["incidencias"] += 1


# ===========================================================================
# Revisiones de sala
# ===========================================================================

def _items_revision(ctx: Ctx, p, meta) -> list[RevisionSalaItem]:
    """Igual que _generar_items() de la app: paquete + activos de la sala."""
    items = []
    for insumo, cant in ctx.paquete_items.get((meta["taller"], meta["sem"]), []):
        items.append(RevisionSalaItem(
            tipo=ctx.insumos[insumo].tipo.value, nombre=insumo,
            cantidad_esperada=cant,
        ))
    for nombre, af in ctx.activos.items():
        if af.sala_id != p.sala_id:
            continue
        alta, baja = ctx.activo_alta.get(nombre), ctx.activo_baja.get(nombre)
        if (alta and p.fecha < alta) or (baja and p.fecha >= baja):
            continue
        items.append(RevisionSalaItem(
            tipo="activo_fijo", nombre=f"{nombre} [{af.codigo_interno}]",
            cantidad_esperada=None,
        ))
    return items


def _llenar_item(it, r, nota_activo=None):
    if it.tipo == "activo_fijo":
        it.conforme = nota_activo is None
        it.notas_item = nota_activo
        return
    x = r.random()
    if x < 0.82:
        it.cantidad_encontrada, it.conforme = it.cantidad_esperada, True
    elif x < 0.96:
        it.cantidad_encontrada = max(0, it.cantidad_esperada - r.randint(1, 2))
        it.conforme = True
    else:
        it.cantidad_encontrada = max(0, it.cantidad_esperada - r.randint(1, 3))
        it.conforme = False
        it.notas_item = r.choice([
            "Unidad no devuelta", "Empaque dañado", "Faltante informado al docente",
        ])


def _insertar_revisiones(ctx: Ctx) -> None:
    print("Insertando revisiones de sala...")
    db = ctx.db
    pasadas = sorted((x for x in ctx.progs if x[0].fecha < ctx.hoy),
                     key=lambda x: (x[0].fecha, x[0].hora_inicio, x[0].id))
    abiertas = set()
    recientes = [x for x in pasadas if x[0].fecha >= ctx.hoy - timedelta(days=14)]
    for x in recientes[-40::20][:2]:
        abiertas.add(x[0].id)
    nuevas = []
    for p, meta in pasadas:
        r = _rng("rev", p.fecha, p.sala_id, p.hora_inicio)
        ini = _en(p.fecha, p.hora_fin, r.randint(5, 15))
        fin = ini + timedelta(minutes=r.randint(10, 25))
        en_rev = p.id in abiertas
        oper = ctx.operador("rev", p.fecha, p.sala_id)
        rev = RevisionSala(
            programacion_id=p.id, sala_id=p.sala_id, fecha=p.fecha,
            operador_id=oper.id, estado="en_revision" if en_rev else "completada",
            hora_inicio_rev=_hhmm(ini), hora_fin_rev=None if en_rev else _hhmm(fin),
            creado_en=ini,
        )
        items = _items_revision(ctx, p, meta)
        for j, it in enumerate(items):
            if en_rev and j >= len(items) // 2:
                continue
            nota = None
            if it.tipo == "activo_fijo":
                base = it.nombre.rsplit(" [", 1)[0]
                nota = ctx.no_conformes[p.id].get(base)
            _llenar_item(it, r, nota)
        rev.items = items
        nuevas.append(rev)
        ctx.revisiones[p.id] = rev
        sala = next(n for n, s in ctx.salas.items() if s.id == p.sala_id)
        ctx.log(ini, "CREAR_REVISION_SALA", oper, "revision_sala", None,
                f"{sala} - {p.fecha}")
        if not en_rev:
            ctx.log(fin, "COMPLETAR_REVISION_SALA", oper, "revision_sala", None,
                    f"{sala} - {p.fecha}")

    # Revisiones de hoy (Sala 016 revisada, Sala 013 en revisión).
    for sala, taller, _, d_fin, estado, _ in PROGRAMACIONES_HOY:
        if not estado:
            continue
        p = ctx.progs_hoy[sala]
        meta = dict(taller=taller, sem=p.semestre)
        ini = ctx.rel(d_fin + 10)
        fin = min(ctx.rel(d_fin + 30), ctx.ahora)
        oper = ctx.usuarios[OPERADORES_IDX[0]]
        rev = RevisionSala(
            programacion_id=p.id, sala_id=p.sala_id, fecha=p.fecha,
            operador_id=oper.id, estado=estado, hora_inicio_rev=_hhmm(ini),
            hora_fin_rev=_hhmm(fin) if estado == "completada" else None,
            creado_en=min(ini, ctx.ahora),
        )
        items = _items_revision(ctx, p, meta)
        r = _rng("rev-hoy", sala)
        for j, it in enumerate(items):
            if estado == "completada" or j < len(items) // 2:
                _llenar_item(it, r)
        rev.items = items
        nuevas.append(rev)
        ctx.revisiones[p.id] = rev
        ctx.log(min(ini, ctx.ahora), "CREAR_REVISION_SALA", oper, "revision_sala",
                None, f"{sala} - {p.fecha}")
        if estado == "completada":
            ctx.log(fin, "COMPLETAR_REVISION_SALA", oper, "revision_sala", None,
                    f"{sala} - {p.fecha}")
    db.add_all(nuevas)
    db.flush()
    ctx.n["revisiones"] = len(nuevas)
    ctx.n["revision_items"] = sum(len(r.items) for r in nuevas)
    ctx.n["revisiones_abiertas"] = sum(1 for r in nuevas if r.estado == "en_revision")


# ===========================================================================
# Movimientos e historial de stock
# ===========================================================================

def _movimientos_talleres(ctx: Ctx) -> None:
    """Consumo de insumos (preparación) y préstamo/reintegro de implementos."""
    for p, meta in ctx.progs:
        es_hoy = meta.get("hoy")
        inicio = _en(p.fecha, p.hora_inicio) if not es_hoy else None
        if es_hoy:
            d_ini = next(x[2] for x in PROGRAMACIONES_HOY if x[0] == meta["sala"])
            if d_ini >= 0:
                continue
            prep = max(ctx.rel(d_ini - 15), ctx.inicio_hoy)
        else:
            if p.fecha >= ctx.hoy:
                continue
            antes = _rng("prep", p.fecha, p.sala_id, p.hora_inicio).randint(20, 40)
            prep = inicio - timedelta(minutes=antes)
        prep = min(prep, ctx.ahora)
        # Claves sin la hora: hoy las horas dependen del momento de ejecución.
        r = _rng("consumo", p.fecha, meta["sala"], meta["taller"])
        oper = ctx.operador("prep", p.fecha, meta["sala"], meta["taller"])
        sala = meta["sala"]
        paquete = ctx.paquetes.get((meta["taller"], meta["sem"]))
        motivo = f"Preparación taller: {meta['taller']} — semestre {meta['sem']}"
        n = 0
        for insumo, cant in ctx.paquete_items.get((meta["taller"], meta["sem"]), []):
            if ctx.insumos[insumo].tipo == TipoInsumo.implemento:
                if es_hoy:
                    continue     # hoy los implementos ya están en sala
                fin = _en(p.fecha, p.hora_fin, r.randint(8, 20))
                ctx.prestamos.append((insumo, prep, fin, cant, oper, sala, paquete,
                                      motivo))
                n += 1
                continue
            q = cant if cant <= 2 else max(1, round(cant * r.uniform(0.6, 1.0)))
            ctx.mov(prep, insumo, _ST.consumo_taller, q, motivo, oper,
                    sala=sala, paquete=paquete)
            n += 1
        ctx.log(prep + timedelta(seconds=30), "CONFIRMAR_PREPARACION_TALLER", oper,
                "paquete_insumo", None,
                f"{n} retiro(s) — {meta['taller']} {meta['sem']}")


def _movimientos_manuales(ctx: Ctx) -> None:
    """Bajas, ajustes de inventario, devoluciones a proveedor e internos."""
    consumibles = [n for n, i in ctx.insumos.items() if i.tipo == TipoInsumo.insumo]
    # Ajustes por conteo físico: último día hábil de cada mes.
    for mes in range(1, 13):
        ultimo = date(2026, mes, 28)
        while ultimo.month == mes:
            ultimo += timedelta(days=1)
        ultimo = _habil_anterior(ultimo)
        cuando = datetime(ultimo.year, ultimo.month, ultimo.day, 17, 30, tzinfo=ZONA)
        if cuando + timedelta(minutes=5) > ctx.ahora:
            break
        r = _rng("ajuste", mes)
        for k, insumo in enumerate(r.sample(consumibles, 4)):
            q = r.randint(1, 3)
            if r.random() < 0.7:
                ctx.mov(cuando + timedelta(minutes=k), insumo, _ST.ajuste_salida, q,
                        "Ajuste por conteo físico mensual: diferencia negativa",
                        ctx.coord, manual=True)
            else:
                ctx.fijas_entrada.append(dict(
                    fecha=cuando + timedelta(minutes=k), insumo=insumo,
                    subtipo=_ST.ajuste_entrada, cantidad=q, usuario=ctx.coord,
                    motivo="Ajuste por conteo físico mensual: diferencia positiva"))
    # Inventario físico de cierre de año (bodega sin clases, 14-23 de diciembre).
    for dia in (date(2026, 12, 16), date(2026, 12, 18), date(2026, 12, 22)):
        cuando = datetime(dia.year, dia.month, dia.day, 11, 0, tzinfo=ZONA)
        if cuando + timedelta(minutes=10) > ctx.ahora:
            break
        r = _rng("cierre", dia)
        for k, insumo in enumerate(r.sample(consumibles, 6)):
            q = r.randint(1, 4)
            if k % 3 == 2:
                ctx.fijas_entrada.append(dict(
                    fecha=cuando + timedelta(minutes=k), insumo=insumo,
                    subtipo=_ST.ajuste_entrada, cantidad=q, usuario=ctx.coord,
                    motivo="Inventario físico de cierre de año: diferencia positiva"))
            else:
                ctx.mov(cuando + timedelta(minutes=k), insumo, _ST.ajuste_salida, q,
                        "Inventario físico de cierre de año: diferencia negativa",
                        ctx.coord, manual=True)
    bajas = [
        ("Adrenalina 1mg/ml ampolla 1ml", date(2026, 3, 31), 2,
         "Baja por vencimiento (lote 2025)"),
        ("Seda 2-0 con aguja triangular", date(2026, 4, 14), 2,
         "Baja por empaque dañado"),
        ("Glucosa 50% ampolla 20ml", date(2026, 6, 30), 3,
         "Baja por vencimiento (lote 2025)"),
        ("Suero glucosado 5% 500ml", date(2026, 9, 30), 4,
         "Baja por vencimiento"),
        ("Povidona yodada 10% 100ml", date(2026, 11, 20), 2,
         "Baja por envase con filtración"),
        ("Placa Petri desechable 90 mm", date(2026, 12, 15), 1,
         "Baja por vencimiento"),
        ("Glucosa 50% ampolla 20ml", date(2026, 12, 21), 2,
         "Baja por vencimiento (revisión de cierre de año)"),
        ("Gasas con clorhexidina CHG", date(2026, 12, 23), 4,
         "Baja por envase abierto en sala"),
    ]
    for insumo, d, q, motivo in bajas:
        cuando = datetime(d.year, d.month, d.day, 16, 45, tzinfo=ZONA)
        if cuando < ctx.ahora:
            ctx.mov(cuando, insumo, _ST.baja, q, motivo,
                    ctx.usuarios[OPERADORES_IDX[1]], manual=True)
    devoluciones = [
        ("Guantes nitrilo sin polvo talla M", date(2026, 4, 14), date(2026, 4, 21), 5,
         "lote con defecto de fabricación"),
        ("Jeringa insulina 1ml", date(2026, 9, 8), date(2026, 9, 15), 40,
         "émbolos defectuosos"),
    ]
    for insumo, d_sal, d_ent, q, causa in devoluciones:
        prov = ctx.provs[next(x[7] for x in INSUMOS if x[0] == insumo)].nombre
        salida = datetime(d_sal.year, d_sal.month, d_sal.day, 11, 20, tzinfo=ZONA)
        entrada = datetime(d_ent.year, d_ent.month, d_ent.day, 12, 10, tzinfo=ZONA)
        if entrada > ctx.ahora:
            continue
        ctx.mov(salida, insumo, _ST.devolucion_proveedor_salida, q,
                f"Devolución a {prov}: {causa}", ctx.coord, manual=True)
        ctx.fijas_entrada.append(dict(
            fecha=entrada,
            insumo=insumo, subtipo=_ST.devolucion_proveedor_entrada, cantidad=q,
            usuario=ctx.coord, motivo=f"Reposición de {prov} por {causa}"))
    internos = [
        ("Esfigmomanómetro aneroide", date(2026, 7, 14), _ST.enviado_mantenimiento, 2,
         "Enviado a calibración (Equipos Médicos del Sur SpA)"),
        ("Esfigmomanómetro aneroide", date(2026, 7, 28), _ST.reingreso_disponible, 2,
         "Reingreso tras calibración"),
        ("Termómetro digital axilar", date(2026, 7, 6), _ST.devolucion_interna, 2,
         "Devolución desde Sala 013 a Bodega al cierre del semestre"),
        ("Oxímetro de pulso digital", date(2026, 10, 5), _ST.enviado_mantenimiento, 1,
         "Enviado a revisión técnica por lecturas erráticas"),
        ("Oxímetro de pulso digital", date(2026, 10, 19), _ST.reingreso_disponible, 1,
         "Reingreso tras revisión técnica"),
        ("Cinta métrica flexible", date(2026, 12, 14), _ST.devolucion_interna, 2,
         "Devolución desde Sala 013 a Bodega al cierre del año"),
        ("Gradilla para tubos", date(2026, 12, 16), _ST.devolucion_interna, 3,
         "Devolución desde Sala 017 a Bodega al cierre del año"),
        ("Termómetro digital axilar", date(2026, 12, 17), _ST.enviado_mantenimiento, 2,
         "Enviado a calibración anual (Equipos Médicos del Sur SpA)"),
    ]
    for insumo, d, subtipo, q, motivo in internos:
        cuando = datetime(d.year, d.month, d.day, 10, 40, tzinfo=ZONA)
        if cuando < ctx.ahora:
            ctx.mov(cuando, insumo, subtipo, q, motivo,
                    ctx.usuarios[OPERADORES_IDX[0]], manual=True)


def _slots_compra(ctx: Ctx) -> dict:
    """Cierres de órdenes por proveedor: (fecha_cierre, tipo, solo_forzadas)."""
    slots = defaultdict(list)
    d = INICIO_ANIO
    while d <= FIN_ANIO:
        if d.weekday() == 3:     # jueves
            cierre = d if _es_habil(d) else _habil_anterior(d)
            semestral = cierre in FECHAS_SEMESTRALES
            slots[MS].append((datetime(cierre.year, cierre.month, cierre.day, 15, 30,
                                       tzinfo=ZONA),
                              TipoOrden.semestral if semestral else TipoOrden.semanal,
                              False))
        d += timedelta(days=1)
    for prov, fechas in SLOTS_PROVEEDOR.items():
        for f in fechas:
            slots[prov].append((datetime(f.year, f.month, f.day, 15, 0, tzinfo=ZONA),
                                TipoOrden.semestral if f in FECHAS_SEMESTRALES
                                else TipoOrden.semanal, False))
    for cierre, prov, _, _ in EMERGENCIAS:
        slots[prov].append((cierre, TipoOrden.emergencia, True))
    for prov in slots:
        slots[prov] = sorted(s for s in slots[prov] if s[0] < ctx.ahora)
    return slots


def _reconstruir_consumibles(ctx: Ctx, slots: dict) -> tuple:
    """Ubica las compras recorriendo el historial hacia atrás desde el stock final.

    Partiendo del stock objetivo de hoy, cada salida hacia atrás suma stock y
    cada compra lo resta; las compras se colocan en cierres de órdenes reales
    del proveedor cuando el stock reconstruido supera un umbral. Lo que queda
    al inicio es el inventario inicial. Así el stock final cuadra exacto y el
    saldo nunca es negativo.
    """
    compras = defaultdict(list)     # (prov, fecha_cierre, tipo) -> [(insumo, q)]
    iniciales = {}
    forzadas = {}
    medsupply = slots[MS]
    for insumo, desde_fin in REPOSICIONES_RECIENTES:
        normales = [s for s in medsupply if not s[2]]
        if len(normales) >= desde_fin:
            forzadas[(insumo, normales[-desde_fin][0])] = "reciente"
    for cierre, prov, _, items in EMERGENCIAS:
        for insumo, q in items:
            forzadas[(insumo, cierre)] = q
    salidas = defaultdict(list)
    for m in ctx.movs:
        if m["tipo"] == TipoMovimiento.salida:
            salidas[m["insumo"]].append((m["fecha"], -m["cantidad"], None))
    for e in ctx.fijas_entrada:
        salidas[e["insumo"]].append((e["fecha"], e["cantidad"], e))
    for (nombre, _, stock, minimo, _, tipo, _, prov) in INSUMOS:
        if tipo != IN:
            continue
        r = _rng("compras", nombre)
        eventos = sorted(salidas[nombre], key=lambda x: x[0])
        sl = slots[prov]
        s = stock
        i, j = len(eventos) - 1, len(sl) - 1
        alto = minimo * 2 + r.randint(1, max(2, minimo))
        while i >= 0 or j >= 0:
            if j >= 0 and (i < 0 or sl[j][0] >= eventos[i][0]):
                cierre, tipo_o, solo_forz = sl[j]
                j -= 1
                forz = forzadas.get((nombre, cierre))
                q = 0
                if forz == "reciente":
                    piso = r.randint(max(0, minimo // 3), max(0, minimo - 1))
                    q = s - piso
                elif forz:
                    q = min(forz, s)
                elif solo_forz:
                    continue
                elif prov == MS and s > alto:
                    q = s - r.randint(max(1, minimo // 2), minimo + minimo // 2)
                elif prov != MS and s > minimo:
                    q = s - r.randint(max(1, minimo // 2), minimo)
                if q > 0:
                    compras[(prov, cierre, tipo_o)].append((nombre, q))
                    s -= q
            else:
                _, delta, fija = eventos[i]
                i -= 1
                if delta < 0:
                    s -= delta
                elif delta <= s:
                    s -= delta
                    ctx.mov(fija["fecha"], fija["insumo"], fija["subtipo"],
                            fija["cantidad"], fija["motivo"], fija["usuario"],
                            manual=True)
        iniciales[nombre] = s
    return compras, iniciales


def _simular_implementos(ctx: Ctx) -> tuple:
    """Historial de implementos hacia adelante: compras, bajas y préstamos.

    El stock solo cambia por compras (unidades nuevas) y bajas (unidad dada de
    baja); cada préstamo se reintegra el mismo día, así que al final del día
    las unidades operativas coinciden con el stock.
    """
    compras = defaultdict(list)
    iniciales, finales, bajas_hechas = {}, {}, defaultdict(int)
    for (nombre, _, stock, _, _, tipo, _, _) in INSUMOS:
        if tipo != IM:
            continue
        compras_n = [c for c in IMPL_COMPRAS if c[0] == nombre]
        bajas_n = [b for b in IMPL_BAJAS if b[0] == nombre]
        inicial = stock + sum(b[2] for b in bajas_n) - sum(c[3] for c in compras_n)
        iniciales[nombre] = inicial
        eventos = []
        for _, prov, f, q in compras_n:
            cierre = datetime(f.year, f.month, f.day, 15, 30 if prov == MS else 0,
                              tzinfo=ZONA)
            if cierre < ctx.ahora:
                eventos.append((cierre, q, "compra"))
                compras[(prov, cierre)].append((nombre, q))
        for _, f, q, motivo in bajas_n:
            cuando = datetime(f.year, f.month, f.day, 17, 0, tzinfo=ZONA)
            if cuando < ctx.ahora:
                eventos.append((cuando, -q, motivo))
        for (ins, prep, fin, cant, oper, sala, paq, motivo) in ctx.prestamos:
            if ins == nombre:
                eventos.append((prep, 0, ("prestamo", fin, cant, oper, sala, paq,
                                          motivo)))
        stock_t = inicial
        abiertos = []          # (fin, cantidad)
        for cuando, delta, info in sorted(eventos, key=lambda e: e[0]):
            abiertos = [(f, q) for f, q in abiertos if f > cuando]
            if info == "compra":
                stock_t += delta
            elif isinstance(info, str):
                stock_t += delta
                bajas_hechas[nombre] += -delta
                ctx.mov(cuando, nombre, _ST.baja, -delta, info, ctx.coord, manual=True)
            else:
                _, fin, cant, oper, sala, paq, motivo = info
                disponibles = stock_t - sum(q for _, q in abiertos)
                q = min(cant, disponibles)
                if q <= 0:
                    continue
                abiertos.append((fin, q))
                ctx.mov(cuando, nombre, _ST.prestamo_implemento, q, motivo, oper,
                        sala=sala, paquete=paq)
                ctx.mov(fin, nombre, _ST.ajuste_entrada, q,
                        f"Reintegro desde {sala}", oper, sala=sala, manual=True)
        finales[nombre] = stock_t
    return compras, iniciales, finales, bajas_hechas


def _insertar_ordenes_entrada(ctx: Ctx, compras_cons, compras_impl) -> None:
    print("Insertando órdenes de entrada...")
    db = ctx.db
    nota_emerg = {c: n for c, _, n, _ in EMERGENCIAS}
    todas = defaultdict(list)
    for (prov, cierre, tipo_o), items in compras_cons.items():
        todas[(prov, cierre)].extend(items)
    tipos = {(p, c): t for (p, c, t) in compras_cons}
    for (prov, cierre), items in compras_impl.items():
        todas[(prov, cierre)].extend(items)
        tipos.setdefault((prov, cierre), TipoOrden.semestral
                         if cierre.date() in FECHAS_SEMESTRALES else TipoOrden.semanal)
    lj_cierre = datetime(2026, 7, 23, 15, 0, tzinfo=ZONA)
    if LITTLE_JUNIOR in ctx.activos:
        todas.setdefault((LA, lj_cierre), [])
        tipos.setdefault((LA, lj_cierre), TipoOrden.semestral)

    ordenes = []
    for (prov, cierre) in sorted(todas, key=lambda k: (k[1], k[0])):
        items = todas[(prov, cierre)]
        tipo_o = tipos[(prov, cierre)]
        r = _rng("orden", prov, cierre)
        creado = cierre - timedelta(days=1 if tipo_o == TipoOrden.emergencia else 3,
                                    hours=5)
        autor = ctx.admin if r.random() < 0.1 else ctx.coord
        if tipo_o == TipoOrden.emergencia:
            nota = nota_emerg[cierre]
            actividad = "1137"
        elif tipo_o == TipoOrden.semestral:
            sem = S1 if cierre.month < 6 else S2
            nota = f"Compra semestral de inicio del semestre {sem}"
            actividad = ACTIVIDAD_PROV[prov]
        elif prov == MS:
            nota = ("Reposición semanal de insumos de alta rotación - semana "
                    f"{cierre.isocalendar()[1]}")
            actividad = "1010"
        else:
            nota = f"Reposición de material - {ctx.provs[prov].nombre}"
            actividad = ACTIVIDAD_PROV[prov]
        o = OrdenEntrada(
            proveedor_id=ctx.provs[prov].id, tipo=tipo_o,
            estado=EstadoOrdenEntrada.cerrada, actividad_duoc=actividad, notas=nota,
            creado_por_id=autor.id, cerrado_por_id=ctx.coord.id,
            created_at=creado, fecha_cierre=cierre,
        )
        for nombre, q in items:
            parcial = r.random() < 0.12
            o.items.append(OrdenEntradaItem(
                tipo_item=TipoItemOrden.insumo, insumo_id=ctx.insumos[nombre].id,
                cantidad_pedida=q + (max(1, round(q * 0.2)) if parcial else 0),
                cantidad_recibida=q,
                costo_unitario=ctx.insumos[nombre].costo_unitario,
                estado=(EstadoItemOrden.recibido_parcial if parcial
                        else EstadoItemOrden.recibido),
                notas_item="Saldo pendiente del proveedor" if parcial else None,
            ))
        if prov == LA and cierre == lj_cierre and LITTLE_JUNIOR in ctx.activos:
            o.items.append(OrdenEntradaItem(
                tipo_item=TipoItemOrden.activo_fijo,
                activo_fijo_id=ctx.activos[LITTLE_JUNIOR].id,
                cantidad_pedida=1, cantidad_recibida=1, costo_unitario=690000,
                estado=EstadoItemOrden.recibido,
                notas_item="Reemplazo del Fantoma RCP pediátrico dado de baja",
            ))
        if r.random() < 0.08:
            otros = [x[0] for x in INSUMOS
                     if x[7] == prov and x[5] == IN and x[0] not in dict(items)]
            if otros:
                o.items.append(OrdenEntradaItem(
                    tipo_item=TipoItemOrden.insumo,
                    insumo_id=ctx.insumos[r.choice(otros)].id,
                    cantidad_pedida=r.randint(5, 20), cantidad_recibida=0,
                    estado=EstadoItemOrden.cancelado,
                    notas_item="Proveedor sin stock",
                ))
        ordenes.append((o, autor, items))

    # Órdenes canceladas.
    for creado, prov, tipo_o, actividad, nota, items in CANCELADAS:
        if creado > ctx.ahora:
            continue
        o = OrdenEntrada(
            proveedor_id=ctx.provs[prov].id, tipo=tipo_o,
            estado=EstadoOrdenEntrada.cancelada, actividad_duoc=actividad,
            notas=nota, creado_por_id=ctx.coord.id, created_at=creado,
        )
        for nombre, q in items:
            o.items.append(OrdenEntradaItem(
                tipo_item=TipoItemOrden.insumo, insumo_id=ctx.insumos[nombre].id,
                cantidad_pedida=q, costo_unitario=ctx.insumos[nombre].costo_unitario,
                estado=EstadoItemOrden.pendiente,
            ))
        ordenes.append((o, ctx.coord, None))

    # Orden en recepción (recepción parcial, aún sin impacto en stock).
    d_rec = _habil_anterior(_habil_anterior(ctx.hoy))
    o = OrdenEntrada(
        proveedor_id=ctx.provs[MS].id, tipo=TipoOrden.semanal,
        estado=EstadoOrdenEntrada.en_recepcion, actividad_duoc="1010",
        notas="Recepción parcial: faltan mascarillas N95 (proveedor confirma despacho)",
        creado_por_id=ctx.coord.id,
        created_at=datetime(d_rec.year, d_rec.month, d_rec.day, 10, 15, tzinfo=ZONA),
    )
    for nombre, pedida, recibida, est in (
        ("Mascarillas quirúrgicas", 20, 12, EstadoItemOrden.recibido_parcial),
        ("Gorro quirúrgico", 10, 10, EstadoItemOrden.recibido),
        ("Mascarillas N95 FFP2", 50, None, EstadoItemOrden.pendiente),
    ):
        o.items.append(OrdenEntradaItem(
            tipo_item=TipoItemOrden.insumo, insumo_id=ctx.insumos[nombre].id,
            cantidad_pedida=pedida, cantidad_recibida=recibida,
            costo_unitario=ctx.insumos[nombre].costo_unitario, estado=est,
        ))
    ordenes.append((o, ctx.coord, None))

    # Guion: Laerdal confirmada (AMBU) y sueros de emergencia en borrador.
    d_conf = ctx.hoy - timedelta(days=6)
    o = OrdenEntrada(
        proveedor_id=ctx.provs[LA].id, tipo=TipoOrden.semestral,
        estado=EstadoOrdenEntrada.confirmada, actividad_duoc="1060",
        notas="Repuestos y accesorios anuales para phantomas Laerdal",
        creado_por_id=ctx.coord.id,
        created_at=datetime(d_conf.year, d_conf.month, d_conf.day, 11, 0, tzinfo=ZONA),
    )
    for nombre, q, costo in (("Resucitador AMBU con mascarilla", 2, 110000),
                             ("Bolsa autoinflable AMBU adulto", 2, 95000)):
        o.items.append(OrdenEntradaItem(
            tipo_item=TipoItemOrden.insumo, insumo_id=ctx.insumos[nombre].id,
            cantidad_pedida=q, costo_unitario=costo, estado=EstadoItemOrden.pendiente,
        ))
    ordenes.append((o, ctx.coord, None))
    d_bor = _habil_anterior(ctx.hoy)
    o = OrdenEntrada(
        proveedor_id=ctx.provs[MS].id, tipo=TipoOrden.emergencia,
        estado=EstadoOrdenEntrada.borrador, actividad_duoc="1137",
        notas="Reposición urgente de sueros - stock crítico",
        creado_por_id=ctx.coord.id,
        created_at=datetime(d_bor.year, d_bor.month, d_bor.day, 16, 40, tzinfo=ZONA),
    )
    for nombre, q, costo in ((SUERO_GUION, 20, 3500),
                             ("Suero fisiológico 0.9% 250ml", 30, 1800),
                             ("Solución Ringer Lactato 1L", 15, 3200)):
        o.items.append(OrdenEntradaItem(
            tipo_item=TipoItemOrden.insumo, insumo_id=ctx.insumos[nombre].id,
            cantidad_pedida=q, costo_unitario=costo, estado=EstadoItemOrden.pendiente,
        ))
    ordenes.append((o, ctx.coord, None))

    db.add_all([o for o, _, _ in ordenes])
    db.flush()
    for o, autor, items in ordenes:
        prov_nombre = next(p.nombre for p in ctx.provs.values() if p.id == o.proveedor_id)
        ctx.log(o.created_at, "CREAR_ORDEN_ENTRADA", autor, "orden_entrada", o.id,
                f"Tipo {o.tipo.value} - {len(o.items)} ítems")
        if o.estado != EstadoOrdenEntrada.borrador:
            ctx.log(o.created_at + timedelta(minutes=35), "CONFIRMAR_ORDEN_ENTRADA",
                    ctx.coord, "orden_entrada", o.id, f"Proveedor: {prov_nombre}")
        if o.estado == EstadoOrdenEntrada.cancelada:
            ctx.log(o.created_at + timedelta(days=1, hours=2), "CANCELAR_ORDEN_ENTRADA",
                    ctx.coord, "orden_entrada", o.id, "Orden cancelada")
        if o.estado == EstadoOrdenEntrada.cerrada:
            for nombre, q in items:
                ctx.mov(o.fecha_cierre, nombre, _ST.compra, q,
                        f"Orden entrada #{o.id} - {prov_nombre}", ctx.coord)
            n_items = sum(1 for it in o.items
                          if it.estado != EstadoItemOrden.cancelado)
            ctx.log(o.fecha_cierre + timedelta(seconds=20), "CERRAR_ORDEN_ENTRADA",
                    ctx.coord, "orden_entrada", o.id,
                    f"{n_items} ítems procesados - {prov_nombre}")
        ctx.n[f"oe_{o.estado.value}"] += 1
    ctx.n["ordenes_entrada"] = len(ordenes)


def _insertar_inventario_inicial(ctx: Ctx, iniciales: dict) -> None:
    cuando = datetime(2026, 1, 5, 9, 15, tzinfo=ZONA)
    for k, (nombre, q) in enumerate(iniciales.items()):
        if q > 0:
            ctx.mov(cuando + timedelta(seconds=k), nombre, _ST.ajuste_entrada, q,
                    "Inventario inicial 2026 (conteo físico de cierre 2025)", ctx.coord)


def _insertar_movimientos(ctx: Ctx) -> None:
    print("Insertando movimientos...")
    db = ctx.db
    filas = []
    for m in sorted(ctx.movs, key=lambda x: (x["fecha"], x["insumo"])):
        if m["fecha"] > ctx.ahora:
            raise RuntimeError(f"Movimiento futuro: {m['insumo']} {m['fecha']}")
        filas.append(Movimiento(
            tipo=m["tipo"], subtipo=m["subtipo"], cantidad=m["cantidad"],
            motivo=m["motivo"], fecha=m["fecha"],
            insumo_id=ctx.insumos[m["insumo"]].id, usuario_id=m["usuario"].id,
            paquete_id=m["paquete"].id if m["paquete"] else None,
            sala_id=ctx.salas[m["sala"]].id if m["sala"] else None,
        ))
    db.add_all(filas)
    db.flush()
    ctx.n["movimientos"] = len(filas)
    ctx.n["subtipos"] = len({m["subtipo"] for m in ctx.movs})


def _insertar_unidades(ctx: Ctx, finales: dict, bajas_hechas: dict) -> None:
    print("Insertando unidades físicas de implementos...")
    db = ctx.db
    unidades = []
    en_uso_hoy = {}
    if "Sala 011" in ctx.progs_hoy:
        for insumo, cant in ctx.paquete_items.get(
                ("Taller de venopunción", ctx.progs_hoy["Sala 011"].semestre), []):
            if ctx.insumos[insumo].tipo == TipoInsumo.implemento:
                en_uso_hoy[insumo] = cant
    for nombre, operativas in finales.items():
        ins = ctx.insumos[nombre]
        salas = IMPL_SALAS.get(nombre, [])
        n_uso = en_uso_hoy.get(nombre, 0)
        for k in range(operativas):
            if k < n_uso:
                sala, estado = ctx.salas["Sala 011"].id, EstadoUnidad.en_uso
            elif k - n_uso < len(salas):
                sala, estado = ctx.salas[salas[k - n_uso]].id, EstadoUnidad.disponible
            else:
                sala, estado = None, EstadoUnidad.disponible
            unidades.append((ins, UnidadImplemento(
                implemento_id=ins.id, sala_id=sala, estado=estado)))
        for _ in range(bajas_hechas.get(nombre, 0)):
            unidades.append((ins, UnidadImplemento(
                implemento_id=ins.id, sala_id=None, estado=EstadoUnidad.dado_de_baja,
                notas="Dada de baja (ver movimiento de baja)")))
    db.add_all([u for _, u in unidades])
    db.flush()
    for ins, u in unidades:
        u.codigo = f"{_prefijo_codigo(ins.nombre)}-{u.id:05d}"
    ctx.n["unidades"] = len(unidades)
    ctx.n["unidades_baja"] = sum(bajas_hechas.values())


# ===========================================================================
# Auditoría
# ===========================================================================

def _insertar_auditoria(ctx: Ctx) -> None:
    print("Insertando registros de auditoría...")
    db = ctx.db
    eventos = list(ctx.audit)
    # Un login antes de la primera acción de cada usuario en cada día.
    primera = {}
    for fecha, _, usuario, *_ in eventos:
        if usuario is None:
            continue
        clave = (usuario.id, fecha.date())
        if clave not in primera or fecha < primera[clave][0]:
            primera[clave] = (fecha, usuario)
    for m in ctx.movs:
        clave = (m["usuario"].id, m["fecha"].date())
        if clave not in primera or m["fecha"] < primera[clave][0]:
            primera[clave] = (m["fecha"], m["usuario"])
    # Visores y admin: consultas dos veces por semana.
    for d in _dias_habiles(INICIO_ANIO, ctx.hoy):
        for idx in (0, 4, 5):
            u = ctx.usuarios[idx]
            if _rng("visita", idx, d).random() < (0.25 if idx == 0 else 0.4):
                cuando = datetime(d.year, d.month, d.day, 9 + idx % 3, 15 + idx,
                                  tzinfo=ZONA)
                clave = (u.id, d)
                if cuando <= ctx.ahora and clave not in primera:
                    primera[clave] = (cuando + timedelta(minutes=10), u)
    for (uid, d), (fecha, u) in primera.items():
        r = _rng("login", uid, d)
        login = fecha - timedelta(minutes=r.randint(3, 25))
        if login.date() != d:
            login = fecha - timedelta(seconds=30)
        eventos.append((login, "LOGIN_EXITOSO", u, None, None, None))
        if login.hour < 7:
            eventos.append((login + timedelta(seconds=1), "ALERTA_ACCESO_FUERA_HORARIO",
                            u, None, None,
                            f"Login a las {login.hour:02d}h (hora Santiago) "
                            "(horario configurado: 7h-23h)"))
    # Intentos fallidos esporádicos.
    fallidos = [
        (date(2026, 3, 16), 3), (date(2026, 4, 28), 5), (date(2026, 6, 8), 2),
        (date(2026, 8, 18), 4), (date(2026, 10, 6), 3), (date(2026, 11, 24), 5),
    ]
    for d, idx in fallidos:
        cuando = datetime(d.year, d.month, d.day, 8, 2, tzinfo=ZONA)
        if cuando > ctx.ahora:
            continue
        email = ctx.usuarios[idx].email
        eventos.append((cuando, "LOGIN_FALLIDO", None, None, None, email))
        if d.month == 8:
            eventos.append((cuando + timedelta(seconds=40), "LOGIN_FALLIDO", None,
                            None, None, email))
            eventos.append((cuando + timedelta(seconds=41), "ALERTA_INTENTOS_FALLIDOS",
                            None, None, None, f"3 intento(s) restante(s) — {email}"))
    madrugada = datetime(2026, 5, 4, 6, 40, tzinfo=ZONA)
    if madrugada <= ctx.ahora:
        u = ctx.usuarios[OPERADORES_IDX[1]]
        eventos.append((madrugada, "LOGIN_EXITOSO", u, None, None, None))
        eventos.append((madrugada + timedelta(seconds=1),
                        "ALERTA_ACCESO_FUERA_HORARIO", u, None, None,
                        "Login a las 06h (hora Santiago) (horario configurado: 7h-23h)"))
    filas = []
    for fecha, accion, u, entidad, entidad_id, detalle in sorted(
            eventos, key=lambda e: (e[0], e[1])):
        if fecha > ctx.ahora:
            continue
        filas.append(AuditLog(
            fecha=fecha, accion=accion, entidad=entidad, entidad_id=entidad_id,
            detalle=detalle, usuario_id=u.id if u else None,
            usuario_nombre=u.nombre if u else "sistema",
            ip=IP_USUARIO[ctx.usuarios.index(u)] if u else "192.168.1.77",
        ))
    db.add_all(filas)
    db.flush()
    ctx.n["auditoria"] = len(filas)


# ===========================================================================
# Autoverificación
# ===========================================================================

def _verificar(ctx: Ctx) -> list[str]:
    """Revisa las garantías del seed. Devuelve la lista de errores."""
    db = ctx.db
    errores = []
    ahora = ctx.ahora

    # 1. Stock = entradas - salidas, sin saldo negativo en ningún momento.
    saldo = defaultdict(int)
    minimo = defaultdict(int)
    for m in db.query(Movimiento).order_by(Movimiento.fecha, Movimiento.id):
        if m.tipo == TipoMovimiento.entrada:
            saldo[m.insumo_id] += m.cantidad
        elif m.tipo == TipoMovimiento.salida:
            saldo[m.insumo_id] -= m.cantidad
            minimo[m.insumo_id] = min(minimo[m.insumo_id], saldo[m.insumo_id])
    for ins in ctx.insumos.values():
        if saldo[ins.id] != ins.stock_actual:
            errores.append(f"Stock descuadrado: {ins.nombre} "
                           f"({ins.stock_actual} vs {saldo[ins.id]})")
        if ins.stock_actual < 0 or minimo[ins.id] < 0:
            errores.append(f"Stock negativo: {ins.nombre}")

    # 2. Implementos: unidades operativas = stock.
    for ins in ctx.insumos.values():
        if ins.tipo != TipoInsumo.implemento:
            continue
        operativas = db.query(UnidadImplemento).filter(
            UnidadImplemento.implemento_id == ins.id,
            UnidadImplemento.estado != EstadoUnidad.dado_de_baja,
        ).count()
        if operativas != ins.stock_actual:
            errores.append(f"Unidades != stock: {ins.nombre} "
                           f"({operativas} vs {ins.stock_actual})")

    # 2b. Movimientos de los 11 subtipos (todos ocurren antes del 29 de julio).
    subtipos = {m.subtipo for m in db.query(Movimiento.subtipo).distinct()}
    if ctx.hoy > date(2026, 7, 28) and len(subtipos) != len(SubtipoMovimiento):
        faltan = sorted(st.value for st in set(SubtipoMovimiento) - subtipos)
        errores.append(f"Faltan subtipos de movimiento: {', '.join(faltan)}")

    # 3. Sin fechas futuras (salvo programaciones y retornos estimados).
    chequeos = [
        ("movimientos", db.query(Movimiento).filter(Movimiento.fecha > ahora)),
        ("órdenes de entrada (creación)",
         db.query(OrdenEntrada).filter(OrdenEntrada.created_at > ahora)),
        ("órdenes de entrada (cierre)",
         db.query(OrdenEntrada).filter(OrdenEntrada.fecha_cierre > ahora)),
        ("órdenes de mantenimiento", db.query(OrdenMantenimiento).filter(
            OrdenMantenimiento.fecha_visita > ctx.hoy)),
        ("ítems de mantenimiento", db.query(OrdenMantenimientoItem).filter(
            (OrdenMantenimientoItem.fecha_envio > ctx.hoy)
            | (OrdenMantenimientoItem.fecha_retorno > ctx.hoy))),
        ("revisiones", db.query(RevisionSala).filter(
            (RevisionSala.fecha > ctx.hoy) | (RevisionSala.creado_en > ahora))),
        ("incidencias", db.query(Incidencia).filter(Incidencia.fecha_hora > ahora)),
        ("auditoría", db.query(AuditLog).filter(AuditLog.fecha > ahora)),
        ("paquetes", db.query(PaqueteInsumo).filter(
            PaqueteInsumo.fecha_creacion > ahora)),
        ("comentarios", db.query(ComentarioDocente).filter(
            ComentarioDocente.created_at > ahora)),
        ("docentes", db.query(Docente).filter(Docente.created_at > ahora)),
    ]
    for nombre, q in chequeos:
        if q.count():
            errores.append(f"Fechas futuras en {nombre}: {q.count()}")
    hoy_hhmm = _hhmm(ahora)
    for rev in db.query(RevisionSala).filter(RevisionSala.fecha == ctx.hoy):
        for h in (rev.hora_inicio_rev, rev.hora_fin_rev):
            if h and h > hoy_hhmm:
                errores.append(f"Revisión de hoy con hora futura: {h}")

    # 4. Programaciones de hoy con su semestre y el estado esperado en el mapa.
    sem_hoy = _semestre_de(ctx.hoy)
    revs = {r.programacion_id: r.estado for r in db.query(RevisionSala).filter(
        RevisionSala.fecha == ctx.hoy)}
    for sala, esperado in ESTADO_ESPERADO_HOY.items():
        p = db.query(ProgramacionTaller).filter(
            ProgramacionTaller.fecha == ctx.hoy,
            ProgramacionTaller.sala_id == ctx.salas[sala].id,
        ).all()
        if len(p) != 1:
            errores.append(f"Hoy: {sala} tiene {len(p)} programaciones (esperado 1)")
            continue
        p = p[0]
        if p.semestre != sem_hoy:
            errores.append(f"Hoy: {sala} con semestre {p.semestre} (esperado {sem_hoy})")
        estado = _estado_vista(p, revs.get(p.id), hoy_hhmm)
        if estado != esperado:
            errores.append(f"Hoy: {sala} queda '{estado}' (esperado '{esperado}')")
        if not ctx.paquete_items.get((
                next(t for t, x in ctx.talleres.items() if x.id == p.taller_id),
                p.semestre)):
            errores.append(f"Hoy: {sala} sin paquete {p.semestre} para el checklist")

    # 5-6. Guion de órdenes de entrada.
    suero = ctx.insumos[SUERO_GUION]
    if suero.stock_actual != 2:
        errores.append(f"{SUERO_GUION}: stock {suero.stock_actual} (esperado 2)")
    borrador = db.query(OrdenEntrada).filter(
        OrdenEntrada.estado == EstadoOrdenEntrada.borrador).all()
    ok_borrador = any(
        o.creado_por_id == ctx.coord.id
        and {(it.insumo_id, it.cantidad_pedida) for it in o.items}
        == {(suero.id, 20),
            (ctx.insumos["Suero fisiológico 0.9% 250ml"].id, 30),
            (ctx.insumos["Solución Ringer Lactato 1L"].id, 15)}
        for o in borrador
    )
    if not ok_borrador:
        errores.append("Falta la orden de sueros en borrador (20/30/15)")
    laerdal = db.query(OrdenEntrada).filter(
        OrdenEntrada.estado == EstadoOrdenEntrada.confirmada,
        OrdenEntrada.proveedor_id == ctx.provs[LA].id,
        OrdenEntrada.creado_por_id == ctx.coord.id,
    ).count()
    if laerdal != 1:
        errores.append("Falta la orden Laerdal confirmada de Patricia Soto")
    en_curso = db.query(OrdenMantenimiento).filter(
        OrdenMantenimiento.estado == EstadoOrdenMant.en_curso,
        OrdenMantenimiento.proveedor_id == ctx.provs[LA].id,
        OrdenMantenimiento.fecha_visita == ctx.hoy - timedelta(days=12),
    ).count()
    if en_curso != 1:
        errores.append("Falta la orden de mantenimiento Laerdal en curso del guion")

    # 7. Seis cuentas con 2FA y sus secretos de demo.
    usuarios = db.query(Usuario).all()
    if len(usuarios) != 6:
        errores.append(f"Hay {len(usuarios)} usuarios (esperado 6)")
    for u in usuarios:
        codigos = json.loads(u.recovery_codes or "[]")
        if (not u.totp_habilitado or u.totp_secret != TOTP_DEMO.get(u.email)
                or len(codigos) != 10):
            errores.append(f"2FA de demo incompleto: {u.email}")

    # 8. Calendario: sin choques, días hábiles cubiertos, clases pasadas revisadas.
    piso1 = {ctx.salas[s].id for s in SALAS_PISO1}
    por_sala_dia = defaultdict(list)
    dias_piso1 = set()
    sin_revision = 0
    con_rev = {r.programacion_id for r in db.query(RevisionSala.programacion_id)}
    for p in db.query(ProgramacionTaller):
        por_sala_dia[(p.sala_id, p.fecha)].append((p.hora_inicio, p.hora_fin))
        if p.sala_id in piso1:
            dias_piso1.add(p.fecha)
        if p.fecha < ctx.hoy and p.id not in con_rev:
            sin_revision += 1
    for (sala_id, fecha), horas in por_sala_dia.items():
        horas.sort()
        for (_, fin_a), (ini_b, _) in zip(horas, horas[1:]):
            if ini_b < fin_a:
                errores.append(f"Choque de sala {sala_id} el {fecha}")
    for inicio, fin in SEMESTRES.values():
        for d in _dias_habiles(inicio, fin):
            if d not in dias_piso1:
                errores.append(f"Día hábil sin clases en el piso -1: {d}")
    if sin_revision:
        errores.append(f"{sin_revision} clases pasadas sin revisión de sala")

    # 9. Las 5 carreras con asignaturas, secciones, talleres, paquetes y
    #    programaciones en ambos semestres.
    carrera_de = {a[1]: a[2] for a in ASIGNATURAS}
    taller_carrera = {t[0]: carrera_de[t[2]] for t in TALLERES_DATA}
    for carrera in CARRERAS:
        for sem in SEMESTRES:
            secs = sum(1 for x in ctx.secciones
                       if x["carrera"] == carrera and x["sem"] == sem)
            paqs = sum(1 for (t, s_) in ctx.paquetes
                       if s_ == sem and taller_carrera[t] == carrera)
            progs = sum(1 for _, m in ctx.progs
                        if m["sem"] == sem and taller_carrera[m["taller"]] == carrera)
            if not (secs and paqs and progs):
                errores.append(f"{carrera.value} {sem}: {secs} secciones, "
                               f"{paqs} paquetes, {progs} programaciones")
    return errores


# ===========================================================================
# Punto de entrada
# ===========================================================================

def cargar(db, ahora: datetime) -> Ctx:
    ctx = Ctx(db, ahora)
    _limpiar(db)
    _insertar_catalogos(ctx)
    _insertar_docentes(ctx)
    _insertar_insumos(ctx)
    _insertar_talleres_paquetes(ctx)
    _insertar_activos(ctx)
    _planificar_secciones(ctx)
    _insertar_programaciones(ctx)
    _insertar_mantenimiento(ctx)
    _insertar_incidencias(ctx)
    _insertar_revisiones(ctx)
    print("Generando historial de movimientos...")
    _movimientos_talleres(ctx)
    _movimientos_manuales(ctx)
    slots = _slots_compra(ctx)
    compras_cons, iniciales = _reconstruir_consumibles(ctx, slots)
    compras_impl, iniciales_impl, finales, bajas = _simular_implementos(ctx)
    iniciales.update(iniciales_impl)
    _insertar_ordenes_entrada(ctx, compras_cons, compras_impl)
    _insertar_inventario_inicial(ctx, iniciales)
    for nombre, _, stock, *_ in INSUMOS:
        ins = ctx.insumos[nombre]
        ins.stock_actual = (stock if ins.tipo == TipoInsumo.insumo
                            else finales[nombre])
    _insertar_movimientos(ctx)
    _insertar_unidades(ctx, finales, bajas)
    _insertar_auditoria(ctx)
    db.flush()
    return ctx


def _resumen(ctx: Ctx, segundos: float) -> None:
    n = ctx.n
    insumos = list(ctx.insumos.values())
    implementos = [i for i in insumos if i.tipo == TipoInsumo.implemento]
    bajo = sum(1 for i in insumos if i.stock_actual <= i.stock_minimo)
    agotados = sum(1 for i in insumos if i.stock_actual == 0)
    estados_af = defaultdict(int)
    for af in ctx.activos.values():
        estados_af[af.estado.value] += 1
    n_paq = {s: sum(1 for (_, sem) in ctx.paquetes if sem == s) for s in SEMESTRES}
    n_sec = {s: sum(1 for x in ctx.secciones if x["sem"] == s) for s in SEMESTRES}
    pasadas = sum(1 for p, _ in ctx.progs if p.fecha < ctx.hoy)
    print("\n" + "=" * 60)
    print("Demo cargada exitosamente.")
    print(f"  Fecha de carga:      {ctx.ahora:%d/%m/%Y %H:%M} (hora de Santiago)")
    print(f"  Salas:               {len(ctx.salas)}")
    print(f"  Categorías:          {len(ctx.cats)}")
    print(f"  Usuarios:            {len(ctx.usuarios)} (todos con 2FA)")
    print(f"  Proveedores:         {len(ctx.provs)}")
    print(f"  Docentes:            {len(ctx.docentes)} "
          f"({n['comentarios']} comentarios de coordinación)")
    print(f"  Asignaturas:         {len(ctx.asigs)} de {len(CARRERAS)} carreras "
          f"({', '.join(ETIQUETA_CARRERA.get(c, c.value) for c in CARRERAS)})")
    print(f"  Secciones:           {n_sec[S1]} en 2026-1, {n_sec[S2]} en 2026-2")
    print(f"  Insumos e impl.:     {len(insumos)} ({bajo} bajo mínimo, "
          f"{agotados} agotados) - todos en Bodega")
    print(f"  Implementos:         {len(implementos)} con {n['unidades']} unidades "
          f"físicas ({n['unidades_baja']} dadas de baja)")
    print(f"  Activos fijos:       {len(ctx.activos)} "
          f"({', '.join(f'{k}: {v}' for k, v in sorted(estados_af.items()))})")
    print(f"  Talleres:            {len(ctx.talleres)}")
    print(f"  Paquetes:            {n_paq[S1]} en 2026-1, {n_paq[S2]} en 2026-2")
    print(f"  Programaciones:      {n['programaciones']} ({pasadas} pasadas, "
          f"{len(ctx.progs_hoy)} hoy)")
    print(f"  Programaciones hoy:  {len(ctx.progs_hoy)} (Vista de Salas en vivo)")
    print(f"  Revisiones sala:     {n['revisiones']} ({n['revisiones_abiertas']} "
          f"en revisión), {n['revision_items']} ítems")
    print(f"  Incidencias:         {n['incidencias']}")
    print(f"  Órdenes mant.:       {n['mantenimiento']} (en_curso: {n['mant_en_curso']}, "
          f"cerrada: {n['mant_cerrada']}, cancelada: {n['mant_cancelada']})")
    estados_oe = ", ".join(
        f"{e.value}: {n['oe_' + e.value]}" for e in EstadoOrdenEntrada)
    print(f"  Órdenes entrada:     {n['ordenes_entrada']} ({estados_oe})")
    print(f"  Movimientos:         {n['movimientos']} ({n['subtipos']} subtipos)")
    print(f"  Auditoría:           {n['auditoria']} registros")
    print("  Autoverificación:    OK")
    print(f"  Tiempo de carga:     {segundos:.1f} s")
    print("\nCredenciales (2FA ya configurado, secretos en docs/DEMO.md):")
    for _, email, pwd, rol_usuario in USUARIOS:
        print(f"  {email:38} | {pwd:12} | {rol_usuario.value}")
    print()


def main():
    db = SessionLocal()
    try:
        print("\nHestia - Cargador de datos de demo")
        print("=" * 40)
        if input(
            "Esto eliminará TODOS los datos existentes. ¿Continuar? (s/N): "
        ).strip().lower() != "s":
            print("Cancelado.")
            return
        t0 = time_mod.monotonic()
        ctx = cargar(db, _ahora())
        print("Verificando garantías de la demo...")
        errores = _verificar(ctx)
        if errores:
            db.rollback()
            print("\nERROR: la autoverificación falló; no se guardó ningún cambio.")
            for e in errores[:40]:
                print(f"  - {e}")
            if len(errores) > 40:
                print(f"  ... y {len(errores) - 40} más")
            sys.exit(1)
        db.commit()
        _resumen(ctx, time_mod.monotonic() - t0)
    except Exception as e:
        db.rollback()
        print(f"\nError: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
