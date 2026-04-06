#!/usr/bin/env python3
"""
BuenaTierra — Importador de datos por CSV.

Uso:
  python importar.py clientes.csv
  python importar.py productos.csv ingredientes.csv
  python importar.py carpeta/          (procesa todos los .csv)

  Opciones:
  --url       URL base de la API (default: http://localhost:5001)
  --email     Email admin (default: admin@buenatierra.com)
  --password  Contraseña admin (default: Admin#BuenaTierra2025)
  --empresa   EmpresaId (default: 1)
  --dry-run   Muestra lo que haría sin llamar a la API

Tipos detectados por nombre de archivo (sin extensión):
  clientes     → POST /api/clientes
  productos    → POST /api/productos
  ingredientes → POST /api/ingredientes

Encabezados CSV recomendados:
  clientes.csv     → nombre, tipo, nif, email, telefono, ciudad, provincia,
                      forma_pago, dias_pago, notas
  productos.csv    → nombre, precio_venta, iva_porcentaje, codigo, referencia,
                      unidad_medida, vida_util_dias, stock_minimo, requiere_lote,
                      precio_coste, descripcion
  ingredientes.csv → nombre, descripcion, proveedor, codigo_proveedor
"""

import argparse
import csv
import json
import os
import sys
from pathlib import Path

try:
    import requests
except ImportError:
    print("ERROR: El módulo 'requests' no está instalado.")
    print("  Instálalo con:  pip install -r scripts/requirements.txt")
    sys.exit(1)
try:
    import pandas as pd
except Exception:
    pd = None

# ─── Constantes ────────────────────────────────────────────────────────────────

DEFAULT_URL       = "http://localhost:5001"
DEFAULT_EMAIL     = "admin@buenatierra.com"
DEFAULT_PASSWORD  = "Admin#BuenaTierra2025"
DEFAULT_EMPRESA   = 1

# ─── Login ────────────────────────────────────────────────────────────────────

def login(url: str, email: str, password: str, empresa_id: int) -> str:
    resp = requests.post(
        f"{url}/api/auth/login",
        json={"email": email, "password": password, "empresaId": empresa_id},
        timeout=10,
    )
    if resp.status_code != 200:
        print(f"ERROR al autenticar: HTTP {resp.status_code}")
        print(resp.text)
        sys.exit(1)
    token = resp.json()["data"]["token"]
    print(f"  Login OK  ({email})")
    return token

# ─── Mapeadores CSV → JSON ────────────────────────────────────────────────────

def _bool(v: str) -> bool:
    return v.strip().lower() in ("true", "si", "sí", "1", "yes")

def _int(v: str, default: int = 0) -> int:
    try:
        return int(v.strip()) if v.strip() else default
    except ValueError:
        return default

def _decimal(v: str, default: float = 0.0) -> float:
    try:
        return float(v.strip().replace(",", ".")) if v.strip() else default
    except ValueError:
        return default

def _str(v: str | None) -> str | None:
    return v.strip() if v and v.strip() else None


def map_cliente(row: dict) -> dict:
    """Convierte una fila CSV en el body de POST /api/clientes."""
    tipo_raw = row.get("tipo", "Empresa").strip()
    tipo_map = {
        "empresa":    "Empresa",
        "autonomo":   "Autonomo",
        "autónomo":   "Autonomo",
        "particular": "Particular",
        "repartidor": "Repartidor",
    }
    tipo = tipo_map.get(tipo_raw.lower(), tipo_raw)

    forma_raw = row.get("forma_pago", "Contado").strip()
    forma_map = {
        "contado":       "Contado",
        "30":            "Transfer30",
        "transfer30":    "Transfer30",
        "60":            "Transfer60",
        "transfer60":    "Transfer60",
        "90":            "Transfer90",
        "transfer90":    "Transfer90",
        "domiciliacion": "Domiciliacion",
        "domiciliación": "Domiciliacion",
        "cheque":        "Cheque",
        "efectivo":      "Efectivo",
        "otro":          "Otro",
    }
    forma = forma_map.get(forma_raw.lower(), forma_raw)

    return {
        "tipo":                     tipo,
        "nombre":                   row.get("nombre", "").strip(),
        "apellidos":                _str(row.get("apellidos")),
        "razonSocial":              _str(row.get("razon_social")),
        "nombreComercial":          _str(row.get("nombre_comercial")),
        "nombreFiscal":             _str(row.get("nombre_fiscal")),
        "nif":                      _str(row.get("nif")),
        "aliasCliente":             _str(row.get("alias")),
        "direccion":                _str(row.get("direccion")),
        "codigoPostal":             _str(row.get("codigo_postal")),
        "ciudad":                   _str(row.get("ciudad")),
        "provincia":                _str(row.get("provincia")),
        "pais":                     row.get("pais", "España").strip() or "España",
        "telefono":                 _str(row.get("telefono")),
        "telefono2":                _str(row.get("telefono2")),
        "email":                    _str(row.get("email")),
        "personaContacto":          _str(row.get("persona_contacto")),
        "observacionesContacto":    _str(row.get("observaciones_contacto")),
        "ccc":                      _str(row.get("ccc")),
        "iban":                     _str(row.get("iban")),
        "banco":                    _str(row.get("banco")),
        "bic":                      _str(row.get("bic")),
        "formaPago":                forma,
        "diasPago":                 _int(row.get("dias_pago", "0")),
        "tipoImpuesto":             row.get("tipo_impuesto", "IVA").strip() or "IVA",
        "aplicarImpuesto":          _bool(row.get("aplicar_impuesto", "true")),
        "recargoEquivalencia":      _bool(row.get("recargo_equivalencia", "false")),
        "noAplicarRetenciones":     _bool(row.get("no_aplicar_retenciones", "false")),
        "porcentajeRetencion":      _decimal(row.get("porcentaje_retencion", "0")),
        "descuentoGeneral":         _decimal(row.get("descuento_general", "0")),
        "tarifaId":                 None,
        "estadoCliente":            row.get("estado", "Activo").strip() or "Activo",
        "activo":                   _bool(row.get("activo", "true")),
        "estadoSincronizacion":     "NoAplicable",
        "noRealizarFacturas":       _bool(row.get("no_realizar_facturas", "false")),
        "notas":                    _str(row.get("notas")),
        "repartidorEmpresaId":      None,
    }


