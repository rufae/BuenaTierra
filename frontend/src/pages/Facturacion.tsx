import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../store/authStore'
import api from '../lib/api'
import type { Cliente, Producto, SerieFacturacion, Factura } from '../types'
import { Plus, Trash2, Loader2, X, FileText, Eye, Download, Send, CheckCircle2, Ban, ArrowRight, AlertTriangle, FileSpreadsheet } from 'lucide-react'
import toast from 'react-hot-toast'
import { fmtDate } from '../lib/dates'

// Helper: descarga un blob del API (necesita token de autorización)
async function downloadBlob(url: string, filename: string) {
  try {
    const res = await api.get(url, { responseType: 'blob' })
    const blobUrl = window.URL.createObjectURL(new Blob([res.data]))
    const link = document.createElement('a')
    link.href = blobUrl
    link.setAttribute('download', filename)
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.URL.revokeObjectURL(blobUrl)
  } catch {
    toast.error('Error al descargar el archivo')
  }
}

const ESTADO_COLOR: Record<string, string> = {
  Borrador: 'bg-amber-50 text-amber-700',
  Emitida: 'bg-blue-50 text-blue-700',
  Enviada: 'bg-purple-50 text-purple-700',
  Cobrada: 'bg-green-50 text-green-700',
  Anulada: 'bg-red-50 text-red-700',
}

/** Comprueba si una factura está vencida */
function isVencida(f: Factura): boolean {
  if (f.estado === 'Cobrada' || f.estado === 'Anulada') return false
  if (!f.fechaVencimiento) return false
  return new Date(f.fechaVencimiento) < new Date()
}

/** Extrae mensaje descriptivo de error 422 (stock insuficiente) */
function extractStockError(err: unknown): string {
  const resp = (err as { response?: { status?: number; data?: { message?: string; detail?: string } } })?.response
  if (resp?.status === 422) {
    return resp.data?.message ?? resp.data?.detail ?? 'Stock insuficiente para completar la operación'
  }
  return resp?.data?.message ?? 'Error al crear factura'
}

interface FifoPreview {
  productoId: number
  productoNombre: string
  asignaciones: { loteId: number; codigoLote: string; cantidad: number; fechaFabricacion: string; fechaCaducidad: string | null }[]
}

interface LineaItem {
  productoId: number
  productoNombre: string
  cantidad: number
  precioUnitario?: number
  descuento: number
}

interface CrearFacturaDto {
  empresaId: number
  clienteId: number
  serieId: number
  esSimplificada: boolean
  notas: string
  items: { productoId: number; cantidad: number; descuento: number }[]
}

interface FacturaCreada {
  facturaId: number
  numeroFactura: string
  total: number
}

