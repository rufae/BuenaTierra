"""
Importación masiva de clientes desde Excel → PostgreSQL BuenaTierra
Ejecución: python database\import_clientes.py
"""
import xlrd
import psycopg2
import re
import sys

# ── Config ──────────────────────────────────────────────────────────────────
EXCEL      = r"docs\client_assets\Info_Clientes\Listado de clientes.xls"
EMPRESA_ID = 1
DSN        = "host=localhost port=5433 dbname=buenatierra user=buenatierra_admin password=BuenaTierra2025!Seguro#Dev"

# ── Helpers ──────────────────────────────────────────────────────────────────

def clean(v):
    s = str(v).strip() if v else ''
    return s if s else None

def norm_nif(v):
    if not v: return None
    n = re.sub(r'[-\s]', '', str(v).strip()).upper()
    return n if n else None

def clean_phone(v):
    if not v: return None
    p = re.sub(r'[^\d+]', '', str(v).strip())
    return p if p else None

COMPANY_KW = [
    'S.L','S.A','S.C','SLU','S.COOP','COOP.AND',
    'ALIMENTACION','ALIMENTARIAS','GOURMET','HERMANOS','HNOS',
    'FRUTOS ROJOS','CONFITERIA','PASTELERIA','COMERCIAL',
    'DISTRIBUCIONES','CATERING','GRUPO','INDUSTRIAS','PANADERIA',
    'SUPERMERCADOS','SUPERPONCE','MESON','ULTRAMARINOS',
    'BIOCOMBUSTIBLE','VECOISMA','CASH ','MARKET','SOCICOLONIA',
    'HORTIMINUTO','PAELSA','DELGADO SABIOTE','GASOLEOS','DISALCIM',
    'DISFRUTA','VENTAS Y PLATAFORMAS','LUSAN','MAVER OIL',
    'ANDALUBOX','AYUNTAMIENTO','ALMACEN JIMENEZ','DESPENSA',
    'TRASTIENDA','E.S.SAN','E.S. VENTA','PAZO E HIJO','ALCALA MARKET',
    'PEINADO CALVO','CASH PEYCA','CASH FORTUNA',
]

def guess_tipo(nombre, nif):
    n = (nombre or '').upper()
    for kw in COMPANY_KW:
        if kw.upper() in n:
            return 'Empresa'
    nif_norm = norm_nif(nif) or ''
    if nif_norm and nif_norm[0].isalpha() and nif_norm[0] not in ('X', 'Y', 'Z'):
        return 'Empresa'
    return 'Particular'

# ── Read Excel ───────────────────────────────────────────────────────────────
wb = xlrd.open_workbook(EXCEL, encoding_override='cp1252')
ws = wb.sheet_by_index(0)

records = []
for r in range(1, ws.nrows):
    nom   = clean(ws.cell_value(r, 1))
    dire  = clean(ws.cell_value(r, 2))
    cp    = clean(ws.cell_value(r, 3))
    pobl  = clean(ws.cell_value(r, 4))
    prov  = clean(ws.cell_value(r, 5))
    telf  = clean_phone(ws.cell_value(r, 6))
    nif_r = clean(ws.cell_value(r, 7))

    if not nom or nom.upper() == 'CONTADO':
        continue

    nif_clean    = norm_nif(nif_r)
    tipo         = guess_tipo(nom, nif_clean)
    razon_social = nom if tipo == 'Empresa' else None

    records.append({
        'nombre':        nom,
        'razon_social':  razon_social,
        'nif':           nif_clean,
        'direccion':     dire,
        'codigo_postal': cp,
        'ciudad':        pobl,
        'provincia':     prov,
        'telefono':      telf,
        'tipo':          tipo,
    })

print(f"Filas leídas del Excel: {len(records)}")

# ── Connect & Insert ──────────────────────────────────────────────────────────
INSERT_SQL = """
INSERT INTO clientes (
    empresa_id, tipo, nombre, razon_social, nif,
    direccion, codigo_postal, ciudad, provincia, telefono,
    forma_pago, dias_pago, tipo_impuesto, aplicar_impuesto,
    recargo_equivalencia, no_aplicar_retenciones,
    porcentaje_retencion, descuento_general,
    estado_cliente, activo, estado_sincronizacion,
    no_realizar_facturas, fecha_alta,
    created_at, updated_at
) VALUES (
    %(empresa_id)s, %(tipo)s, %(nombre)s, %(razon_social)s, %(nif)s,
    %(direccion)s, %(codigo_postal)s, %(ciudad)s, %(provincia)s, %(telefono)s,
    'Contado', 0, 'IVA', TRUE,
    FALSE, FALSE,
    0, 0,
    'Activo', TRUE, 'NoAplicable',
    FALSE, CURRENT_DATE,
    NOW(), NOW()
)
RETURNING id
"""

conn = psycopg2.connect(DSN)
cur  = conn.cursor()

inserted = 0
errors   = []

for rec in records:
    try:
        cur.execute(INSERT_SQL, {**rec, 'empresa_id': EMPRESA_ID})
        new_id = cur.fetchone()[0]
        cur.execute(
            "UPDATE clientes SET codigo_cliente_interno = %s WHERE id = %s",
            (f"CLI-{new_id:06d}", new_id)
        )
        inserted += 1
        print(f"  ✓ [{new_id}] {rec['nombre']}")
    except Exception as e:
        errors.append((rec['nombre'], str(e)))
        conn.rollback()
        cur = conn.cursor()

conn.commit()
cur.close()
conn.close()

print()
print(f"{'='*60}")
print(f"RESULTADO: {inserted} clientes insertados, {len(errors)} errores")
if errors:
    print("ERRORES:")
    for name, err in errors:
        print(f"  ✗ [{name}] → {err}")

sys.exit(1 if errors else 0)
