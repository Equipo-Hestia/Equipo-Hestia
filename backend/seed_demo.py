#!/usr/bin/env python3
"""
Script de datos de demo para Hestia - Escuela de Salud DuocUC.

Uso:
    docker compose exec api python seed_demo.py

Genera:
    - 18 salas clinicas (numeracion real piso -1 + odontologia), 10 categorias
    - 5 usuarios (admin, 2 operadores, 2 visores) — sin rol docente
    - 20 asignaturas representativas de las 5 carreras (mallas 2024-2025)
    - 88 insumos (insumo/implemento) con costos reales
    - ~560 movimientos en los ultimos 60 dias
    - 18 solicitudes en distintos estados
    - Unidades fisicas para todos los implementos
    - 6 activos fijos: 3 muebles clinicos + 3 phantomas de simulacion
    - 5 retornos de implemento en distintos estados

Credenciales:
    admin@hestia.duoc.cl          / Admin2024!
    mgonzalez@hestia.duoc.cl      / Oper2024!
    cfuentes@hestia.duoc.cl       / Oper2024!
    amartinez@hestia.duoc.cl      / Visor2024!
    lperez@hestia.duoc.cl         / Visor2024!
"""

import re
import sys
import os
import random
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.database import SessionLocal
from app.models.sala import Sala
from app.models.insumo import Insumo, TipoInsumo
from app.models.movimiento import Movimiento, TipoMovimiento
from app.models.usuario import Usuario, RolUsuario
from app.models.audit_log import AuditLog
from app.models.solicitud import SolicitudRetiro, SolicitudItem, EstadoSolicitud
from app.models.asignatura import Asignatura, CarreraAsignatura
from app.models.clase_docente import ClaseDocente
from app.models.retorno_implemento import RetornoImplemento
from app.models.activo_fijo import (
    ActivoFijo, TipoActivo, EstadoActivo, FidelidadPhantoma,
)
from app.models.unidad_implemento import UnidadImplemento, EstadoUnidad
from app.utils.security import hashear_password

try:
    from app.models.categoria import Categoria
except ImportError:
    from app.models.categoria import Categorium as Categoria

random.seed(42)

IN = "insumo"
IM = "implemento"
TENS = CarreraAsignatura.TENS
TQF = CarreraAsignatura.TQF
TLCBS = CarreraAsignatura.TLCBS
TONS = CarreraAsignatura.TONS
PF = CarreraAsignatura.preparador_fisico

# Salas con numeracion real piso -1 + odontologia
SALAS = [
    ("Sala 010", "simulacion",
     "Sala de simulacion clinica — piso -1"),
    ("Sala 011", "simulacion",
     "Sala de simulacion clinica — piso -1"),
    ("Sala 012", "simulacion",
     "Sala de simulacion clinica — piso -1"),
    ("Sala 013", "simulacion",
     "Sala de simulacion clinica — piso -1"),
    ("Sala 014", "simulacion",
     "Sala de simulacion clinica — piso -1"),
    ("Sala 015", "simulacion",
     "Sala de simulacion clinica — piso -1"),
    ("Sala 016", "simulacion",
     "Sala de simulacion clinica — piso -1"),
    ("Sala 017", "simulacion",
     "Sala de simulacion clinica — piso -1"),
    ("Sala 018", "simulacion",
     "Sala de simulacion clinica — piso -1"),
    ("Sala 019", "simulacion",
     "Sala de simulacion clinica — piso -1"),
    ("Sala 020", "simulacion",
     "Sala de simulacion clinica — piso -1"),
    ("Sala 021", "simulacion",
     "Sala de simulacion clinica — piso -1"),
    ("Sala 022", "simulacion",
     "Sala de simulacion clinica — piso -1"),
    ("Bodega", "bodega",
     "Bodega central de insumos — piso -1"),
    ("Oficina", "oficina",
     "Oficina de coordinacion — piso -1"),
    # Salas de odontologia (fuera del espacio principal, conectadas)
    ("Sala 07 — Odontologia", "odontologia",
     "Sala de odontologia — edificio anexo"),
    ("Sala 08 — Odontologia", "odontologia",
     "Sala de odontologia — edificio anexo"),
    ("Sala 09 — Odontologia", "odontologia",
     "Sala de odontologia — edificio anexo"),
]

