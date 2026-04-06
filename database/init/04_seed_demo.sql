-- ============================================================
-- BuenaTierra - Datos de demostración realistas
-- Ejecutar después de 01_schema.sql, 02_seed.sql, 03_upgrade_*.sql
-- ============================================================

-- ============================================================
-- PERMISOS
-- ============================================================
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO buenatierra_admin;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO buenatierra_admin;

-- ============================================================
-- VARIABLES AUXILIARES
-- ============================================================
DO $$
DECLARE
    v_empresa_id   INTEGER;
    v_admin_id     INTEGER;
    v_obrador_id   INTEGER;
    v_repart_id    INTEGER;
    -- IDs de categorías
    v_cat_bolleria INTEGER;
    v_cat_tartas   INTEGER;
    v_cat_panes    INTEGER;
    v_cat_galletas INTEGER;
    v_cat_hojaldres INTEGER;
    -- IDs de ingredientes
    v_ing_harina      INTEGER;
    v_ing_azucar      INTEGER;
    v_ing_mantequilla INTEGER;
    v_ing_huevo       INTEGER;
    v_ing_leche       INTEGER;
    v_ing_chocolate   INTEGER;
    v_ing_levadura    INTEGER;
    v_ing_sal         INTEGER;
    v_ing_vainilla    INTEGER;
    v_ing_aceite      INTEGER;
    v_ing_nata        INTEGER;
    v_ing_almendra    INTEGER;
    v_ing_canela      INTEGER;
    v_ing_miel        INTEGER;
    v_ing_cacao       INTEGER;
    -- IDs de productos
    v_prod_palmera_choc  INTEGER;
    v_prod_palmera_nat   INTEGER;
    v_prod_croissant     INTEGER;
    v_prod_napolitana    INTEGER;
    v_prod_ensaimada     INTEGER;
    v_prod_magdalena     INTEGER;
    v_prod_rosquilla     INTEGER;
    v_prod_tarta_queso   INTEGER;
    v_prod_tarta_choc    INTEGER;
    v_prod_pan_payes     INTEGER;
    v_prod_pan_molde     INTEGER;
    v_prod_galleta_mant  INTEGER;
    v_prod_galleta_choc  INTEGER;
    v_prod_hojaldre_cr   INTEGER;
    v_prod_bizcocho      INTEGER;
    -- IDs de clientes
    v_cli_cafeteria  INTEGER;
    v_cli_hotel      INTEGER;
    v_cli_super      INTEGER;
    v_cli_rest       INTEGER;
    v_cli_part1      INTEGER;
    v_cli_part2      INTEGER;
    v_cli_repart1    INTEGER;
    v_cli_colegio    INTEGER;
    v_cli_pasteleria INTEGER;
    v_cli_catering   INTEGER;
    -- IDs de alérgenos
    v_al_gluten   INTEGER;
    v_al_lacteos  INTEGER;
    v_al_huevo    INTEGER;
    v_al_frutos   INTEGER;
    v_al_soja     INTEGER;
    -- Series
    v_serie_fac   INTEGER;
    v_serie_alb   INTEGER;
    -- Lotes
    v_lote_id     INTEGER;
