/**
 * Formateo de fechas seguro para toda la aplicación.
 *
 * Problema que resuelve:
 *   new Date("2026-03-01") trata la cadena como UTC medianoche.
 *   En España (UTC+1) eso es el día anterior a las 23h → fecha incorrecta.
 *   Además toLocaleDateString('es-ES') devuelve "D/M/YYYY" (sin ceros).
 *
 * Solución: parsear directamente los componentes YYYY-MM-DD sin pasar por Date.
 */

/**
 * Formatea "YYYY-MM-DD" o "YYYY-MM-DDTHH:mm:ss..." como "DD/MM/YYYY".
 * Devuelve '—' si la cadena es nula, vacía o malformada.
 */
export function fmtDate(s: string | null | undefined): string {
  if (!s) return '—'
  const dateStr = s.split('T')[0]
  const parts = dateStr.split('-')
  if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) return '—'
  const [y, m, d] = parts
  return `${d.padStart(2, '0')}/${m.padStart(2, '0')}/${y}`
}

/**
 * Parsea "YYYY-MM-DD[...]" como Date a medianoche LOCAL (evita desfase UTC).
 * Devuelve null si la cadena es nula/inválida.
 */
export function parseDate(s: string | null | undefined): Date | null {
  if (!s) return null
  const parts = s.split('T')[0].split('-')
  if (parts.length !== 3) return null
  const [y, m, d] = parts.map(Number)
  if (!y || !m || !d) return null
  return new Date(y, m - 1, d)   // local midnight — sin desfase UTC
}

/**
 * Devuelve true si la fecha ya ha pasado respecto a hoy al inicio del día.
 */
export function isExpired(s: string | null | undefined): boolean {
  const d = parseDate(s)
  if (!d) return false
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return d < today
}

/**
 * Formatea un ISO datetime completo (con zona horaria) como "DD/MM/YYYY HH:mm".
 * Útil para timestamps de última conexión, auditoría, etc.
 */
export function fmtDateTime(s: string | null | undefined): string {
  if (!s) return '—'
  return new Date(s).toLocaleString('es-ES', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}