CATEGORIAS = [
    "Proteccion Personal (EPP)", "Vendajes y Apositos", "Material de Sutura",
    "Instrumental de Diagnostico", "Cateterismo y Venoclisis", "Inyectologia",
    "Oxigenoterapia", "Gestion de Residuos", "Medicamentos de Emergencia",
    "Higiene y Antisepticos",
]

# Sin rol docente
USUARIOS = [
    ("Administrador Hestia", "admin@hestia.duoc.cl", "Admin2024!", RolUsuario.admin),
    ("Maria Gonzalez", "mgonzalez@hestia.duoc.cl", "Oper2024!", RolUsuario.operador),
    ("Carlos Fuentes", "cfuentes@hestia.duoc.cl", "Oper2024!", RolUsuario.operador),
    ("Ana Martinez", "amartinez@hestia.duoc.cl", "Visor2024!", RolUsuario.visor),
    ("Luis Perez", "lperez@hestia.duoc.cl", "Visor2024!", RolUsuario.visor),
]

# Asignaturas representativas de las 5 carreras (codigos oficiales DuocUC)
ASIGNATURAS = [
    # TENS — Tecnico en Enfermeria
    ("Primeros Auxilios", "CIS1101", TENS),
    ("Rol del Tecnico en Enfermeria y Cuidados Basicos", "CIS1102", TENS),
    ("Anatomofisiologia", "CIS1103", TENS),
    ("Atencion de Personas con Alteraciones de Salud Medicas y Quirurgicas", "CIS1104", TENS),
    ("Atencion de la Mujer y Recien Nacido", "CIS1103B", TENS),
    # TQF — Tecnico en Quimica y Farmacia
    ("Quimica Analitica e Instrumental", "PFS1115", TQF),
    ("Bioseguridad Farmaceutica", "BIS1102", TQF),
    ("Legislacion Farmaceutica", "LFS1112", TQF),
    ("Farmacologia", "AVS2132", TQF),
    # TLCBS — Tecnico de Laboratorio Clinico y Banco de Sangre
    ("Preparacion de Laboratorio Clinico", "LCS1111", TLCBS),
    ("Administracion de Toma de Muestra", "ATS1111", TLCBS),
    ("Bioseguridad Clinica", "BIS1111", TLCBS),
    ("Microbiologia para Laboratorio Clinico", "LCS3111", TLCBS),
    # TONS — Tecnico en Odontologia
    ("Anatomo Fisiopatologia Estomatognatica", "ACS1101", TONS),
    ("Tecnicas de Primeros Auxilios y Procedimientos Basicos", "ACS1102", TONS),
    ("Servicios de Salud Generales y Odontologicos", "GAS1101", TONS),
    ("Asistencia en Cirugia Maxilofacial e Implantologia", "ACS1105", TONS),
    # Preparador Fisico
    ("Anatomia Funcional del Aparato Locomotor", "FES1101", PF),
    ("Teoria del Entrenamiento", "EAS1101", PF),
    ("Evaluacion para la Condicion Fisica", "EAS1102", PF),
]

# Clases sin docente externo — el operador_idx referencia usuarios[1] (mgonzalez)
# Formato: (usuario_idx, asig_idx, seccion, semestre, num_estudiantes)
CLASES_DOCENTE = [
    (1, 0, "001D", "2026-1", 28),
    (1, 1, "001D", "2026-1", 32),
    (2, 2, "001D", "2026-1", 30),
    (2, 3, "002D", "2026-1", 35),
    (1, 5, "001D", "2026-1", 22),
    (2, 9, "001D", "2026-1", 25),
    (1, 13, "001D", "2026-1", 20),
    (2, 17, "001D", "2026-1", 18),
]

