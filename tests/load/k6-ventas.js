/**
 * k6 Load Test — Flujo de ventas: login → crear factura
 * Uso: k6 run tests/load/k6-ventas.js
 *      k6 run --vus 10 --duration 30s tests/load/k6-ventas.js
 */
import http from 'k6/http'
import { check, sleep } from 'k6'
import { Rate, Trend } from 'k6/metrics'

// ── Métricas personalizadas ────────────────────────────────
const errorRate   = new Rate('errors')
const loginTime   = new Trend('login_duration_ms')
const facturaTime = new Trend('crear_factura_ms')

// ── Opciones de carga ─────────────────────────────────────
export const options = {
  stages: [
    { duration: '10s', target: 5  },  // rampa de subida
    { duration: '30s', target: 10 },  // carga sostenida: 10 VUs concurrentes
    { duration: '10s', target: 0  },  // rampa de bajada
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'],  // 95% de requests < 500ms
    errors:            ['rate<0.02'],  // menos de 2% de errores
    login_duration_ms: ['p(95)<300'],
  },
}

const BASE = __ENV.BASE_URL || 'http://localhost:5064'

// ── Helpers ───────────────────────────────────────────────
function login(email, password) {
  const start = Date.now()
  const res = http.post(
    `${BASE}/api/auth/login`,
    JSON.stringify({ email, password }),
    { headers: { 'Content-Type': 'application/json' } }
  )
  loginTime.add(Date.now() - start)
  check(res, { 'login 200': r => r.status === 200 })
  return res.status === 200 ? res.json('data.token') : null
}

// ── Escenario principal ───────────────────────────────────
export default function () {
  // 1. Login
  const token = login('admin@buenatierra.com', 'Admin#BuenaTierra2025')
  if (!token) { errorRate.add(1); return }
  errorRate.add(0)

  const headers = {
    'Content-Type':  'application/json',
    'Authorization': `Bearer ${token}`,
  }

  // 2. GET catálogo de productos
  const productos = http.get(`${BASE}/api/productos`, { headers })
  check(productos, { 'productos 200': r => r.status === 200 })

  // 3. GET lista de clientes
  const clientes = http.get(`${BASE}/api/clientes`, { headers })
  check(clientes, { 'clientes 200': r => r.status === 200 })

  sleep(0.5)

  // 4. GET stock disponible de primer producto (simula comprobación POS)
  if (productos.status === 200) {
    const lista = productos.json('data') || []
    if (lista.length > 0) {
      const pid = lista[0].id
      const stock = http.get(`${BASE}/api/stock/producto/${pid}/disponible`, { headers })
      check(stock, { 'stock 200': r => r.status === 200 })
    }
  }

  sleep(1)
}
