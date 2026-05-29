#!/usr/bin/env python3
"""
Script de datos de demo para Hestia - Escuela de Salud DuocUC.

Uso:
    docker compose exec api python seed_demo.py

Genera:
    - 18 salas clinicas (numeracion real piso -1 + odontologia), 10 categorias
    - 5 usuarios (admin, 2 operadores, 2 visores) — sin rol docente
    - 20 asignaturas representativas de las 5 carreras (mallas 2024-2025)
    - 88 insumos/implementos en Bodega (sin sala asignada)
    - Unidades fisicas de implementos: algunas asignadas a salas demo
    - ~560 movimientos en los ultimos 60 dias
    - 6 activos fijos: 3 muebles clinicos + 3 phantomas de simulacion
    - 4 talleres + 2 paquetes de insumos de ejemplo

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
# IMPORTANTE: taller y paquete_insumo deben importarse antes de cualquier
# query ORM. Asignatura tiene relationship('Taller', ...) — si Taller no
# esta en el mapper registry al momento de ejecutar la primera query,
# SQLAlchemy lanza InvalidRequestError con KeyError: 'Taller'.
from app.models.taller import Taller
from app.models.paquete_insumo import PaqueteInsumo, PaqueteItem
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
     "Sala de simulacion clinica \u2014 piso -1"),
    ("Sala 011", "simulacion",
     "Sala de simulacion clinica \u2014 piso -1"),
    ("Sala 012", "simulacion",
     "Sala de simulacion clinica \u2014 piso -1"),
    ("Sala 013", "simulacion",
     "Sala de simulacion clinica \u2014 piso -1"),
    ("Sala 014", "simulacion",
     "Sala de simulacion clinica \u2014 piso -1"),
    ("Sala 015", "simulacion",
     "Sala de simulacion clinica \u2014 piso -1"),
    ("Sala 016", "simulacion",
     "Sala de simulacion clinica \u2014 piso -1"),
    ("Sala 017", "simulacion",
     "Sala de simulacion clinica \u2014 piso -1"),
    ("Sala 018", "simulacion",
     "Sala de simulacion clinica \u2014 piso -1"),
    ("Sala 019", "simulacion",
     "Sala de simulacion clinica \u2014 piso -1"),
    ("Sala 020", "simulacion",
     "Sala de simulacion clinica \u2014 piso -1"),
    ("Sala 021", "simulacion",
     "Sala de simulacion clinica \u2014 piso -1"),
    ("Sala 022", "simulacion",
     "Sala de simulacion clinica \u2014 piso -1"),
    ("Bodega", "bodega",
     "Bodega central de insumos \u2014 piso -1"),
    ("Oficina", "oficina",
     "Oficina de coordinacion \u2014 piso -1"),
    # Salas de odontologia (fuera del espacio principal, conectadas)
    ("Sala 07 \u2014 Odontologia", "odontologia",
     "Sala de odontologia \u2014 edificio anexo"),
    ("Sala 08 \u2014 Odontologia", "odontologia",
     "Sala de odontologia \u2014 edificio anexo"),
    ("Sala 09 \u2014 Odontologia", "odontologia",
     "Sala de odontologia \u2014 edificio anexo"),
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
    ("Atencion de Personas con Alteraciones de Salud Medicas y Quirurgicas",
     "CIS1104", TENS),
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

# Todos los insumos viven en Bodega (sin sala_id).
# La ubicacion fisica de los IMPLEMENTOS se gestiona a nivel de UnidadImplemento.
# Formato: (nombre, unidad_medida, stock, minimo, cat_idx, tipo, costo)
INSUMOS = [
    # EPP (cat 0)
    ("Guantes de latex talla S", "Caja x100 unidades", 150, 50, 0, IN, 3200),
    ("Guantes de latex talla M", "Caja x100 unidades", 220, 80, 0, IN, 3500),
    ("Guantes de latex talla L", "Caja x100 unidades", 95, 50, 0, IN, 3200),
    ("Guantes nitrilo sin polvo talla M", "Caja x100 unidades", 180, 100, 0, IN, 4200),
    ("Mascarillas quirurgicas", "Caja x50 unidades", 15, 60, 0, IN, 4000),
    ("Mascarillas N95 FFP2", "Unidad", 3, 20, 0, IN, 2800),
    ("Gafas de proteccion", "Unidad reutilizable", 45, 15, 0, IM, 3500),
    ("Pecheras desechables", "Unidad", 55, 25, 0, IN, 280),
    ("Gorro quirurgico", "Bolsa x100 unidades", 8, 30, 0, IN, 1800),
    ("Polainas quirurgicas", "Par", 70, 20, 0, IN, 450),
    ("Careta de proteccion facial", "Unidad reutilizable", 12, 5, 0, IM, 5500),
    # Vendajes (cat 1)
    ("Gasa esteril 10x10 cm", "Sobre x5 unidades", 380, 100, 1, IN, 650),
    ("Gasa no esteril 10x10 cm", "Rollo", 195, 80, 1, IN, 420),
    ("Aposito adhesivo 10x8 cm", "Unidad", 140, 50, 1, IN, 380),
    ("Venda de gasa 10cm x 5m", "Rollo", 75, 25, 1, IN, 520),
    ("Venda elastica 10cm", "Rollo", 55, 20, 1, IN, 850),
    ("Venda de yeso 15cm", "Unidad", 18, 8, 1, IN, 1200),
    ("Esparadrapo 5cm x 5m", "Rollo", 32, 12, 1, IN, 1850),
    ("Algodon hidrofilo 500g", "Rollo", 14, 5, 1, IN, 2400),
    ("Aposito hidrocoloide 10x10 cm", "Unidad", 25, 10, 1, IN, 2800),
    ("Tela adhesiva 10cm x 5m", "Rollo", 20, 8, 1, IN, 1650),
    ("Parche ocular esteril", "Unidad", 30, 10, 1, IN, 580),
    # Sutura (cat 2)
    ("Seda 2-0 con aguja triangular", "Sobre", 28, 10, 2, IN, 1200),
    ("Nylon 3-0 con aguja", "Sobre", 22, 10, 2, IN, 1350),
    ("Poliglactina 2-0 Vicryl", "Sobre", 15, 8, 2, IN, 2800),
    ("Seda 0 con aguja", "Sobre", 12, 5, 2, IN, 1100),
    ("Nylon 4-0 piel", "Sobre", 10, 5, 2, IN, 1450),
    ("Pinza Adson con dientes", "Unidad reutilizable", 8, 3, 2, IM, 18000),
    ("Tijera de Mayo recta", "Unidad reutilizable", 5, 2, 2, IM, 24000),
    ("Porta aguja Hegar", "Unidad reutilizable", 6, 2, 2, IM, 21000),
    # Diagnostico (cat 3)
    ("Esfigmomanometro aneroide", "Unidad reutilizable", 12, 4, 3, IM, 28000),
    ("Estetoscopio adulto", "Unidad reutilizable", 18, 6, 3, IM, 38000),
    ("Termometro digital axilar", "Unidad reutilizable", 22, 8, 3, IM, 9500),
    ("Oximetro de pulso digital", "Unidad reutilizable", 8, 3, 3, IM, 22000),
    ("Otoscopio diagnostico", "Unidad reutilizable", 4, 2, 3, IM, 95000),
    ("Martillo de reflejos neurologico", "Unidad reutilizable", 6, 2, 3, IM, 14000),
    ("Glucometro portatil", "Unidad reutilizable", 5, 2, 3, IM, 38000),
    ("Tiras reactivas glucometro x50", "Caja", 8, 4, 3, IN, 12000),
    ("Linterna diagnostica", "Unidad reutilizable", 10, 3, 3, IM, 9500),
    ("Cinta metrica flexible", "Unidad reutilizable", 15, 5, 3, IM, 2200),
    # Cateterismo (cat 4)
    ("Cateter venoso periferico 18G", "Unidad", 35, 15, 4, IN, 1450),
    ("Cateter venoso periferico 20G", "Unidad", 48, 20, 4, IN, 1350),
    ("Cateter venoso periferico 22G", "Unidad", 28, 12, 4, IN, 1450),
    ("Equipo de venoclisis con camara", "Unidad", 22, 10, 4, IN, 1850),
    ("Llave de tres pasos", "Unidad", 15, 8, 4, IN, 2200),
    ("Bolsa colectora de orina 2000ml", "Unidad", 12, 5, 4, IN, 2800),
    ("Sonda Foley N14 con globo", "Unidad", 6, 4, 4, IN, 3500),
    ("Sonda Foley N16 con globo", "Unidad", 5, 3, 4, IN, 3500),
    ("Sonda nasogastrica N14", "Unidad", 5, 3, 4, IN, 2800),
    ("Jeringa 10ml con aguja 21G", "Unidad", 85, 30, 4, IN, 380),
    ("Jeringa 20ml", "Unidad", 42, 15, 4, IN, 320),
    ("Torniquete venoso", "Unidad reutilizable", 8, 3, 4, IM, 4500),
    # Inyectologia (cat 5)
    ("Jeringa insulina 1ml", "Unidad", 160, 50, 5, IN, 120),
    ("Aguja hipodermica 21G x 1.5", "Unidad", 210, 80, 5, IN, 95),
    ("Aguja hipodermica 23G x 1", "Unidad", 185, 70, 5, IN, 95),
    ("Aguja hipodermica 25G x 5/8", "Unidad", 125, 50, 5, IN, 95),
    ("Lancetas descartables x100", "Caja", 8, 4, 5, IN, 4500),
    ("Contenedor cortopunzante 3L", "Unidad", 2, 8, 5, IN, 4200),
    ("Contenedor cortopunzante 3L APS", "Unidad", 1, 6, 5, IN, 4200),
    # Oxigenoterapia (cat 6)
    ("Mascarilla de oxigeno adulto", "Unidad reutilizable", 8, 4, 6, IM, 4800),
    ("Mascarilla Venturi adulto", "Unidad reutilizable", 4, 2, 6, IM, 8500),
    ("Canula nasal adulto", "Unidad", 14, 5, 6, IN, 850),
    ("Canula nasal pediatrica", "Unidad", 6, 3, 6, IN, 850),
    ("Bolsa autoinflable AMBU adulto", "Unidad reutilizable", 3, 2, 6, IM, 95000),
    ("Bolsa autoinflable AMBU pediatrico", "Unidad reutilizable", 2, 2, 6, IM, 85000),
    ("Resucitador AMBU con mascarilla", "Unidad reutilizable", 4, 2, 6, IM, 110000),
    # Residuos (cat 7)
    ("Bolsa roja residuos peligrosos 60L", "Unidad", 4, 12, 7, IN, 380),
    ("Bolsa amarilla residuos especiales", "Unidad", 14, 8, 7, IN, 320),
    ("Caja carton cortopunzantes grande", "Unidad", 6, 4, 7, IN, 2800),
    ("Contenedor biohazard 30L", "Unidad", 3, 2, 7, IN, 18000),
    # Medicamentos emergencia (cat 8)
    ("Adrenalina 1mg/ml ampolla 1ml", "Ampolla 1 mL", 5, 3, 8, IN, 2500),
    ("Glucosa 50% ampolla 20ml", "Ampolla 20 mL", 10, 4, 8, IN, 1800),
    ("Suero fisiologico NaCl 0.9% 1L", "Bolsa 1 L", 2, 10, 8, IN, 3500),
    ("Suero glucosado 5% 500ml", "Bolsa 500 mL", 6, 5, 8, IN, 2800),
    ("Solucion Ringer Lactato 1L", "Bolsa 1 L", 5, 4, 8, IN, 3200),
    ("Suero fisiologico 0.9% 250ml", "Bolsa 250 mL", 12, 6, 8, IN, 1800),
    ("Cloruro de sodio 20% ampolla", "Ampolla 20 mL", 8, 3, 8, IN, 1200),
    # Higiene (cat 9)
    ("Alcohol isopropilico 70% 1000ml", "Frasco 1000 mL", 12, 5, 9, IN, 5500),
    ("Clorhexidina gluconato 4% 500ml", "Frasco 500 mL", 8, 4, 9, IN, 6800),
    ("Povidona yodada 10% 100ml", "Frasco 100 mL", 10, 4, 9, IN, 3500),
    ("Jabon clinico antiseptico 500ml", "Frasco 500 mL", 16, 6, 9, IN, 4200),
    ("Gel antibacterial 500ml Sim1", "Frasco 500 mL", 3, 12, 9, IN, 3800),
    ("Gel antibacterial 500ml APS", "Frasco 500 mL", 4, 10, 9, IN, 3800),
    ("Solucion glutaraldehido 2%", "Frasco 1 L", 4, 2, 9, IN, 8500),
    ("Hipoclorito de sodio 5% 1L", "Frasco 1 L", 8, 3, 9, IN, 2800),
    ("Gasas con clorhexidina CHG", "Sobre", 40, 15, 9, IN, 1200),
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

MOTIVOS_SALIDA = [
    "Practica clinica \u2014 Enfermeria",
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
        db.query(PaqueteItem).delete()
        db.query(PaqueteInsumo).delete()
        db.query(Taller).delete()
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
        # Todos viven en Bodega: sala_id=NULL.
        # La ubicacion fisica de los implementos se define a nivel de unidad.
        print("Insertando insumos...")
        insumos_db = []
        for nombre, unidad_medida, stock, minimo, cat_idx, tipo, costo in INSUMOS:
            i = Insumo(
                nombre=nombre,
                descripcion=unidad_medida,
                unidad_medida=unidad_medida,
                stock_actual=stock,
                stock_minimo=minimo,
                sala_id=None,
                categoria_id=cats[cat_idx].id,
                tipo=TipoInsumo(tipo),
                costo_unitario=costo,
            )
            db.add(i)
            insumos_db.append(i)
        db.flush()
        for ins in insumos_db:
            if not ins.sku:
                ins.sku = f"HST-{ins.id:05d}"
        db.commit()
        implementos_list = [
            i for i in insumos_db if i.tipo == TipoInsumo.implemento
        ]
        print(f"  {len(insumos_db)} insumos ({len(implementos_list)} implementos)")

        # --- Unidades fisicas de implementos ---
        # Algunas unidades se asignan a salas clinicas (sala 010, 011, 012).
        # El resto queda en Bodega (sala_id=None).
        print("Insertando unidades fisicas de implementos...")
        total_unidades = 0
        salas_clinicas = salas[:3]  # 010, 011, 012
        for impl in implementos_list:
            prefijo = _prefijo_codigo(impl.nombre)
            cantidad = random.randint(2, 5)
            for j in range(cantidad):
                estado = random.choice([
                    EstadoUnidad.disponible, EstadoUnidad.disponible,
                    EstadoUnidad.disponible, EstadoUnidad.en_uso,
                ])
                # Primera unidad de cada EPP/implemento comun va a sala 010
                # Segunda va a sala 011; el resto queda en Bodega
                if j == 0 and impl.categoria_id == cats[0].id:
                    sala_asignada = salas_clinicas[0].id  # sala 010
                elif j == 1 and impl.categoria_id == cats[0].id:
                    sala_asignada = salas_clinicas[1].id  # sala 011
                else:
                    sala_asignada = None  # Bodega
                u = UnidadImplemento(
                    implemento_id=impl.id,
                    estado=estado,
                    sala_id=sala_asignada,
                )
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

        # --- Talleres ---
        print("Insertando talleres de demo...")
        talleres_data = [
            # (nombre, descripcion, asig_idx)
            ("Taller de venopuncion",
             "Practica de cateterizacion venosa periferica",
             0),  # CIS1101 TENS
            ("Taller de sutura basica",
             "Tecnicas de sutura y cierre de heridas en simulador",
             0),  # CIS1101 TENS
            ("Taller de RCP avanzado",
             "Reanimacion cardiopulmonar con maniqui de alta fidelidad",
             2),  # CIS1103 TENS
            ("Taller de bioseguridad y EPP",
             "Uso correcto de equipos de proteccion personal",
             6),  # BIS1102 TQF
        ]
        talleres_db = []
        for nombre, desc, asig_idx in talleres_data:
            t = Taller(
                nombre=nombre,
                descripcion=desc,
                asignatura_id=asignaturas[asig_idx].id,
            )
            db.add(t)
            talleres_db.append(t)
        db.flush()
        print(f"  {len(talleres_db)} talleres")

        # --- Paquetes de insumos (Guia de Taller) ---
        print("Insertando paquetes de insumos de demo...")
        total_paquetes = 0

        # Paquete 1: Taller de venopuncion — 2026-1
        p1 = PaqueteInsumo(
            taller_id=talleres_db[0].id,
            semestre="2026-1",
            creado_por_id=usuarios[1].id,  # mgonzalez
            notas="Preparado para 30 alumnos. Verificar stock de catetes 20G.",
        )
        db.add(p1)
        db.flush()
        items_p1 = [
            # (insumo_idx, cantidad, nota)
            (0, 30, "Talla S/M segun alumno"),   # Guantes latex S
            (1, 30, None),                         # Guantes latex M
            (4, 30, None),                         # Mascarillas quirurgicas
            (40, 5, None),                         # Cateter 18G
            (41, 10, None),                        # Cateter 20G
            (49, 15, None),                        # Jeringa 10ml
            (51, 5, None),                         # Torniquete
            (11, 30, None),                        # Gasa esteril
        ]
        for insumo_idx, cantidad, nota in items_p1:
            if insumo_idx < len(insumos_db):
                db.add(PaqueteItem(
                    paquete_id=p1.id,
                    insumo_id=insumos_db[insumo_idx].id,
                    cantidad_requerida=cantidad,
                    notas=nota,
                ))
        total_paquetes += 1

        # Paquete 2: Taller de bioseguridad y EPP — 2026-1
        p2 = PaqueteInsumo(
            taller_id=talleres_db[3].id,
            semestre="2026-1",
            creado_por_id=usuarios[1].id,
            notas="Incluye EPP completo para cada alumno.",
        )
        db.add(p2)
        db.flush()
        items_p2 = [
            (0, 25, None),   # Guantes S
            (1, 25, None),   # Guantes M
            (4, 25, None),   # Mascarillas
            (5, 25, None),   # N95
            (6, 25, None),   # Gafas de proteccion
            (7, 25, None),   # Pecheras
            (8, 25, None),   # Gorros
        ]
        for insumo_idx, cantidad, nota in items_p2:
            if insumo_idx < len(insumos_db):
                db.add(PaqueteItem(
                    paquete_id=p2.id,
                    insumo_id=insumos_db[insumo_idx].id,
                    cantidad_requerida=cantidad,
                    notas=nota,
                ))
        total_paquetes += 1
        db.commit()
        print(f"  {total_paquetes} paquetes (con sus items)")

        # --- Resumen final ---
        alertas = sum(1 for _, _, s, m, *_ in INSUMOS if s <= m)
        print("\n" + "=" * 40)
        print("Demo cargada exitosamente.")
        print(f"  Salas:         {len(salas)} (13 clinicas + 2 admin + 3 odontologia)")
        print(f"  Categorias:    {len(cats)}")
        print(f"  Usuarios:      {len(usuarios)} (sin rol docente)")
        print(f"  Asignaturas:   {len(asignaturas)} (5 carreras)")
        print(f"  Clases:        {len(clases)} (semestre 2026-1)")
        print(
            f"  Insumos:       {len(insumos_db)} "
            f"({alertas} en alerta de stock) — todos en Bodega"
        )
        print(
            f"  Implementos:   {len(implementos_list)} "
            f"con {total_unidades} unidades fisicas (algunas en salas)"
        )
        print(
            f"  Activos fijos: {len(activos_db)} "
            f"({n_muebles} muebles, {n_phantomas} phantomas)"
        )
        print(f"  Movimientos:   {total_movs}")
        print(f"  Talleres:      {len(talleres_db)}")
        print(f"  Paquetes:      {total_paquetes}")
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
