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

if [ -z "${BACKUP_ENCRYPTION_KEY:-}" ]; then
    echo "[$(date)] ADVERTENCIA: BACKUP_ENCRYPTION_KEY no esta definida;" \
        "el respaldo nocturno fallara." >&2
fi

echo "[$(date)] Entorno de backup guardado en ${ENV_FILE}. Iniciando crond."
exec "$@"
