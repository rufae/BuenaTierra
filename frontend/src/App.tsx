import { useState } from 'react'
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'react-hot-toast'
import { AuthProvider, useAuth } from './store/authStore'
import { applyStoredTheme } from './lib/theme'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Productos from './pages/Productos'
import Clientes from './pages/Clientes'
import Produccion from './pages/Produccion'
import Compra from './pages/Compra'
import Facturacion from './pages/Facturacion'
import Lotes from './pages/Lotes'
import Albaranes from './pages/Albaranes'
import Pedidos from './pages/Pedidos'
import Preventa from './pages/Preventa'
import Trazabilidad from './pages/Trazabilidad'
import FacturacionRapida from './pages/FacturacionRapida'
import Reportes from './pages/Reportes'
import Ingredientes from './pages/Ingredientes'
import Usuarios from './pages/Usuarios'
import Ajustes from './pages/Ajustes'
import SeriesFacturacion from './pages/SeriesFacturacion'
import Etiquetas from './pages/Etiquetas'
import BuenaTierrAI from './pages/BuenaTierrAI'
import Correos from './pages/Correos'
import Balance from './pages/Balance'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'
import ShortcutsModal from './components/ShortcutsModal'
import { ErrorBoundary } from './components/ErrorBoundary'

// Aplicar tema guardado antes del primer render para evitar flash de colores
applyStoredTheme()

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
})

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth()
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" replace />
}

/** Route guard: redirects to /dashboard if user's role is not in the allowed list */
function RoleGuard({ allowed, children }: { allowed: string[]; children: React.ReactNode }) {
  const { user } = useAuth()
  const fallback = user?.rol === 'Admin' ? '/usuarios' : '/dashboard'
  if (!user || !allowed.includes(user.rol)) return <Navigate to={fallback} replace />
  return <>{children}</>
}

function AppRoutes() {
  const { isAuthenticated, user } = useAuth()
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const homePath = user?.rol === 'Admin' ? '/usuarios' : '/dashboard'
  const esEmpresaObrador = user?.empresaEsObrador ?? true
  const allowedOperativo = esEmpresaObrador ? ['Obrador'] : ['Obrador', 'Repartidor']

  useKeyboardShortcuts({
    onShowHelp: () => setShortcutsOpen(true),
    enabled: isAuthenticated,
    operationPath: esEmpresaObrador ? '/produccion' : '/compra',
  })

  return (
    <>
      <ShortcutsModal open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
      <Routes>
      <Route path="/login" element={isAuthenticated ? <Navigate to={homePath} replace /> : <Login />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to={homePath} replace />} />
        <Route path="dashboard" element={<RoleGuard allowed={['Obrador', 'Repartidor']}><ErrorBoundary><Dashboard /></ErrorBoundary></RoleGuard>} />
        <Route path="productos" element={<RoleGuard allowed={allowedOperativo}><ErrorBoundary><Productos /></ErrorBoundary></RoleGuard>} />
        <Route path="clientes" element={<RoleGuard allowed={['Obrador', 'Repartidor']}><ErrorBoundary><Clientes /></ErrorBoundary></RoleGuard>} />
        <Route
          path="produccion"
          element={
            <RoleGuard allowed={allowedOperativo}>
              {esEmpresaObrador
                ? <ErrorBoundary><Produccion /></ErrorBoundary>
                : <Navigate to="/compra" replace />}
            </RoleGuard>
          }
        />
        <Route
          path="compra"
          element={
            <RoleGuard allowed={allowedOperativo}>
              {esEmpresaObrador
                ? <Navigate to="/produccion" replace />
                : <ErrorBoundary><Compra /></ErrorBoundary>}
            </RoleGuard>
          }
        />
        <Route path="facturacion" element={<RoleGuard allowed={allowedOperativo}><ErrorBoundary><Facturacion /></ErrorBoundary></RoleGuard>} />
        <Route path="lotes" element={<RoleGuard allowed={allowedOperativo}><ErrorBoundary><Lotes /></ErrorBoundary></RoleGuard>} />
        <Route path="albaranes" element={<RoleGuard allowed={allowedOperativo}><ErrorBoundary><Albaranes /></ErrorBoundary></RoleGuard>} />
        <Route path="pedidos" element={<RoleGuard allowed={allowedOperativo}><ErrorBoundary><Pedidos /></ErrorBoundary></RoleGuard>} />
        <Route path="preventa" element={<RoleGuard allowed={allowedOperativo}><ErrorBoundary><Preventa /></ErrorBoundary></RoleGuard>} />
        <Route path="trazabilidad" element={<RoleGuard allowed={['Obrador', 'Repartidor']}><ErrorBoundary><Trazabilidad /></ErrorBoundary></RoleGuard>} />
        <Route path="facturacion-rapida" element={<RoleGuard allowed={['Repartidor']}><ErrorBoundary><FacturacionRapida /></ErrorBoundary></RoleGuard>} />
        <Route path="reportes" element={<RoleGuard allowed={allowedOperativo}><ErrorBoundary><Reportes /></ErrorBoundary></RoleGuard>} />
        <Route path="balance" element={<RoleGuard allowed={['Obrador', 'Repartidor']}><ErrorBoundary><Balance /></ErrorBoundary></RoleGuard>} />
        <Route
          path="ingredientes"
          element={
            <RoleGuard allowed={['Obrador']}>
              {esEmpresaObrador
                ? <ErrorBoundary><Ingredientes /></ErrorBoundary>
                : <Navigate to="/dashboard" replace />}
            </RoleGuard>
          }
        />
        <Route path="usuarios" element={<RoleGuard allowed={['Admin']}><ErrorBoundary><Usuarios /></ErrorBoundary></RoleGuard>} />
        <Route path="ajustes" element={<RoleGuard allowed={['Admin', 'Obrador', 'Repartidor']}><ErrorBoundary><Ajustes /></ErrorBoundary></RoleGuard>} />
        <Route path="series" element={<RoleGuard allowed={['Admin']}><ErrorBoundary><SeriesFacturacion /></ErrorBoundary></RoleGuard>} />
        <Route
          path="etiquetas"
          element={
            <RoleGuard allowed={['Obrador']}>
              {esEmpresaObrador
                ? <ErrorBoundary><Etiquetas /></ErrorBoundary>
                : <Navigate to="/dashboard" replace />}
            </RoleGuard>
          }
        />
        <Route path="correos" element={<RoleGuard allowed={allowedOperativo}><ErrorBoundary><Correos /></ErrorBoundary></RoleGuard>} />
        <Route path="ia" element={<RoleGuard allowed={['Admin', 'Obrador', 'Repartidor']}><ErrorBoundary><BuenaTierrAI /></ErrorBoundary></RoleGuard>} />
        <Route path="buenatierr-ai" element={<Navigate to="/ia" replace />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </>
  )
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <HashRouter>
          <AppRoutes />
          <Toaster
            position="top-right"
            toastOptions={{
              duration: 3000,
              style: { fontSize: '13px' },
            }}
          />
        </HashRouter>
      </AuthProvider>
    </QueryClientProvider>
  )
}
