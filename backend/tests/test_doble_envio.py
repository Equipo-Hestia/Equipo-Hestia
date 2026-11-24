"""Doble envio y concurrencia en acciones de un clic que cambian stock o estado.

Cada prueba de concurrencia repite la situacion varias veces (RONDAS) porque
una condicion de carrera no aparece en todos los intentos. Las que tienen
``xfail`` documentan defectos cuya correccion requiere otro tipo de cambio
(no hay una fila de estado que bloquear: haria falta un identificador de envio
o un registro de "ya procesado").
"""
from datetime import date, datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

from conftest import en_paralelo, unico

RONDAS = 10
RONDAS_LARGAS = 20


def _distribucion(resultados: list) -> str:
    conteo = {}
    for r in resultados:
        conteo[r] = conteo.get(r, 0) + 1
    return "; ".join(f"{n}× {r}" for r, n in sorted(conteo.items(), key=lambda kv: -kv[1]))


@pytest.fixture
def sala_y_taller(db):
    from app.models.sala import Sala
    from app.models.taller import Taller

    sala = Sala(nombre=unico("Sala prueba"))
    taller = Taller(nombre=unico("Taller prueba"), activo=True)
    db.add_all([sala, taller])
    db.commit()
    return sala.id, taller.id


@pytest.fixture
def paquete_con(db, sala_y_taller):
    """Crea un paquete de taller con un insumo y devuelve su id."""
    from app.models.paquete_insumo import PaqueteInsumo, PaqueteItem

    def _crear(insumo_id: int) -> int:
        paquete = PaqueteInsumo(taller_id=sala_y_taller[1], semestre="2026-2")
        db.add(paquete)
        db.flush()
        db.add(PaqueteItem(paquete_id=paquete.id, insumo_id=insumo_id, cantidad_requerida=3))
        db.commit()
        return paquete.id

    return _crear


# ---------------------------------------------------------------------------
# "Sala lista" (Preparar taller)
# ---------------------------------------------------------------------------

@pytest.mark.corregido(
    "Dos confirmaciones simultáneas de \"Sala lista\" registraban dos retiros pero "
    "descontaban el stock una sola vez: el insumo se cargaba antes del bloqueo y se "
    "usaba ese valor viejo. Corregido: el insumo se bloquea y se relee."
)
@pytest.mark.caso(
    "P16",
    "Dos operadoras confirman \"Sala lista\" del mismo taller exactamente al mismo "
    "tiempo (retiro de bodega de 3 unidades, stock 20), repetido 10 veces",
    "El stock siempre coincide con los retiros registrados: si quedan 2 retiros de 3, "
    "el stock baja a 14; nunca queda un retiro registrado sin descontar",
)
def test_sala_lista_simultanea_descuenta_cada_retiro(
        app, db, headers_de, crear_insumo, stock_de, paquete_con, sala_y_taller,
        record_property):
    from app.models.movimiento import Movimiento

    h = headers_de("operador")
    resultados, incorrectos = [], []
    for _ in range(RONDAS):
        insumo_id = crear_insumo(stock=20)
        url = f"/paquetes/{paquete_con(insumo_id)}/confirmar-preparacion"
        cuerpo = {"sala_id": sala_y_taller[0],
                  "faltantes": [{"insumo_id": insumo_id, "cantidad": 3}]}
        codigos = en_paralelo(app, {
            n: (lambda c: c.post(url, json=cuerpo, headers=h).status_code) for n in (1, 2)
        })
        db.expire_all()
        retiros = db.query(Movimiento).filter(Movimiento.insumo_id == insumo_id).all()
        stock = stock_de(insumo_id)
        resultado = (tuple(sorted(codigos.values())), len(retiros), stock)
        resultados.append(resultado)
        if stock != 20 - sum(m.cantidad for m in retiros):
            incorrectos.append(resultado)

    record_property(
        "obtenido",
        f"{RONDAS - len(incorrectos)} de {RONDAS} intentos con el stock igual a los retiros "
        f"registrados ({_distribucion([f'respuestas {r[0]}, {r[1]} retiros, stock {r[2]}' for r in resultados])})",
    )
    assert not incorrectos, incorrectos


