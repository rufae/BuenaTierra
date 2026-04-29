import { Fragment, useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../lib/api'
import type { AlbaranResumen, AlbaranDetalle, CreateAlbaranDto, Cliente, Producto, SerieFacturacion } from '../types'
import { Plus, FileText, X, Loader2, Truck, ChevronDown, ChevronUp, Download, Package, Search } from 'lucide-react'
import toast from 'react-hot-toast'
import { fmtDate } from '../lib/dates'

const ESTADO_COLOR: Record<string, string> = {
  Pendiente: 'bg-amber-50 text-amber-700 border border-amber-200',
  EnReparto: 'bg-orange-50 text-orange-700 border border-orange-200',
  Entregado: 'bg-green-50 text-green-700 border border-green-200',
  Facturado: 'bg-blue-50 text-blue-700 border border-blue-200',
  Cancelado: 'bg-red-50 text-red-700 border border-red-200',
}

interface ItemForm { productoId: number; cantidad: number }

export default function Albaranes() {
  const qc = useQueryClient()

  const [showForm, setShowForm] = useState(false)
  const [detailOpen, setDetailOpen] = useState<number | null>(null)
  const [showConvertir, setShowConvertir] = useState<number | null>(null)
  const [serieConvertir, setSerieConvertir] = useState('')
  const [esSimplificada, setEsSimplificada] = useState(false)
  const [pickingOpen, setPickingOpen] = useState<number | null>(null)

  const [clienteId, setClienteId] = useState('')
  const [notas, setNotas] = useState('')
  const [items, setItems] = useState<ItemForm[]>([{ productoId: 0, cantidad: 1 }])

  const { data: albaranes, isLoading } = useQuery({
    queryKey: ['albaranes'],
    queryFn: async () => {
      const res = await api.get<{ data: AlbaranResumen[] }>('/albaranes')
      return res.data.data
    },
  })

  const { data: detalle } = useQuery({
    queryKey: ['albaran', detailOpen],
    queryFn: async () => {
      const res = await api.get<{ data: AlbaranDetalle }>(`/albaranes/${detailOpen}`)
      return res.data.data
    },
    enabled: detailOpen !== null,
  })

  const { data: pickingDetalle, isFetching: pickingLoading } = useQuery({
    queryKey: ['albaran-picking', pickingOpen],
    queryFn: async () => {
      const res = await api.get<{ data: AlbaranDetalle }>(`/albaranes/${pickingOpen}`)
      return res.data.data
    },
    enabled: pickingOpen !== null,
    staleTime: 30_000,
  })

  const { data: clientes } = useQuery({
    queryKey: ['clientes'],
    queryFn: async () => (await api.get<{ data: Cliente[] }>('/clientes')).data.data,
  })

  const { data: productos } = useQuery({
    queryKey: ['productos'],
    queryFn: async () => (await api.get<{ data: Producto[] }>('/productos')).data.data,
  })

  const { data: series } = useQuery({
    queryKey: ['series'],
    queryFn: async () => (await api.get<{ data: SerieFacturacion[] }>('/series')).data.data,
  })

  // ── Search & Filter ────────────────────────────────────────────────────
  const [searchTerm, setSearchTerm] = useState('')
  const [estadoFilter, setEstadoFilter] = useState<string>('')

  const filteredAlbaranes = useMemo(() => {
    if (!albaranes) return []
    let result = [...albaranes]
    if (estadoFilter) {
      result = result.filter(a => a.estado === estadoFilter)
    }
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase().trim()
      result = result.filter(a => {
        const num = (a.numeroAlbaran ?? '').toLowerCase()
        const cli = (a.clienteNombre ?? '').toLowerCase()
        const fecha = fmtDate(a.fecha)?.toLowerCase() ?? ''
        return num.includes(q) || cli.includes(q) || fecha.includes(q)
      })
    }
    return result
  }, [albaranes, searchTerm, estadoFilter])

  const crearMutation = useMutation({
    mutationFn: (dto: CreateAlbaranDto) => api.post('/albaranes/crear', dto),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['albaranes'] })
      qc.invalidateQueries({ queryKey: ['stock-todos'] })
      toast.success('Albarán creado con lotes FIFO asignados')
      resetForm()
    },
    onError: (e: any) => toast.error(e.response?.data?.errors?.[0] ?? 'Error al crear albarán'),
  })

  const entregarMutation = useMutation({
    mutationFn: (id: number) => api.post(`/albaranes/${id}/entregar`, {}),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['albaranes'] }); toast.success('Albarán entregado') },
    onError: () => toast.error('Error al marcar como entregado'),
  })

  const enRepartoMutation = useMutation({
    mutationFn: (id: number) => api.post(`/albaranes/${id}/en-reparto`, {}),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['albaranes'] }); toast.success('Albarán en reparto') },
    onError: () => toast.error('Error al actualizar estado'),
  })

  const cancelarMutation = useMutation({
    mutationFn: (id: number) => api.post(`/albaranes/${id}/cancelar`, {}),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['albaranes'] }); toast.success('Albarán cancelado') },
    onError: () => toast.error('Error al cancelar'),
  })

  const convertirMutation = useMutation({
    mutationFn: ({ id, serieId, esSimplificada }: { id: number; serieId: number; esSimplificada: boolean }) =>
      api.post(`/albaranes/${id}/convertir-factura`, { serieId, esSimplificada }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['albaranes'] })
      qc.invalidateQueries({ queryKey: ['facturas'] })
      const num = res.data?.data?.numeroFactura ?? ''
      toast.success(`Factura ${num} generada correctamente`)
      setShowConvertir(null)
    },
    onError: (e: any) => toast.error(e.response?.data?.errors?.[0] ?? 'Error al convertir'),
  })

  function resetForm() { setShowForm(false); setClienteId(''); setNotas(''); setItems([{ productoId: 0, cantidad: 1 }]) }

  async function descargarPdf(id: number, numero: string) {
    try {
      const res = await api.get(`/albaranes/${id}/pdf`, { responseType: 'blob' })
      const url = URL.createObjectURL(new Blob([res.data as BlobPart], { type: 'application/pdf' }))
      const a = document.createElement('a')
      a.href = url
      a.download = `Albaran_${numero}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      toast.error('Error al descargar el PDF del albarán')
    }
  }

  function addItem() { setItems(prev => [...prev, { productoId: 0, cantidad: 1 }]) }
  function removeItem(i: number) { setItems(prev => prev.filter((_, idx) => idx !== i)) }
  function updateItem(i: number, field: keyof ItemForm, val: any) {
    setItems(prev => prev.map((item, idx) => idx === i ? { ...item, [field]: val } : item))
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!clienteId) { toast.error('Selecciona un cliente'); return }
    if (items.some(it => !it.productoId || it.cantidad <= 0)) { toast.error('Completa todos los items'); return }
    crearMutation.mutate({ clienteId: +clienteId, notas, items: items.map(it => ({ productoId: it.productoId, cantidad: it.cantidad })) })
  }

  const total = (albaranes ?? []).reduce((s, a) => s + a.total, 0)
  const pendientes = (albaranes ?? []).filter(a => a.estado === 'Pendiente').length

  return (
    <div className="page-shell space-y-5">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Albaranes</h1>
          <p className="text-sm text-gray-500 mt-0.5">Notas de entrega con asignación FIFO automática de lotes</p>
        </div>
        <button onClick={() => setShowForm(true)} className="flex items-center gap-2 px-4 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-700">
          <Plus className="w-4 h-4" />Nuevo albarán
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: 'Total albaranes', value: (albaranes ?? []).length, fmt: false },
          { label: 'Pendientes de entrega', value: pendientes, fmt: false },
          { label: 'Importe total', value: total, fmt: true },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs text-gray-500">{s.label}</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">
              {s.fmt ? `${s.value.toFixed(2)} €` : s.value}
            </p>
          </div>
        ))}
      </div>

      {/* Lista */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {/* Search & Filter Bar */}
        <div className="px-4 py-3 border-b border-gray-100 flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="Buscar por nº albarán, cliente o fecha…"
              className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
            />
          </div>
          <select
            value={estadoFilter}
            onChange={e => setEstadoFilter(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            <option value="">Todos los estados</option>
            <option value="Pendiente">Pendiente</option>
            <option value="EnReparto">En reparto</option>
            <option value="Entregado">Entregado</option>
            <option value="Facturado">Facturado</option>
            <option value="Cancelado">Cancelado</option>
          </select>
          {(searchTerm || estadoFilter) && (
            <button onClick={() => { setSearchTerm(''); setEstadoFilter('') }} className="text-xs text-gray-500 hover:text-gray-700">
              Limpiar filtros
            </button>
          )}
          <span className="text-xs text-gray-400">{filteredAlbaranes.length} de {(albaranes ?? []).length}</span>
        </div>
        <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {['Número', 'Fecha', 'Estado', 'Cliente', 'Total', 'Acciones'].map(h => (
                <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {isLoading
              ? <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">Cargando albaranes…</td></tr>
              : filteredAlbaranes.length === 0
              ? <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">{(albaranes ?? []).length ? 'Sin resultados para el filtro actual' : 'No hay albaranes. Crea el primero.'}</td></tr>
              : filteredAlbaranes.map(a => (
                <Fragment key={a.id}>
                  <tr className="hover:bg-gray-50/50">
                    <td className="px-4 py-3 font-mono text-xs font-semibold text-gray-900">{a.numeroAlbaran}</td>
                    <td className="px-4 py-3 text-gray-600">{fmtDate(a.fecha)}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-1 rounded-full font-medium ${ESTADO_COLOR[a.estado] ?? 'bg-gray-100 text-gray-600'}`}>
                        {a.estado}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-700">{a.clienteNombre}</td>
                    <td className="px-4 py-3 font-bold text-gray-900">{a.total.toFixed(2)} €</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <button onClick={() => setDetailOpen(detailOpen === a.id ? null : a.id)} className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1">
                          {detailOpen === a.id ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />} Ver
                        </button>
                        <button
                          onClick={() => descargarPdf(a.id, a.numeroAlbaran)}
                          title="Descargar PDF del albarán"
                          className="text-xs text-gray-600 hover:text-gray-800 flex items-center gap-1">
                          <Download className="w-3 h-3" /> PDF
                        </button>
                        <button
                          onClick={() => setPickingOpen(a.id)}
                          title="Ver instrucción de picking (lotes a preparar)"
                          className="text-xs text-purple-600 hover:text-purple-800 flex items-center gap-1">
                          <Package className="w-3 h-3" /> Picking
                        </button>
                        {a.estado === 'Pendiente' && (
                          <button onClick={() => enRepartoMutation.mutate(a.id)} className="text-xs text-orange-600 hover:text-orange-800 flex items-center gap-1">
                            <Truck className="w-3 h-3" /> En reparto
                          </button>
                        )}
                        {(a.estado === 'Pendiente' || a.estado === 'EnReparto') && (
                          <button onClick={() => entregarMutation.mutate(a.id)} className="text-xs text-green-600 hover:text-green-800 flex items-center gap-1">
                            <Truck className="w-3 h-3" /> Entregar
                          </button>
                        )}
                        {a.estado !== 'Facturado' && a.estado !== 'Cancelado' && a.estado !== 'Entregado' && (
                          <button onClick={() => cancelarMutation.mutate(a.id)} className="text-xs text-red-500 hover:text-red-700 flex items-center gap-1">
                            <X className="w-3 h-3" /> Cancelar
                          </button>
                        )}
                        {a.estado !== 'Facturado' && a.estado !== 'Cancelado' && (
                          a.noRealizarFacturas ? (
                            <span
                              title="Este cliente no permite la generación de facturas"
                              className="text-xs text-gray-300 flex items-center gap-1 cursor-not-allowed select-none line-through">
                              <FileText className="w-3 h-3" /> → Factura
                            </span>
                          ) : (
                            <button onClick={() => { setShowConvertir(a.id); setSerieConvertir('') }} className="text-xs text-brand-600 hover:text-brand-800 flex items-center gap-1">
                              <FileText className="w-3 h-3" /> → Factura
                            </button>
                          )
                        )}
                      </div>
                    </td>
                  </tr>
                  {detailOpen === a.id && detalle && (
                    <tr key={`d-${a.id}`}>
                      <td colSpan={6} className="px-4 py-3 bg-blue-50/30">
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="text-gray-500">
                                <th className="text-left pb-1 pr-4">Producto</th>
                                <th className="text-left pb-1 pr-4">Lote</th>
                                <th className="text-left pb-1 pr-4">F. Fabricación</th>
                                <th className="text-left pb-1 pr-4">F. Caducidad</th>
                                <th className="text-right pb-1 pr-4">Cant.</th>
                                <th className="text-right pb-1 pr-4">Precio</th>
                                <th className="text-right pb-1">Total</th>
                              </tr>
                            </thead>
                            <tbody>
                              {(detalle.lineas ?? []).map((l, i) => (
                                <tr key={`${l.productoId}-${l.codigoLote ?? 'nolote'}-${i}`} className="border-t border-blue-100">
                                  <td className="py-1 pr-4 font-medium">{l.productoNombre}</td>
                                  <td className="py-1 pr-4 font-mono">{l.codigoLote ?? '—'}</td>
                                  <td className="py-1 pr-4">{fmtDate(l.fechaFabricacion)}</td>
                                  <td className="py-1 pr-4">{fmtDate(l.fechaCaducidad)}</td>
                                  <td className="py-1 pr-4 text-right">{l.cantidad}</td>
                                  <td className="py-1 pr-4 text-right">{l.precioUnitario.toFixed(4)} €</td>
                                  <td className="py-1 text-right font-bold">{(l.subtotal + l.ivaImporte).toFixed(2)} €</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          <div className="flex justify-end gap-6 mt-2 pt-2 border-t border-blue-200 text-xs">
                            <span>Base: <b>{detalle.subtotal.toFixed(2)} €</b></span>
                            <span>IVA: <b>{detalle.ivaTotal.toFixed(2)} €</b></span>
                            <span className="font-bold text-brand-700">TOTAL: {detalle.total.toFixed(2)} €</span>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
          </tbody>
        </table>
        </div>
      </div>

      {/* Modal: Nuevo albarán */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-start sm:items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-xl max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-base font-bold text-gray-900">Nuevo albarán</h2>
                <button onClick={resetForm}><X className="w-5 h-5 text-gray-400 hover:text-gray-600" /></button>
              </div>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Cliente *</label>
                  <select value={clienteId} onChange={e => setClienteId(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-500 focus:border-transparent">
                    <option value="">Seleccionar cliente…</option>
                    {(clientes ?? []).map(c => <option key={c.id} value={c.id}>{c.nombre}{c.nif ? ` — ${c.nif}` : ''}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Notas</label>
                  <input value={notas} onChange={e => setNotas(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                    placeholder="Notas opcionales…" />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-medium text-gray-700">Artículos</label>
                    <button type="button" onClick={addItem} className="text-xs text-brand-600 hover:text-brand-700 font-medium">+ Añadir línea</button>
                  </div>
                  <div className="space-y-2">
                    {items.map((item, i) => (
                      <div key={`${item.productoId || 'nuevo'}-${i}`} className="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto] gap-2 items-center">
                        <select value={item.productoId} onChange={e => updateItem(i, 'productoId', +e.target.value)}
                          className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-500 focus:border-transparent">
                          <option value={0}>Seleccionar…</option>
                          {(productos ?? []).map(p => <option key={p.id} value={p.id}>{p.nombre} ({p.precioVenta.toFixed(2)} €)</option>)}
                        </select>
                        <input type="number" min="1" step="1" value={item.cantidad} onFocus={e => e.currentTarget.select()} onChange={e => updateItem(i, 'cantidad', parseInt(e.target.value || '0', 10))}
                          className="w-20 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                          placeholder="Cant." />
                        {items.length > 1 && (
                          <button type="button" onClick={() => removeItem(i)} className="text-red-400 hover:text-red-600"><X className="w-4 h-4" /></button>
                        )}
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-gray-400 mt-2">Los lotes se asignarán automáticamente por FIFO al confirmar</p>
                </div>

                <div className="flex justify-end gap-3 pt-2">
                  <button type="button" onClick={resetForm} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900">Cancelar</button>
                  <button type="submit" disabled={crearMutation.isPending}
                    className="flex items-center gap-2 px-5 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium disabled:opacity-50 hover:bg-brand-700">
                    {crearMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                    Crear albarán
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Instrucción de picking */}
      {pickingOpen !== null && (
        <div className="fixed inset-0 bg-black/40 flex items-start sm:items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
            <div className="p-5 border-b border-gray-100">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Package className="w-5 h-5 text-purple-600" />
                  <div>
                    <h2 className="text-base font-bold text-gray-900">Instrucción de picking</h2>
                    {pickingDetalle && (
                      <p className="text-xs text-gray-500 mt-0.5">
                        {pickingDetalle.numeroAlbaran} — {pickingDetalle.cliente.nombre} — {pickingDetalle.fecha}
                      </p>
                    )}
                  </div>
                </div>
                <button onClick={() => setPickingOpen(null)}>
                  <X className="w-5 h-5 text-gray-400 hover:text-gray-600" />
                </button>
              </div>
            </div>
            <div className="overflow-y-auto flex-1 p-5">
              {pickingLoading && (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-6 h-6 animate-spin text-purple-500" />
                </div>
              )}
              {!pickingLoading && pickingDetalle && (() => {
                const grupos = Object.entries(
                  (pickingDetalle.lineas ?? []).reduce<Record<string, typeof pickingDetalle.lineas>>((acc, l) => {
                    const k = l.productoNombre; if (!acc[k]) acc[k] = []; acc[k].push(l); return acc
                  }, {})
                )
                return (
                  <div className="space-y-3">
                    {grupos.map(([producto, lineas]) => {
                      const total = lineas.reduce((s, l) => s + l.cantidad, 0)
                      return (
                        <div key={producto} className="border border-gray-200 rounded-xl overflow-hidden">
                          <div className="flex items-center justify-between bg-purple-50 px-4 py-2 border-b border-purple-100">
                            <div className="flex items-center gap-2">
                              <Package className="w-4 h-4 text-purple-500" />
                              <span className="font-semibold text-sm text-gray-900">{producto}</span>
                            </div>
                            <span className="text-xs font-bold bg-purple-600 text-white px-2.5 py-0.5 rounded-full">
                              {total} uds
                            </span>
                          </div>
                          <table className="w-full text-xs">
                            <thead className="bg-gray-50">
                              <tr className="text-gray-500 text-left">
                                <th className="px-4 py-2 font-medium">Lote</th>
                                <th className="px-4 py-2 font-medium">F. Fabricación</th>
                                <th className="px-4 py-2 font-medium">F. Caducidad</th>
                                <th className="px-4 py-2 font-medium text-right">Cantidad</th>
                              </tr>
                            </thead>
                            <tbody>
                              {lineas.map((l, i) => (
                                <tr key={`${l.productoId}-${l.codigoLote ?? 'nolote'}-${i}`} className="border-t border-gray-100 hover:bg-gray-50">
                                  <td className="px-4 py-2 font-mono font-semibold text-gray-800">{l.codigoLote ?? '—'}</td>
                                  <td className="px-4 py-2 text-gray-600">{fmtDate(l.fechaFabricacion) ?? '—'}</td>
                                  <td className="px-4 py-2 text-gray-600">{fmtDate(l.fechaCaducidad) ?? '—'}</td>
                                  <td className="px-4 py-2 text-right font-bold text-purple-700">{l.cantidad} uds</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )
                    })}
                  </div>
                )
              })()}
            </div>
            <div className="flex justify-end p-4 border-t border-gray-100">
              <button
                onClick={() => setPickingOpen(null)}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 border border-gray-200 rounded-lg">
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Convertir a factura */}
      {showConvertir !== null && (
        <div className="fixed inset-0 bg-black/40 flex items-start sm:items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <h2 className="text-base font-bold text-gray-900 mb-4">Convertir albarán a factura</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Serie de facturación *</label>
                <select value={serieConvertir} onChange={e => setSerieConvertir(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-500 focus:border-transparent">
                  <option value="">Seleccionar serie…</option>
                  {(series ?? []).filter(s => s.activa).map(s => <option key={s.id} value={s.id}>{s.codigo} — {s.descripcion}</option>)}
                </select>
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                <input type="checkbox" checked={esSimplificada} onChange={e => setEsSimplificada(e.target.checked)} className="rounded" />
                Factura simplificada (sin datos cliente)
              </label>
            </div>
            <div className="flex justify-end gap-3 mt-5">
              <button onClick={() => setShowConvertir(null)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900">Cancelar</button>
              <button
                disabled={!serieConvertir || convertirMutation.isPending}
                onClick={() => convertirMutation.mutate({ id: showConvertir!, serieId: +serieConvertir, esSimplificada })}
                className="flex items-center gap-2 px-5 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium disabled:opacity-40 hover:bg-brand-700">
                {convertirMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                Generar factura
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