export default function Facturacion() {
  const { user } = useAuth()
  const qc = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [viewingId, setViewingId] = useState<number | null>(null)

  // Form state
  const [clienteId, setClienteId] = useState(0)
  const [serieId, setSerieId] = useState(0)
  const [esSimplificada, setEsSimplificada] = useState(false)
  const [notas, setNotas] = useState('')
  const [lineas, setLineas] = useState<LineaItem[]>([])
  const [productoSel, setProductoSel] = useState(0)
  const [cantidadSel, setCantidadSel] = useState(1)
  const [fifoPreviews, setFifoPreviews] = useState<FifoPreview[]>([])

  const { data: facturas, isLoading } = useQuery({
    queryKey: ['facturas', user?.empresaId],
    queryFn: async () => {
      const res = await api.get<{ data: Factura[] }>('/facturas')
      return res.data.data
    },
  })

  const { data: clientes } = useQuery({
    queryKey: ['clientes', user?.empresaId],
    queryFn: async () => {
      const res = await api.get<{ data: Cliente[] }>('/clientes')
      return res.data.data
    },
  })

  const { data: productos } = useQuery({
    queryKey: ['productos', user?.empresaId],
    queryFn: async () => {
      const res = await api.get<{ data: Producto[] }>('/productos')
      return res.data.data
    },
  })

  const { data: series } = useQuery({
    queryKey: ['series', user?.empresaId],
    queryFn: async () => {
      const res = await api.get<{ data: SerieFacturacion[] }>('/series')
      return res.data.data
    },
  })

  const { data: facturaDetalle } = useQuery({
    queryKey: ['factura-detalle', viewingId],
    queryFn: async () => {
      const res = await api.get<{ data: Factura }>(`/facturas/${viewingId}`)
      return res.data.data
    },
    enabled: viewingId !== null,
  })

  const createMutation = useMutation({
    mutationFn: (dto: CrearFacturaDto) =>
      api.post<{ data: FacturaCreada }>('/facturas/crear', dto),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['facturas'] })
      qc.invalidateQueries({ queryKey: ['stock'] })
      toast.success(`Factura ${res.data.data.numeroFactura} creada — ${res.data.data.total.toFixed(2)} €`)
      closeForm()
    },
    onError: (err: unknown) => {
      const msg = extractStockError(err)
      toast.error(msg, { duration: 6000, icon: '⚠️' })
    },
  })

  const emitirMutation = useMutation({
    mutationFn: (id: number) => api.post(`/facturas/${id}/emitir`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['facturas'] }); qc.invalidateQueries({ queryKey: ['factura-detalle'] }); toast.success('Factura emitida') },
    onError: () => toast.error('Error al emitir factura'),
  })

  const enviarMutation = useMutation({
    mutationFn: (id: number) => api.post(`/facturas/${id}/enviar`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['facturas'] }); qc.invalidateQueries({ queryKey: ['factura-detalle'] }); toast.success('Factura marcada como enviada') },
    onError: () => toast.error('Error al marcar como enviada'),
  })

  const cobrarMutation = useMutation({
    mutationFn: (id: number) => api.post(`/facturas/${id}/cobrar`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['facturas'] }); qc.invalidateQueries({ queryKey: ['factura-detalle'] }); toast.success('Factura cobrada') },
    onError: () => toast.error('Error al cobrar factura'),
  })

  const anularMutation = useMutation({
    mutationFn: (id: number) => api.post(`/facturas/${id}/anular`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['facturas'] }); qc.invalidateQueries({ queryKey: ['factura-detalle'] }); toast.success('Factura anulada') },
    onError: () => toast.error('Error al anular factura'),
  })

  function addLinea() {
    if (!productoSel || cantidadSel <= 0) return toast.error('Selecciona producto y cantidad válida')
    const prod = productos?.find((p) => p.id === productoSel)
    if (!prod) return
    const existing = lineas.findIndex((l) => l.productoId === productoSel)
    const newCantidad = existing >= 0 ? lineas[existing].cantidad + cantidadSel : cantidadSel
    if (existing >= 0) {
      const updated = [...lineas]
      updated[existing].cantidad = newCantidad
      setLineas(updated)
    } else {
      setLineas([...lineas, {
        productoId: productoSel,
        productoNombre: prod.nombre,
        cantidad: cantidadSel,
        precioUnitario: prod.precioVenta,
        descuento: 0,
      }])
    }
    // Fetch FIFO preview
    api.post<{ data: { loteId: number; codigoLote: string; cantidad: number; fechaFabricacion: string; fechaCaducidad: string | null }[] }>('/stock/simular-fifo', {
      productoId: productoSel,
      cantidad: newCantidad,
    }).then(res => {
      setFifoPreviews(prev => {
        const filtered = prev.filter(p => p.productoId !== productoSel)
        return [...filtered, { productoId: productoSel, productoNombre: prod.nombre, asignaciones: res.data.data }]
      })
    }).catch(() => {
      // Don't block — preview is optional
    })
    setProductoSel(0)
    setCantidadSel(1)
  }

  function removeLinea(idx: number) {
    const removed = lineas[idx]
    setLineas(lineas.filter((_, i) => i !== idx))
    setFifoPreviews(prev => prev.filter(p => p.productoId !== removed.productoId))
  }

  function closeForm() {
    setShowForm(false)
    setClienteId(0)
    setSerieId(0)
    setLineas([])
    setNotas('')
    setFifoPreviews([])
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!clienteId) return toast.error('Selecciona un cliente')
    if (!serieId) return toast.error('Selecciona una serie de facturación')
    if (!lineas.length) return toast.error('Añade al menos un producto')

    createMutation.mutate({
      empresaId: user!.empresaId,
      clienteId,
      serieId,
      esSimplificada,
      notas,
      items: lineas.map((l) => ({ productoId: l.productoId, cantidad: l.cantidad, descuento: l.descuento })),
    })
  }

  const totalEstimado = lineas.reduce((acc, l) => acc + (l.precioUnitario ?? 0) * l.cantidad * (1 - l.descuento / 100), 0)

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Facturación</h1>
          <p className="text-gray-500 text-sm mt-0.5">Los lotes se asignan automáticamente por FIFO</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => downloadBlob('/facturas/exportar-excel', 'facturas.xlsx')}
            className="flex items-center gap-2 border border-green-300 text-green-700 hover:bg-green-50 text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            <FileSpreadsheet className="w-4 h-4" />
            Exportar Excel
          </button>
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
            Nueva factura
          </button>
        </div>
      </div>

      {/* Facturas table */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wider">
                <th className="px-5 py-3 text-left">Número</th>
                <th className="px-5 py-3 text-left">Cliente</th>
                <th className="px-5 py-3 text-left">Fecha</th>
                <th className="px-5 py-3 text-left">Estado</th>
                <th className="px-5 py-3 text-right">Total</th>
                <th className="px-5 py-3 text-right">Ver</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {isLoading ? (
                <tr><td colSpan={6} className="px-5 py-8 text-center text-gray-400"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></td></tr>
              ) : !facturas?.length ? (
                <tr><td colSpan={6} className="px-5 py-8 text-center text-gray-400">No hay facturas todavía</td></tr>
              ) : facturas.map((f) => (
                <tr key={f.id} className={`hover:bg-gray-50 transition-colors ${isVencida(f) ? 'bg-red-50/60' : ''}`}>
                  <td className="px-5 py-3 font-mono text-xs font-semibold text-brand-700">{(f as unknown as { numeroFactura: string }).numeroFactura ?? '—'}</td>
                  <td className="px-5 py-3 font-medium text-gray-900">{(f as unknown as { cliente?: { nombre: string}; clienteNombre?: string }).cliente?.nombre ?? (f as unknown as { clienteNombre?: string }).clienteNombre ?? '—'}</td>
                  <td className="px-5 py-3 text-gray-500">{fmtDate((f as unknown as { fechaFactura: string }).fechaFactura)}</td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-1.5">
                      {(() => {
                        const estado = (f as unknown as { estado: string }).estado
                        return <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ESTADO_COLOR[estado] ?? 'bg-gray-50 text-gray-600'}`}>{estado}</span>
                      })()}
                      {isVencida(f) && (
                        <span className="flex items-center gap-0.5 text-xs text-red-600 font-medium" title="Factura vencida">
                          <AlertTriangle className="w-3.5 h-3.5" /> Vencida
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-5 py-3 text-right font-bold text-gray-900">{(f as unknown as { total: number }).total?.toFixed(2)} €</td>
                  <td className="px-5 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      {(() => {
                        const estado = (f as unknown as { estado: string }).estado
                        return (
                          <>
                            {estado === 'Borrador' && (
                              <button onClick={() => emitirMutation.mutate(f.id)} className="text-blue-500 hover:text-blue-700 transition-colors p-1 rounded" title="Emitir">
                                <ArrowRight className="w-4 h-4" />
                              </button>
                            )}
                            {estado === 'Emitida' && (
                              <>
                                <button onClick={() => enviarMutation.mutate(f.id)} className="text-purple-500 hover:text-purple-700 transition-colors p-1 rounded" title="Marcar enviada">
                                  <Send className="w-4 h-4" />
                                </button>
                                <button onClick={() => cobrarMutation.mutate(f.id)} className="text-green-500 hover:text-green-700 transition-colors p-1 rounded" title="Cobrar">
                                  <CheckCircle2 className="w-4 h-4" />
                                </button>
                              </>
                            )}
                            {estado === 'Enviada' && (
                              <button onClick={() => cobrarMutation.mutate(f.id)} className="text-green-500 hover:text-green-700 transition-colors p-1 rounded" title="Cobrar">
                                <CheckCircle2 className="w-4 h-4" />
                              </button>
                            )}
                            {estado !== 'Anulada' && estado !== 'Cobrada' && (
                              <button onClick={() => anularMutation.mutate(f.id)} className="text-red-400 hover:text-red-600 transition-colors p-1 rounded" title="Anular">
                                <Ban className="w-4 h-4" />
                              </button>
                            )}
                          </>
                        )
                      })()}
                      <button
                        onClick={() => setViewingId(f.id)}
                        className="text-gray-400 hover:text-brand-600 transition-colors p-1 rounded"
                        title="Ver detalle"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => downloadBlob(`/facturas/${f.id}/pdf`, `factura-${(f as unknown as {numeroFactura:string}).numeroFactura ?? f.id}.pdf`)}
                        className="text-gray-400 hover:text-red-600 transition-colors p-1 rounded"
                        title="Descargar PDF"
                      >
                        <FileText className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => downloadBlob(`/facturas/${f.id}/excel`, `factura-${(f as unknown as {numeroFactura:string}).numeroFactura ?? f.id}.xlsx`)}
                        className="text-gray-400 hover:text-green-600 transition-colors p-1 rounded"
                        title="Descargar Excel"
                      >
                        <Download className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create factura modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl my-4">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-brand-600" />
                <h2 className="font-semibold text-gray-900">Nueva factura — FIFO automático</h2>
              </div>
              <button onClick={closeForm} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleSubmit} className="px-6 py-5 space-y-5">
              {/* Client + series */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Cliente *</label>
                  <select value={clienteId} onChange={(e) => setClienteId(parseInt(e.target.value))} required className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
                    <option value={0}>— Selecciona —</option>
                    {clientes?.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Serie *</label>
                  <select value={serieId} onChange={(e) => setSerieId(parseInt(e.target.value))} required className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
                    <option value={0}>— Selecciona —</option>
                    {series?.map((s) => <option key={s.id} value={s.id}>{s.codigo} — {s.descripcion}</option>)}
                  </select>
                </div>
              </div>

              {/* Add producto line */}
              <div className="bg-gray-50 rounded-xl p-4 space-y-3">
                <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Añadir producto</p>
                <div className="flex gap-3">
                  <select value={productoSel} onChange={(e) => setProductoSel(parseInt(e.target.value))} className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
                    <option value={0}>— Selecciona producto —</option>
                    {productos?.map((p) => <option key={p.id} value={p.id}>{p.nombre} — {p.precioVenta.toFixed(2)} €/{p.unidadMedida}</option>)}
                  </select>
                  <input type="number" min={0.001} step={0.001} value={cantidadSel} onChange={(e) => setCantidadSel(parseFloat(e.target.value) || 1)} className="w-24 border border-gray-300 rounded-lg px-3 py-2 text-sm text-center focus:outline-none focus:ring-2 focus:ring-brand-500" placeholder="Cant." />
                  <button type="button" onClick={addLinea} className="flex items-center gap-1 bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors">
                    <Plus className="w-4 h-4" />Añadir
                  </button>
                </div>
              </div>

              {/* Lines */}
              {lineas.length > 0 && (
                <div className="border border-gray-200 rounded-xl overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 text-xs text-gray-500 uppercase">
                        <th className="px-4 py-2 text-left">Producto</th>
                        <th className="px-4 py-2 text-right">Cant.</th>
                        <th className="px-4 py-2 text-right">Precio</th>
                        <th className="px-4 py-2 text-right">Subtotal</th>
                        <th className="px-4 py-2"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {lineas.map((l, i) => (
                        <tr key={i}>
                          <td className="px-4 py-2 font-medium text-gray-900">{l.productoNombre}</td>
                          <td className="px-4 py-2 text-right">{l.cantidad}</td>
                          <td className="px-4 py-2 text-right text-gray-600">{(l.precioUnitario ?? 0).toFixed(2)} €</td>
                          <td className="px-4 py-2 text-right font-semibold">{((l.precioUnitario ?? 0) * l.cantidad).toFixed(2)} €</td>
                          <td className="px-4 py-2 text-right">
                            <button type="button" onClick={() => removeLinea(i)} className="text-gray-300 hover:text-red-500 transition-colors"><Trash2 className="w-4 h-4" /></button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="px-4 py-3 bg-brand-50 flex justify-end items-center gap-3">
                    <span className="text-xs text-gray-500">Subtotal estimado (sin IVA):</span>
                    <span className="font-bold text-brand-700 text-lg">{totalEstimado.toFixed(2)} €</span>
                  </div>
                </div>
              )}

              {/* FIFO Preview */}
              {fifoPreviews.length > 0 && (
                <div className="mt-3 bg-blue-50 border border-blue-200 rounded-lg p-3 space-y-2">
                  <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide flex items-center gap-1.5">
                    <Eye className="w-3.5 h-3.5" /> Preview FIFO — Lotes que se asignarán
                  </p>
                  {fifoPreviews.map(fp => (
                    <div key={fp.productoId} className="text-xs text-blue-800">
                      <span className="font-medium">{fp.productoNombre}:</span>
                      {fp.asignaciones.length === 1 ? (
                        <span className="ml-1">{fp.asignaciones[0].cantidad} ud → Lote {fp.asignaciones[0].codigoLote}</span>
                      ) : (
                        <ul className="ml-4 mt-0.5 list-disc">
                          {fp.asignaciones.map((a, i) => (
                            <li key={i}>{a.cantidad} ud → Lote {a.codigoLote} ({fmtDate(a.fechaFabricacion)})</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ))}
                </div>
              )}

              <div className="flex items-center gap-3">
                <input type="checkbox" id="simpl" checked={esSimplificada} onChange={(e) => setEsSimplificada(e.target.checked)} className="rounded border-gray-300" />
                <label htmlFor="simpl" className="text-xs text-gray-600">Factura simplificada (sin datos de cliente)</label>
              </div>

              <div className="bg-brand-50 border border-brand-200 rounded-lg px-4 py-3 text-xs text-brand-700">
                <strong>FIFO automático:</strong> Los lotes se asignan automáticamente por fecha de fabricación (más antiguo primero). No se requiere intervención manual.
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={closeForm} className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:text-gray-900 transition-colors">Cancelar</button>
                <button type="submit" disabled={createMutation.isPending || !lineas.length} className="flex items-center gap-2 bg-brand-500 hover:bg-brand-600 disabled:opacity-60 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors">
                  {createMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                  Crear factura
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* View factura detail modal */}
      {viewingId !== null && facturaDetalle && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="font-semibold text-gray-900">{facturaDetalle.numeroFactura}</h2>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => downloadBlob(`/facturas/${viewingId}/pdf`, `factura-${facturaDetalle.numeroFactura}.pdf`)}
                  className="flex items-center gap-1.5 text-xs text-red-600 hover:text-red-800 border border-red-200 hover:bg-red-50 px-3 py-1.5 rounded-lg transition-colors"
                >
                  <FileText className="w-3.5 h-3.5" /> PDF
                </button>
                <button
                  onClick={() => downloadBlob(`/facturas/${viewingId}/excel`, `factura-${facturaDetalle.numeroFactura}.xlsx`)}
                  className="flex items-center gap-1.5 text-xs text-green-700 hover:text-green-900 border border-green-200 hover:bg-green-50 px-3 py-1.5 rounded-lg transition-colors"
                >
                  <Download className="w-3.5 h-3.5" /> Excel
                </button>
                <button onClick={() => setViewingId(null)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
              </div>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div><p className="text-gray-500 text-xs">Cliente</p><p className="font-semibold">{facturaDetalle.cliente.nombre}</p></div>
                <div><p className="text-gray-500 text-xs">Fecha</p><p className="font-semibold">{fmtDate(facturaDetalle.fechaFactura)}</p></div>
                <div>
                  <p className="text-gray-500 text-xs">Estado</p>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ESTADO_COLOR[facturaDetalle.estado] ?? 'bg-gray-50 text-gray-600'}`}>{facturaDetalle.estado}</span>
                </div>
              </div>

              {/* Estado transition buttons */}
              <div className="flex items-center gap-2">
                {facturaDetalle.estado === 'Borrador' && (
                  <button onClick={() => emitirMutation.mutate(facturaDetalle.id)} className="flex items-center gap-1.5 text-xs bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 px-3 py-1.5 rounded-lg transition-colors font-medium">
                    <ArrowRight className="w-3.5 h-3.5" /> Emitir
                  </button>
                )}
                {facturaDetalle.estado === 'Emitida' && (
                  <>
                    <button onClick={() => enviarMutation.mutate(facturaDetalle.id)} className="flex items-center gap-1.5 text-xs bg-purple-50 text-purple-700 hover:bg-purple-100 border border-purple-200 px-3 py-1.5 rounded-lg transition-colors font-medium">
                      <Send className="w-3.5 h-3.5" /> Enviar
                    </button>
                    <button onClick={() => cobrarMutation.mutate(facturaDetalle.id)} className="flex items-center gap-1.5 text-xs bg-green-50 text-green-700 hover:bg-green-100 border border-green-200 px-3 py-1.5 rounded-lg transition-colors font-medium">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Cobrar
                    </button>
                  </>
                )}
                {facturaDetalle.estado === 'Enviada' && (
                  <button onClick={() => cobrarMutation.mutate(facturaDetalle.id)} className="flex items-center gap-1.5 text-xs bg-green-50 text-green-700 hover:bg-green-100 border border-green-200 px-3 py-1.5 rounded-lg transition-colors font-medium">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Cobrar
                  </button>
                )}
                {facturaDetalle.estado !== 'Anulada' && facturaDetalle.estado !== 'Cobrada' && (
                  <button onClick={() => anularMutation.mutate(facturaDetalle.id)} className="flex items-center gap-1.5 text-xs bg-red-50 text-red-700 hover:bg-red-100 border border-red-200 px-3 py-1.5 rounded-lg transition-colors font-medium">
                    <Ban className="w-3.5 h-3.5" /> Anular
                  </button>
                )}
              </div>
              <table className="w-full text-sm border border-gray-100 rounded-lg overflow-hidden">
                <thead>
                  <tr className="bg-gray-50 text-xs text-gray-500 uppercase">
                    <th className="px-4 py-2 text-left">Producto</th>
                    <th className="px-4 py-2 text-left">Lote</th>
                    <th className="px-4 py-2 text-right">Cant.</th>
                    <th className="px-4 py-2 text-right">Precio</th>
                    <th className="px-4 py-2 text-right">IVA</th>
                    <th className="px-4 py-2 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {facturaDetalle.lineas.map((l, i) => (
                    <tr key={i}>
                      <td className="px-4 py-2 font-medium">{l.productoNombre}</td>
                      <td className="px-4 py-2"><span className="font-mono text-xs bg-brand-50 text-brand-700 px-1.5 py-0.5 rounded">{l.codigoLote}</span></td>
                      <td className="px-4 py-2 text-right">{l.cantidad}</td>
                      <td className="px-4 py-2 text-right">{l.precioUnitario.toFixed(2)} €</td>
                      <td className="px-4 py-2 text-right text-gray-500">{l.ivaPorcentaje}%</td>
                      <td className="px-4 py-2 text-right font-semibold">{(l.subtotal + l.ivaImporte).toFixed(2)} €</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="flex justify-end gap-8 text-sm pt-2">
                <div><p className="text-gray-500 text-xs">Base imponible</p><p className="font-semibold">{facturaDetalle.baseImponible.toFixed(2)} €</p></div>
                <div><p className="text-gray-500 text-xs">IVA</p><p className="font-semibold">{facturaDetalle.ivaTotal.toFixed(2)} €</p></div>
                <div><p className="text-gray-500 text-xs">Total</p><p className="font-bold text-brand-700 text-xl">{facturaDetalle.total.toFixed(2)} €</p></div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
