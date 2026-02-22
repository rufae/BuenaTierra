# DISEÑO DE BASE DE DATOS - SISTEMA BUENATIERRA

## 1. ESPECIFICACIÓN TÉCNICA

### Tecnología: PostgreSQL 15+

**Justificación técnica:**
- ACID compliant (transacciones críticas para facturación)
- Soporte nativo de JSON/JSONB (metadatos de productos, configuraciones)
- Triggers y stored procedures complejos (automatización de lotes FIFO)
- Performance en consultas complejas con múltiples joins
- Soporte de particionado para datos históricos
- CTE recursivos para trazabilidad
- Licencia open source sin limitaciones
- Escalabilidad horizontal con replicación
- Soporte de full-text search nativo
- Maduro y estable en producción

### Configuración de Servidor

```yaml
Sistema: Docker + PostgreSQL 15.4
Recursos mínimos:
  CPU: 4 cores
  RAM: 8 GB
  Disco: 100 GB SSD (RAID 1)
  Red: 1 Gbps

Configuración PostgreSQL:
  max_connections: 100
  shared_buffers: 2GB
  effective_cache_size: 6GB
  work_mem: 10MB
  maintenance_work_mem: 512MB
  checkpoint_completion_target: 0.9
  wal_buffers: 16MB
  random_page_cost: 1.1
  effective_io_concurrency: 200
```

### Estrategia de Backup

- Backup completo diario (00:00)
- Backup incremental cada 4 horas
- WAL archiving continuo
- Retención: 30 días
- Backup offsite semanal
- RTO: 1 hora
- RPO: 15 minutos

---

## 2. MODELO DE DOMINIO

### Contextos Acotados (Bounded Contexts)

1. **Gestión de Entidades (Core)**
   - Empresas
   - Clientes
   - Usuarios
   - Permisos

2. **Catálogo de Productos**
   - Productos
   - Categorías
   - Ingredientes
   - Alérgenos
   - Recetas

3. **Producción y Lotes**
   - Producciones
   - Lotes
   - Trazabilidad

4. **Inventario**
   - Stock por lote
   - Movimientos de stock
   - Ajustes

5. **Ventas y Facturación**
   - Pedidos
   - Albaranes
   - Facturas
   - Líneas de documento

6. **Auditoría y Compliance**
   - Log de auditoría
   - Eventos del sistema
   - Trazabilidad regulatoria

---

## 3. ESQUEMA DE BASE DE DATOS

### 3.1. MÓDULO: CORE (Entidades y Usuarios)

#### Tabla: `empresas`

```sql
CREATE TABLE empresas (
    id                  SERIAL PRIMARY KEY,
    tipo                VARCHAR(20) NOT NULL CHECK (tipo IN ('OBRADOR', 'REPARTIDOR', 'CLIENTE_EMPRESA')),
    razon_social        VARCHAR(200) NOT NULL,
    nombre_comercial    VARCHAR(200),
    cif                 VARCHAR(20) UNIQUE NOT NULL,
    direccion           TEXT,
    codigo_postal       VARCHAR(10),
    ciudad              VARCHAR(100),
    provincia           VARCHAR(100),
    pais                VARCHAR(2) DEFAULT 'ES',
    telefono            VARCHAR(20),
    email               VARCHAR(100),
    web                 VARCHAR(200),
    
    -- Datos fiscales
    regimen_iva         VARCHAR(50),
    serie_facturacion   VARCHAR(10),
    contador_factura    INTEGER DEFAULT 0,
    contador_albaran    INTEGER DEFAULT 0,
    
    -- Control
    activo              BOOLEAN DEFAULT true,
    fecha_alta          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    fecha_baja          TIMESTAMP,
    
    -- Metadata
    logo_path           VARCHAR(500),
    configuracion       JSONB DEFAULT '{}'::jsonb,
    
    -- Auditoría
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by          INTEGER,
    updated_by          INTEGER
);

CREATE INDEX idx_empresas_tipo ON empresas(tipo);
CREATE INDEX idx_empresas_cif ON empresas(cif);
CREATE INDEX idx_empresas_activo ON empresas(activo);
```

#### Tabla: `clientes`

```sql
CREATE TABLE clientes (
    id                  SERIAL PRIMARY KEY,
    empresa_id          INTEGER NOT NULL REFERENCES empresas(id),
    tipo                VARCHAR(20) NOT NULL CHECK (tipo IN ('AUTONOMO', 'PARTICULAR', 'EMPRESA', 'REPARTIDOR')),
    
    -- Datos identificativos
    codigo_cliente      VARCHAR(20) UNIQUE NOT NULL,
    nombre              VARCHAR(200) NOT NULL,
    apellidos           VARCHAR(200),
    razon_social        VARCHAR(200),
    nif_cif             VARCHAR(20),
    
    -- Datos de contacto
    direccion           TEXT,
    codigo_postal       VARCHAR(10),
    ciudad              VARCHAR(100),
    provincia           VARCHAR(100),
    pais                VARCHAR(2) DEFAULT 'ES',
    telefono_1          VARCHAR(20),
    telefono_2          VARCHAR(20),
    email               VARCHAR(100),
    
    -- Condiciones comerciales
    descuento_general   NUMERIC(5,2) DEFAULT 0,
    forma_pago          VARCHAR(50),
    dias_pago           INTEGER DEFAULT 0,
    tarifa_id           INTEGER,
    
    -- Referencia a empresa repartidora (si el cliente pertenece a un repartidor)
    repartidor_empresa_id INTEGER REFERENCES empresas(id),
    
    -- Control
    activo              BOOLEAN DEFAULT true,
    fecha_alta          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    fecha_baja          TIMESTAMP,
    
    -- Notas
    notas               TEXT,
    
    -- Auditoría
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by          INTEGER,
    updated_by          INTEGER
);

CREATE INDEX idx_clientes_empresa ON clientes(empresa_id);
CREATE INDEX idx_clientes_codigo ON clientes(codigo_cliente);
CREATE INDEX idx_clientes_tipo ON clientes(tipo);
CREATE INDEX idx_clientes_repartidor ON clientes(repartidor_empresa_id);
CREATE INDEX idx_clientes_activo ON clientes(activo);
```

#### Tabla: `usuarios`

```sql
CREATE TABLE usuarios (
    id                  SERIAL PRIMARY KEY,
    empresa_id          INTEGER NOT NULL REFERENCES empresas(id),
    
    -- Credenciales
    username            VARCHAR(50) UNIQUE NOT NULL,
    password_hash       VARCHAR(255) NOT NULL,
    email               VARCHAR(100) UNIQUE NOT NULL,
    
    -- Datos personales
    nombre              VARCHAR(100) NOT NULL,
    apellidos           VARCHAR(100),
    
    -- Rol y permisos
    rol                 VARCHAR(20) NOT NULL CHECK (rol IN ('ADMIN', 'OBRADOR', 'REPARTIDOR', 'SOLO_LECTURA')),
    permisos            JSONB DEFAULT '{}'::jsonb,
    
    -- Control de sesión
    ultimo_acceso       TIMESTAMP,
    token_sesion        VARCHAR(500),
    sesion_expira       TIMESTAMP,
    intentos_fallidos   INTEGER DEFAULT 0,
    bloqueado           BOOLEAN DEFAULT false,
    
    -- Control
    activo              BOOLEAN DEFAULT true,
    fecha_alta          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    fecha_baja          TIMESTAMP,
    
    -- Auditoría
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by          INTEGER,
    updated_by          INTEGER
);

CREATE INDEX idx_usuarios_empresa ON usuarios(empresa_id);
CREATE INDEX idx_usuarios_username ON usuarios(username);
CREATE INDEX idx_usuarios_email ON usuarios(email);
CREATE INDEX idx_usuarios_rol ON usuarios(rol);
CREATE INDEX idx_usuarios_activo ON usuarios(activo);
```

