import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, Cell,
} from 'recharts'
import {
  TrendingUp, Package, Factory, Users, Download, RefreshCw, AlertTriangle, RotateCcw, ShieldCheck,
} from 'lucide-react'
import api from '../lib/api'
import toast from 'react-hot-toast'
import { DateInput } from '../components/DateInput'

// ── Types ────────────────────────────────────────────────────────────────────

interface VentasPunto {
  fecha: string
  fechaLabel: string
  importe: number
  base_: number
  count: number
}
interface VentasData {
  puntos: VentasPunto[]
  totalImporte: number
  totalBase: number
  totalFacturas: number
  desde: string
  hasta: string
}

interface StockProducto {
  productoId: number
  productoNombre: string
  unidad: string
  stockTotal: number
  stockReservado: number
  stockDisponible: number
  numLotes: number
  conAlertas: boolean
}
interface StockData {
  items: StockProducto[]
  totalProductos: number
  productosConAlerta: number
  stockTotalUnidades: number
}

interface ProduccionDia {
  fecha: string
  fechaLabel: string
  cantidadProducida: number
  cantidadMerma: number
  cantidadNeta: number
  numProducciones: number
}
interface TopProducto {
  productoId: number
  nombre: string
  totalProducido: number
  totalMerma: number
  totalNeto: number
  numProducciones: number
}
interface ProduccionData {
  porDia: ProduccionDia[]
  topProductos: TopProducto[]
  totalProducido: number
  totalMerma: number
  totalNeto: number
  numProducciones: number
  desde: string
  hasta: string
}

interface ClienteRanking {
  posicion: number
  clienteId: number | null
  nombre: string
  totalFacturado: number
  numFacturas: number
  ticketMedio: number
  ultimaCompra: string
}
interface ClientesData {
  ranking: ClienteRanking[]
  distribucion: Array<{ nombre: string; totalFacturado: number; numFacturas: number }>
  totalClientes: number
  totalFacturado: number
  desde: string
  hasta: string
}

interface RotacionItem {
  productoId: number
  nombre: string
  unidad: string
  stockActual: number
  ventasPeriodo: number
  rotacion: number
  diasCobertura: number | null
  clasificacion: 'Alta' | 'Media' | 'Baja' | 'Sin movimiento'
}
interface RotacionData {
  items: RotacionItem[]
  totalProductos: number
  productosConMovimiento: number
  rotacionMedia: number
  desde: string
  hasta: string
  diasPeriodo: number
}

type Tab = 'ventas' | 'stock' | 'produccion' | 'clientes' | 'rotacion' | 'sanidad'

// ── Helpers ──────────────────────────────────────────────────────────────────

const fmt8601 = (d: Date) => d.toISOString().split('T')[0]
const fmtEur = (n: number) =>
  n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtNum = (n: number) =>
  n.toLocaleString('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: 3 })

const BRAND = '#7c3aed'
const GREEN = '#059669'
const RED = '#dc2626'
const AMBER = '#d97706'

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'ventas', label: 'Ventas', icon: <TrendingUp className="w-4 h-4" /> },
  { id: 'stock', label: 'Stock', icon: <Package className="w-4 h-4" /> },
  { id: 'produccion', label: 'Producción', icon: <Factory className="w-4 h-4" /> },
  { id: 'clientes', label: 'Clientes', icon: <Users className="w-4 h-4" /> },
  { id: 'rotacion', label: 'Rotación', icon: <RotateCcw className="w-4 h-4" /> },
  { id: 'sanidad', label: 'Sanidad', icon: <ShieldCheck className="w-4 h-4" /> },
]

// ── Page ─────────────────────────────────────────────────────────────────────

