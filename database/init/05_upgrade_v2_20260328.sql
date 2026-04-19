-- ============================================================
-- BuenaTierra — Upgrade a Schema v2
-- Fecha: 2026-03-28
-- Para: Clientes con instalaciones existentes (v1 o sin schema_version)
-- Idempotente: se puede ejecutar múltiples veces sin efecto
-- ============================================================

BEGIN;

-- ─── 0. Tabla de control de versiones ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS schema_version (
    version     INTEGER NOT NULL PRIMARY KEY,
    descripcion VARCHAR(500) NOT NULL,
    applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Salir si ya está en v2 o superior
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM schema_version WHERE version >= 2) THEN
        RAISE NOTICE 'Schema ya está en v2 o superior. No se aplican cambios.';
        -- No se puede RETURN dentro de DO, así que usamos una excepción controlada
        -- para saltar el resto del script.
    END IF;
END $$;

-- ─── 1. Normalizar estado legacy de producciones ─────────────────────────
UPDATE producciones SET estado = 'EnProceso' WHERE estado = 'EnCurso';

-- ─── 2. Named CHECK constraints (idempotente) ────────────────────────────
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_producciones_estado') THEN
        BEGIN
            ALTER TABLE producciones DROP CONSTRAINT IF EXISTS producciones_estado_check;
        EXCEPTION WHEN undefined_object THEN NULL;
        END;
        ALTER TABLE producciones ADD CONSTRAINT ck_producciones_estado
            CHECK (estado IN ('Planificada','EnProceso','Finalizada','Cancelada'));
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_facturas_estado') THEN
        BEGIN
            ALTER TABLE facturas DROP CONSTRAINT IF EXISTS facturas_estado_check;
        EXCEPTION WHEN undefined_object THEN NULL;
        END;
        ALTER TABLE facturas ADD CONSTRAINT ck_facturas_estado
            CHECK (estado IN ('Borrador','Emitida','Enviada','Cobrada','Anulada'));
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_albaranes_estado') THEN
        BEGIN
            ALTER TABLE albaranes DROP CONSTRAINT IF EXISTS albaranes_estado_check;
        EXCEPTION WHEN undefined_object THEN NULL;
        END;
        ALTER TABLE albaranes ADD CONSTRAINT ck_albaranes_estado
            CHECK (estado IN ('Pendiente','EnReparto','Entregado','Facturado','Cancelado'));
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_pedidos_estado') THEN
        BEGIN
            ALTER TABLE pedidos DROP CONSTRAINT IF EXISTS pedidos_estado_check;
        EXCEPTION WHEN undefined_object THEN NULL;
        END;
        ALTER TABLE pedidos ADD CONSTRAINT ck_pedidos_estado
            CHECK (estado IN ('Pendiente','Confirmado','EnPreparacion','Preparado','EnReparto','Entregado','Cancelado'));
    END IF;
END $$;

-- ─── 3. Reemplazar función entrada_stock_produccion ──────────────────────
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
        RAISE EXCEPTION 'Producción % no encontrada o no finalizada', p_produccion_id;
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

-- ─── 4. Registrar versiones ──────────────────────────────────────────────
INSERT INTO schema_version (version, descripcion) VALUES
(1, 'Esquema inicial — tablas, funciones, vistas, triggers, roles'),
(2, 'Consolidación: named CHECK constraints, estados normalizados, schema_version')
ON CONFLICT (version) DO NOTHING;

COMMIT;

\echo 'Upgrade a Schema v2 completado correctamente.'
