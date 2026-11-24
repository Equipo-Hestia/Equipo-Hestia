"""Reglas de "Sala lista" (preparacion de taller) y cierre de ordenes de entrada."""
import threading

import pytest
from fastapi.testclient import TestClient

from conftest import unico


@pytest.fixture
def paquete_con_items(db, crear_usuario, crear_insumo):
    """Paquete de taller con 3 insumos: uno ya en sala, uno con stock y uno sin stock."""
    from app.models.paquete_insumo import PaqueteInsumo, PaqueteItem
    from app.models.sala import Sala
    from app.models.taller import Taller

    taller = Taller(nombre=unico("Taller prueba"), activo=True)
    sala = Sala(nombre=unico("Sala prueba"))
    db.add_all([taller, sala])
    db.flush()
    paquete = PaqueteInsumo(taller_id=taller.id, semestre="2026-2")
    db.add(paquete)
    db.flush()
    insumos = {
        "en_sala": crear_insumo(stock=10, nombre=unico("Guantes (ya en sala)")),
        "con_stock": crear_insumo(stock=10, nombre=unico("Gasas (retiro bodega)")),
        "sin_stock": crear_insumo(stock=2, nombre=unico("Jeringas (sin stock)")),
    }
    for insumo_id in insumos.values():
        db.add(PaqueteItem(paquete_id=paquete.id, insumo_id=insumo_id,
                           cantidad_requerida=5))
    db.commit()
    return paquete.id, sala.id, insumos


@pytest.mark.caso(
    "P05",
    "Confirmar \"Sala lista\" en Preparar taller: un ítem ya estaba en la sala, "
    "otro se retira de bodega y otro no tiene stock suficiente",
    "Solo se descuenta el ítem retirado de bodega (10 → 7); el que ya estaba en "
    "sala no cambia; el que no alcanza se informa como omitido y no se descuenta",
)
def test_sala_lista_solo_descuenta_retiros_de_bodega(
        client, db, headers_de, stock_de, paquete_con_items, record_property):
    from app.models.movimiento import Movimiento

    paquete_id, sala_id, ins = paquete_con_items
    h = headers_de("operador")

    r = client.post(
        f"/paquetes/{paquete_id}/confirmar-preparacion",
        json={"sala_id": sala_id, "faltantes": [
            {"insumo_id": ins["con_stock"], "cantidad": 3},
            {"insumo_id": ins["sin_stock"], "cantidad": 5},
        ]},
        headers=h,
    )
    assert r.status_code == 200, r.text
    cuerpo = r.json()

    assert stock_de(ins["en_sala"]) == 10
    assert stock_de(ins["con_stock"]) == 7
    assert stock_de(ins["sin_stock"]) == 2
    assert cuerpo["movimientos_generados"] == 1
    assert len(cuerpo["items_sin_stock"]) == 1
    assert "solicitado: 5, disponible: 2" in cuerpo["items_sin_stock"][0]

    db.expire_all()
    movs = db.query(Movimiento).filter(Movimiento.paquete_id == paquete_id).all()
    assert [(m.insumo_id, m.cantidad, m.subtipo.value, m.sala_id) for m in movs] == [
        (ins["con_stock"], 3, "consumo_taller", sala_id)
    ]
    record_property(
        "obtenido",
        "En sala: 10 → 10; retiro de bodega: 10 → 7 (1 movimiento consumo_taller); "
        f"sin stock: 2 → 2, informado: \"{cuerpo['items_sin_stock'][0]}\"",
    )


