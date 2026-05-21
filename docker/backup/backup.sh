#!/bin/bash
# =============================================================================
# Hestia — Script de backup automático de PostgreSQL
#
# Genera un dump cifrado (AES-256-CBC + pbkdf2) y comprimido (gzip).
# Retención: 7 backups diarios + 4 backups semanales (cada lunes).
# Descifrar: openssl enc -d -aes-256-cbc -pbkdf2 -iter 100000 \
#             -pass pass:"<CLAVE>" -in archivo.sql.gz.enc | gunzip > dump.sql
# =============================================================================
set -euo pipefail

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/backups"
DB_HOST="${DB_HOST:-db}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${POSTGRES_DB:-hestia_db}"
DB_USER="${POSTGRES_USER:-postgres}"
KEEP_DAILY=7
KEEP_WEEKLY=4

mkdir -p "${BACKUP_DIR}/diarios" "${BACKUP_DIR}/semanales"

# ── Verificar clave de cifrado ─────────────────────────────────────────────────
if [ -z "${BACKUP_ENCRYPTION_KEY:-}" ]; then
    echo "[$(date)] ERROR: BACKUP_ENCRYPTION_KEY no esta definida. Abortando." >&2
    exit 1
fi

# ── Generar dump → comprimir → cifrar ──────────────────────────────────────
FILENAME="${DB_NAME}_${TIMESTAMP}.sql.gz.enc"
DAILY_PATH="${BACKUP_DIR}/diarios/${FILENAME}"

export PGPASSWORD="${POSTGRES_PASSWORD:-}"

pg_dump -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" "${DB_NAME}" \
    | gzip \
    | openssl enc -aes-256-cbc -pbkdf2 -iter 100000 \
        -pass pass:"${BACKUP_ENCRYPTION_KEY}" \
        -out "${DAILY_PATH}"

echo "[$(date)] Backup diario creado: ${DAILY_PATH}"

# ── Copia semanal (solo los lunes) ──────────────────────────────────────
DAY_OF_WEEK=$(date +%u)  # 1=lunes ... 7=domingo
if [ "${DAY_OF_WEEK}" = "1" ]; then
    WEEKLY_FILE="${BACKUP_DIR}/semanales/${DB_NAME}_semanal_${TIMESTAMP}.sql.gz.enc"
    cp "${DAILY_PATH}" "${WEEKLY_FILE}"
    echo "[$(date)] Backup semanal guardado: ${WEEKLY_FILE}"
    # Rotar semanales: mantener solo KEEP_WEEKLY
    ls -1t "${BACKUP_DIR}/semanales/"*.enc 2>/dev/null \
        | tail -n +$((KEEP_WEEKLY + 1)) | xargs -r rm -f
    echo "[$(date)] Rotacion semanal aplicada (max ${KEEP_WEEKLY} archivos)."
fi

# ── Rotar diarios ──────────────────────────────────────────────────────
ls -1t "${BACKUP_DIR}/diarios/"*.enc 2>/dev/null \
    | tail -n +$((KEEP_DAILY + 1)) | xargs -r rm -f
echo "[$(date)] Rotacion diaria aplicada (max ${KEEP_DAILY} archivos)."

echo "[$(date)] Proceso de backup finalizado."
