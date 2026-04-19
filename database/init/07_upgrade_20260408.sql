-- ============================================================
-- BuenaTierra - Upgrade 07 (2026-04-08)
-- Per-user email config + IMAP inbox support
-- ============================================================

BEGIN;

-- 1) Columna configuración por usuario (SMTP/IMAP personal en JSON)
ALTER TABLE usuarios
    ADD COLUMN IF NOT EXISTS configuracion TEXT;

-- 2) Columnas nuevas en correos_mensajes para mensajes recibidos (IMAP)
ALTER TABLE correos_mensajes
    ADD COLUMN IF NOT EXISTS de VARCHAR(1000);

ALTER TABLE correos_mensajes
    ADD COLUMN IF NOT EXISTS adjunto_datos BYTEA;

ALTER TABLE correos_mensajes
    ADD COLUMN IF NOT EXISTS adjunto_content_type VARCHAR(100);

ALTER TABLE correos_mensajes
    ADD COLUMN IF NOT EXISTS uid_imap BIGINT;

-- 3) Índice único para deduplicación IMAP por empresa+usuario+uid
CREATE UNIQUE INDEX IF NOT EXISTS idx_correos_uid_imap
    ON correos_mensajes(empresa_id, usuario_id, uid_imap)
    WHERE uid_imap IS NOT NULL;

INSERT INTO schema_version(version, descripcion)
VALUES (4, 'Per-user email config + IMAP inbox support')
ON CONFLICT (version) DO NOTHING;

COMMIT;
