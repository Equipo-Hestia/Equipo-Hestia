#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Genera un certificado SSL auto-firmado para Hestia en entornos LAN.
#
# El certificado incluye la IP local detectada como Subject Alternative Name
# (SAN), lo que es necesario para que los navegadores modernos lo acepten.
# Valido por 365 dias.
#
# Uso:
#   chmod +x generate-cert.sh
#   ./generate-cert.sh
#
# Luego: docker compose up --build
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

CERT_DIR="$(cd "$(dirname "$0")" && pwd)/docker/nginx/certs"
mkdir -p "$CERT_DIR"

# Detectar IP local (primera interfaz no-loopback)
LOCAL_IP=$(hostname -I 2>/dev/null | awk '{print $1}')
if [ -z "$LOCAL_IP" ]; then
    LOCAL_IP="127.0.0.1"
fi

echo "-> Generando certificado SSL auto-firmado para Hestia"
echo "   IP local detectada : $LOCAL_IP"
echo "   Destino            : $CERT_DIR"
echo ""

# Archivo de configuracion temporal para extensiones v3
TMPCONF=$(mktemp /tmp/hestia-ssl-XXXXX.conf)
trap 'rm -f "$TMPCONF"' EXIT

cat > "$TMPCONF" <<EOF
[req]
distinguished_name = req_dn
x509_extensions    = v3_req
prompt             = no

[req_dn]
C  = CL
ST = Region Metropolitana
L  = San Bernardo
O  = DuocUC
OU = Escuela de Salud
CN = hestia.local

[v3_req]
subjectAltName   = IP:${LOCAL_IP},IP:127.0.0.1,DNS:localhost,DNS:hestia.local
keyUsage         = digitalSignature, keyEncipherment
extendedKeyUsage = serverAuth
EOF

openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
    -keyout "$CERT_DIR/hestia.key" \
    -out    "$CERT_DIR/hestia.crt" \
    -config "$TMPCONF"

chmod 600 "$CERT_DIR/hestia.key"
chmod 644 "$CERT_DIR/hestia.crt"

echo ""
echo "Certificado generado exitosamente:"
echo "  $CERT_DIR/hestia.crt  <- compartir con clientes"
echo "  $CERT_DIR/hestia.key  <- mantener privada (no commitear)"
echo ""
echo "Para eliminar la advertencia del navegador, importa hestia.crt:"
echo "  Linux/Chrome : chrome://settings/certificates > Autoridades > Importar"
echo "  Windows      : certmgr.msc > Raices de confianza > Importar"
echo "  macOS        : Keychain Access > Importar > marcar como 'Siempre confiar'"
echo ""
echo "Siguiente paso: docker compose up --build"