@pytest.mark.caso(
    "P06",
    "Cerrar una orden de entrada (compra) donde un producto llegó completo, "
    "otro llegó en cantidad 0 y otro nunca se registró",
    "Al producto recibido se le suman 10 unidades mediante un movimiento de "
    "compra; los ítems con 0 o sin recepción quedan \"cancelado\" y su stock no cambia",
)
def test_cerrar_orden_suma_recibido_y_cancela_items_en_cero(
        client, db, headers_de, crear_insumo, stock_de, record_property):
    from app.models.movimiento import Movimiento

    coord = headers_de("operador_coordinador")
    operador = headers_de("operador")
    recibido = crear_insumo(stock=4, nombre=unico("Suero (recibido)"))
    en_cero = crear_insumo(stock=4, nombre=unico("Alcohol (llegó 0)"))
    sin_recepcion = crear_insumo(stock=4, nombre=unico("Apósitos (sin recepción)"))

    r = client.post("/ordenes-entrada/", headers=coord, json={
        "tipo": "emergencia",
        "items": [
            {"tipo_item": "insumo", "insumo_id": recibido, "cantidad_pedida": 10},
            {"tipo_item": "insumo", "insumo_id": en_cero, "cantidad_pedida": 6},
            {"tipo_item": "insumo", "insumo_id": sin_recepcion, "cantidad_pedida": 3},
        ],
    })
    assert r.status_code == 201, r.text
    orden = r.json()
    item_de = {i["insumo_id"]: i["id"] for i in orden["items"]}

    assert client.post(f"/ordenes-entrada/{orden['id']}/confirmar",
                       headers=coord).status_code == 200
    for insumo_id, cant in ((recibido, 10), (en_cero, 0)):
        rr = client.patch(
            f"/ordenes-entrada/{orden['id']}/items/{item_de[insumo_id]}/recepcion",
            json={"cantidad_recibida": cant}, headers=operador,
        )
        assert rr.status_code == 200, rr.text
    stock_antes_de_cerrar = stock_de(recibido)

    rc = client.post(f"/ordenes-entrada/{orden['id']}/cerrar", headers=coord)
    assert rc.status_code == 200, rc.text
    cerrada = rc.json()
    estado_item = {i["insumo_id"]: i["estado"] for i in cerrada["items"]}

    assert cerrada["estado"] == "cerrada"
    assert stock_antes_de_cerrar == 4
    assert stock_de(recibido) == 14
    assert stock_de(en_cero) == 4
    assert stock_de(sin_recepcion) == 4
    assert estado_item == {recibido: "recibido", en_cero: "cancelado",
                           sin_recepcion: "cancelado"}

    db.expire_all()
    movs = db.query(Movimiento).filter(
        Movimiento.insumo_id.in_([recibido, en_cero, sin_recepcion])
    ).all()
    assert [(m.insumo_id, m.tipo.value, m.subtipo.value, m.cantidad) for m in movs] == [
        (recibido, "entrada", "compra", 10)
    ]
    assert f"Orden entrada #{orden['id']}" in movs[0].motivo
    record_property(
        "obtenido",
        "Orden cerrada. Recibido: 4 → 14 con 1 movimiento entrada/compra de 10 "
        "(el stock no cambió antes del cierre); llegó 0: cancelado, 4 → 4; "
        "sin recepción: cancelado, 4 → 4",
    )


# ---------------------------------------------------------------------------
# Concurrencia sobre ordenes de entrada (P13-P15)
# ---------------------------------------------------------------------------

RONDAS_CONCURRENCIA = 20


def _orden_recibida(client, coord, insumo_id: int, cantidad: int = 10) -> str:
    """Crea, confirma y registra la recepcion completa de una orden de un insumo."""
    orden = client.post("/ordenes-entrada/", headers=coord, json={
        "tipo": "semanal",
        "items": [{"tipo_item": "insumo", "insumo_id": insumo_id, "cantidad_pedida": cantidad}],
    }).json()
    base = f"/ordenes-entrada/{orden['id']}"
    assert client.post(f"{base}/confirmar", headers=coord).status_code == 200
    assert client.patch(f"{base}/items/{orden['items'][0]['id']}/recepcion",
                        json={"cantidad_recibida": cantidad}, headers=coord).status_code == 200
    return base


def _en_paralelo(app, acciones: dict) -> dict:
    """Ejecuta las acciones {nombre: funcion(cliente) -> status} al mismo tiempo."""
    barrera = threading.Barrier(len(acciones))
    codigos = {}
    candado = threading.Lock()

    def correr(nombre, accion):
        cliente = TestClient(app)
        barrera.wait()
        codigo = accion(cliente)
        with candado:
            codigos[nombre] = codigo

    hilos = [threading.Thread(target=correr, args=item) for item in acciones.items()]
    for t in hilos:
        t.start()
    for t in hilos:
        t.join(timeout=60)
    return codigos