INSUMOS = [
    # EPP (cat 0)
    ("Guantes de latex talla S", "Caja 100 unidades", 150, 50, 7, 0, IN, 3200),
    ("Guantes de latex talla M", "Caja 100 unidades", 220, 80, 7, 0, IN, 3500),
    ("Guantes de latex talla L", "Caja 100 unidades", 95, 50, 7, 0, IN, 3200),
    ("Guantes nitrilo sin polvo talla M", "Caja 100 unidades", 180, 100, 7, 0, IN, 4200),
    ("Mascarillas quirurgicas", "Caja 50 unidades", 15, 60, 0, 0, IN, 4000),
    ("Mascarillas N95 FFP2", "Unidad", 3, 20, 3, 0, IN, 2800),
    ("Gafas de proteccion", "Unidad reutilizable", 45, 15, 4, 0, IM, 3500),
    ("Pecheras desechables", "Unidad", 55, 25, 0, 0, IN, 280),
    ("Gorro quirurgico", "Bolsa 100 unidades", 8, 30, 2, 0, IN, 1800),
    ("Polainas quirurgicas", "Par", 70, 20, 2, 0, IN, 450),
    ("Careta de proteccion facial", "Unidad reutilizable", 12, 5, 4, 0, IM, 5500),
    # Vendajes (cat 1)
    ("Gasa esteril 10x10 cm", "Sobre 5 unidades", 380, 100, 7, 1, IN, 650),
    ("Gasa no esteril 10x10 cm", "Rollo", 195, 80, 2, 1, IN, 420),
    ("Aposito adhesivo 10x8 cm", "Unidad", 140, 50, 2, 1, IN, 380),
    ("Venda de gasa 10cm x 5m", "Rollo", 75, 25, 2, 1, IN, 520),
    ("Venda elastica 10cm", "Rollo", 55, 20, 5, 1, IN, 850),
    ("Venda de yeso 15cm", "Unidad", 18, 8, 2, 1, IN, 1200),
    ("Esparadrapo 5cm x 5m", "Rollo", 32, 12, 5, 1, IN, 1850),
    ("Algodon hidrofilo 500g", "Rollo", 14, 5, 7, 1, IN, 2400),
    ("Aposito hidrocoloide 10x10 cm", "Unidad", 25, 10, 2, 1, IN, 2800),
    ("Tela adhesiva 10cm x 5m", "Rollo", 20, 8, 5, 1, IN, 1650),
    ("Parche ocular esteril", "Unidad", 30, 10, 5, 1, IN, 580),
    # Sutura (cat 2)
    ("Seda 2-0 con aguja triangular", "Sobre", 28, 10, 2, 2, IN, 1200),
    ("Nylon 3-0 con aguja", "Sobre", 22, 10, 2, 2, IN, 1350),
    ("Poliglactina 2-0 Vicryl", "Sobre", 15, 8, 2, 2, IN, 2800),
    ("Seda 0 con aguja", "Sobre", 12, 5, 2, 2, IN, 1100),
    ("Nylon 4-0 piel", "Sobre", 10, 5, 2, 2, IN, 1450),
    ("Pinza Adson con dientes", "Unidad reutilizable", 8, 3, 2, 2, IM, 18000),
    ("Tijera de Mayo recta", "Unidad reutilizable", 5, 2, 2, 2, IM, 24000),
    ("Porta aguja Hegar", "Unidad reutilizable", 6, 2, 2, 2, IM, 21000),
    # Diagnostico (cat 3)
    ("Esfigmomanometro aneroide", "Unidad reutilizable", 12, 4, 5, 3, IM, 28000),
    ("Estetoscopio adulto", "Unidad reutilizable", 18, 6, 5, 3, IM, 38000),
    ("Termometro digital axilar", "Unidad reutilizable", 22, 8, 5, 3, IM, 9500),
    ("Oximetro de pulso digital", "Unidad reutilizable", 8, 3, 5, 3, IM, 22000),
    ("Otoscopio diagnostico", "Unidad reutilizable", 4, 2, 4, 3, IM, 95000),
    ("Martillo de reflejos neurologico", "Unidad reutilizable", 6, 2, 4, 3, IM, 14000),
    ("Glucometro portatil", "Unidad reutilizable", 5, 2, 5, 3, IM, 38000),
    ("Tiras reactivas glucometro x50", "Caja", 8, 4, 5, 3, IN, 12000),
    ("Linterna diagnostica", "Unidad reutilizable", 10, 3, 5, 3, IM, 9500),
    ("Cinta metrica flexible", "Unidad reutilizable", 15, 5, 5, 3, IM, 2200),
    # Cateterismo (cat 4)
    ("Cateter venoso periferico 18G", "Unidad", 35, 15, 3, 4, IN, 1450),
    ("Cateter venoso periferico 20G", "Unidad", 48, 20, 3, 4, IN, 1350),
    ("Cateter venoso periferico 22G", "Unidad", 28, 12, 3, 4, IN, 1450),
    ("Equipo de venoclisis con camara", "Unidad", 22, 10, 3, 4, IN, 1850),
    ("Llave de tres pasos", "Unidad", 15, 8, 3, 4, IN, 2200),
    ("Bolsa colectora de orina 2000ml", "Unidad", 12, 5, 3, 4, IN, 2800),
    ("Sonda Foley N14 con globo", "Unidad", 6, 4, 3, 4, IN, 3500),
    ("Sonda Foley N16 con globo", "Unidad", 5, 3, 3, 4, IN, 3500),
    ("Sonda nasogastrica N14", "Unidad", 5, 3, 3, 4, IN, 2800),
    ("Jeringa 10ml con aguja 21G", "Unidad", 85, 30, 7, 4, IN, 380),
    ("Jeringa 20ml", "Unidad", 42, 15, 7, 4, IN, 320),
    ("Torniquete venoso", "Unidad reutilizable", 8, 3, 3, 4, IM, 4500),
    # Inyectologia (cat 5)
    ("Jeringa insulina 1ml", "Unidad", 160, 50, 5, 5, IN, 120),
    ("Aguja hipodermica 21G x 1.5", "Unidad", 210, 80, 7, 5, IN, 95),
    ("Aguja hipodermica 23G x 1", "Unidad", 185, 70, 7, 5, IN, 95),
    ("Aguja hipodermica 25G x 5/8", "Unidad", 125, 50, 5, 5, IN, 95),
    ("Lancetas descartables x100", "Caja", 8, 4, 5, 5, IN, 4500),
    ("Contenedor cortopunzante 3L", "Unidad", 2, 8, 0, 5, IN, 4200),
    ("Contenedor cortopunzante 3L APS", "Unidad", 1, 6, 5, 5, IN, 4200),
    # Oxigenoterapia (cat 6)
    ("Mascarilla de oxigeno adulto", "Unidad reutilizable", 8, 4, 3, 6, IM, 4800),
    ("Mascarilla Venturi adulto", "Unidad reutilizable", 4, 2, 3, 6, IM, 8500),
    ("Canula nasal adulto", "Unidad", 14, 5, 3, 6, IN, 850),
    ("Canula nasal pediatrica", "Unidad", 6, 3, 3, 6, IN, 850),
    ("Bolsa autoinflable AMBU adulto", "Unidad reutilizable", 3, 2, 3, 6, IM, 95000),
    ("Bolsa autoinflable AMBU pediatrico", "Unidad reutilizable", 2, 2, 3, 6, IM, 85000),
    ("Resucitador AMBU con mascarilla", "Unidad reutilizable", 4, 2, 3, 6, IM, 110000),
    # Residuos (cat 7)
    ("Bolsa roja residuos peligrosos 60L", "Unidad", 4, 12, 7, 7, IN, 380),
    ("Bolsa amarilla residuos especiales", "Unidad", 14, 8, 7, 7, IN, 320),
    ("Caja carton cortopunzantes grande", "Unidad", 6, 4, 7, 7, IN, 2800),
    ("Contenedor biohazard 30L", "Unidad", 3, 2, 7, 7, IN, 18000),
    # Medicamentos emergencia (cat 8)
    ("Adrenalina 1mg/ml ampolla 1ml", "Unidad", 5, 3, 3, 8, IN, 2500),
    ("Glucosa 50% ampolla 20ml", "Unidad", 10, 4, 3, 8, IN, 1800),
    ("Suero fisiologico NaCl 0.9% 1L", "Unidad", 2, 10, 3, 8, IN, 3500),
    ("Suero glucosado 5% 500ml", "Unidad", 6, 5, 3, 8, IN, 2800),
    ("Solucion Ringer Lactato 1L", "Unidad", 5, 4, 3, 8, IN, 3200),
    ("Suero fisiologico 0.9% 250ml", "Unidad para lavado", 12, 6, 3, 8, IN, 1800),
    ("Cloruro de sodio 20% ampolla", "Unidad", 8, 3, 3, 8, IN, 1200),
    # Higiene (cat 9)
    ("Alcohol isopropilico 70% 1000ml", "Litro", 12, 5, 7, 9, IN, 5500),
    ("Clorhexidina gluconato 4% 500ml", "Unidad", 8, 4, 7, 9, IN, 6800),
    ("Povidona yodada 10% 100ml", "Frasco", 10, 4, 7, 9, IN, 3500),
    ("Jabon clinico antiseptico 500ml", "Unidad", 16, 6, 7, 9, IN, 4200),
    ("Gel antibacterial 500ml Sim1", "Unidad", 3, 12, 0, 9, IN, 3800),
    ("Gel antibacterial 500ml APS", "Unidad", 4, 10, 5, 9, IN, 3800),
    ("Solucion glutaraldehido 2%", "Litro", 4, 2, 7, 9, IN, 8500),
    ("Hipoclorito de sodio 5% 1L", "Litro", 8, 3, 7, 9, IN, 2800),
    ("Gasas con clorhexidina CHG", "Sobre", 40, 15, 2, 9, IN, 1200),
]

