import { useState, FormEvent, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../store/authStore'
import api from '../lib/api'
import type { Producto } from '../types'
import {
  Plus, CheckCircle, XCircle, Loader2, X, Factory, Hash,
  Search, RefreshCw, Filter, FileDown, FileText,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { DateInput } from '../components/DateInput'
import * as XLSX from 'xlsx'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

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
  fechaCaducidadSugerida?: string
  notas?: string
}

interface ProduccionCreada {
  produccionId: number
  loteId: number | null
  codigoLote: string | null
}

// ddMMyyyy para una fecha dada
function loteCodigo(date: Date = new Date()): string {
  const dd = String(date.getDate()).padStart(2, '0')
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const yyyy = date.getFullYear()
  return `${dd}${mm}${yyyy}`
}

// Formatea "YYYY-MM-DD..." a "DD/MM/YYYY"
function fmtDate(s: string | null): string {
  if (!s) return '—'
  const [y, m, d] = s.split('T')[0].split('-')
  return `${d}/${m}/${y}`
}

const ESTADOS = ['Planificada', 'EnProceso', 'Finalizada', 'Cancelada']

const ESTADO_BADGE: Record<string, string> = {
  Planificada: 'bg-blue-50 text-blue-700 border border-blue-200',
  EnProceso:   'bg-amber-50 text-amber-700 border border-amber-200',
  Finalizada:  'bg-green-50 text-green-700 border border-green-200',
  Cancelada:   'bg-red-50 text-red-600 border border-red-200',
}

function mkForm(empresaId: number, usuarioId: number, todayIso: string): CrearProduccionDto {
  return { empresaId, usuarioId, productoId: 0, cantidadProducida: 0, fechaProduccion: todayIso, codigoLoteSugerido: loteCodigo(), fechaCaducidadSugerida: '', notas: '' }
}

export default function ProduccionPage() {
  const { user } = useAuth()
  const qc = useQueryClient()
  const todayIso = new Date().toISOString().split('T')[0]

  // ── Filtros ──────────────────────────────────────────────────
  const [busqueda, setBusqueda]     = useState('')
  const [estadoFiltro, setEstado]   = useState('')
  const [fechaDesde, setFechaDesde] = useState(todayIso)
  const [fechaHasta, setFechaHasta] = useState(todayIso)

  // ── Form ──────────────────────────────────────────────────
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<CrearProduccionDto>(mkForm(user!.empresaId, user!.usuarioId, todayIso))

  function handleFechaChange(isoDate: string) {
    const parts = isoDate.split('-')
    if (parts.length === 3) {
      const [yyyy, mm, dd] = parts
      setForm(f => ({ ...f, fechaProduccion: isoDate, codigoLoteSugerido: `${dd}${mm}${yyyy}` }))
    } else {
      setForm(f => ({ ...f, fechaProduccion: isoDate }))
    }
  }

  // ── Queries ───────────────────────────────────────────────────────
  const { data: producciones = [], isLoading, refetch } = useQuery<ProduccionDto[]>({
    queryKey: ['producciones', user?.empresaId, busqueda, estadoFiltro, fechaDesde, fechaHasta],
    queryFn: async () => {
      const p = new URLSearchParams()
      if (busqueda)     p.set('busqueda',   busqueda)
      if (estadoFiltro) p.set('estado',     estadoFiltro)
      if (fechaDesde)   p.set('fechaDesde', fechaDesde)
      if (fechaHasta)   p.set('fechaHasta', fechaHasta)
      const res = await api.get<{ data: ProduccionDto[] }>(`/produccion?${p}`)
      return res.data.data
    },
    refetchInterval: 30_000,
  })

  const { data: productos } = useQuery<Producto[]>({
    queryKey: ['productos', user?.empresaId],
    queryFn: async () => {
      const res = await api.get<{ data: Producto[] }>('/productos')
      return res.data.data
    },
  })

  // Contadores por estado (sobre los datos cargados)
  const countByEstado = useMemo(() => {
    const c: Record<string, number> = {}
    producciones.forEach(p => { c[p.estado] = (c[p.estado] ?? 0) + 1 })
    return c
  }, [producciones])

  // ── Mutations ───────────────────────────────────────────────────────
  const invalidar = () => qc.invalidateQueries({ queryKey: ['producciones'] })

  const createMutation = useMutation({
    mutationFn: (dto: CrearProduccionDto) => api.post<{ data: ProduccionCreada }>('/produccion', dto),
    onSuccess: (res) => {
      invalidar()
      qc.invalidateQueries({ queryKey: ['stock'] })
      const { codigoLote } = res.data.data
      toast.success(codigoLote
        ? `Producción registrada — Lote ${codigoLote}`
        : 'Producción registrada (pendiente de finalizar)')
      setShowForm(false)
      setForm(mkForm(user!.empresaId, user!.usuarioId, todayIso))
    },
    onError: () => toast.error('Error al registrar producción'),
  })

  const finalizarMutation = useMutation({
    mutationFn: (id: number) => api.post(`/produccion/${id}/finalizar`),
    onSuccess: () => {
      invalidar()
      qc.invalidateQueries({ queryKey: ['stock'] })
      toast.success('Producción finalizada. Lote y stock generados.')
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
        ?? 'Error al finalizar producción'
      toast.error(msg)
    },
  })

  const cancelarMutation = useMutation({
    mutationFn: (id: number) => api.post(`/produccion/${id}/cancelar`, { motivo: 'Cancelado por usuario' }),
    onSuccess: () => { invalidar(); toast.success('Producción cancelada') },
    onError: () => toast.error('Error al cancelar producción'),
  })

  // ── Submit ───────────────────────────────────────────────────────
  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!form.productoId)              return toast.error('Selecciona un producto')
    if (form.cantidadProducida <= 0)   return toast.error('La cantidad debe ser positiva')
    if (!form.codigoLoteSugerido.trim()) return toast.error('El código de lote no puede estar vacío')
    const payload: CrearProduccionDto = {
      ...form,
      fechaCaducidadSugerida: form.fechaCaducidadSugerida || undefined,
    }
    createMutation.mutate(payload)
  }

  const filtrosActivos = !!(busqueda || estadoFiltro || fechaDesde !== todayIso || fechaHasta !== todayIso)

  function resetFiltros() { setBusqueda(''); setEstado(''); setFechaDesde(todayIso); setFechaHasta(todayIso) }

  // ── Exports ──────────────────────────────────────────────────
  function exportExcel() {
    if (!producciones.length) return toast.error('No hay datos para exportar')
    const rows = producciones.map(p => ({
      Fecha:     fmtDate(p.fechaProduccion),
      Producto:  p.productoNombre,
      Cantidad:  p.cantidadProducida,
      Merma:     p.cantidadMerma,
      Estado:    p.estado,
      Lote:      p.codigoLote ?? p.codigoLoteSugerido ?? '—',
      Caducidad: fmtDate(p.fechaCaducidad),
      Notas:     p.notas ?? '',
    }))
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Producción')
    XLSX.writeFile(wb, `produccion_${fechaDesde}_${fechaHasta}.xlsx`)
    toast.success('Excel exportado')
  }

  function exportPDF() {
    if (!producciones.length) return toast.error('No hay datos para exportar')
    const doc = new jsPDF({ orientation: 'landscape' })
    doc.setFontSize(14)
    doc.text('Producción', 14, 14)
    doc.setFontSize(9)
    doc.setTextColor(120)
    doc.text(`Período: ${fechaDesde} — ${fechaHasta}`, 14, 21)
    autoTable(doc, {
      startY: 26,
      head: [['Fecha', 'Producto', 'Cantidad', 'Merma', 'Estado', 'Lote', 'Caducidad']],
      body: producciones.map(p => [
        fmtDate(p.fechaProduccion),
        p.productoNombre,
        `${p.cantidadProducida} ${p.unidadMedida}`,
        p.cantidadMerma > 0 ? String(p.cantidadMerma) : '—',
        p.estado,
        p.codigoLote ?? p.codigoLoteSugerido ?? '—',
        fmtDate(p.fechaCaducidad),
      ]),
      headStyles: { fillColor: [99, 102, 241] },
      alternateRowStyles: { fillColor: [248, 248, 255] },
      styles: { fontSize: 8 },
    })
    doc.save(`produccion_${fechaDesde}_${fechaHasta}.pdf`)
    toast.success('PDF exportado')
  }

  // ════════════════════════════════════════════════════════════
  return (
    <div className="p-6 max-w-7xl mx-auto space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Producción</h1>
          <p className="text-gray-500 text-sm mt-0.5">Registro de producción — lotes y stock automáticos</p>
        </div>
        <button onClick={() => setShowForm(true)}
          className="flex items-center gap-2 bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors">
          <Plus className="w-4 h-4" /> Registrar producción
        </button>
      </div>

      {/* Barra de filtros */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-3 flex flex-wrap gap-3 items-end">

        <div className="relative min-w-[190px] flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input value={busqueda} onChange={e => setBusqueda(e.target.value)}
            placeholder="Producto, lote, notas..."
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/40" />
        </div>

        <div>
          <label className="block text-xs text-gray-500 mb-1">Estado</label>
          <select value={estadoFiltro} onChange={e => setEstado(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-2 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500/40">
            <option value="">Todos</option>
            {ESTADOS.map(s => (
              <option key={s} value={s}>{s}{countByEstado[s] ? ` (${countByEstado[s]})` : ''}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs text-gray-500 mb-1">Desde</label>
          <DateInput value={fechaDesde} onChange={setFechaDesde} />
        </div>

        <div>
          <label className="block text-xs text-gray-500 mb-1">Hasta</label>
          <DateInput value={fechaHasta} onChange={setFechaHasta} />
        </div>

        <div className="flex gap-2 ml-auto">
          {filtrosActivos && (
            <button onClick={resetFiltros}
              className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-900 border border-gray-200 rounded-lg px-3 py-2 transition-colors">
              <X className="w-3.5 h-3.5" /> Limpiar
            </button>
          )}
          <button onClick={() => void refetch()}
            title="Actualizar"
            className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-brand-600 border border-gray-200 rounded-lg px-3 py-2 transition-colors">
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
          <button onClick={exportExcel}
            title="Exportar Excel"
            className="flex items-center gap-1.5 text-xs text-green-700 hover:text-green-900 border border-green-200 bg-green-50 hover:bg-green-100 rounded-lg px-3 py-2 transition-colors">
            <FileDown className="w-3.5 h-3.5" /> Excel
          </button>
          <button onClick={exportPDF}
            title="Exportar PDF"
            className="flex items-center gap-1.5 text-xs text-red-700 hover:text-red-900 border border-red-200 bg-red-50 hover:bg-red-100 rounded-lg px-3 py-2 transition-colors">
            <FileText className="w-3.5 h-3.5" /> PDF
          </button>
        </div>
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-3.5 border-b border-gray-100 flex items-center gap-2">
          <Factory className="w-4 h-4 text-brand-600" />
          <h2 className="font-semibold text-gray-900 text-sm">Producciones</h2>
          {!isLoading && (
            <span className="ml-1 text-xs text-gray-400">
              {producciones.length} registro{producciones.length !== 1 ? 's' : ''}
            </span>
          )}
          {filtrosActivos && (
            <span className="ml-1 flex items-center gap-1 text-xs text-brand-600 bg-brand-50 border border-brand-100 px-2 py-0.5 rounded-full">
              <Filter className="w-3 h-3" /> Filtros activos
            </span>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wider">
                <th className="px-4 py-3 text-left">Fecha</th>
                <th className="px-4 py-3 text-left">Producto</th>
                <th className="px-4 py-3 text-right">Cantidad</th>
                <th className="px-4 py-3 text-center">Estado</th>
                <th className="px-4 py-3 text-left">Lote</th>
                <th className="px-4 py-3 text-left">Caducidad</th>
                <th className="px-4 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {isLoading ? (
                <tr><td colSpan={7} className="px-5 py-10 text-center text-gray-400">
                  <Loader2 className="w-5 h-5 animate-spin mx-auto" />
                </td></tr>
              ) : !producciones.length ? (
                <tr><td colSpan={7} className="px-5 py-10 text-center text-gray-400">
                  No hay producciones para los filtros seleccionados
                </td></tr>
              ) : producciones.map(p => (
                <tr key={p.id} className="hover:bg-gray-50/70 transition-colors">

                  <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{fmtDate(p.fechaProduccion)}</td>

                  <td className="px-4 py-3 font-medium text-gray-900">{p.productoNombre}</td>

                  <td className="px-4 py-3 text-right font-semibold tabular-nums">
                    {p.cantidadProducida} {p.unidadMedida}
                    {p.cantidadMerma > 0 && (
                      <span className="ml-1 text-xs text-orange-500 font-normal">(-{p.cantidadMerma} merma)</span>
                    )}
                  </td>

                  <td className="px-4 py-3 text-center">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${ESTADO_BADGE[p.estado] ?? 'bg-gray-100 text-gray-600'}`}>
                      {p.estado}
                    </span>
                  </td>

                  <td className="px-4 py-3">
                    {p.codigoLote
                      ? <span className="font-mono text-xs bg-brand-50 text-brand-700 border border-brand-100 px-2 py-0.5 rounded">{p.codigoLote}</span>
                      : p.codigoLoteSugerido
                        ? <span className="text-xs text-gray-400 italic">Previsto: {p.codigoLoteSugerido}</span>
                      : <span className="text-gray-300">—</span>
                    }
                  </td>

                  <td className="px-4 py-3 whitespace-nowrap">
                    {p.fechaCaducidad
                      ? (() => {
                          const cad = new Date(p.fechaCaducidad)
                          const hoy = new Date(); hoy.setHours(0, 0, 0, 0)
                          const dias = Math.ceil((cad.getTime() - hoy.getTime()) / 86_400_000)
                          const cls = dias < 0 ? 'text-red-600 font-semibold'
                            : dias <= 3 ? 'text-orange-500 font-semibold'
                            : 'text-gray-600'
                          return <span className={cls}>
                            {fmtDate(p.fechaCaducidad)}
                            {dias < 0 && <span className="ml-1 text-xs">(caducado)</span>}
                            {dias >= 0 && dias <= 3 && <span className="ml-1 text-xs">({dias}d)</span>}
                          </span>
                        })()
                      : <span className="text-gray-300">&mdash;</span>
                    }
                  </td>

                  <td className="px-4 py-3 text-right">
                    {(p.estado === 'Planificada' || p.estado === 'EnProceso') && (
                      <div className="flex justify-end gap-3">
                        <button onClick={() => finalizarMutation.mutate(p.id)}
                          disabled={finalizarMutation.isPending}
                          className="flex items-center gap-1 text-xs text-green-600 hover:text-green-800 font-medium transition-colors disabled:opacity-50">
                          <CheckCircle className="w-4 h-4" /> Finalizar
                        </button>
                        <button onClick={() => cancelarMutation.mutate(p.id)}
                          disabled={cancelarMutation.isPending}
                          className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700 font-medium transition-colors disabled:opacity-50">
                          <XCircle className="w-4 h-4" /> Cancelar
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: Registrar producción */}
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
                <select value={form.productoId}
                  onChange={e => setForm({ ...form, productoId: parseInt(e.target.value) })}
                  required
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
                  <option value={0}>Selecciona producto...</option>
                  {productos?.map(p => (
                    <option key={p.id} value={p.id}>{p.nombre}{p.codigo ? ` (${p.codigo})` : ''}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Fecha de producción *</label>
                  <DateInput value={form.fechaProduccion} onChange={handleFechaChange} required className="w-full" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    <Hash className="w-3 h-3 inline mr-0.5" /> Código de lote *
                  </label>
                  <input type="text" value={form.codigoLoteSugerido}
                    onChange={e => setForm({ ...form, codigoLoteSugerido: e.target.value })}
                    required placeholder="ddMMyyyy"
                    className="w-full border border-brand-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-500" />
                  <p className="text-xs text-gray-400 mt-0.5">Autogenerado · modificable</p>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Fecha caducidad (opcional)</label>
                <DateInput value={form.fechaCaducidadSugerida ?? ''} onChange={v => setForm({ ...form, fechaCaducidadSugerida: v })} className="w-full" />
                <p className="text-xs text-gray-400 mt-0.5">Si se deja vacío, se calcula automáticamente según la vida útil del producto</p>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Cantidad producida *</label>
                <input type="number" min="0.001" step="0.001"
                  value={form.cantidadProducida || ''}
                  onChange={e => setForm({ ...form, cantidadProducida: e.target.value ? parseFloat(e.target.value) : 0 })}
                  required placeholder="0"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
                <p className="text-xs text-blue-600 bg-blue-50 border border-blue-100 rounded-lg px-2 py-1.5 mt-1.5">
                  Si ya existe una producción <strong>pendiente</strong> con mismo producto y lote, la cantidad se acumula en ese registro.
                </p>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Notas</label>
                <textarea value={form.notas}
                  onChange={e => setForm({ ...form, notas: e.target.value })}
                  rows={2}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none" />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowForm(false)}
                  className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:text-gray-900 transition-colors">
                  Cancelar
                </button>
                <button type="submit" disabled={createMutation.isPending}
                  className="flex items-center gap-2 bg-brand-500 hover:bg-brand-600 disabled:opacity-60 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors">
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
