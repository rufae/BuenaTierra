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
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'
import ShortcutsModal from './components/ShortcutsModal'

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
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="productos" element={<Productos />} />
        <Route path="clientes" element={<Clientes />} />
        <Route path="produccion" element={<Produccion />} />
        <Route path="facturacion" element={<Facturacion />} />
        <Route path="lotes" element={<Lotes />} />
        <Route path="albaranes" element={<Albaranes />} />
        <Route path="pedidos" element={<Pedidos />} />
        <Route path="trazabilidad" element={<Trazabilidad />} />
        <Route path="facturacion-rapida" element={<FacturacionRapida />} />
        <Route path="reportes" element={<Reportes />} />
        <Route path="ingredientes" element={<Ingredientes />} />
        <Route path="usuarios" element={<Usuarios />} />
        <Route path="ajustes" element={<Ajustes />} />
        <Route path="series" element={<SeriesFacturacion />} />
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
