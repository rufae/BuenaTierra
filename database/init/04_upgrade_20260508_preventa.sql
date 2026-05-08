-- ============================================================
-- UPGRADE 2026-05-08: Módulo de preventa para distribución
-- - Preventa editable antes de convertir a pedido
-- - Confirmación explícita (alerta_confirmada)
-- - Sin descuento de stock ni trazabilidad legal hasta convertir
-- ============================================================

CREATE TABLE IF NOT EXISTS preventas (
    id                  SERIAL PRIMARY KEY,
    empresa_id          INTEGER NOT NULL REFERENCES empresas(id),
    cliente_id          INTEGER NOT NULL REFERENCES clientes(id),
    repartidor_id       INTEGER REFERENCES usuarios(id),
    fecha_preventa      DATE NOT NULL,
    estado              TEXT NOT NULL CHECK (estado IN ('Borrador','PendienteRevision','Confirmada','Convertida','Cancelada')) DEFAULT 'Borrador',
    version             INTEGER NOT NULL DEFAULT 1,
    alerta_confirmada   BOOLEAN NOT NULL DEFAULT FALSE,
    notas               TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_preventas_empresa_fecha ON preventas(empresa_id, fecha_preventa);
CREATE INDEX IF NOT EXISTS idx_preventas_cliente_fecha ON preventas(cliente_id, fecha_preventa);
CREATE INDEX IF NOT EXISTS idx_preventas_estado ON preventas(empresa_id, estado);

CREATE TABLE IF NOT EXISTS preventa_lineas (
    id                  SERIAL PRIMARY KEY,
    preventa_id         INTEGER NOT NULL REFERENCES preventas(id) ON DELETE CASCADE,
    producto_id         INTEGER NOT NULL REFERENCES productos(id),
    fecha_objetivo      DATE NOT NULL,
    cantidad_prevista   NUMERIC(10,3) NOT NULL DEFAULT 0,
    cantidad_final      NUMERIC(10,3),
    estado_linea        TEXT NOT NULL CHECK (estado_linea IN ('Previsto','PendienteCompra','ListoParaPedido','Convertida','NoServible','Cancelada')) DEFAULT 'Previsto',
    editable            BOOLEAN NOT NULL DEFAULT TRUE,
    pedido_id           INTEGER REFERENCES pedidos(id),
    motivo_bloqueo      TEXT,
    observaciones       TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT preventa_lineas_cantidad_prevista_nonneg CHECK (cantidad_prevista >= 0),
    CONSTRAINT preventa_lineas_cantidad_final_nonneg CHECK (cantidad_final IS NULL OR cantidad_final >= 0),
    UNIQUE(preventa_id, producto_id, fecha_objetivo)
);

CREATE INDEX IF NOT EXISTS idx_preventa_lineas_preventa ON preventa_lineas(preventa_id);
CREATE INDEX IF NOT EXISTS idx_preventa_lineas_producto ON preventa_lineas(producto_id, fecha_objetivo);
CREATE INDEX IF NOT EXISTS idx_preventa_lineas_estado ON preventa_lineas(estado_linea);
CREATE INDEX IF NOT EXISTS idx_preventa_lineas_pedido ON preventa_lineas(pedido_id) WHERE pedido_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS preventa_historial (
    id                  BIGSERIAL PRIMARY KEY,
    preventa_linea_id   INTEGER NOT NULL REFERENCES preventa_lineas(id) ON DELETE CASCADE,
    accion              VARCHAR(100) NOT NULL,
    cantidad_anterior   NUMERIC(10,3),
    cantidad_nueva      NUMERIC(10,3),
    usuario_id          INTEGER REFERENCES usuarios(id),
    detalle             JSONB DEFAULT '{}',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_preventa_historial_linea_fecha ON preventa_historial(preventa_linea_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_preventa_historial_usuario ON preventa_historial(usuario_id);