@pytest.mark.grupo_defecto("habilitada")
@pytest.mark.caso(
    "P17",
    "La misma confirmación de \"Sala lista\" llega dos veces al servidor (por ejemplo, "
    "un reintento de red), una después de la otra",
    "El retiro de bodega se descuenta una sola vez (stock 20 → 17, 1 movimiento)",
)
@pytest.mark.xfail(
    strict=True,
    reason=(
        "DEFECTO: \"Sala lista\" (POST /paquetes/{id}/confirmar-preparacion) no guarda "
        "que la preparación ya se confirmó, así que una segunda petición con los mismos "
        "datos vuelve a descontar los retiros. El botón de la pantalla ya evita el doble "
        "clic, pero un reenvío (reintento de red, otra pestaña) descuenta dos veces. "
        "Corregirlo requiere registrar cada confirmación (por paquete, sala y fecha) o "
        "un identificador de envío; no basta con bloquear una fila."
    ),
)
def test_sala_lista_reenviada_descuenta_una_vez(
        client, headers_de, crear_insumo, stock_de, paquete_con, sala_y_taller,
        record_property):
    h = headers_de("operador")
    insumo_id = crear_insumo(stock=20)
    url = f"/paquetes/{paquete_con(insumo_id)}/confirmar-preparacion"
    cuerpo = {"sala_id": sala_y_taller[0], "faltantes": [{"insumo_id": insumo_id, "cantidad": 3}]}

    primera = client.post(url, json=cuerpo, headers=h).status_code
    segunda = client.post(url, json=cuerpo, headers=h).status_code
    stock = stock_de(insumo_id)
    record_property(
        "obtenido",
        f"Las dos confirmaciones se aceptan ({primera} y {segunda}) y el stock baja a "
        f"{stock}: el retiro se descontó dos veces",
    )
    assert stock == 17


# ---------------------------------------------------------------------------
# Revision de sala (Vista de Salas)
# ---------------------------------------------------------------------------

@pytest.fixture
def programacion(db, sala_y_taller):
    from app.models.programacion_taller import ProgramacionTaller

    def _crear() -> int:
        prog = ProgramacionTaller(taller_id=sala_y_taller[1], sala_id=sala_y_taller[0],
                                  fecha=date.today(), semestre="2026-2")
        db.add(prog)
        db.commit()
        return prog.id

    return _crear


@pytest.mark.corregido(
    "Dos \"Iniciar revisión\" simultáneos para la misma clase creaban dos revisiones "
    "de sala. Corregido: se bloquea la programación antes de verificar si ya existe."
)
@pytest.mark.caso(
    "P18",
    "Dos personas inician la revisión de la misma sala y clase al mismo tiempo, "
    "repetido 20 veces",
    "Se crea una sola revisión; las dos personas reciben la misma",
)
def test_iniciar_revision_simultanea_crea_una_sola(
        app, db, headers_de, programacion, record_property):
    from app.models.revision_sala import RevisionSala

    h = headers_de("operador")
    resultados, incorrectos = [], []
    for _ in range(RONDAS_LARGAS):
        prog_id = programacion()
        respuestas = en_paralelo(app, {
            n: (lambda c: (lambda r: (r.status_code, r.json().get("id")))(
                c.post("/revisiones/", json={"programacion_id": prog_id}, headers=h)))
            for n in (1, 2)
        })
        db.expire_all()
        cantidad = db.query(RevisionSala).filter(
            RevisionSala.programacion_id == prog_id).count()
        ids = {r[1] for r in respuestas.values()}
        resultados.append(cantidad)
        if cantidad != 1 or len(ids) != 1:
            incorrectos.append((sorted(respuestas.values()), cantidad))

    record_property(
        "obtenido",
        f"{RONDAS_LARGAS - len(incorrectos)} de {RONDAS_LARGAS} intentos con una sola "
        f"revisión ({_distribucion([f'{n} revisión(es)' for n in resultados])})",
    )
    assert not incorrectos, incorrectos