export default function Reportes() {
  const hoy = new Date()
  const hace30 = new Date(hoy)
  hace30.setDate(hoy.getDate() - 29)

  const [tab, setTab] = useState<Tab>('ventas')
  const [desde, setDesde] = useState(fmt8601(hace30))
  const [hasta, setHasta] = useState(fmt8601(hoy))

  // ── Queries ─────────────────────────────────────────────────────────────
  const ventasQ = useQuery<VentasData>({
    queryKey: ['reportes', 'ventas', desde, hasta],
    queryFn: () =>
      api.get(`/reportes/ventas?desde=${desde}&hasta=${hasta}`).then(r => r.data),
    enabled: tab === 'ventas',
  })

  const stockQ = useQuery<StockData>({
    queryKey: ['reportes', 'stock'],
    queryFn: () => api.get('/reportes/stock').then(r => r.data),
    enabled: tab === 'stock',
  })

  const produccionQ = useQuery<ProduccionData>({
    queryKey: ['reportes', 'produccion', desde, hasta],
    queryFn: () =>
      api.get(`/reportes/produccion?desde=${desde}&hasta=${hasta}`).then(r => r.data),
    enabled: tab === 'produccion',
  })

  const clientesQ = useQuery<ClientesData>({
    queryKey: ['reportes', 'clientes', desde, hasta],
    queryFn: () =>
      api.get(`/reportes/clientes?desde=${desde}&hasta=${hasta}`).then(r => r.data),
    enabled: tab === 'clientes',
  })

  const rotacionQ = useQuery<RotacionData>({
    queryKey: ['reportes', 'rotacion', desde, hasta],
    queryFn: () =>
      api.get(`/reportes/rotacion?desde=${desde}&hasta=${hasta}`).then(r => r.data),
    enabled: tab === 'rotacion',
  })

  const sanidadQ = useQuery<{
    rows: Array<{
      lote: string; producto: string; fechaFabricacion: string; fechaCaducidad: string;
      cantidadProducida: number; vendidoA: string; facturaNumero: string; fechaVenta: string; cantidadVendida: number
    }>; total: number; desde: string; hasta: string
  }>({
    queryKey: ['reportes', 'sanidad', desde, hasta],
    queryFn: () => api.get(`/reportes/sanidad?desde=${desde}&hasta=${hasta}`).then(r => r.data),
    enabled: tab === 'sanidad',
  })

  const queryMap: Record<Tab, { isLoading: boolean; isError: boolean }> = {
    ventas: ventasQ,
    stock: stockQ,
    produccion: produccionQ,
    clientes: clientesQ,
    rotacion: rotacionQ,
    sanidad: sanidadQ,
  }
  const activeQ = queryMap[tab]
  const isLoading = activeQ.isLoading
  const isError = activeQ.isError

  // ── Export ───────────────────────────────────────────────────────────────
  async function handleExport() {
    try {
      // Sanidad uses a dedicated endpoint
      if (tab === 'sanidad') {
        const res = await api.get(`/facturas/trazabilidad/excel?desde=${desde}&hasta=${hasta}`, { responseType: 'blob' })
        const url = URL.createObjectURL(new Blob([res.data],
          { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
        const link = document.createElement('a')
        link.href = url
        link.download = `trazabilidad_sanidad_${desde}.xlsx`
        link.click()
        URL.revokeObjectURL(url)
        toast.success('Informe Sanidad descargado')
        return
      }
      const params = new URLSearchParams({ tipo: tab, desde, hasta })
      const res = await api.get(`/reportes/export?${params}`, { responseType: 'blob' })
      const url = URL.createObjectURL(new Blob([res.data],
        { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
      const link = document.createElement('a')
      link.href = url
      link.download = `informe_${tab}_${desde}.xlsx`
      link.click()
      URL.revokeObjectURL(url)
      toast.success('Informe descargado')
    } catch {
      toast.error('Error al exportar el informe')
    }
  }

  return (
    <div className="flex flex-col flex-1 overflow-y-auto bg-cream-100">
      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="bg-cream-50 border-b border-cream-200 px-6 py-4 shrink-0">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Informes y Análisis</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Ventas · Stock · Producción · Clientes · Rotación · Sanidad
            </p>
          </div>

          <div className="flex items-center gap-3">
            {tab !== 'stock' && (
              <div className="flex items-center gap-2 text-sm">
                <label className="text-gray-500 font-medium">Desde</label>
                <DateInput value={desde} max={hasta} onChange={setDesde} />
                <label className="text-gray-500 font-medium">Hasta</label>
                <DateInput value={hasta} min={desde} max={fmt8601(hoy)} onChange={setHasta} />
              </div>
            )}
            <button
              onClick={handleExport}
              className="flex items-center gap-2 px-3 py-1.5 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-700 transition-colors"
            >
              <Download className="w-4 h-4" />
              Excel
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mt-4 mb-[-1px]">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-4 py-2 text-sm rounded-t-lg font-medium transition-colors ${
                tab === t.id
                  ? 'bg-brand-50 text-brand-700 border-b-2 border-brand-500'
                  : 'text-gray-500 hover:text-gray-700 border-b-2 border-transparent'
              }`}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Body ──────────────────────────────────────────────────────────── */}
      <div className="flex-1 p-6 space-y-6">
        {isLoading && (
          <div className="flex items-center justify-center h-64 gap-3 text-gray-400">
            <RefreshCw className="w-5 h-5 animate-spin" />
            <span className="text-sm">Cargando datos...</span>
          </div>
        )}

        {isError && (
          <div className="flex items-center justify-center h-64 gap-3 text-red-500">
            <AlertTriangle className="w-5 h-5" />
            <span className="text-sm">Error al cargar los datos</span>
          </div>
        )}

        {/* ── VENTAS ────────────────────────────────────────────────────── */}
        {tab === 'ventas' && !ventasQ.isLoading && ventasQ.data && (
          <>
            <div className="grid grid-cols-3 gap-4">
              <KpiCard
                label="Importe total"
                value={`${fmtEur(ventasQ.data.totalImporte)} €`}
                sub="IVA incluido"
                color="brand"
              />
              <KpiCard
                label="Base imponible"
                value={`${fmtEur(ventasQ.data.totalBase)} €`}
                sub="Sin IVA"
                color="green"
              />
              <KpiCard
                label="Facturas emitidas"
                value={String(ventasQ.data.totalFacturas)}
                sub={`${desde} → ${hasta}`}
                color="gray"
              />
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h2 className="text-sm font-semibold text-gray-700 mb-4">
                Evolución de ventas diarias
              </h2>
              {ventasQ.data.puntos.every(p => p.importe === 0) ? (
                <EmptyChart />
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <AreaChart
                    data={ventasQ.data.puntos}
                    margin={{ top: 4, right: 16, left: 8, bottom: 0 }}
                  >
                    <defs>
                      <linearGradient id="gradVentas" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={BRAND} stopOpacity={0.15} />
                        <stop offset="95%" stopColor={BRAND} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                    <XAxis
                      dataKey="fechaLabel"
                      tick={{ fontSize: 11, fill: '#6b7280' }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: '#6b7280' }}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={v => `${v}€`}
                    />
                    <Tooltip
                      formatter={(v: number | undefined) => [`${fmtEur(v ?? 0)} €`, 'Importe']}
                      labelFormatter={l => `Día: ${l}`}
                      contentStyle={{
                        borderRadius: 8,
                        border: '1px solid #e5e7eb',
                        fontSize: 12,
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="importe"
                      stroke={BRAND}
                      strokeWidth={2}
                      fill="url(#gradVentas)"
                      name="Importe"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h2 className="text-sm font-semibold text-gray-700 mb-4">
                Número de facturas por día
              </h2>
              {ventasQ.data.puntos.every(p => p.count === 0) ? (
                <EmptyChart />
              ) : (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart
                    data={ventasQ.data.puntos}
                    margin={{ top: 4, right: 16, left: 8, bottom: 0 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="#f3f4f6"
                      vertical={false}
                    />
                    <XAxis
                      dataKey="fechaLabel"
                      tick={{ fontSize: 11, fill: '#6b7280' }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      allowDecimals={false}
                      tick={{ fontSize: 11, fill: '#6b7280' }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <Tooltip
                      formatter={(v: number | undefined) => [(v ?? 0), 'Facturas']}
                      labelFormatter={l => `Día: ${l}`}
                      contentStyle={{
                        borderRadius: 8,
                        border: '1px solid #e5e7eb',
                        fontSize: 12,
                      }}
                    />
                    <Bar
                      dataKey="count"
                      fill={BRAND}
                      opacity={0.7}
                      radius={[3, 3, 0, 0]}
                      name="Facturas"
                    />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </>
        )}

        {/* ── STOCK ─────────────────────────────────────────────────────── */}
        {tab === 'stock' && !stockQ.isLoading && stockQ.data && (
          <>
            <div className="grid grid-cols-3 gap-4">
              <KpiCard
                label="Productos con stock"
                value={String(stockQ.data.totalProductos)}
                sub="Referencias activas"
                color="brand"
              />
              <KpiCard
                label="Con alerta de stock"
                value={String(stockQ.data.productosConAlerta)}
                sub="Por debajo del mínimo"
                color={stockQ.data.productosConAlerta > 0 ? 'red' : 'green'}
              />
              <KpiCard
                label="Unidades totales"
                value={fmtNum(stockQ.data.stockTotalUnidades)}
                sub="Todas las referencias"
                color="gray"
              />
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h2 className="text-sm font-semibold text-gray-700 mb-4">
                Stock disponible por producto
              </h2>
              {stockQ.data.items.length === 0 ? (
                <EmptyChart />
              ) : (
                <ResponsiveContainer
                  width="100%"
                  height={Math.max(220, stockQ.data.items.length * 36)}
                >
                  <BarChart
                    layout="vertical"
                    data={stockQ.data.items}
                    margin={{ top: 4, right: 48, left: 130, bottom: 0 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="#f3f4f6"
                      horizontal={false}
                    />
                    <XAxis
                      type="number"
                      tick={{ fontSize: 11, fill: '#6b7280' }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      type="category"
                      dataKey="productoNombre"
                      tick={{ fontSize: 11, fill: '#374151' }}
                      width={125}
                      tickLine={false}
                      axisLine={false}
                    />
                    <Tooltip
                      formatter={(v: number | undefined, name: string | undefined) => [
                        fmtNum(v ?? 0),
                        name === 'stockDisponible'
                          ? 'Disponible'
                          : name === 'stockReservado'
                          ? 'Reservado'
                          : (name ?? ''),
                      ]}
                      contentStyle={{
                        borderRadius: 8,
                        border: '1px solid #e5e7eb',
                        fontSize: 12,
                      }}
                    />
                    <Legend
                      iconType="square"
                      iconSize={10}
                      wrapperStyle={{ fontSize: 11 }}
                    />
                    <Bar
                      dataKey="stockDisponible"
                      name="Disponible"
                      radius={[0, 3, 3, 0]}
                      stackId="a"
                    >
                      {stockQ.data.items.map((e, i) => (
                        <Cell
                          key={i}
                          fill={e.conAlertas ? RED : GREEN}
                          opacity={0.85}
                        />
                      ))}
                    </Bar>
                    <Bar
                      dataKey="stockReservado"
                      name="Reservado"
                      fill={AMBER}
                      opacity={0.6}
                      radius={[0, 3, 3, 0]}
                      stackId="a"
                    />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* Tabla detalle */}
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-100">
                <h2 className="text-sm font-semibold text-gray-700">
                  Detalle por producto
                </h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      {[
                        'Producto',
                        'Total',
                        'Reservado',
                        'Disponible',
                        'Lotes',
                        'Estado',
                      ].map(h => (
                        <th
                          key={h}
                          className={`px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide ${
                            h === 'Producto' ? 'text-left' : h === 'Estado' || h === 'Lotes' ? 'text-center' : 'text-right'
                          }`}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {stockQ.data.items.map(p => (
                      <tr
                        key={p.productoId}
                        className={`hover:bg-gray-50 ${p.conAlertas ? 'bg-red-50/40' : ''}`}
                      >
                        <td className="px-4 py-2.5 font-medium text-gray-900">
                          {p.productoNombre}
                          <span className="ml-2 text-xs text-gray-400">{p.unidad}</span>
                        </td>
                        <td className="px-4 py-2.5 text-right text-gray-700">
                          {fmtNum(p.stockTotal)}
                        </td>
                        <td className="px-4 py-2.5 text-right text-amber-600">
                          {fmtNum(p.stockReservado)}
                        </td>
                        <td className="px-4 py-2.5 text-right font-semibold text-gray-900">
                          {fmtNum(p.stockDisponible)}
                        </td>
                        <td className="px-4 py-2.5 text-center text-gray-500">
                          {p.numLotes}
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          {p.conAlertas ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
                              <AlertTriangle className="w-3 h-3" /> Alerta
                            </span>
                          ) : (
                            <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                              OK
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                    {stockQ.data.items.length === 0 && (
                      <tr>
                        <td
                          colSpan={6}
                          className="px-4 py-8 text-center text-gray-400 text-sm"
                        >
                          Sin stock registrado
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {/* ── PRODUCCIÓN ────────────────────────────────────────────────── */}
        {tab === 'produccion' && !produccionQ.isLoading && produccionQ.data && (
          <>
            <div className="grid grid-cols-4 gap-4">
              <KpiCard
                label="Total producido"
                value={fmtNum(produccionQ.data.totalProducido)}
                sub="Bruto"
                color="brand"
              />
              <KpiCard
                label="Total neto"
                value={fmtNum(produccionQ.data.totalNeto)}
                sub="Sin merma"
                color="green"
              />
              <KpiCard
                label="Merma"
                value={fmtNum(produccionQ.data.totalMerma)}
                sub="Total período"
                color="amber"
              />
              <KpiCard
                label="Registros"
                value={String(produccionQ.data.numProducciones)}
                sub="Producciones"
                color="gray"
              />
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h2 className="text-sm font-semibold text-gray-700 mb-4">
                Producción diaria (neto vs merma)
              </h2>
              {produccionQ.data.porDia.every(d => d.cantidadNeta === 0 && d.cantidadMerma === 0) ? (
                <EmptyChart />
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart
                    data={produccionQ.data.porDia}
                    margin={{ top: 4, right: 16, left: 8, bottom: 0 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="#f3f4f6"
                      vertical={false}
                    />
                    <XAxis
                      dataKey="fechaLabel"
                      tick={{ fontSize: 11, fill: '#6b7280' }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: '#6b7280' }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <Tooltip
                      formatter={(v: number | undefined, name: string | undefined) => [
                        fmtNum(v ?? 0),
                        name === 'cantidadNeta'
                          ? 'Neto'
                          : name === 'cantidadMerma'
                          ? 'Merma'
                          : (name ?? ''),
                      ]}
                      contentStyle={{
                        borderRadius: 8,
                        border: '1px solid #e5e7eb',
                        fontSize: 12,
                      }}
                    />
                    <Legend
                      iconType="square"
                      iconSize={10}
                      wrapperStyle={{ fontSize: 11 }}
                    />
                    <Bar
                      dataKey="cantidadNeta"
                      name="Neto"
                      fill={GREEN}
                      opacity={0.85}
                      radius={[3, 3, 0, 0]}
                      stackId="a"
                    />
                    <Bar
                      dataKey="cantidadMerma"
                      name="Merma"
                      fill={AMBER}
                      opacity={0.75}
                      radius={[3, 3, 0, 0]}
                      stackId="a"
                    />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            {produccionQ.data.topProductos.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <h2 className="text-sm font-semibold text-gray-700 mb-4">
                  Top productos por volumen producido
                </h2>
                <ResponsiveContainer
                  width="100%"
                  height={Math.max(180, produccionQ.data.topProductos.length * 38)}
                >
                  <BarChart
                    layout="vertical"
                    data={produccionQ.data.topProductos}
                    margin={{ top: 4, right: 48, left: 140, bottom: 0 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="#f3f4f6"
                      horizontal={false}
                    />
                    <XAxis
                      type="number"
                      tick={{ fontSize: 11, fill: '#6b7280' }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      type="category"
                      dataKey="nombre"
                      tick={{ fontSize: 11, fill: '#374151' }}
                      width={135}
                      tickLine={false}
                      axisLine={false}
                    />
                    <Tooltip
                      formatter={(v: number | undefined) => [fmtNum(v ?? 0), 'Neto']}
                      contentStyle={{
                        borderRadius: 8,
                        border: '1px solid #e5e7eb',
                        fontSize: 12,
                      }}
                    />
                    <Bar
                      dataKey="totalNeto"
                      fill={BRAND}
                      opacity={0.8}
                      radius={[0, 3, 3, 0]}
                      name="Neto"
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </>
        )}

        {/* ── CLIENTES ──────────────────────────────────────────────────── */}
        {tab === 'clientes' && !clientesQ.isLoading && clientesQ.data && (
          <>
            <div className="grid grid-cols-3 gap-4">
              <KpiCard
                label="Clientes activos"
                value={String(clientesQ.data.totalClientes)}
                sub="Con facturación en período"
                color="brand"
              />
              <KpiCard
                label="Total facturado"
                value={`${fmtEur(clientesQ.data.totalFacturado)} €`}
                sub="IVA incluido"
                color="green"
              />
              <KpiCard
                label="Ticket medio"
                value={
                  clientesQ.data.totalClientes > 0
                    ? `${fmtEur(
                        clientesQ.data.totalFacturado / clientesQ.data.totalClientes
                      )} €`
                    : '—'
                }
                sub="Por cliente"
                color="gray"
              />
            </div>

            {clientesQ.data.distribucion.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <h2 className="text-sm font-semibold text-gray-700 mb-4">
                  Top 10 clientes por facturación
                </h2>
                <ResponsiveContainer
                  width="100%"
                  height={Math.max(220, clientesQ.data.distribucion.length * 40)}
                >
                  <BarChart
                    layout="vertical"
                    data={clientesQ.data.distribucion}
                    margin={{ top: 4, right: 64, left: 160, bottom: 0 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="#f3f4f6"
                      horizontal={false}
                    />
                    <XAxis
                      type="number"
                      tick={{ fontSize: 11, fill: '#6b7280' }}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={v => `${v}€`}
                    />
                    <YAxis
                      type="category"
                      dataKey="nombre"
                      tick={{ fontSize: 11, fill: '#374151' }}
                      width={155}
                      tickLine={false}
                      axisLine={false}
                    />
                    <Tooltip
                      formatter={(v: number | undefined) => [`${fmtEur(v ?? 0)} €`, 'Facturado']}
                      contentStyle={{
                        borderRadius: 8,
                        border: '1px solid #e5e7eb',
                        fontSize: 12,
                      }}
                    />
                    <Bar
                      dataKey="totalFacturado"
                      fill={BRAND}
                      opacity={0.8}
                      radius={[0, 3, 3, 0]}
                      name="Facturado"
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Ranking table */}
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-100">
                <h2 className="text-sm font-semibold text-gray-700">
                  Ranking completo de clientes
                </h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-2.5 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide w-12">
                        #
                      </th>
                      {['Cliente', 'Facturado', 'Facturas', 'Ticket medio', 'Última compra'].map(
                        h => (
                          <th
                            key={h}
                            className={`px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide ${
                              h === 'Cliente' ? 'text-left' : 'text-right'
                            }`}
                          >
                            {h}
                          </th>
                        )
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {clientesQ.data.ranking.map(c => (
                      <tr key={c.posicion} className="hover:bg-gray-50">
                        <td className="px-4 py-2.5 text-center">
                          <span
                            className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${
                              c.posicion === 1
                                ? 'bg-yellow-100 text-yellow-700'
                                : c.posicion === 2
                                ? 'bg-gray-200 text-gray-600'
                                : c.posicion === 3
                                ? 'bg-orange-100 text-orange-600'
                                : 'text-gray-400'
                            }`}
                          >
                            {c.posicion}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 font-medium text-gray-900">
                          {c.nombre}
                        </td>
                        <td className="px-4 py-2.5 text-right font-semibold text-gray-900">
                          {fmtEur(c.totalFacturado)} €
                        </td>
                        <td className="px-4 py-2.5 text-right text-gray-600">
                          {c.numFacturas}
                        </td>
                        <td className="px-4 py-2.5 text-right text-gray-600">
                          {fmtEur(c.ticketMedio)} €
                        </td>
                        <td className="px-4 py-2.5 text-right text-gray-500">
                          {c.ultimaCompra}
                        </td>
                      </tr>
                    ))}
                    {clientesQ.data.ranking.length === 0 && (
                      <tr>
                        <td
                          colSpan={6}
                          className="px-4 py-8 text-center text-gray-400 text-sm"
                        >
                          Sin datos en el período seleccionado
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {/* ── ROTACIÓN ─────────────────────────────────────────────── */}
        {tab === 'rotacion' && !rotacionQ.isLoading && rotacionQ.data && (
          <>
            <div className="grid grid-cols-3 gap-4">
              <KpiCard
                label="Productos analizados"
                value={String(rotacionQ.data.totalProductos)}
                sub={`Período ${rotacionQ.data.diasPeriodo} días`}
                color="brand"
              />
              <KpiCard
                label="Con movimiento"
                value={String(rotacionQ.data.productosConMovimiento)}
                sub={`de ${rotacionQ.data.totalProductos} productos`}
                color="green"
              />
              <KpiCard
                label="Rotación media"
                value={`${rotacionQ.data.rotacionMedia.toFixed(2)}×`}
                sub="veces stock vendido"
                color="amber"
              />
            </div>

            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100">
                <h2 className="text-sm font-semibold text-gray-700">
                  Análisis de rotación por producto
                </h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  FIFO · {desde} → {hasta} · {rotacionQ.data.diasPeriodo} días
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100">
                      <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Producto</th>
                      <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Unidad</th>
                      <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Stock actual</th>
                      <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Vendido período</th>
                      <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Rotación</th>
                      <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Días cobertura</th>
                      <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Clasificación</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {rotacionQ.data.items.map(item => (
                      <tr key={item.productoId} className="hover:bg-gray-50/60 transition-colors">
                        <td className="px-4 py-2.5 font-medium text-gray-900">{item.nombre}</td>
                        <td className="px-4 py-2.5 text-gray-500">{item.unidad}</td>
                        <td className="px-4 py-2.5 text-right text-gray-700">{fmtNum(item.stockActual)}</td>
                        <td className="px-4 py-2.5 text-right text-gray-700">{fmtNum(item.ventasPeriodo)}</td>
                        <td className="px-4 py-2.5 text-right font-semibold text-gray-900">
                          {item.rotacion > 0 ? `${item.rotacion.toFixed(2)}×` : '—'}
                        </td>
                        <td className="px-4 py-2.5 text-right text-gray-600">
                          {item.diasCobertura !== null ? `${item.diasCobertura}d` : '∞'}
                        </td>
                        <td className="px-4 py-2.5">
                          <ClasificacionBadge value={item.clasificacion} />
                        </td>
                      </tr>
                    ))}
                    {rotacionQ.data.items.length === 0 && (
                      <tr>
                        <td colSpan={7} className="px-4 py-8 text-center text-gray-400 text-sm">
                          Sin datos en el período seleccionado
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {/* ── SANIDAD ──────────────────────────────────────────────── */}
        {tab === 'sanidad' && !sanidadQ.isLoading && sanidadQ.data && (
          <>
            <div className="grid grid-cols-2 gap-4">
              <KpiCard
                label="Registros de trazabilidad"
                value={String(sanidadQ.data.total)}
                sub={`${sanidadQ.data.desde} → ${sanidadQ.data.hasta}`}
                color="brand"
              />
              <KpiCard
                label="Informe Sanidad CE 178/2002"
                value="Excel"
                sub="Pulsa Exportar para descargar"
                color="green"
              />
            </div>

            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100">
                <h2 className="text-sm font-semibold text-gray-700">
                  Trazabilidad de ventas por lote — Reglamento CE 178/2002
                </h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  Lote · Producto · Fabricación · Caducidad · Vendido a · Factura · Fecha venta · Cantidad
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100">
                      {['Lote', 'Producto', 'F. Fabricación', 'F. Caducidad', 'Cant. producida', 'Vendido a', 'Factura nº', 'F. Venta', 'Cant. vendida'].map(h => (
                        <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {sanidadQ.data.rows.map((r, i) => (
                      <tr key={i} className="hover:bg-gray-50/60 transition-colors">
                        <td className="px-4 py-2 font-mono text-xs font-semibold text-brand-700">{r.lote}</td>
                        <td className="px-4 py-2 font-medium text-gray-900">{r.producto}</td>
                        <td className="px-4 py-2 text-gray-600">{r.fechaFabricacion}</td>
                        <td className="px-4 py-2 text-gray-600">{r.fechaCaducidad}</td>
                        <td className="px-4 py-2 text-right text-gray-700">{fmtNum(r.cantidadProducida)}</td>
                        <td className="px-4 py-2 text-gray-700">{r.vendidoA}</td>
                        <td className="px-4 py-2 font-mono text-xs">{r.facturaNumero}</td>
                        <td className="px-4 py-2 text-gray-600">{r.fechaVenta}</td>
                        <td className="px-4 py-2 text-right font-semibold text-gray-900">{fmtNum(r.cantidadVendida)}</td>
                      </tr>
                    ))}
                    {sanidadQ.data.rows.length === 0 && (
                      <tr>
                        <td colSpan={9} className="px-4 py-8 text-center text-gray-400 text-sm">
                          Sin registros de trazabilidad en el período seleccionado
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

type KpiColor = 'brand' | 'green' | 'red' | 'amber' | 'gray'

const KPI_BG: Record<KpiColor, string> = {
  brand: 'bg-brand-50 border-brand-100',
  green: 'bg-green-50 border-green-100',
  red: 'bg-red-50 border-red-100',
  amber: 'bg-amber-50 border-amber-100',
  gray: 'bg-gray-50 border-gray-100',
}
const KPI_TEXT: Record<KpiColor, string> = {
  brand: 'text-brand-700',
  green: 'text-green-700',
  red: 'text-red-700',
  amber: 'text-amber-700',
  gray: 'text-gray-700',
}

function KpiCard({
  label,
  value,
  sub,
  color,
}: {
  label: string
  value: string
  sub: string
  color: KpiColor
}) {
  return (
    <div className={`rounded-xl border p-4 ${KPI_BG[color]}`}>
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${KPI_TEXT[color]}`}>{value}</p>
      <p className="text-xs text-gray-400 mt-0.5">{sub}</p>
    </div>
  )
}

function EmptyChart() {
  const emptyData = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - 6 + i)
    return { label: d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' }), value: 0 }
  })
  return (
    <div className="relative">
      <ResponsiveContainer width="100%" height={160}>
        <AreaChart data={emptyData} margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#d1d5db' }} tickLine={false} axisLine={false} />
          <YAxis tick={{ fontSize: 11, fill: '#d1d5db' }} tickLine={false} axisLine={false} />
          <Area type="monotone" dataKey="value" stroke="#d1d5db" strokeWidth={1.5} strokeDasharray="4 4" fill="transparent" />
        </AreaChart>
      </ResponsiveContainer>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-sm text-gray-400 bg-white/80 px-3 py-1 rounded-lg">Sin datos en el período seleccionado</span>
      </div>
    </div>
  )
}

const CLASIFICACION_STYLE: Record<string, string> = {
  'Alta': 'bg-green-50 text-green-700 border border-green-200',
  'Media': 'bg-blue-50 text-blue-700 border border-blue-200',
  'Baja': 'bg-amber-50 text-amber-700 border border-amber-200',
  'Sin movimiento': 'bg-gray-100 text-gray-500 border border-gray-200',
}

function ClasificacionBadge({ value }: { value: string }) {
  const cls = CLASIFICACION_STYLE[value] ?? 'bg-gray-100 text-gray-500'
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>
      {value}
    </span>
  )
}
