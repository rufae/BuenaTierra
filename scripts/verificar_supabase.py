import psycopg2, time

time.sleep(2)

local = psycopg2.connect(
    host='localhost', port=5434, dbname='buenatierra',
    user='buenatierra_admin', password='BuenaTierra2025!Seguro#Dev'
)
supa = psycopg2.connect(
    host='aws-0-eu-west-1.pooler.supabase.com', port=5432,
    dbname='postgres', user='postgres.uazklcesoebzcpyiktqv',
    password='sQa4tc8C@supabase', connect_timeout=20
)

tables = [
    'clientes','productos','lotes','stock','pedidos','pedidos_lineas',
    'albaranes','albaranes_lineas','facturas','facturas_lineas',
    'producciones','trazabilidad','ingredientes','alergenos',
    'categorias','empresas','usuarios','movimientos_stock',
    'producto_ingredientes','series_facturacion'
]

print(f"{'Tabla':<30} {'Local':>8} {'Supabase':>10} {'OK':>6}")
print('-' * 58)
all_ok = True
for t in tables:
    lc = local.cursor()
    lc.execute(f'SELECT COUNT(*) FROM {t}')
    ln = lc.fetchone()[0]
    sc = supa.cursor()
    sc.execute(f'SELECT COUNT(*) FROM {t}')
    sn = sc.fetchone()[0]
    ok = 'OK' if ln == sn else 'DIFF'
    if ok == 'DIFF':
        all_ok = False
    print(f"{t:<30} {ln:>8} {sn:>10} {ok:>6}")

local.close()
supa.close()
print('-' * 58)
print('RESULTADO:', 'MIGRACION CORRECTA' if all_ok else 'HAY DIFERENCIAS')