@pytest.mark.corregido(
    "Dos \"Marcar sala como revisada\" simultáneos se aceptaban ambos: la auditoría "
    "registraba dos cierres y la hora de cierre quedaba pisada. Corregido: se bloquea "
    "la revisión y el botón se desactiva mientras procesa."
)
@pytest.mark.caso(
    "P19",
    "Doble clic en \"Marcar sala como revisada\" (dos envíos al mismo tiempo), "
    "repetido 10 veces",
    "La revisión queda completada una sola vez: un solo registro de cierre en la "
    "auditoría",
)
def test_completar_revision_simultanea_registra_un_cierre(
        app, client, db, headers_de, programacion, record_property):
    from app.models.audit_log import AuditLog

    h = headers_de("operador")
    registros = []
    for _ in range(RONDAS):
        rev_id = client.post("/revisiones/", json={"programacion_id": programacion()},
                             headers=h).json()["id"]
        codigos = en_paralelo(app, {
            n: (lambda c: c.post(f"/revisiones/{rev_id}/completar", headers=h).status_code)
            for n in (1, 2)
        })
        assert sorted(codigos.values()) == [200, 200]
        db.expire_all()
        registros.append(db.query(AuditLog).filter(
            AuditLog.accion == "COMPLETAR_REVISION_SALA", AuditLog.entidad_id == rev_id,
        ).count())

    record_property(
        "obtenido",
        f"{registros.count(1)} de {RONDAS} intentos con un solo cierre en la auditoría "
        f"({_distribucion([f'{n} registro(s)' for n in registros])})",
    )
    assert registros == [1] * RONDAS, registros


# ---------------------------------------------------------------------------
# Retornos de implementos (API activa; pagina no habilitada)
# ---------------------------------------------------------------------------

@pytest.mark.corregido(
    "Dos \"retornado\" simultáneos sobre el mismo préstamo se aceptaban ambos (la "
    "validación de estado no estaba protegida). Corregido: se bloquea el retorno y se "
    "relee el insumo; el segundo recibe 409."
)
@pytest.mark.caso(
    "P20",
    "Dos personas marcan como \"retornado\" el mismo implemento prestado (2 unidades, "
    "stock 5) al mismo tiempo, repetido 10 veces",
    "Solo una marca se acepta (la otra recibe 409 \"ya fue marcado\") y el stock "
    "sube una sola vez: 5 → 7",
)
def test_marcar_retorno_simultaneo_se_acepta_una_vez(
        app, db, headers_de, crear_insumo, crear_usuario, stock_de, sala_y_taller,
        record_property):
    from app.models.retorno_implemento import RetornoImplemento

    h = headers_de("operador")
    docente = crear_usuario("visor")
    resultados, incorrectos = [], []
    for _ in range(RONDAS):
        insumo_id = crear_insumo(stock=5, tipo="implemento")
        retorno = RetornoImplemento(insumo_id=insumo_id, cantidad=2, docente_id=docente.id,
                                    sala_id=sala_y_taller[0],
                                    fecha_retiro=datetime.now(timezone.utc))
        db.add(retorno)
        db.commit()
        retorno_id = retorno.id
        codigos = en_paralelo(app, {
            n: (lambda c: c.put(f"/retornos/{retorno_id}/marcar", json={"estado": "retornado"},
                                headers=h).status_code)
            for n in (1, 2)
        })
        resultado = (tuple(sorted(codigos.values())), stock_de(insumo_id))
        resultados.append(resultado)
        if resultado != ((200, 409), 7):
            incorrectos.append(resultado)

    record_property(
        "obtenido",
        f"{RONDAS - len(incorrectos)} de {RONDAS} intentos correctos "
        f"({_distribucion([f'respuestas {r[0]}, stock {r[1]}' for r in resultados])})",
    )
    assert not incorrectos, incorrectos


# ---------------------------------------------------------------------------
# Entrega directa y solicitudes (API activa; paginas no habilitadas)
# ---------------------------------------------------------------------------

