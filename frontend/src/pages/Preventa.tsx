import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import api from '../lib/api'
import type {
  Cliente,
  Producto,
  PreventaDetalle,
  PreventaLineaInput,
  PreventaResumen,
  ValidacionConversion,
} from '../types'
import { ClipboardList, Plus, Save, RefreshCw, AlertTriangle, ArrowRightLeft, Search, X } from 'lucide-react'

const ESTADO_COLOR: Record<string, string> = {
  Borrador: 'bg-gray-100 text-gray-700 border border-gray-200',
  PendienteRevision: 'bg-amber-50 text-amber-700 border border-amber-200',
  Confirmada: 'bg-blue-50 text-blue-700 border border-blue-200',
  Convertida: 'bg-green-50 text-green-700 border border-green-200',
  Cancelada: 'bg-red-50 text-red-700 border border-red-200',
}

const ESTADO_LINEA_COLOR: Record<string, string> = {
  Previsto: 'bg-gray-100 text-gray-600',
  PendienteCompra: 'bg-amber-50 text-amber-700',
  ListoParaPedido: 'bg-blue-50 text-blue-700',
  NoServible: 'bg-red-50 text-red-700',
  Cancelada: 'bg-red-50 text-red-600',
}

function labelEstado(e: string) {
  const map: Record<string, string> = {
    Borrador: 'Borrador',
    PendienteRevision: 'Pendiente revisión',
    Confirmada: 'Confirmada',
    Convertida: 'Convertida',
    Cancelada: 'Cancelada',
  }
  return map[e] ?? e
}

interface DraftLinea {
  id?: number
  productoId: number
  fechaObjetivo: string
  cantidadPrevista: string
  cantidadFinal: string
  estadoLinea: string
  observaciones: string
}

function todayIso() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function toNumber(value: string) {
  const n = Number(value.replace(',', '.'))
  return Number.isFinite(n) ? n : 0
}

function nombreCliente(c: Cliente) {
  return c.razonSocial || `${c.nombre} ${c.apellidos ?? ''}`.trim() || c.nombre
}

