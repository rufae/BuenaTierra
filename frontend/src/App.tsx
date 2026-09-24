import { useState } from 'react'
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import { Toaster } from 'react-hot-toast'
import { AuthProvider, useAuth } from './store/authStore'
import { applyStoredTheme } from './lib/theme'
import { useTheme } from './hooks/useTheme'
import Layout from './components/Layout'
import Login from './pages/Login'
import CambiarContrasena from './pages/CambiarContrasena'
import ForgotPassword from './pages/ForgotPassword'
import Dashboard from './pages/Dashboard'
import Productos from './pages/Productos'
import Clientes from './pages/Clientes'
import Facturacion from './pages/Facturacion'
import Lotes from './pages/Lotes'
import Albaranes from './pages/Albaranes'
import Pedidos from './pages/Pedidos'
import Preventa from './pages/Preventa'
import Trazabilidad from './pages/Trazabilidad'
import FacturacionRapida from './pages/FacturacionRapida'
import Carga from './pages/Carga'
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
import api from './lib/api'
import type { Empresa } from './types'

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
  const { isAuthenticated, user } = useAuth()
  if (!isAuthenticated) return <Navigate to="/login" replace />
  if (user?.debeCambiarPassword) return <Navigate to="/cambiar-contrasena" replace />
  return <>{children}</>
}

/** Solo requiere autenticación (sin bloqueo por cambio de contraseña obligatorio) */
function AuthOnly({ children }: { children: React.ReactNode }) {
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
  // Roles unificados: solo Admin y Cliente. Admin ve todo; Cliente ve todo
  // salvo las excepciones (Etiquetas, IA y Correo, solo Admin).
  const allowedOperativo = ['Admin', 'Cliente']

  const { data: empresa } = useQuery({
    queryKey: ['empresa-tema', user?.empresaId],
    enabled: isAuthenticated && !!user?.empresaId,
    staleTime: 300_000,
    queryFn: async () => (await api.get<{ data: Empresa }>('/empresa')).data.data,
  })

  useTheme(empresa?.configuracion)

  useKeyboardShortcuts({
    onShowHelp: () => setShortcutsOpen(true),
    enabled: isAuthenticated,
    operationPath: '/carga',
  })

  return (
    <>
      <ShortcutsModal open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
      <Routes>
      <Route path="/login" element={isAuthenticated ? <Navigate to={homePath} replace /> : <Login />} />
      <Route path="/olvide-password" element={<ForgotPassword />} />
      <Route path="/cambiar-contrasena" element={<AuthOnly><CambiarContrasena /></AuthOnly>} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to={homePath} replace />} />
        <Route path="dashboard" element={<RoleGuard allowed={allowedOperativo}><ErrorBoundary><Dashboard /></ErrorBoundary></RoleGuard>} />
        <Route path="productos" element={<RoleGuard allowed={allowedOperativo}><ErrorBoundary><Productos /></ErrorBoundary></RoleGuard>} />
        <Route path="clientes" element={<RoleGuard allowed={allowedOperativo}><ErrorBoundary><Clientes /></ErrorBoundary></RoleGuard>} />
        <Route path="produccion" element={<Navigate to="/carga" replace />} />
        <Route
          path="carga"
          element={
            <RoleGuard allowed={allowedOperativo}>
              <ErrorBoundary><Carga /></ErrorBoundary>
            </RoleGuard>
          }
        />
        <Route path="compra" element={<Navigate to="/carga" replace />} />
        <Route path="facturacion" element={<RoleGuard allowed={allowedOperativo}><ErrorBoundary><Facturacion /></ErrorBoundary></RoleGuard>} />
        <Route path="lotes" element={<RoleGuard allowed={allowedOperativo}><ErrorBoundary><Lotes /></ErrorBoundary></RoleGuard>} />
        <Route path="albaranes" element={<RoleGuard allowed={allowedOperativo}><ErrorBoundary><Albaranes /></ErrorBoundary></RoleGuard>} />
        <Route path="pedidos" element={<RoleGuard allowed={allowedOperativo}><ErrorBoundary><Pedidos /></ErrorBoundary></RoleGuard>} />
        <Route path="preventa" element={<RoleGuard allowed={allowedOperativo}><ErrorBoundary><Preventa /></ErrorBoundary></RoleGuard>} />
        <Route path="trazabilidad" element={<RoleGuard allowed={allowedOperativo}><ErrorBoundary><Trazabilidad /></ErrorBoundary></RoleGuard>} />
        <Route path="facturacion-rapida" element={<RoleGuard allowed={allowedOperativo}><ErrorBoundary><FacturacionRapida /></ErrorBoundary></RoleGuard>} />
        <Route path="reportes" element={<RoleGuard allowed={allowedOperativo}><ErrorBoundary><Reportes /></ErrorBoundary></RoleGuard>} />
        <Route path="balance" element={<RoleGuard allowed={allowedOperativo}><ErrorBoundary><Balance /></ErrorBoundary></RoleGuard>} />
        <Route path="ingredientes" element={<RoleGuard allowed={allowedOperativo}><ErrorBoundary><Ingredientes /></ErrorBoundary></RoleGuard>} />
        <Route path="usuarios" element={<RoleGuard allowed={['Admin']}><ErrorBoundary><Usuarios /></ErrorBoundary></RoleGuard>} />
        <Route path="ajustes" element={<RoleGuard allowed={allowedOperativo}><ErrorBoundary><Ajustes /></ErrorBoundary></RoleGuard>} />
        <Route path="series" element={<RoleGuard allowed={['Admin']}><ErrorBoundary><SeriesFacturacion /></ErrorBoundary></RoleGuard>} />
        {/* Pestañas ocultadas de momento para el resto de usuarios (solo Admin) */}
        <Route
          path="etiquetas"
          element={
            <RoleGuard allowed={['Admin']}>
              <ErrorBoundary><Etiquetas /></ErrorBoundary>
            </RoleGuard>
          }
        />
        <Route path="correos" element={<RoleGuard allowed={['Admin']}><ErrorBoundary><Correos /></ErrorBoundary></RoleGuard>} />
        <Route path="ia" element={<RoleGuard allowed={['Admin']}><ErrorBoundary><BuenaTierrAI /></ErrorBoundary></RoleGuard>} />
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