@pytest.mark.grupo_defecto("no_habilitada")
@pytest.mark.caso(
    "P21",
    "La misma entrega directa a un docente (3 unidades, stock 10) llega dos veces "
    "al servidor",
    "La entrega se descuenta una sola vez (stock 10 → 7)",
)
@pytest.mark.xfail(
    strict=True,
    reason=(
        "DEFECTO: la entrega directa (POST /movimientos/entrega-directa) no tiene un "
        "estado ni un identificador de envío, así que un reenvío descuenta el stock dos "
        "veces y registra dos préstamos. La página que la usa no está habilitada en la "
        "interfaz. Corregirlo requiere un identificador de envío (idempotencia)."
    ),
)
def test_entrega_directa_reenviada_descuenta_una_vez(
        client, headers_de, crear_insumo, crear_usuario, stock_de, sala_y_taller,
        record_property):
    h = headers_de("operador")
    docente = crear_usuario("visor")
    insumo_id = crear_insumo(stock=10)
    cuerpo = {"sala_id": sala_y_taller[0], "docente_id": docente.id,
              "items": [{"insumo_id": insumo_id, "cantidad": 3}]}

    codigos = [client.post("/movimientos/entrega-directa", json=cuerpo, headers=h).status_code
               for _ in range(2)]
    stock = stock_de(insumo_id)
    record_property(
        "obtenido",
        f"Las dos entregas se aceptan ({codigos[0]} y {codigos[1]}) y el stock baja a {stock}",
    )
    assert stock == 7


@pytest.mark.grupo_defecto("habilitada")
@pytest.mark.caso(
    "P22",
    "La misma orden de \"Generar unidades en lote\" (3 unidades de un implemento) "
    "llega dos veces al servidor",
    "Se crean 3 unidades físicas, no 6",
)
@pytest.mark.xfail(
    strict=True,
    reason=(
        "DEFECTO: \"Generar unidades en lote\" (POST /unidades-implemento/generar-lote) "
        "crea las unidades cada vez que recibe la petición. El botón ya evita el doble "
        "clic, pero un reenvío crea el lote dos veces. Corregirlo requiere un "
        "identificador de envío o generar solo las unidades que faltan para cuadrar con "
        "el stock."
    ),
)
def test_generar_lote_reenviado_crea_una_vez(
        client, db, headers_de, crear_insumo, record_property):
    from app.models.unidad_implemento import UnidadImplemento

    h = headers_de("operador")
    insumo_id = crear_insumo(stock=3, tipo="implemento")
    cuerpo = {"implemento_id": insumo_id, "cantidad": 3}

    codigos = [client.post("/unidades-implemento/generar-lote", json=cuerpo,
                           headers=h).status_code for _ in range(2)]
    db.expire_all()
    unidades = db.query(UnidadImplemento).filter(
        UnidadImplemento.implemento_id == insumo_id).count()
    record_property(
        "obtenido",
        f"Las dos peticiones se aceptan ({codigos[0]} y {codigos[1]}) y quedan "
        f"{unidades} unidades",
    )
    assert unidades == 3


@pytest.mark.grupo_defecto("no_habilitada")
@pytest.mark.caso(
    "P23",
    "Una operadora completa una solicitud de retiro (2 unidades, stock 10)",
    "La solicitud queda completada (200) y el stock baja a 8",
)
@pytest.mark.xfail(
    strict=True,
    reason=(
        "DEFECTO: completar una solicitud (POST /solicitudes/{id}/completar) falla "
        "SIEMPRE con error 500: crea el movimiento de salida sin \"subtipo\" y la base de "
        "datos lo exige. No es un problema de concurrencia; el módulo de solicitudes no "
        "está habilitado en la interfaz. Corregirlo requiere decidir el subtipo "
        "(consumo de taller o préstamo de implemento, como en la entrega directa)."
    ),
)
def test_completar_solicitud_descuenta_stock(
        app, headers_de, crear_insumo, stock_de, sala_y_taller, record_property):
    h = headers_de("operador")
    cliente = TestClient(app, raise_server_exceptions=False)
    insumo_id = crear_insumo(stock=10)
    solicitud = cliente.post("/solicitudes/", headers=h, json={
        "sala_id": sala_y_taller[0],
        "fecha_clase": (datetime.now(timezone.utc) + timedelta(days=1)).isoformat(),
        "items": [{"insumo_id": insumo_id, "cantidad_solicitada": 2}],
    })
    assert solicitud.status_code == 201, solicitud.text

    r = cliente.post(f"/solicitudes/{solicitud.json()['id']}/completar", json={}, headers=h)
    stock = stock_de(insumo_id)
    record_property(
        "obtenido",
        f"Error {r.status_code} al completar; el stock sigue en {stock}",
    )
    assert r.status_code == 200 and stock == 8


# ---------------------------------------------------------------------------
# Ordenes de mantenimiento
# ---------------------------------------------------------------------------

