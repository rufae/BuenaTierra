import { useState, FormEvent } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../store/authStore'
import api from '../lib/api'
import type { Producto } from '../types'
import { Plus, CheckCircle, XCircle, Loader2, X, Factory, Hash } from 'lucide-react'
import toast from 'react-hot-toast'

// DTO aplanado que devuelve el backend
interface ProduccionDto {
  id: number
  empresaId: number
  productoId: number
  productoNombre: string
  unidadMedida: string
  fechaProduccion: string
  cantidadProducida: number
  cantidadMerma: number
  estado: string
  notas: string | null
  codigoLoteSugerido: string | null
  codigoLote: string | null
  loteId: number | null
  fechaCaducidad: string | null
}

interface CrearProduccionDto {
  empresaId: number
  usuarioId: number
  productoId: number
  cantidadProducida: number
  fechaProduccion: string
  codigoLoteSugerido: string
  notas?: string
}

interface ProduccionCreada {
  produccionId: number
  loteId: number | null
  codigoLote: string | null
}

// Genera el código de lote ddMMyyyy para una fecha dada
function loteCodigo(date: Date = new Date()): string {
  const dd = String(date.getDate()).padStart(2, '0')
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const yyyy = date.getFullYear()
  return `${dd}${mm}${yyyy}`
}

const ESTADO_BADGE: Record<string, string> = {
  Planificada: 'bg-blue-50 text-blue-700',
  EnCurso: 'bg-amber-50 text-amber-700',
  Finalizada: 'bg-green-50 text-green-700',
  Cancelada: 'bg-red-50 text-red-600',
}

