#!/usr/bin/env python3
"""
Script de datos de demo para Hestia - Escuela de Salud DuocUC.

Uso:
    docker compose exec api python seed_demo.py

Elimina todos los datos existentes y genera:
    - 8 salas clinicas realistas
    - 10 categorias de insumos medicos
    - 10 usuarios (1 admin, 2 operadores, 2 visores, 5 docentes)
    - 88 insumos con nombres y stocks realistas
    - ~560 movimientos distribuidos en los ultimos 60 dias
    - 18 solicitudes de retiro en distintos estados

Credenciales creadas:
    admin@hestia.duoc.cl          / Admin2024!
    mgonzalez@hestia.duoc.cl      / Oper2024!
    cfuentes@hestia.duoc.cl       / Oper2024!
    amartinez@hestia.duoc.cl      / Visor2024!
    lperez@hestia.duoc.cl         / Visor2024!
    c.moreno@hestia.duoc.cl       / Doc2024!
    p.vasquez@hestia.duoc.cl      / Doc2024!
    r.ibanez@hestia.duoc.cl       / Doc2024!
    s.reyes@hestia.duoc.cl        / Doc2024!
    m.tapia@hestia.duoc.cl        / Doc2024!
"""

import sys
import os
import random
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.database import SessionLocal
from app.models.sala import Sala
from app.models.insumo import Insumo
from app.models.movimiento import Movimiento, TipoMovimiento
from app.models.usuario import Usuario, RolUsuario
from app.models.audit_log import AuditLog
from app.models.solicitud import SolicitudRetiro, SolicitudItem, EstadoSolicitud
from app.utils.security import hashear_password

try:
    from app.models.categoria import Categoria
except ImportError:
    from app.models.categoria import Categorium as Categoria

random.seed(42)

# ---------------------------------------------------------------------------
# Datos maestros
# ---------------------------------------------------------------------------

SALAS = [
    ("Sala de Simulacion Clinica 1",    "simulacion",        "Simulacion de alta fidelidad con maniquies adultos"),
    ("Sala de Simulacion Clinica 2",    "simulacion",        "Simulacion basica y entrenamiento de habilidades"),
    ("Sala de Procedimientos",           "procedimientos",    "Practica de procedimientos invasivos y sutura"),
    ("Sala de Urgencias Simuladas",      "urgencias",         "Simulacion de urgencias y emergencias vitales"),
    ("Laboratorio de Anatomia",          "laboratorio",       "Laboratorio anatomico y de practica clinica"),
    ("Sala de Atencion Primaria",        "atencion primaria",  "Simulacion de consulta APS y CESFAM"),
    ("Sala de Maternidad y Ginecologia", "maternidad",        "Practica obstetrica, parto y ginecologia"),
    ("Bodega Central",                   "bodega",            "Almacenamiento y distribucion de insumos"),
]

CATEGORIAS = [
    "Proteccion Personal (EPP)",
    "Vendajes y Apositos",
    "Material de Sutura",
    "Instrumental de Diagnostico",
    "Cateterismo y Venoclisis",
    "Inyectologia",
    "Oxigenoterapia",
    "Gestion de Residuos",
    "Medicamentos de Emergencia",
    "Higiene y Antisepticos",
]

USUARIOS = [
    ("Administrador Hestia",   "admin@hestia.duoc.cl",        "Admin2024!",  RolUsuario.admin),
    ("Maria Gonzalez",         "mgonzalez@hestia.duoc.cl",    "Oper2024!",   RolUsuario.operador),
    ("Carlos Fuentes",         "cfuentes@hestia.duoc.cl",     "Oper2024!",   RolUsuario.operador),
    ("Ana Martinez",           "amartinez@hestia.duoc.cl",    "Visor2024!",  RolUsuario.visor),
    ("Luis Perez",             "lperez@hestia.duoc.cl",       "Visor2024!",  RolUsuario.visor),
    ("Cristian Moreno",        "c.moreno@hestia.duoc.cl",     "Doc2024!",    RolUsuario.docente),
    ("Patricia Vasquez",       "p.vasquez@hestia.duoc.cl",    "Doc2024!",    RolUsuario.docente),
    ("Roberto Ibanez",         "r.ibanez@hestia.duoc.cl",     "Doc2024!",    RolUsuario.docente),
    ("Sandra Reyes",           "s.reyes@hestia.duoc.cl",      "Doc2024!",    RolUsuario.docente),
    ("Miguel Tapia",           "m.tapia@hestia.duoc.cl",      "Doc2024!",    RolUsuario.docente),
]

