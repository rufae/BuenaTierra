#!/usr/bin/env python3
"""
Importador de pedidos CSV -> base de datos BuenaTierra.

Lee columnas: Cliente,producto,cantidad,lote,fecha
Crea pedidos en estado Confirmado y descuenta stock por lote en el momento de importar.

Uso:
  python scripts/importar_pedidos_csv.py --csv pedidos.csv
  python scripts/importar_pedidos_csv.py --csv pedidos.csv --dry-run

Conexion DB (orden de prioridad):
1) --dsn
2) DATABASE_URL
3) Defaults locales (docker compose dev)
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import sys
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime, date
from decimal import Decimal, InvalidOperation
from typing import Dict, List, Tuple

try:
    import psycopg2
    from psycopg2.extras import RealDictCursor
except ImportError:
    print("ERROR: falta psycopg2-binary. Ejecuta: pip install -r scripts/requirements.txt")
    raise


@dataclass
class CsvLine:
    cliente: str
    producto_csv: str
    cantidad: Decimal
    lote: str
    fecha: date


PRODUCT_ALIASES = {
    "PALMERA KINDER": "PALMERA SABOR KINDER",
}

RE_EQUIVALENCIA = {
    Decimal("21"): Decimal("5.2"),
    Decimal("10"): Decimal("1.4"),
    Decimal("4"): Decimal("0.5"),
}


def parse_decimal(raw: str) -> Decimal:
    try:
        return Decimal(raw.strip().replace(",", "."))
    except (InvalidOperation, AttributeError) as exc:
        raise ValueError(f"Cantidad invalida: {raw!r}") from exc


def parse_date(raw: str) -> date:
    raw = raw.strip()
    for fmt in ("%d/%m/%Y", "%Y-%m-%d"):
        try:
            return datetime.strptime(raw, fmt).date()
        except ValueError:
            continue
    raise ValueError(f"Fecha invalida: {raw!r}")


def read_csv(path: str) -> List[CsvLine]:
    rows: List[CsvLine] = []
    with open(path, "r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        required = {"Cliente", "producto", "cantidad", "lote", "fecha"}
        if not reader.fieldnames or set(reader.fieldnames) != required:
            missing = required - set(reader.fieldnames or [])
            raise ValueError(f"Cabeceras invalidas. Faltan: {sorted(missing)}")

        for i, row in enumerate(reader, start=2):
            cliente = (row.get("Cliente") or "").strip()
            producto = (row.get("producto") or "").strip()
            lote = (row.get("lote") or "").strip()
            cantidad = parse_decimal(row.get("cantidad") or "")
            fecha = parse_date(row.get("fecha") or "")

            if not cliente or not producto or not lote:
                raise ValueError(f"Fila {i}: Cliente/producto/lote no pueden ir vacios")
            if cantidad <= 0:
                raise ValueError(f"Fila {i}: cantidad debe ser > 0")

            rows.append(CsvLine(cliente, producto, cantidad, lote, fecha))

    return rows


def resolve_dsn(cli_dsn: str | None) -> str:
    if cli_dsn:
        return cli_dsn
    env = os.getenv("DATABASE_URL")
    if env:
        return env
    return "host=localhost port=5434 dbname=buenatierra user=buenatierra_admin password=devpassword123"


def normalize_cliente(s: str) -> str:
    return " ".join(s.upper().split())


def normalize_producto_csv(s: str) -> str:
    s = " ".join(s.upper().split())
    return PRODUCT_ALIASES.get(s, s)


def get_cliente(cur, empresa_id: int, cliente_csv: str) -> Dict:
    key = normalize_cliente(cliente_csv)
    cur.execute(
        """
                SELECT id, descuento_general, tipo_impuesto, aplicar_impuesto,
                             recargo_equivalencia, no_aplicar_retenciones, porcentaje_retencion
        FROM clientes
        WHERE empresa_id = %s
          AND UPPER(TRIM(CONCAT(COALESCE(nombre,''), ' ', COALESCE(apellidos,'')))) = %s
        ORDER BY id
        LIMIT 1
        """,
        (empresa_id, key),
    )
    row = cur.fetchone()
    if not row:
        raise ValueError(f"Cliente no encontrado: {cliente_csv!r}")
    return dict(row)


def get_cliente_condiciones(cur, cliente_id: int) -> List[Dict]:
    cur.execute(
        """
        SELECT id, articulo_familia, codigo, descripcion, tipo, precio, descuento
        FROM cliente_condiciones_especiales
        WHERE cliente_id = %s
        ORDER BY id DESC
        """,
        (cliente_id,),
    )
    return [dict(row) for row in cur.fetchall()]


def get_producto(cur, empresa_id: int, producto_csv: str) -> Dict:
    nombre = normalize_producto_csv(producto_csv)
    cur.execute(
        """
        SELECT id, nombre, precio_venta, iva_porcentaje
        FROM productos
        WHERE empresa_id = %s
          AND UPPER(nombre) = %s
        LIMIT 1
        """,
        (empresa_id, nombre),
    )
    row = cur.fetchone()
    if not row:
        raise ValueError(f"Producto no encontrado: {producto_csv!r}")
    return dict(row)


def is_global_codigo(value: str | None) -> bool:
    if value is None or not value.strip():
        return True
    normalized = value.strip().upper()
    return normalized in {"*", "TODOS", "ALL"}


def get_specificity(codigo: str | None, producto: Dict) -> int:
    if is_global_codigo(codigo):
        return 1

    key = codigo.strip().upper()
    candidates = [
        str(producto.get("nombre") or "").strip().upper(),
        str(producto.get("codigo") or "").strip().upper(),
        str(producto.get("referencia") or "").strip().upper(),
        str(producto.get("id")),
    ]
    return 2 if key in [c for c in candidates if c] else 0


def find_best_condicion(condiciones: List[Dict], producto: Dict, tipo_objetivo: str) -> Dict | None:
    candidates = []
    for condicion in condiciones:
        if condicion.get("articulo_familia") == "Familia":
            continue

        tipo = condicion.get("tipo")
        if tipo_objetivo == "Precio":
            if tipo not in ("Precio", "PrecioEspecial"):
                continue
        else:
            if tipo != "Descuento":
                continue

        specificity = get_specificity(condicion.get("codigo"), producto)
        if specificity > 0:
            candidates.append((specificity, int(condicion["id"]), condicion))

    if not candidates:
        return None

    candidates.sort(key=lambda x: (x[0], x[1]), reverse=True)
    return candidates[0][2]


def resolve_pricing(cliente: Dict, producto: Dict, condiciones: List[Dict]) -> Tuple[Decimal, Decimal]:
    condicion_precio = find_best_condicion(condiciones, producto, "Precio")
    condicion_descuento = find_best_condicion(condiciones, producto, "Descuento")

    precio = Decimal(str(producto["precio_venta"]))
    if condicion_precio and Decimal(str(condicion_precio.get("precio") or 0)) > 0:
        precio = Decimal(str(condicion_precio["precio"]))

    descuento = Decimal("0")
    if condicion_descuento and Decimal(str(condicion_descuento.get("descuento") or 0)) > 0:
        descuento = Decimal(str(condicion_descuento["descuento"]))
    elif Decimal(str(cliente.get("descuento_general") or 0)) > 0:
        descuento = Decimal(str(cliente["descuento_general"]))
    elif Decimal(str(producto.get("descuento_por_defecto") or 0)) > 0:
        descuento = Decimal(str(producto["descuento_por_defecto"]))

    return precio, descuento


def get_iva_porcentaje(cliente: Dict, producto: Dict) -> Decimal:
    tipo = cliente.get("tipo_impuesto")
    if tipo == "Exento":
        return Decimal("0")
    if tipo == "IGIC":
        return Decimal("7")
    return Decimal(str(producto["iva_porcentaje"])) if cliente.get("aplicar_impuesto") else Decimal("0")


def get_recargo_equivalencia(cliente: Dict, iva_pct: Decimal) -> Decimal:
    aplica_re = cliente.get("tipo_impuesto") == "RecargoEquivalencia" or bool(cliente.get("recargo_equivalencia"))
    if not aplica_re:
        return Decimal("0")
    return RE_EQUIVALENCIA.get(iva_pct, Decimal("0"))


def get_lote_stock(cur, empresa_id: int, producto_id: int, codigo_lote: str) -> Dict:
    cur.execute(
        """
        SELECT l.id AS lote_id, l.codigo_lote, s.cantidad_disponible
        FROM lotes l
        JOIN stock s
          ON s.empresa_id = l.empresa_id
         AND s.producto_id = l.producto_id
         AND s.lote_id = l.id
        WHERE l.empresa_id = %s
          AND l.producto_id = %s
          AND l.codigo_lote = %s
        FOR UPDATE
        """,
        (empresa_id, producto_id, codigo_lote),
    )
    row = cur.fetchone()
    if not row:
        raise ValueError(f"Lote no encontrado para producto_id={producto_id}, lote={codigo_lote}")
    return dict(row)


def next_numero_pedido(cur, fecha: date) -> str:
    prefix = f"PED-{fecha.strftime('%Y%m%d')}-CSV-"
    cur.execute(
        """
        SELECT numero_pedido
        FROM pedidos
        WHERE numero_pedido LIKE %s
        ORDER BY id DESC
        LIMIT 1
        """,
        (prefix + "%",),
    )
    row = cur.fetchone()
    if not row or not row["numero_pedido"]:
        return prefix + "01"
    last = row["numero_pedido"].rsplit("-", 1)[-1]
    try:
        n = int(last) + 1
    except ValueError:
        n = 1
    return prefix + f"{n:02d}"


def build_groups(lines: List[CsvLine]) -> Dict[Tuple[str, date], List[CsvLine]]:
    groups: Dict[Tuple[str, date], List[CsvLine]] = defaultdict(list)
    for line in lines:
        groups[(line.cliente, line.fecha)].append(line)
    return groups


def import_group(cur, empresa_id: int, usuario_id: int, cliente: str, fecha: date, lines: List[CsvLine], tag_prefix: str) -> int:
    cliente_row = get_cliente(cur, empresa_id, cliente)
    cliente_id = int(cliente_row["id"])
    condiciones = get_cliente_condiciones(cur, cliente_id)
    numero_pedido = next_numero_pedido(cur, fecha)
    tag = f"{tag_prefix}:{normalize_cliente(cliente)}:{fecha.isoformat()}"

    cur.execute(
        """
        SELECT id
        FROM pedidos
        WHERE empresa_id = %s
          AND cliente_id = %s
          AND fecha_pedido = %s
          AND notas = %s
        LIMIT 1
        """,
        (empresa_id, cliente_id, fecha, tag),
    )
    if cur.fetchone():
        raise ValueError(f"Pedido ya importado para cliente={cliente} fecha={fecha} (tag={tag})")

    cur.execute(
        """
        INSERT INTO pedidos (
            empresa_id, cliente_id, usuario_id, numero_pedido, fecha_pedido, estado,
            subtotal, descuento_total, iva_total, recargo_equivalencia_total, retencion_total, total,
            notas, created_at, updated_at
        ) VALUES (%s,%s,%s,%s,%s,'Confirmado',0,0,0,0,0,0,%s,NOW(),NOW())
        RETURNING id
        """,
        (empresa_id, cliente_id, usuario_id, numero_pedido, fecha, tag),
    )
    pedido_id = int(cur.fetchone()["id"])

    subtotal = Decimal("0")
    descuento_total = Decimal("0")
    iva_total = Decimal("0")
    recargo_total = Decimal("0")

    for idx, line in enumerate(lines, start=1):
        producto = get_producto(cur, empresa_id, line.producto_csv)
        lote = get_lote_stock(cur, empresa_id, int(producto["id"]), line.lote)

        disp = Decimal(str(lote["cantidad_disponible"]))
        if disp < line.cantidad:
            raise ValueError(
                f"Stock insuficiente: producto={producto['nombre']} lote={line.lote} disp={disp} req={line.cantidad}"
            )

        precio, descuento = resolve_pricing(cliente_row, producto, condiciones)
        iva_pct = get_iva_porcentaje(cliente_row, producto)
        re_pct = get_recargo_equivalencia(cliente_row, iva_pct)
        line_bruto = (line.cantidad * precio).quantize(Decimal("0.0001"))
        line_subtotal = (line.cantidad * precio * (Decimal("1") - descuento / Decimal("100"))).quantize(Decimal("0.0001"))
        line_iva = (line_subtotal * iva_pct / Decimal("100")).quantize(Decimal("0.01"))
        line_re = (line_subtotal * re_pct / Decimal("100")).quantize(Decimal("0.01"))

        reserva = json.dumps([
            {
                "loteId": int(lote["lote_id"]),
                "codigoLote": line.lote,
                "cantidad": float(line.cantidad),
            }
        ])

        cur.execute(
            """
            INSERT INTO pedidos_lineas (
                pedido_id, producto_id, descripcion, cantidad, precio_unitario,
                descuento, iva_porcentaje, recargo_equivalencia_porcentaje,
                orden, reserva_lotes_json, created_at, updated_at
            ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,NOW(),NOW())
            RETURNING id
            """,
            (
                pedido_id,
                int(producto["id"]),
                producto["nombre"],
                line.cantidad,
                precio,
                descuento,
                iva_pct,
                re_pct,
                idx,
                reserva,
            ),
        )

        cur.execute(
            """
            UPDATE stock
            SET cantidad_disponible = cantidad_disponible - %s,
                updated_at = NOW()
            WHERE empresa_id = %s
              AND producto_id = %s
              AND lote_id = %s
            """,
            (line.cantidad, empresa_id, int(producto["id"]), int(lote["lote_id"])),
        )

        cur.execute(
            """
            INSERT INTO movimientos_stock (
                empresa_id, producto_id, lote_id, tipo, cantidad,
                cantidad_antes, cantidad_despues, referencia_tipo, referencia_id,
                usuario_id, notas, created_at, updated_at
            ) VALUES (
                %s, %s, %s, 'Venta', %s,
                %s, %s, 'pedido_confirmado', %s,
                %s, %s, NOW(), NOW()
            )
            """,
            (
                empresa_id,
                int(producto["id"]),
                int(lote["lote_id"]),
                line.cantidad,
                disp,
                disp - line.cantidad,
                pedido_id,
                usuario_id,
                f"Salida al confirmar pedido {numero_pedido} (importador CSV)",
            ),
        )

        cur.execute(
            """
            INSERT INTO trazabilidad (
                empresa_id, lote_id, producto_id, cliente_id, cantidad,
                tipo_operacion, fecha_operacion, usuario_id, datos_adicionales,
                created_at, updated_at
            ) VALUES (%s,%s,%s,%s,%s,'venta_pedido',%s,%s,%s::jsonb,NOW(),NOW())
            """,
            (
                empresa_id,
                int(lote["lote_id"]),
                int(producto["id"]),
                cliente_id,
                line.cantidad,
                fecha,
                usuario_id,
                json.dumps(
                    {
                        "pedidoId": pedido_id,
                        "pedidoNumero": numero_pedido,
                        "codigoLote": line.lote,
                        "importacion": "SCRIPT_IMPORTAR_PEDIDOS_CSV",
                    }
                ),
            ),
        )

        subtotal += line_subtotal
        descuento_total += line_bruto - line_subtotal
        iva_total += line_iva
        recargo_total += line_re

    retencion_pct = Decimal("0") if cliente_row.get("no_aplicar_retenciones") else Decimal(str(cliente_row.get("porcentaje_retencion") or 0))
    retencion_total = (subtotal * retencion_pct / Decimal("100")).quantize(Decimal("0.01"))
    total = subtotal + iva_total + recargo_total - retencion_total
    cur.execute(
        """
        UPDATE pedidos
        SET subtotal = %s,
            descuento_total = %s,
            iva_total = %s,
            recargo_equivalencia_total = %s,
            retencion_total = %s,
            total = %s,
            updated_at = NOW()
        WHERE id = %s
        """,
        (subtotal, descuento_total, iva_total, recargo_total, retencion_total, total, pedido_id),
    )

    return pedido_id


def run_import(args) -> int:
    dsn = resolve_dsn(args.dsn)
    lines = read_csv(args.csv)
    groups = build_groups(lines)

    print(f"Lineas CSV: {len(lines)}")
    print(f"Pedidos a crear (cliente+fecha): {len(groups)}")

    if args.dry_run:
        for (cliente, fecha), ls in groups.items():
            total_items = sum(l.cantidad for l in ls)
            print(f"[DRY-RUN] {cliente} | {fecha.isoformat()} | lineas={len(ls)} | unidades={total_items}")
        return 0

    conn = psycopg2.connect(dsn)
    conn.autocommit = False

    created = 0
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            for (cliente, fecha), ls in groups.items():
                pedido_id = import_group(
                    cur,
                    empresa_id=args.empresa_id,
                    usuario_id=args.usuario_id,
                    cliente=cliente,
                    fecha=fecha,
                    lines=ls,
                    tag_prefix=args.tag_prefix,
                )
                created += 1
                print(f"OK pedido_id={pedido_id} cliente={cliente} fecha={fecha.isoformat()} lineas={len(ls)}")

        conn.commit()
        print(f"Importacion completada. Pedidos creados: {created}")
        return 0
    except Exception as exc:
        conn.rollback()
        print(f"ERROR: {exc}")
        return 1
    finally:
        conn.close()


def main() -> int:
    parser = argparse.ArgumentParser(description="Importar pedidos CSV a la base de datos BuenaTierra")
    parser.add_argument("--csv", default="pedidos.csv", help="Ruta del CSV de pedidos")
    parser.add_argument("--dsn", default=None, help="DSN PostgreSQL completo")
    parser.add_argument("--empresa-id", type=int, default=1, help="empresa_id destino")
    parser.add_argument("--usuario-id", type=int, default=1, help="usuario_id para auditoria")
    parser.add_argument("--tag-prefix", default="IMPORT_PEDIDOS_CSV", help="Prefijo de idempotencia en notas")
    parser.add_argument("--dry-run", action="store_true", help="Solo valida y muestra, sin escribir")

    args = parser.parse_args()

    if not os.path.exists(args.csv):
        print(f"ERROR: no existe el archivo CSV: {args.csv}")
        return 1

    return run_import(args)


if __name__ == "__main__":
    sys.exit(main())
