import React, { useState, useMemo, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../lib/api'
import type { PedidoResumen, PedidoDetalle, CreatePedidoDto, Cliente, ClienteCondicionEspecial, Producto, SerieFacturacion } from '../types'
import { Plus, X, Loader2, Check, ChevronDown, ChevronUp, ClipboardList, FileText, Truck, PackageCheck, MapPin, Search, Trash2, Download } from 'lucide-react'
import toast from 'react-hot-toast'
import { fmtDate } from '../lib/dates'
import { DateInput } from '../components/DateInput'

const ESTADO_COLOR: Record<string, string> = {
  Pendiente: 'bg-amber-50 text-amber-700 border border-amber-200',
  Confirmado: 'bg-blue-50 text-blue-700 border border-blue-200',
  EnPreparacion: 'bg-purple-50 text-purple-700 border border-purple-200',
  Preparado: 'bg-indigo-50 text-indigo-700 border border-indigo-200',
  EnReparto: 'bg-orange-50 text-orange-700 border border-orange-200',
  Entregado: 'bg-green-50 text-green-700 border border-green-200',
  Servido: 'bg-green-50 text-green-700 border border-green-200',
  Cancelado: 'bg-red-50 text-red-700 border border-red-200',
}

interface ItemForm { productoId: number; cantidad: number }

interface PreviewPricing {
  precioUnitario: number
  descuento: number
  origenPrecio: string
  origenDescuento: string
}

function normalizeCode(value?: string | null) {
  return value?.trim().toUpperCase() ?? ''
}

function isGlobalCodigo(value?: string | null) {
  if (!value || !value.trim()) return true
  const normalized = value.trim().toUpperCase()
  return normalized === '*' || normalized === 'TODOS' || normalized === 'ALL'
}

function getSpecificity(codigo: string | null | undefined, producto: Producto) {
  if (isGlobalCodigo(codigo)) return 1

  const normalized = normalizeCode(codigo)
  const keys = [producto.codigo, producto.referencia, String(producto.id)].map(normalizeCode)
  return keys.includes(normalized) ? 2 : 0
}

function findBestCondicion(
  condiciones: ClienteCondicionEspecial[] | undefined,
  producto: Producto,
  type: 'Precio' | 'Descuento'
) {
  if (!condiciones?.length) return null

  const filtered = condiciones
    .filter(c => c.articuloFamilia !== 'Familia')
    .filter(c => type === 'Precio'
      ? (c.tipo === 'Precio' || c.tipo === 'PrecioEspecial')
      : c.tipo === 'Descuento')
    .map(c => ({ condicion: c, specificity: getSpecificity(c.codigo, producto) }))
    .filter(x => x.specificity > 0)
    .sort((a, b) => {
      if (b.specificity !== a.specificity) return b.specificity - a.specificity
      return b.condicion.id - a.condicion.id
    })

  return filtered[0]?.condicion ?? null
}

function resolvePreviewPricing(
  cliente: Cliente | null,
  producto: Producto,
  condiciones: ClienteCondicionEspecial[] | undefined
): PreviewPricing {
  const condicionPrecio = findBestCondicion(condiciones, producto, 'Precio')
  const condicionDescuento = findBestCondicion(condiciones, producto, 'Descuento')

  const precioUnitario = condicionPrecio && condicionPrecio.precio > 0
    ? condicionPrecio.precio
    : producto.precioVenta

  const origenPrecio = condicionPrecio && condicionPrecio.precio > 0
    ? 'Condición especial'
    : 'Precio base'

  let descuento = 0
  let origenDescuento = 'Sin descuento'

  if (condicionDescuento && condicionDescuento.descuento > 0) {
    descuento = condicionDescuento.descuento
    origenDescuento = 'Condición especial'
  } else if ((cliente?.descuentoGeneral ?? 0) > 0) {
    descuento = cliente?.descuentoGeneral ?? 0
    origenDescuento = 'Cliente'
  } else if ((producto.descuentoPorDefecto ?? 0) > 0) {
    descuento = producto.descuentoPorDefecto ?? 0
    origenDescuento = 'Producto'
  }

  return { precioUnitario, descuento, origenPrecio, origenDescuento }
}

function getIvaPorcentaje(cliente: Cliente | null, producto: Producto) {
  if (!cliente) return producto.ivaPorcentaje ?? 0

  switch (cliente.tipoImpuesto) {
    case 'Exento':
      return 0
    case 'IGIC':
      return 7
    default:
      return cliente.aplicarImpuesto ? (producto.ivaPorcentaje ?? 0) : 0
  }
}

function getRecargoEquivalenciaPorcentaje(cliente: Cliente | null, ivaPorcentaje: number) {
  const aplicaRE = cliente?.tipoImpuesto === 'RecargoEquivalencia' || cliente?.recargoEquivalencia
  if (!aplicaRE) return 0
  switch (ivaPorcentaje) {
    case 21: return 5.2
    case 10: return 1.4
    case 4: return 0.5
    default: return 0
  }
}

export default function Pedidos() {
  const qc = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [detailOpen, setDetailOpen] = useState<number | null>(null)
  const [clienteId, setClienteId] = useState('')
  const [fechaEntrega, setFechaEntrega] = useState('')
  const [notas, setNotas] = useState('')
  const [items, setItems] = useState<ItemForm[]>([{ productoId: 0, cantidad: 1 }])

  // Modal: crear factura desde pedido
  const [showFacturaPedido, setShowFacturaPedido] = useState<number | null>(null)
  const [seriePedidoFactura, setSeriePedidoFactura] = useState('')
  const [esSimplificadaPedido, setEsSimplificadaPedido] = useState(false)

  const { data: pedidos, isLoading } = useQuery({
    queryKey: ['pedidos'],
    queryFn: async () => (await api.get<{ data: PedidoResumen[] }>('/pedidos')).data.data,
  })

  const downloadExcel = async () => {
    try {
      const resp = await api.get('/pedidos/exportar-excel', { responseType: 'blob' })
      const url = URL.createObjectURL(new Blob([resp.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
      const a = document.createElement('a')
      a.href = url
      a.download = 'pedidos.xlsx'
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      toast.error('Error al exportar Excel de pedidos')
    }
  }

  const downloadPdf = async (id: number, numero: string) => {
    try {
      const resp = await api.get(`/pedidos/${id}/pdf`, { responseType: 'blob' })
      const url = URL.createObjectURL(new Blob([resp.data], { type: 'application/pdf' }))
      const a = document.createElement('a')
      a.href = url
      a.download = `Pedido_${numero}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      toast.error('Error al generar el PDF')
    }
  }

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
    mutationFn: (id: number) => api.post(`/pedidos/${id}/crear-albaran`, {}),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['pedidos'] })
      qc.invalidateQueries({ queryKey: ['albaranes'] })
      const num = (res.data as any)?.data?.numeroAlbaran ?? ''
      toast.success(`Albarán ${num} creado con lotes FIFO asignados`)
    },
    onError: (e: any) => toast.error(e.response?.data?.errors?.[0] ?? 'Error al crear albarán'),
  })

  const crearFacturaMutation = useMutation({
    mutationFn: ({ id, serieId, esSimplificada }: { id: number; serieId: number; esSimplificada: boolean }) =>
      api.post(`/pedidos/${id}/crear-factura`, { serieId, esSimplificada }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['pedidos'] })
      qc.invalidateQueries({ queryKey: ['facturas'] })
      const num = (res.data as any)?.data?.numeroFactura ?? ''
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
    mutationFn: ({ id, items }: { id: number; items: { productoId: number; precioUnitario?: number; descuento?: number }[] }) =>
      api.put(`/pedidos/${id}/actualizar-lineas`, { items }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pedidos'] })
      qc.invalidateQueries({ queryKey: ['pedido', detailOpen] })
      setShowEditPrecios(false)
      toast.success('Precios actualizados')
    },
    onError: (e: any) => toast.error(e.response?.data?.errors?.[0] ?? 'Error al actualizar precios'),
  })

  const devolverMutation = useMutation({
    mutationFn: ({ id, items }: { id: number; items: { productoId: number; cantidad: number }[] }) =>
      api.post(`/pedidos/${id}/devolver`, { items }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pedidos'] })
      qc.invalidateQueries({ queryKey: ['stock'] })
      toast.success('Devolución registrada correctamente')
      setShowDevolucion(null)
    },
    onError: (e: any) => toast.error(e.response?.data?.errors?.[0] ?? e.response?.data?.message ?? 'Error al registrar devolución'),
  })

  // Inicializar items de devolución cuando se carga el detalle
  useEffect(() => {
    if (detalleDevolucion && showDevolucion !== null) {
      const init = (detalleDevolucion.lineas ?? []).map(l => ({
        productoId: l.productoId,
        nombre: l.productoNombre,
        cantidad: 0,
        maxCantidad: Math.ceil(l.cantidad),
      }))
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
            const res = await api.get(`/lotes/producto/${v.productoId}/fifo`, { params: { cantidad: v.cantidad } })
            const r = res.data as any
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

  function resetForm() { setShowForm(false); setClienteId(''); setFechaEntrega(''); setNotas(''); setItems([{ productoId: 0, cantidad: 1 }]) }

  function addItem() { setItems(prev => [...prev, { productoId: 0, cantidad: 1 }]) }
  function removeItem(i: number) { setItems(prev => prev.filter((_, idx) => idx !== i)) }
  function updateItem(i: number, field: keyof ItemForm, val: any) {
    setItems(prev => prev.map((item, idx) => idx === i ? { ...item, [field]: val } : item))
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!clienteId) { toast.error('Selecciona un cliente'); return }
    if (items.some(it => !it.productoId || it.cantidad <= 0)) { toast.error('Completa todos los items'); return }
    crearMutation.mutate({
      clienteId: +clienteId,
      fechaEntrega: fechaEntrega || undefined,
      notas,
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
        const subtotal = item.cantidad * pricing.precioUnitario * (1 - pricing.descuento / 100)
        const ivaPorcentaje = getIvaPorcentaje(selectedCliente, producto)
        const recargoPorcentaje = getRecargoEquivalenciaPorcentaje(selectedCliente, ivaPorcentaje)
        const ivaImporte = subtotal * ivaPorcentaje / 100
        const recargoImporte = subtotal * recargoPorcentaje / 100

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
  }, [clienteCondiciones, items, productos, selectedCliente])

  const previewTotales = useMemo(() => {
    const subtotal = previewLineas.reduce((acc, linea) => acc + linea.subtotal, 0)
    const ivaTotal = previewLineas.reduce((acc, linea) => acc + linea.ivaImporte, 0)
    const recargoTotal = previewLineas.reduce((acc, linea) => acc + linea.recargoImporte, 0)
    const retencionPorcentaje = selectedCliente && !selectedCliente.noAplicarRetenciones
      ? selectedCliente.porcentajeRetencion
      : 0
    const retencionTotal = subtotal * retencionPorcentaje / 100

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
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700"
          >
            <Download className="w-4 h-4" /> Exportar Excel
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
            <p className="text-2xl font-bold text-gray-900 mt-1">{s.fmt ? `${(s.value as number).toFixed(2)} €` : s.value}</p>
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
            {isLoading
              ? <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">Cargando pedidos…</td></tr>
              : filteredPedidos.length === 0
              ? <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">{(pedidos ?? []).length ? 'Sin resultados para el filtro actual' : 'No hay pedidos. Crea el primero.'}</td></tr>
              : filteredPedidos.map(p => (
                <React.Fragment key={p.id}>
                  <tr className="hover:bg-gray-50/50">
                    <td className="px-4 py-3 font-mono text-xs font-semibold text-gray-900">{p.numeroPedido}</td>
                    <td className="px-4 py-3 text-gray-600">{fmtDate(p.fecha)}</td>
                    <td className="px-4 py-3 text-gray-500">{fmtDate(p.fechaEntrega)}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-1 rounded-full font-medium ${ESTADO_COLOR[p.estado] ?? 'bg-gray-100 text-gray-600'}`}>{p.estado}</span>
                    </td>
                    <td className="px-4 py-3 text-gray-700">{p.clienteNombre}</td>
                    <td className="px-4 py-3 font-bold text-gray-900">{p.total.toFixed(2)} €</td>
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
                        <button
                          onClick={() => downloadPdf(p.id, p.numeroPedido)}
                          className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1">
                          <Download className="w-3 h-3" /> PDF
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
                <tr className="text-gray-500 border-b border-gray-200">
                  <th className="text-left pb-2 pr-3 font-semibold">Producto</th>
                  <th className="text-right pb-2 pr-3 font-semibold">Vendido</th>
                  <th className="text-right pb-2 font-semibold">A devolver</th>
                </tr>
              </thead>
              <tbody>
                {devolucionItems.map((item, i) => (
                  <tr key={item.productoId} className="border-b border-gray-100">
                    <td className="py-2 pr-3 font-medium">{item.nombre}</td>
                    <td className="py-2 pr-3 text-right text-gray-600">{item.maxCantidad}</td>
                    <td className="py-2 text-right">
                      <input
                        type="number"
                        min="0"
                        max={item.maxCantidad}
                        step="1"
                        value={item.cantidad}
                        onChange={e => {
                          const val = Math.min(Math.max(0, parseInt(e.target.value || '0', 10)), item.maxCantidad)
                          setDevolucionItems(prev => prev.map((d, idx) => idx === i ? { ...d, cantidad: val } : d))
                        }}
                        className="w-20 text-right border border-gray-300 rounded-lg px-2 py-1 text-xs focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="flex items-center justify-between mt-4 pt-3 border-t border-gray-200">
              <p className="text-xs text-gray-500">
                {devolucionItems.filter(i => i.cantidad > 0).length} producto(s) con devolución
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
                    const items = devolucionItems.filter(i => i.cantidad > 0).map(i => ({
                      productoId: i.productoId,
                      cantidad: i.cantidad,
                    }))
                    if (items.length === 0) {
                      toast.error('Selecciona al menos un producto para devolver')
                      return
                    }
                    devolverMutation.mutate({ id: showDevolucion!, items })
                  }}
                  disabled={devolverMutation.isPending || devolucionItems.every(i => i.cantidad === 0)}
                  className="flex items-center gap-2 px-5 py-2 bg-orange-600 text-white rounded-lg text-sm font-medium disabled:opacity-50 hover:bg-orange-700"
                >
                  {devolverMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                  <RotateCcw className="w-4 h-4" /> Registrar devolución
                </button>
              </div>
            </div>
            <p className="text-[11px] text-gray-400 mt-3">
              La devolución repondrá el stock y generará los registros de trazabilidad correspondientes.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
