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


@pytest.mark.caso(
    "P27",
    "Escribir un stock negativo o vacío directamente en la base de datos, saltándose "
    "la API (como lo haría un error de programación o un script)",
    "La base de datos rechaza ambos cambios (restricciones ck_insumos_stock_actual_"
    "no_negativo y NOT NULL) y el stock no cambia",
)
def test_base_rechaza_stock_negativo_aunque_se_salte_la_api(
    db, crear_insumo, stock_de, record_property
):
    from sqlalchemy import text
    from sqlalchemy.exc import IntegrityError

    insumo_id = crear_insumo(stock=5)
    sql = text("UPDATE insumos SET stock_actual = :valor WHERE id = :id")

    with pytest.raises(IntegrityError) as negativo:
        db.execute(sql, {"valor": -1, "id": insumo_id})
        db.commit()
    db.rollback()
    with pytest.raises(IntegrityError) as vacio:
        db.execute(sql, {"valor": None, "id": insumo_id})
        db.commit()
    db.rollback()

    assert "ck_insumos_stock_actual_no_negativo" in str(negativo.value.orig)
    assert "stock_actual" in str(vacio.value.orig)
    assert stock_de(insumo_id) == 5
    record_property(
        "obtenido",
        f"Stock −1: rechazado ({type(negativo.value.orig).__name__}, restricción "
        f"ck_insumos_stock_actual_no_negativo); stock vacío: rechazado "
        f"({type(vacio.value.orig).__name__}); el stock sigue en {stock_de(insumo_id)}",
    )


def _campos_con_error(r) -> set:
    return {e["loc"][-1] for e in r.json()["detail"]}


@pytest.mark.caso(
    "P28",
    "Crear y editar un insumo con stock actual o stock mínimo negativo (y editar con el "
    "stock actual vacío) a través de la API",
    "Cada petición se rechaza con 422 indicando el campo inválido; el insumo no se crea "
    "y el existente no cambia",
)
@pytest.mark.corregido(
    "Crear o editar un insumo (POST y PUT /insumos) aceptaba un stock actual o mínimo "
    "negativo sin validarlo y lo guardaba tal cual. Corregido: los datos del insumo "
    "exigen valores ≥ 0 (y el stock actual no puede quedar vacío), y la base de datos "
    "agrega una restricción como segunda protección (P27)."
)
def test_api_rechaza_stock_negativo_al_crear_y_editar(
    client, db, headers_de, crear_insumo, stock_de, record_property
):
    from app.models.insumo import Insumo

    h = headers_de("operador")
    nombre = unico("Insumo negativo")
    creaciones = {
        "stock_actual": {"nombre": nombre, "stock_actual": -1, "stock_minimo": 0},
        "stock_minimo": {"nombre": nombre, "stock_actual": 1, "stock_minimo": -1},
    }
    for campo, cuerpo in creaciones.items():
        r = client.post("/insumos/", json=cuerpo, headers=h)
        assert r.status_code == 422, r.text
        assert _campos_con_error(r) == {campo}, r.text
    db.expire_all()
    creados = db.query(Insumo).filter(Insumo.nombre == nombre).count()
    assert creados == 0

    insumo_id = crear_insumo(stock=5, minimo=2)
    ediciones = [
        ("stock_actual", {"stock_actual": -3}),
        ("stock_minimo", {"stock_minimo": -1}),
        ("stock_actual", {"stock_actual": None}),
    ]
    for campo, cuerpo in ediciones:
        r = client.put(f"/insumos/{insumo_id}", json=cuerpo, headers=h)
        assert r.status_code == 422, r.text
        assert _campos_con_error(r) == {campo}, r.text
    db.expire_all()
    insumo = db.get(Insumo, insumo_id)
    assert (insumo.stock_actual, insumo.stock_minimo) == (5, 2)
    assert stock_de(insumo_id) == 5

    ejemplo = client.put(f"/insumos/{insumo_id}", json={"stock_actual": -3}, headers=h)
    record_property(
        "obtenido",
        f"POST con stock actual −1 y con mínimo −1: 422 y 422, {creados} insumos creados; "
        f"PUT con stock −3, mínimo −1 y stock vacío: 422 en los tres, el insumo sigue en "
        f"stock {insumo.stock_actual} / mínimo {insumo.stock_minimo}. Mensaje: "
        f"\"{ejemplo.json()['detail'][0]['msg']}\" en el campo stock_actual",
    )
