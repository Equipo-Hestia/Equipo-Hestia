"""Respuesta de la API cuando PostgreSQL no está disponible (por ejemplo, arrancando)."""
import os

import pytest
from fastapi.testclient import TestClient

MENSAJE_503 = "La base de datos se está iniciando, intenta en unos segundos."


@pytest.fixture
def db_que_falla(app):
    """Reemplaza get_db por una sesión que falla como se indique; restaura al final."""
    from app.database import get_db

    def _usar(sesion_factory):
        def _get_db():
            sesion = sesion_factory()
            try:
                yield sesion
            finally:
                sesion.close()
        app.dependency_overrides[get_db] = _get_db

    yield _usar
    app.dependency_overrides.pop(get_db, None)


@pytest.mark.corregido(
    "Mientras PostgreSQL arrancaba (por ejemplo, tras una caída), la API respondía "
    "500 con un error interno (\"the database system is starting up\"). Corregido: "
    "si la base no está disponible, responde 503 con un mensaje claro y la "
    "cabecera Retry-After."
)
@pytest.mark.caso(
    "P30",
    "La API recibe peticiones mientras PostgreSQL no acepta conexiones: arrancando "
    "tras una caída (\"the database system is starting up\") o con el puerto cerrado",
    "Responde 503 con el mensaje \"La base de datos se está iniciando, intenta en unos "
    "segundos.\" y la cabecera Retry-After, no un error 500",
)
def test_bd_no_disponible_responde_503(app, headers_de, db_que_falla, record_property):
    import psycopg2
    from sqlalchemy import create_engine
    from sqlalchemy.engine import make_url
    from sqlalchemy.exc import OperationalError
    from sqlalchemy.orm import sessionmaker

    h = headers_de("operador")
    cliente = TestClient(app, raise_server_exceptions=False)

    # 1) PostgreSQL arrancando: el error exacto que psycopg2 entrega en ese momento.
    class SesionArrancando:
        def __getattr__(self, _nombre):
            raise OperationalError(
                "SELECT 1", {},
                psycopg2.OperationalError(
                    'connection to server at "db", port 5432 failed: '
                    "FATAL:  the database system is starting up"
                ),
            )

        def close(self):
            pass

    db_que_falla(SesionArrancando)
    arrancando = cliente.get("/insumos/", headers=h)

    # 2) Conexión rechazada de verdad: mismo servidor, puerto donde nadie escucha.
    url = make_url(os.environ["DATABASE_URL"]).set(port=1)
    motor = create_engine(url, connect_args={"connect_timeout": 3})
    db_que_falla(sessionmaker(bind=motor))
    rechazada = cliente.get("/insumos/", headers=h)
    motor.dispose()

    for r in (arrancando, rechazada):
        assert r.status_code == 503, r.text
        assert r.json() == {"detail": MENSAJE_503}
        assert r.headers.get("Retry-After") == "5"
    record_property(
        "obtenido",
        f"PostgreSQL arrancando: {arrancando.status_code}; conexión rechazada: "
        f"{rechazada.status_code}; ambas con \"{arrancando.json()['detail']}\" y "
        f"Retry-After {arrancando.headers.get('Retry-After')}",
    )


@pytest.mark.caso(
    "P31",
    "Un error de base de datos que no es de disponibilidad (una consulta cancelada por "
    "tiempo máximo) mientras PostgreSQL funciona normalmente",
    "No se informa como \"base de datos iniciándose\": sigue siendo un error 500",
)
def test_otros_errores_de_bd_no_se_informan_como_503(
    app, headers_de, db_que_falla, record_property
):
    from sqlalchemy import text

    from app.database import SessionLocal

    h = headers_de("operador")
    cliente = TestClient(app, raise_server_exceptions=False)

    def sesion_con_timeout():
        sesion = SessionLocal()
        sesion.execute(text("SET statement_timeout = 1"))
        sesion.execute(text("SELECT pg_sleep(0.5)"))  # QueryCanceled (57014)
        return sesion

    db_que_falla(sesion_con_timeout)
    r = cliente.get("/insumos/", headers=h)

    assert r.status_code == 500, r.text
    record_property(
        "obtenido",
        f"Consulta cancelada por statement_timeout: {r.status_code} (no 503)",
    )
