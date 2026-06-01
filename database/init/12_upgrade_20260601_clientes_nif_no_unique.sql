-- ============================================================
-- BuenaTierra - Upgrade 12 (2026-06-01)
-- Permitir NIF/CIF duplicado en clientes
-- ============================================================

BEGIN;

DO $$
DECLARE
    r record;
BEGIN
    -- Eliminar constraints UNIQUE sobre clientes que incluyan la columna nif.
    FOR r IN
        SELECT c.conname
        FROM pg_constraint c
        JOIN pg_attribute a
          ON a.attrelid = c.conrelid
         AND a.attnum = ANY (c.conkey)
        WHERE c.conrelid = 'clientes'::regclass
          AND c.contype = 'u'
        GROUP BY c.conname
        HAVING bool_or(a.attname = 'nif')
    LOOP
        EXECUTE format('ALTER TABLE clientes DROP CONSTRAINT IF EXISTS %I', r.conname);
    END LOOP;

    -- Eliminar índices UNIQUE independientes (no ligados a constraint)
    -- sobre clientes que incluyan la columna nif.
    FOR r IN
        SELECT i.relname AS idxname
        FROM pg_class t
        JOIN pg_index x ON x.indrelid = t.oid
        JOIN pg_class i ON i.oid = x.indexrelid
        JOIN pg_attribute a
          ON a.attrelid = t.oid
         AND a.attnum = ANY (x.indkey)
        LEFT JOIN pg_constraint c ON c.conindid = x.indexrelid
        WHERE t.relname = 'clientes'
          AND x.indisunique
          AND NOT x.indisprimary
          AND c.oid IS NULL
        GROUP BY i.relname
        HAVING bool_or(a.attname = 'nif')
    LOOP
        EXECUTE format('DROP INDEX IF EXISTS %I', r.idxname);
    END LOOP;
END $$;

-- Mantener índice no único para búsquedas habituales por empresa + NIF.
CREATE INDEX IF NOT EXISTS idx_clientes_empresa_nif ON clientes (empresa_id, nif);

INSERT INTO schema_version(version, descripcion)
VALUES (12, 'Permite NIF/CIF duplicado en clientes; elimina UNIQUE sobre clientes.nif')
ON CONFLICT (version) DO NOTHING;

COMMIT;
