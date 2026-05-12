import { useMemo, useState } from 'react'
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import {
  AlertTriangle,
  Calendar,
  Check,
  Loader2,
  Plus,
  Save,
  ShoppingCart,
  Trash2,
  Users,
  X,
} from 'lucide-react'
import api from '../lib/api'
import type {
  Cliente,
  PedidoDetalle,
  PedidoResumen,
  Producto,
  PreventaDetalle,
  PreventaResumen,
  ValidacionConversion,
} from '../types'

function todayIso() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function formatDate(iso: string): string {
  if (!iso) return '-'
  const [y, m, day] = iso.split('-')
  return `${day}/${m}/${y}`
}

function nombreCliente(c: Cliente): string {
  return c.razonSocial || `${c.nombre} ${c.apellidos ?? ''}`.trim() || c.nombre
}

function labelPreventaEstado(e: string) {
  const map: Record<string, string> = {
    Borrador: 'Borrador',
    PendienteRevision: 'Pend. revision',
    Confirmada: 'Confirmada',
    Convertida: 'Convertida',
    Cancelada: 'Cancelada',
  }
  return map[e] ?? e
}

function labelPedidoEstado(e: string) {
  const map: Record<string, string> = {
    Borrador: 'Borrador',
    Confirmado: 'Confirmado',
    Preparado: 'Preparado',
    EnReparto: 'En reparto',
    Entregado: 'Entregado',
    Cancelado: 'Cancelado',
  }
  return map[e] ?? e
}

function pedidoTheme(estado: string) {
  const map: Record<string, { header: string; badge: string }> = {
    Confirmado: { header: 'bg-blue-100 text-blue-800', badge: 'bg-blue-200 text-blue-900' },
    Preparado: { header: 'bg-cyan-100 text-cyan-800', badge: 'bg-cyan-200 text-cyan-900' },
    EnReparto: { header: 'bg-violet-100 text-violet-800', badge: 'bg-violet-200 text-violet-900' },
    Entregado: { header: 'bg-emerald-100 text-emerald-800', badge: 'bg-emerald-200 text-emerald-900' },
    Cancelado: { header: 'bg-red-50 text-red-700', badge: 'bg-red-100 text-red-700' },
    Borrador: { header: 'bg-gray-100 text-gray-700', badge: 'bg-gray-200 text-gray-700' },
  }
  return map[estado] ?? map.Borrador
}

const PREVENTA_THEME: Record<string, { header: string; badge: string }> = {
  Borrador: { header: 'bg-amber-100 text-amber-800', badge: 'bg-amber-200 text-amber-900' },
  PendienteRevision: { header: 'bg-orange-100 text-orange-800', badge: 'bg-orange-200 text-orange-900' },
  Confirmada: { header: 'bg-indigo-100 text-indigo-800', badge: 'bg-indigo-200 text-indigo-900' },
  Convertida: { header: 'bg-emerald-100 text-emerald-800', badge: 'bg-emerald-200 text-emerald-900' },
  Cancelada: { header: 'bg-red-50 text-red-700', badge: 'bg-red-100 text-red-700' },
}

