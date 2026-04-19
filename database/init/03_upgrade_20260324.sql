-- Upgrade incremental para instalaciones existentes de cliente
-- Fecha: 2026-03-24
-- Objetivo: alinear enums string y funciones criticas con el dominio actual.

BEGIN;

-- 1) Normalizar estado legacy de produccion
UPDATE producciones
SET estado = 'EnProceso'
WHERE estado = 'EnCurso';

-- 2) Reforzar CHECK de producciones.estado (idempotente)
DO $$
DECLARE
    v_exists BOOLEAN;
BEGIN
    SELECT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_class t ON t.oid = c.conrelid
        WHERE t.relname = 'producciones'
          AND c.conname = 'ck_producciones_estado'
    ) INTO v_exists;

    IF v_exists THEN
        ALTER TABLE producciones DROP CONSTRAINT ck_producciones_estado;
    END IF;

    ALTER TABLE producciones
        ADD CONSTRAINT ck_producciones_estado
        CHECK (estado IN ('Planificada','EnProceso','Finalizada','Cancelada'));
END $$;

-- 3) Reforzar CHECK de facturas.estado (incluye Enviada)
DO $$
DECLARE
    v_exists BOOLEAN;
BEGIN
    SELECT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_class t ON t.oid = c.conrelid
        WHERE t.relname = 'facturas'
          AND c.conname = 'ck_facturas_estado'
    ) INTO v_exists;

    IF v_exists THEN
        ALTER TABLE facturas DROP CONSTRAINT ck_facturas_estado;
    END IF;

    ALTER TABLE facturas
        ADD CONSTRAINT ck_facturas_estado
        CHECK (estado IN ('Borrador','Emitida','Enviada','Cobrada','Anulada'));
END $$;

-- 4) Reemplazar funcion entrada_stock_produccion con validacion correcta de estado
CREATE OR REPLACE FUNCTION entrada_stock_produccion(
    p_empresa_id     INTEGER,
    p_producto_id    INTEGER,
    p_produccion_id  INTEGER,
    p_usuario_id     INTEGER DEFAULT NULL
) RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_produccion   producciones%ROWTYPE;
    v_lote_id      INTEGER;
    v_codigo_lote  VARCHAR(50);
    v_cantidad_neta NUMERIC;
    v_seq          INTEGER;
BEGIN
    SELECT * INTO v_produccion FROM producciones WHERE id = p_produccion_id;

    IF NOT FOUND OR v_produccion.estado != 'Finalizada' THEN
        RAISE EXCEPTION 'Produccion % no encontrada o no finalizada', p_produccion_id;
    END IF;

    v_cantidad_neta := v_produccion.cantidad_producida - COALESCE(v_produccion.cantidad_merma, 0);

    SELECT COALESCE(MAX(id), 0) + 1 INTO v_seq FROM lotes
    WHERE empresa_id = p_empresa_id AND producto_id = p_producto_id
      AND fecha_fabricacion = v_produccion.fecha_produccion;

    v_codigo_lote := TO_CHAR(v_produccion.fecha_produccion, 'DDMMYYYY') || '-' ||
                     p_producto_id::TEXT || '-' || LPAD(v_seq::TEXT, 3, '0');

    INSERT INTO lotes(empresa_id, producto_id, produccion_id, codigo_lote,
                      fecha_fabricacion, fecha_caducidad, cantidad_inicial)
    SELECT p_empresa_id, p_producto_id, p_produccion_id, v_codigo_lote,
           v_produccion.fecha_produccion,
           CASE WHEN pr.vida_util_dias IS NOT NULL
                THEN CASE
                    WHEN COALESCE(pr.vida_util_unidad, 'Dias') ILIKE 'Mes%'
                        THEN (v_produccion.fecha_produccion + (pr.vida_util_dias || ' months')::interval)::date
                    ELSE v_produccion.fecha_produccion + pr.vida_util_dias
                END
                ELSE NULL END,
           v_cantidad_neta
    FROM productos pr WHERE pr.id = p_producto_id
    RETURNING id INTO v_lote_id;

    INSERT INTO stock(empresa_id, producto_id, lote_id, cantidad_disponible)
    VALUES (p_empresa_id, p_producto_id, v_lote_id, v_cantidad_neta)
    ON CONFLICT (empresa_id, producto_id, lote_id)
    DO UPDATE SET cantidad_disponible = stock.cantidad_disponible + v_cantidad_neta,
                  updated_at = NOW();

    INSERT INTO movimientos_stock(empresa_id, producto_id, lote_id, tipo, cantidad,
                                   cantidad_antes, cantidad_despues, referencia_tipo,
                                   referencia_id, usuario_id)
    VALUES (p_empresa_id, p_producto_id, v_lote_id, 'EntradaProduccion', v_cantidad_neta,
            0, v_cantidad_neta, 'produccion', p_produccion_id, p_usuario_id);

    RETURN v_lote_id;
END;
$$;

COMMIT;
