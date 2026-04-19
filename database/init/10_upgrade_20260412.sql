-- ============================================================
-- BuenaTierra - Upgrade 10 (2026-04-12)
-- Corrige restricción UNIQUE de lotes:
--   ANTES: (empresa_id, codigo_lote)         → bloquea mismo código entre productos distintos
--   DESPUÉS: (empresa_id, producto_id, codigo_lote) → permite mismo código si es producto diferente
-- ============================================================

BEGIN;

-- Eliminar constraint antigua
ALTER TABLE lotes DROP CONSTRAINT IF EXISTS lotes_empresa_id_codigo_lote_key;

-- Crear constraint correcta
ALTER TABLE lotes
    ADD CONSTRAINT lotes_empresa_id_producto_id_codigo_lote_key
    UNIQUE (empresa_id, producto_id, codigo_lote);

INSERT INTO schema_version (version, descripcion)
VALUES (7, 'Corrige UNIQUE lotes: (empresa_id, producto_id, codigo_lote)')
ON CONFLICT (version) DO NOTHING;

COMMIT;
