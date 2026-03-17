import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../store/authStore'
import { useNavigate } from 'react-router-dom'
import api from '../lib/api'
import {
  Package,
  AlertTriangle,
  TrendingUp,
  ClipboardList,
  FileText,
  Zap,
  Users,
  Clock,
  RefreshCw,
  LayoutDashboard,
  ShoppingCart,
  Settings2,
} from 'lucide-react'

interface DashboardStats {
  facturasHoyCount: number
  facturasHoyImporte: number
  facturasMesCount: number
  facturasMesImporte: number
  pedidosPendientes: number
  stockAlertas: number
  lotesProximoCaducar: number
  produccionHoy: number
  totalClientes: number
  facturasPendientesCobroCount: number
  facturasPendientesCobroImporte: number
  ultimasFacturas: Array<{
    id: number; numeroFactura: string; fecha: string; clienteNombre: string; total: number; estado: string
  }>
  ultimosPedidos: Array<{
    id: number; numeroPedido: string; fecha: string; clienteNombre: string; total: number; estado: string
  }>
}

const ESTADO_FACTURA_COLOR: Record<string, string> = {
  Emitida: 'bg-blue-50 text-blue-700',
  Pagada: 'bg-green-50 text-green-700',
  Pendiente: 'bg-amber-50 text-amber-700',
  Anulada: 'bg-red-50 text-red-700',
}

const ESTADO_PEDIDO_COLOR: Record<string, string> = {
  Pendiente: 'bg-amber-50 text-amber-700',
  Confirmado: 'bg-blue-50 text-blue-700',
  EnPreparacion: 'bg-purple-50 text-purple-700',
  Servido: 'bg-green-50 text-green-700',
  Cancelado: 'bg-red-50 text-red-700',
}

type DashTab = 'resumen' | 'ventas' | 'operaciones'

const DASH_TABS: { id: DashTab; label: string; icon: React.ReactNode }[] = [
  { id: 'resumen', label: 'Resumen', icon: <LayoutDashboard className="w-4 h-4" /> },
  { id: 'ventas', label: 'Ventas', icon: <ShoppingCart className="w-4 h-4" /> },
  { id: 'operaciones', label: 'Operaciones', icon: <Settings2 className="w-4 h-4" /> },
]