def map_producto(row: dict) -> dict:
    """Convierte una fila CSV en el body de POST /api/productos."""
    return {
        "nombre":                 row.get("nombre", "").strip(),
        "codigo":                 _str(row.get("codigo")),
        "codigoBarras":           _str(row.get("codigo_barras")),
        "descripcion":            _str(row.get("descripcion")),
        "categoriaId":            _int(row.get("categoria_id", "")) or None,
        "precioVenta":            _decimal(row.get("precio_venta", "0")),
        "precioCoste":            _decimal(row.get("precio_coste", "")) or None,
        "ivaPorcentaje":          _decimal(row.get("iva_porcentaje", "10")),
        "unidadMedida":           row.get("unidad_medida", "ud").strip() or "ud",
        "pesoUnitarioGr":         _decimal(row.get("peso_gr", "")) or None,
        "vidaUtilDias":           _int(row.get("vida_util_dias", "")) or None,
        "descuentoPorDefecto":    _decimal(row.get("descuento", "0")),
        "proveedorHabitual":      _str(row.get("proveedor")),
        "referencia":             _str(row.get("referencia")),
        "fabricante":             _str(row.get("fabricante")),
        "stockMinimo":            _decimal(row.get("stock_minimo", "0")),
        "stockMaximo":            _decimal(row.get("stock_maximo", "")) or None,
        "requiereLote":           _bool(row.get("requiere_lote", "true")),
        "compartidoRepartidores": _bool(row.get("compartido_repartidores", "false")),
        "activo":                 _bool(row.get("activo", "true")),
        "conservacion":           _str(row.get("conservacion")),
        "temperaturaMin":         _decimal(row.get("temp_min", "")) or None,
        "temperaturaMax":         _decimal(row.get("temp_max", "")) or None,
    }


def map_ingrediente(row: dict) -> dict:
    """Convierte una fila CSV en el body de POST /api/ingredientes."""
    return {
        "nombre":          row.get("nombre", "").strip(),
        "descripcion":     _str(row.get("descripcion")),
        "proveedor":       _str(row.get("proveedor")),
        "codigoProveedor": _str(row.get("codigo_proveedor")),
        "alergenoIds":     [],
    }


# ─── Mapeo nombre_archivo → (endpoint, mapeador) ──────────────────────────────

HANDLERS: dict[str, tuple[str, callable]] = {
    "clientes":     ("/api/clientes",     map_cliente),
    "productos":    ("/api/productos",    map_producto),
    "ingredientes": ("/api/ingredientes", map_ingrediente),
}

# ─── Importador principal ─────────────────────────────────────────────────────

