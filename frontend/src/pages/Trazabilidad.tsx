import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import api from '../lib/api'
import type {
  TrazabilidadItem, Producto, Ingrediente,
  TrazaProducto, TrazaIngrediente,
} from '../types'
import {
  FileDown, Search, Loader2, AlertCircle,
  ChevronDown, ChevronRight, Package,
  AlertTriangle, Users, Leaf,
} from 'lucide-react'
import toast from 'react-hot-toast'

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(s: string | null | undefined) {
  if (!s) return '—'
  return new Date(s).toLocaleDateString('es-ES')
}
function isExpired(s: string | null | undefined) {
  return !!s && new Date(s) < new Date()
}

type Tab = 'movimientos' | 'producto' | 'ingrediente'

const ALERGENO_EMOJI: Record<string, string> = {
  GLUTEN: '🌾', CRUSTACEOS: '🦐', HUEVOS: '🥚', PESCADO: '🐟',
  CACAHUETES: '🥜', SOJA: '🫘', LACTEOS: '🥛', FRUTOS_SECOS: '🌰',
  APIO: '🌿', MOSTAZA: '🟡', SESAMO: '🌱', SO2: '💨',
  ALTRAMUCES: '🟠', MOLUSCOS: '🦑',
}

function EstadoBadge({ estado }: { estado: string }) {
  const cls =
    estado === 'Activo' ? 'bg-green-50 text-green-700' :
    estado === 'Bloqueado' ? 'bg-red-50 text-red-700' :
    estado === 'Caducado' ? 'bg-orange-50 text-orange-700' :
    'bg-gray-100 text-gray-500'
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cls}`}>{estado}</span>
  )
}

function today() { return new Date().toISOString().slice(0, 10) }
function daysAgo(n: number) {
  const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10)
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function Trazabilidad() {
  const [tab, setTab] = useState<Tab>('movimientos')

  return (
    <div className="flex flex-col flex-1 overflow-y-auto bg-gray-50">
      <div className="bg-white border-b border-gray-200 px-6 py-4 shrink-0">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Trazabilidad</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Conforme a Reglamento (CE) 178/2002 · Declaración de alérgenos CE 1169/2011
          </p>
        </div>
        <div className="flex gap-0 mt-4 -mb-px">
          {([
            { id: 'movimientos', label: 'Movimientos por fecha', icon: <FileDown className="w-3.5 h-3.5" /> },
            { id: 'producto', label: 'Por producto', icon: <Package className="w-3.5 h-3.5" /> },
            { id: 'ingrediente', label: 'Recall por ingrediente', icon: <AlertTriangle className="w-3.5 h-3.5" /> },
          ] as const).map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-5 py-2 text-sm font-medium border-b-2 transition-colors ${
                tab === t.id
                  ? 'border-brand-600 text-brand-700'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {t.icon}{t.label}
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1 p-6">
        {tab === 'movimientos' && <TabMovimientos />}
        {tab === 'producto' && <TabProducto />}
        {tab === 'ingrediente' && <TabIngrediente />}
      </div>
    </div>
  )
}

// ── TAB: Movimientos ──────────────────────────────────────────────────────────

function TabMovimientos() {
  const [desde, setDesde] = useState(daysAgo(30))
  const [hasta, setHasta] = useState(today())
  const [fetchEnabled, setFetchEnabled] = useState(false)
  const [exporting, setExporting] = useState(false)

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['trazabilidad', desde, hasta],
    queryFn: async () => {
      const res = await api.get<{ data: TrazabilidadItem[] }>(
        `/trazabilidad?desde=${desde}&hasta=${hasta}`
      )
      return res.data.data
    },
    enabled: fetchEnabled,
  })

  async function handleExportExcel() {
    try {
      setExporting(true)
      const res = await api.get(
        `/facturas/trazabilidad/excel?desde=${desde}&hasta=${hasta}`,
        { responseType: 'blob' }
      )
      const url = URL.createObjectURL(
        new Blob([res.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
      )
      const a = document.createElement('a')
      a.href = url; a.download = `trazabilidad_${desde}_${hasta}.xlsx`; a.click()
      URL.revokeObjectURL(url)
      toast.success('Excel descargado')
    } catch { toast.error('Error al exportar Excel') }
    finally { setExporting(false) }
  }

  const items = data ?? []
  const lotesBloqueados = items.filter(i => i.estadoLote === 'Bloqueado').length
  const productosUnicos = new Set(items.map(i => i.productoNombre)).size
  const lotesUnicos = new Set(items.map(i => i.lote)).size

  return (
    <div className="space-y-5">
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex items-end gap-4 flex-wrap">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Desde</label>
            <input type="date" value={desde} onChange={e => setDesde(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-500 focus:border-transparent" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Hasta</label>
            <input type="date" value={hasta} onChange={e => setHasta(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-500 focus:border-transparent" />
          </div>
          <button onClick={() => setFetchEnabled(true)} disabled={isLoading || isFetching}
            className="flex items-center gap-2 px-4 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-700 disabled:opacity-60">
            {(isLoading || isFetching) ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            Consultar
          </button>
          <button onClick={handleExportExcel} disabled={exporting || items.length === 0}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50">
            {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />}
            Exportar Excel
          </button>
        </div>
      </div>

      {items.length > 0 && (
        <div className="grid grid-cols-4 gap-4">
          {[
            { label: 'Registros', value: items.length },
            { label: 'Productos distintos', value: productosUnicos },
            { label: 'Lotes distintos', value: lotesUnicos },
            { label: 'Lotes bloqueados', value: lotesBloqueados },
          ].map(s => (
            <div key={s.label} className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-xs text-gray-500">{s.label}</p>
              <p className={`text-2xl font-bold mt-1 ${s.label.includes('bloqueados') && s.value > 0 ? 'text-red-600' : 'text-gray-900'}`}>{s.value}</p>
            </div>
          ))}
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {(isLoading || isFetching) ? (
          <div className="flex items-center justify-center py-12 text-gray-400 gap-2">
            <Loader2 className="w-5 h-5 animate-spin" /> Consultando…
          </div>
        ) : !fetchEnabled ? (
          <div className="flex flex-col items-center justify-center py-12 text-gray-400 gap-2">
            <Search className="w-8 h-8" />
            <p className="text-sm">Selecciona un período y pulsa Consultar</p>
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-gray-400 gap-2">
            <AlertCircle className="w-8 h-8" />
            <p className="text-sm">No hay registros en el período seleccionado</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  {['Fecha', 'Tipo', 'Producto', 'Lote', 'Fabricación', 'Caducidad', 'Cantidad', 'Estado', 'Cliente', 'Factura'].map(h => (
                    <th key={h} className="px-3 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {items.map((row, i) => (
                  <tr key={i} className="hover:bg-gray-50/50">
                    <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{fmtDate(row.fecha)}</td>
                    <td className="px-3 py-2">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        row.tipoOperacion === 'Venta' ? 'bg-green-50 text-green-700' :
                        row.tipoOperacion === 'Produccion' ? 'bg-blue-50 text-blue-700' :
                        'bg-gray-100 text-gray-600'}`}>{row.tipoOperacion}</span>
                    </td>
                    <td className="px-3 py-2 font-medium text-gray-900">{row.productoNombre}</td>
                    <td className="px-3 py-2 font-mono text-xs text-gray-700">{row.lote}</td>
                    <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{fmtDate(row.fechaFabricacion)}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span className={isExpired(row.fechaCaducidad) ? 'text-red-600 font-semibold' : 'text-gray-500'}>
                        {fmtDate(row.fechaCaducidad)}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right font-semibold">{row.cantidad}</td>
                    <td className="px-3 py-2"><EstadoBadge estado={row.estadoLote ?? '—'} /></td>
                    <td className="px-3 py-2 text-gray-700">{row.clienteNombre ?? '—'}</td>
                    <td className="px-3 py-2">
                      {row.facturaNumero
                        ? <span className="font-mono text-xs text-brand-700">{row.facturaNumero}</span>
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {items.length > 0 && (
        <p className="text-xs text-gray-400 text-right">
          Conforme a Reglamento (CE) 178/2002 · {items.length} registros exportables a Excel
        </p>
      )}
    </div>
  )
}

