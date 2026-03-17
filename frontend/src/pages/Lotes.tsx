import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../store/authStore'
import api from '../lib/api'
import type { Producto, StockItem } from '../types'
import { Search, Lock, AlertTriangle, Eye, RefreshCw } from 'lucide-react'
import toast from 'react-hot-toast'
import { fmtDate, parseDate } from '../lib/dates'

const ESTADO_BADGE: Record<string, string> = {
  activo: 'bg-green-50 text-green-700 border border-green-200',
  bloqueado: 'bg-red-50 text-red-700 border border-red-200',
  'próximo a caducar': 'bg-amber-50 text-amber-700 border border-amber-200',
}

export default function Lotes() {
  const { user } = useAuth()
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [filterEstado, setFilterEstado] = useState<string>('todos')
  const [fifoProductoId, setFifoProductoId] = useState<number | null>(null)
  const [fifoCantidad, setFifoCantidad] = useState('')
  const [fifoResult, setFifoResult] = useState<any[]>([])
  const [bloquearId, setBloquearId] = useState<number | null>(null)
  const [motivoBloqueo, setMotivoBloqueo] = useState('')

  const { data: stock, isLoading, refetch } = useQuery({
    queryKey: ['stock-todos', user?.empresaId],
    queryFn: async () => {
      const res = await api.get<{ data: StockItem[] }>('/stock/todos')
      return res.data.data
    },
    refetchInterval: 30_000,
  })

  const { data: productos } = useQuery({
    queryKey: ['productos', user?.empresaId],
    queryFn: async () => {
      const res = await api.get<{ data: Producto[] }>('/productos')
      return res.data.data
    },
  })

  const bloquearMutation = useMutation({
    mutationFn: ({ loteId, motivo }: { loteId: number; motivo: string }) =>
      api.post(`/lotes/${loteId}/bloquear`, { motivo }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['stock-todos'] })
      toast.success('Lote bloqueado')
      setBloquearId(null)
      setMotivoBloqueo('')
    },
    onError: () => toast.error('Error al bloquear el lote'),
  })

  async function previewFifo() {
    if (!fifoProductoId || !fifoCantidad) return
    try {
      const res = await api.get<{ success: boolean; data: any[]; message?: string }>(
        `/lotes/producto/${fifoProductoId}/fifo?cantidad=${fifoCantidad}`
      )
      if (!res.data.success) {
        setFifoResult([])
        toast.error(res.data.message ?? 'Sin stock disponible para este producto')
        return
      }
      setFifoResult(res.data.data ?? [])
      if ((res.data.data ?? []).length === 0) toast('Sin resultados', { icon: 'ℹ️' })
    } catch {
      toast.error('Error al previsualizar FIFO')
    }
  }

  const filtrados = (stock ?? []).filter(s => {
    const matchSearch = s.productoNombre.toLowerCase().includes(search.toLowerCase()) ||
      s.codigoLote.toLowerCase().includes(search.toLowerCase())
    if (!matchSearch) return false
    if (filterEstado === 'todos') return true
    return getEstado(s) === filterEstado
  })

  // Agrupar por loteId para detectar estado
  function getEstado(s: StockItem) {
    if (s.cantidadDisponible <= 0) return 'agotado'
    if (s.fechaCaducidad) {
      const cad = parseDate(s.fechaCaducidad)
      if (cad) {
        const hoy = new Date(); hoy.setHours(0, 0, 0, 0)
        const diff = (cad.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24)
        if (diff <= 0) return 'caducado'
        if (diff <= 3) return 'próximo a caducar'
      }
    }
    return 'activo'
  }

  const allItems = (stock ?? [])
  const totalLotes = allItems.length
  const lotesActivos = allItems.filter(s => getEstado(s) === 'activo').length
  const lotesProxCaducar = allItems.filter(s => getEstado(s) === 'próximo a caducar').length
  const lotesBajos = allItems.filter(s => s.cantidadDisponible > 0 && s.cantidadDisponible < 5).length

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Gestión de Lotes</h1>
          <p className="text-sm text-gray-500 mt-0.5">Stock por lote · trazabilidad · asignación FIFO</p>
        </div>
        <button onClick={() => refetch()} className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 border rounded-lg hover:bg-gray-50">
          <RefreshCw className="w-4 h-4" />Actualizar
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Total lotes', value: totalLotes, color: 'text-gray-900' },
          { label: 'Activos con stock', value: lotesActivos, color: 'text-green-700' },
          { label: 'Próximos a caducar', value: lotesProxCaducar, color: lotesProxCaducar > 0 ? 'text-amber-600' : 'text-gray-400' },
          { label: 'Stock bajo (< 5)', value: lotesBajos, color: lotesBajos > 0 ? 'text-amber-600' : 'text-gray-400' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs text-gray-500">{s.label}</p>
            <p className={`text-2xl font-bold mt-1 ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Preview FIFO */}
      <div className="bg-brand-50 border border-brand-200 rounded-xl p-4">
        <p className="text-sm font-semibold text-brand-800 mb-3 flex items-center gap-2">
          <Eye className="w-4 h-4" />Vista previa asignación FIFO
        </p>
        <div className="flex gap-3 items-end flex-wrap">
          <div>
            <label className="block text-xs text-gray-600 mb-1">Producto</label>
            <select
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-56 focus:ring-2 focus:ring-brand-500 focus:border-transparent"
              value={fifoProductoId ?? ''}
              onChange={e => { setFifoProductoId(+e.target.value); setFifoResult([]) }}
            >
              <option value="">Seleccionar producto…</option>
              {(productos ?? []).map(p => (
                <option key={p.id} value={p.id}>{p.nombre}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">Cantidad</label>
            <input
              type="number" min="1" step="1"
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-28 focus:ring-2 focus:ring-brand-500 focus:border-transparent"
              value={fifoCantidad}
              onChange={e => { setFifoCantidad(e.target.value); setFifoResult([]) }}
            />
          </div>
          <button
            onClick={previewFifo}
            disabled={!fifoProductoId || !fifoCantidad}
            className="px-4 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium disabled:opacity-40 hover:bg-brand-700"
          >
            Calcular FIFO
          </button>
        </div>
        {fifoResult.length > 0 && (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-brand-700 border-b border-brand-200">
                  <th className="pb-2 pr-4">Lote</th>
                  <th className="pb-2 pr-4">F. Fabricación</th>
                  <th className="pb-2 pr-4">F. Caducidad</th>
                  <th className="pb-2">Cantidad asignada</th>
                </tr>
              </thead>
              <tbody>
                {fifoResult.map((r, i) => (
                  <tr key={i} className="border-b border-brand-100">
                    <td className="py-1.5 pr-4 font-mono text-xs font-semibold">{r.codigoLote}</td>
                    <td className="py-1.5 pr-4 text-xs">{fmtDate(r.fechaFabricacion)}</td>
                    <td className="py-1.5 pr-4 text-xs">{fmtDate(r.fechaCaducidad)}</td>
                    <td className="py-1.5 font-bold text-brand-700">{r.cantidad}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Buscador + Filtros */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
          <input
            type="text"
            placeholder="Buscar producto o lote\u2026"
            className="pl-9 pr-4 py-2 w-full border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-transparent"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-1.5">
          {[
            { key: 'todos', label: 'Todos' },
            { key: 'activo', label: 'Activos' },
            { key: 'pr\u00f3ximo a caducar', label: '\u26a0\ufe0f Pr\u00f3ximos a caducar' },
            { key: 'caducado', label: 'Caducados' },
            { key: 'agotado', label: 'Agotados' },
          ].map(f => (
            <button key={f.key}
              onClick={() => setFilterEstado(f.key)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                filterEstado === f.key
                  ? 'bg-brand-600 text-white border-brand-600'
                  : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
              }`}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tabla de lotes */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {['Producto', 'Código Lote', 'F. Fabricación', 'F. Caducidad', 'Disponible', 'Reservado', 'Estado', 'Acción'].map(h => (
                <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {isLoading
              ? <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400 text-sm">Cargando lotes…</td></tr>
              : filtrados.length === 0
              ? <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400 text-sm">No hay lotes registrados</td></tr>
              : filtrados.map((s, idx) => {
                  const estado = getEstado(s)
                  return (
                    <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                      <td className="px-4 py-3 font-medium text-gray-900">{s.productoNombre}</td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-700">{s.codigoLote}</td>
                      <td className="px-4 py-3 text-gray-600">{fmtDate(s.fechaLote)}</td>
                      <td className="px-4 py-3">
                        {s.fechaCaducidad
                          ? <span className={getEstado(s) === 'caducado' ? 'text-red-600 font-semibold' : ''}>{fmtDate(s.fechaCaducidad)}</span>
                          : <span className="text-gray-400">—</span>}
                      </td>
                      <td className="px-4 py-3 font-bold text-gray-900">{s.cantidadDisponible}</td>
                      <td className="px-4 py-3 text-gray-500">{s.cantidadReservada}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-1 rounded-full font-medium ${ESTADO_BADGE[estado] ?? 'bg-gray-100 text-gray-600'}`}>
                          {estado}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {estado !== 'agotado' && (
                          <button
                            onClick={() => setBloquearId(s.loteId)}
                            className="flex items-center gap-1 text-xs text-red-600 hover:text-red-800 underline"
                          >
                            <Lock className="w-3 h-3" />Bloquear
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
          </tbody>
        </table>
      </div>

      {/* Modal Bloquear */}
      {bloquearId !== null && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <div className="flex items-center gap-2 mb-4">
              <AlertTriangle className="w-5 h-5 text-red-500" />
              <h2 className="text-base font-bold text-gray-900">Bloquear lote</h2>
            </div>
            <p className="text-sm text-gray-600 mb-4">El lote bloqueado no se asignará en futuras facturas. Indica el motivo:</p>
            <input
              type="text"
              placeholder="Motivo del bloqueo (ej: contaminación, retirada)"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-red-500 focus:border-transparent"
              value={motivoBloqueo}
              onChange={e => setMotivoBloqueo(e.target.value)}
            />
            <div className="flex justify-end gap-3 mt-5">
              <button onClick={() => { setBloquearId(null); setMotivoBloqueo('') }} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900">Cancelar</button>
              <button
                disabled={!motivoBloqueo.trim() || bloquearMutation.isPending}
                onClick={() => bloquearMutation.mutate({ loteId: bloquearId!, motivo: motivoBloqueo })}
                className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium disabled:opacity-40 hover:bg-red-700"
              >
                Confirmar bloqueo
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
