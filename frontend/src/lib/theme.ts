/**
 * Motor de temas dinámicos por empresa.
 * Gestiona colores primario y secundario mediante CSS custom properties.
 * Persiste el tema activo en localStorage para evitar flash en el arranque.
 */

export const THEME_DEFAULTS = {
  colorPrimario:   '#c4541a',   // terracota BuenaTierra
  colorSecundario: '#e0b355',   // trigo BuenaTierra
} as const

export interface ThemeConfig {
  colorPrimario:   string
  colorSecundario: string
}

const STORAGE_KEY = 'bt_theme'

// ─── Color utilities ──────────────────────────────────────────────────────────

/** Parsea un color hex (#RGB o #RRGGBB) a componentes {r,g,b} */
export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const clean = hex.replace(/^#/, '')
  const full  = clean.length === 3
    ? clean.split('').map(c => c + c).join('')
    : clean
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return null
  const n = parseInt(full, 16)
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
}

function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b]
    .map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0'))
    .join('')
}

function mix(hex: string, target: string, weight: number): string {
  const c = hexToRgb(hex)
  const t = hexToRgb(target)
  if (!c || !t) return hex
  return rgbToHex(
    c.r + (t.r - c.r) * weight,
    c.g + (t.g - c.g) * weight,
    c.b + (t.b - c.b) * weight,
  )
}

/** Oscurece un color hex entre 0 y 1 (0 = sin cambio, 1 = negro) */
export function darken(hex: string, amount = 0.2): string {
  return mix(hex, '#000000', amount)
}

/** Aclara un color hex entre 0 y 1 (0 = sin cambio, 1 = blanco) */
export function lighten(hex: string, amount = 0.85): string {
  return mix(hex, '#ffffff', amount)
}

/** Valida formato hex de 6 dígitos con o sin # */
export function isValidHex(value: unknown): value is string {
  return typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value)
}

// ─── Parseo de configuración ──────────────────────────────────────────────────

/** Extrae colorPrimario y colorSecundario del JSON de configuración de empresa */
export function parseThemeFromConfig(configuracion?: string | null): ThemeConfig {
  try {
    if (!configuracion) return { ...THEME_DEFAULTS }
    const cfg = JSON.parse(configuracion)
    return {
      colorPrimario:   isValidHex(cfg.colorPrimario)   ? cfg.colorPrimario   : THEME_DEFAULTS.colorPrimario,
      colorSecundario: isValidHex(cfg.colorSecundario) ? cfg.colorSecundario : THEME_DEFAULTS.colorSecundario,
    }
  } catch {
    return { ...THEME_DEFAULTS }
  }
}

// ─── Aplicación de tema al DOM ────────────────────────────────────────────────

/** Aplica un ThemeConfig al DOM (CSS custom properties) y lo persiste en localStorage */
export function applyTheme(theme: ThemeConfig): void {
  const p = isValidHex(theme.colorPrimario)   ? theme.colorPrimario   : THEME_DEFAULTS.colorPrimario
  const s = isValidHex(theme.colorSecundario) ? theme.colorSecundario : THEME_DEFAULTS.colorSecundario

  const root = document.documentElement
  root.style.setProperty('--brand-primary',         p)
  root.style.setProperty('--brand-primary-dark',    darken(p, 0.15))
  root.style.setProperty('--brand-primary-darker',  darken(p, 0.30))
  root.style.setProperty('--brand-primary-pale',    lighten(p, 0.92))
  root.style.setProperty('--brand-primary-light',   lighten(p, 0.72))
  root.style.setProperty('--brand-secondary',       s)
  root.style.setProperty('--brand-secondary-dark',  darken(s, 0.15))

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ colorPrimario: p, colorSecundario: s }))
  } catch { /* localStorage no disponible */ }
}

/** Carga el tema almacenado en localStorage y lo aplica. Sin efecto si no hay nada. */
export function applyStoredTheme(): void {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      applyTheme(THEME_DEFAULTS)
      return
    }
    const parsed = JSON.parse(raw) as unknown
    if (
      parsed &&
      typeof parsed === 'object' &&
      isValidHex((parsed as Record<string, unknown>).colorPrimario) &&
      isValidHex((parsed as Record<string, unknown>).colorSecundario)
    ) {
      applyTheme(parsed as ThemeConfig)
    } else {
      applyTheme(THEME_DEFAULTS)
    }
  } catch {
    applyTheme(THEME_DEFAULTS)
  }
}

/** Elimina el tema almacenado y restablece los colores por defecto (sin re-persistir) */
export function resetTheme(): void {
  try { localStorage.removeItem(STORAGE_KEY) } catch { /* ignore */ }
  // Aplicar defaults al DOM sin escribir de nuevo en localStorage
  const p = THEME_DEFAULTS.colorPrimario
  const s = THEME_DEFAULTS.colorSecundario
  const root = document.documentElement
  root.style.setProperty('--brand-primary',         p)
  root.style.setProperty('--brand-primary-dark',    darken(p, 0.15))
  root.style.setProperty('--brand-primary-darker',  darken(p, 0.30))
  root.style.setProperty('--brand-primary-pale',    lighten(p, 0.92))
  root.style.setProperty('--brand-primary-light',   lighten(p, 0.72))
  root.style.setProperty('--brand-secondary',       s)
  root.style.setProperty('--brand-secondary-dark',  darken(s, 0.15))
}
