"""Permisos por rol (docs/FLUJOS_USUARIO.md)."""
import pytest


@pytest.mark.caso(
    "P07",
    "Un usuario con rol Visor (solo lectura) intenta registrar un movimiento de stock",
    "El sistema lo rechaza con error 403 (sin permiso) y el stock no cambia; "
    "sí puede ver el listado de movimientos",
)
def test_visor_no_puede_registrar_movimientos(client, headers_de, crear_insumo, stock_de,
                                              record_property):
    h = headers_de("visor")
    insumo_id = crear_insumo(stock=10)

    salida = client.post("/movimientos/", headers=h, json={
        "tipo": "salida", "subtipo": "consumo_taller", "cantidad": 1, "insumo_id": insumo_id})
    entrada = client.post("/movimientos/", headers=h, json={
        "tipo": "entrada", "subtipo": "compra", "cantidad": 1, "insumo_id": insumo_id})
    lectura = client.get("/movimientos/", headers=h)

    assert salida.status_code == 403, salida.text
    assert entrada.status_code == 403, entrada.text
    assert stock_de(insumo_id) == 10
    assert lectura.status_code == 200
    record_property(
        "obtenido",
        f"Salida: {salida.status_code}; entrada: {entrada.status_code}; stock sigue en 10; "
        f"listado de movimientos: {lectura.status_code}",
    )


@pytest.mark.caso(
    "P08",
    "Un usuario con rol Operador intenta entrar a la gestión de usuarios "
    "(ver la lista o crear un usuario)",
    "El sistema rechaza ambas acciones con error 403 (sin permiso); "
    "un Administrador sí puede ver la lista",
)
def test_operador_no_accede_a_gestion_de_usuarios(client, headers_de, record_property):
    h = headers_de("operador")

    listar = client.get("/usuarios/", headers=h)
    crear = client.post("/usuarios/", headers=h, json={
        "nombre": "Intruso", "email": "intruso@prueba.hestia.cl",
        "password": "Intruso#2026", "rol": "admin"})
    admin = client.get("/usuarios/", headers=headers_de("admin"))

    assert listar.status_code == 403, listar.text
    assert crear.status_code == 403, crear.text
    assert admin.status_code == 200
    record_property(
        "obtenido",
        f"Operador: listar {listar.status_code}, crear {crear.status_code}; "
        f"administrador: listar {admin.status_code}",
    )
