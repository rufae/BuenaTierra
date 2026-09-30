import React, { useState, useMemo, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../lib/api'
import type { ApiResponse, PedidoResumen, PedidoDetalle, CreatePedidoDto, Cliente, ClienteCondicionEspecial, Producto, SerieFacturacion } from '../types'
import { Plus, X, Loader2, Check, ChevronDown, ChevronUp, ClipboardList, FileText, Truck, PackageCheck, MapPin, Search, Trash2, Download, Pencil, Undo2, RotateCcw } from 'lucide-react'
import toast from 'react-hot-toast'
import { fmtDate } from '../lib/dates'
import { DateInput } from '../components/DateInput'
import { EstadoBadge } from '../components/EstadoBadge'
import { formatCurrency } from '../lib/format'
import { downloadBlob, useDownloading } from '../lib/download'
import { resolvePreviewPricing, getIvaPorcentaje, getRecargoEquivalenciaPorcentaje, roundMoney, useEmpresaPrecios } from '../lib/pricing'

interface ItemForm { productoId: number; cantidad: number }

interface DevolucionLoteForm {
  loteId: number
  codigoLote: string
  cantidad: number
  maxCantidad: number
  cantidadOriginal: number
  cantidadDevuelta: number
  /** Motivo de devolución (enum del backend): decide si repone stock */
  motivo: string
  /** Para MILHOJAS / productos con unidadesPorCaja: si true la cantidad está en cajas */
  esCaja: boolean
}

interface DevolucionItemForm {
  productoId: number
  productoNombre: string
  /** Unidades por caja (p.ej. 12 para MILHOJAS). Si > 0, permite devolver por cajas o unidades. */
  unidadesPorCaja: number
  lotes: DevolucionLoteForm[]
}

export default function Pedidos() {
  const qc = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [detailOpen, setDetailOpen] = useState<number | null>(null)
  const [clienteId, setClienteId] = useState('')
  const [fechaEntrega, setFechaEntrega] = useState('')
  const [notas, setNotas] = useState('')
  const [origenVenta, setOrigenVenta] = useState<'Fabrica' | 'Furgoneta' | ''>('Furgoneta')
  const [items, setItems] = useState<ItemForm[]>([{ productoId: 0, cantidad: 1 }])

  // Modal: crear factura desde pedido
  const [showFacturaPedido, setShowFacturaPedido] = useState<number | null>(null)
  const [seriePedidoFactura, setSeriePedidoFactura] = useState('')
  const [esSimplificadaPedido, setEsSimplificadaPedido] = useState(false)

  // Devolución
  const [showDevolucion, setShowDevolucion] = useState<number | null>(null)
  const [devolucionItems, setDevolucionItems] = useState<DevolucionItemForm[]>([])
  const [destinoDevolucion, setDestinoDevolucion] = useState<'Fabrica' | 'Furgoneta'>('Fabrica')
  const [motivoTextoDevolucion, setMotivoTextoDevolucion] = useState('')

  // Edición de precios en detalle
  const [showEditPrecios, setShowEditPrecios] = useState(false)
  const [editPrecios, setEditPrecios] = useState<
    Record<string, { precioUnitario: number; descuento: number; motivo: string }>
  >({})

  // FIFO previews
  const [fifoPreviews, setFifoPreviews] = useState<Record<string, any[]>>({})
  const [fifoLoading, setFifoLoading] = useState<Record<string, boolean>>({})

  // F2: la edición de precios no debe fugarse de un pedido a otro
  useEffect(() => {
    setShowEditPrecios(false)
    setEditPrecios({})
  }, [detailOpen])

  const { data: pedidos, isLoading } = useQuery({
    queryKey: ['pedidos'],
    queryFn: async () => (await api.get<{ data: PedidoResumen[] }>('/pedidos')).data.data,
  })

  const downloadExcel = () => downloadBlob('/pedidos/exportar-excel', 'pedidos.xlsx', 'Error al exportar Excel de pedidos')

  const downloadPdf = (id: number, numero: string) =>
    downloadBlob(`/pedidos/${id}/pdf`, `Pedido_${numero}.pdf`, 'Error al generar el PDF')

  const descargando = useDownloading()

  const { data: detalle } = useQuery({
    queryKey: ['pedido', detailOpen],
    queryFn: async () => (await api.get<{ data: PedidoDetalle }>(`/pedidos/${detailOpen}`)).data.data,
    enabled: detailOpen !== null,
  })

  const { data: clientes } = useQuery({
    queryKey: ['clientes'],
    queryFn: async () => (await api.get<{ data: Cliente[] }>('/clientes')).data.data,
  })

  const { data: productos } = useQuery({
    queryKey: ['productos'],
    queryFn: async () => (await api.get<{ data: Producto[] }>('/productos')).data.data,
  })

  const selectedCliente = useMemo(
    () => (clientes ?? []).find(c => c.id === Number(clienteId)) ?? null,
    [clientes, clienteId]
  )

  const { data: clienteCondiciones } = useQuery({
    queryKey: ['cliente-condiciones-pedido', clienteId],
    queryFn: async () => (await api.get<{ data: ClienteCondicionEspecial[] }>(`/clientes/${clienteId}/condiciones`)).data.data,
    enabled: !!clienteId,
  })

  // Tabla RE de la empresa — para que el preview cuadre con el backend
  const { data: empresaPrecios } = useEmpresaPrecios()

  const { data: series } = useQuery({
    queryKey: ['series'],
    queryFn: async () => (await api.get<{ data: SerieFacturacion[] }>('/series')).data.data,
  })

  const { data: detalleDevolucion } = useQuery({
    queryKey: ['pedido-devolucion', showDevolucion],
    queryFn: async () => (await api.get<{ data: PedidoDetalle }>(`/pedidos/${showDevolucion}`)).data.data,
    enabled: showDevolucion !== null,
  })

  // ── Search & Filter ────────────────────────────────────────────────────
  const [searchTerm, setSearchTerm] = useState('')
  const [estadoFilter, setEstadoFilter] = useState<string>('')

  const filteredPedidos = useMemo(() => {
    if (!pedidos) return []
    let result = [...pedidos]
    if (estadoFilter) {
      result = result.filter(p => p.estado === estadoFilter)
    }
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase().trim()
      result = result.filter(p => {
        const num = (p.numeroPedido ?? '').toLowerCase()
        const cli = (p.clienteNombre ?? '').toLowerCase()
        const fecha = fmtDate(p.fecha)?.toLowerCase() ?? ''
        const fechaEnt = fmtDate(p.fechaEntrega)?.toLowerCase() ?? ''
        return num.includes(q) || cli.includes(q) || fecha.includes(q) || fechaEnt.includes(q)
      })
    }
    return result
  }, [pedidos, searchTerm, estadoFilter])

  const crearMutation = useMutation({
    mutationFn: (dto: CreatePedidoDto) => api.post('/pedidos/crear', dto),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pedidos'] })
      toast.success('Pedido creado')
      resetForm()
    },
    onError: (e: any) => toast.error(e.response?.data?.errors?.[0] ?? 'Error al crear pedido'),
  })

  const confirmarMutation = useMutation({
    mutationFn: (id: number) => api.post(`/pedidos/${id}/confirmar`, {}),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['pedidos'] }); toast.success('Pedido confirmado') },
    onError: () => toast.error('Error al confirmar'),
  })

  const cancelarMutation = useMutation({
    mutationFn: (id: number) => api.post(`/pedidos/${id}/cancelar`, {}),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['pedidos'] }); toast.success('Pedido cancelado') },
    onError: () => toast.error('Error al cancelar'),
  })

  const preparadoMutation = useMutation({
    mutationFn: (id: number) => api.post(`/pedidos/${id}/preparado`, {}),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['pedidos'] }); toast.success('Pedido marcado como preparado') },
    onError: () => toast.error('Error al actualizar estado'),
  })

  const enRepartoMutation = useMutation({
    mutationFn: (id: number) => api.post(`/pedidos/${id}/en-reparto`, {}),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['pedidos'] }); toast.success('Pedido en reparto') },
    onError: () => toast.error('Error al actualizar estado'),
  })

  const entregadoMutation = useMutation({
    mutationFn: (id: number) => api.post(`/pedidos/${id}/entregado`, {}),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['pedidos'] }); toast.success('Pedido entregado') },
    onError: () => toast.error('Error al actualizar estado'),
  })

  const crearAlbaranMutation = useMutation({
    mutationFn: (id: number) => api.post<ApiResponse<{ numeroAlbaran: string }>>(`/pedidos/${id}/crear-albaran`, {}),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['pedidos'] })
      qc.invalidateQueries({ queryKey: ['albaranes'] })
      const num = res.data?.data?.numeroAlbaran ?? ''
      toast.success(`Albarán ${num} creado con lotes FIFO asignados`)
    },
    onError: (e: any) => toast.error(e.response?.data?.errors?.[0] ?? 'Error al crear albarán'),
  })

  const crearFacturaMutation = useMutation({
    mutationFn: ({ id, serieId, esSimplificada }: { id: number; serieId: number; esSimplificada: boolean }) =>
      api.post<ApiResponse<{ numeroFactura: string }>>(`/pedidos/${id}/crear-factura`, { serieId, esSimplificada }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['pedidos'] })
      qc.invalidateQueries({ queryKey: ['facturas'] })
      const num = res.data?.data?.numeroFactura ?? ''
      toast.success(`Factura ${num} generada correctamente`)
      setShowFacturaPedido(null)
    },
    onError: (e: any) => toast.error(e.response?.data?.errors?.[0] ?? e.response?.data?.message ?? 'Error al crear factura'),
  })

  const eliminarMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/pedidos/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pedidos'] })
      setDetailOpen(null)
      toast.success('Pedido eliminado')
    },
    onError: (e: any) => toast.error(e.response?.data?.message ?? e.response?.data?.errors?.[0] ?? 'Error al eliminar pedido'),
  })

  const actualizarLineasMutation = useMutation({
    mutationFn: ({ id, items }: { id: number; items: { productoId: number; precioUnitario?: number; descuento?: number; motivo?: string }[] }) =>
      api.put(`/pedidos/${id}/actualizar-lineas`, { items }),
    onSuccess: () => {
      // F1: invalidar también la query del detalle (['pedido', id]) — hoy no refrescaba
      qc.invalidateQueries({ queryKey: ['pedidos'] })
      qc.invalidateQueries({ queryKey: ['pedido'] })
      setShowEditPrecios(false)
      setEditPrecios({})
      toast.success('Precios actualizados')
    },
    onError: (e: any) => toast.error(e.response?.data?.errors?.[0] ?? 'Error al actualizar precios'),
  })

  const devolverMutation = useMutation({
    mutationFn: ({ id, items }: { id: number; items: { productoId: number; loteId: number; cantidad: number; motivo: string; motivoTexto?: string; destino: string }[] }) =>
      api.post<{ data: string; message: string | null }>(`/pedidos/${id}/devolver`, { items }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['pedidos'] })
      qc.invalidateQueries({ queryKey: ['stock'] })
      qc.invalidateQueries({ queryKey: ['trazabilidad'] })
      toast.success(res.data?.message ?? 'Devolución registrada correctamente')
      setShowDevolucion(null)
      setDevolucionItems([])
    },
    onError: (e: any) => toast.error(e.response?.data?.errors?.[0] ?? 'Error al registrar devolución'),
  })

  // Inicializar items de devolución con sus lotes cuando se carga el detalle
  useEffect(() => {
    if (detalleDevolucion && showDevolucion !== null) {
      setDestinoDevolucion((detalleDevolucion.origenStock as 'Fabrica' | 'Furgoneta') ?? 'Fabrica')
      setMotivoTextoDevolucion('')
      const init: DevolucionItemForm[] = (detalleDevolucion.lineas ?? [])
        .filter(l => l.lotesAsignados && l.lotesAsignados.length > 0)
        .map(l => {
          const unidadesPorCaja = l.unidadesPorCaja ?? (l.productoNombre.toUpperCase().includes('MILHOJAS') ? 12 : 0)
          return {
            productoId: l.productoId,
            productoNombre: l.productoNombre,
            unidadesPorCaja,
            lotes: (l.lotesAsignados ?? []).map(la => {
              const devuelto = la.cantidadDevuelta ?? 0
              const original = Math.ceil(la.cantidad)
              return {
                loteId: la.loteId,
                codigoLote: la.codigoLote,
                cantidad: 0,
                maxCantidad: Math.max(0, original - devuelto),
                cantidadOriginal: original,
                cantidadDevuelta: devuelto,
                motivo: 'DevolucionVoluntaria',
                esCaja: unidadesPorCaja > 0,
              }
            }),
          }
        })
      setDevolucionItems(init)
    }
  }, [detalleDevolucion, showDevolucion])

  // Auto-cargar FIFO preview cuando se abre detalle de pedido pendiente
  const prevDetailId = useRef<number | null>(null)
  useEffect(() => {
    if (detalle && detalle.estado === 'Pendiente' && detailOpen !== prevDetailId.current) {
      prevDetailId.current = detailOpen
      const lineas = detalle.lineas ?? []
      const keys: Record<string, { productoId: number; cantidad: number }> = {}
      for (const l of lineas) {
        const k = `${l.productoId}-${Math.ceil(l.cantidad)}`
        keys[k] = { productoId: l.productoId, cantidad: Math.ceil(l.cantidad) }
      }
      const entries = Object.entries(keys)
      if (entries.length === 0) return
      setFifoLoading(prev => {
        const next = { ...prev }
        for (const [k] of entries) next[k] = true
        return next
      })
      for (const [k, v] of entries) {
        ;(async () => {
          try {
            const res = await api.get<ApiResponse<any[]>>(`/lotes/producto/${v.productoId}/fifo`, { params: { cantidad: v.cantidad, origen: detalle.origenStock ?? 'Fabrica' } })
            const r = res.data
            setFifoPreviews(prev => ({ ...prev, [k]: r.success && Array.isArray(r.data) ? r.data : [] }))
          } catch {
            setFifoPreviews(prev => ({ ...prev, [k]: [] }))
          } finally {
            setFifoLoading(prev => ({ ...prev, [k]: false }))
          }
        })()
      }
    }
  }, [detalle, detailOpen])

  function resetForm() { setShowForm(false); setClienteId(''); setFechaEntrega(''); setNotas(''); setOrigenVenta('Furgoneta'); setItems([{ productoId: 0, cantidad: 1 }]) }

  function addItem() { setItems(prev => [...prev, { productoId: 0, cantidad: 1 }]) }
  function removeItem(i: number) { setItems(prev => prev.filter((_, idx) => idx !== i)) }
  function updateItem(i: number, field: keyof ItemForm, val: any) {
    setItems(prev => prev.map((item, idx) => idx === i ? { ...item, [field]: val } : item))
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!clienteId) { toast.error('Selecciona un cliente'); return }
    if (!origenVenta) { toast.error('Indica el origen de la venta (Fábrica o Furgoneta)'); return }
    if (items.some(it => !it.productoId || it.cantidad <= 0)) { toast.error('Completa todos los items'); return }
    crearMutation.mutate({
      clienteId: +clienteId,
      fechaEntrega: fechaEntrega || undefined,
      notas,
      origenStock: origenVenta,
      items: items.map(it => ({ productoId: it.productoId, cantidad: it.cantidad })),
    })
  }

  const pendientes = (pedidos ?? []).filter(p => p.estado === 'Pendiente').length
  const totalImporte = (pedidos ?? []).reduce((s, p) => s + p.total, 0)

  const previewLineas = useMemo(() => {
    if (!selectedCliente || !productos?.length) return []

    return items
      .map((item, index) => {
        const producto = productos.find(p => p.id === item.productoId)
        if (!producto || item.cantidad <= 0) return null

        const pricing = resolvePreviewPricing(selectedCliente, producto, clienteCondiciones)
        const ivaPorcentaje = getIvaPorcentaje(selectedCliente, producto)
        const recargoPorcentaje = getRecargoEquivalenciaPorcentaje(selectedCliente, ivaPorcentaje, empresaPrecios?.tiposIvaRe)
        // Mismo redondeo que el backend (Money.R2): subtotal 2dp y luego IVA/RE calculados sobre ese subtotal
        const subtotal = roundMoney(item.cantidad * pricing.precioUnitario * (1 - pricing.descuento / 100))
        const ivaImporte = roundMoney(subtotal * ivaPorcentaje / 100)
        const recargoImporte = roundMoney(subtotal * recargoPorcentaje / 100)

        return {
          key: `${index}-${producto.id}`,
          productoNombre: producto.nombre,
          cantidad: item.cantidad,
          precioUnitario: pricing.precioUnitario,
          descuento: pricing.descuento,
          origenPrecio: pricing.origenPrecio,
          origenDescuento: pricing.origenDescuento,
          subtotal,
          ivaImporte,
          recargoImporte,
        }
      })
      .filter((linea): linea is NonNullable<typeof linea> => linea !== null)
  }, [clienteCondiciones, empresaPrecios, items, productos, selectedCliente])

  const previewTotales = useMemo(() => {
    const subtotal = previewLineas.reduce((acc, linea) => acc + linea.subtotal, 0)
    const ivaTotal = previewLineas.reduce((acc, linea) => acc + linea.ivaImporte, 0)
    const recargoTotal = previewLineas.reduce((acc, linea) => acc + linea.recargoImporte, 0)
    const retencionPorcentaje = selectedCliente && !selectedCliente.noAplicarRetenciones
      ? selectedCliente.porcentajeRetencion
      : 0
    // Igual que el backend: RetencionTotal = R2(Subtotal * %)
    const retencionTotal = roundMoney(subtotal * retencionPorcentaje / 100)

    return {
      subtotal,
      ivaTotal,
      recargoTotal,
      retencionTotal,
      total: subtotal + ivaTotal + recargoTotal - retencionTotal,
    }
  }, [previewLineas, selectedCliente])

  return (
    <div className="page-shell space-y-5">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Pedidos</h1>
          <p className="text-sm text-gray-500 mt-0.5">Gestión de pedidos de clientes · conversión a albaranes</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={downloadExcel}
            disabled={descargando}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-60"
          >
            {descargando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            {descargando ? 'Generando…' : 'Exportar Excel'}
          </button>
          <button onClick={() => setShowForm(true)} className="flex items-center gap-2 px-4 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-700">
            <Plus className="w-4 h-4" />Nuevo pedido
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: 'Total pedidos', value: (pedidos ?? []).length, fmt: false },
          { label: 'Pendientes', value: pendientes, fmt: false },
          { label: 'Importe total', value: totalImporte, fmt: true },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs text-gray-500">{s.label}</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{s.fmt ? formatCurrency(s.value as number) : s.value}</p>
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
              placeholder="Buscar por nº pedido, cliente o fecha…"
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
            <option value="Confirmado">Confirmado</option>
            <option value="EnPreparacion">En preparación</option>
            <option value="Preparado">Preparado</option>
            <option value="EnReparto">En reparto</option>
            <option value="Entregado">Entregado</option>
            <option value="Cancelado">Cancelado</option>
          </select>
          {(searchTerm || estadoFilter) && (
            <button onClick={() => { setSearchTerm(''); setEstadoFilter('') }} className="text-xs text-gray-500 hover:text-gray-700">
              Limpiar filtros
            </button>
          )}
          <span className="text-xs text-gray-400">{filteredPedidos.length} de {(pedidos ?? []).length}</span>
        </div>
        <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {['Nº Pedido', 'Fecha', 'Entrega', 'Estado', 'Cliente', 'Total', 'Acciones'].map(h => (
                <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {isLoading && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">
                <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />
                Cargando pedidos…
              </td></tr>
            )}
            {!isLoading && filteredPedidos.length === 0
              ? <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">{(pedidos ?? []).length ? 'Sin resultados para el filtro actual' : 'No hay pedidos. Crea el primero.'}</td></tr>
              : filteredPedidos.map(p => (
                <React.Fragment key={p.id}>
                  <tr className="hover:bg-gray-50/50">
                    <td className="px-4 py-3 font-mono text-xs font-semibold text-gray-900">
                      {p.numeroPedido}
                      {p.origenStock === 'Furgoneta' && (
                        <span className="ml-1.5 inline-block text-[10px] px-1.5 py-0.5 rounded-full font-semibold bg-sky-50 text-sky-700 border border-sky-200 align-middle"
                          title="Venta desde furgoneta">
                          Furgoneta
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{fmtDate(p.fecha)}</td>
                    <td className="px-4 py-3 text-gray-500">{fmtDate(p.fechaEntrega)}</td>
                    <td className="px-4 py-3">
                      <EstadoBadge estado={p.estado} />
                    </td>
                    <td className="px-4 py-3 text-gray-700">{p.clienteNombre}</td>
                    <td className="px-4 py-3 font-bold text-gray-900">{formatCurrency(p.total)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <button onClick={() => setDetailOpen(detailOpen === p.id ? null : p.id)} className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1">
                          {detailOpen === p.id ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />} Ver
                        </button>
                        {p.estado === 'Pendiente' && (
                          <button onClick={() => confirmarMutation.mutate(p.id)} className="text-xs text-green-600 hover:text-green-800 flex items-center gap-1">
                            <Check className="w-3 h-3" /> Confirmar
                          </button>
                        )}
                        {p.estado === 'Confirmado' && (
                          <button
                            onClick={() => crearAlbaranMutation.mutate(p.id)}
                            disabled={crearAlbaranMutation.isPending}
                            className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1 disabled:opacity-50">
                            {crearAlbaranMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <ClipboardList className="w-3 h-3" />}
                            Albarán
                          </button>
                        )}
                        {p.estado === 'Confirmado' && !p.noRealizarFacturas && (
                          <button
                            onClick={() => { setShowFacturaPedido(p.id); setSeriePedidoFactura(''); setEsSimplificadaPedido(false) }}
                            className="text-xs text-brand-600 hover:text-brand-800 flex items-center gap-1">
                            <FileText className="w-3 h-3" /> Factura
                          </button>
                        )}
                        {p.estado === 'EnPreparacion' && (
                          <button onClick={() => preparadoMutation.mutate(p.id)} className="text-xs text-indigo-600 hover:text-indigo-800 flex items-center gap-1">
                            <PackageCheck className="w-3 h-3" /> Preparado
                          </button>
                        )}
                        {p.estado === 'Preparado' && (
                          <button onClick={() => enRepartoMutation.mutate(p.id)} className="text-xs text-orange-600 hover:text-orange-800 flex items-center gap-1">
                            <Truck className="w-3 h-3" /> En reparto
                          </button>
                        )}
                        {p.estado === 'EnReparto' && (
                          <button onClick={() => entregadoMutation.mutate(p.id)} className="text-xs text-green-600 hover:text-green-800 flex items-center gap-1">
                            <MapPin className="w-3 h-3" /> Entregado
                          </button>
                        )}
                        {(p.estado === 'Confirmado' || p.estado === 'EnPreparacion' || p.estado === 'Preparado' || p.estado === 'EnReparto' || p.estado === 'Entregado' || p.estado === 'Servido') && (
                          <button
                            onClick={() => setShowDevolucion(p.id)}
                            className="text-xs text-orange-500 hover:text-orange-700 flex items-center gap-1"
                          >
                            <RotateCcw className="w-3 h-3" /> Devolución
                          </button>
                        )}
                        <button
                          onClick={() => downloadPdf(p.id, p.numeroPedido)}
                          disabled={descargando}
                          className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1 disabled:opacity-50">
                          {descargando ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />} PDF
                        </button>
                        {p.estado !== 'Cancelado' && p.estado !== 'Servido' && p.estado !== 'Entregado' && (
                          <button onClick={() => cancelarMutation.mutate(p.id)} className="text-xs text-red-500 hover:text-red-700 flex items-center gap-1">
                            <X className="w-3 h-3" /> Cancelar
                          </button>
                        )}
                        {(p.estado === 'Pendiente' || p.estado === 'Cancelado') && (
                          <button
                            onClick={() => {
                              if (!window.confirm(`¿Eliminar el pedido ${p.numeroPedido}? Esta acción no se puede deshacer.`)) return
                              eliminarMutation.mutate(p.id)
                            }}
                            className="text-xs text-red-600 hover:text-red-800 flex items-center gap-1"
                          >
                            <Trash2 className="w-3 h-3" /> Eliminar
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                  {detailOpen === p.id && detalle && (
                    <tr>
                      <td colSpan={7} className="px-4 py-3 bg-blue-50/30">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="text-[11px] text-gray-500">
                              <th className="text-left pb-1 pr-4">Producto</th>
                              <th className="text-left pb-1 pr-4">Lote</th>
                              <th className="text-right pb-1 pr-4">Cant.</th>
                              <th className="text-right pb-1 pr-4">Precio</th>
                              <th className="text-right pb-1 pr-4">Dto.%</th>
                              <th className="text-right pb-1 pr-4">{p.estado === 'Pendiente' && showEditPrecios ? 'Motivo' : ''}</th>
                              <th className="text-right pb-1">Total</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(detalle.lineas ?? []).map((l, i) => {
                              const fifoKey = `${l.productoId}-${Math.ceil(l.cantidad)}`
                              const fifoData = fifoPreviews[fifoKey]
                              const fifoIsLoading = fifoLoading[fifoKey]
                              const isPending = p.estado === 'Pendiente'
                              const ed = editPrecios[l.productoId] ?? { precioUnitario: l.precioUnitario, descuento: l.descuento }
                              const precio = isPending && showEditPrecios ? ed.precioUnitario : l.precioUnitario
                              const descuento = isPending && showEditPrecios ? ed.descuento : l.descuento
                              // Importe de línea = R2(neto) + R2(IVA) + R2(R.Eq.) — misma regla que backend
                              const netoLinea = roundMoney(l.cantidad * precio * (1 - descuento / 100))
                              const ivaLinea = roundMoney(netoLinea * l.ivaPorcentaje / 100)
                              const reLinea = roundMoney(netoLinea * l.recargoEquivalenciaPorcentaje / 100)
                              const importeLinea = netoLinea + ivaLinea + reLinea

                              return (
                                <tr key={i} className="border-t border-blue-100">
                                  <td className="py-1 pr-4 font-medium">{l.productoNombre}</td>
                                  <td className="py-1 pr-4">
                                    {isPending ? (
                                      fifoIsLoading ? (
                                        <span className="text-gray-400 flex items-center gap-1">
                                          <Loader2 className="w-3 h-3 animate-spin" /> Asignando…
                                        </span>
                                      ) : fifoData && fifoData.length > 0 ? (
                                        <div className="space-y-0.5">
                                          {fifoData.map((f, fi) => (
                                            <span key={fi} className="font-mono text-[11px] text-gray-700 block">
                                              {f.codigoLote} ({f.cantidad} uds)
                                            </span>
                                          ))}
                                        </div>
                                      ) : (
                                        <span className="text-gray-400">&mdash;</span>
                                      )
                                    ) : l.codigoLote ? (
                                      <span className="font-mono text-[11px] text-gray-700">{l.codigoLote}</span>
                                    ) : (
                                      <span className="text-gray-400">Sin asignar</span>
                                    )}
                                  </td>
                                  <td className="py-1 pr-4 text-right">{l.cantidad}</td>
                                  <td className="py-1 pr-4 text-right">
                                    {isPending && showEditPrecios ? (
                                      <input
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        value={ed.precioUnitario}
                                        onChange={e => setEditPrecios(prev => ({
                                          ...prev,
                                          [l.productoId]: { ...prev[l.productoId] ?? { precioUnitario: l.precioUnitario, descuento: l.descuento }, precioUnitario: parseFloat(e.target.value || '0') }
                                        }))}
                                        className="w-20 text-right border border-blue-300 rounded px-1 py-0.5 text-xs"
                                      />
                                    ) : (
                                      formatCurrency(l.precioUnitario)
                                    )}
                                  </td>
                                  <td className="py-1 pr-4 text-right">
                                    {isPending && showEditPrecios ? (
                                      <input
                                        type="number"
                                        step="0.1"
                                        min="0"
                                        max="100"
                                        value={ed.descuento}
                                        onChange={e => setEditPrecios(prev => ({
                                          ...prev,
                                          [l.productoId]: { ...prev[l.productoId] ?? { precioUnitario: l.precioUnitario, descuento: l.descuento }, descuento: parseFloat(e.target.value || '0') }
                                        }))}
                                        className="w-14 text-right border border-blue-300 rounded px-1 py-0.5 text-xs"
                                      />
                                    ) : (
                                      `${l.descuento}%`
                                    )}
                                  </td>
                                  <td className="py-1 pr-4 text-right">
                                    {isPending && showEditPrecios ? (
                                      <input
                                        type="text"
                                        value={ed.motivo ?? ''}
                                        onChange={e => setEditPrecios(prev => ({
                                          ...prev,
                                          [l.productoId]: { ...prev[l.productoId] ?? { precioUnitario: l.precioUnitario, descuento: l.descuento, motivo: '' }, motivo: e.target.value }
                                        }))}
                                        placeholder="Motivo…"
                                        className="w-24 text-xs border border-blue-200 rounded px-1 py-0.5"
                                      />
                                    ) : l.motivoPrecioEspecial ? (
                                      <span className="text-[10px] text-gray-400 italic">{l.motivoPrecioEspecial}</span>
                                    ) : null}
                                  </td>
                                  <td className="py-1 text-right font-bold">{formatCurrency(importeLinea)}</td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                        <div className="flex justify-between items-center mt-2 pt-2 border-t border-blue-200">
                          {p.estado === 'Pendiente' && (
                            <div className="flex gap-2">
                              {!showEditPrecios ? (
                                <button
                                  onClick={() => {
                                    setShowEditPrecios(true)
                                      const init: Record<string, { precioUnitario: number; descuento: number; motivo: string }> = {}
                                      for (const l of detalle.lineas ?? []) {
                                        // B6: partir del motivo existente para poder limpiarlo editándolo
                                        init[l.productoId] = { precioUnitario: l.precioUnitario, descuento: l.descuento, motivo: l.motivoPrecioEspecial ?? '' }
                                      }
                                    setEditPrecios(init)
                                  }}
                                  className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800"
                                >
                                  <Pencil className="w-3 h-3" /> Editar precios
                                </button>
                              ) : (
                                <>
                                  <button
                                  onClick={() => {
                                    const items = Object.entries(editPrecios).map(([productoId, v]) => ({
                                      productoId: parseInt(productoId),
                                      precioUnitario: v.precioUnitario,
                                      descuento: v.descuento,
                                      motivo: v.motivo,
                                    }))
                                    actualizarLineasMutation.mutate({ id: p.id, items })
                                  }}
                                    disabled={actualizarLineasMutation.isPending}
                                    className="flex items-center gap-1 text-xs text-green-600 hover:text-green-800"
                                  >
                                    {actualizarLineasMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                                    Guardar precios
                                  </button>
                                  <button
                                    onClick={() => { setShowEditPrecios(false); setEditPrecios({}) }}
                                    className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700"
                                  >
                                    <Undo2 className="w-3 h-3" /> Cancelar
                                  </button>
                                </>
                              )}
                            </div>
                          )}
                          <div className="flex flex-wrap justify-end gap-3 text-xs ml-auto">
                            {(() => {
                              // Mientras se editan precios, el pie se recalcula en vivo con los
                              // valores de edición (misma regla R2 que el backend).
                              const editing = p.estado === 'Pendiente' && showEditPrecios
                              if (!editing) {
                                return (
                                  <>
                                    <span>Base: <b>{formatCurrency(detalle.subtotal)}</b></span>
                                    {(detalle.descuentoTotal ?? 0) > 0 && (
                                      <span className="text-emerald-700">Descuento: <b>-{formatCurrency(detalle.descuentoTotal)}</b></span>
                                    )}
                                    <span>IVA: <b>{formatCurrency(detalle.ivaTotal)}</b></span>
                                    {(detalle.recargoEquivalenciaTotal ?? 0) > 0 && (
                                      <span>R.Eq.: <b>{formatCurrency(detalle.recargoEquivalenciaTotal)}</b></span>
                                    )}
                                    {(detalle.retencionTotal ?? 0) > 0 && (
                                      <span className="text-red-600">Retención: <b>-{formatCurrency(detalle.retencionTotal)}</b></span>
                                    )}
                                    <span className="font-bold text-brand-700">TOTAL: {formatCurrency(detalle.total)}</span>
                                  </>
                                )
                              }
                              let subtotal = 0
                              let descuentoTotal = 0
                              let ivaTotal = 0
                              let recargoTotal = 0
                              for (const l of detalle.lineas ?? []) {
                                const ed = editPrecios[l.productoId] ?? { precioUnitario: l.precioUnitario, descuento: l.descuento }
                                const bruto = roundMoney(l.cantidad * ed.precioUnitario)
                                const neto = roundMoney(l.cantidad * ed.precioUnitario * (1 - ed.descuento / 100))
                                subtotal += neto
                                descuentoTotal += bruto - neto
                                ivaTotal += roundMoney(neto * l.ivaPorcentaje / 100)
                                recargoTotal += roundMoney(neto * l.recargoEquivalenciaPorcentaje / 100)
                              }
                              const clienteDetalle = (clientes ?? []).find(c => c.id === detalle.cliente.id)
                              const retencionPct = clienteDetalle && !clienteDetalle.noAplicarRetenciones ? clienteDetalle.porcentajeRetencion : 0
                              const retencionTotal = roundMoney(subtotal * retencionPct / 100)
                              const total = subtotal + ivaTotal + recargoTotal - retencionTotal
                              return (
                                <>
                                  <span>Base: <b>{formatCurrency(subtotal)}</b></span>
                                  {descuentoTotal > 0 && (
                                    <span className="text-emerald-700">Descuento: <b>-{formatCurrency(descuentoTotal)}</b></span>
                                  )}
                                  <span>IVA: <b>{formatCurrency(ivaTotal)}</b></span>
                                  {recargoTotal > 0 && (
                                    <span>R.Eq.: <b>{formatCurrency(recargoTotal)}</b></span>
                                  )}
                                  {retencionTotal > 0 && (
                                    <span className="text-red-600">Retención: <b>-{formatCurrency(retencionTotal)}</b></span>
                                  )}
                                  <span className="font-bold text-brand-700">TOTAL: {formatCurrency(total)}</span>
                                </>
                              )
                            })()}
                          </div>
                        </div>
                        {detalle.notas && <p className="text-xs text-gray-500 mt-2 italic">Notas: {detalle.notas}</p>}
                        {p.estado === 'Pendiente' && (
                          <div className="mt-2 pt-2 border-t border-blue-200">
                            <p className="text-[11px] text-blue-600 flex items-center gap-1">
                              <ClipboardList className="w-3 h-3" />
                              Los lotes mostrados son los que se asignarán al confirmar el pedido (FIFO). Puedes editar precios antes de confirmar.
                            </p>
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
          </tbody>
        </table>
        </div>
      </div>

      {/* Modal: Nuevo pedido */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-start sm:items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-xl max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-base font-bold text-gray-900">Nuevo pedido</h2>
                <button onClick={resetForm}><X className="w-5 h-5 text-gray-400 hover:text-gray-600" /></button>
              </div>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Cliente *</label>
                    <select value={clienteId} onChange={e => setClienteId(e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-500 focus:border-transparent">
                      <option value="">Seleccionar…</option>
                      {(clientes ?? []).map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Fecha entrega prevista</label>
                    <DateInput value={fechaEntrega} onChange={setFechaEntrega} className="w-full" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Origen de la venta *</label>
                  <select value={origenVenta} onChange={e => setOrigenVenta(e.target.value as 'Fabrica' | 'Furgoneta' | '')}
                    required
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-500 focus:border-transparent">
                    <option value="">Seleccionar de dónde sale la mercancía…</option>
                    <option value="Fabrica">Fábrica</option>
                    <option value="Furgoneta">Furgoneta</option>
                  </select>
                  <p className="text-[11px] text-gray-400 mt-1">La mercancía se descontará de esta ubicación al confirmar.</p>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Notas</label>
                  <input value={notas} onChange={e => setNotas(e.target.value)} placeholder="Notas opcionales…"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-500 focus:border-transparent" />
                </div>
                {selectedCliente && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900 space-y-1">
                    <p className="font-semibold">El pedido tendrá en cuenta automáticamente la política comercial del cliente.</p>
                    <p>
                      Descuento general: <b>{selectedCliente.descuentoGeneral.toFixed(2)}%</b>
                      {clienteCondiciones && clienteCondiciones.length > 0 ? ` · ${clienteCondiciones.length} condición(es) especial(es) activas` : ' · sin condiciones especiales'}
                    </p>
                    <p>La precedencia aplicada es: condición especial de producto &gt; descuento general del cliente &gt; descuento por defecto del producto.</p>
                  </div>
                )}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-medium text-gray-700">Artículos *</label>
                    <button type="button" onClick={addItem} className="text-xs text-brand-600 hover:text-brand-700 font-medium">+ Añadir línea</button>
                  </div>
                  <div className="space-y-2">
                    {items.map((item, i) => (
                      <div key={i} className="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto] gap-2 items-center">
                        <select value={item.productoId} onChange={e => updateItem(i, 'productoId', +e.target.value)}
                          className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-500 focus:border-transparent">
                          <option value={0}>Seleccionar producto…</option>
                          {(productos ?? []).map(p => <option key={p.id} value={p.id}>{p.nombre} ({formatCurrency(p.precioVenta)})</option>)}
                        </select>
                        <input type="number" min="1" step="1" value={item.cantidad} onFocus={e => e.currentTarget.select()} onChange={e => updateItem(i, 'cantidad', parseInt(e.target.value || '0', 10))}
                          className="w-20 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-500 focus:border-transparent" placeholder="Cant." />
                        {items.length > 1 && (
                          <button type="button" onClick={() => removeItem(i)} className="text-red-400 hover:text-red-600"><X className="w-4 h-4" /></button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
                {selectedCliente && previewLineas.length > 0 && (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
                    <div>
                      <h3 className="text-xs font-semibold text-slate-900 uppercase tracking-wide">Previsualización comercial del pedido</h3>
                      <p className="text-xs text-slate-500 mt-1">Estos importes se calculan antes de guardar con las condiciones del cliente seleccionado.</p>
                    </div>
                    <div className="space-y-2">
                      {previewLineas.map(linea => (
                        <div key={linea.key} className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-sm font-medium text-slate-900">{linea.productoNombre}</p>
                              <p className="text-xs text-slate-500">
                                {linea.cantidad} x {formatCurrency(linea.precioUnitario)} · Precio: {linea.origenPrecio} · Dto: {linea.descuento.toFixed(2)}% ({linea.origenDescuento})
                              </p>
                            </div>
                            <p className="text-sm font-semibold text-slate-900">{formatCurrency(linea.subtotal + linea.ivaImporte + linea.recargoImporte)}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="flex flex-wrap justify-end gap-4 border-t border-slate-200 pt-3 text-xs text-slate-700">
                      <span>Base: <b>{formatCurrency(previewTotales.subtotal)}</b></span>
                      <span>IVA: <b>{formatCurrency(previewTotales.ivaTotal)}</b></span>
                      {previewTotales.recargoTotal > 0 && <span>R.Eq.: <b>{formatCurrency(previewTotales.recargoTotal)}</b></span>}
                      {previewTotales.retencionTotal > 0 && <span className="text-red-700">Retención: <b>-{formatCurrency(previewTotales.retencionTotal)}</b></span>}
                      <span className="text-brand-700">Total estimado: <b>{formatCurrency(previewTotales.total)}</b></span>
                    </div>
                  </div>
                )}
                <div className="flex justify-end gap-3 pt-2">
                  <button type="button" onClick={resetForm} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900">Cancelar</button>
                  <button type="submit" disabled={crearMutation.isPending}
                    className="flex items-center gap-2 px-5 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium disabled:opacity-50 hover:bg-brand-700">
                    {crearMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                    Crear pedido
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Crear factura desde pedido */}
      {showFacturaPedido !== null && (
        <div className="fixed inset-0 bg-black/40 flex items-start sm:items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <h2 className="text-base font-bold text-gray-900 mb-1">Generar factura desde pedido</h2>
            <p className="text-xs text-gray-500 mb-4">Se asignarán lotes FIFO automáticamente.</p>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Serie de facturación *</label>
                <select value={seriePedidoFactura} onChange={e => setSeriePedidoFactura(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-500 focus:border-transparent">
                  <option value="">Seleccionar serie…</option>
                  {(series ?? []).filter(s => s.activa).map(s => (
                    <option key={s.id} value={s.id}>{s.codigo}{s.descripcion ? ` — ${s.descripcion}` : ''}</option>
                  ))}
                </select>
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                <input type="checkbox" checked={esSimplificadaPedido} onChange={e => setEsSimplificadaPedido(e.target.checked)} className="rounded" />
                Factura simplificada (sin datos cliente)
              </label>
            </div>
            <div className="flex justify-end gap-3 mt-5">
              <button onClick={() => setShowFacturaPedido(null)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900">Cancelar</button>
              <button
                disabled={!seriePedidoFactura || crearFacturaMutation.isPending}
                onClick={() => crearFacturaMutation.mutate({ id: showFacturaPedido!, serieId: +seriePedidoFactura, esSimplificada: esSimplificadaPedido })}
                className="flex items-center gap-2 px-5 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium disabled:opacity-40 hover:bg-brand-700">
                {crearFacturaMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                Generar factura
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Devolución con lotes */}
      {showDevolucion !== null && detalleDevolucion && (
        <div className="fixed inset-0 bg-black/40 flex items-start sm:items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-xl max-h-[90vh] overflow-y-auto p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-base font-bold text-gray-900">Devolución de pedido</h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  {detalleDevolucion.numeroPedido} · {detalleDevolucion.cliente.nombre}
                </p>
              </div>
              <button onClick={() => { setShowDevolucion(null); setDevolucionItems([]) }}>
                <X className="w-5 h-5 text-gray-400 hover:text-gray-600" />
              </button>
            </div>

            {/* Si no hay productos con lotes asignados */}
            {devolucionItems.length === 0 && (
              <p className="text-sm text-gray-500 py-4 text-center">
                No hay productos con lotes asignados en este pedido para devolver.
              </p>
            )}

            {devolucionItems.map((item, pIdx) => (
              <div key={item.productoId} className="mb-4 pb-3 border-b border-gray-100 last:border-b-0">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-semibold text-gray-800">{item.productoNombre}</p>
                  {item.unidadesPorCaja > 0 && (
                    <span className="text-[10px] font-medium text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                      1 caja = {item.unidadesPorCaja} uds
                    </span>
                  )}
                </div>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-gray-500 border-b border-gray-200">
                      <th className="text-left pb-1.5 pr-2 font-semibold">Lote</th>
                      <th className="text-center pb-1.5 pr-2 font-semibold">Vendido</th>
                      <th className="text-center pb-1.5 pr-2 font-semibold">Devuelto</th>
                      <th className="text-center pb-1.5 pr-2 font-semibold">A devolver</th>
                      {item.unidadesPorCaja > 0 && <th className="text-center pb-1.5 pr-2 font-semibold">Tipo</th>}
                      <th className="text-center pb-1.5 font-semibold" colSpan={2}>Motivo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {item.lotes.map((lote, lIdx) => (
                      <tr key={lote.loteId} className={lIdx < item.lotes.length - 1 ? 'border-b border-gray-50' : ''}>
                        <td className="py-1.5 pr-2 font-mono text-gray-700">{lote.codigoLote}</td>
                        <td className="py-1.5 pr-2 text-center text-gray-600">
                          {item.unidadesPorCaja > 0
                            ? `${(lote.cantidadOriginal / item.unidadesPorCaja).toFixed(1)} cajas`
                            : lote.cantidadOriginal}
                        </td>
                        <td className="py-1.5 pr-2 text-center text-gray-400">
                          {lote.cantidadDevuelta > 0
                            ? (item.unidadesPorCaja > 0
                              ? `${(lote.cantidadDevuelta / item.unidadesPorCaja).toFixed(1)} cajas`
                              : lote.cantidadDevuelta)
                            : '—'}
                        </td>
                        <td className="py-1.5 pr-2 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <input
                              type="number"
                              min="0"
                              max={item.unidadesPorCaja > 0 && lote.esCaja ? Math.floor(lote.maxCantidad / item.unidadesPorCaja) : lote.maxCantidad}
                              step="1"
                              value={lote.cantidad}
                              onChange={e => {
                                const val = Math.min(Math.max(0, parseInt(e.target.value || '0', 10)),
                                  item.unidadesPorCaja > 0 && lote.esCaja ? Math.floor(lote.maxCantidad / item.unidadesPorCaja) : lote.maxCantidad)
                                setDevolucionItems(prev => prev.map((d, di) =>
                                  di === pIdx
                                    ? { ...d, lotes: d.lotes.map((ld, li) => li === lIdx ? { ...ld, cantidad: val } : ld) }
                                    : d
                                ))
                              }}
                              className="w-14 text-center border border-gray-300 rounded-lg px-1.5 py-1 text-xs focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                            />
                            {item.unidadesPorCaja > 0 && (
                              <button
                                type="button"
                                onClick={() => setDevolucionItems(prev => prev.map((d, di) =>
                                  di === pIdx
                                    ? { ...d, lotes: d.lotes.map((ld, li) => li === lIdx ? { ...ld, esCaja: !ld.esCaja, cantidad: 0 } : ld) }
                                    : d
                                ))}
                                className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${
                                  lote.esCaja
                                    ? 'bg-brand-50 text-brand-700 border-brand-300'
                                    : 'bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100'
                                }`}
                                title="Cambiar entre cajas y unidades"
                              >
                                {lote.esCaja ? 'Cajas' : 'Uds'}
                              </button>
                            )}
                          </div>
                        </td>
                        {item.unidadesPorCaja > 0 && (
                          <td className="py-1.5 pr-2 text-center text-[10px] text-gray-400">
                            {lote.esCaja ? `= ${lote.cantidad * item.unidadesPorCaja} uds` : `${lote.cantidad} uds`}
                          </td>
                        )}
                        <td className="py-1.5 text-center" colSpan={2}>
                          <div className="flex items-center justify-center">
                            <select
                              value={lote.motivo}
                              onChange={e => {
                                setDevolucionItems(prev => prev.map((d, di) =>
                                  di === pIdx
                                    ? { ...d, lotes: d.lotes.map((ld, li) => li === lIdx ? { ...ld, motivo: e.target.value } : ld) }
                                    : d
                                ))
                              }}
                              className={`text-[11px] border rounded-lg px-1.5 py-1 focus:ring-2 focus:ring-brand-500 ${
                                lote.motivo === 'Caducidad' ? 'border-orange-200 text-orange-700 bg-orange-50'
                                : ['ProductoDaniado', 'Otro'].includes(lote.motivo) ? 'border-red-200 text-red-700 bg-red-50'
                                : 'border-green-200 text-green-700 bg-green-50'
                              }`}
                            >
                              <option value="DevolucionVoluntaria">Devolución voluntaria</option>
                              <option value="ErrorPreparacion">Error de preparación</option>
                              <option value="CalidadObrador">Calidad del obrador</option>
                              <option value="Caducidad">Caducidad</option>
                              <option value="ProductoDaniado">Producto dañado</option>
                              <option value="Otro">Otro</option>
                            </select>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}

            {/* Destino del repuesto + descripción si motivo = Otro */}
            {devolucionItems.length > 0 && (() => {
              const hayConCantidad = devolucionItems.some(item => item.lotes.some(l => l.cantidad > 0))
              const reponeAlguno = devolucionItems.some(item => item.lotes.some(l =>
                l.cantidad > 0 && !['Caducidad', 'ProductoDaniado', 'Otro'].includes(l.motivo)))
              const hayOtro = devolucionItems.some(item => item.lotes.some(l => l.cantidad > 0 && l.motivo === 'Otro'))
              if (!hayConCantidad) return null
              return (
                <div className="bg-gray-50 rounded-xl p-4 space-y-3 mt-3">
                  {reponeAlguno && (
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Devolver a *</label>
                      <select
                        value={destinoDevolucion}
                        onChange={e => setDestinoDevolucion(e.target.value as 'Fabrica' | 'Furgoneta')}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-500 focus:border-transparent">
                        <option value="Fabrica">Fábrica (vuelve al almacén)</option>
                        <option value="Furgoneta">Furgoneta</option>
                      </select>
                      <p className="text-[11px] text-gray-400 mt-1">Solo afecta a los motivos que repuesto de stock.</p>
                    </div>
                  )}
                  {hayOtro && (
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Descripción del motivo (Otro) *</label>
                      <input
                        value={motivoTextoDevolucion}
                        onChange={e => setMotivoTextoDevolucion(e.target.value)}
                        maxLength={500}
                        placeholder="Describe por qué se devuelve…"
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-500 focus:border-transparent" />
                    </div>
                  )}
                </div>
              )
            })()}

            <div className="flex items-center justify-between pt-3 border-t border-gray-200">
              <p className="text-xs text-gray-500">
                {devolucionItems.reduce((acc, item) => acc + item.lotes.filter(l => l.cantidad > 0).length, 0)} lote(s) con devolución
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => { setShowDevolucion(null); setDevolucionItems([]) }}
                  className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => {
                    const hayOtro = devolucionItems.some(item => item.lotes.some(l => l.cantidad > 0 && l.motivo === 'Otro'))
                    if (hayOtro && !motivoTextoDevolucion.trim()) {
                      toast.error('Describe el motivo de la devolución (Otro)')
                      return
                    }
                    const items: { productoId: number; loteId: number; cantidad: number; motivo: string; motivoTexto?: string; destino: string }[] = []
                    for (const item of devolucionItems) {
                      for (const lote of item.lotes) {
                        if (lote.cantidad > 0) {
                          // Si el producto se vende por cajas y está en cajas, convertir a unidades
                          const cantidadFinal = item.unidadesPorCaja > 0 && lote.esCaja
                            ? lote.cantidad * item.unidadesPorCaja
                            : lote.cantidad
                          items.push({
                            productoId: item.productoId,
                            loteId: lote.loteId,
                            cantidad: cantidadFinal,
                            motivo: lote.motivo,
                            motivoTexto: lote.motivo === 'Otro' ? motivoTextoDevolucion.trim() : undefined,
                            destino: destinoDevolucion,
                          })
                        }
                      }
                    }
                    if (items.length === 0) {
                      toast.error('Selecciona al menos un lote para devolver')
                      return
                    }
                    devolverMutation.mutate({ id: showDevolucion!, items })
                  }}
                  disabled={devolverMutation.isPending || devolucionItems.every(item => item.lotes.every(l => l.cantidad === 0))}
                  className="flex items-center gap-2 px-5 py-2 bg-orange-600 text-white rounded-lg text-sm font-medium disabled:opacity-50 hover:bg-orange-700"
                >
                  {devolverMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                  <RotateCcw className="w-4 h-4" /> Registrar devolución
                </button>
              </div>
            </div>
            <p className="text-[11px] text-gray-400 mt-2.5 leading-relaxed">
              El <strong>motivo</strong> decide si la mercancía vuelve al stock: los motivos de caducidad o daño
              <strong> no repondrán</strong>; los demás sí, en la ubicación indicada.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}