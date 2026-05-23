"""
Utilidad de envio de email para Hestia.

Si SMTP_HOST no esta configurado, el envio se omite y se loguea el contenido
en consola. Esto permite usar la recuperacion de contrasena en entornos LAN
sin servidor SMTP simplemente leyendo los logs del contenedor api.

Variables de entorno:
  SMTP_HOST     - Servidor SMTP (vacio = modo solo-log)
  SMTP_PORT     - Puerto (default 587 para STARTTLS)
  SMTP_USER     - Usuario de autenticacion
  SMTP_PASSWORD - Contrasena de autenticacion
  SMTP_FROM     - Remitente (default noreply@hestia.local)
  SMTP_TLS      - "true" usa SMTP_SSL (puerto 465), "false" usa STARTTLS
"""

import os
import logging
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

_log = logging.getLogger("hestia.email")

SMTP_HOST = os.getenv("SMTP_HOST", "")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER = os.getenv("SMTP_USER", "")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")
SMTP_FROM = os.getenv("SMTP_FROM", "noreply@hestia.local")
SMTP_TLS = os.getenv("SMTP_TLS", "true").lower() == "true"


def enviar_email(destinatario: str, asunto: str, cuerpo_html: str) -> None:
    """Envia un email HTML. Si SMTP_HOST esta vacio, solo loguea y retorna."""
    if not SMTP_HOST:
        _log.warning(
            "SMTP_HOST no configurado — email no enviado a %s | Asunto: %s",
            destinatario, asunto,
        )
        return

    msg = MIMEMultipart("alternative")
    msg["Subject"] = asunto
    msg["From"] = SMTP_FROM
    msg["To"] = destinatario
    msg.attach(MIMEText(cuerpo_html, "html", "utf-8"))

    try:
        if SMTP_TLS:
            server = smtplib.SMTP_SSL(SMTP_HOST, SMTP_PORT)
        else:
            server = smtplib.SMTP(SMTP_HOST, SMTP_PORT)
            server.ehlo()
            if SMTP_USER:
                server.starttls()
        if SMTP_USER:
            server.login(SMTP_USER, SMTP_PASSWORD)
        server.sendmail(SMTP_FROM, [destinatario], msg.as_string())
        server.quit()
        _log.info("Email enviado a %s", destinatario)
    except Exception as exc:
        _log.error("Error enviando email a %s: %s", destinatario, exc)
        raise
