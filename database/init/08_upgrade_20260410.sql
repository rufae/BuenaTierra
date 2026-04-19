-- ============================================================
-- BuenaTierra - Upgrade 08 (2026-04-10)
-- Cambio formato código de lote: DDMMYYYY → DDMMYY
-- ============================================================

BEGIN;

-- Actualizar función de generación de lotes para usar formato DDMMYY
CREATE OR REPLACE FUNCTION generar_lote_produccion(
    p_empresa_id   INTEGER,
    p_producto_id  INTEGER,
    p_produccion_id INTEGER
) RETURNS INTEGER AS $$
DECLARE
    v_produccion   producciones%ROWTYPE;
    v_cantidad_neta NUMERIC(12,3);
    v_codigo_lote  VARCHAR(50);
    v_lote_id      INTEGER;
    v_seq          INTEGER;
BEGIN
    SELECT * INTO v_produccion FROM producciones WHERE id = p_produccion_id;

    IF NOT FOUND OR v_produccion.estado != 'Finalizada' THEN
        RAISE EXCEPTION 'Producción % no encontrada o no finalizada', p_produccion_id;
    END IF;

    v_cantidad_neta := v_produccion.cantidad_producida - COALESCE(v_produccion.cantidad_merma, 0);

    -- Generar código de lote: DDMMYY-PRODUCTOID-SEQ (año 2 dígitos)
    SELECT COALESCE(MAX(id), 0) + 1 INTO v_seq FROM lotes
    WHERE empresa_id = p_empresa_id AND producto_id = p_producto_id
      AND fecha_fabricacion = v_produccion.fecha_produccion;

    v_codigo_lote := TO_CHAR(v_produccion.fecha_produccion, 'DDMMYY') || '-' ||
                     p_producto_id::TEXT || '-' || LPAD(v_seq::TEXT, 3, '0');

    INSERT INTO lotes(empresa_id, producto_id, produccion_id, codigo_lote,
                      fecha_fabricacion, fecha_caducidad, cantidad_inicial)
    SELECT p_empresa_id, p_producto_id, p_produccion_id, v_codigo_lote,
           v_produccion.fecha_produccion,
           CASE WHEN pr.vida_util_dias IS NOT NULL
                THEN v_produccion.fecha_produccion + pr.vida_util_dias
                ELSE NULL END,
           v_cantidad_neta
    FROM productos pr WHERE pr.id = p_producto_id
    RETURNING id INTO v_lote_id;

    INSERT INTO stock(empresa_id, producto_id, lote_id, cantidad_disponible, cantidad_reservada)
    VALUES (p_empresa_id, p_producto_id, v_lote_id, v_cantidad_neta, 0)
    ON CONFLICT (empresa_id, producto_id, lote_id)
    DO UPDATE SET cantidad_disponible = stock.cantidad_disponible + EXCLUDED.cantidad_disponible;

    RETURN v_lote_id;
END;
$$ LANGUAGE plpgsql;

INSERT INTO schema_version(version, descripcion)
VALUES (5, 'Formato código lote DDMMYYYY → DDMMYY')
ON CONFLICT (version) DO NOTHING;

COMMIT;