# (nombre, descripcion, tipo, sala_idx, fidelidad, notas)
ACTIVOS_FIJOS_DEMO = [
    ("Camilla articulada con barandas",
     "Camilla electrica 3 secciones, barandas abatibles",
     TipoActivo.mueble, 0, None, "Revision anual programada marzo 2027"),
    ("Carro de paro de emergencia",
     "Carro equipado con desfibrilador y medicamentos de emergencia",
     TipoActivo.mueble, 3, None, "Revision mensual de contenido obligatoria"),
    ("Mesa de procedimientos Mayo",
     "Mesa auxiliar acero inoxidable con ruedas",
     TipoActivo.mueble, 2, None, None),
    ("SimMan 3G",
     "Maniqui de alta fidelidad adulto Laerdal",
     TipoActivo.phantoma, 0, FidelidadPhantoma.alta,
     "Mantenimiento preventivo semestral por Laerdal Chile"),
    ("Nursing Anne",
     "Maniqui para entrenamiento de enfermeria Laerdal",
     TipoActivo.phantoma, 1, FidelidadPhantoma.media, None),
    ("ALS Simulator neonatal",
     "Maniqui neonatal de soporte vital avanzado",
     TipoActivo.phantoma, 6, FidelidadPhantoma.alta,
     "Solo para clase de Obstetricia y Ginecologia"),
]

