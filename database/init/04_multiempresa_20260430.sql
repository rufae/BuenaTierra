-- =============================================================================
-- MIGRACIÓN MULTIEMPRESA — BuenaTierra
-- Versión:  04_multiempresa_20260430
-- Rama:     multiempresa
-- Objetivo: Índices compuestos por tenant + constraints de unicidad por empresa.
--           Todos los cambios son ADDITIVE (no destruyen datos existentes).
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. ÍNDICES COMPUESTOS POR EMPRESA (rendimiento en consultas con filtro tenant)
-- ---------------------------------------------------------------------------

-- pedidos
CREATE INDEX IF NOT EXISTS idx_pedidos_empresa_fecha
    ON pedidos (empresa_id, fecha_pedido DESC);

CREATE INDEX IF NOT EXISTS idx_pedidos_empresa_estado
    ON pedidos (empresa_id, estado);

CREATE INDEX IF NOT EXISTS idx_pedidos_empresa_cliente
    ON pedidos (empresa_id, cliente_id);

-- albaranes
CREATE INDEX IF NOT EXISTS idx_albaranes_empresa_fecha
    ON albaranes (empresa_id, fecha_albaran DESC);

CREATE INDEX IF NOT EXISTS idx_albaranes_empresa_cliente
    ON albaranes (empresa_id, cliente_id);

-- facturas
CREATE INDEX IF NOT EXISTS idx_facturas_empresa_fecha
    ON facturas (empresa_id, fecha_factura DESC);

CREATE INDEX IF NOT EXISTS idx_facturas_empresa_cliente
    ON facturas (empresa_id, cliente_id);

CREATE INDEX IF NOT EXISTS idx_facturas_empresa_numero
    ON facturas (empresa_id, numero_factura);

-- lotes
CREATE INDEX IF NOT EXISTS idx_lotes_empresa_producto
    ON lotes (empresa_id, producto_id);

CREATE INDEX IF NOT EXISTS idx_lotes_empresa_codigo
    ON lotes (empresa_id, codigo_lote);

CREATE INDEX IF NOT EXISTS idx_lotes_empresa_fabricacion
    ON lotes (empresa_id, fecha_fabricacion DESC);

-- stock
CREATE INDEX IF NOT EXISTS idx_stock_empresa_producto
    ON stock (empresa_id, producto_id);

CREATE INDEX IF NOT EXISTS idx_stock_empresa_producto_lote
    ON stock (empresa_id, producto_id, lote_id);

-- movimientos_stock
CREATE INDEX IF NOT EXISTS idx_movstock_empresa_fecha
    ON movimientos_stock (empresa_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_movstock_empresa_lote
    ON movimientos_stock (empresa_id, lote_id);

-- producciones
CREATE INDEX IF NOT EXISTS idx_producciones_empresa_fecha
    ON producciones (empresa_id, fecha_produccion DESC);

CREATE INDEX IF NOT EXISTS idx_producciones_empresa_producto
    ON producciones (empresa_id, producto_id);

-- trazabilidad
CREATE INDEX IF NOT EXISTS idx_trazabilidad_empresa_fecha
    ON trazabilidad (empresa_id, fecha_operacion DESC);

CREATE INDEX IF NOT EXISTS idx_trazabilidad_empresa_lote
    ON trazabilidad (empresa_id, lote_id);

-- clientes
CREATE INDEX IF NOT EXISTS idx_clientes_empresa_activo
    ON clientes (empresa_id, activo);

CREATE INDEX IF NOT EXISTS idx_clientes_empresa_tipo
    ON clientes (empresa_id, tipo);

-- productos
CREATE INDEX IF NOT EXISTS idx_productos_empresa_activo
    ON productos (empresa_id, activo);

CREATE INDEX IF NOT EXISTS idx_productos_empresa_categoria
    ON productos (empresa_id, categoria_id);

-- ingredientes
CREATE INDEX IF NOT EXISTS idx_ingredientes_empresa
    ON ingredientes (empresa_id);

-- usuarios
CREATE INDEX IF NOT EXISTS idx_usuarios_empresa_activo
    ON usuarios (empresa_id, activo);

CREATE INDEX IF NOT EXISTS idx_usuarios_empresa_rol
    ON usuarios (empresa_id, rol);

-- series_facturacion
CREATE INDEX IF NOT EXISTS idx_series_empresa_activa
    ON series_facturacion (empresa_id, activa);

-- ---------------------------------------------------------------------------
-- 2. CONSTRAINTS DE UNICIDAD POR EMPRESA
-- ---------------------------------------------------------------------------

-- Número de factura único por empresa (si no existe ya)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'uq_facturas_empresa_numero'
    ) THEN
        ALTER TABLE facturas
        ADD CONSTRAINT uq_facturas_empresa_numero
        UNIQUE (empresa_id, numero_factura);
    END IF;
END$$;

-- Código de lote único por empresa (si no existe ya)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'uq_lotes_empresa_codigo'
    ) THEN
        ALTER TABLE lotes
        ADD CONSTRAINT uq_lotes_empresa_codigo
        UNIQUE (empresa_id, codigo_lote);
    END IF;
END$$;

-- Stock único por (empresa, producto, lote) — evitar doble fila
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'uq_stock_empresa_producto_lote'
    ) THEN
        ALTER TABLE stock
        ADD CONSTRAINT uq_stock_empresa_producto_lote
        UNIQUE (empresa_id, producto_id, lote_id);
    END IF;
END$$;

-- ---------------------------------------------------------------------------
-- 3. COMENTARIO DE VERSIÓN EN SCHEMA
-- ---------------------------------------------------------------------------

COMMENT ON SCHEMA public IS
    'BuenaTierra schema — multiempresa migration 04_multiempresa_20260430 applied';

COMMIT;
