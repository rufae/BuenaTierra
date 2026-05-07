import { useEffect } from 'react'
import { applyTheme, parseThemeFromConfig } from '../lib/theme'

/**
 * Hook que lee la configuración de empresa y aplica el tema de colores.
 * Llamar con `configuracion` cuando la empresa cargue.
 * No hace nada si `configuracion` es undefined (deja el tema del localStorage).
 */
export function useTheme(configuracion: string | null | undefined): void {
  useEffect(() => {
    if (configuracion === undefined) return
    applyTheme(parseThemeFromConfig(configuracion))
  }, [configuracion])
}