// ── TAB: Por producto ─────────────────────────────────────────────────────────

function TabProducto() {
  const [productoId, setProductoId] = useState<number | null>(null)
  const [expanded, setExpanded] = useState<Set<number>>(new Set())

  const { data: productos } = useQuery<Producto[]>({
    queryKey: ['productos-activos'],
    queryFn: () => api.get('/productos?soloActivos=true').then(r => r.data),
  })

  const { data: rawData, isLoading } = useQuery({
    queryKey: ['traza-producto', productoId],
    queryFn: () => api.get(`/trazabilidad/producto/${productoId}`).then(r => r.data),
    enabled: productoId !== null,
  })

  const traza: TrazaProducto | null = (rawData as { success: boolean; data: TrazaProducto } | undefined)?.data ?? null

  function toggleLote(id: number) {
    setExpanded(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  return (
    <div className="space-y-5">
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
          <Package className="w-4 h-4 text-brand-600" /> Seleccionar producto
        </h2>
        <div className="relative inline-block">
          <select
            value={productoId ?? ''}
            onChange={e => { setProductoId(e.target.value ? parseInt(e.target.value) : null); setExpanded(new Set()) }}
            className="pl-3 pr-8 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/40 appearance-none min-w-[280px] bg-white"
          >
            <option value="">— Elige un producto —</option>
            {productos?.map(p => <option key={p.id} value={p.id}>{p.nombre}{p.codigo ? ` (${p.codigo})` : ''}</option>)}
          </select>
          <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
        </div>
      </div>

      {isLoading && (
        <div className="flex justify-center py-10 text-gray-400 gap-2">
          <Loader2 className="w-5 h-5 animate-spin" /> Cargando trazabilidad…
        </div>
      )}

      {traza && (
        <div className="space-y-3">
          <div className="flex items-center gap-4 flex-wrap">
            <h2 className="text-lg font-bold text-gray-900">{traza.producto.nombre}</h2>
            {traza.producto.codigo && <span className="font-mono text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">{traza.producto.codigo}</span>}
            <span className="text-sm text-gray-500">{traza.totalLotes} lotes</span>
          </div>

          {traza.lotes.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-400 text-sm">
              Sin lotes registrados para este producto
            </div>
          ) : traza.lotes.map(lote => (
            <div key={lote.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <button onClick={() => toggleLote(lote.id)}
                className="w-full flex items-center gap-4 px-5 py-4 hover:bg-gray-50 text-left">
                {expanded.has(lote.id)
                  ? <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
                  : <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />}
                <div className="flex-1 flex items-center gap-4 flex-wrap min-w-0">
                  <span className="font-mono text-sm font-bold text-brand-700">{lote.codigoLote}</span>
                  <span className="text-xs text-gray-500">Fab: {fmtDate(lote.fechaFabricacion)}</span>
                  {lote.fechaCaducidad && (
                    <span className={`text-xs ${isExpired(lote.fechaCaducidad) ? 'text-red-600 font-semibold' : 'text-gray-500'}`}>
                      Cad: {fmtDate(lote.fechaCaducidad)}
                    </span>
                  )}
                  <span className="text-xs text-gray-500">Inicial: {lote.cantidadInicial}</span>
                  <span className="text-xs text-gray-700">Stock: <strong>{lote.stockActual}</strong></span>
                </div>
                <EstadoBadge estado={lote.estado} />
                <span className={`ml-2 text-xs font-medium px-2 py-0.5 rounded-full ${lote.movimientos.length > 0 ? 'bg-brand-50 text-brand-700' : 'bg-gray-100 text-gray-400'}`}>
                  {lote.movimientos.length} mov.
                </span>
              </button>
              {expanded.has(lote.id) && (
                <div className="border-t border-gray-100">
                  {lote.movimientos.length === 0 ? (
                    <p className="px-5 py-4 text-sm text-gray-400">Sin movimientos de venta</p>
                  ) : (
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50">
                        <tr>{['Fecha', 'Tipo', 'Cantidad', 'Cliente', 'NIF', 'Factura'].map(h =>
                          <th key={h} className="px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase text-left">{h}</th>)}</tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {lote.movimientos.map(m => (
                          <tr key={m.id} className="hover:bg-gray-50">
                            <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap">{fmtDate(m.fecha)}</td>
                            <td className="px-4 py-2.5"><span className="text-xs px-2 py-0.5 rounded-full bg-green-50 text-green-700 font-medium">{m.tipoOperacion}</span></td>
                            <td className="px-4 py-2.5 font-semibold text-right">{m.cantidad}</td>
                            <td className="px-4 py-2.5 text-gray-900">{m.clienteNombre ?? '—'}</td>
                            <td className="px-4 py-2.5 text-gray-500 font-mono text-xs">{m.clienteNif ?? '—'}</td>
                            <td className="px-4 py-2.5">{m.facturaNumero ? <span className="font-mono text-xs text-brand-700">{m.facturaNumero}</span> : '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── TAB: Recall por ingrediente ───────────────────────────────────────────────

function TabIngrediente() {
  const [ingredienteId, setIngredienteId] = useState<number | null>(null)

  const { data: ingredientes } = useQuery<Ingrediente[]>({
    queryKey: ['ingredientes'],
    queryFn: () => api.get('/ingredientes').then(r => r.data),
  })

  const { data: rawData, isLoading } = useQuery({
    queryKey: ['traza-ingrediente', ingredienteId],
    queryFn: () => api.get(`/trazabilidad/ingrediente/${ingredienteId}`).then(r => r.data),
    enabled: ingredienteId !== null,
  })

  const traza: TrazaIngrediente | null = (rawData as { success: boolean; data: TrazaIngrediente } | undefined)?.data ?? null
  const ing = ingredientes?.find(i => i.id === ingredienteId)

  return (
    <div className="space-y-5">
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex gap-3">
        <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
        <p className="text-sm text-amber-800">
          <strong>Herramienta de recall / alerta sanitaria.</strong> Selecciona un ingrediente para
          ver todos los productos fabricados con él, los lotes afectados y los clientes que los recibieron.
          Conforme a Reglamento (CE) 178/2002.
        </p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
          <Leaf className="w-4 h-4 text-orange-500" /> Seleccionar ingrediente
        </h2>
        <div className="relative inline-block">
          <select
            value={ingredienteId ?? ''}
            onChange={e => setIngredienteId(e.target.value ? parseInt(e.target.value) : null)}
            className="pl-3 pr-8 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/40 appearance-none min-w-[280px] bg-white"
          >
            <option value="">— Elige un ingrediente —</option>
            {ingredientes?.filter(i => i.activo).map(i =>
              <option key={i.id} value={i.id}>{i.nombre}{i.proveedor ? ` · ${i.proveedor}` : ''}</option>)}
          </select>
          <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
        </div>
        {ing && ing.alergenos.length > 0 && (
          <div className="flex gap-1.5 mt-3 flex-wrap">
            <span className="text-xs text-orange-700 font-medium">Alérgenos:</span>
            {ing.alergenos.map(a => (
              <span key={a.alergenoId} className="text-xs bg-orange-50 border border-orange-200 text-orange-800 px-2 py-0.5 rounded-full">
                {ALERGENO_EMOJI[a.codigo] ?? '⚠️'} {a.nombre}
              </span>
            ))}
          </div>
        )}
      </div>

      {isLoading && (
        <div className="flex justify-center py-10 text-gray-400 gap-2">
          <Loader2 className="w-5 h-5 animate-spin" /> Consultando cadena de trazabilidad…
        </div>
      )}

      {traza && (
        <div className="space-y-5">
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: 'Productos con este ingrediente', value: traza.productos.length, danger: false },
              { label: 'Movimientos de venta', value: traza.totalMovimientos, danger: false },
              { label: 'Clientes que recibieron producto', value: traza.totalClientesAfectados, danger: traza.totalClientesAfectados > 0 },
            ].map(s => (
              <div key={s.label} className={`rounded-xl border p-4 ${s.danger ? 'bg-red-50 border-red-200' : 'bg-white border-gray-200'}`}>
                <p className={`text-xs ${s.danger ? 'text-red-600' : 'text-gray-500'}`}>{s.label}</p>
                <p className={`text-2xl font-bold mt-1 ${s.danger ? 'text-red-700' : 'text-gray-900'}`}>{s.value}</p>
              </div>
            ))}
          </div>

          {/* Productos */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-5 py-3 bg-gray-50 border-b border-gray-100">
              <h3 className="text-sm font-semibold text-gray-700">Productos afectados y sus lotes</h3>
            </div>
            {traza.productos.length === 0 ? (
              <p className="px-5 py-8 text-sm text-gray-400 text-center">
                Este ingrediente no está asignado a ningún producto con lotes producidos
              </p>
            ) : (
              <div className="divide-y divide-gray-100">
                {traza.productos.map(p => (
                  <div key={p.id} className="p-4">
                    <div className="flex items-center gap-3 mb-3 flex-wrap">
                      <Package className="w-4 h-4 text-brand-600 shrink-0" />
                      <span className="font-semibold text-gray-900">{p.nombre}</span>
                      {p.codigo && <span className="font-mono text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">{p.codigo}</span>}
                      {p.esPrincipal && <span className="text-xs bg-brand-50 text-brand-700 px-2 py-0.5 rounded-full font-medium">principal</span>}
                      {p.cantidadGr != null && <span className="text-xs text-gray-500">{p.cantidadGr}g/ud</span>}
                      <span className="ml-auto text-xs text-gray-500">{p.totalLotes} lotes</span>
                    </div>
                    {p.lotes.length > 0 && (
                      <div className="grid grid-cols-1 gap-1.5 ml-7">
                        {p.lotes.map(l => (
                          <div key={l.codigoLote} className="flex items-center gap-3 text-xs bg-gray-50 rounded-lg px-3 py-2 flex-wrap">
                            <span className="font-mono font-bold text-brand-700">{l.codigoLote}</span>
                            <span className="text-gray-500">Fab: {fmtDate(l.fechaFabricacion)}</span>
                            {l.fechaCaducidad && (
                              <span className={isExpired(l.fechaCaducidad) ? 'text-red-600 font-semibold' : 'text-gray-500'}>Cad: {fmtDate(l.fechaCaducidad)}</span>
                            )}
                            <span className="text-gray-500">Inicial: {l.cantidadInicial}</span>
                            <span className="text-gray-700">Stock: <strong>{l.stockActual}</strong></span>
                            <span className="ml-auto"><EstadoBadge estado={l.estado} /></span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Clientes afectados */}
          {traza.totalClientesAfectados > 0 && (
            <div className="bg-white rounded-xl border border-red-200 overflow-hidden">
              <div className="px-5 py-3 bg-red-50 border-b border-red-100 flex items-center gap-2">
                <Users className="w-4 h-4 text-red-600" />
                <h3 className="text-sm font-semibold text-red-800">
                  Clientes que recibieron producto con este ingrediente ({traza.totalClientesAfectados})
                </h3>
              </div>
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>{['Cliente', 'NIF', 'Unidades', 'Primera venta', 'Última venta'].map(h =>
                    <th key={h} className="px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase text-left">{h}</th>)}</tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {traza.clientesAfectados.map((c, i) => (
                    <tr key={i} className="hover:bg-red-50/30">
                      <td className="px-4 py-3 font-medium text-gray-900">{c.nombre}</td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-500">{c.nif ?? '—'}</td>
                      <td className="px-4 py-3 font-bold text-red-700">{c.totalUnidades}</td>
                      <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{fmtDate(c.primeraVenta)}</td>
                      <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{fmtDate(c.ultimaVenta)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="px-5 py-3 bg-red-50 border-t border-red-100">
                <p className="text-xs text-red-700">
                  ⚠️ En caso de alerta sanitaria, notificar a estos clientes y a la autoridad competente
                  conforme al Art. 19 del Reglamento (CE) 178/2002.
                </p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