---

### 3.2. MÓDULO: CATÁLOGO DE PRODUCTOS

#### Tabla: `categorias`

```sql
CREATE TABLE categorias (
    id                  SERIAL PRIMARY KEY,
    nombre              VARCHAR(100) NOT NULL,
    descripcion         TEXT,
    categoria_padre_id  INTEGER REFERENCES categorias(id),
    orden               INTEGER DEFAULT 0,
    activo              BOOLEAN DEFAULT true,
    
    -- Auditoría
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_categorias_padre ON categorias(categoria_padre_id);
```

#### Tabla: `productos`

```sql
CREATE TABLE productos (
    id                  SERIAL PRIMARY KEY,
    codigo              VARCHAR(50) UNIQUE NOT NULL,
    categoria_id        INTEGER REFERENCES categorias(id),
    
    -- Descripción
    nombre              VARCHAR(200) NOT NULL,
    descripcion         TEXT,
    descripcion_larga   TEXT,
    
    -- Presentación
    unidad_medida       VARCHAR(20) NOT NULL CHECK (unidad_medida IN ('UNIDAD', 'CAJA', 'KG', 'LITRO', 'BANDEJA')),
    unidades_por_caja   INTEGER,
    peso_neto           NUMERIC(10,3),
    peso_bruto          NUMERIC(10,3),
    
    -- Precios
    precio_venta        NUMERIC(10,2) NOT NULL,
    precio_coste        NUMERIC(10,2),
    precio_repartidor   NUMERIC(10,2),
    iva                 NUMERIC(5,2) DEFAULT 10.00,
    
    -- Producción
    es_fabricado        BOOLEAN DEFAULT true,
    tiempo_produccion   INTEGER, -- minutos
    caducidad_dias      INTEGER NOT NULL DEFAULT 7,
    
    -- Stock
    stock_minimo        INTEGER DEFAULT 0,
    stock_optimo        INTEGER DEFAULT 0,
    control_lote        BOOLEAN DEFAULT true,
    
    -- Trazabilidad
    requiere_trazabilidad BOOLEAN DEFAULT true,
    
    -- Control
    activo              BOOLEAN DEFAULT true,
    visible_clientes    BOOLEAN DEFAULT true,
    
    -- Multimedia
    imagen_url          VARCHAR(500),
    
    -- Metadata
    metadata            JSONB DEFAULT '{}'::jsonb,
    
    -- Auditoría
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by          INTEGER,
    updated_by          INTEGER
);

CREATE INDEX idx_productos_codigo ON productos(codigo);
CREATE INDEX idx_productos_categoria ON productos(categoria_id);
CREATE INDEX idx_productos_activo ON productos(activo);
CREATE INDEX idx_productos_nombre ON productos USING gin(to_tsvector('spanish', nombre));
```

#### Tabla: `ingredientes`

