#!/bin/sh
# Genera un certificado SSL auto-firmado si no existe, luego inicia nginx.
# Esto permite que docker compose up funcione sin ejecutar generate-cert.sh primero.
# Para incluir la IP LAN real como SAN, ejecuta ./generate-cert.sh en el host
# y luego reinicia: docker compose restart nginx

set -e

CERT_DIR=/etc/nginx/certs
CERT="$CERT_DIR/hestia.crt"
KEY="$CERT_DIR/hestia.key"

if [ ! -f "$CERT" ] || [ ! -f "$KEY" ]; then
    echo "[nginx] Certificado no encontrado en $CERT_DIR — generando automaticamente..."
    mkdir -p "$CERT_DIR"
    openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
        -keyout "$KEY" \
        -out    "$CERT" \
        -subj "/C=CL/ST=RM/L=San Bernardo/O=DuocUC/CN=hestia.local" \
        2>/dev/null
    echo "[nginx] Certificado generado. Para incluir la IP LAN real como SAN,"
    echo "[nginx] ejecuta ./generate-cert.sh en el host y reinicia con:"
    echo "[nginx]   docker compose restart nginx"
fi

exec nginx -g 'daemon off;'
