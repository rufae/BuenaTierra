import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

export interface ShortcutDef {
  key: string
  description: string
  path?: string
  action?: () => void
}

export const SHORTCUTS: ShortcutDef[] = [
  { key: 'Alt+1', description: 'Panel de Control', path: '/dashboard' },
  { key: 'Alt+2', description: 'Facturación', path: '/facturacion' },
  { key: 'Alt+3', description: 'Pedidos', path: '/pedidos' },
  { key: 'Alt+4', description: 'Lotes', path: '/lotes' },
  { key: 'Alt+5', description: 'Clientes', path: '/clientes' },
  { key: 'Alt+6', description: 'Productos', path: '/productos' },
  { key: 'Alt+7', description: 'Producción', path: '/produccion' },
  { key: 'Alt+8', description: 'Reportes', path: '/reportes' },
  { key: 'Alt+9', description: 'Trazabilidad', path: '/trazabilidad' },
  { key: 'Alt+0', description: 'Usuarios', path: '/usuarios' },
  { key: '?', description: 'Mostrar atajos de teclado' },
]

interface UseKeyboardShortcutsOptions {
  onShowHelp: () => void
  enabled?: boolean
}

export function useKeyboardShortcuts({ onShowHelp, enabled = true }: UseKeyboardShortcutsOptions) {
  const navigate = useNavigate()

  useEffect(() => {
    if (!enabled) return

    function handleKeyDown(e: KeyboardEvent) {
      // Don't fire when user is typing in input/textarea/select
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase()
      if (['input', 'textarea', 'select'].includes(tag)) return

      // ? key → show shortcuts help modal
      if (e.key === '?' && !e.altKey && !e.ctrlKey && !e.metaKey) {
        e.preventDefault()
        onShowHelp()
        return
      }

      // Alt+digit navigation
      if (e.altKey && !e.ctrlKey && !e.metaKey) {
        const navMap: Record<string, string> = {
          '1': '/dashboard',
          '2': '/facturacion',
          '3': '/pedidos',
          '4': '/lotes',
          '5': '/clientes',
          '6': '/productos',
          '7': '/produccion',
          '8': '/reportes',
          '9': '/trazabilidad',
          '0': '/usuarios',
        }
        if (navMap[e.key]) {
          e.preventDefault()
          navigate(navMap[e.key])
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [enabled, navigate, onShowHelp])
}