def import_file(
    csv_path: Path,
    url: str,
    token: str,
    dry_run: bool,
) -> tuple[int, int]:
    """
    Procesa un CSV. Devuelve (ok, errores).
    """
    stem = csv_path.stem.lower()

    # Detectar tipo buscando coincidencia en el nombre
    handler_key = None
    for key in HANDLERS:
        if key in stem:
            handler_key = key
            break

    if handler_key is None:
        print(f"  SKIP  {csv_path.name!r} — tipo no reconocido "
              f"(nombres soportados: {', '.join(HANDLERS)})")
        return 0, 0

    endpoint, mapper = HANDLERS[handler_key]
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

    ok = err = 0
    print(f"\n  → {csv_path.name}  [{handler_key}]  endpoint: {endpoint}")

    suffix = csv_path.suffix.lower()
    rows = []
    if suffix in ('.xls', '.xlsx'):
        if pd is None:
            print(f"ERROR: pandas no está disponible. Instala las dependencias: pip install -r scripts/requirements.txt")
            return 0, 1
        try:
            df = pd.read_excel(csv_path, engine=None)
            df = df.where(pd.notnull(df), None)
            rows = df.to_dict(orient='records')
        except Exception as e:
            print(f"ERROR leyendo Excel {csv_path.name}: {e}")
            return 0, 1
    else:
        # Intentar UTF-8 primero, con fallback para CSVs legacy de Excel (cp1252/latin1)
        loaded = False
        for enc in ("utf-8-sig", "cp1252", "latin-1"):
            try:
                with csv_path.open(encoding=enc, newline="") as f:
                    reader = csv.DictReader(f)
                    if reader.fieldnames is None:
                        print("    SKIP: archivo vacío o sin cabeceras")
                        return 0, 0
                    rows = list(reader)
                    loaded = True
                if enc != "utf-8-sig":
                    print(f"    WARN: '{csv_path.name}' leído con encoding fallback: {enc}")
                break
            except UnicodeDecodeError:
                continue

        if not loaded:
            print(f"ERROR: no se pudo decodificar '{csv_path.name}'. Guarda el CSV en UTF-8.")
            return 0, 1

    for idx, row in enumerate(rows, start=2):
        # normalizar row keys/values to str
        row = {k: (v if v is None else str(v)) for k, v in row.items()}
        if not any((v and v.strip()) for v in row.values() if isinstance(v, str)):
            continue

        try:
            body = mapper(row)
        except Exception as e:
            print(f"    línea {idx}: ERROR al mapear → {e}")
            print(f"      fila: {row}")
            err += 1
            continue

        nombre = body.get("nombre") or body.get("Nombre") or f"fila {idx}"

        if dry_run:
            print(f"    [DRY-RUN] línea {idx} '{nombre}': {json.dumps(body, ensure_ascii=False)[:120]}…")
            ok += 1
            continue

        try:
            resp = requests.post(
                f"{url}{endpoint}",
                headers=headers,
                json=body,
                timeout=15,
            )
            if resp.status_code in (200, 201):
                created_id = resp.json().get("data", {}).get("id") or resp.json().get("data", {}).get("Id") or "?"
                print(f"    OK    línea {idx} '{nombre}'  → id={created_id}")
                ok += 1
            else:
                try:
                    msg = resp.json().get("message") or resp.text[:120]
                except Exception:
                    msg = resp.text[:120]
                print(f"    ERROR línea {idx} '{nombre}': HTTP {resp.status_code} — {msg}")
                err += 1
        except requests.RequestException as e:
            print(f"    ERROR línea {idx} '{nombre}': {e}")
            err += 1

    return ok, err


# ─── CLI ──────────────────────────────────────────────────────────────────────

def collect_csv_files(paths: list[str]) -> list[Path]:
    files: list[Path] = []
    for p in paths:
        path = Path(p)
        if path.is_dir():
            files.extend(sorted(path.glob("*.csv")))
        elif path.is_file():
            files.append(path)
        else:
            print(f"WARN: '{p}' no existe, se omite.")
    return files


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Importa datos desde archivos CSV a la API de BuenaTierra.")
    parser.add_argument("paths", nargs="+",
                        help="Archivos .csv o carpetas a procesar.")
    parser.add_argument("--url",      default=DEFAULT_URL,      help="URL base de la API.")
    parser.add_argument("--email",    default=DEFAULT_EMAIL,    help="Email del usuario admin.")
    parser.add_argument("--password", default=DEFAULT_PASSWORD, help="Contraseña.")
    parser.add_argument("--empresa",  default=DEFAULT_EMPRESA,  type=int,
                        help="EmpresaId (default: 1).")
    parser.add_argument("--dry-run",  action="store_true",
                        help="No llama a la API; solo muestra qué haría.")
    args = parser.parse_args()

    print("=" * 60)
    print(f"  BuenaTierra CSV Importer")
    print(f"  URL: {args.url}   Empresa: {args.empresa}")
    if args.dry_run:
        print("  MODO DRY-RUN — no se realizarán cambios")
    print("=" * 60)

    # Login
    if args.dry_run:
        token = "dry-run-token"
        print("  [DRY-RUN] Login omitido")
    else:
        token = login(args.url, args.email, args.password, args.empresa)

    # Recopilar archivos
    csv_files = collect_csv_files(args.paths)
    if not csv_files:
        print("\nNo se encontraron archivos CSV.")
        sys.exit(0)

    total_ok = total_err = 0
    for f in csv_files:
        ok, err = import_file(f, args.url, token, args.dry_run)
        total_ok  += ok
        total_err += err

    print("\n" + "=" * 60)
    print(f"  TOTAL: {total_ok} insertados,  {total_err} errores")
    print("=" * 60)
    sys.exit(1 if total_err else 0)


if __name__ == "__main__":
    main()
