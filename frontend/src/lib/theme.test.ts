/**
 * Tests unitarios para el motor de temas dinámicos (lib/theme.ts).
 * Sin dependencias externas — lógica pura de colores y parseo.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  hexToRgb,
  darken,
  lighten,
  isValidHex,
  parseThemeFromConfig,
  applyTheme,
  applyStoredTheme,
  resetTheme,
  THEME_DEFAULTS,
} from '../lib/theme'

// ─── hexToRgb ────────────────────────────────────────────────────────────────

describe('hexToRgb', () => {
  it('convierte #RRGGBB correctamente', () => {
    expect(hexToRgb('#ffffff')).toEqual({ r: 255, g: 255, b: 255 })
    expect(hexToRgb('#000000')).toEqual({ r: 0,   g: 0,   b: 0   })
    expect(hexToRgb('#c4541a')).toEqual({ r: 196, g: 84,  b: 26  })
  })

  it('convierte #RGB (3 dígitos) correctamente', () => {
    expect(hexToRgb('#fff')).toEqual({ r: 255, g: 255, b: 255 })
    expect(hexToRgb('#000')).toEqual({ r: 0,   g: 0,   b: 0   })
  })

  it('acepta hex sin # al inicio', () => {
    expect(hexToRgb('c4541a')).toEqual({ r: 196, g: 84, b: 26 })
  })

  it('retorna null para valores inválidos', () => {
    expect(hexToRgb('zzzzzz')).toBeNull()
    expect(hexToRgb('')).toBeNull()
    expect(hexToRgb('#gg0000')).toBeNull()
  })
})

// ─── isValidHex ──────────────────────────────────────────────────────────────

describe('isValidHex', () => {
  it('valida hexadecimales de 6 dígitos con #', () => {
    expect(isValidHex('#c4541a')).toBe(true)
    expect(isValidHex('#000000')).toBe(true)
    expect(isValidHex('#FFFFFF')).toBe(true)
    expect(isValidHex('#a1B2c3')).toBe(true)
  })

  it('rechaza formatos inválidos', () => {
    expect(isValidHex('c4541a')).toBe(false)     // sin #
    expect(isValidHex('#c4541')).toBe(false)      // 5 dígitos
    expect(isValidHex('#c4541aaa')).toBe(false)   // 8 dígitos
    expect(isValidHex('#gggggg')).toBe(false)     // caracteres inválidos
    expect(isValidHex('')).toBe(false)
    expect(isValidHex(null)).toBe(false)
    expect(isValidHex(undefined)).toBe(false)
    expect(isValidHex(123)).toBe(false)
  })
})

// ─── darken / lighten ────────────────────────────────────────────────────────

describe('darken', () => {
  it('oscurece un color hacia negro', () => {
    const result = hexToRgb(darken('#ffffff', 0.5))!
    expect(result.r).toBe(128)
    expect(result.g).toBe(128)
    expect(result.b).toBe(128)
  })

  it('darken con amount=0 no cambia el color', () => {
    expect(darken('#c4541a', 0)).toBe('#c4541a')
  })

  it('retorna el original si el hex es inválido', () => {
    expect(darken('notacolor', 0.5)).toBe('notacolor')
  })
})

describe('lighten', () => {
  it('aclara un color hacia blanco', () => {
    const result = hexToRgb(lighten('#000000', 0.5))!
    expect(result.r).toBe(128)
    expect(result.g).toBe(128)
    expect(result.b).toBe(128)
  })

  it('lighten con amount=0 no cambia el color', () => {
    expect(lighten('#c4541a', 0)).toBe('#c4541a')
  })
})

// ─── parseThemeFromConfig ────────────────────────────────────────────────────

describe('parseThemeFromConfig', () => {
  it('retorna defaults cuando configuracion es null/undefined', () => {
    expect(parseThemeFromConfig(null)).toEqual(THEME_DEFAULTS)
    expect(parseThemeFromConfig(undefined)).toEqual(THEME_DEFAULTS)
    expect(parseThemeFromConfig('')).toEqual(THEME_DEFAULTS)
  })

  it('extrae colorPrimario y colorSecundario del JSON', () => {
    const cfg = JSON.stringify({ colorPrimario: '#1e3a8a', colorSecundario: '#3b82f6', otroValor: 'x' })
    expect(parseThemeFromConfig(cfg)).toEqual({
      colorPrimario:   '#1e3a8a',
      colorSecundario: '#3b82f6',
    })
  })

  it('usa defaults para colores inválidos en el JSON', () => {
    const cfg = JSON.stringify({ colorPrimario: 'no-es-hex', colorSecundario: '#3b82f6' })
    const result = parseThemeFromConfig(cfg)
    expect(result.colorPrimario).toBe(THEME_DEFAULTS.colorPrimario)
    expect(result.colorSecundario).toBe('#3b82f6')
  })

  it('usa defaults completos si el JSON es inválido', () => {
    expect(parseThemeFromConfig('{ invalid json')).toEqual(THEME_DEFAULTS)
  })

  it('usa defaults si faltan las propiedades de color', () => {
    const cfg = JSON.stringify({ smtpHost: 'smtp.example.com' })
    expect(parseThemeFromConfig(cfg)).toEqual(THEME_DEFAULTS)
  })
})

// ─── applyTheme (DOM) ────────────────────────────────────────────────────────

describe('applyTheme', () => {
  beforeEach(() => {
    // Limpiar CSS vars del test anterior
    const root = document.documentElement
    root.style.removeProperty('--brand-primary')
    root.style.removeProperty('--brand-secondary')
  })

  it('establece --brand-primary en el DOM', () => {
    applyTheme({ colorPrimario: '#1e3a8a', colorSecundario: '#3b82f6' })
    const val = document.documentElement.style.getPropertyValue('--brand-primary')
    expect(val).toBe('#1e3a8a')
  })

  it('establece --brand-secondary en el DOM', () => {
    applyTheme({ colorPrimario: '#1e3a8a', colorSecundario: '#3b82f6' })
    const val = document.documentElement.style.getPropertyValue('--brand-secondary')
    expect(val).toBe('#3b82f6')
  })

  it('genera variantes derivadas (dark, pale)', () => {
    applyTheme({ colorPrimario: '#c4541a', colorSecundario: '#e0b355' })
    const dark = document.documentElement.style.getPropertyValue('--brand-primary-dark')
    const pale = document.documentElement.style.getPropertyValue('--brand-primary-pale')
    expect(dark).not.toBe('')
    expect(pale).not.toBe('')
  })

  it('usa defaults si el color primario es inválido', () => {
    applyTheme({ colorPrimario: 'not-a-hex', colorSecundario: '#3b82f6' })
    const val = document.documentElement.style.getPropertyValue('--brand-primary')
    expect(val).toBe(THEME_DEFAULTS.colorPrimario)
  })

  it('persiste el tema en localStorage', () => {
    applyTheme({ colorPrimario: '#065f46', colorSecundario: '#34d399' })
    const stored = JSON.parse(localStorage.getItem('bt_theme') ?? '{}')
    expect(stored.colorPrimario).toBe('#065f46')
    expect(stored.colorSecundario).toBe('#34d399')
  })
})

// ─── applyStoredTheme ────────────────────────────────────────────────────────

describe('applyStoredTheme', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.style.removeProperty('--brand-primary')
  })

  it('aplica el tema almacenado en localStorage', () => {
    localStorage.setItem('bt_theme', JSON.stringify({ colorPrimario: '#4338ca', colorSecundario: '#818cf8' }))
    applyStoredTheme()
    const val = document.documentElement.style.getPropertyValue('--brand-primary')
    expect(val).toBe('#4338ca')
  })

  it('aplica defaults si localStorage está vacío', () => {
    applyStoredTheme()
    const val = document.documentElement.style.getPropertyValue('--brand-primary')
    expect(val).toBe(THEME_DEFAULTS.colorPrimario)
  })

  it('aplica defaults si el JSON almacenado es inválido', () => {
    localStorage.setItem('bt_theme', '{ bad json }')
    applyStoredTheme()
    const val = document.documentElement.style.getPropertyValue('--brand-primary')
    expect(val).toBe(THEME_DEFAULTS.colorPrimario)
  })
})

// ─── resetTheme ──────────────────────────────────────────────────────────────

describe('resetTheme', () => {
  it('restablece los colores de BuenaTierra por defecto', () => {
    applyTheme({ colorPrimario: '#4338ca', colorSecundario: '#818cf8' })
    resetTheme()
    const val = document.documentElement.style.getPropertyValue('--brand-primary')
    expect(val).toBe(THEME_DEFAULTS.colorPrimario)
  })

  it('elimina el tema del localStorage', () => {
    localStorage.setItem('bt_theme', JSON.stringify({ colorPrimario: '#4338ca', colorSecundario: '#818cf8' }))
    resetTheme()
    expect(localStorage.getItem('bt_theme')).toBeNull()
  })
})

// ─── THEME_DEFAULTS ──────────────────────────────────────────────────────────

describe('THEME_DEFAULTS', () => {
  it('los valores por defecto son colores hex válidos', () => {
    expect(isValidHex(THEME_DEFAULTS.colorPrimario)).toBe(true)
    expect(isValidHex(THEME_DEFAULTS.colorSecundario)).toBe(true)
  })

  it('el primario es el terracota de BuenaTierra', () => {
    expect(THEME_DEFAULTS.colorPrimario).toBe('#c4541a')
  })
})