@pytest.mark.caso(
    "P13",
    "Dos personas cierran la misma orden de entrada al mismo tiempo (por ejemplo, "
    "un doble clic en \"Cerrar y actualizar stock\"), repetido 20 veces",
    "Solo un cierre se acepta; el otro se rechaza. Queda un único movimiento de "
    "compra de 10 unidades y el stock sube exactamente 10",
)
def test_cierre_simultaneo_de_orden_registra_una_sola_compra(
        app, client, db, headers_de, crear_insumo, stock_de, record_property):
    from app.models.movimiento import Movimiento

    coord = headers_de("operador_coordinador")
    incorrectas = []
    for _ in range(RONDAS_CONCURRENCIA):
        insumo_id = crear_insumo(stock=4, nombre=unico("Mascarillas (cierre doble)"))
        base = _orden_recibida(client, coord, insumo_id)

        codigos = _en_paralelo(app, {
            f"cierre {n}": (lambda c: c.post(f"{base}/cerrar", headers=coord).status_code)
            for n in (1, 2)
        })

        db.expire_all()
        compras = db.query(Movimiento).filter(Movimiento.insumo_id == insumo_id).all()
        resultado = (sorted(codigos.values()), len(compras), stock_de(insumo_id))
        if resultado != ([200, 400], 1, 14):
            incorrectas.append(resultado)

    record_property(
        "obtenido",
        f"{RONDAS_CONCURRENCIA - len(incorrectas)} de {RONDAS_CONCURRENCIA} intentos "
        "correctos: un cierre aceptado (200) y el otro rechazado (400), 1 movimiento de "
        "compra de 10 y stock 4 → 14"
        + (f". Incorrectos: {incorrectas[:3]}" if incorrectas else ""),
    )
    assert not incorrectas, incorrectas


@pytest.mark.caso(
    "P14",
    "Mientras una persona cierra una orden de entrada (llegan 10 unidades), otra "
    "retira 5 unidades del mismo insumo en el mismo instante, repetido 20 veces",
    "Ambas operaciones se aceptan y ninguna se pierde: el stock pasa de 20 a 25 "
    "(20 + 10 − 5) en todos los intentos",
)
def test_cierre_de_orden_y_retiro_simultaneos_no_pierden_stock(
        app, client, headers_de, crear_insumo, stock_de, record_property):
    coord = headers_de("operador_coordinador")
    operador = headers_de("operador")
    incorrectas = []
    for _ in range(RONDAS_CONCURRENCIA):
        insumo_id = crear_insumo(stock=20, nombre=unico("Suero (cierre y retiro)"))
        base = _orden_recibida(client, coord, insumo_id)

        codigos = _en_paralelo(app, {
            "cierre": lambda c: c.post(f"{base}/cerrar", headers=coord).status_code,
            "retiro": lambda c: c.post("/movimientos/", headers=operador, json={
                "tipo": "salida", "subtipo": "consumo_taller", "cantidad": 5,
                "insumo_id": insumo_id}).status_code,
        })
        resultado = (codigos["cierre"], codigos["retiro"], stock_de(insumo_id))
        if resultado != (200, 200, 25):
            incorrectas.append(resultado)

    record_property(
        "obtenido",
        f"{RONDAS_CONCURRENCIA - len(incorrectas)} de {RONDAS_CONCURRENCIA} intentos "
        "correctos: cierre 200, retiro 200 y stock final 25"
        + (f". Incorrectos (cierre, retiro, stock): {incorrectas[:3]}" if incorrectas else ""),
    )
    assert not incorrectas, incorrectas


@pytest.mark.caso(
    "P15",
    "Una persona cierra una orden de entrada y otra la cancela en el mismo "
    "instante, repetido 20 veces",
    "Solo una de las dos acciones se acepta y el resultado es coherente: si quedó "
    "cerrada, el stock sumó lo recibido; si quedó cancelada, el stock no cambió",
)
def test_cierre_y_cancelacion_simultaneos_son_coherentes(
        app, client, headers_de, crear_insumo, stock_de, record_property):
    coord = headers_de("operador_coordinador")
    validos = {
        (200, 400, "cerrada", 30),
        (400, 200, "cancelada", 20),
    }
    vistos = {}
    incorrectas = []
    for _ in range(RONDAS_CONCURRENCIA):
        insumo_id = crear_insumo(stock=20, nombre=unico("Gasas (cerrar o cancelar)"))
        base = _orden_recibida(client, coord, insumo_id)

        codigos = _en_paralelo(app, {
            accion: (lambda c, a=accion: c.post(f"{base}/{a}", headers=coord).status_code)
            for accion in ("cerrar", "cancelar")
        })
        estado = client.get(base, headers=coord).json()["estado"]
        resultado = (codigos["cerrar"], codigos["cancelar"], estado, stock_de(insumo_id))
        vistos[resultado] = vistos.get(resultado, 0) + 1
        if resultado not in validos:
            incorrectas.append(resultado)

    detalle = "; ".join(
        f"{n}× cerrar {r[0]} / cancelar {r[1]} → {r[2]}, stock {r[3]}"
        for r, n in sorted(vistos.items(), key=lambda kv: -kv[1])
    )
    record_property(
        "obtenido",
        f"{RONDAS_CONCURRENCIA - len(incorrectas)} de {RONDAS_CONCURRENCIA} intentos "
        f"coherentes ({detalle})",
    )
    assert not incorrectas, incorrectas
