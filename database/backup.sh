#!/bin/bash
# ============================================================
# BuenaTierra — Script de backup PostgreSQL
# Uso: ejecutar dentro del contenedor db o desde docker exec
#   docker exec buenatierra_db /backups/backup.sh
#
# Cron recomendado (añadir al host con crontab -e):
#   0 3 * * * docker exec buenatierra_db /backups/backup.sh >> /var/log/buenatierra_backup.log 2>&1
# ============================================================

set -euo pipefail

# ── Configuración ──────────────────────────────────────────

BACKUP_DIR="/backups"
DB_NAME="${POSTGRES_DB:-buenatierra}"
DB_USER="${POSTGRES_USER:-buenatierra_admin}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/${DB_NAME}_${TIMESTAMP}.sql.gz"
RETENTION_DAYS=30

# ── Crear directorio si no existe ──────────────────────────

mkdir -p "${BACKUP_DIR}"

# ── Ejecutar pg_dump ───────────────────────────────────────

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Iniciando backup de '${DB_NAME}'..."

pg_dump -U "${DB_USER}" -d "${DB_NAME}" \
    --no-owner --no-privileges --clean --if-exists \
    | gzip > "${BACKUP_FILE}"

FILESIZE=$(du -h "${BACKUP_FILE}" | cut -f1)
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Backup completado: ${BACKUP_FILE} (${FILESIZE})"

# ── Limpieza de backups antiguos ───────────────────────────

DELETED=$(find "${BACKUP_DIR}" -name "*.sql.gz" -mtime +${RETENTION_DAYS} -print -delete | wc -l)
if [ "${DELETED}" -gt 0 ]; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] Eliminados ${DELETED} backups con más de ${RETENTION_DAYS} días"
fi

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Backup finalizado correctamente"
