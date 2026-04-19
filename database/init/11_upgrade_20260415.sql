-- ============================================================
-- BuenaTierra - Upgrade 11 (2026-04-15)
-- Vida útil configurable por unidad: Dias / Meses
-- ============================================================

BEGIN;

ALTER TABLE productos
    ADD COLUMN IF NOT EXISTS vida_util_unidad VARCHAR(10);

UPDATE productos
SET vida_util_unidad = 'Dias'
WHERE vida_util_unidad IS NULL OR btrim(vida_util_unidad) = '';

ALTER TABLE productos
    ALTER COLUMN vida_util_unidad SET DEFAULT 'Dias';

ALTER TABLE productos
    ALTER COLUMN vida_util_unidad SET NOT NULL;

ALTER TABLE productos
    DROP CONSTRAINT IF EXISTS ck_productos_vida_util_unidad;

ALTER TABLE productos
    ADD CONSTRAINT ck_productos_vida_util_unidad
    CHECK (vida_util_unidad IN ('Dias','Meses'));

INSERT INTO schema_version(version, descripcion)
VALUES (8, 'Vida util configurable por dias o meses en productos')
ON CONFLICT (version) DO NOTHING;

COMMIT;
