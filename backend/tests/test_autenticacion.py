"""Inicio de sesion con 2FA obligatorio, JWT y generacion del QR."""
import base64
import io
import json
import os
import uuid
from datetime import datetime, timedelta, timezone

import jwt
import pyotp
import pytest
from PIL import Image


def _codigo_incorrecto(secreto: str) -> str:
    """Un codigo de 6 digitos que no es valido en la ventana actual (+-30 s)."""
    totp = pyotp.TOTP(secreto)
    validos = {totp.at(datetime.now(timezone.utc) + timedelta(seconds=s))
               for s in (-30, 0, 30)}
    codigo = 0
    while f"{codigo:06d}" in validos:
        codigo += 1
    return f"{codigo:06d}"


@pytest.mark.caso(
    "P09",
    "Iniciar sesión con la contraseña correcta pero un código de Google "
    "Authenticator (2FA) incorrecto o vacío",
    "El sistema no entrega acceso: código incorrecto → 403, código vacío → 422, "
    "y el token intermedio no sirve para entrar (401)",
)
def test_login_sin_totp_valido_se_rechaza(client, crear_usuario, record_property):
    u = crear_usuario("operador")
    r = client.post("/auth/login", data={"username": u.email, "password": u.password})
    assert r.status_code == 200, r.text
    assert r.json()["requires_2fa"] is True
    assert r.json().get("access_token") is None
    pre = r.json()["pre_token"]

    malo = client.post("/auth/2fa/completar-login",
                       json={"pre_token": pre, "codigo": _codigo_incorrecto(u.totp_secret)})
    vacio = client.post("/auth/2fa/completar-login", json={"pre_token": pre})
    con_pre = client.get("/usuarios/me", headers={"Authorization": f"Bearer {pre}"})

    assert malo.status_code == 403, malo.text
    assert "access_token" not in malo.text
    assert vacio.status_code == 422
    assert con_pre.status_code == 401
    record_property(
        "obtenido",
        f"Código incorrecto: {malo.status_code} (\"{malo.json()['detail']}\"), sin token; "
        f"código vacío: {vacio.status_code}; token intermedio usado para entrar: "
        f"{con_pre.status_code}",
    )


@pytest.mark.caso(
    "P10",
    "Iniciar sesión correctamente (contraseña + código 2FA) y luego usar un "
    "token vencido o modificado",
    "El login entrega un token (JWT) válido que permite entrar; un token "
    "vencido, alterado o firmado con otra clave se rechaza (401)",
)
def test_login_entrega_jwt_valido_y_rechaza_expirado_o_alterado(
        client, crear_usuario, login, record_property):
    u = crear_usuario("operador_coordinador")
    token = login(u)
    clave = os.environ["SECRET_KEY"]

    payload = jwt.decode(token, clave, algorithms=["HS256"])
    assert payload["sub"] == str(u.id)
    assert payload["rol"] == "operador_coordinador"
    assert payload["exp"] > datetime.now(timezone.utc).timestamp()
    assert payload.get("jti")
    me = client.get("/usuarios/me", headers={"Authorization": f"Bearer {token}"})
    assert me.status_code == 200 and me.json()["email"] == u.email

    vencido = jwt.encode(
        {"sub": str(u.id), "rol": "operador_coordinador", "jti": str(uuid.uuid4()),
         "exp": datetime.now(timezone.utc) - timedelta(minutes=1)},
        clave, algorithm="HS256")
    cab, carga, firma = token.split(".")
    carga_admin = base64.urlsafe_b64encode(
        json.dumps({**payload, "rol": "admin"}, separators=(",", ":")).encode()
    ).rstrip(b"=").decode()
    alterado = f"{cab}.{carga_admin}.{firma}"
    otra_clave = jwt.encode({**payload}, "otra-clave-" + "x" * 32, algorithm="HS256")

    resultados = {}
    for nombre, t in (("vencido", vencido), ("alterado", alterado),
                      ("otra clave", otra_clave)):
        resultados[nombre] = client.get(
            "/usuarios/me", headers={"Authorization": f"Bearer {t}"}).status_code
    assert resultados == {"vencido": 401, "alterado": 401, "otra clave": 401}
    record_property(
        "obtenido",
        f"Token válido: /usuarios/me {me.status_code} (sub, rol, exp y jti correctos); "
        + "; ".join(f"{k}: {v}" for k, v in resultados.items()),
    )


@pytest.mark.caso(
    "P11",
    "Configurar el doble factor (2FA) de un usuario nuevo: el sistema muestra "
    "el código QR para escanear con Google Authenticator",
    "Se genera una imagen PNG válida con el QR y una clave; con un código "
    "generado desde esa clave se activa el 2FA y se entregan 10 códigos de recuperación",
)
def test_generacion_qr_2fa(client, crear_usuario, login, record_property):
    nuevo = crear_usuario("operador", con_2fa=False)
    r = client.post("/auth/login", data={"username": nuevo.email, "password": nuevo.password})
    assert r.status_code == 200 and r.json()["requires_2fa_setup"] is True
    setup_token = r.json()["pre_token"]

    s = client.post("/auth/2fa/setup-inicial", json={"setup_token": setup_token})
    assert s.status_code == 200, s.text
    qr = s.json()["qr_code"]
    assert qr.startswith("data:image/png;base64,")
    imagen = Image.open(io.BytesIO(base64.b64decode(qr.split(",", 1)[1])))
    imagen.load()
    assert imagen.format == "PNG" and min(imagen.size) >= 100
    secreto = s.json()["secret"]

    a = client.post("/auth/2fa/activar-inicial",
                    json={"setup_token": setup_token, "codigo": pyotp.TOTP(secreto).now()})
    assert a.status_code == 200, a.text
    assert a.json()["access_token"] and len(a.json()["recovery_codes"]) == 10

    # Variante autenticada: /auth/2fa/setup para un usuario que ya tiene sesion.
    con_sesion = crear_usuario("admin")
    s2 = client.post("/auth/2fa/setup",
                     headers={"Authorization": f"Bearer {login(con_sesion)}"})
    assert s2.status_code == 200
    img2 = Image.open(io.BytesIO(base64.b64decode(s2.json()["qr_code"].split(",", 1)[1])))
    assert img2.format == "PNG"
    record_property(
        "obtenido",
        f"QR PNG de {imagen.size[0]}×{imagen.size[1]} px; activación con la clave "
        f"del QR: {a.status_code}, 10 códigos de recuperación; "
        f"/auth/2fa/setup con sesión: {s2.status_code}, PNG válido",
    )
