import { useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'react-hot-toast'
import { AuthProvider, useAuth } from './store/authStore'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Productos from './pages/Productos'
import Clientes from './pages/Clientes'
import Produccion from './pages/Produccion'
import Facturacion from './pages/Facturacion'
import Lotes from './pages/Lotes'
import Albaranes from './pages/Albaranes'
import Pedidos from './pages/Pedidos'
import Trazabilidad from './pages/Trazabilidad'
import FacturacionRapida from './pages/FacturacionRapida'
import Reportes from './pages/Reportes'
import Ingredientes from './pages/Ingredientes'
import Usuarios from './pages/Usuarios'
import Ajustes from './pages/Ajustes'
import SeriesFacturacion from './pages/SeriesFacturacion'
import Etiquetas from './pages/Etiquetas'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'
import ShortcutsModal from './components/ShortcutsModal'
import { ErrorBoundary } from './components/ErrorBoundary'

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
  if (!user || !allowed.includes(user.rol)) return <Navigate to="/dashboard" replace />
  return <>{children}</>
}

function AppRoutes() {
  const { isAuthenticated } = useAuth()
  const [shortcutsOpen, setShortcutsOpen] = useState(false)

  useKeyboardShortcuts({
    onShowHelp: () => setShortcutsOpen(true),
    enabled: isAuthenticated,
  })

  return (
    <>
      <ShortcutsModal open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
      <Routes>
      <Route path="/login" element={isAuthenticated ? <Navigate to="/dashboard" replace /> : <Login />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<ErrorBoundary><Dashboard /></ErrorBoundary>} />
        <Route path="productos" element={<ErrorBoundary><Productos /></ErrorBoundary>} />
        <Route path="clientes" element={<ErrorBoundary><Clientes /></ErrorBoundary>} />
        <Route path="produccion" element={<RoleGuard allowed={['Admin', 'Obrador']}><ErrorBoundary><Produccion /></ErrorBoundary></RoleGuard>} />
        <Route path="facturacion" element={<ErrorBoundary><Facturacion /></ErrorBoundary>} />
        <Route path="lotes" element={<ErrorBoundary><Lotes /></ErrorBoundary>} />
        <Route path="albaranes" element={<ErrorBoundary><Albaranes /></ErrorBoundary>} />
        <Route path="pedidos" element={<ErrorBoundary><Pedidos /></ErrorBoundary>} />
        <Route path="trazabilidad" element={<ErrorBoundary><Trazabilidad /></ErrorBoundary>} />
        <Route path="facturacion-rapida" element={<ErrorBoundary><FacturacionRapida /></ErrorBoundary>} />
        <Route path="reportes" element={<ErrorBoundary><Reportes /></ErrorBoundary>} />
        <Route path="ingredientes" element={<RoleGuard allowed={['Admin', 'Obrador']}><ErrorBoundary><Ingredientes /></ErrorBoundary></RoleGuard>} />
        <Route path="usuarios" element={<RoleGuard allowed={['Admin']}><ErrorBoundary><Usuarios /></ErrorBoundary></RoleGuard>} />
        <Route path="ajustes" element={<RoleGuard allowed={['Admin', 'Obrador', 'Repartidor']}><ErrorBoundary><Ajustes /></ErrorBoundary></RoleGuard>} />
        <Route path="series" element={<RoleGuard allowed={['Admin']}><ErrorBoundary><SeriesFacturacion /></ErrorBoundary></RoleGuard>} />
        <Route path="etiquetas" element={<RoleGuard allowed={['Admin', 'Obrador']}><ErrorBoundary><Etiquetas /></ErrorBoundary></RoleGuard>} />
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
        <BrowserRouter>
          <AppRoutes />
          <Toaster
            position="top-right"
            toastOptions={{
              duration: 3000,
              style: { fontSize: '13px' },
            }}
          />
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  )
}
