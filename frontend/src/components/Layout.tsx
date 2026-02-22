import React, { useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../store/authStore'
import {
  LayoutDashboard,
  Package,
  Users,
  Factory,
  FileText,
  LogOut,
  ChevronRight,
  Layers,
  Truck,
  ClipboardList,
  Activity,
  Zap,
  BarChart2,
  Leaf,
  Shield,
  Menu,
  X,
} from 'lucide-react'

interface NavItem {
  to: string
  icon: React.ReactNode
  label: string
  separator?: boolean   // adds a visual divider before this item
}

const NAV_OBRADOR: NavItem[] = [
  { to: '/dashboard', icon: <LayoutDashboard className="w-5 h-5" />, label: 'Panel' },
  { to: '/facturacion', icon: <FileText className="w-5 h-5" />, label: 'Facturación' },
  { to: '/albaranes', icon: <Truck className="w-5 h-5" />, label: 'Albaranes' },
  { to: '/pedidos', icon: <ClipboardList className="w-5 h-5" />, label: 'Pedidos' },
  { to: '/clientes', icon: <Users className="w-5 h-5" />, label: 'Clientes', separator: true },
  { to: '/productos', icon: <Package className="w-5 h-5" />, label: 'Productos' },
  { to: '/produccion', icon: <Factory className="w-5 h-5" />, label: 'Producción' },
  { to: '/lotes', icon: <Layers className="w-5 h-5" />, label: 'Lotes' },
  { to: '/ingredientes', icon: <Leaf className="w-5 h-5" />, label: 'Ingredientes' },
  { to: '/trazabilidad', icon: <Activity className="w-5 h-5" />, label: 'Trazabilidad', separator: true },
  { to: '/reportes', icon: <BarChart2 className="w-5 h-5" />, label: 'Informes', separator: true },
]

const NAV_REPARTIDOR: NavItem[] = [
  { to: '/dashboard', icon: <LayoutDashboard className="w-5 h-5" />, label: 'Panel' },
  { to: '/facturacion-rapida', icon: <Zap className="w-5 h-5" />, label: 'Facturación rápida' },
  { to: '/clientes', icon: <Users className="w-5 h-5" />, label: 'Mis clientes', separator: true },
  { to: '/trazabilidad', icon: <Activity className="w-5 h-5" />, label: 'Trazabilidad' },
]

export default function Layout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const isRepartidor = user?.rol === 'UsuarioRepartidor'
  const isAdmin = user?.rol === 'Admin'
  const adminItems: NavItem[] = isAdmin
    ? [{ to: '/usuarios', icon: <Shield className="w-5 h-5" />, label: 'Usuarios', separator: true }]
    : []
  const navItems = [...(isRepartidor ? NAV_REPARTIDOR : NAV_OBRADOR), ...adminItems]

  function handleLogout() {
    logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/40 backdrop-blur-sm md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed md:relative inset-y-0 left-0 z-40
          w-60 bg-white border-r border-gray-200 flex flex-col shrink-0
          transition-transform duration-200 ease-in-out
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
          md:translate-x-0
        `}
      >
        {/* Logo */}
        <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-3">
          <div className="w-9 h-9 bg-brand-500 rounded-xl flex items-center justify-center text-lg">🥐</div>
          <div className="flex-1">
            <p className="text-sm font-bold text-gray-900 leading-tight">BuenaTierra</p>
            <p className="text-xs text-gray-500 leading-tight">{isRepartidor ? 'Repartidor' : 'Obrador'}</p>
          </div>
          {/* Close button (mobile only) */}
          <button
            className="md:hidden p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100"
            onClick={() => setSidebarOpen(false)}
            aria-label="Cerrar menú"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {navItems.map((item) => (
            <React.Fragment key={item.to}>
              {item.separator && <div className="border-t border-gray-100 my-2" />}
              <NavLink
                to={item.to}
                onClick={() => setSidebarOpen(false)}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-brand-50 text-brand-700'
                      : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                  }`
                }
              >
                {item.icon}
                <span className="flex-1">{item.label}</span>
                <ChevronRight className="w-3.5 h-3.5 opacity-40" />
              </NavLink>
            </React.Fragment>
          ))}
        </nav>

        {/* User footer */}
        <div className="border-t border-gray-100 px-4 py-3">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-8 h-8 bg-brand-100 text-brand-700 rounded-full flex items-center justify-center text-xs font-bold">
              {user?.nombre?.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-gray-900 truncate">{user?.nombre} {user?.apellidos}</p>
              <p className="text-xs text-gray-500 truncate">{user?.rol}</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2 text-xs text-gray-500 hover:text-red-600 py-1 transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
            Cerrar sesión
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto flex flex-col min-w-0">
        {/* Mobile top bar */}
        <div className="md:hidden flex items-center gap-3 px-4 py-3 bg-white border-b border-gray-200 shrink-0">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 rounded-lg text-gray-600 hover:bg-gray-100"
            aria-label="Abrir menú"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-brand-500 rounded-lg flex items-center justify-center text-sm">🥐</div>
            <span className="text-sm font-bold text-gray-900">BuenaTierra</span>
          </div>
        </div>
        <Outlet />
      </main>
    </div>
  )
}