SOLICITUDES_DEMO = [
    (1, 0, EstadoSolicitud.pendiente, 18,
     "Clase de simulacion alta fidelidad, maniqui adulto", None,
     [(0, 2), (1, 2), (4, 1), (11, 5), (7, 3)], 0),
    (1, 1, EstadoSolicitud.pendiente, 22, "Taller de venopuncion", None,
     [(1, 4), (40, 3), (41, 3), (49, 5), (53, 5)], 1),
    (2, 2, EstadoSolicitud.pendiente, 26,
     "Practica de sutura", None,
     [(22, 3), (23, 2), (24, 2), (27, 1), (28, 1)], 2),
    (1, 5, EstadoSolicitud.pendiente, 30, None, None,
     [(31, 2), (32, 2), (33, 1), (34, 1), (36, 1)], 3),
    (2, 3, EstadoSolicitud.pendiente, 14,
     "Urgencias simuladas, RCP avanzado", None,
     [(5, 2), (57, 2), (58, 1), (63, 2), (64, 3)], 4),
    (1, 0, EstadoSolicitud.pendiente, 36, "Clase de maternidad", None,
     [(0, 2), (1, 2), (11, 4), (75, 2), (76, 2)], None),
    (1, 0, EstadoSolicitud.en_preparacion, 8,
     "Necesito guantes talla M si es posible",
     "Preparando kit, stock de M bajo - enviare L",
     [(1, 3), (3, 2), (11, 5), (70, 1), (80, 1)], 5),
    (2, 4, EstadoSolicitud.en_preparacion, 10,
     None, "Kit listo en bodega, sala 4",
     [(30, 2), (31, 1), (35, 1), (72, 2)], 6),
    (1, 2, EstadoSolicitud.en_preparacion, 5,
     "Clase en menos de 6 horas, urgente", "Priorizando este pedido",
     [(22, 2), (23, 2), (11, 3), (6, 2)], 7),
    (1, 0, EstadoSolicitud.completada, -48,
     "Simulacion alta fidelidad semana pasada", "Despachado sin novedades",
     [(0, 2), (1, 2), (11, 4), (12, 3)], 0),
    (2, 1, EstadoSolicitud.completada, -72, None, "Todo OK",
     [(40, 2), (41, 3), (49, 4), (53, 3)], 1),
    (1, 2, EstadoSolicitud.completada, -96,
     "Taller de sutura avanzada", "Despachado completo",
     [(22, 3), (23, 2), (24, 1), (27, 1)], 2),
    (2, 5, EstadoSolicitud.completada, -120, None, "Sin novedades",
     [(31, 1), (32, 2), (33, 1)], 3),
    (1, 3, EstadoSolicitud.completada, -144,
     "Clase urgencias criticas", "Kit urgencias despachado",
     [(5, 1), (57, 2), (63, 2), (64, 2)], 4),
    (2, 0, EstadoSolicitud.completada, -168, None, "Despachado",
     [(0, 2), (1, 2), (11, 3)], 0),
    (1, 0, EstadoSolicitud.completada, -192,
     "Simulacion con maniqui neonato", "Completo",
     [(1, 2), (3, 2), (11, 4)], 1),
    (2, 4, EstadoSolicitud.completada, -216, None, "OK",
     [(30, 1), (35, 1), (72, 2)], 2),
    (1, 1, EstadoSolicitud.completada, -240,
     "Taller introductorio venoclisis", "Despachado completo",
     [(40, 2), (41, 2), (44, 2), (49, 3)], 3),
]