@pytest.fixture
def phantoma(db):
    from app.models.activo_fijo import ActivoFijo, TipoActivo

    def _crear() -> int:
        af = ActivoFijo(nombre=unico("Fantoma prueba"), tipo=TipoActivo.phantoma, activo=True)
        db.add(af)
        db.commit()
        return af.id

    return _crear


@pytest.mark.corregido(
    "Dos cierres simultáneos de una orden de mantenimiento podían aceptarse ambos y "
    "duplicar el registro en la auditoría. Corregido: se bloquea la orden."
)
@pytest.mark.caso(
    "P24",
    "Dos personas cierran la misma orden de mantenimiento al mismo tiempo, "
    "repetido 20 veces",
    "Solo un cierre se acepta (el otro recibe 409 \"ya está cerrada\") y queda un "
    "solo registro de cierre en la auditoría",
)
def test_cerrar_mantenimiento_simultaneo_se_acepta_una_vez(
        app, client, db, headers_de, phantoma, record_property):
    from app.models.audit_log import AuditLog

    h = headers_de("operador")
    resultados, incorrectos = [], []
    for _ in range(RONDAS_LARGAS):
        orden = client.post("/ordenes-mantenimiento/", headers=h, json={
            "activo_ids": [phantoma()], "fecha_visita": str(date.today())}).json()
        orden_id = orden["id"]
        assert client.patch(f"/ordenes-mantenimiento/items/{orden['items'][0]['id']}",
                            json={"resultado": "ok"}, headers=h).status_code == 200
        codigos = en_paralelo(app, {
            n: (lambda c: c.post(f"/ordenes-mantenimiento/{orden_id}/cerrar",
                                 headers=h).status_code)
            for n in (1, 2)
        })
        db.expire_all()
        cierres = db.query(AuditLog).filter(
            AuditLog.accion == "CERRAR_ORDEN_MANTENIMIENTO", AuditLog.entidad_id == orden_id,
        ).count()
        resultado = (tuple(sorted(codigos.values())), cierres)
        resultados.append(resultado)
        if resultado != ((200, 409), 1):
            incorrectos.append(resultado)

    record_property(
        "obtenido",
        f"{RONDAS_LARGAS - len(incorrectos)} de {RONDAS_LARGAS} intentos correctos "
        f"({_distribucion([f'respuestas {r[0]}, {r[1]} cierre(s) auditado(s)' for r in resultados])})",
    )
    assert not incorrectos, incorrectos


@pytest.mark.corregido(
    "Dos órdenes de mantenimiento creadas al mismo tiempo para el mismo Phantoma se "
    "aceptaban ambas (el Phantoma quedaba en dos visitas). Corregido: se bloquean los "
    "Phantomas antes de validar su estado."
)
@pytest.mark.caso(
    "P25",
    "Dos personas abren al mismo tiempo una orden de mantenimiento para el mismo "
    "Phantoma, repetido 10 veces",
    "Solo una orden se crea; la otra recibe 409 \"ya tiene una orden de mantenimiento "
    "activa\"",
)
def test_crear_mantenimiento_simultaneo_mismo_phantoma(
        app, db, headers_de, phantoma, record_property):
    from app.models.orden_mantenimiento import OrdenMantenimientoItem

    h = headers_de("operador")
    resultados, incorrectos = [], []
    for _ in range(RONDAS):
        af_id = phantoma()
        cuerpo = {"activo_ids": [af_id], "fecha_visita": str(date.today())}
        codigos = en_paralelo(app, {
            n: (lambda c: c.post("/ordenes-mantenimiento/", json=cuerpo,
                                 headers=h).status_code)
            for n in (1, 2)
        })
        db.expire_all()
        ordenes = db.query(OrdenMantenimientoItem).filter(
            OrdenMantenimientoItem.activo_fijo_id == af_id).count()
        resultado = (tuple(sorted(codigos.values())), ordenes)
        resultados.append(resultado)
        if resultado != ((201, 409), 1):
            incorrectos.append(resultado)

    record_property(
        "obtenido",
        f"{RONDAS - len(incorrectos)} de {RONDAS} intentos correctos "
        f"({_distribucion([f'respuestas {r[0]}, {r[1]} orden(es)' for r in resultados])})",
    )
    assert not incorrectos, incorrectos
