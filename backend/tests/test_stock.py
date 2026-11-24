"""Reglas de stock: movimientos de entrada/salida, estados y concurrencia."""
import csv
import io
import threading

import pytest
from fastapi.testclient import TestClient

from conftest import unico


def _salida(insumo_id: int, cantidad: int) -> dict:
    return {"tipo": "salida", "subtipo": "consumo_taller",
            "cantidad": cantidad, "insumo_id": insumo_id, "motivo": "prueba"}


def _entrada(insumo_id: int, cantidad: int) -> dict:
    return {"tipo": "entrada", "subtipo": "compra",
            "cantidad": cantidad, "insumo_id": insumo_id, "motivo": "prueba"}


@pytest.mark.caso(
    "P01",
    "Retirar de bodega más unidades de las que hay disponibles",
    "El sistema rechaza el retiro (error 400) y el stock no cambia",
)
def test_salida_mayor_que_stock_se_rechaza(client, headers_de, crear_insumo, stock_de,
                                           record_property):
    h = headers_de("operador")
    insumo_id = crear_insumo(stock=5, minimo=1)

    r = client.post("/movimientos/", json=_salida(insumo_id, 6), headers=h)

    assert r.status_code == 400, r.text
    assert "Stock insuficiente" in r.json()["detail"]
    assert stock_de(insumo_id) == 5
    record_property(
        "obtenido",
        f"Rechazado con {r.status_code} (\"{r.json()['detail']}\"); "
        f"stock sigue en {stock_de(insumo_id)}",
    )


@pytest.mark.caso(
    "P02",
    "Registrar una entrada (compra) y luego una salida (consumo) de un insumo",
    "Stock 10 → +5 = 15 → −3 = 12, y quedan registrados los 2 movimientos",
)
def test_entrada_y_salida_actualizan_stock(client, headers_de, crear_insumo, stock_de,
                                           record_property):
    h = headers_de("operador")
    insumo_id = crear_insumo(stock=10, minimo=2)

    r1 = client.post("/movimientos/", json=_entrada(insumo_id, 5), headers=h)
    assert r1.status_code == 200, r1.text
    despues_entrada = stock_de(insumo_id)
    r2 = client.post("/movimientos/", json=_salida(insumo_id, 3), headers=h)
    assert r2.status_code == 200, r2.text
    final = stock_de(insumo_id)

    hist = client.get(f"/movimientos/insumo/{insumo_id}", headers=h).json()
    assert despues_entrada == 15
    assert final == 12
    assert hist["total"] == 2
    assert {(m["tipo"], m["cantidad"]) for m in hist["data"]} == {("entrada", 5), ("salida", 3)}
    record_property(
        "obtenido",
        f"Stock 10 → {despues_entrada} → {final}; {hist['total']} movimientos registrados",
    )


@pytest.mark.caso(
    "P03",
    "Clasificación del estado de cada insumo según su stock y su stock mínimo",
    "Stock 0 = \"agotado\"; stock igual o menor al mínimo = \"bajo stock\"; "
    "stock sobre el mínimo = \"ok\". Las alertas y el panel cuentan lo mismo",
)
def test_estados_agotado_bajo_stock_ok(client, headers_de, crear_insumo, record_property):
    h = headers_de("operador")
    antes = client.get("/resumen/", headers=h).json()
    prefijo = unico("Estado")
    casos = {
        "agotado": crear_insumo(stock=0, minimo=5, nombre=f"{prefijo} A agotado"),
        "igual_minimo": crear_insumo(stock=5, minimo=5, nombre=f"{prefijo} B igual"),
        "bajo_minimo": crear_insumo(stock=3, minimo=5, nombre=f"{prefijo} C bajo"),
        "ok": crear_insumo(stock=6, minimo=5, nombre=f"{prefijo} D ok"),
    }

    r = client.get("/insumos/exportar", params={"formato": "csv", "nombre": prefijo},
                   headers=h)
    assert r.status_code == 200, r.text
    filas = list(csv.DictReader(io.StringIO(r.content.decode("utf-8-sig"))))
    estado = {f["Nombre"].split()[-1]: f["Estado"] for f in filas}
    assert estado == {"agotado": "agotado", "igual": "bajo_stock",
                      "bajo": "bajo_stock", "ok": "ok"}

    alertas = {a["id"] for a in client.get("/insumos/alertas", headers=h).json()}
    assert {casos["agotado"], casos["igual_minimo"], casos["bajo_minimo"]} <= alertas
    assert casos["ok"] not in alertas

    despues = client.get("/resumen/", headers=h).json()
    assert despues["insumos_agotados"] - antes["insumos_agotados"] == 1
    assert despues["insumos_bajo_stock"] - antes["insumos_bajo_stock"] == 3
    record_property(
        "obtenido",
        "0/5 → agotado; 5/5 → bajo_stock; 3/5 → bajo_stock; 6/5 → ok. "
        "Alertas: los 3 primeros, no el \"ok\". Panel: +1 agotado, +3 bajo stock",
    )


@pytest.mark.caso(
    "P04",
    "Dos operadoras retiran el mismo insumo exactamente al mismo tiempo "
    "(2 retiros de 7 con stock 10, repetido 10 veces)",
    "En cada intento solo se acepta un retiro; el otro se rechaza por stock "
    "insuficiente y el stock queda en 3, nunca negativo",
)
def test_salidas_simultaneas_no_dejan_stock_negativo(app, headers_de, crear_insumo,
                                                     stock_de, record_property):
    h = headers_de("operador")
    rondas = 10
    resumen = []
    for _ in range(rondas):
        insumo_id = crear_insumo(stock=10, minimo=0)
        barrera = threading.Barrier(2)
        codigos = []
        candado = threading.Lock()

        def retirar():
            cliente = TestClient(app)
            barrera.wait()
            r = cliente.post("/movimientos/", json=_salida(insumo_id, 7), headers=h)
            with candado:
                codigos.append(r.status_code)

        hilos = [threading.Thread(target=retirar) for _ in range(2)]
        for t in hilos:
            t.start()
        for t in hilos:
            t.join(timeout=60)

        assert sorted(codigos) == [200, 400], codigos
        assert stock_de(insumo_id) == 3
        resumen.append(stock_de(insumo_id))

    record_property(
        "obtenido",
        f"{rondas}/{rondas} intentos: un retiro aceptado (200) y uno rechazado (400); "
        f"stock final 3 en todos (mínimo observado: {min(resumen)})",
    )