# (nombre, descripcion, stock_actual, stock_minimo, sala_idx, cat_idx)
INSUMOS = [
    # --- EPP (cat 0) ---
    ("Guantes de latex talla S",            "Caja 100 unidades",           150,  50, 7, 0),
    ("Guantes de latex talla M",            "Caja 100 unidades",           220,  80, 7, 0),
    ("Guantes de latex talla L",            "Caja 100 unidades",            95,  50, 7, 0),
    ("Guantes nitrilo sin polvo talla M",   "Caja 100 unidades",           180, 100, 7, 0),
    ("Mascarillas quirurgicas",             "Caja 50 unidades",             15,  60, 0, 0),
    ("Mascarillas N95 FFP2",               "Unidad",                        3,  20, 3, 0),
    ("Gafas de proteccion",                "Unidad",                       45,  15, 4, 0),
    ("Pecheras desechables",               "Unidad",                       55,  25, 0, 0),
    ("Gorro quirurgico",                   "Bolsa 100 unidades",            8,  30, 2, 0),
    ("Polainas quirurgicas",               "Par",                          70,  20, 2, 0),
    ("Careta de proteccion facial",        "Unidad",                       12,   5, 4, 0),
    # --- Vendajes y Apositos (cat 1) ---
    ("Gasa esteril 10x10 cm",              "Sobre 5 unidades",            380, 100, 7, 1),
    ("Gasa no esteril 10x10 cm",           "Rollo",                       195,  80, 2, 1),
    ("Aposito adhesivo 10x8 cm",           "Unidad",                      140,  50, 2, 1),
    ("Venda de gasa 10cm x 5m",            "Rollo",                        75,  25, 2, 1),
    ("Venda elastica 10cm",                "Rollo",                        55,  20, 5, 1),
    ("Venda de yeso 15cm",                 "Unidad",                       18,   8, 2, 1),
    ("Esparadrapo 5cm x 5m",              "Rollo",                         32,  12, 5, 1),
    ("Algodon hidrofilo 500g",             "Rollo",                        14,   5, 7, 1),
    ("Aposito hidrocoloide 10x10 cm",      "Unidad",                       25,  10, 2, 1),
    ("Tela adhesiva 10cm x 5m",            "Rollo",                        20,   8, 5, 1),
    ("Parche ocular esteril",              "Unidad",                       30,  10, 5, 1),
    # --- Material de Sutura (cat 2) ---
    ("Seda 2-0 con aguja triangular",      "Sobre",                        28,  10, 2, 2),
    ("Nylon 3-0 con aguja",                "Sobre",                        22,  10, 2, 2),
    ("Poliglactina 2-0 Vicryl",            "Sobre",                        15,   8, 2, 2),
    ("Seda 0 con aguja",                   "Sobre",                        12,   5, 2, 2),
    ("Nylon 4-0 piel",                     "Sobre",                        10,   5, 2, 2),
    ("Pinza Adson con dientes",            "Unidad reutilizable",           8,   3, 2, 2),
    ("Tijera de Mayo recta",               "Unidad reutilizable",           5,   2, 2, 2),
    ("Porta aguja Hegar",                  "Unidad reutilizable",           6,   2, 2, 2),
    # --- Instrumental de Diagnostico (cat 3) ---
    ("Esfigmomanometro aneroide",          "Unidad",                       12,   4, 5, 3),
    ("Estetoscopio adulto",                "Unidad",                       18,   6, 5, 3),
    ("Termometro digital axilar",          "Unidad",                       22,   8, 5, 3),
    ("Oximetro de pulso digital",          "Unidad",                        8,   3, 5, 3),
    ("Otoscopio diagnostico",              "Unidad",                        4,   2, 4, 3),
    ("Martillo de reflejos neurologico",   "Unidad",                        6,   2, 4, 3),
    ("Glucometro portatil",                "Unidad",                        5,   2, 5, 3),
    ("Tiras reactivas glucometro x50",     "Caja",                          8,   4, 5, 3),
    ("Linterna diagnostica",               "Unidad",                       10,   3, 5, 3),
    ("Cinta metrica flexible",             "Unidad",                       15,   5, 5, 3),
    # --- Cateterismo y Venoclisis (cat 4) ---
    ("Cateter venoso periferico 18G",      "Unidad",                       35,  15, 3, 4),
    ("Cateter venoso periferico 20G",      "Unidad",                       48,  20, 3, 4),
    ("Cateter venoso periferico 22G",      "Unidad",                       28,  12, 3, 4),
    ("Equipo de venoclisis con camara",    "Unidad",                       22,  10, 3, 4),
    ("Llave de tres pasos",                "Unidad",                       15,   8, 3, 4),
    ("Bolsa colectora de orina 2000ml",    "Unidad",                       12,   5, 3, 4),
    ("Sonda Foley N14 con globo",          "Unidad",                        6,   4, 3, 4),
    ("Sonda Foley N16 con globo",          "Unidad",                        5,   3, 3, 4),
    ("Sonda nasogastrica N14",             "Unidad",                        5,   3, 3, 4),
    ("Jeringa 10ml con aguja 21G",         "Unidad",                       85,  30, 7, 4),
    ("Jeringa 20ml",                       "Unidad",                       42,  15, 7, 4),
    ("Torniquete venoso",                  "Unidad",                        8,   3, 3, 4),
    # --- Inyectologia (cat 5) ---
    ("Jeringa insulina 1ml",               "Unidad",                      160,  50, 5, 5),
    ("Aguja hipodermica 21G x 1.5",        "Unidad",                      210,  80, 7, 5),
    ("Aguja hipodermica 23G x 1",          "Unidad",                      185,  70, 7, 5),
    ("Aguja hipodermica 25G x 5/8",        "Unidad",                      125,  50, 5, 5),
    ("Lancetas descartables x100",         "Caja",                          8,   4, 5, 5),
    ("Contenedor cortopunzante 3L",        "Unidad",                        2,   8, 0, 5),
    ("Contenedor cortopunzante 3L APS",    "Unidad",                        1,   6, 5, 5),
    # --- Oxigenoterapia (cat 6) ---
    ("Mascarilla de oxigeno adulto",       "Unidad",                        8,   4, 3, 6),
    ("Mascarilla Venturi adulto",          "Unidad",                        4,   2, 3, 6),
    ("Canula nasal adulto",                "Unidad",                       14,   5, 3, 6),
    ("Canula nasal pediatrica",            "Unidad",                        6,   3, 3, 6),
    ("Bolsa autoinflable AMBU adulto",     "Unidad",                        3,   2, 3, 6),
    ("Bolsa autoinflable AMBU pediatrico", "Unidad",                        2,   2, 3, 6),
    ("Resucitador AMBU con mascarilla",    "Unidad",                        4,   2, 3, 6),
    # --- Gestion de Residuos (cat 7) ---
    ("Bolsa roja residuos peligrosos 60L", "Unidad",                        4,  12, 7, 7),
    ("Bolsa amarilla residuos especiales", "Unidad",                       14,   8, 7, 7),
    ("Caja carton cortopunzantes grande",  "Unidad",                        6,   4, 7, 7),
    ("Contenedor biohazard 30L",           "Unidad",                        3,   2, 7, 7),
    # --- Medicamentos de Emergencia (cat 8) ---
    ("Adrenalina 1mg/ml ampolla 1ml",      "Unidad",                        5,   3, 3, 8),
    ("Glucosa 50% ampolla 20ml",           "Unidad",                       10,   4, 3, 8),
    ("Suero fisiologico NaCl 0.9% 1L",    "Unidad",                        2,  10, 3, 8),
    ("Suero glucosado 5% 500ml",           "Unidad",                        6,   5, 3, 8),
    ("Solucion Ringer Lactato 1L",         "Unidad",                        5,   4, 3, 8),
    ("Suero fisiologico 0.9% 250ml",       "Unidad para lavado",            12,   6, 3, 8),
    ("Cloruro de sodio 20% ampolla",       "Unidad",                        8,   3, 3, 8),
    # --- Higiene y Antisepticos (cat 9) ---
    ("Alcohol isopropilico 70% 1000ml",    "Litro",                        12,   5, 7, 9),
    ("Clorhexidina gluconato 4% 500ml",    "Unidad",                        8,   4, 7, 9),
    ("Povidona yodada 10% 100ml",          "Frasco",                       10,   4, 7, 9),
    ("Jabon clinico antiseptico 500ml",    "Unidad",                       16,   6, 7, 9),
    ("Gel antibacterial 500ml Sim1",       "Unidad",                        3,  12, 0, 9),
    ("Gel antibacterial 500ml APS",        "Unidad",                        4,  10, 5, 9),
    ("Solucion glutaraldehido 2%",         "Litro",                         4,   2, 7, 9),
    ("Hipoclorito de sodio 5% 1L",         "Litro",                         8,   3, 7, 9),
    ("Gasas con clorhexidina CHG",         "Sobre",                        40,  15, 2, 9),
]

