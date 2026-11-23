-- ============================================================
-- BuenaTierra - Datos iniciales (seed)
-- Ejecutar UNA SOLA VEZ después de 01_schema.sql
-- Conectado a la base de datos: buenatierra
-- ============================================================

-- ============================================================
-- 0. PERMISOS — garantiza acceso de buenatierra_admin a todas las tablas
-- (necesario porque las tablas las crea el superusuario postgres)
-- ============================================================
GRANT USAGE ON SCHEMA public TO buenatierra_admin;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO buenatierra_admin;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO buenatierra_admin;
-- Permisos para tablas que se creen en el futuro
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT ALL PRIVILEGES ON TABLES TO buenatierra_admin;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT ALL PRIVILEGES ON SEQUENCES TO buenatierra_admin;

-- ============================================================
-- 1. EMPRESA OBRADOR (registro raíz del sistema)
-- ============================================================
INSERT INTO empresas (nombre, nif, razon_social, es_obrador, activa)
VALUES ('BuenaTierra', '00000000T', 'BuenaTierra Obrador Artesanal S.L.', TRUE, TRUE)
ON CONFLICT (nif) DO NOTHING;

-- ============================================================
-- 2. USUARIOS INICIALES
-- Los usuarios (admin/obrador/repartidor) los crea la API al arrancar
-- con contraseñas ALEATORIAS por instalación (ver SeedPassword en
-- Program.cs) y cambio obligatorio en el primer acceso. Aquí no se
-- insertan usuarios ni hashes: no hay contraseñas por defecto.
-- ============================================================

-- ============================================================
-- 3. SERIE DE FACTURACIÓN POR DEFECTO
-- ============================================================
DO $$
DECLARE v_empresa_id INTEGER;
BEGIN
    SELECT id INTO v_empresa_id FROM empresas WHERE nif = '00000000T';

    IF NOT EXISTS (SELECT 1 FROM series_facturacion WHERE empresa_id = v_empresa_id AND codigo = 'FAC') THEN
        INSERT INTO series_facturacion (empresa_id, codigo, descripcion, prefijo, ultimo_numero, formato, activa)
        VALUES (v_empresa_id, 'FAC', 'Facturas', 'F', 0, '{PREFIJO}{ANIO}{NUMERO:6}', TRUE);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM series_facturacion WHERE empresa_id = v_empresa_id AND codigo = 'ALB') THEN
        INSERT INTO series_facturacion (empresa_id, codigo, descripcion, prefijo, ultimo_numero, formato, activa)
        VALUES (v_empresa_id, 'ALB', 'Albaranes', 'A', 0, '{PREFIJO}{ANIO}{NUMERO:6}', TRUE);
    END IF;
END $$;

-- ============================================================
-- Verificación
-- ============================================================
SELECT 'empresas' AS tabla, COUNT(*) AS filas FROM empresas
UNION ALL SELECT 'usuarios', COUNT(*) FROM usuarios
UNION ALL SELECT 'series_facturacion', COUNT(*) FROM series_facturacion;