BEGIN
    SELECT id INTO v_empresa_id FROM empresas WHERE nif = 'B12345678';
    SELECT id INTO v_admin_id FROM usuarios WHERE email = 'admin@buenatierra.com';
    SELECT id INTO v_obrador_id FROM usuarios WHERE email = 'obrador@buenatierra.com';
    SELECT id INTO v_repart_id FROM usuarios WHERE email = 'repartidor@buenatierra.com';
    SELECT id INTO v_serie_fac FROM series_facturacion WHERE empresa_id = v_empresa_id AND codigo = 'FAC';
    SELECT id INTO v_serie_alb FROM series_facturacion WHERE empresa_id = v_empresa_id AND codigo = 'ALB';

    -- ============================================================
    -- 1. ALÉRGENOS  (Reglamento UE 1169/2011)
    -- Los que falten se añaden; los existentes se reusan
    -- ============================================================
    INSERT INTO alergenos (codigo, nombre, descripcion) VALUES
        ('GLUTEN',   'Gluten',                  'Cereales que contienen gluten: trigo, centeno, cebada, avena, espelta'),
        ('LACTEOS',  'Leche y derivados',       'Leche y productos a base de leche, incluida la lactosa'),
        ('SOJA',     'Soja',                    'Soja y productos a base de soja'),
        ('SESAMO',   'Sesamo',                  'Granos de sesamo y productos a base de sesamo')
    ON CONFLICT (codigo) DO NOTHING;

    SELECT id INTO v_al_gluten  FROM alergenos WHERE codigo = 'GLUTEN';
    SELECT id INTO v_al_lacteos FROM alergenos WHERE codigo = 'LACTEOS';
    SELECT id INTO v_al_huevo   FROM alergenos WHERE codigo = 'HUEVOS';
    SELECT id INTO v_al_frutos  FROM alergenos WHERE codigo = 'FRUTOS_SECOS';
    SELECT id INTO v_al_soja    FROM alergenos WHERE codigo = 'SOJA';

    -- ============================================================
    -- 2. CATEGORÍAS
    -- ============================================================
    INSERT INTO categorias (empresa_id, nombre, descripcion, activa) VALUES
        (v_empresa_id, 'Bollería',    'Bollería artesanal: palmeras, croissants, napolitanas', TRUE),
        (v_empresa_id, 'Tartas',      'Tartas completas y porciones', TRUE),
        (v_empresa_id, 'Panes',       'Panes artesanales y de molde', TRUE),
        (v_empresa_id, 'Galletas',    'Galletas artesanales variadas', TRUE),
        (v_empresa_id, 'Hojaldres',   'Productos de hojaldre', TRUE)
    ON CONFLICT DO NOTHING;

    SELECT id INTO v_cat_bolleria  FROM categorias WHERE empresa_id = v_empresa_id AND nombre = 'Bollería';
    SELECT id INTO v_cat_tartas    FROM categorias WHERE empresa_id = v_empresa_id AND nombre = 'Tartas';
    SELECT id INTO v_cat_panes     FROM categorias WHERE empresa_id = v_empresa_id AND nombre = 'Panes';
    SELECT id INTO v_cat_galletas  FROM categorias WHERE empresa_id = v_empresa_id AND nombre = 'Galletas';
    SELECT id INTO v_cat_hojaldres FROM categorias WHERE empresa_id = v_empresa_id AND nombre = 'Hojaldres';

    -- ============================================================
    -- 3. INGREDIENTES
    -- ============================================================
    INSERT INTO ingredientes (empresa_id, nombre, descripcion, proveedor, activo) VALUES
        (v_empresa_id, 'Harina de trigo',       'Harina de trigo panificable tipo 55',          'Harinera del Mediterráneo S.L.',  TRUE),
        (v_empresa_id, 'Azúcar blanco',         'Azúcar blanco refinado',                       'Azucarera Nacional',              TRUE),
        (v_empresa_id, 'Mantequilla',           'Mantequilla sin sal 82% MG',                   'Central Lechera Asturiana',       TRUE),
        (v_empresa_id, 'Huevo pasteurizado',    'Huevo líquido pasteurizado',                   'Ovoproductos del Sur S.A.',       TRUE),
        (v_empresa_id, 'Leche entera',          'Leche entera UHT 3,5% MG',                    'Pascual',                         TRUE),
        (v_empresa_id, 'Chocolate cobertura',   'Chocolate cobertura negro 70% cacao',          'Callebaut España',                TRUE),
        (v_empresa_id, 'Levadura fresca',       'Levadura prensada de panadería',               'Lesaffre Ibérica',                TRUE),
        (v_empresa_id, 'Sal marina',            'Sal marina fina yodada',                       'Salinera Española',               TRUE),
        (v_empresa_id, 'Extracto de vainilla',  'Extracto natural de vainilla Bourbon',         'Vahiné',                          TRUE),
        (v_empresa_id, 'Aceite de girasol',     'Aceite de girasol alto oleico',                'Koipesol',                        TRUE),
        (v_empresa_id, 'Nata para montar',      'Nata de montar 35% MG UHT',                   'Central Lechera Asturiana',       TRUE),
        (v_empresa_id, 'Almendra molida',       'Almendra marcona molida',                      'Frutos Secos El Paraíso',         TRUE),
        (v_empresa_id, 'Canela molida',         'Canela de Ceilán molida',                      'Especias Moreno',                 TRUE),
        (v_empresa_id, 'Miel milflores',        'Miel de milflores española',                   'Apiscam',                         TRUE),
        (v_empresa_id, 'Cacao en polvo',        'Cacao en polvo desgrasado 22%',                'Valor',                           TRUE)
    ON CONFLICT (empresa_id, nombre) DO NOTHING;

    SELECT id INTO v_ing_harina      FROM ingredientes WHERE empresa_id = v_empresa_id AND nombre = 'Harina de trigo';
    SELECT id INTO v_ing_azucar      FROM ingredientes WHERE empresa_id = v_empresa_id AND nombre = 'Azúcar blanco';
    SELECT id INTO v_ing_mantequilla FROM ingredientes WHERE empresa_id = v_empresa_id AND nombre = 'Mantequilla';
    SELECT id INTO v_ing_huevo       FROM ingredientes WHERE empresa_id = v_empresa_id AND nombre = 'Huevo pasteurizado';
    SELECT id INTO v_ing_leche       FROM ingredientes WHERE empresa_id = v_empresa_id AND nombre = 'Leche entera';
    SELECT id INTO v_ing_chocolate   FROM ingredientes WHERE empresa_id = v_empresa_id AND nombre = 'Chocolate cobertura';
    SELECT id INTO v_ing_levadura    FROM ingredientes WHERE empresa_id = v_empresa_id AND nombre = 'Levadura fresca';
    SELECT id INTO v_ing_sal         FROM ingredientes WHERE empresa_id = v_empresa_id AND nombre = 'Sal marina';
    SELECT id INTO v_ing_vainilla    FROM ingredientes WHERE empresa_id = v_empresa_id AND nombre = 'Extracto de vainilla';
    SELECT id INTO v_ing_aceite      FROM ingredientes WHERE empresa_id = v_empresa_id AND nombre = 'Aceite de girasol';
    SELECT id INTO v_ing_nata        FROM ingredientes WHERE empresa_id = v_empresa_id AND nombre = 'Nata para montar';
    SELECT id INTO v_ing_almendra    FROM ingredientes WHERE empresa_id = v_empresa_id AND nombre = 'Almendra molida';
    SELECT id INTO v_ing_canela      FROM ingredientes WHERE empresa_id = v_empresa_id AND nombre = 'Canela molida';
    SELECT id INTO v_ing_miel        FROM ingredientes WHERE empresa_id = v_empresa_id AND nombre = 'Miel milflores';
    SELECT id INTO v_ing_cacao       FROM ingredientes WHERE empresa_id = v_empresa_id AND nombre = 'Cacao en polvo';

    -- Alérgenos de ingredientes
    INSERT INTO ingrediente_alergenos (ingrediente_id, alergeno_id) VALUES
        (v_ing_harina,      v_al_gluten),
        (v_ing_mantequilla, v_al_lacteos),
        (v_ing_huevo,       v_al_huevo),
        (v_ing_leche,       v_al_lacteos),
        (v_ing_chocolate,   v_al_lacteos),
        (v_ing_chocolate,   v_al_soja),
        (v_ing_nata,        v_al_lacteos),
        (v_ing_almendra,    v_al_frutos)
    ON CONFLICT DO NOTHING;

    -- ============================================================
    -- 4. PRODUCTOS
    -- ============================================================
    INSERT INTO productos (empresa_id, categoria_id, codigo, nombre, descripcion, precio_venta, precio_coste,
        iva_porcentaje, unidad_medida, peso_unitario_gr, vida_util_dias, requiere_lote, compartido_repartidores,
        stock_minimo, stock_maximo, ingredientes_texto, trazas, conservacion,
        valor_energetico_kcal, grasas, grasas_saturadas, hidratos_carbono, azucares, proteinas, sal)
    VALUES
        -- Bollería
        (v_empresa_id, v_cat_bolleria, 'BOL-001', 'Palmera de chocolate',    'Palmera artesanal con cobertura de chocolate negro',
         1.80, 0.55, 10.00, 'unidad', 120, 5, TRUE, TRUE, 50, 500,
         'HARINA DE TRIGO, MANTEQUILLA, azúcar, HUEVO, chocolate (cacao, LECHE, SOJA lecitina), sal, levadura',
         'Puede contener trazas de FRUTOS DE CÁSCARA',
         'Conservar en lugar fresco y seco. Una vez abierto, consumir en 24h.',
         420, 22.0, 12.0, 52.0, 28.0, 6.0, 0.8),

        (v_empresa_id, v_cat_bolleria, 'BOL-002', 'Palmera natural',         'Palmera artesanal natural con azúcar glass',
         1.50, 0.45, 10.00, 'unidad', 100, 5, TRUE, TRUE, 50, 500,
         'HARINA DE TRIGO, MANTEQUILLA, azúcar, HUEVO, sal, levadura',
         'Puede contener trazas de FRUTOS DE CÁSCARA y LECHE',
         'Conservar en lugar fresco y seco.',
         395, 19.0, 11.0, 54.0, 25.0, 5.5, 0.7),

        (v_empresa_id, v_cat_bolleria, 'BOL-003', 'Croissant mantequilla',   'Croissant artesanal de mantequilla',
         1.20, 0.40, 10.00, 'unidad', 70, 4, TRUE, TRUE, 80, 600,
         'HARINA DE TRIGO, MANTEQUILLA, LECHE, HUEVO, azúcar, levadura, sal',
         'Puede contener trazas de FRUTOS DE CÁSCARA y SOJA',
         'Consumir preferentemente en el día. Recalentar 2 min a 180°C.',
         380, 20.0, 13.0, 45.0, 12.0, 7.0, 1.0),

        (v_empresa_id, v_cat_bolleria, 'BOL-004', 'Napolitana de chocolate', 'Napolitana rellena de tableta de chocolate',
         1.40, 0.48, 10.00, 'unidad', 90, 4, TRUE, TRUE, 60, 400,
         'HARINA DE TRIGO, MANTEQUILLA, chocolate (cacao, azúcar, LECHE, SOJA lecitina), HUEVO, azúcar, levadura, sal',
         'Puede contener trazas de FRUTOS DE CÁSCARA',
         'Conservar en lugar fresco y seco.',
         410, 21.0, 13.0, 50.0, 26.0, 6.5, 0.9),

        (v_empresa_id, v_cat_bolleria, 'BOL-005', 'Ensaimada',              'Ensaimada mallorquina tradicional',
         1.60, 0.50, 10.00, 'unidad', 80, 3, TRUE, TRUE, 40, 300,
         'HARINA DE TRIGO, manteca de cerdo, HUEVO, azúcar, levadura, sal, extracto de vainilla',
         'Puede contener trazas de LECHE, FRUTOS DE CÁSCARA y SOJA',
         'Consumir preferentemente en el día.',
         390, 18.0, 8.0, 52.0, 22.0, 6.0, 0.6),

        (v_empresa_id, v_cat_bolleria, 'BOL-006', 'Magdalena casera',       'Magdalena artesanal con aceite de girasol y limón',
         0.80, 0.25, 10.00, 'unidad', 50, 7, TRUE, TRUE, 100, 800,
         'HARINA DE TRIGO, aceite de girasol, HUEVO, azúcar, LECHE, levadura, ralladura de limón, sal',
         'Puede contener trazas de FRUTOS DE CÁSCARA y SOJA',
         'Conservar en lugar fresco y seco. Consumir antes de 7 días.',
         340, 15.0, 3.0, 48.0, 28.0, 5.0, 0.5),

        (v_empresa_id, v_cat_bolleria, 'BOL-007', 'Rosquilla tonta',        'Rosquilla tradicional sin baño',
         0.90, 0.30, 10.00, 'unidad', 45, 6, TRUE, TRUE, 60, 500,
         'HARINA DE TRIGO, HUEVO, azúcar, aceite de girasol, anís, LECHE, levadura, sal',
         'Puede contener trazas de FRUTOS DE CÁSCARA y SOJA',
         'Conservar en lugar fresco y seco.',
         350, 14.0, 4.0, 50.0, 24.0, 5.5, 0.5),

        -- Tartas
        (v_empresa_id, v_cat_tartas, 'TRT-001', 'Tarta de queso',           'Tarta de queso cremosa estilo San Sebastián',
         22.00, 6.50, 10.00, 'unidad', 1200, 5, TRUE, TRUE, 5, 20,
         'Queso crema, HUEVO, NATA, azúcar, HARINA DE TRIGO, extracto de vainilla',
         'Puede contener trazas de FRUTOS DE CÁSCARA y SOJA',
         'Conservar en frigorífico entre 2°C y 6°C. Consumir en 5 días.',
         290, 18.0, 11.0, 24.0, 20.0, 6.0, 0.4),

        (v_empresa_id, v_cat_tartas, 'TRT-002', 'Tarta de chocolate',       'Tarta de chocolate con base de galleta y ganache',
         25.00, 7.80, 10.00, 'unidad', 1500, 5, TRUE, TRUE, 5, 15,
         'Chocolate (cacao, azúcar, MANTEQUILLA de cacao, LECHE, SOJA lecitina), NATA, HUEVO, HARINA DE TRIGO, MANTEQUILLA, azúcar',
         'Puede contener trazas de FRUTOS DE CÁSCARA',
         'Conservar en frigorífico entre 2°C y 6°C.',
         380, 24.0, 15.0, 40.0, 32.0, 5.0, 0.3),

        -- Panes
        (v_empresa_id, v_cat_panes, 'PAN-001', 'Pan de payés',              'Pan artesanal de payés con corteza crujiente',
         3.50, 1.10, 4.00, 'unidad', 500, 3, TRUE, TRUE, 15, 80,
         'HARINA DE TRIGO, agua, sal, masa madre (HARINA DE TRIGO, agua), levadura',
         NULL,
         'Conservar en bolsa de tela. Consumir en 2-3 días.',
         250, 1.5, 0.3, 50.0, 2.0, 8.0, 1.2),

        (v_empresa_id, v_cat_panes, 'PAN-002', 'Pan de molde integral',     'Pan de molde con harina integral',
         2.80, 0.90, 4.00, 'unidad', 600, 5, TRUE, TRUE, 20, 100,
         'HARINA DE TRIGO integral, agua, aceite de girasol, azúcar, sal, levadura, LECHE en polvo',
         'Puede contener trazas de FRUTOS DE CÁSCARA, HUEVO y SOJA',
         'Conservar en lugar fresco y seco una vez abierto.',
         240, 3.0, 0.5, 44.0, 5.0, 9.0, 1.1),

        -- Galletas
        (v_empresa_id, v_cat_galletas, 'GAL-001', 'Galleta de mantequilla', 'Galleta artesanal de mantequilla (bolsa 200g)',
         3.20, 0.95, 10.00, 'bolsa', 200, 30, TRUE, TRUE, 30, 200,
         'HARINA DE TRIGO, MANTEQUILLA, azúcar, HUEVO, extracto de vainilla, sal',
         'Puede contener trazas de FRUTOS DE CÁSCARA, LECHE y SOJA',
         'Conservar en lugar fresco y seco. Una vez abierto, consumir en 1 semana.',
         480, 24.0, 16.0, 60.0, 28.0, 6.0, 0.6),

        (v_empresa_id, v_cat_galletas, 'GAL-002', 'Galleta de chocolate',   'Galleta con pepitas de chocolate negro (bolsa 200g)',
         3.50, 1.05, 10.00, 'bolsa', 200, 30, TRUE, TRUE, 30, 200,
         'HARINA DE TRIGO, MANTEQUILLA, azúcar, chocolate (cacao, LECHE, SOJA lecitina), HUEVO, sal, levadura',
         'Puede contener trazas de FRUTOS DE CÁSCARA',
         'Conservar en lugar fresco y seco.',
         500, 26.0, 17.0, 58.0, 32.0, 6.5, 0.7),

        -- Hojaldres
        (v_empresa_id, v_cat_hojaldres, 'HOJ-001', 'Hojaldre de crema',    'Milhojas de crema pastelera artesanal',
         2.50, 0.80, 10.00, 'unidad', 150, 3, TRUE, TRUE, 30, 200,
         'HARINA DE TRIGO, MANTEQUILLA, LECHE, HUEVO, azúcar, maicena, extracto de vainilla, sal',
         'Puede contener trazas de FRUTOS DE CÁSCARA y SOJA',
         'Conservar en frigorífico. Consumir en el día.',
         360, 20.0, 13.0, 40.0, 22.0, 5.0, 0.8),

        (v_empresa_id, v_cat_bolleria, 'BOL-008', 'Bizcocho de limón',      'Bizcocho esponjoso de limón (porción)',
         1.30, 0.35, 10.00, 'unidad', 80, 5, TRUE, TRUE, 50, 400,
         'HARINA DE TRIGO, HUEVO, azúcar, aceite de girasol, LECHE, ralladura de limón, levadura, sal',
         'Puede contener trazas de FRUTOS DE CÁSCARA y SOJA',
         'Conservar en lugar fresco y seco.',
         320, 12.0, 3.0, 50.0, 30.0, 5.0, 0.5)
    ON CONFLICT (empresa_id, codigo) DO NOTHING;

    -- Recuperar IDs de productos
    SELECT id INTO v_prod_palmera_choc FROM productos WHERE empresa_id = v_empresa_id AND codigo = 'BOL-001';
    SELECT id INTO v_prod_palmera_nat  FROM productos WHERE empresa_id = v_empresa_id AND codigo = 'BOL-002';
    SELECT id INTO v_prod_croissant    FROM productos WHERE empresa_id = v_empresa_id AND codigo = 'BOL-003';
    SELECT id INTO v_prod_napolitana   FROM productos WHERE empresa_id = v_empresa_id AND codigo = 'BOL-004';
    SELECT id INTO v_prod_ensaimada    FROM productos WHERE empresa_id = v_empresa_id AND codigo = 'BOL-005';
    SELECT id INTO v_prod_magdalena    FROM productos WHERE empresa_id = v_empresa_id AND codigo = 'BOL-006';
    SELECT id INTO v_prod_rosquilla    FROM productos WHERE empresa_id = v_empresa_id AND codigo = 'BOL-007';
    SELECT id INTO v_prod_tarta_queso  FROM productos WHERE empresa_id = v_empresa_id AND codigo = 'TRT-001';
    SELECT id INTO v_prod_tarta_choc   FROM productos WHERE empresa_id = v_empresa_id AND codigo = 'TRT-002';
    SELECT id INTO v_prod_pan_payes    FROM productos WHERE empresa_id = v_empresa_id AND codigo = 'PAN-001';
    SELECT id INTO v_prod_pan_molde    FROM productos WHERE empresa_id = v_empresa_id AND codigo = 'PAN-002';
    SELECT id INTO v_prod_galleta_mant FROM productos WHERE empresa_id = v_empresa_id AND codigo = 'GAL-001';
    SELECT id INTO v_prod_galleta_choc FROM productos WHERE empresa_id = v_empresa_id AND codigo = 'GAL-002';
    SELECT id INTO v_prod_hojaldre_cr  FROM productos WHERE empresa_id = v_empresa_id AND codigo = 'HOJ-001';
    SELECT id INTO v_prod_bizcocho     FROM productos WHERE empresa_id = v_empresa_id AND codigo = 'BOL-008';

    -- ============================================================
    -- 5. PRODUCTO ↔ INGREDIENTES
    -- ============================================================
    -- Palmera chocolate
    INSERT INTO producto_ingredientes (producto_id, ingrediente_id, cantidad_gr, es_principal) VALUES
        (v_prod_palmera_choc, v_ing_harina,      45, TRUE),
        (v_prod_palmera_choc, v_ing_mantequilla,  25, TRUE),
        (v_prod_palmera_choc, v_ing_azucar,       20, FALSE),
        (v_prod_palmera_choc, v_ing_huevo,        15, FALSE),
        (v_prod_palmera_choc, v_ing_chocolate,    12, FALSE),
        (v_prod_palmera_choc, v_ing_sal,           1, FALSE)
    ON CONFLICT (producto_id, ingrediente_id) DO NOTHING;

    -- Croissant
    INSERT INTO producto_ingredientes (producto_id, ingrediente_id, cantidad_gr, es_principal) VALUES
        (v_prod_croissant, v_ing_harina,      30, TRUE),
        (v_prod_croissant, v_ing_mantequilla,  20, TRUE),
        (v_prod_croissant, v_ing_leche,        10, FALSE),
        (v_prod_croissant, v_ing_huevo,         5, FALSE),
        (v_prod_croissant, v_ing_azucar,        3, FALSE),
        (v_prod_croissant, v_ing_levadura,      1, FALSE),
        (v_prod_croissant, v_ing_sal,           0.5, FALSE)
    ON CONFLICT (producto_id, ingrediente_id) DO NOTHING;

    -- Magdalena
    INSERT INTO producto_ingredientes (producto_id, ingrediente_id, cantidad_gr, es_principal) VALUES
        (v_prod_magdalena, v_ing_harina,  18, TRUE),
        (v_prod_magdalena, v_ing_huevo,   15, TRUE),
        (v_prod_magdalena, v_ing_azucar,  10, FALSE),
        (v_prod_magdalena, v_ing_aceite,   5, FALSE),
        (v_prod_magdalena, v_ing_leche,    2, FALSE)
    ON CONFLICT (producto_id, ingrediente_id) DO NOTHING;

    -- Tarta de queso
    INSERT INTO producto_ingredientes (producto_id, ingrediente_id, cantidad_gr, es_principal) VALUES
        (v_prod_tarta_queso, v_ing_huevo,   300, TRUE),
        (v_prod_tarta_queso, v_ing_nata,    250, TRUE),
        (v_prod_tarta_queso, v_ing_azucar,  200, FALSE),
        (v_prod_tarta_queso, v_ing_harina,   40, FALSE),
        (v_prod_tarta_queso, v_ing_vainilla,  5, FALSE)
    ON CONFLICT (producto_id, ingrediente_id) DO NOTHING;

    -- Galleta mantequilla
    INSERT INTO producto_ingredientes (producto_id, ingrediente_id, cantidad_gr, es_principal) VALUES
        (v_prod_galleta_mant, v_ing_harina,      80, TRUE),
        (v_prod_galleta_mant, v_ing_mantequilla,  50, TRUE),
        (v_prod_galleta_mant, v_ing_azucar,       40, FALSE),
        (v_prod_galleta_mant, v_ing_huevo,        20, FALSE),
        (v_prod_galleta_mant, v_ing_vainilla,      2, FALSE),
        (v_prod_galleta_mant, v_ing_sal,           1, FALSE)
    ON CONFLICT (producto_id, ingrediente_id) DO NOTHING;

    -- ============================================================
    -- 6. CLIENTES
    -- ============================================================
    INSERT INTO clientes (empresa_id, tipo, nombre, razon_social, nombre_comercial, nombre_fiscal, nif,
        direccion, codigo_postal, ciudad, provincia, pais,
        telefono, email, persona_contacto,
        forma_pago, dias_pago, tipo_impuesto, aplicar_impuesto, recargo_equivalencia,
        no_aplicar_retenciones, porcentaje_retencion, descuento_general,
        estado_cliente, activo, fecha_alta, no_realizar_facturas, notas) VALUES
    -- 1. Cafetería La Esquina (empresa con dto general)
    (v_empresa_id, 'Empresa', 'Cafetería La Esquina', 'Cafetería La Esquina S.L.',
     'La Esquina', 'Cafetería La Esquina S.L.', 'B12345678',
     'Calle Mayor 15, bajo', '28001', 'Madrid', 'Madrid', 'España',
     '912345678', 'pedidos@laesquina.es', 'María García López',
     'Transfer30', 30, 'IVA', TRUE, FALSE,
     TRUE, 0, 5.00,
     'Activo', TRUE, '2025-01-15', FALSE,
     'Cliente habitual. Pedido semanal lunes y jueves. Dto 5% sobre catálogo completo.'),

    -- 2. Hotel Mirador (empresa grande, pago a 60 días)
    (v_empresa_id, 'Empresa', 'Hotel Mirador', 'Hoteles Mirador S.A.',
     'Hotel Mirador', 'Hoteles Mirador S.A.', 'A87654321',
     'Paseo de la Castellana 120', '28046', 'Madrid', 'Madrid', 'España',
     '915551234', 'compras@hotelmirador.com', 'Carlos Ruiz Méndez',
     'Transfer60', 60, 'IVA', TRUE, FALSE,
     TRUE, 0, 8.00,
     'Activo', TRUE, '2024-11-20', FALSE,
     'Gran volumen. Consumo diario de bollería y panes para desayunos. Dto 8%.'),

    -- 3. Supermercado Eco Mercado (con Recargo de Equivalencia)
    (v_empresa_id, 'Autonomo', 'Eco Mercado', 'Roberto Sánchez Martín',
     'Eco Mercado', 'Roberto Sánchez Martín', '12345678Z',
     'Av. de la Constitución 45', '28903', 'Getafe', 'Madrid', 'España',
     '916789012', 'eco.mercado@gmail.com', 'Roberto Sánchez',
     'Contado', 0, 'IVA', TRUE, TRUE,
     TRUE, 0, 3.00,
     'Activo', TRUE, '2025-03-10', FALSE,
     'Autónomo con RE. Paga al contado. Volumen medio.'),

    -- 4. Restaurante El Fogón (con retenciones)
    (v_empresa_id, 'Empresa', 'Restaurante El Fogón', 'El Fogón Gastronómico S.L.',
     'El Fogón', 'El Fogón Gastronómico S.L.', 'B11223344',
     'Calle del Pez 8', '28004', 'Madrid', 'Madrid', 'España',
     '914567890', 'info@elfogon.es', 'Ana Moreno Ruiz',
     'Transfer30', 30, 'IVA', TRUE, FALSE,
     FALSE, 15.00, 0,
     'Activo', TRUE, '2025-06-01', FALSE,
     'Aplica retención 15% IRPF. Pedidos irregulares, sobre todo tartas para eventos.'),

    -- 5. Particular - Familia López
    (v_empresa_id, 'Particular', 'Laura López Martínez', NULL,
     NULL, NULL, '98765432M',
     'Calle Alcalá 200, 3ºB', '28028', 'Madrid', 'Madrid', 'España',
     '654321987', 'laura.lopez@email.com', NULL,
     'Contado', 0, 'IVA', TRUE, FALSE,
     TRUE, 0, 0,
     'Activo', TRUE, '2025-09-20', FALSE,
     'Particular. Encargos puntuales de tartas para celebraciones.'),

    -- 6. Particular - Pedro Martín
    (v_empresa_id, 'Particular', 'Pedro Martín Soto', NULL,
     NULL, NULL, '45678901L',
     'Calle de Serrano 50, 1ºA', '28006', 'Madrid', 'Madrid', 'España',
     '612345678', 'pedro.martin@email.com', NULL,
     'Contado', 0, 'IVA', TRUE, FALSE,
     TRUE, 0, 0,
     'Activo', TRUE, '2025-10-05', FALSE,
     'Cliente puntual. Suele pedir galletas y magdalenas.'),

    -- 7. Repartidor - Distribuciones Fernández
    (v_empresa_id, 'Repartidor', 'Distribuciones Fernández', 'Distribuciones Fernández López S.L.',
     'Dist. Fernández', 'Distribuciones Fernández López S.L.', 'B99887766',
     'Polígono Las Nieves, Nave 12', '28906', 'Getafe', 'Madrid', 'España',
     '918765432', 'pedidos@distfernandez.es', 'Fernando Fernández',
     'Transfer30', 30, 'IVA', TRUE, FALSE,
     TRUE, 0, 12.00,
     'Activo', TRUE, '2024-06-15', FALSE,
     'Repartidor principal zona sur Madrid. Dto 12%. Volumen alto.'),

    -- 8. Colegio San José
    (v_empresa_id, 'Empresa', 'Colegio San José', 'Comunidad Educativa San José',
     'Col. San José', 'Comunidad Educativa San José', 'R2800045H',
     'Calle de la Escuela 5', '28014', 'Madrid', 'Madrid', 'España',
     '913456789', 'comedor@colegiosanjose.es', 'Isabel Torres',
     'Transfer60', 60, 'IVA', TRUE, FALSE,
     TRUE, 0, 10.00,
     'Activo', TRUE, '2025-02-01', FALSE,
     'Pedido fijo de lunes a viernes durante curso escolar. Bollería y pan.'),

    -- 9. Pastelería Dulce Sueño (no facturar, solo albaranes)
    (v_empresa_id, 'Empresa', 'Pastelería Dulce Sueño', 'Dulce Sueño Pastelerías S.L.',
     'Dulce Sueño', 'Dulce Sueño Pastelerías S.L.', 'B55443322',
     'Calle Luna 22', '28013', 'Madrid', 'Madrid', 'España',
     '917654321', 'dulcesueno@email.com', 'Carmen Delgado',
     'Transfer30', 30, 'IVA', TRUE, FALSE,
     TRUE, 0, 0,
     'Suspendido', TRUE, '2025-05-10', TRUE,
     'SUSPENDIDO - Deuda pendiente. No facturar hasta regularizar.'),

    -- 10. Catering Eventos Madrid
    (v_empresa_id, 'Empresa', 'Catering Eventos Madrid', 'Catering y Eventos Madrid S.L.',
     'Catering Madrid', 'Catering y Eventos Madrid S.L.', 'B66778899',
     'Calle de Gutenberg 3, Local 2', '28019', 'Madrid', 'Madrid', 'España',
     '916543210', 'pedidos@cateringmadrid.es', 'Diego Álvarez',
     'Transfer30', 30, 'IVA', TRUE, FALSE,
     TRUE, 0, 7.00,
     'Activo', TRUE, '2025-08-01', FALSE,
     'Pedidos grandes para eventos. Aviso con 48h mínimo. Dto 7%.')
    ON CONFLICT DO NOTHING;

    -- Recuperar IDs de clientes
    SELECT id INTO v_cli_cafeteria  FROM clientes WHERE empresa_id = v_empresa_id AND nif = 'B12345678';
    SELECT id INTO v_cli_hotel      FROM clientes WHERE empresa_id = v_empresa_id AND nif = 'A87654321';
    SELECT id INTO v_cli_super      FROM clientes WHERE empresa_id = v_empresa_id AND nif = '12345678Z';
    SELECT id INTO v_cli_rest       FROM clientes WHERE empresa_id = v_empresa_id AND nif = 'B11223344';
    SELECT id INTO v_cli_part1      FROM clientes WHERE empresa_id = v_empresa_id AND nif = '98765432M';
    SELECT id INTO v_cli_part2      FROM clientes WHERE empresa_id = v_empresa_id AND nif = '45678901L';
    SELECT id INTO v_cli_repart1    FROM clientes WHERE empresa_id = v_empresa_id AND nif = 'B99887766';
    SELECT id INTO v_cli_colegio    FROM clientes WHERE empresa_id = v_empresa_id AND nif = 'R2800045H';
    SELECT id INTO v_cli_pasteleria FROM clientes WHERE empresa_id = v_empresa_id AND nif = 'B55443322';
    SELECT id INTO v_cli_catering   FROM clientes WHERE empresa_id = v_empresa_id AND nif = 'B66778899';

    -- Actualizar códigos internos
    UPDATE clientes SET codigo_cliente_interno = 'CLI-' || LPAD(id::TEXT, 6, '0')
    WHERE empresa_id = v_empresa_id AND codigo_cliente_interno IS NULL;

    -- ============================================================
    -- 7. CONDICIONES ESPECIALES DE CLIENTES
    -- ============================================================
    -- Hotel: precio especial en croissants (compra mucho)
    INSERT INTO cliente_condiciones_especiales (cliente_id, articulo_familia, codigo, descripcion, tipo, precio, descuento) VALUES
        (v_cli_hotel, 'Articulo', v_prod_croissant::TEXT,    'Croissant mantequilla', 'PrecioEspecial', 0.95, 0),
        (v_cli_hotel, 'Articulo', v_prod_pan_payes::TEXT,    'Pan de payés',          'PrecioEspecial', 2.80, 0),
        (v_cli_hotel, 'Articulo', v_prod_napolitana::TEXT,   'Napolitana chocolate',  'Descuento',      0,    15)
    ON CONFLICT DO NOTHING;

    -- Repartidor: descuento extra en palmeras (su producto estrella)
    INSERT INTO cliente_condiciones_especiales (cliente_id, articulo_familia, codigo, descripcion, tipo, precio, descuento) VALUES
        (v_cli_repart1, 'Articulo', v_prod_palmera_choc::TEXT, 'Palmera de chocolate', 'Descuento', 0, 18),
        (v_cli_repart1, 'Articulo', v_prod_palmera_nat::TEXT,  'Palmera natural',      'Descuento', 0, 18)
    ON CONFLICT DO NOTHING;

    -- Colegio: precio fijo especial en magdalenas
    INSERT INTO cliente_condiciones_especiales (cliente_id, articulo_familia, codigo, descripcion, tipo, precio, descuento) VALUES
        (v_cli_colegio, 'Articulo', v_prod_magdalena::TEXT,  'Magdalena casera',      'PrecioEspecial', 0.60, 0),
        (v_cli_colegio, 'Articulo', v_prod_croissant::TEXT,  'Croissant mantequilla', 'PrecioEspecial', 0.90, 0)
    ON CONFLICT DO NOTHING;

    -- Catering: descuento en toda la categoría de bollería
    INSERT INTO cliente_condiciones_especiales (cliente_id, articulo_familia, codigo, descripcion, tipo, precio, descuento) VALUES
        (v_cli_catering, 'Articulo', '*', 'Todos los productos', 'Descuento', 0, 7)
    ON CONFLICT DO NOTHING;

    -- ============================================================
    -- 8. PRODUCCIONES + LOTES + STOCK (última semana)
    -- ============================================================
    -- Producción hace 5 días
    INSERT INTO producciones (empresa_id, producto_id, usuario_id, fecha_produccion, cantidad_producida, cantidad_merma, estado, notas)
    VALUES
        (v_empresa_id, v_prod_palmera_choc, v_obrador_id, CURRENT_DATE - 5, 200, 5, 'Finalizada', 'Producción matutina palmeras chocolate'),
        (v_empresa_id, v_prod_palmera_nat,  v_obrador_id, CURRENT_DATE - 5, 180, 3, 'Finalizada', 'Producción palmeras natural'),
        (v_empresa_id, v_prod_croissant,    v_obrador_id, CURRENT_DATE - 5, 300, 8, 'Finalizada', 'Producción croissants turno mañana'),
        (v_empresa_id, v_prod_magdalena,    v_obrador_id, CURRENT_DATE - 5, 400, 10, 'Finalizada', 'Producción magdalenas'),
        (v_empresa_id, v_prod_pan_payes,    v_obrador_id, CURRENT_DATE - 5, 60, 2, 'Finalizada', 'Producción pan payés');

    -- Producción hace 3 días
    INSERT INTO producciones (empresa_id, producto_id, usuario_id, fecha_produccion, cantidad_producida, cantidad_merma, estado, notas)
    VALUES
        (v_empresa_id, v_prod_palmera_choc, v_obrador_id, CURRENT_DATE - 3, 250, 6, 'Finalizada', 'Segunda producción semanal palmeras choc'),
        (v_empresa_id, v_prod_napolitana,   v_obrador_id, CURRENT_DATE - 3, 200, 4, 'Finalizada', 'Producción napolitanas'),
        (v_empresa_id, v_prod_croissant,    v_obrador_id, CURRENT_DATE - 3, 350, 10, 'Finalizada', 'Producción croissants'),
        (v_empresa_id, v_prod_ensaimada,    v_obrador_id, CURRENT_DATE - 3, 150, 5, 'Finalizada', 'Producción ensaimadas'),
        (v_empresa_id, v_prod_tarta_queso,  v_obrador_id, CURRENT_DATE - 3, 8, 0, 'Finalizada', 'Producción tartas queso'),
        (v_empresa_id, v_prod_galleta_mant, v_obrador_id, CURRENT_DATE - 3, 120, 2, 'Finalizada', 'Producción galletas mantequilla');

    -- Producción de hoy
    INSERT INTO producciones (empresa_id, producto_id, usuario_id, fecha_produccion, cantidad_producida, cantidad_merma, estado, notas)
    VALUES
        (v_empresa_id, v_prod_palmera_choc, v_obrador_id, CURRENT_DATE, 200, 4, 'Finalizada', 'Producción del día palmeras chocolate'),
        (v_empresa_id, v_prod_croissant,    v_obrador_id, CURRENT_DATE, 400, 12, 'Finalizada', 'Producción del día croissants'),
        (v_empresa_id, v_prod_rosquilla,    v_obrador_id, CURRENT_DATE, 250, 5, 'Finalizada', 'Producción rosquillas'),
        (v_empresa_id, v_prod_pan_payes,    v_obrador_id, CURRENT_DATE, 50, 1, 'Finalizada', 'Pan payés del día'),
        (v_empresa_id, v_prod_pan_molde,    v_obrador_id, CURRENT_DATE, 40, 0, 'Finalizada', 'Pan de molde integral'),
        (v_empresa_id, v_prod_hojaldre_cr,  v_obrador_id, CURRENT_DATE, 100, 3, 'Finalizada', 'Hojaldres de crema'),
        (v_empresa_id, v_prod_tarta_choc,   v_obrador_id, CURRENT_DATE, 5, 0, 'Finalizada', 'Producción tartas chocolate'),
        (v_empresa_id, v_prod_bizcocho,     v_obrador_id, CURRENT_DATE, 200, 5, 'Finalizada', 'Producción bizcocho limón'),
        (v_empresa_id, v_prod_galleta_choc, v_obrador_id, CURRENT_DATE, 100, 1, 'Finalizada', 'Producción galletas chocolate');

    -- Producción en planificación para mañana
    INSERT INTO producciones (empresa_id, producto_id, usuario_id, fecha_produccion, cantidad_producida, cantidad_merma, estado, notas)
    VALUES
        (v_empresa_id, v_prod_palmera_choc, v_obrador_id, CURRENT_DATE + 1, 300, 0, 'Planificada', 'Pedido grande del Hotel Mirador'),
        (v_empresa_id, v_prod_croissant,    v_obrador_id, CURRENT_DATE + 1, 500, 0, 'Planificada', 'Stock para reparto semanal');

    -- ============================================================
    -- 9. Generar lotes y stock para todas las producciones finalizadas
    -- Usamos la función entrada_stock_produccion del sistema
    -- ============================================================
    FOR v_lote_id IN
        SELECT p.id FROM producciones p
        WHERE p.empresa_id = v_empresa_id AND p.estado = 'Finalizada'
        AND NOT EXISTS (SELECT 1 FROM lotes l WHERE l.produccion_id = p.id)
        ORDER BY p.fecha_produccion, p.id
    LOOP
        PERFORM entrada_stock_produccion(
            v_empresa_id,
            (SELECT producto_id FROM producciones WHERE id = v_lote_id),
            v_lote_id,
            v_obrador_id
        );
    END LOOP;

    -- ============================================================
    -- 10. CONTROL DE MATERIAS PRIMAS (últimas entradas)
    -- ============================================================
    INSERT INTO control_materias_primas (empresa_id, fecha_entrada, ingrediente_id, producto, unidades,
        fecha_caducidad, proveedor, lote, condiciones_transporte, mercancia_aceptada, responsable, observaciones) VALUES
        (v_empresa_id, CURRENT_DATE - 7, v_ing_harina,      'Harina de trigo 25kg',      20, CURRENT_DATE + 180, 'Harinera del Mediterráneo S.L.',  'HT-2026-0312', TRUE, TRUE, 'Juan (Obrador)', 'Recepción correcta, temperatura ambiente'),
        (v_empresa_id, CURRENT_DATE - 7, v_ing_azucar,      'Azúcar blanco 25kg',        10, CURRENT_DATE + 365, 'Azucarera Nacional',              'AZ-2026-0155', TRUE, TRUE, 'Juan (Obrador)', NULL),
        (v_empresa_id, CURRENT_DATE - 5, v_ing_mantequilla, 'Mantequilla 5kg bloques',   15, CURRENT_DATE + 60,  'Central Lechera Asturiana',       'MT-2026-03A',  TRUE, TRUE, 'María (Obrador)', 'Temperatura correcta 4°C'),
        (v_empresa_id, CURRENT_DATE - 5, v_ing_huevo,       'Huevo líquido pasteurizado 10L', 8, CURRENT_DATE + 21, 'Ovoproductos del Sur S.A.',   'HP-2026-0890', TRUE, TRUE, 'María (Obrador)', NULL),
        (v_empresa_id, CURRENT_DATE - 3, v_ing_chocolate,   'Chocolate cobertura 5kg',    6, CURRENT_DATE + 270, 'Callebaut España',                'CB-2026-EU44', TRUE, TRUE, 'Juan (Obrador)', 'Lote premium, verificar ficha técnica'),
        (v_empresa_id, CURRENT_DATE - 3, v_ing_leche,       'Leche entera UHT 1L',       48, CURRENT_DATE + 90,  'Pascual',                         'LE-2025-1234', TRUE, TRUE, 'Juan (Obrador)', NULL),
        (v_empresa_id, CURRENT_DATE - 1, v_ing_nata,        'Nata montar 35% 1L',        24, CURRENT_DATE + 30,  'Central Lechera Asturiana',       'NA-2026-0456', TRUE, TRUE, 'María (Obrador)', 'Refrigerar inmediatamente'),
        (v_empresa_id, CURRENT_DATE,     v_ing_almendra,    'Almendra molida 5kg',         4, CURRENT_DATE + 180, 'Frutos Secos El Paraíso',         'AM-2026-0078', TRUE, TRUE, 'Juan (Obrador)', NULL)
    ON CONFLICT DO NOTHING;

    RAISE NOTICE '✅ Datos de demostración insertados correctamente';
    RAISE NOTICE '   → 8 alérgenos';
    RAISE NOTICE '   → 5 categorías';
    RAISE NOTICE '   → 15 ingredientes';
    RAISE NOTICE '   → 15 productos';
    RAISE NOTICE '   → 10 clientes';
    RAISE NOTICE '   → 20 producciones con lotes y stock';
    RAISE NOTICE '   → 8 entradas de materias primas';
    RAISE NOTICE '   → Condiciones especiales configuradas';
END $$;

-- ============================================================
-- Verificación final
-- ============================================================
SELECT 'categorias' AS tabla, COUNT(*) AS filas FROM categorias
UNION ALL SELECT 'ingredientes', COUNT(*) FROM ingredientes
UNION ALL SELECT 'alergenos', COUNT(*) FROM alergenos
UNION ALL SELECT 'productos', COUNT(*) FROM productos
UNION ALL SELECT 'clientes', COUNT(*) FROM clientes
UNION ALL SELECT 'producciones', COUNT(*) FROM producciones
UNION ALL SELECT 'lotes', COUNT(*) FROM lotes
UNION ALL SELECT 'stock', COUNT(*) FROM stock
UNION ALL SELECT 'control_materias_primas', COUNT(*) FROM control_materias_primas
UNION ALL SELECT 'cliente_condiciones_especiales', COUNT(*) FROM cliente_condiciones_especiales
ORDER BY 1;