export default function ProduccionPage() {
  const { user } = useAuth()
  const qc = useQueryClient()
  const [showForm, setShowForm] = useState(false)

  // Fecha hoy en formato YYYY-MM-DD para input[type=date]
  const todayIso = new Date().toISOString().split('T')[0]

  const [form, setForm] = useState<CrearProduccionDto>({
    empresaId: user!.empresaId,
    usuarioId: user!.usuarioId,
    productoId: 0,
    cantidadProducida: 0,
    fechaProduccion: todayIso,
    codigoLoteSugerido: loteCodigo(),
    notas: '',
  })

  // Recalculate lote code when date changes
  function handleFechaChange(isoDate: string) {
    const parts = isoDate.split('-')
    if (parts.length === 3) {
      const [yyyy, mm, dd] = parts
      setForm(f => ({ ...f, fechaProduccion: isoDate, codigoLoteSugerido: `${dd}${mm}${yyyy}` }))
    } else {
      setForm(f => ({ ...f, fechaProduccion: isoDate }))
    }
  }

  const { data: producciones, isLoading } = useQuery({
    queryKey: ['producciones-hoy', user?.empresaId],
    queryFn: async () => {
      const res = await api.get<{ data: ProduccionDto[] }>('/produccion/hoy')
      return res.data.data
    },
    refetchInterval: 30000,
  })

  const { data: productos } = useQuery({
    queryKey: ['productos', user?.empresaId],
    queryFn: async () => {
      const res = await api.get<{ data: Producto[] }>('/productos')
      return res.data.data
    },
  })

  const createMutation = useMutation({
    mutationFn: (dto: CrearProduccionDto) => api.post<{ data: ProduccionCreada }>('/produccion', dto),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['producciones-hoy'] })
      qc.invalidateQueries({ queryKey: ['stock'] })
      const { codigoLote } = res.data.data
      toast.success(`Producción registrada${codigoLote ? ` — Lote ${codigoLote}` : ' (pendiente de finalizar)'}`)
      setShowForm(false)
      setForm({
        empresaId: user!.empresaId,
        usuarioId: user!.usuarioId,
        productoId: 0,
        cantidadProducida: 0,
        fechaProduccion: todayIso,
        codigoLoteSugerido: loteCodigo(),
        notas: '',
      })
    },
    onError: () => toast.error('Error al registrar producción'),
  })

  const finalizarMutation = useMutation({
    mutationFn: (id: number) => api.post(`/produccion/${id}/finalizar`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['producciones-hoy'] })
      qc.invalidateQueries({ queryKey: ['stock'] })
      toast.success('Producción finalizada. Lote y stock generados.')
    },
    onError: () => toast.error('Error al finalizar producción'),
  })

  const cancelarMutation = useMutation({
    mutationFn: (id: number) => api.post(`/produccion/${id}/cancelar`, { motivo: 'Cancelado por usuario' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['producciones-hoy'] })
      toast.success('Producción cancelada')
    },
    onError: () => toast.error('Error al cancelar producción'),
  })

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!form.productoId) return toast.error('Selecciona un producto')
    if (form.cantidadProducida <= 0) return toast.error('La cantidad debe ser positiva')
    if (!form.codigoLoteSugerido.trim()) return toast.error('El código de lote no puede estar vacío')
    createMutation.mutate(form)
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Producción</h1>
          <p className="text-gray-500 text-sm mt-0.5">Registro de producción del día — genera lotes y stock automáticamente</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" />
          Registrar producción
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
          <Factory className="w-4 h-4 text-brand-600" />
          <h2 className="font-semibold text-gray-900 text-sm">Producciones de hoy</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wider">
                <th className="px-5 py-3 text-left">Producto</th>
                <th className="px-5 py-3 text-right">Cantidad</th>
                <th className="px-5 py-3 text-center">Estado</th>
                <th className="px-5 py-3 text-left">Lote</th>
                <th className="px-5 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {isLoading ? (
                <tr><td colSpan={5} className="px-5 py-8 text-center text-gray-400">
                  <Loader2 className="w-5 h-5 animate-spin mx-auto" />
                </td></tr>
              ) : !producciones?.length ? (
                <tr><td colSpan={5} className="px-5 py-8 text-center text-gray-400">
                  No hay producciones registradas hoy
                </td></tr>
              ) : producciones.map((p) => (
                <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-3 font-medium text-gray-900">{p.productoNombre}</td>
                  <td className="px-5 py-3 text-right font-semibold">{p.cantidadProducida} {p.unidadMedida}</td>
                  <td className="px-5 py-3 text-center">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${ESTADO_BADGE[p.estado] ?? 'bg-gray-100 text-gray-600'}`}>
                      {p.estado}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    {p.codigoLote
                      ? <span className="font-mono text-xs bg-brand-50 text-brand-700 border border-brand-100 px-2 py-0.5 rounded">{p.codigoLote}</span>
                      : p.codigoLoteSugerido
                      ? <span className="text-xs text-gray-400 italic">Previsto: {p.codigoLoteSugerido}</span>
                      : <span className="text-gray-300">—</span>
                    }
                  </td>
                  <td className="px-5 py-3 text-right flex justify-end gap-2">
                    {(p.estado === 'Planificada' || p.estado === 'EnCurso') && (
                      <>
                        <button
                          onClick={() => finalizarMutation.mutate(p.id)}
                          disabled={finalizarMutation.isPending}
                          className="flex items-center gap-1 text-xs text-green-600 hover:text-green-800 font-medium transition-colors"
                        >
                          <CheckCircle className="w-4 h-4" />
                          Finalizar
                        </button>
                        <button
                          onClick={() => cancelarMutation.mutate(p.id)}
                          disabled={cancelarMutation.isPending}
                          className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700 font-medium transition-colors"
                        >
                          <XCircle className="w-4 h-4" />
                          Cancelar
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Form modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="font-semibold text-gray-900">Registrar producción</h2>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Producto *</label>
                <select
                  value={form.productoId}
                  onChange={(e) => setForm({ ...form, productoId: parseInt(e.target.value) })}
                  required
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                >
                  <option value={0}>— Selecciona producto —</option>
                  {productos?.map((p) => (
                    <option key={p.id} value={p.id}>{p.nombre} ({p.codigo})</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Fecha de producción *</label>
                  <input
                    type="date"
                    value={form.fechaProduccion}
                    onChange={(e) => handleFechaChange(e.target.value)}
                    required
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    <Hash className="w-3 h-3 inline mr-1" />
                    Código de lote *
                  </label>
                  <input
                    type="text"
                    value={form.codigoLoteSugerido}
                    onChange={(e) => setForm({ ...form, codigoLoteSugerido: e.target.value })}
                    required
                    placeholder="ddMMyyyy"
                    className="w-full border border-brand-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                  <p className="text-xs text-gray-400 mt-0.5">Autogenerado — puedes modificarlo</p>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Cantidad producida *</label>
                <input
                  type="number"
                  min="0.001"
                  step="0.001"
                  value={form.cantidadProducida}
                  onChange={(e) => setForm({ ...form, cantidadProducida: parseFloat(e.target.value) || 0 })}
                  required
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Notas</label>
                <textarea
                  value={form.notas}
                  onChange={(e) => setForm({ ...form, notas: e.target.value })}
                  rows={2}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
                />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:text-gray-900 transition-colors">
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={createMutation.isPending}
                  className="flex items-center gap-2 bg-brand-500 hover:bg-brand-600 disabled:opacity-60 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
                >
                  {createMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                  Registrar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
