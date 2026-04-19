-- ============================================================
-- BuenaTierra - Upgrade 09 (2026-04-12)
-- Reserva de stock al confirmar pedidos
-- ============================================================

BEGIN;

-- Columna que almacena la asignación FIFO de lotes al confirmar el pedido
-- Formato JSON: [{"loteId":1,"codigoLote":"120426-5-001","cantidad":3.0}, ...]
-- NULL mientras el pedido está en estado Pendiente
ALTER TABLE pedidos_lineas
    ADD COLUMN IF NOT EXISTS reserva_lotes_json TEXT;

INSERT INTO schema_version(version, descripcion)
VALUES (6, 'Reserva de stock al confirmar pedidos (reserva_lotes_json en pedidos_lineas)')
ON CONFLICT (version) DO NOTHING;

COMMIT;