MOTIVOS_SALIDA = [
    "Practica clinica — Enfermeria",
    "Practica simulacion alta fidelidad",
    "Uso en procedimiento de simulacion",
    "Practica de sutura y cierre de heridas",
    "Simulacro de urgencias vitales",
    "Practica de venopuncion",
    "Clase practica de diagnostico clinico",
    "Ejercicio de RCP avanzado",
    "Practica de vendaje funcional",
    "Simulacion obstetrica",
    "Taller de atencion primaria",
]

MOTIVOS_ENTRADA = [
    "Reposicion mensual de stock",
    "Compra programada DuocUC",
    "Reposicion urgente",
    "Recepcion pedido proveedor",
]


def _prefijo_codigo(nombre: str) -> str:
    """Misma logica que el backend para generar prefijo de 3 chars."""
    n = (nombre.upper()
         .replace("\u00c1", "A").replace("\u00c9", "E").replace("\u00cd", "I")
         .replace("\u00d3", "O").replace("\u00da", "U").replace("\u00d1", "N"))
    return re.sub(r"[^A-Z0-9]", "", n)[:3].ljust(3, "X")


def fecha_aleatoria(dias_min, dias_max):
    ahora = datetime.now(timezone.utc)
    return ahora - timedelta(
        days=random.randint(dias_min, dias_max),
        hours=random.randint(0, 12),
        minutes=random.randint(0, 59),
    )


