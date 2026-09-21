const _currencyFmt = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' })

export function formatCurrency(value: number | string | null | undefined): string {
  const n = typeof value === 'string' ? parseFloat(value) : (value ?? 0)
  return _currencyFmt.format(n)
}
