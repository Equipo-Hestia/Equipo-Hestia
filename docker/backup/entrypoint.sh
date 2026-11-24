#!/bin/bash
# =============================================================================
# Hestia — Entrypoint del contenedor de backup
#
# BusyBox crond ejecuta los trabajos con un entorno minimo: no hereda las
# variables del contenedor (POSTGRES_*, DB_HOST, BACKUP_ENCRYPTION_KEY, TZ).
# Este script las guarda en /etc/backup.env (solo legible por root) y
# backup.sh las carga al inicio. Luego deja crond en primer plano.
# =============================================================================
set -euo pipefail

ENV_FILE="/etc/backup.env"
VARS="POSTGRES_DB POSTGRES_USER POSTGRES_PASSWORD DB_HOST DB_PORT BACKUP_ENCRYPTION_KEY TZ"

umask 077
: > "${ENV_FILE}"
for var in ${VARS}; do
    if [ -n "${!var+x}" ]; then
        printf 'export %s=%q\n' "${var}" "${!var}" >> "${ENV_FILE}"
    fi
done
chmod 600 "${ENV_FILE}"

# Advertencias sobre la clave (nunca se imprime su valor).
# Valores de ejemplo conocidos: el antiguo default del compose y el de
# backend/.env.example.
CLAVES_DE_EJEMPLO="cambia-esta-clave-en-produccion cambia-esta-clave-por-una-segura-antes-de-produccion"
if [ -z "${BACKUP_ENCRYPTION_KEY:-}" ]; then
    echo "[$(date)] ADVERTENCIA: BACKUP_ENCRYPTION_KEY no esta definida en backend/.env." \
        "Los respaldos se abortaran hasta configurarla." >&2
else
    for ejemplo in ${CLAVES_DE_EJEMPLO}; do
        if [ "${BACKUP_ENCRYPTION_KEY}" = "${ejemplo}" ]; then
            echo "[$(date)] ADVERTENCIA: BACKUP_ENCRYPTION_KEY es un valor de ejemplo" \
                "publico. Cambiala en backend/.env por una clave segura" \
                "(python -c \"import secrets; print(secrets.token_hex(32))\")." >&2
        fi
    done
fi

echo "[$(date)] Entorno de backup guardado en ${ENV_FILE}. Iniciando ${1:-}."
exec "$@"