def main():
    db = SessionLocal()
    try:
        print("\nHestia \u2014 Cargador de datos de demo")
        print("=" * 40)
        if input(
            "Esto eliminara TODOS los datos existentes. Continuar? (s/N): "
        ).strip().lower() != "s":
            print("Cancelado.")
            return

        # --- Limpiar en orden FK ---
        print("\nLimpiando datos existentes...")
        db.query(UnidadImplemento).delete()
        db.query(ActivoFijo).delete()
        db.query(RetornoImplemento).delete()
        db.query(AuditLog).delete()
        db.query(SolicitudItem).delete()
        db.query(SolicitudRetiro).delete()
        db.query(Movimiento).delete()
        db.query(ClaseDocente).delete()
        db.query(Insumo).delete()
        db.query(Asignatura).delete()
        db.query(Sala).delete()
        db.query(Categoria).delete()
        db.query(Usuario).delete()
        db.commit()
        print("  OK")

        # --- Salas ---
        print("Insertando salas...")
        salas = []
        for nombre, tipo, desc in SALAS:
            s = Sala(nombre=nombre, tipo=tipo, descripcion=desc)
            db.add(s)
            salas.append(s)
        db.flush()
        print(f"  {len(salas)} salas")

        # --- Categorias ---
        print("Insertando categorias...")
        cats = []
        for nombre in CATEGORIAS:
            c = Categoria(nombre=nombre)
            db.add(c)
            cats.append(c)
        db.flush()
        print(f"  {len(cats)} categorias")

        # --- Usuarios ---
        print("Insertando usuarios...")
        usuarios = []
        for nombre, email, pwd, rol in USUARIOS:
            u = Usuario(
                nombre=nombre, email=email,
                password_hash=hashear_password(pwd), rol=rol,
            )
            db.add(u)
            usuarios.append(u)
        db.flush()
        operadores = [u for u in usuarios if u.rol == RolUsuario.operador]
        print(f"  {len(usuarios)} usuarios")

        # --- Asignaturas ---
        print("Insertando asignaturas...")
        asignaturas = []
        for nombre, codigo, carrera in ASIGNATURAS:
            a = Asignatura(nombre=nombre, codigo=codigo, carrera=carrera)
            db.add(a)
            asignaturas.append(a)
        db.flush()
        print(f"  {len(asignaturas)} asignaturas (5 carreras)")

        # --- Clases ---
        print("Insertando clases...")
        clases = []
        for u_idx, asig_idx, seccion, semestre, num_est in CLASES_DOCENTE:
            c = ClaseDocente(
                docente_id=usuarios[u_idx].id,
                asignatura_id=asignaturas[asig_idx].id,
                seccion=seccion, semestre=semestre, num_estudiantes=num_est,
            )
            db.add(c)
            clases.append(c)
        db.flush()
        print(f"  {len(clases)} clases (semestre 2026-1)")

        # --- Insumos ---
        print("Insertando insumos...")
        insumos_db = []
        for nombre, desc, stock, minimo, sala_idx, cat_idx, tipo, costo in INSUMOS:
            i = Insumo(
                nombre=nombre, descripcion=desc,
                stock_actual=stock, stock_minimo=minimo,
                sala_id=salas[sala_idx].id,
                categoria_id=cats[cat_idx].id,
                tipo=TipoInsumo(tipo), costo_unitario=costo,
            )
            db.add(i)
            insumos_db.append(i)
        db.flush()
        for ins in insumos_db:
            if not ins.sku:
                ins.sku = f"HST-{ins.id:05d}"
        db.commit()
        implementos_list = [i for i in insumos_db if i.tipo == TipoInsumo.implemento]
        print(f"  {len(insumos_db)} insumos ({len(implementos_list)} implementos)")

        # --- Unidades fisicas de implementos ---
        print("Insertando unidades fisicas de implementos...")
        total_unidades = 0
        for impl in implementos_list:
            prefijo = _prefijo_codigo(impl.nombre)
            for _ in range(random.randint(2, 5)):
                estado = random.choice([
                    EstadoUnidad.disponible, EstadoUnidad.disponible,
                    EstadoUnidad.disponible, EstadoUnidad.en_uso,
                ])
                u = UnidadImplemento(implemento_id=impl.id, estado=estado)
                db.add(u)
                db.flush()
                u.codigo = f"{prefijo}-{u.id:05d}"
                total_unidades += 1
        db.commit()
        print(
            f"  {total_unidades} unidades "
            f"({len(implementos_list)} implementos cubiertos)"
        )

        # --- Activos Fijos ---
        print("Insertando activos fijos...")
        activos_db = []
        for nombre, desc, tipo, sala_idx, fidelidad, notas in ACTIVOS_FIJOS_DEMO:
            af = ActivoFijo(
                nombre=nombre, descripcion=desc, tipo=tipo,
                sala_id=salas[sala_idx].id, fidelidad=fidelidad,
                estado=EstadoActivo.disponible, notas=notas,
            )
            db.add(af)
            activos_db.append(af)
            db.flush()
            prefijo_af = "MUE" if tipo == TipoActivo.mueble else "PHN"
            af.codigo_interno = f"{prefijo_af}-{af.id:05d}"
        db.commit()
        n_muebles = sum(1 for a in ACTIVOS_FIJOS_DEMO if a[2] == TipoActivo.mueble)
        n_phantomas = len(ACTIVOS_FIJOS_DEMO) - n_muebles
        print(
            f"  {len(activos_db)} activos fijos "
            f"({n_muebles} muebles, {n_phantomas} phantomas)"
        )

        # --- Movimientos ---
        print("Insertando movimientos...")
        total_movs = 0
        for insumo in insumos_db:
            en_alerta = insumo.stock_actual <= insumo.stock_minimo
            ne = random.randint(1, 2) if en_alerta else random.randint(2, 4)
            ns = random.randint(5, 9) if en_alerta else random.randint(3, 7)
            rne = (40, 60) if en_alerta else (3, 50)
            rns = (0, 25) if en_alerta else (0, 50)
            for _ in range(ne):
                db.add(Movimiento(
                    tipo=TipoMovimiento.entrada,
                    cantidad=random.randint(30, 150),
                    motivo=random.choice(MOTIVOS_ENTRADA),
                    fecha=fecha_aleatoria(*rne),
                    insumo_id=insumo.id,
                    usuario_id=random.choice(operadores).id,
                ))
                total_movs += 1
            for _ in range(ns):
                db.add(Movimiento(
                    tipo=TipoMovimiento.salida,
                    cantidad=random.randint(1, 8),
                    motivo=random.choice(MOTIVOS_SALIDA),
                    fecha=fecha_aleatoria(*rns),
                    insumo_id=insumo.id,
                    usuario_id=random.choice(usuarios).id,
                ))
                total_movs += 1
        db.commit()
        print(f"  {total_movs} movimientos")

        # --- Solicitudes de retiro ---
        print("Insertando solicitudes de retiro...")
        ahora = datetime.now(timezone.utc)
        total_sols = 0
        for (u_idx, sala_idx, estado, horas,
             notas, notas_op, items, clase_idx) in SOLICITUDES_DEMO:
            items_v = [(i, c) for i, c in items if i < len(insumos_db)]
            if not items_v:
                continue
            fecha_clase = ahora + timedelta(hours=horas)
            fecha_creacion = ahora - timedelta(
                hours=abs(horas) + random.randint(1, 6)
            )
            fecha_comp = None
            if estado == EstadoSolicitud.completada:
                fecha_comp = fecha_clase + timedelta(hours=random.randint(1, 3))
            sol = SolicitudRetiro(
                docente_id=usuarios[u_idx].id,
                sala_id=salas[sala_idx].id,
                fecha_clase=fecha_clase, estado=estado,
                notas=notas, notas_operador=notas_op,
                fecha_creacion=fecha_creacion, fecha_completada=fecha_comp,
                clase_docente_id=(
                    clases[clase_idx].id if clase_idx is not None else None
                ),
            )
            db.add(sol)
            db.flush()
            for ii, cantidad in items_v:
                db.add(SolicitudItem(
                    solicitud_id=sol.id,
                    insumo_id=insumos_db[ii].id,
                    cantidad_solicitada=cantidad,
                ))
            total_sols += 1
        db.commit()
        pend = sum(1 for s in SOLICITUDES_DEMO if s[2] == EstadoSolicitud.pendiente)
        enpr = sum(
            1 for s in SOLICITUDES_DEMO if s[2] == EstadoSolicitud.en_preparacion
        )
        comp = sum(
            1 for s in SOLICITUDES_DEMO if s[2] == EstadoSolicitud.completada
        )
        print(
            f"  {total_sols} solicitudes "
            f"({pend} pendientes, {enpr} en preparacion, {comp} completadas)"
        )

        # --- Retornos de implemento demo ---
        print("Insertando retornos de implemento...")
        total_retornos = 0
        for idx, impl in enumerate(implementos_list[:5]):
            estado_r = (
                "retornado" if idx % 3 == 0
                else "pendiente" if idx % 3 == 1
                else "no_retornado"
            )
            f_retiro = ahora - timedelta(hours=random.randint(2, 48))
            f_retorno = (
                f_retiro + timedelta(hours=random.randint(1, 4))
                if estado_r == "retornado" else None
            )
            db.add(RetornoImplemento(
                insumo_id=impl.id,
                solicitud_id=None,
                docente_id=random.choice(operadores).id,
                sala_id=random.choice(salas).id,
                cantidad=random.randint(1, 3),
                fecha_retiro=f_retiro,
                fecha_retorno=f_retorno,
                estado=estado_r,
                operador_id=(
                    random.choice(operadores).id
                    if estado_r != "pendiente" else None
                ),
            ))
            total_retornos += 1
        db.commit()
        print(f"  {total_retornos} retornos de implemento")

        # --- Resumen final ---
        alertas = sum(1 for _, _, s, m, *_ in INSUMOS if s <= m)
        print("\n" + "=" * 40)
        print("Demo cargada exitosamente.")
        print(f"  Salas:         {len(salas)} (15 clinicas + 3 odontologia)")
        print(f"  Categorias:    {len(cats)}")
        print(f"  Usuarios:      {len(usuarios)} (sin rol docente)")
        print(f"  Asignaturas:   {len(asignaturas)} (5 carreras)")
        print(f"  Clases:        {len(clases)} (semestre 2026-1)")
        print(
            f"  Insumos:       {len(insumos_db)} ({alertas} en alerta de stock)"
        )
        print(
            f"  Implementos:   {len(implementos_list)} "
            f"con {total_unidades} unidades fisicas"
        )
        print(
            f"  Activos fijos: {len(activos_db)} "
            f"({n_muebles} muebles, {n_phantomas} phantomas)"
        )
        print(f"  Movimientos:   {total_movs}")
        print(f"  Solicitudes:   {total_sols}")
        print(f"  Retornos:      {total_retornos}")
        print("\nCredenciales:")
        for _, email, pwd, rol in USUARIOS:
            print(f"  {email:38} | {pwd:12} | {rol.value}")
        print()

    except Exception as e:
        db.rollback()
        print(f"\nError: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
