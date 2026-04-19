import React, { useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../store/authStore'
import { useQuery } from '@tanstack/react-query'
import { getApiOrigin } from '../lib/api'
import {
  LayoutDashboard, Package, Users, Factory,
  FileText, LogOut, Layers, Truck, ClipboardList,
  Activity, Zap, BarChart2, Leaf, Shield, Menu, X,
  Wifi, WifiOff, UserCog, BookOpen, Tag, Bot, Mail,
} from 'lucide-react'

// ── Badge de estado del servidor ──────────────────────────────────────────────
function ServerStatusBadge() {
  const { data, isError, isFetching } = useQuery({
    queryKey: ['health'],
    queryFn:  async () => {
      const BASE = getApiOrigin()
      const res  = await fetch(`${BASE}/health`, { signal: AbortSignal.timeout(4_000) })
      if (!res.ok) throw new Error('offline')
      return res.json() as Promise<{ status: string }>
    },
    refetchInterval:        30_000,   // poll cada 30 s
    refetchIntervalInBackground: true,
    retry:                  1,
    staleTime:              20_000,
  })

  const online  = !isError && data?.status === 'healthy'
  const loading = isFetching && !data

  return (
    <div
      className="flex items-center gap-1.5 px-2 py-1 mt-1"
      data-testid="health-badge"
      aria-label="Estado servidor"
    >
      {loading ? (
        <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse shrink-0" />
      ) : online ? (
        <Wifi className="w-3 h-3 text-emerald-500 shrink-0" />
      ) : (
        <WifiOff className="w-3 h-3 text-red-500 shrink-0" />
      )}
      <span className={`text-[10px] font-medium ${
        loading ? 'text-amber-500' : online ? 'text-emerald-600' : 'text-red-500'
      }`}>
        {loading ? 'Conectando…' : online ? 'Servidor online' : 'Sin conexión'}
      </span>
    </div>
  )
}

interface NavItem {
  to: string
  icon: React.ReactNode
  label: string
  separator?: boolean
}

const NAV_OBRADOR: NavItem[] = [
  { to: '/dashboard',   icon: <LayoutDashboard className="w-[18px] h-[18px]" />, label: 'Panel' },
  { to: '/facturacion', icon: <FileText className="w-[18px] h-[18px]" />,        label: 'Facturación' },
  { to: '/albaranes',   icon: <Truck className="w-[18px] h-[18px]" />,           label: 'Albaranes' },
  { to: '/pedidos',     icon: <ClipboardList className="w-[18px] h-[18px]" />,   label: 'Pedidos' },
  { to: '/clientes',    icon: <Users className="w-[18px] h-[18px]" />,           label: 'Clientes',    separator: true },
  { to: '/productos',   icon: <Package className="w-[18px] h-[18px]" />,         label: 'Productos' },
  { to: '/produccion',  icon: <Factory className="w-[18px] h-[18px]" />,         label: 'Producción' },
  { to: '/lotes',       icon: <Layers className="w-[18px] h-[18px]" />,          label: 'Lotes' },
  { to: '/ingredientes',icon: <Leaf className="w-[18px] h-[18px]" />,            label: 'Ingredientes' },
  { to: '/trazabilidad',icon: <Activity className="w-[18px] h-[18px]" />,        label: 'Trazabilidad', separator: true },
  { to: '/reportes',    icon: <BarChart2 className="w-[18px] h-[18px]" />,       label: 'Informes',    separator: true },
  { to: '/correos',     icon: <Mail className="w-[18px] h-[18px]" />,            label: 'Correo' },
  { to: '/buenatierr-ai', icon: <Bot className="w-[18px] h-[18px]" />,            label: 'BuenaTierrAI' },
  { to: '/etiquetas',   icon: <Tag className="w-[18px] h-[18px]" />,             label: 'Etiquetas' },
  { to: '/ajustes',     icon: <UserCog className="w-[18px] h-[18px]" />,         label: 'Ajustes',     separator: true },
]

const NAV_REPARTIDOR: NavItem[] = [
  { to: '/dashboard',          icon: <LayoutDashboard className="w-[18px] h-[18px]" />, label: 'Panel' },
  { to: '/facturacion-rapida', icon: <Zap className="w-[18px] h-[18px]" />,             label: 'Facturación rápida' },
  { to: '/clientes',           icon: <Users className="w-[18px] h-[18px]" />,           label: 'Mis clientes', separator: true },
  { to: '/trazabilidad',       icon: <Activity className="w-[18px] h-[18px]" />,        label: 'Trazabilidad' },
  { to: '/buenatierr-ai',      icon: <Bot className="w-[18px] h-[18px]" />,             label: 'BuenaTierrAI' },
  { to: '/ajustes',            icon: <UserCog className="w-[18px] h-[18px]" />,         label: 'Ajustes',       separator: true },
]

export default function Layout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const isRepartidor = user?.rol === 'Repartidor'
  const isAdmin      = user?.rol === 'Admin'
  const adminItems: NavItem[] = isAdmin
    ? [
        { to: '/usuarios', icon: <Shield   className="w-[18px] h-[18px]" />, label: 'Usuarios', separator: true },
        { to: '/series',   icon: <BookOpen className="w-[18px] h-[18px]" />, label: 'Series'   },
      ]
    : []
  const navItems = [...(isRepartidor ? NAV_REPARTIDOR : NAV_OBRADOR), ...adminItems]

  function handleLogout() {
    logout()
    navigate('/login', { replace: true })
  }

  // Inicial del usuario para avatar
  const initials = [user?.nombre, user?.apellidos]
    .filter(Boolean).map(s => s![0].toUpperCase()).join('')

  return (
    <div className="flex h-screen overflow-hidden bg-cream-100">

      {/* Overlay para móvil */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-earth-900/50 backdrop-blur-sm lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ═══════════════════════════════════════
           SIDEBAR
          ═══════════════════════════════════════ */}
      <aside
        className={`
          fixed lg:relative inset-y-0 left-0 z-40
          w-64 flex flex-col shrink-0
          sidebar-bg border-r border-cream-300/70
          shadow-warm
          transition-transform duration-300 ease-in-out
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
          lg:translate-x-0
        `}
      >
        {/* ── Cabecera con gradiente de marca ── */}
        <div className="bg-brand-gradient px-5 py-5 flex items-center gap-3 shrink-0">
          <div className="w-10 h-10 bg-white/15 backdrop-blur-sm border border-white/25 rounded-2xl flex items-center justify-center shadow-warm text-xl shrink-0">
            🌾
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-display text-base font-bold text-white leading-tight tracking-wide truncate">
              BuenaTierra
            </p>
            <p className="text-xs text-white/75 leading-tight truncate font-sans">
              {user?.nombre}{user?.apellidos ? ` ${user.apellidos}` : ''}
            </p>
          </div>
          {/* Botón cerrar — solo mobile */}
          <button
            className="lg:hidden p-1.5 rounded-lg text-white/70 hover:text-white hover:bg-white/15 transition-colors"
            onClick={() => setSidebarOpen(false)}
            aria-label="Cerrar menú"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* ── Navegación ── */}
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {navItems.map((item) => (
            <React.Fragment key={item.to}>
              {item.separator && (
                <div className="border-t border-cream-300/70 my-2.5 mx-1" />
              )}
              <NavLink
                to={item.to}
                onClick={() => setSidebarOpen(false)}
                className={({ isActive }) =>
                  `group flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 ${
                    isActive
                      ? 'bg-brand-50 text-brand-700 shadow-warm-sm border border-brand-200/60'
                      : 'text-earth-600 hover:bg-cream-200 hover:text-earth-900'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    {/* Indicador de activo */}
                    <span className={`shrink-0 transition-colors ${
                      isActive ? 'text-brand-600' : 'text-earth-400 group-hover:text-earth-600'
                    }`}>
                      {item.icon}
                    </span>
                    <span className="flex-1 truncate">{item.label}</span>
                    {isActive && (
                      <span className="w-1.5 h-1.5 rounded-full bg-brand-500 shrink-0" />
                    )}
                  </>
                )}
              </NavLink>
            </React.Fragment>
          ))}
        </nav>

        {/* ── Footer de usuario ── */}
        <div className="border-t border-cream-300/70 bg-cream-50/80 px-4 py-3.5 shrink-0">
          <div className="flex items-center gap-3 mb-2.5">
            {/* Avatar inicial */}
            <div className="w-8 h-8 bg-brand-gradient rounded-xl flex items-center justify-center text-xs font-bold text-white shadow-warm-sm shrink-0">
              {initials || '?'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-earth-800 truncate">
                {user?.nombre} {user?.apellidos}
              </p>
              <p className="text-xs text-earth-400 truncate">
                {isRepartidor ? 'Repartidor' : isAdmin ? 'Administrador' : 'Obrador'}
              </p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs text-earth-400 hover:text-red-600 hover:bg-red-50 transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
            Cerrar sesión
          </button>
          <ServerStatusBadge />
        </div>
      </aside>

      {/* ═══════════════════════════════════════
           CONTENIDO PRINCIPAL
          ═══════════════════════════════════════ */}
      <main className="flex-1 overflow-y-auto flex flex-col min-w-0">

        {/* Topbar mobile */}
        <div className="lg:hidden flex items-center gap-3 px-4 py-3 bg-white/80 backdrop-blur border-b border-cream-300/70 shrink-0 sticky top-0 z-20">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 rounded-xl text-earth-600 hover:bg-cream-200 transition-colors"
            aria-label="Abrir menú"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 bg-brand-gradient rounded-lg flex items-center justify-center text-sm shadow-warm-sm">
              🌾
            </div>
            <span className="font-display text-sm font-bold text-earth-900">BuenaTierra</span>
          </div>
        </div>

        {/* Outlet de páginas */}
        <div className="flex-1">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