export default function Preventa() {
  const qc = useQueryClient()

  const [showCreate, setShowCreate] = useState(false)
  const [selectedId, setSelectedId] = useState<number | null>(null)

  const [createClienteId, setCreateClienteId] = useState('')
  const [createFecha, setCreateFecha] = useState(todayIso())
  const [createNotas, setCreateNotas] = useState('')
  const [createLineas, setCreateLineas] = useState<DraftLinea[]>([
    {
      productoId: 0,
      fechaObjetivo: todayIso(),
      cantidadPrevista: '0',
      cantidadFinal: '',
      estadoLinea: 'Previsto',
      observaciones: '',
    },
  ])

  const [editClienteId, setEditClienteId] = useState('')
  const [editFecha, setEditFecha] = useState(todayIso())
  const [editEstado, setEditEstado] = useState('Borrador')
  const [editNotas, setEditNotas] = useState('')
  const [editLineas, setEditLineas] = useState<DraftLinea[]>([])

  const [warningModalOpen, setWarningModalOpen] = useState(false)
  const [warningData, setWarningData] = useState<ValidacionConversion | null>(null)
  const [confirmChecked, setConfirmChecked] = useState(false)

  const { data: clientes } = useQuery({
    queryKey: ['clientes'],
    queryFn: async () => (await api.get<{ data: Cliente[] }>('/clientes')).data.data,
  })

  const { data: productos } = useQuery({
    queryKey: ['productos'],
    queryFn: async () => (await api.get<{ data: Producto[] }>('/productos')).data.data,
  })

  const { data: preventas, isLoading } = useQuery({
    queryKey: ['preventas'],
    queryFn: async () => (await api.get<{ data: PreventaResumen[] }>('/preventas')).data.data,
  })

  const { data: detalle, isFetching: cargandoDetalle } = useQuery({
    queryKey: ['preventa-detalle', selectedId],
    enabled: selectedId !== null,
    queryFn: async () => (await api.get<{ data: PreventaDetalle }>(`/preventas/${selectedId}`)).data.data,
  })

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!createClienteId) throw new Error('Selecciona un cliente')
      const lineas = buildLineasPayload(createLineas)
      if (!lineas.length) throw new Error('Añade al menos una línea válida')

      await api.post('/preventas/crear', {
        clienteId: Number(createClienteId),
        fechaPreventa: createFecha,
        notas: createNotas || null,
        lineas,
      })
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['preventas'] })
      toast.success('Preventa creada')
      setShowCreate(false)
      setCreateClienteId('')
      setCreateFecha(todayIso())
      setCreateNotas('')
      setCreateLineas([
        {
          productoId: 0,
          fechaObjetivo: todayIso(),
          cantidadPrevista: '0',
          cantidadFinal: '',
          estadoLinea: 'Previsto',
          observaciones: '',
        },
      ])
    },
    onError: (e: any) => toast.error(e?.response?.data?.errors?.[0] ?? e?.message ?? 'Error al crear preventa'),
  })

  const guardarCabeceraMutation = useMutation({
    mutationFn: async () => {
      if (!selectedId) return
      await api.put(`/preventas/${selectedId}`, {
        clienteId: Number(editClienteId),
        fechaPreventa: editFecha,
        estado: editEstado,
        notas: editNotas,
      })
    },
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['preventas'] }),
        qc.invalidateQueries({ queryKey: ['preventa-detalle', selectedId] }),
      ])
      toast.success('Cabecera de preventa actualizada')
    },
    onError: (e: any) => toast.error(e?.response?.data?.errors?.[0] ?? 'Error al guardar cabecera'),
  })

  const guardarLineasMutation = useMutation({
    mutationFn: async () => {
      if (!selectedId) return
      await api.put(`/preventas/${selectedId}/lineas`, {
        lineas: buildLineasPayload(editLineas),
      })
    },
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['preventas'] }),
        qc.invalidateQueries({ queryKey: ['preventa-detalle', selectedId] }),
      ])
      toast.success('Líneas actualizadas')
    },
    onError: (e: any) => toast.error(e?.response?.data?.errors?.[0] ?? 'Error al guardar líneas'),
  })

  const validarMutation = useMutation({
    mutationFn: async () => {
      if (!selectedId) throw new Error('Selecciona una preventa')
      return (await api.post<{ data: ValidacionConversion }>(`/preventas/${selectedId}/validar-conversion`, {})).data.data
    },
    onSuccess: (data) => {
      setWarningData(data)
      setConfirmChecked(false)
      setWarningModalOpen(true)
    },
    onError: (e: any) => toast.error(e?.response?.data?.errors?.[0] ?? 'Error validando conversión'),
  })

  const convertirMutation = useMutation({
    mutationFn: async () => {
      if (!selectedId) throw new Error('Selecciona una preventa')
      return await api.post<{ data: { pedidoId: number } }>(`/preventas/${selectedId}/convertir`, { alertaConfirmada: true })
    },
    onSuccess: async (resp) => {
      setWarningModalOpen(false)
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['preventas'] }),
        qc.invalidateQueries({ queryKey: ['preventa-detalle', selectedId] }),
        qc.invalidateQueries({ queryKey: ['pedidos'] }),
      ])
      const pedidoId = resp.data?.data?.pedidoId
      toast.success(pedidoId ? `Preventa convertida a pedido #${pedidoId}` : 'Preventa convertida a pedido')
    },
    onError: (e: any) => toast.error(e?.response?.data?.errors?.[0] ?? 'Error al convertir preventa'),
  })

  const cancelarMutation = useMutation({
    mutationFn: async () => {
      if (!selectedId) return
      await api.post(`/preventas/${selectedId}/cancelar`, {})
    },
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['preventas'] }),
        qc.invalidateQueries({ queryKey: ['preventa-detalle', selectedId] }),
      ])
      toast.success('Preventa cancelada')
    },
    onError: (e: any) => toast.error(e?.response?.data?.errors?.[0] ?? 'Error al cancelar preventa'),
  })

  const productoMap = useMemo(() => {
    const m = new Map<number, string>()
    for (const p of productos ?? []) m.set(p.id, p.nombre)
    return m
  }, [productos])

  const canEdit = detalle?.estado !== 'Convertida' && detalle?.estado !== 'Cancelada'

  useEffect(() => {
    if (!detalle) return
    syncEditorWithDetalle(detalle)
  }, [detalle])

  function buildLineasPayload(lineas: DraftLinea[]): PreventaLineaInput[] {
    return lineas
      .filter((l) => l.productoId > 0)
      .filter((l) => toNumber(l.cantidadPrevista) >= 0)
      .map((l) => ({
        id: l.id,
        productoId: l.productoId,
        fechaObjetivo: l.fechaObjetivo || todayIso(),
        cantidadPrevista: toNumber(l.cantidadPrevista),
        cantidadFinal: l.cantidadFinal.trim() ? toNumber(l.cantidadFinal) : null,
        estadoLinea: l.estadoLinea,
        observaciones: l.observaciones || null,
      }))
  }

  function syncEditorWithDetalle(data: PreventaDetalle) {
    setEditClienteId(String(data.clienteId))
    setEditFecha(data.fechaPreventa)
    setEditEstado(data.estado)
    setEditNotas(data.notas ?? '')
    setEditLineas(
      data.lineas.map((l) => ({
        id: l.id,
        productoId: l.productoId,
        fechaObjetivo: l.fechaObjetivo,
        cantidadPrevista: String(l.cantidadPrevista),
        cantidadFinal: l.cantidadFinal == null ? '' : String(l.cantidadFinal),
        estadoLinea: l.estadoLinea,
        observaciones: l.observaciones ?? '',
      }))
    )
  }

  const [searchTerm, setSearchTerm] = useState('')
  const [estadoFilter, setEstadoFilter] = useState('')

  const filteredPreventas = useMemo(() => {
    if (!preventas) return []
    let result = [...preventas]
    if (estadoFilter) result = result.filter(p => p.estado === estadoFilter)
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase()
      result = result.filter(p =>
        p.clienteNombre?.toLowerCase().includes(q) ||
        p.fechaPreventa?.includes(q) ||
        String(p.id).includes(q)
      )
    }
    return result
  }, [preventas, searchTerm, estadoFilter])

  const stats = useMemo(() => ({
    total: (preventas ?? []).length,
    borradores: (preventas ?? []).filter(p => p.estado === 'Borrador').length,
    confirmadas: (preventas ?? []).filter(p => p.estado === 'Confirmada').length,
  }), [preventas])

  return (
    <div className="page-shell space-y-5">

      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Preventa</h1>
          <p className="text-sm text-gray-500 mt-0.5">Planifica sin bloquear por stock · convierte a pedido tras revisión</p>
        </div>
        <button
          onClick={() => setShowCreate(v => !v)}
          className="flex items-center gap-2 px-4 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-700"
        >
          <Plus className="w-4 h-4" />
          Nueva preventa
        </button>
      </div>

      {/* ── Stats ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: 'Total preventas', value: stats.total },
          { label: 'Borradores', value: stats.borradores },
          { label: 'Confirmadas', value: stats.confirmadas },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs text-gray-500">{s.label}</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{s.value}</p>
          </div>
        ))}
      </div>

      {/* ── Formulario nueva preventa ───────────────────────────── */}
      {showCreate && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ClipboardList className="w-4 h-4 text-gray-500" />
              <span className="font-semibold text-gray-800 text-sm">Nueva preventa</span>
            </div>
            <button onClick={() => setShowCreate(false)} className="text-gray-400 hover:text-gray-600">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="p-5 space-y-5">
            {/* Cabecera */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Cliente</label>
                <select
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  value={createClienteId}
                  onChange={e => setCreateClienteId(e.target.value)}
                >
                  <option value="">Seleccionar cliente…</option>
                  {(clientes ?? []).map(c => <option key={c.id} value={c.id}>{nombreCliente(c)}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Fecha preventa</label>
                <input
                  type="date"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  value={createFecha}
                  onChange={e => setCreateFecha(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Notas</label>
                <input
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  value={createNotas}
                  onChange={e => setCreateNotas(e.target.value)}
                  placeholder="Opcional"
                />
              </div>
            </div>

            {/* Líneas */}
            <div className="space-y-2">
              <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Líneas</p>
              {createLineas.map((l, idx) => (
                <div key={`new-${idx}`} className="grid grid-cols-2 md:grid-cols-6 gap-2 items-end bg-gray-50 rounded-lg p-3 border border-gray-100">
                  <div className="col-span-2">
                    <label className="block text-xs font-medium text-gray-500 mb-1">Producto</label>
                    <select
                      className="w-full px-2 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                      value={l.productoId}
                      onChange={e => { const v = Number(e.target.value); setCreateLineas(prev => prev.map((x, i) => i === idx ? { ...x, productoId: v } : x)) }}
                    >
                      <option value={0}>Seleccionar…</option>
                      {(productos ?? []).map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Fecha objetivo</label>
                    <input
                      type="date"
                      className="w-full px-2 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none"
                      value={l.fechaObjetivo}
                      onChange={e => setCreateLineas(prev => prev.map((x, i) => i === idx ? { ...x, fechaObjetivo: e.target.value } : x))}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Prevista</label>
                    <input
                      className="w-full px-2 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none"
                      value={l.cantidadPrevista}
                      onChange={e => setCreateLineas(prev => prev.map((x, i) => i === idx ? { ...x, cantidadPrevista: e.target.value } : x))}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Final</label>
                    <input
                      className="w-full px-2 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none"
                      value={l.cantidadFinal}
                      onChange={e => setCreateLineas(prev => prev.map((x, i) => i === idx ? { ...x, cantidadFinal: e.target.value } : x))}
                      placeholder="Opcional"
                    />
                  </div>
                  <div className="flex items-end">
                    <button
                      className="w-full h-9 px-2 rounded-lg border border-gray-200 text-xs text-gray-500 hover:bg-gray-100 disabled:opacity-40"
                      onClick={() => setCreateLineas(prev => prev.filter((_, i) => i !== idx))}
                      disabled={createLineas.length === 1}
                    >
                      Quitar
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button
                className="flex items-center gap-1 px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50"
                onClick={() => setCreateLineas(prev => [...prev, { productoId: 0, fechaObjetivo: createFecha || todayIso(), cantidadPrevista: '0', cantidadFinal: '', estadoLinea: 'Previsto', observaciones: '' }])}
              >
                <Plus className="w-3 h-3" /> Añadir línea
              </button>
              <button
                className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-60"
                disabled={createMutation.isPending}
                onClick={() => createMutation.mutate()}
              >
                <Save className="w-4 h-4" /> Guardar preventa
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Listado ────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {/* Barra filtros */}
        <div className="px-4 py-3 border-b border-gray-100 flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="Buscar por cliente, fecha o nº…"
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
            <option value="PendienteRevision">Pendiente revisión</option>
            <option value="Confirmada">Confirmada</option>
            <option value="Convertida">Convertida</option>
            <option value="Cancelada">Cancelada</option>
          </select>
          {(searchTerm || estadoFilter) && (
            <button onClick={() => { setSearchTerm(''); setEstadoFilter('') }} className="text-xs text-gray-500 hover:text-gray-700">
              Limpiar
            </button>
          )}
          <span className="text-xs text-gray-400">{filteredPreventas.length} de {(preventas ?? []).length}</span>
        </div>

        {/* Tabla */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {['#', 'Fecha', 'Cliente', 'Estado', 'Líneas'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {isLoading ? (
                <tr><td colSpan={5} className="px-4 py-6 text-center text-sm text-gray-400">Cargando…</td></tr>
              ) : !filteredPreventas.length ? (
                <tr><td colSpan={5} className="px-4 py-6 text-center text-sm text-gray-400">No hay preventas registradas.</td></tr>
              ) : filteredPreventas.map(p => (
                <tr
                  key={p.id}
                  onClick={() => setSelectedId(p.id)}
                  className={`cursor-pointer transition-colors hover:bg-gray-50 ${selectedId === p.id ? 'bg-brand-50 border-l-2 border-brand-500' : ''}`}
                >
                  <td className="px-4 py-3 font-medium text-gray-900">#{p.id}</td>
                  <td className="px-4 py-3 text-gray-600">{p.fechaPreventa}</td>
                  <td className="px-4 py-3 text-gray-800">{p.clienteNombre}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${ESTADO_COLOR[p.estado] ?? 'bg-gray-100 text-gray-600'}`}>
                      {labelEstado(p.estado)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{p.totalLineas}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Panel detalle ───────────────────────────────────────── */}
      {selectedId && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {cargandoDetalle || !detalle ? (
            <div className="p-6 text-sm text-gray-400 text-center">Cargando detalle…</div>
          ) : (
            <>
              {/* Cabecera panel */}
              <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <h2 className="text-base font-bold text-gray-900">Preventa #{detalle.id}</h2>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${ESTADO_COLOR[detalle.estado] ?? 'bg-gray-100 text-gray-600'}`}>
                    {labelEstado(detalle.estado)}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 rounded-lg text-xs text-gray-600 hover:bg-gray-50"
                    onClick={() => syncEditorWithDetalle(detalle)}
                  >
                    <RefreshCw className="w-3 h-3" /> Recargar
                  </button>
                  <button className="text-gray-400 hover:text-gray-600" onClick={() => setSelectedId(null)}>
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="p-5 space-y-6">
                {/* Datos cabecera */}
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Datos generales</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Cliente</label>
                      <select
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:bg-gray-50 disabled:text-gray-400"
                        disabled={!canEdit}
                        value={editClienteId}
                        onChange={e => setEditClienteId(e.target.value)}
                      >
                        <option value="">Seleccionar…</option>
                        {(clientes ?? []).map(c => <option key={c.id} value={c.id}>{nombreCliente(c)}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Fecha preventa</label>
                      <input
                        type="date"
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:bg-gray-50 disabled:text-gray-400"
                        disabled={!canEdit}
                        value={editFecha}
                        onChange={e => setEditFecha(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Estado</label>
                      <select
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:bg-gray-50 disabled:text-gray-400"
                        value={editEstado}
                        disabled={!canEdit}
                        onChange={e => setEditEstado(e.target.value)}
                      >
                        {['Borrador', 'PendienteRevision', 'Confirmada', 'Cancelada'].map(st => (
                          <option key={st} value={st}>{labelEstado(st)}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Notas</label>
                      <input
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:bg-gray-50 disabled:text-gray-400"
                        value={editNotas}
                        disabled={!canEdit}
                        onChange={e => setEditNotas(e.target.value)}
                        placeholder="Sin notas"
                      />
                    </div>
                  </div>
                  <div className="flex gap-2 mt-4">
                    <button
                      className="flex items-center gap-2 px-4 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-700 disabled:opacity-50"
                      disabled={!canEdit || guardarCabeceraMutation.isPending}
                      onClick={() => guardarCabeceraMutation.mutate()}
                    >
                      <Save className="w-4 h-4" /> Guardar cabecera
                    </button>
                    <button
                      className="flex items-center gap-2 px-4 py-2 border border-red-200 text-red-700 rounded-lg text-sm hover:bg-red-50 disabled:opacity-50"
                      disabled={!canEdit || cancelarMutation.isPending}
                      onClick={() => cancelarMutation.mutate()}
                    >
                      Cancelar preventa
                    </button>
                  </div>
                </div>

                {/* Líneas */}
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Líneas de preventa</p>
                  <div className="space-y-2">
                    {editLineas.map((l, idx) => (
                      <div key={`edit-${l.id ?? idx}`} className="bg-gray-50 rounded-lg border border-gray-100 p-3">
                        <div className="grid grid-cols-2 md:grid-cols-6 gap-3 items-end">
                          <div className="col-span-2">
                            <label className="block text-xs font-medium text-gray-500 mb-1">Producto</label>
                            <select
                              className="w-full px-2 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none disabled:bg-white disabled:text-gray-400"
                              disabled={!canEdit}
                              value={l.productoId}
                              onChange={e => { const v = Number(e.target.value); setEditLineas(prev => prev.map((x, i) => i === idx ? { ...x, productoId: v } : x)) }}
                            >
                              <option value={0}>Seleccionar…</option>
                              {(productos ?? []).map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1">Fecha objetivo</label>
                            <input
                              type="date"
                              className="w-full px-2 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none disabled:bg-white disabled:text-gray-400"
                              disabled={!canEdit}
                              value={l.fechaObjetivo}
                              onChange={e => setEditLineas(prev => prev.map((x, i) => i === idx ? { ...x, fechaObjetivo: e.target.value } : x))}
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1">Prevista</label>
                            <input
                              className="w-full px-2 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none disabled:bg-white disabled:text-gray-400"
                              disabled={!canEdit}
                              value={l.cantidadPrevista}
                              onChange={e => setEditLineas(prev => prev.map((x, i) => i === idx ? { ...x, cantidadPrevista: e.target.value } : x))}
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1">Final</label>
                            <input
                              className="w-full px-2 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none disabled:bg-white disabled:text-gray-400"
                              disabled={!canEdit}
                              value={l.cantidadFinal}
                              onChange={e => setEditLineas(prev => prev.map((x, i) => i === idx ? { ...x, cantidadFinal: e.target.value } : x))}
                              placeholder="—"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1">Estado</label>
                            <select
                              className="w-full px-2 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none disabled:bg-white disabled:text-gray-400"
                              disabled={!canEdit}
                              value={l.estadoLinea}
                              onChange={e => setEditLineas(prev => prev.map((x, i) => i === idx ? { ...x, estadoLinea: e.target.value } : x))}
                            >
                              {['Previsto', 'PendienteCompra', 'ListoParaPedido', 'NoServible', 'Cancelada'].map(st => (
                                <option key={st} value={st}>{st}</option>
                              ))}
                            </select>
                          </div>
                        </div>
                        <div className="flex items-center justify-between mt-2">
                          <div className="flex items-center gap-2">
                            <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${ESTADO_LINEA_COLOR[l.estadoLinea] ?? 'bg-gray-100 text-gray-600'}`}>
                              {l.estadoLinea}
                            </span>
                            <span className="text-xs text-gray-400">
                              {productoMap.get(l.productoId) ?? 'Sin producto'}{l.id ? ` · línea #${l.id}` : ' · nueva'}
                            </span>
                          </div>
                          {canEdit && (
                            <button
                              className="text-xs text-red-500 hover:text-red-700 px-2 py-0.5 rounded hover:bg-red-50"
                              onClick={() => setEditLineas(prev => prev.filter((_, i) => i !== idx))}
                            >
                              Quitar
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  {canEdit && (
                    <div className="flex gap-2 mt-3">
                      <button
                        className="flex items-center gap-1 px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50"
                        onClick={() => setEditLineas(prev => [...prev, { productoId: 0, fechaObjetivo: editFecha || todayIso(), cantidadPrevista: '0', cantidadFinal: '', estadoLinea: 'Previsto', observaciones: '' }])}
                      >
                        <Plus className="w-3 h-3" /> Añadir línea
                      </button>
                      <button
                        className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50"
                        disabled={guardarLineasMutation.isPending}
                        onClick={() => guardarLineasMutation.mutate()}
                      >
                        <Save className="w-4 h-4" /> Guardar líneas
                      </button>
                    </div>
                  )}
                </div>

                {/* Acción conversión */}
                <div className="pt-4 border-t border-gray-100">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Conversión a pedido</p>
                  <div className="flex flex-wrap gap-3">
                    <button
                      className="flex items-center gap-2 px-4 py-2 border border-amber-300 text-amber-800 bg-amber-50 rounded-lg text-sm font-medium hover:bg-amber-100 disabled:opacity-50"
                      onClick={() => validarMutation.mutate()}
                      disabled={validarMutation.isPending}
                    >
                      <AlertTriangle className="w-4 h-4" /> Validar stock
                    </button>
                    <button
                      className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
                      onClick={() => validarMutation.mutate()}
                      disabled={validarMutation.isPending}
                    >
                      <ArrowRightLeft className="w-4 h-4" /> Revisar y convertir a pedido
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Modal conversión ────────────────────────────────────── */}
      {warningModalOpen && warningData && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-white rounded-xl border border-gray-200 shadow-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <h3 className="text-base font-bold text-gray-900">Revisión antes de convertir</h3>
              <button onClick={() => setWarningModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-gray-50 rounded-lg p-3 border border-gray-100">
                  <p className="text-xs text-gray-500">Líneas convertibles</p>
                  <p className="text-xl font-bold text-gray-900">{warningData.lineasConvertibles}</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-3 border border-gray-100">
                  <p className="text-xs text-gray-500">Cantidad total</p>
                  <p className="text-xl font-bold text-gray-900">{warningData.cantidadTotal}</p>
                </div>
              </div>

              {warningData.advertencias.length > 0 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-1 max-h-40 overflow-auto">
                  <p className="text-xs font-semibold text-amber-800 uppercase tracking-wide mb-1">Advertencias de stock</p>
                  {warningData.advertencias.map((a, idx) => (
                    <p key={`warn-${idx}`} className="text-sm text-amber-900 flex items-start gap-1.5">
                      <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />{a}
                    </p>
                  ))}
                </div>
              )}

              <label className="flex items-start gap-2.5 text-sm text-gray-700 cursor-pointer">
                <input
                  type="checkbox"
                  className="mt-0.5 rounded"
                  checked={confirmChecked}
                  onChange={e => setConfirmChecked(e.target.checked)}
                />
                <span>He revisado la preventa y acepto convertirla a pedido, asumiendo las advertencias indicadas.</span>
              </label>

              <div className="flex justify-end gap-2 pt-1">
                <button
                  className="px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50"
                  onClick={() => setWarningModalOpen(false)}
                >
                  Cancelar
                </button>
                <button
                  className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
                  disabled={!confirmChecked || convertirMutation.isPending}
                  onClick={() => convertirMutation.mutate()}
                >
                  <ArrowRightLeft className="w-4 h-4" /> Convertir ahora
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
