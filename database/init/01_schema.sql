-- ============================================================
-- BuenaTierra - Inicialización de Base de Datos PostgreSQL 15
-- Ejecutado automáticamente por Docker en primer arranque
-- ============================================================

\echo 'Iniciando creación de base de datos BuenaTierra...'

-- ============================================================
-- EXTENSIONES
-- ============================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "unaccent";

-- ============================================================
-- TIPOS ENUMERADOS
-- Implementados como TEXT + CHECK CONSTRAINT (sin tipos ENUM)
-- para mayor flexibilidad y compatibilidad con migraciones.
-- ============================================================

-- ============================================================
-- TABLA: empresas
-- Soporte multi-tenant (obrador + repartidores son empresas)
-- ============================================================
CREATE TABLE IF NOT EXISTS empresas (
    id                  SERIAL PRIMARY KEY,
    nombre              VARCHAR(200) NOT NULL,
    nif                 VARCHAR(20) UNIQUE NOT NULL,
    razon_social        VARCHAR(200),
    direccion           TEXT,
    codigo_postal       VARCHAR(10),
    ciudad              VARCHAR(100),
    provincia           VARCHAR(100),
    pais                VARCHAR(100) DEFAULT 'España',
    telefono            VARCHAR(20),
    email               VARCHAR(200),
    web                 VARCHAR(200),
    logo_url            VARCHAR(500),
    numero_rgseaa       VARCHAR(50),
    es_obrador          BOOLEAN NOT NULL DEFAULT FALSE,
    empresa_padre_id    INTEGER REFERENCES empresas(id),
    activa              BOOLEAN NOT NULL DEFAULT TRUE,
    configuracion       JSONB DEFAULT '{}',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_empresas_nif ON empresas(nif);
CREATE INDEX IF NOT EXISTS idx_empresas_padre ON empresas(empresa_padre_id);

-- ============================================================
-- TABLA: usuarios
-- ============================================================
CREATE TABLE IF NOT EXISTS usuarios (
    id                  SERIAL PRIMARY KEY,
    empresa_id          INTEGER NOT NULL REFERENCES empresas(id),
    nombre              VARCHAR(100) NOT NULL,
    apellidos           VARCHAR(200),
    email               VARCHAR(200) NOT NULL,
    telefono            VARCHAR(20),
    password_hash       VARCHAR(500) NOT NULL,
    rol                 TEXT NOT NULL CHECK (rol IN ('Admin','Obrador','Repartidor')) DEFAULT 'Obrador',
    activo              BOOLEAN NOT NULL DEFAULT TRUE,
    ultimo_acceso       TIMESTAMPTZ,
    refresh_token       VARCHAR(500),
    refresh_token_exp   TIMESTAMPTZ,
    cliente_id          INTEGER,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(empresa_id, email)
);
CREATE INDEX IF NOT EXISTS idx_usuarios_empresa ON usuarios(empresa_id);
CREATE INDEX IF NOT EXISTS idx_usuarios_email ON usuarios(email);

-- ============================================================
-- TABLA: clientes
-- ============================================================
CREATE TABLE IF NOT EXISTS clientes (
    id                      SERIAL PRIMARY KEY,
    empresa_id              INTEGER NOT NULL REFERENCES empresas(id),
    repartidor_empresa_id   INTEGER REFERENCES empresas(id),
    tipo                    TEXT NOT NULL CHECK (tipo IN ('Empresa','Autonomo','Particular','Repartidor')) DEFAULT 'Particular',
    nombre                  VARCHAR(200) NOT NULL,
    apellidos               VARCHAR(200),
    razon_social            VARCHAR(200),
    nif                     VARCHAR(20),
    direccion               TEXT,
    codigo_postal           VARCHAR(10),
    ciudad                  VARCHAR(100),
    provincia               VARCHAR(100),
    telefono                VARCHAR(20),
    telefono2               VARCHAR(20),
    email                   VARCHAR(200),
    condiciones_pago        VARCHAR(100),
    dias_pago               INTEGER DEFAULT 0,
    descuento_general       NUMERIC(5,2) DEFAULT 0,
    tarifa_id               INTEGER,
    notas                   TEXT,
    activo                  BOOLEAN NOT NULL DEFAULT TRUE,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_clientes_empresa ON clientes(empresa_id);
CREATE INDEX IF NOT EXISTS idx_clientes_repartidor ON clientes(repartidor_empresa_id);
CREATE INDEX IF NOT EXISTS idx_clientes_nombre ON clientes USING gin(to_tsvector('spanish', nombre || ' ' || COALESCE(apellidos,'') || ' ' || COALESCE(razon_social,'')));

-- FK diferida: usuarios.cliente_id → clientes(id)
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_usuarios_cliente') THEN
        ALTER TABLE usuarios ADD CONSTRAINT fk_usuarios_cliente
            FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE SET NULL;
    END IF;
END $$;

-- ============================================================
-- TABLA: categorias
-- ============================================================
CREATE TABLE IF NOT EXISTS categorias (
    id              SERIAL PRIMARY KEY,
    empresa_id      INTEGER NOT NULL REFERENCES empresas(id),
    nombre          VARCHAR(100) NOT NULL,
    descripcion     TEXT,
    padre_id        INTEGER REFERENCES categorias(id),
    activa          BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_categorias_empresa ON categorias(empresa_id);

-- ============================================================
-- TABLA: alergenos
-- ============================================================
CREATE TABLE IF NOT EXISTS alergenos (
    id              SERIAL PRIMARY KEY,
    codigo          VARCHAR(20) UNIQUE NOT NULL,
    nombre          VARCHAR(100) NOT NULL,
    descripcion     TEXT,
    icono_url       VARCHAR(500)
);

-- ============================================================
-- TABLA: ingredientes
-- ============================================================
CREATE TABLE IF NOT EXISTS ingredientes (
    id              SERIAL PRIMARY KEY,
    empresa_id      INTEGER NOT NULL REFERENCES empresas(id),
    nombre          VARCHAR(200) NOT NULL,
    descripcion     TEXT,
    proveedor       VARCHAR(200),
    codigo_proveedor VARCHAR(50),
    activo          BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(empresa_id, nombre)
);
CREATE INDEX IF NOT EXISTS idx_ingredientes_empresa ON ingredientes(empresa_id);

-- ============================================================
-- TABLA: productos
-- ============================================================
CREATE TABLE IF NOT EXISTS productos (
    id                  SERIAL PRIMARY KEY,
    empresa_id          INTEGER NOT NULL REFERENCES empresas(id),
    categoria_id        INTEGER REFERENCES categorias(id),
    codigo              VARCHAR(50),
    nombre              VARCHAR(200) NOT NULL,
    descripcion         TEXT,
    descripcion_larga   TEXT,
    precio_venta        NUMERIC(10,4) NOT NULL DEFAULT 0,
    precio_coste        NUMERIC(10,4),
    iva_porcentaje      NUMERIC(5,2) NOT NULL DEFAULT 10.00,
    unidad_medida       VARCHAR(20) DEFAULT 'unidad',
    peso_unitario_gr    NUMERIC(10,3),
    vida_util_dias      INTEGER,
    temperatura_min     NUMERIC(5,1),
    temperatura_max     NUMERIC(5,1),
    requiere_lote       BOOLEAN NOT NULL DEFAULT TRUE,
    compartido_repartidores BOOLEAN NOT NULL DEFAULT TRUE,
    activo              BOOLEAN NOT NULL DEFAULT TRUE,
    imagen_url          VARCHAR(500),
    -- Campos comerciales del cliente (campos.json)
    codigo_barras       VARCHAR(100),
    proveedor_habitual  VARCHAR(200),
    referencia          VARCHAR(100),
    fabricante          VARCHAR(200),
    descuento_por_defecto NUMERIC(5,2),
    stock_minimo        NUMERIC(10,3),
    stock_maximo        NUMERIC(10,3),
    -- Información nutricional (Reglamento UE 1169/2011, por 100 g)
    valor_energetico_kj    NUMERIC(10,2),
    valor_energetico_kcal  NUMERIC(10,2),
    grasas                 NUMERIC(10,2),
    grasas_saturadas       NUMERIC(10,2),
    hidratos_carbono       NUMERIC(10,2),
    azucares               NUMERIC(10,2),
    proteinas              NUMERIC(10,2),
    sal                    NUMERIC(10,2),
    -- Etiquetado
    ingredientes_texto     TEXT,            -- lista completa con alérgenos en MAYÚSCULAS
    trazas                 VARCHAR(2000),   -- "Puede contener trazas de…"
    conservacion           VARCHAR(500),    -- "Conservar en lugar fresco y seco"
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(empresa_id, codigo)
);
CREATE INDEX IF NOT EXISTS idx_productos_empresa ON productos(empresa_id);
CREATE INDEX IF NOT EXISTS idx_productos_categoria ON productos(categoria_id);
CREATE INDEX IF NOT EXISTS idx_productos_nombre ON productos USING gin(to_tsvector('spanish', nombre));

-- ============================================================
-- TABLA: producto_ingredientes
-- ============================================================
CREATE TABLE IF NOT EXISTS producto_ingredientes (
    id              SERIAL PRIMARY KEY,
    producto_id     INTEGER NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
    ingrediente_id  INTEGER NOT NULL REFERENCES ingredientes(id),
    cantidad_gr     NUMERIC(10,3),
    es_principal    BOOLEAN DEFAULT FALSE,
    UNIQUE(producto_id, ingrediente_id)
);

-- ============================================================
-- TABLA: ingrediente_alergenos
-- ============================================================
CREATE TABLE IF NOT EXISTS ingrediente_alergenos (
    ingrediente_id  INTEGER NOT NULL REFERENCES ingredientes(id) ON DELETE CASCADE,
    alergeno_id     INTEGER NOT NULL REFERENCES alergenos(id),
    PRIMARY KEY(ingrediente_id, alergeno_id)
);

-- ============================================================
-- TABLA: producciones
-- ============================================================
CREATE TABLE IF NOT EXISTS producciones (
    id                  SERIAL PRIMARY KEY,
    empresa_id          INTEGER NOT NULL REFERENCES empresas(id),
    producto_id         INTEGER NOT NULL REFERENCES productos(id),
    usuario_id          INTEGER NOT NULL REFERENCES usuarios(id),
    fecha_produccion    DATE NOT NULL DEFAULT CURRENT_DATE,
    cantidad_producida  NUMERIC(10,3) NOT NULL,
    cantidad_merma      NUMERIC(10,3) DEFAULT 0,
    estado              TEXT NOT NULL CHECK (estado IN ('Planificada','EnProceso','Finalizada','Cancelada')) DEFAULT 'Planificada',
    notas               TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_producciones_empresa ON producciones(empresa_id);
CREATE INDEX IF NOT EXISTS idx_producciones_fecha ON producciones(fecha_produccion);
CREATE INDEX IF NOT EXISTS idx_producciones_producto ON producciones(producto_id);

-- ============================================================
-- TABLA: lotes
-- Formato código: DíaMesAño-ProductoID-Secuencia
-- ============================================================
CREATE TABLE IF NOT EXISTS lotes (
    id                  SERIAL PRIMARY KEY,
    empresa_id          INTEGER NOT NULL REFERENCES empresas(id),
    producto_id         INTEGER NOT NULL REFERENCES productos(id),
    produccion_id       INTEGER REFERENCES producciones(id),
    codigo_lote         VARCHAR(50) NOT NULL,
    fecha_fabricacion   DATE NOT NULL,
    fecha_caducidad     DATE,
    cantidad_inicial    NUMERIC(10,3) NOT NULL,
    bloqueado           BOOLEAN NOT NULL DEFAULT FALSE,
    motivo_bloqueado    TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(empresa_id, codigo_lote)
);
CREATE INDEX IF NOT EXISTS idx_lotes_empresa ON lotes(empresa_id);
CREATE INDEX IF NOT EXISTS idx_lotes_producto ON lotes(producto_id);
CREATE INDEX IF NOT EXISTS idx_lotes_fecha_fab ON lotes(fecha_fabricacion);
CREATE INDEX IF NOT EXISTS idx_lotes_caducidad ON lotes(fecha_caducidad) WHERE fecha_caducidad IS NOT NULL;

-- ============================================================
-- TABLA: stock
-- Stock por empresa + producto + lote
-- ============================================================
CREATE TABLE IF NOT EXISTS stock (
    id                  SERIAL PRIMARY KEY,
    empresa_id          INTEGER NOT NULL REFERENCES empresas(id),
    producto_id         INTEGER NOT NULL REFERENCES productos(id),
    lote_id             INTEGER NOT NULL REFERENCES lotes(id),
    cantidad_disponible NUMERIC(10,3) NOT NULL DEFAULT 0,
    cantidad_reservada  NUMERIC(10,3) NOT NULL DEFAULT 0,
    stock_minimo        NUMERIC(10,3) DEFAULT 0,
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(empresa_id, producto_id, lote_id),
    CONSTRAINT stock_disponible_positivo CHECK (cantidad_disponible >= 0),
    CONSTRAINT stock_reservada_positivo CHECK (cantidad_reservada >= 0)
);
CREATE INDEX IF NOT EXISTS idx_stock_empresa_producto ON stock(empresa_id, producto_id);
CREATE INDEX IF NOT EXISTS idx_stock_lote ON stock(lote_id);
CREATE INDEX IF NOT EXISTS idx_stock_disponible ON stock(empresa_id, producto_id) WHERE cantidad_disponible > 0;

-- ============================================================
-- TABLA: movimientos_stock
-- Auditoría de todos los movimientos de inventario
-- ============================================================
CREATE TABLE IF NOT EXISTS movimientos_stock (
    id              SERIAL PRIMARY KEY,
    empresa_id      INTEGER NOT NULL REFERENCES empresas(id),
    producto_id     INTEGER NOT NULL REFERENCES productos(id),
    lote_id         INTEGER NOT NULL REFERENCES lotes(id),
    tipo            TEXT NOT NULL CHECK (tipo IN ('Entrada','Salida','Reserva','LiberarReserva','Ajuste','Merma')),
    cantidad        NUMERIC(10,3) NOT NULL,
    cantidad_antes  NUMERIC(10,3) NOT NULL,
    cantidad_despues NUMERIC(10,3) NOT NULL,
    referencia_tipo VARCHAR(50),
    referencia_id   INTEGER,
    usuario_id      INTEGER REFERENCES usuarios(id),
    notas           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_mov_stock_empresa ON movimientos_stock(empresa_id);
CREATE INDEX IF NOT EXISTS idx_mov_stock_producto ON movimientos_stock(producto_id, lote_id);
CREATE INDEX IF NOT EXISTS idx_mov_stock_fecha ON movimientos_stock(created_at);

-- ============================================================
-- TABLA: series_facturacion
-- ============================================================
CREATE TABLE IF NOT EXISTS series_facturacion (
    id              SERIAL PRIMARY KEY,
    empresa_id      INTEGER NOT NULL REFERENCES empresas(id),
    codigo          VARCHAR(10) NOT NULL,
    descripcion     VARCHAR(100),
    prefijo         VARCHAR(10),
    ultimo_numero   INTEGER NOT NULL DEFAULT 0,
    formato         VARCHAR(50) DEFAULT '{PREFIJO}{ANIO}{NUMERO:6}',
    activa          BOOLEAN NOT NULL DEFAULT TRUE,
    UNIQUE(empresa_id, codigo)
);

-- ============================================================
-- TABLA: pedidos
-- ============================================================
CREATE TABLE IF NOT EXISTS pedidos (
    id              SERIAL PRIMARY KEY,
    empresa_id      INTEGER NOT NULL REFERENCES empresas(id),
    cliente_id      INTEGER NOT NULL REFERENCES clientes(id),
    usuario_id      INTEGER NOT NULL REFERENCES usuarios(id),
    numero_pedido   VARCHAR(50),
    fecha_pedido    DATE NOT NULL DEFAULT CURRENT_DATE,
    fecha_entrega   DATE,
    estado          TEXT NOT NULL CHECK (estado IN ('Pendiente','Confirmado','EnPreparacion','Preparado','EnReparto','Entregado','Cancelado')) DEFAULT 'Pendiente',
    subtotal        NUMERIC(12,4) DEFAULT 0,
    descuento_total NUMERIC(12,4) DEFAULT 0,
    iva_total       NUMERIC(12,4) DEFAULT 0,
    total           NUMERIC(12,4) DEFAULT 0,
    notas           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pedidos_empresa ON pedidos(empresa_id);
CREATE INDEX IF NOT EXISTS idx_pedidos_cliente ON pedidos(cliente_id);
CREATE INDEX IF NOT EXISTS idx_pedidos_fecha ON pedidos(fecha_pedido);

-- ============================================================
-- TABLA: pedidos_lineas
-- ============================================================
CREATE TABLE IF NOT EXISTS pedidos_lineas (
    id              SERIAL PRIMARY KEY,
    pedido_id       INTEGER NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
    producto_id     INTEGER NOT NULL REFERENCES productos(id),
    descripcion     VARCHAR(300),
    cantidad        NUMERIC(10,3) NOT NULL,
    precio_unitario NUMERIC(10,4) NOT NULL,
    descuento       NUMERIC(5,2) DEFAULT 0,
    iva_porcentaje  NUMERIC(5,2) NOT NULL DEFAULT 10,
    subtotal        NUMERIC(12,4) GENERATED ALWAYS AS (ROUND(cantidad * precio_unitario * (1 - descuento/100), 4)) STORED,
    orden           SMALLINT DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_pedidos_lineas_pedido ON pedidos_lineas(pedido_id);

-- ============================================================
-- TABLA: albaranes
-- ============================================================
CREATE TABLE IF NOT EXISTS albaranes (
    id              SERIAL PRIMARY KEY,
    empresa_id      INTEGER NOT NULL REFERENCES empresas(id),
    pedido_id       INTEGER REFERENCES pedidos(id),
    cliente_id      INTEGER NOT NULL REFERENCES clientes(id),
    usuario_id      INTEGER NOT NULL REFERENCES usuarios(id),
    serie_id        INTEGER REFERENCES series_facturacion(id),
    numero_albaran  VARCHAR(50),
    fecha_albaran   DATE NOT NULL DEFAULT CURRENT_DATE,
    fecha_entrega   DATE,
    estado          TEXT NOT NULL CHECK (estado IN ('Pendiente','EnReparto','Entregado','Facturado','Cancelado')) DEFAULT 'Pendiente',
    subtotal        NUMERIC(12,4) DEFAULT 0,
    descuento_total NUMERIC(12,4) DEFAULT 0,
    iva_total       NUMERIC(12,4) DEFAULT 0,
    recargo_equivalencia_total NUMERIC(12,4) DEFAULT 0,
    retencion_total NUMERIC(12,4) DEFAULT 0,
    total           NUMERIC(12,4) DEFAULT 0,
    notas           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_albaranes_empresa ON albaranes(empresa_id);
CREATE INDEX IF NOT EXISTS idx_albaranes_cliente ON albaranes(cliente_id);
CREATE INDEX IF NOT EXISTS idx_albaranes_fecha ON albaranes(fecha_albaran);

-- ============================================================
-- TABLA: albaranes_lineas
-- Cada línea lleva lote para trazabilidad
-- ============================================================
CREATE TABLE IF NOT EXISTS albaranes_lineas (
    id              SERIAL PRIMARY KEY,
    albaran_id      INTEGER NOT NULL REFERENCES albaranes(id) ON DELETE CASCADE,
    producto_id     INTEGER NOT NULL REFERENCES productos(id),
    lote_id         INTEGER REFERENCES lotes(id),
    descripcion     VARCHAR(300),
    cantidad        NUMERIC(10,3) NOT NULL,
    precio_unitario NUMERIC(10,4) NOT NULL,
    descuento       NUMERIC(5,2) DEFAULT 0,
    iva_porcentaje  NUMERIC(5,2) NOT NULL DEFAULT 10,
    recargo_equivalencia_porcentaje NUMERIC(5,2) DEFAULT 0,
    subtotal        NUMERIC(12,4) GENERATED ALWAYS AS (ROUND(cantidad * precio_unitario * (1 - descuento/100), 4)) STORED,
    orden           SMALLINT DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_alb_lineas_albaran ON albaranes_lineas(albaran_id);
CREATE INDEX IF NOT EXISTS idx_alb_lineas_lote ON albaranes_lineas(lote_id);

-- ============================================================
-- TABLA: facturas
-- ============================================================
CREATE TABLE IF NOT EXISTS facturas (
    id              SERIAL PRIMARY KEY,
    empresa_id      INTEGER NOT NULL REFERENCES empresas(id),
    albaran_id      INTEGER REFERENCES albaranes(id),
    pedido_id       INTEGER REFERENCES pedidos(id),
    cliente_id      INTEGER NOT NULL REFERENCES clientes(id),
    usuario_id      INTEGER NOT NULL REFERENCES usuarios(id),
    serie_id        INTEGER NOT NULL REFERENCES series_facturacion(id),
    numero_factura  VARCHAR(50) NOT NULL,
    fecha_factura   DATE NOT NULL DEFAULT CURRENT_DATE,
    fecha_vencimiento DATE,
    estado          TEXT NOT NULL CHECK (estado IN ('Borrador','Emitida','Enviada','Cobrada','Anulada')) DEFAULT 'Borrador',
    es_simplificada BOOLEAN NOT NULL DEFAULT FALSE,
    subtotal        NUMERIC(12,4) NOT NULL DEFAULT 0,
    descuento_total NUMERIC(12,4) NOT NULL DEFAULT 0,
    base_imponible  NUMERIC(12,4) NOT NULL DEFAULT 0,
    iva_desglose    JSONB DEFAULT '[]',
    iva_total       NUMERIC(12,4) NOT NULL DEFAULT 0,
    recargo_equivalencia_total NUMERIC(12,4) NOT NULL DEFAULT 0,
    retencion_total NUMERIC(12,4) NOT NULL DEFAULT 0,
    total           NUMERIC(12,4) NOT NULL DEFAULT 0,
    pdf_url         VARCHAR(500),
    notas           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(empresa_id, numero_factura)
);
CREATE INDEX IF NOT EXISTS idx_facturas_empresa ON facturas(empresa_id);
CREATE INDEX IF NOT EXISTS idx_facturas_cliente ON facturas(cliente_id);
CREATE INDEX IF NOT EXISTS idx_facturas_fecha ON facturas(fecha_factura);
CREATE INDEX IF NOT EXISTS idx_facturas_numero ON facturas(empresa_id, numero_factura);

-- ============================================================
-- TABLA: facturas_lineas
-- Una línea por lote asignado automáticamente por FIFO
-- ============================================================
CREATE TABLE IF NOT EXISTS facturas_lineas (
    id              SERIAL PRIMARY KEY,
    factura_id      INTEGER NOT NULL REFERENCES facturas(id) ON DELETE CASCADE,
    producto_id     INTEGER NOT NULL REFERENCES productos(id),
    lote_id         INTEGER REFERENCES lotes(id),
    descripcion     VARCHAR(300),
    cantidad        NUMERIC(10,3) NOT NULL,
    precio_unitario NUMERIC(10,4) NOT NULL,
    descuento       NUMERIC(5,2) DEFAULT 0,
    iva_porcentaje  NUMERIC(5,2) NOT NULL DEFAULT 10,
    recargo_equivalencia_porcentaje NUMERIC(5,2) DEFAULT 0,
    subtotal        NUMERIC(12,4) GENERATED ALWAYS AS (ROUND(cantidad * precio_unitario * (1 - descuento/100), 4)) STORED,
    iva_importe     NUMERIC(12,4) GENERATED ALWAYS AS (ROUND(cantidad * precio_unitario * (1 - descuento/100) * iva_porcentaje / 100, 4)) STORED,
    orden           SMALLINT DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_fact_lineas_factura ON facturas_lineas(factura_id);
CREATE INDEX IF NOT EXISTS idx_fact_lineas_lote ON facturas_lineas(lote_id);
CREATE INDEX IF NOT EXISTS idx_fact_lineas_producto ON facturas_lineas(producto_id);

-- ============================================================
-- TABLA: trazabilidad
-- Registro maestro de trazabilidad alimentaria
-- ============================================================
CREATE TABLE IF NOT EXISTS trazabilidad (
    id              SERIAL PRIMARY KEY,
    empresa_id      INTEGER NOT NULL REFERENCES empresas(id),
    lote_id         INTEGER NOT NULL REFERENCES lotes(id),
    producto_id     INTEGER NOT NULL REFERENCES productos(id),
    cliente_id      INTEGER REFERENCES clientes(id),
    factura_id      INTEGER REFERENCES facturas(id),
    albaran_id      INTEGER REFERENCES albaranes(id),
    cantidad        NUMERIC(10,3) NOT NULL,
    tipo_operacion  VARCHAR(50) NOT NULL,
    fecha_operacion TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    usuario_id      INTEGER REFERENCES usuarios(id),
    datos_adicionales JSONB DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_trazabilidad_lote ON trazabilidad(lote_id);
CREATE INDEX IF NOT EXISTS idx_trazabilidad_producto ON trazabilidad(producto_id);
CREATE INDEX IF NOT EXISTS idx_trazabilidad_cliente ON trazabilidad(cliente_id);
CREATE INDEX IF NOT EXISTS idx_trazabilidad_fecha ON trazabilidad(fecha_operacion);

-- ============================================================
-- TABLA: auditoria
-- ============================================================
CREATE TABLE IF NOT EXISTS auditoria (
    id              BIGSERIAL PRIMARY KEY,
    tabla_nombre    VARCHAR(100) NOT NULL,
    operacion       VARCHAR(10) NOT NULL,
    registro_id     INTEGER NOT NULL,
    datos_antes     JSONB,
    datos_despues   JSONB,
    usuario_id      INTEGER,
    ip_cliente      VARCHAR(45),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_auditoria_tabla ON auditoria(tabla_nombre, registro_id);
CREATE INDEX IF NOT EXISTS idx_auditoria_fecha ON auditoria(created_at);

-- ============================================================
-- TABLA: control_materias_primas
-- Registro de recepción de materias primas (trazabilidad)
-- ============================================================
CREATE TABLE IF NOT EXISTS control_materias_primas (
    id                      SERIAL PRIMARY KEY,
    empresa_id              INTEGER NOT NULL REFERENCES empresas(id),
    fecha_entrada           DATE NOT NULL DEFAULT CURRENT_DATE,
    ingrediente_id          INTEGER REFERENCES ingredientes(id),
    producto                VARCHAR(300) NOT NULL,
    unidades                NUMERIC(10,3) NOT NULL DEFAULT 0,
    fecha_caducidad         DATE,
    proveedor               VARCHAR(200),
    lote                    VARCHAR(100),
    fecha_apertura_lote     DATE,
    condiciones_transporte  BOOLEAN NOT NULL DEFAULT TRUE,
    mercancia_aceptada      BOOLEAN NOT NULL DEFAULT TRUE,
    responsable             VARCHAR(200),
    fecha_fin_existencia    DATE,
    observaciones           TEXT,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ctrl_mp_empresa ON control_materias_primas(empresa_id);
CREATE INDEX IF NOT EXISTS idx_ctrl_mp_fecha ON control_materias_primas(fecha_entrada);

-- ============================================================
-- TABLA: tipos_iva_re
-- Relación IVA% → Recargo de Equivalencia% por empresa
-- ============================================================
CREATE TABLE IF NOT EXISTS tipos_iva_re (
    id                              SERIAL PRIMARY KEY,
    empresa_id                      INTEGER NOT NULL REFERENCES empresas(id),
    iva_porcentaje                  NUMERIC(5,2) NOT NULL,
    recargo_equivalencia_porcentaje NUMERIC(5,2) NOT NULL,
    descripcion                     VARCHAR(200),
    activo                          BOOLEAN NOT NULL DEFAULT TRUE,
    created_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(empresa_id, iva_porcentaje)
);

-- ============================================================
-- TABLA: plantillas_etiqueta
-- Plantillas del editor visual de etiquetas
-- ============================================================
CREATE TABLE IF NOT EXISTS plantillas_etiqueta (
    id                  SERIAL PRIMARY KEY,
    empresa_id          INTEGER NOT NULL REFERENCES empresas(id),
    nombre              VARCHAR(200) NOT NULL,
    descripcion         VARCHAR(500),
    ancho_mm            NUMERIC(8,2) NOT NULL DEFAULT 105,
    alto_mm             NUMERIC(8,2) NOT NULL DEFAULT 57,
    tipo_impresora      TEXT NOT NULL CHECK (tipo_impresora IN ('A4','TermicaDirecta','TermicaTransferencia')) DEFAULT 'A4',
    contenido_json      JSONB DEFAULT '{}',
    contenido_html      TEXT,
    activa              BOOLEAN NOT NULL DEFAULT TRUE,
    es_plantilla_base   BOOLEAN NOT NULL DEFAULT FALSE,
    usuario_id          INTEGER REFERENCES usuarios(id),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_plantillas_empresa ON plantillas_etiqueta(empresa_id);

-- ============================================================
-- TABLA: etiquetas_importadas
-- Archivos de etiquetas importados (.docx, .odt, .pdf…)
-- ============================================================
CREATE TABLE IF NOT EXISTS etiquetas_importadas (
    id                  SERIAL PRIMARY KEY,
    empresa_id          INTEGER NOT NULL REFERENCES empresas(id),
    nombre              VARCHAR(300) NOT NULL,
    ruta_archivo        VARCHAR(500) NOT NULL,
    formato             TEXT NOT NULL CHECK (formato IN ('Docx','Odt','Pdf','Png','Jpg')) DEFAULT 'Pdf',
    tamano_bytes        BIGINT NOT NULL DEFAULT 0,
    usuario_id          INTEGER REFERENCES usuarios(id),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_etiq_imp_empresa ON etiquetas_importadas(empresa_id);

-- ============================================================
-- TABLA: trabajos_impresion_etiqueta
-- Cola de trabajos de impresión de etiquetas
-- ============================================================
CREATE TABLE IF NOT EXISTS trabajos_impresion_etiqueta (
    id                      SERIAL PRIMARY KEY,
    empresa_id              INTEGER NOT NULL REFERENCES empresas(id),
    plantilla_etiqueta_id   INTEGER NOT NULL REFERENCES plantillas_etiqueta(id),
    producto_id             INTEGER REFERENCES productos(id),
    lote_id                 INTEGER REFERENCES lotes(id),
    copias                  INTEGER NOT NULL DEFAULT 1,
    estado                  TEXT NOT NULL CHECK (estado IN ('Pendiente','Impreso','Error')) DEFAULT 'Pendiente',
    usuario_id              INTEGER NOT NULL REFERENCES usuarios(id),
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_trab_imp_empresa ON trabajos_impresion_etiqueta(empresa_id);
CREATE INDEX IF NOT EXISTS idx_trab_imp_estado ON trabajos_impresion_etiqueta(estado);

-- ============================================================
-- VISTAS
-- ============================================================

-- Vista: stock consolidado por empresa/producto
CREATE OR REPLACE VIEW v_stock_consolidado AS
SELECT
    s.empresa_id,
    s.producto_id,
    p.nombre AS producto_nombre,
    p.codigo AS producto_codigo,
    s.lote_id,
    l.codigo_lote,
    l.fecha_fabricacion,
    l.fecha_caducidad,
    s.cantidad_disponible,
    s.cantidad_reservada,
    (s.cantidad_disponible - s.cantidad_reservada) AS disponible_real,
    l.bloqueado,
    CASE
        WHEN l.fecha_caducidad IS NOT NULL AND l.fecha_caducidad <= CURRENT_DATE THEN 'CADUCADO'
        WHEN l.fecha_caducidad IS NOT NULL AND l.fecha_caducidad <= CURRENT_DATE + INTERVAL '3 days' THEN 'PROXIMO_CADUCIDAD'
        WHEN l.bloqueado THEN 'BLOQUEADO'
        ELSE 'DISPONIBLE'
    END AS estado_lote
FROM stock s
JOIN productos p ON p.id = s.producto_id
JOIN lotes l ON l.id = s.lote_id
WHERE s.cantidad_disponible > 0;

-- Vista: stock total por producto (suma todos los lotes)
CREATE OR REPLACE VIEW v_stock_total AS
SELECT
    s.empresa_id,
    s.producto_id,
    p.nombre AS producto_nombre,
    p.codigo AS producto_codigo,
    c.nombre AS categoria_nombre,
    SUM(s.cantidad_disponible) AS total_disponible,
    SUM(s.cantidad_reservada) AS total_reservada,
    SUM(s.cantidad_disponible - s.cantidad_reservada) AS total_disponible_real,
    COUNT(DISTINCT s.lote_id) AS num_lotes_activos,
    MIN(l.fecha_caducidad) AS proxima_caducidad
FROM stock s
JOIN productos p ON p.id = s.producto_id
LEFT JOIN categorias c ON c.id = p.categoria_id
JOIN lotes l ON l.id = s.lote_id
WHERE s.cantidad_disponible > 0 AND NOT l.bloqueado
  AND (l.fecha_caducidad IS NULL OR l.fecha_caducidad > CURRENT_DATE)
GROUP BY s.empresa_id, s.producto_id, p.nombre, p.codigo, c.nombre;

-- Vista: trazabilidad completa
CREATE OR REPLACE VIEW v_trazabilidad_completa AS
SELECT
    t.id,
    t.empresa_id,
    l.codigo_lote,
    p.nombre AS producto,
    p.codigo AS producto_codigo,
    cl.nombre AS cliente,
    cl.nif AS cliente_nif,
    f.numero_factura,
    a.numero_albaran,
    t.cantidad,
    t.tipo_operacion,
    t.fecha_operacion,
    l.fecha_fabricacion,
    l.fecha_caducidad,
    u.nombre AS usuario
FROM trazabilidad t
JOIN lotes l ON l.id = t.lote_id
JOIN productos p ON p.id = t.producto_id
LEFT JOIN clientes cl ON cl.id = t.cliente_id
LEFT JOIN facturas f ON f.id = t.factura_id
LEFT JOIN albaranes a ON a.id = t.albaran_id
LEFT JOIN usuarios u ON u.id = t.usuario_id;

-- ============================================================
-- FUNCIÓN: Generar siguiente número de serie de facturación
-- ============================================================
CREATE OR REPLACE FUNCTION siguiente_numero_serie(
    p_empresa_id INTEGER,
    p_serie_id INTEGER
) RETURNS VARCHAR(50)
LANGUAGE plpgsql
AS $$
DECLARE
    v_serie series_facturacion%ROWTYPE;
    v_numero INTEGER;
    v_formato VARCHAR(50);
    v_resultado VARCHAR(50);
BEGIN
    -- Lock para evitar duplicados en concurrencia
    SELECT * INTO v_serie FROM series_facturacion
    WHERE id = p_serie_id AND empresa_id = p_empresa_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Serie de facturación % no encontrada para empresa %', p_serie_id, p_empresa_id;
    END IF;

    v_numero := v_serie.ultimo_numero + 1;

    -- Actualizar contador
    UPDATE series_facturacion SET ultimo_numero = v_numero WHERE id = p_serie_id;

    -- Formatear número
    v_resultado := COALESCE(v_serie.prefijo, '') ||
                   TO_CHAR(CURRENT_DATE, 'YYYY') ||
                   LPAD(v_numero::TEXT, 6, '0');

    RETURN v_resultado;
END;
$$;

-- ============================================================
-- FUNCIÓN CORE: Asignación FIFO de lotes automática
-- Devuelve JSONB con array de asignaciones lote+cantidad
-- ============================================================
CREATE OR REPLACE FUNCTION asignar_lotes_automatico(
    p_empresa_id    INTEGER,
    p_producto_id   INTEGER,
    p_cantidad      NUMERIC
) RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    v_restante      NUMERIC := p_cantidad;
    v_asignaciones  JSONB := '[]'::JSONB;
    v_lote          RECORD;
    v_asignar       NUMERIC;
BEGIN
    -- Validar parámetros
    IF p_cantidad <= 0 THEN
        RAISE EXCEPTION 'La cantidad solicitada debe ser mayor que 0';
    END IF;

    -- Iterar por lotes disponibles ordenados FIFO (fecha fabricación ASC, luego ID ASC)
    FOR v_lote IN
        SELECT
            s.lote_id,
            l.codigo_lote,
            l.fecha_fabricacion,
            l.fecha_caducidad,
            (s.cantidad_disponible - s.cantidad_reservada) AS disponible_real
        FROM stock s
        JOIN lotes l ON l.id = s.lote_id
        WHERE s.empresa_id = p_empresa_id
          AND s.producto_id = p_producto_id
          AND (s.cantidad_disponible - s.cantidad_reservada) > 0
          AND l.bloqueado = FALSE
          AND (l.fecha_caducidad IS NULL OR l.fecha_caducidad > CURRENT_DATE)
        ORDER BY l.fecha_fabricacion ASC, l.id ASC
    LOOP
        EXIT WHEN v_restante <= 0;

        v_asignar := LEAST(v_lote.disponible_real, v_restante);

        v_asignaciones := v_asignaciones || jsonb_build_object(
            'lote_id',          v_lote.lote_id,
            'codigo_lote',      v_lote.codigo_lote,
            'cantidad',         v_asignar,
            'fecha_fabricacion', v_lote.fecha_fabricacion,
            'fecha_caducidad',  v_lote.fecha_caducidad
        );

        v_restante := v_restante - v_asignar;
    END LOOP;

    -- Verificar que se pudo asignar toda la cantidad
    IF v_restante > 0 THEN
        RAISE EXCEPTION 'STOCK_INSUFICIENTE: Producto %, solicitado %, disponible %',
            p_producto_id, p_cantidad, p_cantidad - v_restante
            USING ERRCODE = 'P0001';
    END IF;

    RETURN v_asignaciones;
END;
$$;

-- ============================================================
-- FUNCIÓN: Descontar stock tras venta confirmada
-- ============================================================
CREATE OR REPLACE FUNCTION descontar_stock_venta(
    p_empresa_id    INTEGER,
    p_producto_id   INTEGER,
    p_lote_id       INTEGER,
    p_cantidad      NUMERIC,
    p_factura_id    INTEGER DEFAULT NULL,
    p_usuario_id    INTEGER DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
    v_cantidad_antes NUMERIC;
BEGIN
    -- Obtener cantidad antes
    SELECT cantidad_disponible INTO v_cantidad_antes
    FROM stock
    WHERE empresa_id = p_empresa_id AND producto_id = p_producto_id AND lote_id = p_lote_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Stock no encontrado para empresa %, producto %, lote %',
            p_empresa_id, p_producto_id, p_lote_id;
    END IF;

    IF v_cantidad_antes < p_cantidad THEN
        RAISE EXCEPTION 'STOCK_INSUFICIENTE: disponible %, solicitado %', v_cantidad_antes, p_cantidad
            USING ERRCODE = 'P0001';
    END IF;

    -- Decrementar stock
    UPDATE stock
    SET cantidad_disponible = cantidad_disponible - p_cantidad,
        updated_at = NOW()
    WHERE empresa_id = p_empresa_id AND producto_id = p_producto_id AND lote_id = p_lote_id;

    -- Registrar movimiento
    INSERT INTO movimientos_stock(empresa_id, producto_id, lote_id, tipo, cantidad,
                                   cantidad_antes, cantidad_despues, referencia_tipo,
                                   referencia_id, usuario_id)
    VALUES (p_empresa_id, p_producto_id, p_lote_id, 'venta', p_cantidad,
            v_cantidad_antes, v_cantidad_antes - p_cantidad, 'factura',
            p_factura_id, p_usuario_id);
END;
$$;

-- ============================================================
-- FUNCIÓN: Crear entrada de stock desde producción
-- ============================================================
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

    IF NOT FOUND OR v_produccion.estado != 'finalizada' THEN
        RAISE EXCEPTION 'Producción % no encontrada o no finalizada', p_produccion_id;
    END IF;

    v_cantidad_neta := v_produccion.cantidad_producida - COALESCE(v_produccion.cantidad_merma, 0);

    -- Generar código de lote: DDMMYYYY-PRODUCTOID-SEQ
    SELECT COALESCE(MAX(id), 0) + 1 INTO v_seq FROM lotes
    WHERE empresa_id = p_empresa_id AND producto_id = p_producto_id
      AND fecha_fabricacion = v_produccion.fecha_produccion;

    v_codigo_lote := TO_CHAR(v_produccion.fecha_produccion, 'DDMMYYYY') || '-' ||
                     p_producto_id::TEXT || '-' || LPAD(v_seq::TEXT, 3, '0');

    -- Crear lote
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

    -- Crear/actualizar stock
    INSERT INTO stock(empresa_id, producto_id, lote_id, cantidad_disponible)
    VALUES (p_empresa_id, p_producto_id, v_lote_id, v_cantidad_neta)
    ON CONFLICT (empresa_id, producto_id, lote_id)
    DO UPDATE SET cantidad_disponible = stock.cantidad_disponible + v_cantidad_neta,
                  updated_at = NOW();

    -- Registrar movimiento
    INSERT INTO movimientos_stock(empresa_id, producto_id, lote_id, tipo, cantidad,
                                   cantidad_antes, cantidad_despues, referencia_tipo,
                                   referencia_id, usuario_id)
    VALUES (p_empresa_id, p_producto_id, v_lote_id, 'entrada_produccion', v_cantidad_neta,
            0, v_cantidad_neta, 'produccion', p_produccion_id, p_usuario_id);

    RETURN v_lote_id;
END;
$$;

-- ============================================================
-- TRIGGER: updated_at automático
-- ============================================================
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

DO $$ DECLARE t TEXT;
BEGIN FOR t IN VALUES
    ('empresas'),('usuarios'),('clientes'),('productos'),
    ('producciones'),('pedidos'),('albaranes'),('facturas'),
    ('control_materias_primas'),('plantillas_etiqueta')
LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_updated_at_%s ON %s;
                    CREATE TRIGGER trg_updated_at_%s BEFORE UPDATE ON %s
                    FOR EACH ROW EXECUTE FUNCTION set_updated_at();', t, t, t, t);
END LOOP; END $$;

-- ============================================================
-- ROLES DE BASE DE DATOS
-- ============================================================
DO $$ BEGIN
    CREATE ROLE app_buenatierra WITH LOGIN PASSWORD 'CHANGE_APP_PASSWORD_HERE'
        NOSUPERUSER NOCREATEDB NOCREATEROLE;
EXCEPTION WHEN duplicate_object THEN
    RAISE NOTICE 'Role app_buenatierra already exists';
END $$;

DO $$ BEGIN
    CREATE ROLE app_readonly WITH LOGIN PASSWORD 'CHANGE_READONLY_PASSWORD_HERE'
        NOSUPERUSER NOCREATEDB NOCREATEROLE;
EXCEPTION WHEN duplicate_object THEN
    RAISE NOTICE 'Role app_readonly already exists';
END $$;

-- Permisos de escritura para app
GRANT CONNECT ON DATABASE buenatierra TO app_buenatierra;
GRANT USAGE ON SCHEMA public TO app_buenatierra;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_buenatierra;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_buenatierra;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO app_buenatierra;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_buenatierra;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO app_buenatierra;

-- Permisos sólo lectura
GRANT CONNECT ON DATABASE buenatierra TO app_readonly;
GRANT USAGE ON SCHEMA public TO app_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO app_readonly;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO app_readonly;

-- ============================================================
-- DATOS INICIALES: Alérgenos (Reglamento UE 1169/2011)
-- ============================================================
INSERT INTO alergenos(codigo, nombre) VALUES
('GLUTEN',      'Gluten (cereales con gluten)'),
('CRUSTACEOS',  'Crustáceos y sus derivados'),
('HUEVOS',      'Huevos y sus derivados'),
('PESCADO',     'Pescado y sus derivados'),
('CACAHUETES',  'Cacahuetes y sus derivados'),
('SOJA',        'Soja y sus derivados'),
('LACTEOS',     'Leche y sus derivados (lactosa)'),
('FRUTOS_SECOS','Frutos de cáscara'),
('APIO',        'Apio y sus derivados'),
('MOSTAZA',     'Mostaza y sus derivados'),
('SESAMO',      'Granos de sésamo y sus derivados'),
('SO2',         'Dióxido de azufre y sulfitos'),
('ALTRAMUCES',  'Altramuces y sus derivados'),
('MOLUSCOS',    'Moluscos y sus derivados')
ON CONFLICT DO NOTHING;

-- Empresa obrador de ejemplo
INSERT INTO empresas(nombre, nif, razon_social, es_obrador, activa) VALUES
('Obrador BuenaTierra', 'B12345678', 'BuenaTierra Pastelería S.L.', TRUE, TRUE)
ON CONFLICT DO NOTHING;

\echo 'Base de datos BuenaTierra creada correctamente.'