export default function Preventa() {
  const qc = useQueryClient()

  const [selectedClienteId, setSelectedClienteId] = useState<number | null>(null)
  const [showNewColumn, setShowNewColumn] = useState(false)
  const [newColDate, setNewColDate] = useState(todayIso)
  const [newColDraft, setNewColDraft] = useState<Record<number, string>>({})
  const [periodoFiltro, setPeriodoFiltro] = useState<'7d' | '15d' | '30d' | '90d' | 'all' | 'custom'>('30d')
  const [customDesde, setCustomDesde] = useState('')
  const [customHasta, setCustomHasta] = useState(todayIso)

  const [drafts, setDrafts] = useState<Record<number, Record<number, string>>>({})
  const [dirtyIds, setDirtyIds] = useState<Set<number>>(new Set())

  const [modal, setModal] = useState<{
    open: boolean
    preventaId: number | null
    data: ValidacionConversion | null
  }>({ open: false, preventaId: null, data: null })

  const { data: clientes } = useQuery({
    queryKey: ['clientes'],
    queryFn: async () => (await api.get<{ data: Cliente[] }>('/clientes')).data.data,
  })

  const { data: productos } = useQuery({
    queryKey: ['productos'],
    queryFn: async () => (await api.get<{ data: Producto[] }>('/productos')).data.data,
  })

  const { data: allPreventas, isLoading: loadingPreventas } = useQuery({
    queryKey: ['preventas'],
    queryFn: async () => (await api.get<{ data: PreventaResumen[] }>('/preventas')).data.data,
  })

  const { data: allPedidos, isLoading: loadingPedidos } = useQuery({
    queryKey: ['pedidos'],
    queryFn: async () => (await api.get<{ data: PedidoResumen[] }>('/pedidos')).data.data,
  })

  const activePreventa = useMemo(() => {
    return (allPreventas ?? [])
      .filter((p) => p.clienteId === selectedClienteId)
      .filter((p) => p.estado !== 'Convertida' && p.estado !== 'Cancelada')
      .sort((a, b) => {
        const byDate = a.fechaPreventa.localeCompare(b.fechaPreventa)
        if (byDate !== 0) return byDate
        return a.id - b.id
      })
      .at(-1) ?? null
  }, [allPreventas, selectedClienteId])

  const { data: activePreventaDetalle, isLoading: loadingPreventaDetalle } = useQuery({
    queryKey: ['preventa-detalle', activePreventa?.id],
    enabled: !!activePreventa,
    queryFn: async () => (await api.get<{ data: PreventaDetalle }>(`/preventas/${activePreventa?.id}`)).data.data,
    staleTime: 60_000,
  })

  const pedidoDetailQueries = useQueries({
    queries: (selectedClienteId ? (allPedidos ?? []) : []).map((pedido) => ({
      queryKey: ['pedido-detalle-preventa', pedido.id],
      queryFn: async () => (await api.get<{ data: PedidoDetalle }>(`/pedidos/${pedido.id}`)).data.data,
      staleTime: 60_000,
      enabled: !!selectedClienteId,
    })),
  })

  const isLoadingPedidoDetails = pedidoDetailQueries.some((q) => q.isLoading)

  const pedidosHistoricos = useMemo(() => {
    const all = pedidoDetailQueries
      .map((q) => q.data)
      .filter((p): p is PedidoDetalle => !!p)
      .filter((p) => p.cliente.id === selectedClienteId)
      .filter((p) => p.estado !== 'Cancelado')

    return all.sort((a, b) => {
      const aDate = a.fechaEntrega ?? a.fecha
      const bDate = b.fechaEntrega ?? b.fecha
      return aDate.localeCompare(bDate)
    })
  }, [pedidoDetailQueries, selectedClienteId])

  const pedidosHistoricosFiltrados = useMemo(() => {
    if (periodoFiltro === 'all') return pedidosHistoricos

    const toDate = (iso: string) => new Date(`${iso}T00:00:00`)

    if (periodoFiltro === 'custom') {
      const desde = customDesde ? toDate(customDesde) : null
      const hasta = customHasta ? toDate(customHasta) : null
      return pedidosHistoricos.filter((p) => {
        const refIso = p.fechaEntrega ?? p.fecha
        const d = toDate(refIso)
        if (desde && d < desde) return false
        if (hasta && d > hasta) return false
        return true
      })
    }

    const dias = Number(periodoFiltro.replace('d', ''))
    const hoy = toDate(todayIso())
    const desde = new Date(hoy)
    desde.setDate(desde.getDate() - dias)

    return pedidosHistoricos.filter((p) => {
      const refIso = p.fechaEntrega ?? p.fecha
      const d = toDate(refIso)
      return d >= desde && d <= hoy
    })
  }, [pedidosHistoricos, periodoFiltro, customDesde, customHasta])

  const sortedProductos = useMemo(
    () => [...(productos ?? [])].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')),
    [productos],
  )

  const selectedCliente = useMemo(
    () => (clientes ?? []).find((c) => c.id === selectedClienteId),
    [clientes, selectedClienteId],
  )

  function getPedidoCellValue(pedido: PedidoDetalle, productoId: number): number {
    return pedido.lineas
      .filter((l) => l.productoId === productoId)
      .reduce((acc, l) => acc + l.cantidad, 0)
  }

  function getPreventaCellValue(productoId: number): string {
    if (!activePreventa) return '0'
    const preId = activePreventa.id
    if (drafts[preId]?.[productoId] !== undefined) return drafts[preId][productoId]
    const linea = activePreventaDetalle?.lineas.find((l) => l.productoId === productoId)
    return linea ? String(linea.cantidadPrevista) : '0'
  }

  function setPreventaCellValue(productoId: number, raw: string) {
    if (!activePreventa) return
    const preId = activePreventa.id
    setDrafts((prev) => ({
      ...prev,
      [preId]: { ...(prev[preId] ?? {}), [productoId]: raw === '' ? '0' : raw },
    }))
    setDirtyIds((prev) => new Set(prev).add(preId))
  }

  function getPedidoColumnTotal(pedido: PedidoDetalle): number {
    return sortedProductos.reduce((sum, p) => sum + getPedidoCellValue(pedido, p.id), 0)
  }

  function getPreventaTotal(): number {
    if (!activePreventa) return 0
    return sortedProductos.reduce((sum, p) => {
      const n = Number(getPreventaCellValue(p.id).replace(',', '.'))
      return sum + (Number.isFinite(n) && n > 0 ? n : 0)
    }, 0)
  }

  function getNewColTotal(): number {
    return sortedProductos.reduce((sum, p) => {
      const n = Number((newColDraft[p.id] ?? '0').replace(',', '.'))
      return sum + (Number.isFinite(n) && n > 0 ? n : 0)
    }, 0)
  }

  const guardarLineasMutation = useMutation({
    mutationFn: async () => {
      if (!activePreventa) throw new Error('No hay preventa activa')
      const preId = activePreventa.id
      const fallbackDate = activePreventa.fechaPreventa || todayIso()

      const lineas = sortedProductos.flatMap((prod) => {
        const existing = activePreventaDetalle?.lineas.find((l) => l.productoId === prod.id)
        const raw = drafts[preId]?.[prod.id] ?? (existing ? String(existing.cantidadPrevista) : '0')
        const cantidad = Number(raw.replace(',', '.'))
        if (!Number.isFinite(cantidad) || cantidad <= 0) return []

        return [{
          id: existing?.id,
          productoId: prod.id,
          fechaObjetivo: existing?.fechaObjetivo ?? fallbackDate,
          cantidadPrevista: cantidad,
          estadoLinea: existing?.estadoLinea ?? 'Previsto',
          observaciones: existing?.observaciones ?? null,
        }]
      })

      await api.put(`/preventas/${preId}/lineas`, { lineas })
      return preId
    },
    onSuccess: async (preId) => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['preventas'] }),
        qc.invalidateQueries({ queryKey: ['preventa-detalle', preId] }),
      ])
      setDirtyIds((prev) => {
        const s = new Set(prev)
        s.delete(preId)
        return s
      })
      setDrafts((prev) => {
        const d = { ...prev }
        delete d[preId]
        return d
      })
      toast.success('Cambios guardados')
    },
    onError: (e: any) => toast.error(e?.response?.data?.errors?.[0] ?? 'Error al guardar'),
  })

  const crearMutation = useMutation({
    mutationFn: async () => {
      if (!selectedClienteId) throw new Error('Sin cliente seleccionado')

      const lineas = sortedProductos.flatMap((prod) => {
        const n = Number((newColDraft[prod.id] ?? '').replace(',', '.'))
        if (!Number.isFinite(n) || n <= 0) return []
        return [{
          productoId: prod.id,
          fechaObjetivo: newColDate,
          cantidadPrevista: n,
          estadoLinea: 'Previsto' as const,
        }]
      })

      if (lineas.length === 0) {
        throw new Error('Introduce al menos una cantidad para crear la preventa')
      }

      await api.post('/preventas/crear', {
        clienteId: selectedClienteId,
        fechaPreventa: newColDate,
        notas: null,
        lineas,
      })
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['preventas'] })
      setShowNewColumn(false)
      setNewColDraft({})
      setNewColDate(todayIso())
      toast.success('Preventa creada')
    },
    onError: (e: any) => toast.error(e?.response?.data?.errors?.[0] ?? e?.message ?? 'Error al crear'),
  })

  const validarMutation = useMutation({
    mutationFn: async (preventaId: number) => {
      const data = (await api.post<{ data: ValidacionConversion }>(`/preventas/${preventaId}/validar-conversion`, {})).data.data
      return { preventaId, data }
    },
    onSuccess: ({ preventaId, data }) => setModal({ open: true, preventaId, data }),
    onError: (e: any) => toast.error(e?.response?.data?.errors?.[0] ?? 'Error al validar'),
  })

  const convertirMutation = useMutation({
    mutationFn: async (preventaId: number) => {
      return (await api.post<{ data: { pedidoId: number } }>(`/preventas/${preventaId}/convertir`, {
        alertaConfirmada: true,
      })).data.data
    },
    onSuccess: async (data, preventaId) => {
      setModal({ open: false, preventaId: null, data: null })
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['preventas'] }),
        qc.invalidateQueries({ queryKey: ['preventa-detalle', preventaId] }),
        qc.invalidateQueries({ queryKey: ['pedidos'] }),
      ])
      toast.success(`Pedido #${data.pedidoId} creado correctamente`)
    },
    onError: (e: any) => toast.error(e?.response?.data?.errors?.[0] ?? 'Error al convertir'),
  })

  const cancelarMutation = useMutation({
    mutationFn: async (preventaId: number) => {
      await api.post(`/preventas/${preventaId}/cancelar`, {})
    },
    onSuccess: async (_, preventaId) => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['preventas'] }),
        qc.invalidateQueries({ queryKey: ['preventa-detalle', preventaId] }),
      ])
      toast.success('Preventa cancelada')
    },
    onError: (e: any) => toast.error(e?.response?.data?.errors?.[0] ?? 'Error al cancelar'),
  })

  const todayDisplay = new Date().toLocaleDateString('es-ES', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  const hasContent = pedidosHistoricosFiltrados.length > 0 || !!activePreventa || showNewColumn

  return (
    <div className="page-shell space-y-5">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Preventa</h1>
        <p className="text-sm text-gray-500 mt-0.5 capitalize">{todayDisplay}</p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <div className="flex items-center gap-2 shrink-0">
            <Users className="w-4 h-4 text-brand-600" />
            <span className="text-sm font-semibold text-gray-700">Cliente</span>
          </div>
          <select
            className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white font-medium text-gray-800"
            value={selectedClienteId ?? ''}
            onChange={(e) => {
              const id = e.target.value ? Number(e.target.value) : null
              setSelectedClienteId(id)
              setShowNewColumn(false)
              setNewColDraft({})
              setDrafts({})
              setDirtyIds(new Set())
            }}
          >
            <option value="">--- Seleccionar cliente ---</option>
            {(clientes ?? []).map((c) => (
              <option key={c.id} value={c.id}>{nombreCliente(c)}</option>
            ))}
          </select>
          {selectedClienteId && (
            <button
              onClick={() => {
                setShowNewColumn((v) => !v)
                setNewColDraft({})
              }}
              className="flex items-center gap-2 px-4 py-2.5 bg-brand-600 text-white rounded-lg text-sm font-semibold hover:bg-brand-700 transition-colors whitespace-nowrap shadow-sm"
            >
              <Plus className="w-4 h-4" /> Nueva preventa
            </button>
          )}
        </div>
        {selectedClienteId && (
          <div className="mt-3 pt-3 border-t border-gray-100 flex flex-col md:flex-row md:items-center gap-2">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Periodo historico</span>
            <select
              value={periodoFiltro}
              onChange={(e) => setPeriodoFiltro(e.target.value as '7d' | '15d' | '30d' | '90d' | 'all' | 'custom')}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white text-gray-800"
            >
              <option value="7d">Ultimos 7 dias</option>
              <option value="15d">Ultimos 15 dias</option>
              <option value="30d">Ultimos 30 dias</option>
              <option value="90d">Ultimos 90 dias</option>
              <option value="all">Todo el historico</option>
              <option value="custom">Rango personalizado</option>
            </select>
            {periodoFiltro === 'custom' && (
              <>
                <input
                  type="date"
                  value={customDesde}
                  onChange={(e) => setCustomDesde(e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
                <input
                  type="date"
                  value={customHasta}
                  onChange={(e) => setCustomHasta(e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </>
            )}
            <span className="text-xs text-gray-400 md:ml-auto">
              {pedidosHistoricosFiltrados.length} fechas visibles
            </span>
          </div>
        )}
      </div>

      {!selectedClienteId && (
        <div className="bg-white rounded-xl border border-gray-200 py-20 text-center shadow-sm">
          <Calendar className="w-14 h-14 text-gray-200 mx-auto mb-4" />
          <p className="text-gray-600 font-semibold text-base">Selecciona un cliente para comenzar</p>
          <p className="text-sm text-gray-400 mt-1">Se mostrara su historico de pedidos para preparar la nueva preventa</p>
        </div>
      )}

      {selectedClienteId && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
          {(loadingPreventas || loadingPedidos || loadingPreventaDetalle || isLoadingPedidoDetails) && (
            <div className="flex items-center gap-2.5 px-5 py-2.5 bg-brand-50 border-b border-brand-100">
              <Loader2 className="w-4 h-4 animate-spin text-brand-600" />
              <span className="text-sm text-brand-700 font-medium">Cargando historial...</span>
            </div>
          )}

          {!hasContent && !loadingPedidos && !loadingPreventas && (
            <div className="py-16 text-center">
              <Calendar className="w-10 h-10 text-gray-200 mx-auto mb-3" />
              <p className="text-gray-500 font-medium">
                {selectedCliente ? nombreCliente(selectedCliente) : 'Este cliente'} no tiene pedidos ni preventa activa
              </p>
              <p className="text-sm text-gray-400 mt-1">
                Pulsa <strong className="text-brand-600">Nueva preventa</strong> para crear una columna editable
              </p>
            </div>
          )}

          {hasContent && (
            <div className="overflow-x-auto">
              <table className="border-collapse" style={{ width: 'max-content', minWidth: '100%' }}>
                <colgroup>
                  <col style={{ width: '210px' }} />
                  {pedidosHistoricosFiltrados.map((p) => <col key={`pedido-${p.id}`} style={{ width: '135px' }} />)}
                  {activePreventa && <col style={{ width: '150px' }} />}
                  {showNewColumn && <col style={{ width: '155px' }} />}
                </colgroup>

                <thead>
                  <tr>
                    <th
                      className="sticky left-0 z-20 px-4 py-3 text-left text-xs font-bold text-white uppercase tracking-wider border-r"
                      style={{
                        backgroundColor: 'var(--brand-primary-darker)',
                        borderRightColor: 'var(--brand-primary-dark)',
                      }}
                    >
                      Producto
                    </th>

                    {pedidosHistoricosFiltrados.map((pedido) => {
                      const theme = pedidoTheme(pedido.estado)
                      const dateValue = pedido.fechaEntrega ?? pedido.fecha
                      return (
                        <th key={`pedido-head-${pedido.id}`} className={`px-2 py-2.5 text-center border-r border-gray-200 ${theme.header}`}>
                          <div className="flex flex-col items-center gap-1">
                            <span className="text-sm font-bold tabular-nums">{formatDate(dateValue)}</span>
                            <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${theme.badge}`}>
                              {labelPedidoEstado(pedido.estado)}
                            </span>
                            <span className="text-[10px] font-semibold opacity-80">{pedido.numeroPedido}</span>
                          </div>
                        </th>
                      )
                    })}

                    {activePreventa && (
                      <th className={`px-2 py-2.5 text-center border-r border-gray-200 ${(PREVENTA_THEME[activePreventa.estado] ?? PREVENTA_THEME.Borrador).header}`}>
                        <div className="flex flex-col items-center gap-1">
                          <span className="text-xs font-bold">Preventa activa</span>
                          <span className="text-sm font-bold tabular-nums">{formatDate(activePreventa.fechaPreventa)}</span>
                          <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${(PREVENTA_THEME[activePreventa.estado] ?? PREVENTA_THEME.Borrador).badge}`}>
                            {labelPreventaEstado(activePreventa.estado)}
                          </span>
                          {dirtyIds.has(activePreventa.id) && (
                            <span className="text-[10px] text-orange-500 font-bold animate-pulse">Sin guardar</span>
                          )}
                        </div>
                      </th>
                    )}

                    {showNewColumn && (
                      <th className="px-2 py-2.5 text-center bg-brand-600 border-r border-brand-500">
                        <div className="flex flex-col items-center gap-1.5">
                          <span className="text-xs font-bold text-white">Nueva preventa</span>
                          <input
                            type="date"
                            value={newColDate}
                            onChange={(e) => setNewColDate(e.target.value)}
                            className="w-full px-2 py-1 border border-brand-400 rounded text-xs text-center focus:outline-none focus:ring-2 focus:ring-white bg-brand-700 text-white"
                          />
                          <button
                            onClick={() => {
                              setShowNewColumn(false)
                              setNewColDraft({})
                            }}
                            className="text-[10px] text-brand-200 hover:text-white transition-colors"
                          >
                            Cancelar
                          </button>
                        </div>
                      </th>
                    )}
                  </tr>
                </thead>

                <tbody>
                  {sortedProductos.map((prod, rowIdx) => (
                    <tr key={prod.id} className={`border-b border-gray-100 ${rowIdx % 2 === 0 ? 'bg-white' : 'bg-gray-50/60'}`}>
                      <td className="sticky left-0 z-10 px-4 py-2 text-sm font-medium text-gray-800 border-r border-gray-200 bg-inherit truncate max-w-[210px]" title={prod.nombre}>
                        {prod.nombre}
                      </td>

                      {pedidosHistoricosFiltrados.map((pedido) => {
                        const qty = getPedidoCellValue(pedido, prod.id)
                        return (
                          <td key={`pedido-cell-${pedido.id}-${prod.id}`} className="px-1.5 py-1 text-center border-r border-gray-100">
                            <span className={`text-sm font-bold ${qty > 0 ? 'text-gray-800' : 'text-gray-300'}`}>{qty}</span>
                          </td>
                        )
                      })}

                      {activePreventa && (() => {
                        const val = getPreventaCellValue(prod.id)
                        const numVal = Number(val.replace(',', '.'))
                        const hasValue = Number.isFinite(numVal) && numVal > 0
                        const isDraftCell = drafts[activePreventa.id]?.[prod.id] !== undefined
                        return (
                          <td className={`px-1.5 py-1 text-center border-r border-gray-100 transition-colors ${hasValue ? isDraftCell ? 'bg-orange-50' : 'bg-indigo-50/80' : ''}`}>
                            <input
                              type="number"
                              min="0"
                              step="1"
                              value={hasValue || isDraftCell ? (val === '0' ? '' : val) : ''}
                              placeholder="0"
                              onChange={(e) => setPreventaCellValue(prod.id, e.target.value)}
                              className={`w-full px-1 py-1.5 text-center text-sm rounded border transition-all focus:outline-none focus:ring-2 focus:ring-brand-400 ${
                                hasValue
                                  ? isDraftCell
                                    ? 'border-orange-300 bg-orange-50 text-orange-900 font-bold'
                                    : 'border-indigo-200 bg-indigo-50 text-indigo-900 font-bold'
                                  : 'border-transparent hover:border-gray-300 bg-transparent text-gray-400 placeholder:text-gray-300'
                              }`}
                            />
                          </td>
                        )
                      })()}

                      {showNewColumn && (
                        <td className="px-1.5 py-1 text-center border-r border-brand-100 bg-brand-50/30">
                          <input
                            type="number"
                            min="0"
                            step="1"
                            value={newColDraft[prod.id] ?? ''}
                            placeholder="0"
                            onChange={(e) => setNewColDraft((prev) => ({ ...prev, [prod.id]: e.target.value }))}
                            className="w-full px-1 py-1.5 text-center text-sm rounded border border-brand-200 focus:outline-none focus:ring-2 focus:ring-brand-400 bg-white font-medium placeholder:text-gray-300"
                          />
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>

                <tfoot>
                  <tr className="border-t-2 border-gray-300 bg-gray-100">
                    <td className="sticky left-0 z-10 px-4 py-2.5 text-xs font-bold text-gray-600 uppercase tracking-wide border-r border-gray-200 bg-gray-100">
                      Total uds.
                    </td>

                    {pedidosHistoricosFiltrados.map((pedido) => (
                      <td key={`pedido-total-${pedido.id}`} className="px-2 py-2.5 text-center border-r border-gray-200">
                        <span className="text-base font-extrabold text-gray-800 tabular-nums">{getPedidoColumnTotal(pedido)}</span>
                      </td>
                    ))}

                    {activePreventa && (
                      <td className="px-2 py-2.5 text-center border-r border-indigo-200 bg-indigo-100/70">
                        <span className="text-base font-extrabold text-indigo-800 tabular-nums">{getPreventaTotal()}</span>
                      </td>
                    )}

                    {showNewColumn && (
                      <td className="px-2 py-2.5 text-center border-r border-brand-200 bg-brand-100">
                        <span className="text-base font-extrabold text-brand-800 tabular-nums">{getNewColTotal()}</span>
                      </td>
                    )}
                  </tr>

                  <tr className="bg-white border-t border-gray-100">
                    <td className="sticky left-0 z-10 px-4 py-2.5 border-r border-gray-200 bg-white text-xs font-bold text-gray-500 uppercase tracking-wide">
                      Acciones
                    </td>

                    {pedidosHistoricosFiltrados.map((pedido) => (
                      <td key={`pedido-action-${pedido.id}`} className="px-1.5 py-2 text-center border-r border-gray-100 align-top">
                        <span className="text-[11px] text-gray-400 font-semibold">Historico</span>
                      </td>
                    ))}

                    {activePreventa && (() => {
                      const isDirty = dirtyIds.has(activePreventa.id)
                      const canConvert = ['Borrador', 'Confirmada', 'PendienteRevision'].includes(activePreventa.estado) && !isDirty
                      return (
                        <td className="px-1.5 py-2 text-center border-r border-gray-100 align-top">
                          <div className="flex flex-col gap-1.5 items-stretch pt-1">
                            {isDirty && (
                              <button
                                onClick={() => guardarLineasMutation.mutate()}
                                disabled={guardarLineasMutation.isPending || loadingPreventaDetalle || !activePreventaDetalle}
                                className="flex items-center justify-center gap-1 px-2 py-1.5 bg-emerald-600 text-white rounded-lg text-[11px] font-bold hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                              >
                                <Save className="w-3 h-3" /> Guardar
                              </button>
                            )}

                            {canConvert && (
                              <button
                                onClick={() => validarMutation.mutate(activePreventa.id)}
                                disabled={validarMutation.isPending}
                                className="flex items-center justify-center gap-1 px-2 py-1.5 bg-brand-600 text-white rounded-lg text-[11px] font-bold hover:bg-brand-700 disabled:opacity-50 transition-colors"
                              >
                                <ShoppingCart className="w-3 h-3" /> Pasar a pedido
                              </button>
                            )}

                            <button
                              onClick={() => {
                                if (window.confirm('Cancelar esta preventa?')) cancelarMutation.mutate(activePreventa.id)
                              }}
                              disabled={cancelarMutation.isPending}
                              className="flex items-center justify-center gap-1 px-2 py-1.5 border border-red-200 text-red-600 rounded-lg text-[11px] font-medium hover:bg-red-50 disabled:opacity-50 transition-colors"
                            >
                              <Trash2 className="w-3 h-3" /> Cancelar
                            </button>
                          </div>
                        </td>
                      )
                    })()}

                    {showNewColumn && (
                      <td className="px-1.5 py-2 text-center border-r border-brand-100 bg-brand-50/30 align-top">
                        <div className="flex flex-col gap-1.5 items-stretch pt-1">
                          <button
                            onClick={() => crearMutation.mutate()}
                            disabled={crearMutation.isPending}
                            className="flex items-center justify-center gap-1 px-2 py-1.5 bg-brand-600 text-white rounded-lg text-[11px] font-bold hover:bg-brand-700 disabled:opacity-50 transition-colors"
                          >
                            {crearMutation.isPending
                              ? <Loader2 className="w-3 h-3 animate-spin" />
                              : <Save className="w-3 h-3" />}
                            Crear preventa
                          </button>
                          <button
                            onClick={() => {
                              setShowNewColumn(false)
                              setNewColDraft({})
                            }}
                            className="flex items-center justify-center gap-1 px-2 py-1.5 border border-gray-200 text-gray-500 rounded-lg text-[11px] hover:bg-gray-50 transition-colors"
                          >
                            <X className="w-3 h-3" /> Descartar
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      )}

      {modal.open && modal.data && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className={`px-6 py-4 border-b border-gray-100 flex items-center gap-3 ${modal.data.advertencias.length > 0 ? 'bg-amber-50' : 'bg-emerald-50'}`}>
              {modal.data.advertencias.length > 0
                ? <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />
                : <Check className="w-5 h-5 text-emerald-500 shrink-0" />}
              <h3 className="font-bold text-gray-900 text-base flex-1">Pasar preventa a pedido</h3>
              <button onClick={() => setModal({ open: false, preventaId: null, data: null })} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="px-6 py-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-gray-50 rounded-xl p-4 text-center">
                  <p className="text-xs text-gray-500 mb-1">Lineas a convertir</p>
                  <p className="text-3xl font-extrabold text-gray-900">{modal.data.lineasConvertibles}</p>
                </div>
                <div className="bg-gray-50 rounded-xl p-4 text-center">
                  <p className="text-xs text-gray-500 mb-1">Total unidades</p>
                  <p className="text-3xl font-extrabold text-gray-900">{modal.data.cantidadTotal}</p>
                </div>
              </div>

              {modal.data.advertencias.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-1.5">
                  <p className="text-xs font-bold text-amber-800 uppercase tracking-wide mb-2">Advertencias</p>
                  {modal.data.advertencias.map((w, i) => (
                    <p key={i} className="text-xs text-amber-700 flex items-start gap-1.5">
                      <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" />
                      {w}
                    </p>
                  ))}
                </div>
              )}

              <div className="flex gap-3 pt-1">
                <button
                  onClick={() => setModal({ open: false, preventaId: null, data: null })}
                  className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => modal.preventaId && convertirMutation.mutate(modal.preventaId)}
                  disabled={convertirMutation.isPending}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-brand-600 text-white rounded-xl text-sm font-bold hover:bg-brand-700 disabled:opacity-50 transition-colors shadow-sm"
                >
                  {convertirMutation.isPending
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : <ShoppingCart className="w-4 h-4" />}
                  Confirmar pedido
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