MOTIVOS_SALIDA = [
    "Practica clinica - Enfermeria",
    "Practica clinica - Medicina",
    "Practica simulacion alta fidelidad",
    "Uso en procedimiento de simulacion",
    "Practica de sutura y cierre de heridas",
    "Simulacro de urgencias vitales",
    "Practica de venopuncion",
    "Practica de sondaje vesical",
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

# ---------------------------------------------------------------------------
# Solicitudes de retiro de demo
# Cada entrada: (docente_idx, sala_idx, estado, horas_desde_ahora, notas, notas_op, items)
# horas_desde_ahora:  negativo = clase ya paso (historial)
#                     positivo = clase en el futuro (solicitud activa/urgente)
# items: lista de (insumo_idx, cantidad)
# ---------------------------------------------------------------------------
SOLICITUDES_DEMO = [
    # --- PENDIENTES (el operador las vera al llegar manana) ---
    (
        5, 0, EstadoSolicitud.pendiente, 18,
        "Clase de simulacion alta fidelidad, maniqui adulto",
        None,
        [(0, 2), (1, 2), (4, 1), (11, 5), (7, 3)],
    ),
    (
        6, 1, EstadoSolicitud.pendiente, 22,
        "Taller de venopuncion",
        None,
        [(1, 4), (40, 3), (41, 3), (49, 5), (53, 5)],
    ),
    (
        7, 2, EstadoSolicitud.pendiente, 26,
        "Practica de sutura, necesito hilo vicryl",
        None,
        [(22, 3), (23, 2), (24, 2), (27, 1), (28, 1)],
    ),
    (
        8, 5, EstadoSolicitud.pendiente, 30,
        None,
        None,
        [(31, 2), (32, 2), (33, 1), (34, 1), (36, 1)],
    ),
    (
        9, 3, EstadoSolicitud.pendiente, 14,
        "Urgencias simuladas, RCP avanzado",
        None,
        [(5, 2), (57, 2), (58, 1), (63, 2), (64, 3)],
    ),
    (
        5, 6, EstadoSolicitud.pendiente, 36,
        "Clase de maternidad",
        None,
        [(0, 2), (1, 2), (11, 4), (75, 2), (76, 2)],
    ),
    # --- EN PREPARACION (operador ya las tomo, esta armando los kits) ---
    (
        6, 0, EstadoSolicitud.en_preparacion, 8,
        "Necesito guantes talla M si es posible",
        "Preparando kit, stock de M bajo - enviare L",
        [(1, 3), (3, 2), (11, 5), (70, 1), (80, 1)],
    ),
    (
        7, 4, EstadoSolicitud.en_preparacion, 10,
        None,
        "Kit listo en bodega, sala 4",
        [(30, 2), (31, 1), (35, 1), (72, 2)],
    ),
    (
        8, 2, EstadoSolicitud.en_preparacion, 5,
        "Clase en menos de 6 horas, urgente",
        "Priorizando este pedido",
        [(22, 2), (23, 2), (11, 3), (6, 2)],
    ),
    # --- COMPLETADAS (historial de clases pasadas) ---
    (
        5, 0, EstadoSolicitud.completada, -48,
        "Simulacion alta fidelidad semana pasada",
        "Despachado sin novedades",
        [(0, 2), (1, 2), (11, 4), (12, 3)],
    ),
    (
        6, 1, EstadoSolicitud.completada, -72,
        None,
        "Todo OK",
        [(40, 2), (41, 3), (49, 4), (53, 3)],
    ),
    (
        7, 2, EstadoSolicitud.completada, -96,
        "Taller de sutura avanzada",
        "Despachado completo",
        [(22, 3), (23, 2), (24, 1), (27, 1)],
    ),
    (
        8, 5, EstadoSolicitud.completada, -120,
        None,
        "Sin novedades",
        [(31, 1), (32, 2), (33, 1)],
    ),
    (
        9, 3, EstadoSolicitud.completada, -144,
        "Clase urgencias criticas",
        "Kit urgencias despachado",
        [(5, 1), (57, 2), (63, 2), (64, 2)],
    ),
    (
        5, 6, EstadoSolicitud.completada, -168,
        None,
        "Despachado",
        [(0, 2), (1, 2), (11, 3)],
    ),
    (
        6, 0, EstadoSolicitud.completada, -192,
        "Simulacion con maniqui neonato",
        "Completo",
        [(1, 2), (3, 2), (11, 4)],
    ),
    (
        7, 4, EstadoSolicitud.completada, -216,
        None,
        "OK",
        [(30, 1), (35, 1), (72, 2)],
    ),
    (
        9, 1, EstadoSolicitud.completada, -240,
        "Taller introductorio venoclisis",
        "Despachado completo",
        [(40, 2), (41, 2), (44, 2), (49, 3)],
    ),
]


def fecha_aleatoria(dias_min: int, dias_max: int) -> datetime:
    ahora = datetime.now(timezone.utc)
    dias = random.randint(dias_min, dias_max)
    horas = random.randint(7, 18)
    mins = random.randint(0, 59)
    return ahora - timedelta(days=dias, hours=(24 - horas), minutes=mins)


def main() -> None:
    db = SessionLocal()
    try:
        print("\nHestia \u2014 Cargador de datos de demo")
        print("=" * 40)
        resp = input("Esto eliminara TODOS los datos existentes. Continuar? (s/N): ")
        if resp.strip().lower() != "s":
            print("Cancelado.")
            return

        # --- Limpiar en orden (FK constraints) ---
        print("\nLimpiando datos existentes...")
        db.query(AuditLog).delete()
        db.query(SolicitudItem).delete()
        db.query(SolicitudRetiro).delete()
        db.query(Movimiento).delete()
        db.query(Insumo).delete()
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
                nombre=nombre,
                email=email,
                password_hash=hashear_password(pwd),
                rol=rol,
            )
            db.add(u)
            usuarios.append(u)
        db.flush()
        operadores = [u for u in usuarios if u.rol == RolUsuario.operador]
        print(f"  {len(usuarios)} usuarios ({len([u for u in usuarios if u.rol == RolUsuario.docente])} docentes)")

        # --- Insumos ---
        print("Insertando insumos...")
        insumos_db = []
        for nombre, desc, stock, minimo, sala_idx, cat_idx in INSUMOS:
            i = Insumo(
                nombre=nombre,
                descripcion=desc,
                stock_actual=stock,
                stock_minimo=minimo,
                sala_id=salas[sala_idx].id,
                categoria_id=cats[cat_idx].id,
            )
            db.add(i)
            insumos_db.append(i)
        db.flush()
        print(f"  {len(insumos_db)} insumos")

        # --- Movimientos ---
        print("Insertando movimientos...")
        total_movs = 0
        for insumo in insumos_db:
            en_alerta = insumo.stock_actual <= insumo.stock_minimo
            if en_alerta:
                num_entradas, num_salidas = random.randint(1, 2), random.randint(5, 9)
                rango_entrada, rango_salida = (40, 60), (0, 25)
            else:
                num_entradas, num_salidas = random.randint(2, 4), random.randint(3, 7)
                rango_entrada, rango_salida = (3, 50), (0, 50)
            for _ in range(num_entradas):
                db.add(Movimiento(
                    tipo=TipoMovimiento.entrada,
                    cantidad=random.randint(30, 150),
                    motivo=random.choice(MOTIVOS_ENTRADA),
                    fecha=fecha_aleatoria(*rango_entrada),
                    insumo_id=insumo.id,
                    usuario_id=random.choice(operadores).id,
                ))
                total_movs += 1
            for _ in range(num_salidas):
                db.add(Movimiento(
                    tipo=TipoMovimiento.salida,
                    cantidad=random.randint(1, 8),
                    motivo=random.choice(MOTIVOS_SALIDA),
                    fecha=fecha_aleatoria(*rango_salida),
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

        for (doc_idx, sala_idx, estado, horas, notas, notas_op, items) in SOLICITUDES_DEMO:
            # Validar indices para no romper el seed si se cambia INSUMOS
            items_validos = [(i, c) for i, c in items if i < len(insumos_db)]
            if not items_validos:
                continue

            fecha_clase = ahora + timedelta(hours=horas)
            fecha_creacion = ahora - timedelta(hours=abs(horas) + random.randint(1, 6))
            fecha_completada = None
            if estado == EstadoSolicitud.completada:
                fecha_completada = fecha_clase + timedelta(hours=random.randint(1, 3))

            sol = SolicitudRetiro(
                docente_id=usuarios[doc_idx].id,
                sala_id=salas[sala_idx].id,
                fecha_clase=fecha_clase,
                estado=estado,
                notas=notas,
                notas_operador=notas_op,
                fecha_creacion=fecha_creacion,
                fecha_completada=fecha_completada,
            )
            db.add(sol)
            db.flush()

            for insumo_idx, cantidad in items_validos:
                db.add(SolicitudItem(
                    solicitud_id=sol.id,
                    insumo_id=insumos_db[insumo_idx].id,
                    cantidad_solicitada=cantidad,
                ))

            total_sols += 1

        db.commit()
        print(f"  {total_sols} solicitudes ({sum(1 for s in SOLICITUDES_DEMO if s[2] == EstadoSolicitud.pendiente)} pendientes, "
              f"{sum(1 for s in SOLICITUDES_DEMO if s[2] == EstadoSolicitud.en_preparacion)} en preparacion, "
              f"{sum(1 for s in SOLICITUDES_DEMO if s[2] == EstadoSolicitud.completada)} completadas)")

        # --- Resumen final ---
        alertas = sum(1 for _, _, stock, minimo, _, _ in INSUMOS if stock <= minimo)
        print("\n" + "=" * 40)
        print("Demo cargada exitosamente.")
        print(f"  Salas:        {len(salas)}")
        print(f"  Categorias:   {len(cats)}")
        print(f"  Usuarios:     {len(usuarios)}")
        print(f"  Insumos:      {len(insumos_db)} ({alertas} en alerta de stock)")
        print(f"  Movimientos:  {total_movs}")
        print(f"  Solicitudes:  {total_sols}")
        print("\nCredenciales:")
        for nombre, email, pwd, rol in USUARIOS:
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
