import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../store/authStore'
import api from '../lib/api'
import type { Cliente, Producto, SerieFacturacion, Factura } from '../types'
import { Plus, Trash2, Loader2, X, FileText, Eye, Download, Send, CheckCircle2, ArrowRight, AlertTriangle, FileSpreadsheet, Search, Upload } from 'lucide-react'
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
  const [cantidadSel, setCantidadSel] = useState('1')
  const [fifoPreviews, setFifoPreviews] = useState<FifoPreview[]>([])
  const [showImportModal, setShowImportModal] = useState(false)
  const [importResult, setImportResult] = useState<{ importadas: number; errores: number; detalles: string[] } | null>(null)

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

  // ── Search & Filter ────────────────────────────────────────────────────
  const [searchTerm, setSearchTerm] = useState('')
  const [estadoFilter, setEstadoFilter] = useState<string>('')

  const filteredFacturas = useMemo(() => {
    if (!facturas) return []
    let result = [...facturas]
    if (estadoFilter) {
      result = result.filter(f => (f as unknown as { estado: string }).estado === estadoFilter)
    }
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase().trim()
      result = result.filter(f => {
        const ff = f as unknown as { numeroFactura?: string; clienteNombre?: string; cliente?: { nombre: string }; fechaFactura?: string }
        const num = (ff.numeroFactura ?? '').toLowerCase()
        const cli = (ff.cliente?.nombre ?? ff.clienteNombre ?? '').toLowerCase()
        const fecha = fmtDate(ff.fechaFactura)?.toLowerCase() ?? ''
        return num.includes(q) || cli.includes(q) || fecha.includes(q)
      })
    }
    return result
  }, [facturas, searchTerm, estadoFilter])

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

  const importMutation = useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData()
      fd.append('archivo', file)
      const res = await api.post<{ data: { importadas: number; errores: number; detalles: string[] }; message: string }>(
        '/facturas/importar', fd, { headers: { 'Content-Type': 'multipart/form-data' } }
      )
      return res.data
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['facturas'] })
      setImportResult(res.data)
      toast.success(res.message ?? `${res.data.importadas} facturas importadas`)
    },
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { errors?: string[] } } })?.response?.data?.errors?.[0] ?? 'Error al importar'
      toast.error(msg)
    },
  })

  function addLinea() {
    const cantidad = parseInt(cantidadSel, 10)
    if (!productoSel || !Number.isInteger(cantidad) || cantidad <= 0) return toast.error('Selecciona producto y cantidad válida')
    const prod = productos?.find((p) => p.id === productoSel)
    if (!prod) return
    const existing = lineas.findIndex((l) => l.productoId === productoSel)
    const newCantidad = existing >= 0 ? lineas[existing].cantidad + cantidad : cantidad
    if (existing >= 0) {
      const updated = [...lineas]
      updated[existing].cantidad = newCantidad
      setLineas(updated)
    } else {
      setLineas([...lineas, {
        productoId: productoSel,
        productoNombre: prod.nombre,
        cantidad,
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
    setCantidadSel('1')
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
    const clienteSel = clientes?.find(c => c.id === clienteId)
    if (clienteSel?.noRealizarFacturas) return toast.error('Este cliente tiene marcado "No realizar facturas"')
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
    <div className="page-shell space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Facturación</h1>
          <p className="text-gray-500 text-sm mt-0.5">Los lotes se asignan automáticamente por FIFO</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <button
            onClick={() => downloadBlob('/facturas/importar-plantilla', 'plantilla-importar-facturas.xlsx')}
            title="Descargar plantilla para importar facturas"
            className="flex items-center gap-2 border border-gray-300 text-gray-600 hover:bg-gray-50 text-sm font-medium px-3 py-2 rounded-lg transition-colors"
          >
            <Download className="w-4 h-4" />
            Plantilla
          </button>
          <button
            onClick={() => { setShowImportModal(true); setImportResult(null) }}
            className="flex items-center gap-2 border border-blue-300 text-blue-700 hover:bg-blue-50 text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            <Upload className="w-4 h-4" />
            Importar
          </button>
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
        {/* Search & Filter Bar */}
        <div className="px-5 py-3 border-b border-gray-100 flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="Buscar por nº factura, cliente o fecha…"
              className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
            />
          </div>
          <select
            value={estadoFilter}
            onChange={e => setEstadoFilter(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            <option value="">Todos los estados</option>
            <option value="Borrador">Borrador</option>
            <option value="Emitida">Emitida</option>
            <option value="Enviada">Enviada</option>
            <option value="Cobrada">Cobrada</option>
            <option value="Anulada">Anulada</option>
          </select>
          {(searchTerm || estadoFilter) && (
            <button onClick={() => { setSearchTerm(''); setEstadoFilter('') }} className="text-xs text-gray-500 hover:text-gray-700">
              Limpiar filtros
            </button>
          )}
          <span className="text-xs text-gray-400">{filteredFacturas.length} de {(facturas ?? []).length}</span>
        </div>
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
              ) : !filteredFacturas.length ? (
                <tr><td colSpan={6} className="px-5 py-8 text-center text-gray-400">{facturas?.length ? 'Sin resultados para el filtro actual' : 'No hay facturas todavía'}</td></tr>
              ) : filteredFacturas.map((f) => (
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
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-start sm:items-center justify-center p-4 overflow-y-auto">
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
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto] gap-3">
                  <select value={productoSel} onChange={(e) => setProductoSel(parseInt(e.target.value))} className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
                    <option value={0}>— Selecciona producto —</option>
                    {productos?.map((p) => <option key={p.id} value={p.id}>{p.nombre} — {p.precioVenta.toFixed(2)} €/{p.unidadMedida}</option>)}
                  </select>
                  <input type="text" inputMode="numeric" pattern="[0-9]*" value={cantidadSel} onFocus={(e) => e.currentTarget.select()} onChange={(e) => setCantidadSel(e.target.value.replace(/\D/g, ''))} className="w-24 border border-gray-300 rounded-lg px-3 py-2 text-sm text-center focus:outline-none focus:ring-2 focus:ring-brand-500" placeholder="Cant." />
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
              </div>
              <div className="overflow-x-auto border border-gray-100 rounded-lg">
              <table className="w-full text-sm rounded-lg overflow-hidden">
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
              </div>
              <div className="flex justify-end gap-8 text-sm pt-2">
                <div><p className="text-gray-500 text-xs">Base imponible</p><p className="font-semibold">{facturaDetalle.baseImponible.toFixed(2)} €</p></div>
                <div><p className="text-gray-500 text-xs">IVA</p><p className="font-semibold">{facturaDetalle.ivaTotal.toFixed(2)} €</p></div>
                <div><p className="text-gray-500 text-xs">Total</p><p className="font-bold text-brand-700 text-xl">{facturaDetalle.total.toFixed(2)} €</p></div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Import invoices modal */}
      {showImportModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-start sm:items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="font-semibold text-gray-900">Importar facturas históricas</h2>
              <button onClick={() => setShowImportModal(false)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6 space-y-4">
              {!importResult ? (
                <>
                  <p className="text-sm text-gray-600">
                    Selecciona un archivo <strong>.xlsx</strong> o <strong>.csv</strong> con las facturas a importar.
                    Columnas requeridas: <code className="text-xs bg-gray-100 px-1 rounded">NumeroFactura</code>, <code className="text-xs bg-gray-100 px-1 rounded">Fecha</code>, <code className="text-xs bg-gray-100 px-1 rounded">Total</code>.
                    Opcionales: <code className="text-xs bg-gray-100 px-1 rounded">ClienteNIF</code>, <code className="text-xs bg-gray-100 px-1 rounded">ClienteNombre</code>, <code className="text-xs bg-gray-100 px-1 rounded">Descripcion</code>.
                  </p>
                  <label className="flex flex-col items-center justify-center w-full border-2 border-dashed border-gray-300 rounded-xl p-8 cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors">
                    <Upload className="w-8 h-8 text-gray-400 mb-2" />
                    <span className="text-sm text-gray-600 font-medium">Haz clic para seleccionar archivo</span>
                    <span className="text-xs text-gray-400 mt-1">.xlsx o .csv</span>
                    <input
                      type="file"
                      accept=".xlsx,.xls,.csv"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0]
                        if (file) importMutation.mutate(file)
                        e.target.value = ''
                      }}
                    />
                  </label>
                  {importMutation.isPending && (
                    <div className="flex items-center gap-2 text-sm text-blue-600">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Importando…
                    </div>
                  )}
                </>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center gap-4">
                    <div className="flex-1 bg-green-50 border border-green-200 rounded-lg p-3 text-center">
                      <p className="text-2xl font-bold text-green-700">{importResult.importadas}</p>
                      <p className="text-xs text-green-600">Importadas</p>
                    </div>
                    <div className="flex-1 bg-red-50 border border-red-200 rounded-lg p-3 text-center">
                      <p className="text-2xl font-bold text-red-700">{importResult.errores}</p>
                      <p className="text-xs text-red-600">Errores</p>
                    </div>
                  </div>
                  {importResult.detalles.length > 0 && (
                    <div className="max-h-40 overflow-y-auto space-y-1">
                      {importResult.detalles.map((d, i) => (
                        <p key={i} className="text-xs text-red-600 bg-red-50 rounded px-2 py-1">{d}</p>
                      ))}
                    </div>
                  )}
                  <button
                    onClick={() => setImportResult(null)}
                    className="w-full text-sm text-blue-600 hover:text-blue-800 border border-blue-200 hover:bg-blue-50 rounded-lg py-2 transition-colors"
                  >
                    Importar otro archivo
                  </button>
                </div>
              )}
            </div>
            <div className="px-6 pb-4 flex justify-end">
              <button onClick={() => setShowImportModal(false)} className="text-sm text-gray-500 hover:text-gray-700 border border-gray-200 hover:bg-gray-50 px-4 py-2 rounded-lg transition-colors">Cerrar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
