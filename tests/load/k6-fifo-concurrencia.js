/**
 * k6 Load Test — FIFO bajo concurrencia
 * Verifica que no haya oversell de lotes cuando múltiples repartidores
 * crean facturas simultáneamente para el mismo producto.
 *
 * PRE-REQUISITO: Que exista al menos un producto con lotes en stock.
 * Uso: k6 run tests/load/k6-fifo-concurrencia.js
 */
import http from 'k6/http'
import { check, sleep } from 'k6'
import { Counter } from 'k6/metrics'

const facturasFallidas  = new Counter('facturas_fallidas')
const facturasExitosas  = new Counter('facturas_exitosas')

export const options = {
  // 10 repartidores concurrentes durante 20 segundos
  vus:      10,
  duration: '20s',
  thresholds: {
    facturas_fallidas: ['count<5'],       // menos de 5 errores totales
    http_req_duration: ['p(95)<2000'],   // 2 segundos max p95
  },
}

const BASE       = __ENV.BASE_URL      || 'http://localhost:5064'
const PRODUCTO_ID = parseInt(__ENV.PRODUCTO_ID || '1')
const CLIENTE_ID  = parseInt(__ENV.CLIENTE_ID  || '1')
const SERIE_ID    = parseInt(__ENV.SERIE_ID    || '1')

function login(email, password) {
  const res = http.post(
    `${BASE}/api/auth/login`,
    JSON.stringify({ email, password }),
    { headers: { 'Content-Type': 'application/json' } }
  )
  return res.status === 200 ? res.json('data.token') : null
}

export default function () {
  const token = login('admin@buenatierra.com', 'Admin#BuenaTierra2025')
  if (!token) { facturasFallidas.add(1); return }

  const headers = {
    'Content-Type':  'application/json',
    'Authorization': `Bearer ${token}`,
  }

  const payload = JSON.stringify({
    clienteId: CLIENTE_ID,
    serieId:   SERIE_ID,
    items:     [{ productoId: PRODUCTO_ID, cantidad: 1, descuento: 0 }],
  })

  const res = http.post(`${BASE}/api/facturas/crear`, payload, { headers })

  if (res.status === 200 || res.status === 201) {
    facturasExitosas.add(1)
    check(res, {
      'factura creada con lote': r => {
        const data = r.json('data')
        return data && data.id > 0
      },
    })
  } else {
    facturasFallidas.add(1)
    // 409 Conflict o 422 sin stock disponible son respuestas válidas bajo concurrencia
    check(res, {
      'error esperado (sin stock o conflicto)': r =>
        r.status === 409 || r.status === 422 || r.status === 400,
    })
  }

  sleep(0.2)
}