export default function Dashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [dashTab, setDashTab] = useState<DashTab>('resumen')

  const { data: stats, isLoading, refetch, dataUpdatedAt } = useQuery({
    queryKey: ['dashboard-stats', user?.empresaId],
    queryFn: async () => {
      const res = await api.get<{ data: DashboardStats }>('/dashboard/stats')
      return res.data.data
    },
    refetchInterval: 60_000,
  })

  const isRepartidor = user?.rol === 'Repartidor'

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Panel de Control</h1>
          <p className="text-gray-500 text-sm mt-1">
            {user?.nombre} ·{' '}
            {new Date().toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {dataUpdatedAt > 0 && (
            <span className="text-xs text-gray-400">
              Act. {new Date(dataUpdatedAt).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          <button onClick={() => refetch()} className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-xs text-gray-600 hover:bg-gray-50">
            <RefreshCw className="w-3.5 h-3.5" /> Actualizar
          </button>
        </div>
      </div>

      {/* Tab switcher */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
        {DASH_TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setDashTab(t.id)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              dashTab === t.id
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {/* Acciones rápidas */}
      <div className="flex flex-wrap gap-3">
        {isRepartidor ? (
          <button onClick={() => navigate('/facturacion-rapida')}
            className="flex items-center gap-2 px-4 py-2.5 bg-brand-600 text-white rounded-xl text-sm font-semibold hover:bg-brand-700 shadow-sm">
            <Zap className="w-4 h-4" /> Facturación rápida
          </button>
        ) : (
          <>
            <button onClick={() => navigate('/facturacion')}
              className="flex items-center gap-2 px-4 py-2.5 bg-brand-600 text-white rounded-xl text-sm font-semibold hover:bg-brand-700 shadow-sm">
              <FileText className="w-4 h-4" /> Nueva factura
            </button>
            <button onClick={() => navigate('/pedidos')}
              className="flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 text-gray-700 rounded-xl text-sm font-semibold hover:bg-gray-50 shadow-sm">
              <ClipboardList className="w-4 h-4" /> Nuevo pedido
            </button>
            <button onClick={() => navigate('/produccion')}
              className="flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 text-gray-700 rounded-xl text-sm font-semibold hover:bg-gray-50 shadow-sm">
              <Package className="w-4 h-4" /> Registrar producción
            </button>
          </>
        )}
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-100 p-5 animate-pulse h-24" />
          ))}
        </div>
      ) : (
        <>
          {/* ── TAB: RESUMEN ──────────────────────────────────────────────── */}
          {dashTab === 'resumen' && (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <StatCard title="Facturas hoy" value={stats?.facturasHoyCount ?? 0}
                  sub={`${(stats?.facturasHoyImporte ?? 0).toFixed(2)} €`}
                  icon={<FileText className="w-5 h-5 text-blue-600" />} color="bg-blue-50" onClick={() => navigate('/facturacion')} />
                <StatCard title="Importe del mes" value={`${(stats?.facturasMesImporte ?? 0).toFixed(0)} €`}
                  sub={`${stats?.facturasMesCount ?? 0} facturas`}
                  icon={<TrendingUp className="w-5 h-5 text-brand-600" />} color="bg-brand-50" />
                <StatCard title="Pedidos pendientes" value={stats?.pedidosPendientes ?? 0}
                  sub="Por preparar" icon={<ClipboardList className="w-5 h-5 text-amber-600" />}
                  color="bg-amber-50" alert={(stats?.pedidosPendientes ?? 0) > 0} onClick={() => navigate('/pedidos')} />
                <StatCard title="Clientes activos" value={stats?.totalClientes ?? 0}
                  sub="Registrados" icon={<Users className="w-5 h-5 text-green-600" />}
                  color="bg-green-50" onClick={() => navigate('/clientes')} />
                <StatCard title="Alertas stock" value={stats?.stockAlertas ?? 0}
                  sub="Por debajo mínimo" icon={<AlertTriangle className="w-5 h-5 text-red-600" />}
                  color="bg-red-50" alert={(stats?.stockAlertas ?? 0) > 0} onClick={() => navigate('/lotes')} />
                <StatCard title="Lotes a caducar" value={stats?.lotesProximoCaducar ?? 0}
                  sub="Próximos 5 días" icon={<Clock className="w-5 h-5 text-orange-600" />}
                  color="bg-orange-50" alert={(stats?.lotesProximoCaducar ?? 0) > 0} onClick={() => navigate('/lotes')} />
                <StatCard title="Producción hoy" value={stats?.produccionHoy ?? 0}
                  sub="Lotes abiertos" icon={<Package className="w-5 h-5 text-purple-600" />}
                  color="bg-purple-50" onClick={() => navigate('/produccion')} />
                <StatCard title="Facturas del mes" value={stats?.facturasMesCount ?? 0}
                  sub={`Hoy: ${stats?.facturasHoyCount ?? 0}`}
                  icon={<FileText className="w-5 h-5 text-gray-600" />} color="bg-gray-50" onClick={() => navigate('/facturacion')} />
                <StatCard title="Pend. de cobro" value={stats?.facturasPendientesCobroCount ?? 0}
                  sub={`${(stats?.facturasPendientesCobroImporte ?? 0).toFixed(2)} \u20ac`}
                  icon={<TrendingUp className="w-5 h-5 text-red-600" />}
                  color="bg-red-50" alert={(stats?.facturasPendientesCobroCount ?? 0) > 0} onClick={() => navigate('/facturacion')} />
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <RecentPanel
                  title="Últimas facturas"
                  onMore={() => navigate('/facturacion')}
                  items={(stats?.ultimasFacturas ?? []).map(f => ({
                    id: f.id, left: f.numeroFactura, sub: f.clienteNombre,
                    tag: f.estado, tagColor: ESTADO_FACTURA_COLOR[f.estado] ?? 'bg-gray-100 text-gray-600',
                    amount: f.total,
                  }))}
                  empty="Sin facturas recientes"
                />
                <RecentPanel
                  title="Pedidos activos"
                  onMore={() => navigate('/pedidos')}
                  items={(stats?.ultimosPedidos ?? []).map(p => ({
                    id: p.id, left: p.numeroPedido, sub: p.clienteNombre,
                    tag: p.estado, tagColor: ESTADO_PEDIDO_COLOR[p.estado] ?? 'bg-gray-100 text-gray-600',
                    amount: p.total,
                  }))}
                  empty="Sin pedidos activos"
                />
              </div>
            </>
          )}

          {/* ── TAB: VENTAS ───────────────────────────────────────────────── */}
          {dashTab === 'ventas' && (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <StatCard title="Importe hoy" value={`${(stats?.facturasHoyImporte ?? 0).toFixed(2)} €`}
                  sub={`${stats?.facturasHoyCount ?? 0} facturas`}
                  icon={<TrendingUp className="w-5 h-5 text-brand-600" />} color="bg-brand-50" onClick={() => navigate('/facturacion')} />
                <StatCard title="Importe del mes" value={`${(stats?.facturasMesImporte ?? 0).toFixed(0)} €`}
                  sub={`${stats?.facturasMesCount ?? 0} facturas emitidas`}
                  icon={<TrendingUp className="w-5 h-5 text-green-600" />} color="bg-green-50" />
                <StatCard title="Ticket medio mes"
                  value={stats && (stats.facturasMesCount ?? 0) > 0
                    ? `${(stats.facturasMesImporte / stats.facturasMesCount).toFixed(2)} €`
                    : '— €'}
                  sub="Promedio por factura"
                  icon={<FileText className="w-5 h-5 text-blue-600" />} color="bg-blue-50" />
                <StatCard title="Clientes activos" value={stats?.totalClientes ?? 0}
                  sub="Base de clientes" icon={<Users className="w-5 h-5 text-purple-600" />}
                  color="bg-purple-50" onClick={() => navigate('/clientes')} />
              </div>
              <RecentPanel
                title="Últimas facturas"
                onMore={() => navigate('/facturacion')}
                items={(stats?.ultimasFacturas ?? []).map(f => ({
                  id: f.id, left: f.numeroFactura, sub: f.clienteNombre,
                  tag: f.estado, tagColor: ESTADO_FACTURA_COLOR[f.estado] ?? 'bg-gray-100 text-gray-600',
                  amount: f.total,
                }))}
                empty="Sin facturas recientes"
              />
            </>
          )}

          {/* ── TAB: OPERACIONES ──────────────────────────────────────────── */}
          {dashTab === 'operaciones' && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div
                  onClick={() => navigate('/pedidos')}
                  className={`rounded-xl p-6 border cursor-pointer hover:shadow-md transition-all ${
                    (stats?.pedidosPendientes ?? 0) > 0
                      ? 'bg-amber-50 border-amber-200'
                      : 'bg-gray-50 border-gray-100'
                  }`}
                >
                  <div className="flex items-center gap-3 mb-2">
                    <ClipboardList className="w-6 h-6 text-amber-600" />
                    <span className="text-sm font-semibold text-gray-700">Pedidos pendientes</span>
                  </div>
                  <p className={`text-4xl font-bold ${(stats?.pedidosPendientes ?? 0) > 0 ? 'text-amber-700' : 'text-gray-400'}`}>
                    {stats?.pedidosPendientes ?? 0}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">Por preparar o confirmar</p>
                </div>

                <div
                  onClick={() => navigate('/lotes')}
                  className={`rounded-xl p-6 border cursor-pointer hover:shadow-md transition-all ${
                    (stats?.stockAlertas ?? 0) > 0
                      ? 'bg-red-50 border-red-200'
                      : 'bg-gray-50 border-gray-100'
                  }`}
                >
                  <div className="flex items-center gap-3 mb-2">
                    <AlertTriangle className="w-6 h-6 text-red-600" />
                    <span className="text-sm font-semibold text-gray-700">Alertas de stock</span>
                  </div>
                  <p className={`text-4xl font-bold ${(stats?.stockAlertas ?? 0) > 0 ? 'text-red-700' : 'text-gray-400'}`}>
                    {stats?.stockAlertas ?? 0}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">Productos bajo mínimo</p>
                </div>

                <div
                  onClick={() => navigate('/lotes')}
                  className={`rounded-xl p-6 border cursor-pointer hover:shadow-md transition-all ${
                    (stats?.lotesProximoCaducar ?? 0) > 0
                      ? 'bg-orange-50 border-orange-200'
                      : 'bg-gray-50 border-gray-100'
                  }`}
                >
                  <div className="flex items-center gap-3 mb-2">
                    <Clock className="w-6 h-6 text-orange-600" />
                    <span className="text-sm font-semibold text-gray-700">Lotes a caducar</span>
                  </div>
                  <p className={`text-4xl font-bold ${(stats?.lotesProximoCaducar ?? 0) > 0 ? 'text-orange-700' : 'text-gray-400'}`}>
                    {stats?.lotesProximoCaducar ?? 0}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">Próximos 5 días</p>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <RecentPanel
                  title="Pedidos activos"
                  onMore={() => navigate('/pedidos')}
                  items={(stats?.ultimosPedidos ?? []).map(p => ({
                    id: p.id, left: p.numeroPedido, sub: p.clienteNombre,
                    tag: p.estado, tagColor: ESTADO_PEDIDO_COLOR[p.estado] ?? 'bg-gray-100 text-gray-600',
                    amount: p.total,
                  }))}
                  empty="Sin pedidos activos"
                />
                <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
                  <h2 className="font-semibold text-gray-900 text-sm mb-4">Estado de producción</h2>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between py-2 border-b border-gray-50">
                      <span className="text-sm text-gray-600">Lotes producidos hoy</span>
                      <span className="text-sm font-bold text-gray-900">{stats?.produccionHoy ?? 0}</span>
                    </div>
                    <div className="flex items-center justify-between py-2 border-b border-gray-50">
                      <span className="text-sm text-gray-600">Stock con alertas</span>
                      <span className={`text-sm font-bold ${(stats?.stockAlertas ?? 0) > 0 ? 'text-red-600' : 'text-green-600'}`}>
                        {(stats?.stockAlertas ?? 0) > 0 ? `${stats?.stockAlertas} producto(s)` : 'Sin alertas ✓'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between py-2">
                      <span className="text-sm text-gray-600">Lotes por caducar (5d)</span>
                      <span className={`text-sm font-bold ${(stats?.lotesProximoCaducar ?? 0) > 0 ? 'text-orange-600' : 'text-green-600'}`}>
                        {(stats?.lotesProximoCaducar ?? 0) > 0 ? `${stats?.lotesProximoCaducar} lote(s)` : 'Sin urgentes ✓'}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => navigate('/produccion')}
                    className="mt-4 w-full py-2 text-xs font-semibold text-brand-600 border border-brand-200 rounded-lg hover:bg-brand-50 transition-colors"
                  >
                    Ir a producción →
                  </button>
                </div>
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}

function StatCard({ title, value, sub, icon, color, alert = false, onClick }: {
  title: string; value: string | number; sub?: string; icon: React.ReactNode
  color: string; alert?: boolean; onClick?: () => void
}) {
  return (
    <div onClick={onClick}
      className={`bg-white rounded-xl p-5 border shadow-sm transition-all ${
        alert ? 'border-red-200 ring-1 ring-red-100' : 'border-gray-100'
      } ${onClick ? 'cursor-pointer hover:shadow-md hover:-translate-y-0.5' : ''}`}>
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <p className="text-xs text-gray-500 font-medium truncate">{title}</p>
          <p className={`text-2xl font-bold mt-1 ${alert ? 'text-red-600' : 'text-gray-900'}`}>{value}</p>
          {sub && <p className="text-xs text-gray-400 mt-0.5 truncate">{sub}</p>}
        </div>
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${color}`}>{icon}</div>
      </div>
    </div>
  )
}

function RecentPanel({ title, items, onMore, empty }: {
  title: string
  onMore: () => void
  empty: string
  items: Array<{ id: number; left: string; sub: string; tag: string; tagColor: string; amount: number }>
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
        <h2 className="font-semibold text-gray-900 text-sm">{title}</h2>
        <button onClick={onMore} className="text-xs text-brand-600 hover:text-brand-700">Ver todos →</button>
      </div>
      <div className="divide-y divide-gray-50">
        {items.length === 0
          ? <p className="text-sm text-gray-400 text-center py-6">{empty}</p>
          : items.map(item => (
            <div key={item.id} className="px-5 py-3 flex items-center justify-between hover:bg-gray-50/50">
              <div>
                <span className="font-mono text-xs font-bold text-gray-700">{item.left}</span>
                <span className="ml-2 text-xs text-gray-500">{item.sub}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${item.tagColor}`}>{item.tag}</span>
                <span className="text-sm font-bold text-gray-900">{item.amount.toFixed(2)} €</span>
              </div>
            </div>
          ))
        }
      </div>
    </div>
  )
}

