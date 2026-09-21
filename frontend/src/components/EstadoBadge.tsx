const DEFAULT_COLORS: Record<string, string> = {
  Pendiente: 'bg-amber-50 text-amber-700 border border-amber-200',
  Confirmado: 'bg-blue-50 text-blue-700 border border-blue-200',
  EnPreparacion: 'bg-purple-50 text-purple-700 border border-purple-200',
  Preparado: 'bg-indigo-50 text-indigo-700 border border-indigo-200',
  EnReparto: 'bg-orange-50 text-orange-700 border border-orange-200',
  Entregado: 'bg-green-50 text-green-700 border border-green-200',
  Servido: 'bg-green-50 text-green-700 border border-green-200',
  Cancelado: 'bg-red-50 text-red-700 border border-red-200',
  Borrador: 'bg-gray-50 text-gray-600 border border-gray-200',
  Emitida: 'bg-blue-50 text-blue-700 border border-blue-200',
  Enviada: 'bg-purple-50 text-purple-700 border border-purple-200',
  Cobrada: 'bg-green-50 text-green-700 border border-green-200',
  Anulada: 'bg-red-50 text-red-700 border border-red-200',
  Activo: 'bg-green-50 text-green-700 border border-green-200',
  Inactivo: 'bg-gray-50 text-gray-500 border border-gray-200',
  Moroso: 'bg-red-50 text-red-700 border border-red-200',
  Potencial: 'bg-blue-50 text-blue-700 border border-blue-200',
  Planificado: 'bg-blue-50 text-blue-700 border border-blue-200',
  Finalizada: 'bg-green-50 text-green-700 border border-green-200',
  Error: 'bg-red-50 text-red-700 border border-red-200',
  Pendiente_entregar: 'bg-orange-50 text-orange-700 border border-orange-200',
  Pendiente_cobro: 'bg-amber-50 text-amber-700 border border-amber-200',
  Suspendido: 'bg-yellow-50 text-yellow-700 border border-yellow-200',
  Bloqueado: 'bg-red-50 text-red-700 border border-red-200',
  EnProceso: 'bg-amber-50 text-amber-700 border border-amber-200',
  Cancelada: 'bg-red-50 text-red-600 border border-red-200',
}

export function EstadoBadge({
  estado,
  colors,
}: {
  estado: string | null | undefined
  colors?: Record<string, string>
}) {
  const key = estado ?? ''
  const cls = (colors ?? DEFAULT_COLORS)[key] ?? 'bg-gray-50 text-gray-600 border border-gray-200'
  return (
    <span className={`inline-block text-[11px] font-semibold px-2 py-0.5 rounded-full leading-normal ${cls}`}>
      {key}
    </span>
  )
}