```sql
CREATE TABLE ingredientes (
    id                  SERIAL PRIMARY KEY,
    codigo              VARCHAR(50) UNIQUE NOT NULL,
    nombre              VARCHAR(200) NOT NULL,
    descripcion         TEXT,
    unidad_medida       VARCHAR(20) NOT NULL,
    activo              BOOLEAN DEFAULT true,
    
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### Tabla: `alergenos`

```sql
CREATE TABLE alergenos (
    id                  SERIAL PRIMARY KEY,
    codigo              VARCHAR(20) UNIQUE NOT NULL,
    nombre              VARCHAR(100) NOT NULL,
    normativa           VARCHAR(100), -- Ej: Reglamento UE 1169/2011
    activo              BOOLEAN DEFAULT true,
    
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### Tabla: `producto_ingredientes` (Recetas)

```sql
CREATE TABLE producto_ingredientes (
    id                  SERIAL PRIMARY KEY,
    producto_id         INTEGER NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
    ingrediente_id      INTEGER NOT NULL REFERENCES ingredientes(id),
    cantidad            NUMERIC(10,3) NOT NULL,
    unidad              VARCHAR(20) NOT NULL,
    orden               INTEGER DEFAULT 0,
    
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(producto_id, ingrediente_id)
);

CREATE INDEX idx_prod_ing_producto ON producto_ingredientes(producto_id);
CREATE INDEX idx_prod_ing_ingrediente ON producto_ingredientes(ingrediente_id);
```

#### Tabla: `producto_alergenos`

```sql
CREATE TABLE producto_alergenos (
    id                  SERIAL PRIMARY KEY,
    producto_id         INTEGER NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
    alergeno_id         INTEGER NOT NULL REFERENCES alergenos(id),
    tipo_presencia      VARCHAR(20) CHECK (tipo_presencia IN ('CONTIENE', 'TRAZAS')),
    
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(producto_id, alergeno_id)
);

CREATE INDEX idx_prod_aler_producto ON producto_alergenos(producto_id);
```

---

### 3.3. MÓDULO: PRODUCCIÓN Y LOTES

#### Tabla: `producciones`

```sql
CREATE TABLE producciones (
    id                  SERIAL PRIMARY KEY,
    empresa_id          INTEGER NOT NULL REFERENCES empresas(id),
    codigo              VARCHAR(50) UNIQUE NOT NULL,
    fecha_produccion    DATE NOT NULL,
    fecha_inicio        TIMESTAMP,
    fecha_fin           TIMESTAMP,
    
    -- Estado
    estado              VARCHAR(20) NOT NULL DEFAULT 'PLANIFICADA' 
                        CHECK (estado IN ('PLANIFICADA', 'EN_PROCESO', 'FINALIZADA', 'CANCELADA')),
    
    -- Responsable
    responsable_id      INTEGER REFERENCES usuarios(id),
    
    -- Notas
    notas               TEXT,
    
    -- Auditoría
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by          INTEGER,
    updated_by          INTEGER
);

CREATE INDEX idx_producciones_empresa ON producciones(empresa_id);
CREATE INDEX idx_producciones_fecha ON producciones(fecha_produccion);
CREATE INDEX idx_producciones_estado ON producciones(estado);
```

#### Tabla: `lotes`

```sql
CREATE TABLE lotes (
    id                  SERIAL PRIMARY KEY,
    codigo              VARCHAR(50) UNIQUE NOT NULL, -- Formato: DDMMYYYY o personalizado
    produccion_id       INTEGER REFERENCES producciones(id),
    producto_id         INTEGER NOT NULL REFERENCES productos(id),
    
    -- Fechas
    fecha_fabricacion   DATE NOT NULL,
    fecha_caducidad     DATE NOT NULL,
    
    -- Cantidades
    cantidad_producida  NUMERIC(10,2) NOT NULL,
    cantidad_disponible NUMERIC(10,2) NOT NULL,
    unidad              VARCHAR(20) NOT NULL,
    
    -- Trazabilidad
    trazabilidad_upstream TEXT, -- Ingredientes y proveedores
    
    -- Control de calidad
    calidad_verificada  BOOLEAN DEFAULT false,
    observaciones_calidad TEXT,
    
    -- Control
    activo              BOOLEAN DEFAULT true,
    bloqueado           BOOLEAN DEFAULT false, -- Para bloquear lote en caso de incidencia
    
    -- Metadata
    metadata            JSONB DEFAULT '{}'::jsonb,
    
    -- Auditoría
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by          INTEGER,
    updated_by          INTEGER
);

CREATE INDEX idx_lotes_codigo ON lotes(codigo);
CREATE INDEX idx_lotes_producto ON lotes(producto_id);
CREATE INDEX idx_lotes_produccion ON lotes(produccion_id);
CREATE INDEX idx_lotes_fecha_fab ON lotes(fecha_fabricacion);
CREATE INDEX idx_lotes_fecha_cad ON lotes(fecha_caducidad);
CREATE INDEX idx_lotes_activo_disponible ON lotes(activo, cantidad_disponible) WHERE cantidad_disponible > 0;
```

---

### 3.4. MÓDULO: INVENTARIO

#### Tabla: `stock`

```sql
CREATE TABLE stock (
    id                  SERIAL PRIMARY KEY,
    empresa_id          INTEGER NOT NULL REFERENCES empresas(id),
    producto_id         INTEGER NOT NULL REFERENCES productos(id),
    lote_id             INTEGER REFERENCES lotes(id),
    
    -- Cantidades
    cantidad            NUMERIC(10,2) NOT NULL DEFAULT 0,
    cantidad_reservada  NUMERIC(10,2) NOT NULL DEFAULT 0,
    cantidad_disponible NUMERIC(10,2) GENERATED ALWAYS AS (cantidad - cantidad_reservada) STORED,
    
    -- Ubicación (opcional para futuro)
    ubicacion           VARCHAR(100),
    
    -- Control
    fecha_actualizacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Auditoría
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(empresa_id, producto_id, lote_id)
);

CREATE INDEX idx_stock_empresa ON stock(empresa_id);
CREATE INDEX idx_stock_producto ON stock(producto_id);
CREATE INDEX idx_stock_lote ON stock(lote_id);
CREATE INDEX idx_stock_disponible ON stock(cantidad_disponible) WHERE cantidad_disponible > 0;
```

#### Tabla: `movimientos_stock`

```sql
CREATE TABLE movimientos_stock (
    id                  BIGSERIAL PRIMARY KEY,
    empresa_id          INTEGER NOT NULL REFERENCES empresas(id),
    producto_id         INTEGER NOT NULL REFERENCES productos(id),
    lote_id             INTEGER REFERENCES lotes(id),
    
    -- Tipo de movimiento
    tipo_movimiento     VARCHAR(30) NOT NULL CHECK (tipo_movimiento IN 
                        ('ENTRADA_PRODUCCION', 'SALIDA_VENTA', 'AJUSTE_INVENTARIO', 
                         'DEVOLUCION', 'MERMA', 'TRANSFERENCIA', 'RESERVA', 'LIBERACION_RESERVA')),
    
    -- Cantidades
    cantidad            NUMERIC(10,2) NOT NULL,
    cantidad_anterior   NUMERIC(10,2),
    cantidad_posterior  NUMERIC(10,2),
    
    -- Referencias
    documento_tipo      VARCHAR(30), -- 'ALBARAN', 'FACTURA', 'PRODUCCION', 'AJUSTE'
    documento_id        INTEGER,
    
    -- Datos
    fecha_movimiento    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    motivo              TEXT,
    
    -- Auditoría
    usuario_id          INTEGER REFERENCES usuarios(id),
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_movstock_empresa ON movimientos_stock(empresa_id);
CREATE INDEX idx_movstock_producto ON movimientos_stock(producto_id);
CREATE INDEX idx_movstock_lote ON movimientos_stock(lote_id);
CREATE INDEX idx_movstock_fecha ON movimientos_stock(fecha_movimiento);
CREATE INDEX idx_movstock_tipo ON movimientos_stock(tipo_movimiento);
CREATE INDEX idx_movstock_documento ON movimientos_stock(documento_tipo, documento_id);
```

---

### 3.5. MÓDULO: VENTAS Y FACTURACIÓN

#### Tabla: `pedidos`

```sql
CREATE TABLE pedidos (
    id                  SERIAL PRIMARY KEY,
    empresa_id          INTEGER NOT NULL REFERENCES empresas(id),
    cliente_id          INTEGER NOT NULL REFERENCES clientes(id),
    
    -- Numeración
    numero_pedido       VARCHAR(50) UNIQUE NOT NULL,
    
    -- Fechas
    fecha_pedido        DATE NOT NULL,
    fecha_entrega       DATE,
    
    -- Estado
    estado              VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE' 
                        CHECK (estado IN ('PENDIENTE', 'CONFIRMADO', 'EN_PREPARACION', 
                                         'SERVIDO', 'CANCELADO')),
    
    -- Importes
    base_imponible      NUMERIC(10,2) NOT NULL DEFAULT 0,
    total_iva           NUMERIC(10,2) NOT NULL DEFAULT 0,
    total               NUMERIC(10,2) NOT NULL DEFAULT 0,
    
    -- Observaciones
    observaciones       TEXT,
    
    -- Control
    albaran_generado    BOOLEAN DEFAULT false,
    
    -- Auditoría
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by          INTEGER,
    updated_by          INTEGER
);

CREATE INDEX idx_pedidos_empresa ON pedidos(empresa_id);
CREATE INDEX idx_pedidos_cliente ON pedidos(cliente_id);
CREATE INDEX idx_pedidos_numero ON pedidos(numero_pedido);
CREATE INDEX idx_pedidos_fecha ON pedidos(fecha_pedido);
CREATE INDEX idx_pedidos_estado ON pedidos(estado);
```

#### Tabla: `pedidos_lineas`

```sql
CREATE TABLE pedidos_lineas (
    id                  SERIAL PRIMARY KEY,
    pedido_id           INTEGER NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
    producto_id         INTEGER NOT NULL REFERENCES productos(id),
    
    -- Línea
    linea               INTEGER NOT NULL,
    descripcion         VARCHAR(500) NOT NULL,
    
    -- Cantidades
    cantidad            NUMERIC(10,2) NOT NULL,
    cantidad_servida    NUMERIC(10,2) DEFAULT 0,
    unidad              VARCHAR(20) NOT NULL,
    
    -- Precios
    precio_unitario     NUMERIC(10,2) NOT NULL,
    descuento           NUMERIC(5,2) DEFAULT 0,
    base_imponible      NUMERIC(10,2) NOT NULL,
    iva                 NUMERIC(5,2) NOT NULL,
    total_linea         NUMERIC(10,2) NOT NULL,
    
    -- Auditoría
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_pedlin_pedido ON pedidos_lineas(pedido_id);
CREATE INDEX idx_pedlin_producto ON pedidos_lineas(producto_id);
```

#### Tabla: `albaranes`

```sql
CREATE TABLE albaranes (
    id                  SERIAL PRIMARY KEY,
    empresa_id          INTEGER NOT NULL REFERENCES empresas(id),
    cliente_id          INTEGER NOT NULL REFERENCES clientes(id),
    pedido_id           INTEGER REFERENCES pedidos(id),
    
    -- Numeración
    numero_albaran      VARCHAR(50) UNIQUE NOT NULL,
    serie               VARCHAR(10),
    
    -- Fechas
    fecha_albaran       DATE NOT NULL,
    fecha_entrega       DATE,
    
    -- Referencia externa
    referencia_cliente  VARCHAR(100),
    
    -- Estado
    estado              VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE' 
                        CHECK (estado IN ('PENDIENTE', 'ENTREGADO', 'FACTURADO', 'CANCELADO')),
    
    -- Importes
    base_imponible      NUMERIC(10,2) NOT NULL DEFAULT 0,
    total_iva           NUMERIC(10,2) NOT NULL DEFAULT 0,
    total               NUMERIC(10,2) NOT NULL DEFAULT 0,
    
    -- Control de facturación
    facturado           BOOLEAN DEFAULT false,
    factura_id          INTEGER,
    
    -- Observaciones
    observaciones       TEXT,
    
    -- Auditoría
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by          INTEGER,
    updated_by          INTEGER
);

CREATE INDEX idx_albaranes_empresa ON albaranes(empresa_id);
CREATE INDEX idx_albaranes_cliente ON albaranes(cliente_id);
CREATE INDEX idx_albaranes_numero ON albaranes(numero_albaran);
CREATE INDEX idx_albaranes_fecha ON albaranes(fecha_albaran);
CREATE INDEX idx_albaranes_facturado ON albaranes(facturado);
CREATE INDEX idx_albaranes_estado ON albaranes(estado);
```

#### Tabla: `albaranes_lineas`

```sql
CREATE TABLE albaranes_lineas (
    id                  SERIAL PRIMARY KEY,
    albaran_id          INTEGER NOT NULL REFERENCES albaranes(id) ON DELETE CASCADE,
    producto_id         INTEGER NOT NULL REFERENCES productos(id),
    lote_id             INTEGER REFERENCES lotes(id), -- CLAVE: cada línea tiene su lote
    
    -- Línea
    linea               INTEGER NOT NULL,
    descripcion         VARCHAR(500) NOT NULL,
    
    -- Cantidades
    cantidad            NUMERIC(10,2) NOT NULL,
    unidad              VARCHAR(20) NOT NULL,
    
    -- Precios
    precio_unitario     NUMERIC(10,2) NOT NULL,
    descuento           NUMERIC(5,2) DEFAULT 0,
    base_imponible      NUMERIC(10,2) NOT NULL,
    iva                 NUMERIC(5,2) NOT NULL,
    total_linea         NUMERIC(10,2) NOT NULL,
    
    -- Auditoría
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_alblin_albaran ON albaranes_lineas(albaran_id);
CREATE INDEX idx_alblin_producto ON albaranes_lineas(producto_id);
CREATE INDEX idx_alblin_lote ON albaranes_lineas(lote_id);
```

#### Tabla: `facturas`

```sql
CREATE TABLE facturas (
    id                  SERIAL PRIMARY KEY,
    empresa_id          INTEGER NOT NULL REFERENCES empresas(id),
    cliente_id          INTEGER NOT NULL REFERENCES clientes(id),
    
    -- Numeración
    numero_factura      VARCHAR(50) UNIQUE NOT NULL,
    serie               VARCHAR(10) NOT NULL,
    
    -- Tipo
    tipo_factura        VARCHAR(30) NOT NULL DEFAULT 'SIMPLIFICADA' 
                        CHECK (tipo_factura IN ('SIMPLIFICADA', 'COMPLETA', 'RECTIFICATIVA')),
    
    -- Fechas
    fecha_factura       DATE NOT NULL,
    fecha_vencimiento   DATE,
    
    -- Referencia
    factura_rectifica_id INTEGER REFERENCES facturas(id),
    motivo_rectificacion TEXT,
    
    -- Importes
    base_imponible      NUMERIC(10,2) NOT NULL,
    total_iva           NUMERIC(10,2) NOT NULL,
    total               NUMERIC(10,2) NOT NULL,
    retencion_irpf      NUMERIC(10,2) DEFAULT 0,
    total_factura       NUMERIC(10,2) NOT NULL,
    
    -- Pago
    forma_pago          VARCHAR(50),
    estado_pago         VARCHAR(20) DEFAULT 'PENDIENTE' 
                        CHECK (estado_pago IN ('PENDIENTE', 'PAGADA', 'IMPAGADA', 'CANCELADA')),
    fecha_pago          DATE,
    
    -- Generación
    generada_desde      VARCHAR(20), -- 'ALBARAN', 'DIRECTA'
    
    -- Documentos
    pdf_path            VARCHAR(500),
    
    -- Observaciones
    observaciones       TEXT,
    
    -- Control
    anulada             BOOLEAN DEFAULT false,
    fecha_anulacion     TIMESTAMP,
    motivo_anulacion    TEXT,
    
    -- Auditoría
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by          INTEGER,
    updated_by          INTEGER
);

CREATE INDEX idx_facturas_empresa ON facturas(empresa_id);
CREATE INDEX idx_facturas_cliente ON facturas(cliente_id);
CREATE INDEX idx_facturas_numero ON facturas(numero_factura);
CREATE INDEX idx_facturas_fecha ON facturas(fecha_factura);
CREATE INDEX idx_facturas_estado_pago ON facturas(estado_pago);
CREATE INDEX idx_facturas_serie ON facturas(serie);
```

#### Tabla: `facturas_lineas`

```sql
CREATE TABLE facturas_lineas (
    id                  SERIAL PRIMARY KEY,
    factura_id          INTEGER NOT NULL REFERENCES facturas(id) ON DELETE CASCADE,
    producto_id         INTEGER NOT NULL REFERENCES productos(id),
    lote_id             INTEGER REFERENCES lotes(id), -- CLAVE: trazabilidad completa
    albaran_linea_id    INTEGER REFERENCES albaranes_lineas(id), -- Para vincular con albarán
    
    -- Línea
    linea               INTEGER NOT NULL,
    descripcion         VARCHAR(500) NOT NULL,
    
    -- Cantidades
    cantidad            NUMERIC(10,2) NOT NULL,
    unidad              VARCHAR(20) NOT NULL,
    
    -- Precios
    precio_unitario     NUMERIC(10,2) NOT NULL,
    descuento           NUMERIC(5,2) DEFAULT 0,
    base_imponible      NUMERIC(10,2) NOT NULL,
    iva                 NUMERIC(5,2) NOT NULL,
    total_linea         NUMERIC(10,2) NOT NULL,
    
    -- Auditoría
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_faclin_factura ON facturas_lineas(factura_id);
CREATE INDEX idx_faclin_producto ON facturas_lineas(producto_id);
CREATE INDEX idx_faclin_lote ON facturas_lineas(lote_id);
CREATE INDEX idx_faclin_albaran_linea ON facturas_lineas(albaran_linea_id);
```

---

### 3.6. MÓDULO: AUDITORÍA Y TRAZABILIDAD

#### Tabla: `trazabilidad`

```sql
CREATE TABLE trazabilidad (
    id                  BIGSERIAL PRIMARY KEY,
    
    -- Producto y lote
    producto_id         INTEGER NOT NULL REFERENCES productos(id),
    lote_id             INTEGER NOT NULL REFERENCES lotes(id),
    
    -- Origen
    tipo_origen         VARCHAR(30) NOT NULL, -- 'PRODUCCION', 'VENTA', 'AJUSTE'
    origen_id           INTEGER NOT NULL,
    
    -- Destino/Cliente
    cliente_id          INTEGER REFERENCES clientes(id),
    documento_tipo      VARCHAR(30), -- 'ALBARAN', 'FACTURA'
    documento_id        INTEGER,
    
    -- Cantidad
    cantidad            NUMERIC(10,2) NOT NULL,
    unidad              VARCHAR(20),
    
    -- Fechas
    fecha_movimiento    TIMESTAMP NOT NULL,
    
    -- Metadata
    metadata            JSONB DEFAULT '{}'::jsonb,
    
    -- Auditoría
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_trazab_producto ON trazabilidad(producto_id);
CREATE INDEX idx_trazab_lote ON trazabilidad(lote_id);
CREATE INDEX idx_trazab_cliente ON trazabilidad(cliente_id);
CREATE INDEX idx_trazab_documento ON trazabilidad(documento_tipo, documento_id);
CREATE INDEX idx_trazab_fecha ON trazabilidad(fecha_movimiento);
```

#### Tabla: `auditoria`

```sql
CREATE TABLE auditoria (
    id                  BIGSERIAL PRIMARY KEY,
    
    -- Operación
    tabla               VARCHAR(100) NOT NULL,
    operacion           VARCHAR(10) NOT NULL CHECK (operacion IN ('INSERT', 'UPDATE', 'DELETE')),
    registro_id         INTEGER NOT NULL,
    
    -- Datos
    datos_anteriores    JSONB,
    datos_nuevos        JSONB,
    
    -- Usuario
    usuario_id          INTEGER REFERENCES usuarios(id),
    empresa_id          INTEGER REFERENCES empresas(id),
    
    -- IP y contexto
    ip_address          INET,
    user_agent          TEXT,
    
    -- Timestamp
    timestamp           TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_audit_tabla ON auditoria(tabla);
CREATE INDEX idx_audit_registro ON auditoria(tabla, registro_id);
CREATE INDEX idx_audit_usuario ON auditoria(usuario_id);
CREATE INDEX idx_audit_timestamp ON auditoria(timestamp);
CREATE INDEX idx_audit_operacion ON auditoria(operacion);
```

#### Tabla: `eventos_sistema`

```sql
CREATE TABLE eventos_sistema (
    id                  BIGSERIAL PRIMARY KEY,
    tipo_evento         VARCHAR(50) NOT NULL,
    nivel               VARCHAR(20) NOT NULL CHECK (nivel IN ('INFO', 'WARNING', 'ERROR', 'CRITICAL')),
    mensaje             TEXT NOT NULL,
    detalles            JSONB,
    usuario_id          INTEGER REFERENCES usuarios(id),
    empresa_id          INTEGER REFERENCES empresas(id),
    timestamp           TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_eventos_tipo ON eventos_sistema(tipo_evento);
CREATE INDEX idx_eventos_nivel ON eventos_sistema(nivel);
CREATE INDEX idx_eventos_timestamp ON eventos_sistema(timestamp);
CREATE INDEX idx_eventos_usuario ON eventos_sistema(usuario_id);
```

---

## 4. TRIGGERS Y STORED PROCEDURES

### 4.1. Trigger: Actualización de `updated_at`

```sql
CREATE OR REPLACE FUNCTION update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Aplicar a todas las tablas relevantes
CREATE TRIGGER update_empresas_timestamp BEFORE UPDATE ON empresas
    FOR EACH ROW EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER update_clientes_timestamp BEFORE UPDATE ON clientes
    FOR EACH ROW EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER update_usuarios_timestamp BEFORE UPDATE ON usuarios
    FOR EACH ROW EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER update_productos_timestamp BEFORE UPDATE ON productos
    FOR EACH ROW EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER update_lotes_timestamp BEFORE UPDATE ON lotes
    FOR EACH ROW EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER update_stock_timestamp BEFORE UPDATE ON stock
    FOR EACH ROW EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER update_pedidos_timestamp BEFORE UPDATE ON pedidos
    FOR EACH ROW EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER update_albaranes_timestamp BEFORE UPDATE ON albaranes
    FOR EACH ROW EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER update_facturas_timestamp BEFORE UPDATE ON facturas
    FOR EACH ROW EXECUTE FUNCTION update_timestamp();
```

### 4.2. Stored Procedure: Asignación Automática de Lotes (FIFO)

**CRÍTICO: Motor de automatización de lotes**

```sql
CREATE OR REPLACE FUNCTION asignar_lotes_automatico(
    p_empresa_id INTEGER,
    p_producto_id INTEGER,
    p_cantidad_solicitada NUMERIC,
    OUT lineas_asignadas JSONB
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_cantidad_restante NUMERIC;
    v_lote RECORD;
    v_lineas JSONB := '[]'::jsonb;
    v_linea JSONB;
BEGIN
    v_cantidad_restante := p_cantidad_solicitada;
    
    -- Obtener lotes disponibles ordenados por FIFO (fecha de fabricación ascendente)
    FOR v_lote IN
        SELECT 
            l.id,
            l.codigo,
            l.fecha_fabricacion,
            l.fecha_caducidad,
            s.cantidad_disponible
        FROM lotes l
        INNER JOIN stock s ON l.id = s.lote_id
        WHERE s.empresa_id = p_empresa_id
          AND s.producto_id = p_producto_id
          AND l.activo = true
          AND l.bloqueado = false
          AND s.cantidad_disponible > 0
          AND l.fecha_caducidad > CURRENT_DATE -- No asignar lotes caducados
        ORDER BY l.fecha_fabricacion ASC, l.id ASC
    LOOP
        IF v_cantidad_restante <= 0 THEN
            EXIT;
        END IF;
        
        -- Calcular cantidad a asignar de este lote
        DECLARE
            v_cantidad_asignar NUMERIC;
        BEGIN
            IF v_lote.cantidad_disponible >= v_cantidad_restante THEN
                v_cantidad_asignar := v_cantidad_restante;
                v_cantidad_restante := 0;
            ELSE
                v_cantidad_asignar := v_lote.cantidad_disponible;
                v_cantidad_restante := v_cantidad_restante - v_cantidad_asignar;
            END IF;
            
            -- Crear objeto JSON con la línea asignada
            v_linea := jsonb_build_object(
                'lote_id', v_lote.id,
                'lote_codigo', v_lote.codigo,
                'cantidad', v_cantidad_asignar,
                'fecha_caducidad', v_lote.fecha_caducidad
            );
            
            -- Agregar línea al array
            v_lineas := v_lineas || v_linea;
        END;
    END LOOP;
    
    -- Verificar si se pudo asignar toda la cantidad
    IF v_cantidad_restante > 0 THEN
        RAISE EXCEPTION 'Stock insuficiente. Solicitado: %, Disponible: %', 
            p_cantidad_solicitada, 
            p_cantidad_solicitada - v_cantidad_restante;
    END IF;
    
    lineas_asignadas := v_lineas;
END;
$$;
```

### 4.3. Stored Procedure: Actualizar Stock tras Venta

```sql
CREATE OR REPLACE FUNCTION actualizar_stock_venta(
    p_empresa_id INTEGER,
    p_producto_id INTEGER,
    p_lote_id INTEGER,
    p_cantidad NUMERIC,
    p_documento_tipo VARCHAR,
    p_documento_id INTEGER,
    p_usuario_id INTEGER
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
    v_cantidad_anterior NUMERIC;
    v_cantidad_posterior NUMERIC;
BEGIN
    -- Obtener cantidad actual
    SELECT cantidad INTO v_cantidad_anterior
    FROM stock
    WHERE empresa_id = p_empresa_id
      AND producto_id = p_producto_id
      AND lote_id = p_lote_id;
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Stock no encontrado para empresa %, producto %, lote %', 
            p_empresa_id, p_producto_id, p_lote_id;
    END IF;
    
    IF v_cantidad_anterior < p_cantidad THEN
        RAISE EXCEPTION 'Stock insuficiente. Disponible: %, Requerido: %', 
            v_cantidad_anterior, p_cantidad;
    END IF;
    
    -- Actualizar stock
    UPDATE stock
    SET cantidad = cantidad - p_cantidad,
        fecha_actualizacion = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
    WHERE empresa_id = p_empresa_id
      AND producto_id = p_producto_id
      AND lote_id = p_lote_id;
    
    -- Actualizar lote
    UPDATE lotes
    SET cantidad_disponible = cantidad_disponible - p_cantidad,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = p_lote_id;
    
    -- Registrar movimiento
    v_cantidad_posterior := v_cantidad_anterior - p_cantidad;
    
    INSERT INTO movimientos_stock (
        empresa_id, producto_id, lote_id, tipo_movimiento,
        cantidad, cantidad_anterior, cantidad_posterior,
        documento_tipo, documento_id, usuario_id
    ) VALUES (
        p_empresa_id, p_producto_id, p_lote_id, 'SALIDA_VENTA',
        p_cantidad, v_cantidad_anterior, v_cantidad_posterior,
        p_documento_tipo, p_documento_id, p_usuario_id
    );
END;
$$;
```

### 4.4. Stored Procedure: Registrar Entrada de Producción

```sql
CREATE OR REPLACE FUNCTION crear_entrada_produccion(
    p_empresa_id INTEGER,
    p_produccion_id INTEGER,
    p_producto_id INTEGER,
    p_cantidad NUMERIC,
    p_fecha_fabricacion DATE,
    p_usuario_id INTEGER,
    OUT lote_id INTEGER,
    OUT lote_codigo VARCHAR
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_fecha_caducidad DATE;
    v_dias_caducidad INTEGER;
BEGIN
    -- Obtener días de caducidad del producto
    SELECT caducidad_dias INTO v_dias_caducidad
    FROM productos
    WHERE id = p_producto_id;
    
    -- Calcular fecha de caducidad
    v_fecha_caducidad := p_fecha_fabricacion + v_dias_caducidad;
    
    -- Generar código de lote (formato DDMMYYYY más secuencia si hay duplicados)
    DECLARE
        v_base_codigo VARCHAR;
        v_contador INTEGER := 0;
        v_codigo_final VARCHAR;
        v_existe BOOLEAN;
    BEGIN
        v_base_codigo := TO_CHAR(p_fecha_fabricacion, 'DDMMYYYY');
        v_codigo_final := v_base_codigo;
        
        -- Verificar si existe y generar secuencia
        LOOP
            SELECT EXISTS(SELECT 1 FROM lotes WHERE codigo = v_codigo_final) INTO v_existe;
            
            IF NOT v_existe THEN
                EXIT;
            END IF;
            
            v_contador := v_contador + 1;
            v_codigo_final := v_base_codigo || '-' || v_contador::TEXT;
        END LOOP;
        
        lote_codigo := v_codigo_final;
    END;
    
    -- Crear lote
    INSERT INTO lotes (
        codigo, produccion_id, producto_id,
        fecha_fabricacion, fecha_caducidad,
        cantidad_producida, cantidad_disponible, unidad,
        created_by, updated_by
    ) VALUES (
        lote_codigo, p_produccion_id, p_producto_id,
        p_fecha_fabricacion, v_fecha_caducidad,
        p_cantidad, p_cantidad, 'UNIDAD',
        p_usuario_id, p_usuario_id
    ) RETURNING id INTO lote_id;
    
    -- Crear o actualizar stock
    INSERT INTO stock (empresa_id, producto_id, lote_id, cantidad)
    VALUES (p_empresa_id, p_producto_id, lote_id, p_cantidad)
    ON CONFLICT (empresa_id, producto_id, lote_id)
    DO UPDATE SET cantidad = stock.cantidad + p_cantidad,
                  fecha_actualizacion = CURRENT_TIMESTAMP;
    
    -- Registrar movimiento
    INSERT INTO movimientos_stock (
        empresa_id, producto_id, lote_id, tipo_movimiento,
        cantidad, documento_tipo, documento_id, usuario_id
    ) VALUES (
        p_empresa_id, p_producto_id, lote_id, 'ENTRADA_PRODUCCION',
        p_cantidad, 'PRODUCCION', p_produccion_id, p_usuario_id
    );
    
    -- Registrar trazabilidad
    INSERT INTO trazabilidad (
        producto_id, lote_id, tipo_origen, origen_id,
        cantidad, unidad, fecha_movimiento
    ) VALUES (
        p_producto_id, lote_id, 'PRODUCCION', p_produccion_id,
        p_cantidad, 'UNIDAD', CURRENT_TIMESTAMP
    );
END;
$$;
```

### 4.5. Trigger: Auditoría Automática

```sql
CREATE OR REPLACE FUNCTION registrar_auditoria()
RETURNS TRIGGER AS $$
DECLARE
    v_datos_anteriores JSONB;
    v_datos_nuevos JSONB;
    v_usuario_id INTEGER;
BEGIN
    -- Obtener usuario del contexto de la sesión (si existe)
    BEGIN
        v_usuario_id := current_setting('app.current_user_id')::INTEGER;
    EXCEPTION
        WHEN OTHERS THEN
            v_usuario_id := NULL;
    END;
    
    IF (TG_OP = 'DELETE') THEN
        v_datos_anteriores := to_jsonb(OLD);
        v_datos_nuevos := NULL;
        
        INSERT INTO auditoria (tabla, operacion, registro_id, datos_anteriores, datos_nuevos, usuario_id)
        VALUES (TG_TABLE_NAME, TG_OP, OLD.id, v_datos_anteriores, v_datos_nuevos, v_usuario_id);
        
        RETURN OLD;
    ELSIF (TG_OP = 'UPDATE') THEN
        v_datos_anteriores := to_jsonb(OLD);
        v_datos_nuevos := to_jsonb(NEW);
        
        INSERT INTO auditoria (tabla, operacion, registro_id, datos_anteriores, datos_nuevos, usuario_id)
        VALUES (TG_TABLE_NAME, TG_OP, NEW.id, v_datos_anteriores, v_datos_nuevos, v_usuario_id);
        
        RETURN NEW;
    ELSIF (TG_OP = 'INSERT') THEN
        v_datos_nuevos := to_jsonb(NEW);
        
        INSERT INTO auditoria (tabla, operacion, registro_id, datos_anteriores, datos_nuevos, usuario_id)
        VALUES (TG_TABLE_NAME, TG_OP, NEW.id, NULL, v_datos_nuevos, v_usuario_id);
        
        RETURN NEW;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Aplicar a tablas críticas
CREATE TRIGGER audit_empresas AFTER INSERT OR UPDATE OR DELETE ON empresas
    FOR EACH ROW EXECUTE FUNCTION registrar_auditoria();

CREATE TRIGGER audit_facturas AFTER INSERT OR UPDATE OR DELETE ON facturas
    FOR EACH ROW EXECUTE FUNCTION registrar_auditoria();

CREATE TRIGGER audit_lotes AFTER INSERT OR UPDATE OR DELETE ON lotes
    FOR EACH ROW EXECUTE FUNCTION registrar_auditoria();

CREATE TRIGGER audit_stock AFTER UPDATE ON stock
    FOR EACH ROW EXECUTE FUNCTION registrar_auditoria();
```

---

## 5. VISTAS PARA REPORTING

### 5.1. Vista: Stock Consolidado

```sql
CREATE OR REPLACE VIEW v_stock_consolidado AS
SELECT 
    e.id AS empresa_id,
    e.nombre_comercial AS empresa,
    p.id AS producto_id,
    p.codigo AS producto_codigo,
    p.nombre AS producto_nombre,
    l.id AS lote_id,
    l.codigo AS lote_codigo,
    l.fecha_fabricacion,
    l.fecha_caducidad,
    CASE 
        WHEN l.fecha_caducidad < CURRENT_DATE THEN 'CADUCADO'
        WHEN l.fecha_caducidad < CURRENT_DATE + INTERVAL '7 days' THEN 'PROXIMO_CADUCAR'
        ELSE 'VIGENTE'
    END AS estado_caducidad,
    s.cantidad,
    s.cantidad_reservada,
    s.cantidad_disponible,
    p.unidad_medida,
    p.stock_minimo,
    CASE 
        WHEN s.cantidad_disponible <= p.stock_minimo THEN true
        ELSE false
    END AS alerta_stock_minimo
FROM stock s
INNER JOIN empresas e ON s.empresa_id = e.id
INNER JOIN productos p ON s.producto_id = p.id
LEFT JOIN lotes l ON s.lote_id = l.id
WHERE s.cantidad > 0
  AND (l.id IS NULL OR l.activo = true);
```

### 5.2. Vista: Trazabilidad Completa

```sql
CREATE OR REPLACE VIEW v_trazabilidad_completa AS
SELECT 
    t.id,
    p.codigo AS producto_codigo,
    p.nombre AS producto_nombre,
    l.codigo AS lote_codigo,
    l.fecha_fabricacion,
    l.fecha_caducidad,
    c.codigo_cliente,
    c.nombre AS cliente_nombre,
    t.documento_tipo,
    t.documento_id,
    t.cantidad,
    t.fecha_movimiento,
    CASE 
        WHEN t.documento_tipo = 'FACTURA' THEN 
            (SELECT f.numero_factura FROM facturas f WHERE f.id = t.documento_id)
        WHEN t.documento_tipo = 'ALBARAN' THEN 
            (SELECT a.numero_albaran FROM albaranes a WHERE a.id = t.documento_id)
        ELSE NULL
    END AS numero_documento
FROM trazabilidad t
INNER JOIN productos p ON t.producto_id = p.id
INNER JOIN lotes l ON t.lote_id = l.id
LEFT JOIN clientes c ON t.cliente_id = c.id;
```

### 5.3. Vista: Ventas Consolidadas

```sql
CREATE OR REPLACE VIEW v_ventas_consolidadas AS
SELECT 
    f.id AS factura_id,
    f.numero_factura,
    f.fecha_factura,
    e.nombre_comercial AS empresa,
    c.codigo_cliente,
    c.nombre AS cliente_nombre,
    c.tipo AS cliente_tipo,
    fl.producto_id,
    p.codigo AS producto_codigo,
    p.nombre AS producto_nombre,
    fl.cantidad,
    fl.precio_unitario,
    fl.descuento,
    fl.base_imponible,
    fl.iva,
    fl.total_linea,
    f.total_factura,
    f.estado_pago,
    l.codigo AS lote_codigo,
    l.fecha_fabricacion,
    l.fecha_caducidad
FROM facturas f
INNER JOIN empresas e ON f.empresa_id = e.id
INNER JOIN clientes c ON f.cliente_id = c.id
INNER JOIN facturas_lineas fl ON f.id = fl.factura_id
INNER JOIN productos p ON fl.producto_id = p.id
LEFT JOIN lotes l ON fl.lote_id = l.id
WHERE f.anulada = false;
```

---

## 6. ÍNDICES ADICIONALES PARA PERFORMANCE

```sql
-- Índices compuestos para consultas frecuentes
CREATE INDEX idx_stock_empresa_producto_disponible 
    ON stock(empresa_id, producto_id, cantidad_disponible) 
    WHERE cantidad_disponible > 0;

CREATE INDEX idx_lotes_producto_fecha_activo 
    ON lotes(producto_id, fecha_fabricacion, id) 
    WHERE activo = true AND bloqueado = false;

CREATE INDEX idx_facturas_empresa_fecha_serie 
    ON facturas(empresa_id, fecha_factura DESC, serie);

CREATE INDEX idx_albaranes_no_facturados 
    ON albaranes(empresa_id, fecha_albaran) 
    WHERE facturado = false;

-- Índices para búsquedas de texto
CREATE INDEX idx_productos_busqueda 
    ON productos USING gin(to_tsvector('spanish', nombre || ' ' || COALESCE(descripcion, '')));

CREATE INDEX idx_clientes_busqueda 
    ON clientes USING gin(to_tsvector('spanish', nombre || ' ' || COALESCE(apellidos, '') || ' ' || COALESCE(razon_social, '')));
```

---

## 7. POLÍTICAS DE SEGURIDAD Y DATOS

### 7.1. Row Level Security (RLS) - Futuro

Preparado para activar RLS por empresa/rol:

```sql
-- Habilitar RLS en tablas críticas (desactivado inicialmente)
-- ALTER TABLE clientes ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE facturas ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE stock ENABLE ROW LEVEL SECURITY;

-- Políticas ejemplo (implementar según necesidad):
-- CREATE POLICY clientes_empresa_policy ON clientes
--     USING (empresa_id = current_setting('app.current_empresa_id')::INTEGER);
```

### 7.2. Roles de Base de Datos

```sql
-- Role para aplicación (conexión normal)
CREATE ROLE app_buenatierra WITH LOGIN PASSWORD 'CAMBIAR_EN_PRODUCCION';
GRANT CONNECT ON DATABASE buenatierra TO app_buenatierra;
GRANT USAGE ON SCHEMA public TO app_buenatierra;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_buenatierra;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_buenatierra;

-- Role solo lectura (para reporting/analytics)
CREATE ROLE app_readonly WITH LOGIN PASSWORD 'CAMBIAR_EN_PRODUCCION';
GRANT CONNECT ON DATABASE buenatierra TO app_readonly;
GRANT USAGE ON SCHEMA public TO app_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO app_readonly;
```

### 7.3. Configuración de Conexión

```ini
[Producción]
Host: servidor-docker.dominio.com
Port: 5432
Database: buenatierra
User: app_buenatierra
Password: [Almacenar en secrets manager o variables de entorno]
SSLMode: require
Pooling: true
MinPoolSize: 5
MaxPoolSize: 50
ConnectionTimeout: 30
CommandTimeout: 60
```

---

## 8. MANTENIMIENTO Y OPTIMIZACIÓN

### 8.1. Particionado de Tablas Históricas (Futuro)

Para `movimientos_stock`, `auditoria`, `eventos_sistema`:

```sql
-- Ejemplo de particionado por año (implementar cuando crezca)
-- CREATE TABLE movimientos_stock_2026 PARTITION OF movimientos_stock
--     FOR VALUES FROM ('2026-01-01') TO ('2027-01-01');
```

### 8.2. Jobs de Mantenimiento

```sql
-- Vacuum y analyze automático (configurar en cron o pg_cron)
-- VACUUM ANALYZE facturas;
-- VACUUM ANALYZE movimientos_stock;
-- REINDEX INDEX idx_lotes_producto_fecha_activo;
```

### 8.3. Limpieza de Datos Antiguos

```sql
-- Política de retención: eliminar auditorías > 2 años
-- DELETE FROM auditoria WHERE timestamp < NOW() - INTERVAL '2 years';

-- Archivar facturas antiguas (> 5 años) a tabla histórica
-- INSERT INTO facturas_historico SELECT * FROM facturas WHERE fecha_factura < NOW() - INTERVAL '5 years';
-- DELETE FROM facturas WHERE fecha_factura < NOW() - INTERVAL '5 years';
```

---

## 9. SCRIPT DE INICIALIZACIÓN

### 9.1. Datos Maestros Iniciales

```sql
-- Insertar empresa obrador principal
INSERT INTO empresas (tipo, razon_social, nombre_comercial, cif, direccion, ciudad, provincia)
VALUES ('OBRADOR', 'BUENATIERRA S.L.', 'Buenatierra', 'B12345678', 'Calle Principal 123', 'Ciudad', 'Provincia');

-- Insertar usuario admin inicial
INSERT INTO usuarios (empresa_id, username, password_hash, email, nombre, apellidos, rol)
VALUES (1, 'admin', '$2a$12$HASH_EJEMPLO', 'admin@buenatierra.com', 'Administrador', 'Sistema', 'ADMIN');

-- Insertar categorías base
INSERT INTO categorias (nombre, descripcion) VALUES
('Pasteles', 'Productos de pastelería'),
('Dulces', 'Dulces y confitería'),
('Bollería', 'Bollería y pan dulce'),
('Galletas', 'Galletas artesanas');

-- Insertar alérgenos según normativa
INSERT INTO alergenos (codigo, nombre, normativa) VALUES
('ALE01', 'Gluten', 'Reglamento UE 1169/2011'),
('ALE02', 'Leche', 'Reglamento UE 1169/2011'),
('ALE03', 'Huevos', 'Reglamento UE 1169/2011'),
('ALE04', 'Frutos de cáscara', 'Reglamento UE 1169/2011'),
('ALE05', 'Soja', 'Reglamento UE 1169/2011'),
('ALE06', 'Sulfitos', 'Reglamento UE 1169/2011');
```

---

## 10. DIAGRAMA ENTIDAD-RELACIÓN (Textual)

```
EMPRESAS (PK: id)
    ├── USUARIOS (FK: empresa_id)
    ├── CLIENTES (FK: empresa_id, repartidor_empresa_id)
    ├── PRODUCCIONES (FK: empresa_id)
    ├── STOCK (FK: empresa_id)
    ├── PEDIDOS (FK: empresa_id)
    ├── ALBARANES (FK: empresa_id)
    └── FACTURAS (FK: empresa_id)

PRODUCTOS (PK: id)
    ├── LOTES (FK: producto_id)
    ├── STOCK (FK: producto_id)
    ├── PRODUCTO_INGREDIENTES (FK: producto_id)
    ├── PRODUCTO_ALERGENOS (FK: producto_id)
    ├── PEDIDOS_LINEAS (FK: producto_id)
    ├── ALBARANES_LINEAS (FK: producto_id)
    ├── FACTURAS_LINEAS (FK: producto_id)
    └── TRAZABILIDAD (FK: producto_id)

LOTES (PK: id)
    ├── STOCK (FK: lote_id)
    ├── MOVIMIENTOS_STOCK (FK: lote_id)
    ├── ALBARANES_LINEAS (FK: lote_id)
    ├── FACTURAS_LINEAS (FK: lote_id)
    └── TRAZABILIDAD (FK: lote_id)

CLIENTES (PK: id)
    ├── PEDIDOS (FK: cliente_id)
    ├── ALBARANES (FK: cliente_id)
    ├── FACTURAS (FK: cliente_id)
    └── TRAZABILIDAD (FK: cliente_id)

ALBARANES (PK: id)
    ├── ALBARANES_LINEAS (FK: albaran_id)
    └── FACTURAS (conversión)

FACTURAS (PK: id)
    └── FACTURAS_LINEAS (FK: factura_id)
```

---

## 11. TECNOLOGÍAS COMPLEMENTARIAS REQUERIDAS

### Backend Recomendado:
- **ASP.NET Core 7/8** (C#) - Robusto, enterprise-grade, excelente con PostgreSQL vía Npgsql/EF Core
- **Alternativa**: Node.js + NestJS con TypeORM o Prisma

### ORM:
- **Entity Framework Core** (si .NET) con Npgsql provider
- **Dapper** para consultas de alta performance
- **Alternativa**: Prisma (si Node.js)

### Connection Pooling:
- PgBouncer o Npgsql built-in pooling

### Migrationsal:
- **EF Core Migrations** o Flyway/Liquibase

### Monitorización:
- pgAdmin 4
- Grafana + Prometheus
- PM2 (si Node.js)

---

## CONCLUSIÓN

Esta base de datos está diseñada para:

✅ **Trazabilidad total**: Cada venta está vinculada a lote específico  
✅ **Automatización FIFO**: Stored procedure de asignación automática  
✅ **Multiempresa**: Soporta obrador + múltiples repartidores  
✅ **Escalabilidad**: Índices optimizados, particionado preparado  
✅ **Auditoría**: Registro completo de operaciones  
✅ **Performance**: Consultas optimizadas, vistas materializadas posibles  
✅ **Compliance**: Preparada para regulación alimentaria  
✅ **Seguridad**: RLS preparado, roles diferenciados  

**Próximos pasos**: Implementar backend, crear API REST, desarrollar lógica de negocio sobre esta base.
