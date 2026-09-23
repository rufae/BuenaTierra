import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Factory, Package, Loader2, ArrowRight, ArrowLeft, History } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../lib/api'
import { fmtDate } from '../lib/dates'
import { EstadoBadge } from '../components/EstadoBadge'
import { ProduccionPage } from './Produccion'
import type { Producto, StockItem } from '../types'

/**
 * Página "Carga" — unificada para la cuenta única (fábrica + repartidor):
 *  - Fábrica: entradas de mercancía (antigua "Compra").
 *  - Furgoneta: traspaso de stock fábrica ↔ furgoneta (no altera el total).
 */
export default function Carga() {
  const [tab, setTab] = useState<'fabrica' | 'furgoneta'>('fabrica')

  const tabBtn = (id: 'fabrica' | 'furgoneta', label: string, Icon: typeof Factory) => (
    <button
      onClick={() => setTab(id)}
      className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
        tab === id
          ? 'bg-brand-600 text-white shadow-sm'
          : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
      }`}
    >
      <Icon className="w-4 h-4" /> {label}
    </button>
  )

  return (
    <div className="page-shell space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Carga</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            Entrada de mercancía en fábrica y carga/descarga de la furgoneta — el total de stock no cambia al moverlo
          </p>
        </div>
        <div className="flex gap-2">
          {tabBtn('fabrica', 'Fábrica', Factory)}
          {tabBtn('furgoneta', 'Furgoneta', Package)}
        </div>
      </div>

      {tab === 'fabrica' ? (
        <ProduccionPage modo="compra" shell={false} />
      ) : (
        <CargaFurgoneta />
      )}
    </div>
  )
}

interface CargaFurgonetaState {
  productoId: number
  loteId: number
  cantidad: string
  sentido: 'Carga' | 'Descarga'
}

function CargaFurgoneta() {
  const qc = useQueryClient()
  const [form, setForm] = useState<CargaFurgonetaState>({ productoId: 0, loteId: 0, cantidad: '', sentido: 'Carga' })

  const { data: productos } = useQuery({
    queryKey: ['productos-activos'],
    queryFn: async () => (await api.get<{ data: Producto[] }>('/productos?soloActivos=true')).data.data,
    staleTime: 120_000,
  })

  const { data: stock, isLoading: stockLoading } = useQuery({
    queryKey: ['stock'],
    queryFn: async () => (await api.get<{ data: StockItem[] }>('/stock/todos')).data.data,
  })

  const { data: historial, isLoading: historialLoading } = useQuery({
    queryKey: ['stock-cargas'],
    queryFn: async () => (await api.get<{ data: any[] }>('/stock/cargas')).data.data,
    staleTime: 15_000,
  })

  const mutation = useMutation({
    mutationFn: () => api.post('/stock/carga-furgoneta', {
      productoId: form.productoId,
      loteId: form.loteId,
      cantidad: parseFloat(form.cantidad.replace(',', '.')),
      sentido: form.sentido,
    }),
    onSuccess: (res) => {
      toast.success((res as any).data?.message ?? 'Movimiento registrado')
      setForm({ productoId: 0, loteId: 0, cantidad: '', sentido: form.sentido })
      qc.invalidateQueries({ queryKey: ['stock'] })
      qc.invalidateQueries({ queryKey: ['stock-cargas'] })
    },
    onError: (e: any) => toast.error(e.response?.data?.errors?.[0] ?? 'Error en el movimiento'),
  })

  const stockFiltrado = (stock ?? []).filter(s => !form.productoId || s.productoId === form.productoId)
  const stockSeleccionado = (stock ?? []).find(s => s.productoId === form.productoId && s.loteId === form.loteId)
  const maxCarga = stockSeleccionado ? Math.max(0, stockSeleccionado.cantidadFabrica) : 0
  const maxDescarga = stockSeleccionado ? Math.max(0, stockSeleccionado.cantidadFurgoneta) : 0

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.productoId) { toast.error('Selecciona un producto'); return }
    if (!form.loteId) { toast.error('Selecciona un lote'); return }
    const cant = parseFloat(form.cantidad.replace(',', '.'))
    if (!cant || cant <= 0) { toast.error('Introduce una cantidad mayor que 0'); return }
    const max = form.sentido === 'Carga' ? maxCarga : maxDescarga
    if (cant > max) { toast.error(`Máximo disponible en ${form.sentido === 'Carga' ? 'fábrica' : 'furgoneta'}: ${max}`); return }
    mutation.mutate()
  }

  const totales = (stock ?? []).reduce(
    (acc, s) => ({
      disponible: acc.disponible + s.cantidadDisponible,
      fabrica: acc.fabrica + s.cantidadFabrica,
      furgoneta: acc.furgoneta + s.cantidadFurgoneta,
    }),
    { disponible: 0, fabrica: 0, furgoneta: 0 }
  )

  return (
    <div className="space-y-5">
      {/* Resumen */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <p className="text-xs text-gray-500">Total en almacén</p>
          <p className="text-2xl font-bold text-gray-900">{totales.disponible.toLocaleString('es-ES')}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <p className="text-xs text-gray-500">En fábrica</p>
          <p className="text-2xl font-bold text-emerald-600">{totales.fabrica.toLocaleString('es-ES')}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <p className="text-xs text-gray-500">En furgoneta</p>
          <p className="text-2xl font-bold text-sky-600">{totales.furgoneta.toLocaleString('es-ES')}</p>
        </div>
      </div>

      {/* Formulario carga/descarga */}
      <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-100 p-4 flex flex-wrap gap-3 items-end">
        <div className="min-w-[180px]">
          <label className="block text-xs text-gray-500 mb-1">Producto</label>
          <select
            value={form.productoId || ''}
            onChange={e => setForm(f => ({ ...f, productoId: +e.target.value, loteId: 0 }))}
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500/40">
            <option value="">Seleccionar…</option>
            {(productos ?? []).map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
        </div>
        <div className="min-w-[180px]">
          <label className="block text-xs text-gray-500 mb-1">Lote</label>
          <select
            value={form.loteId || ''}
            onChange={e => setForm(f => ({ ...f, loteId: +e.target.value }))}
            disabled={!form.productoId}
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500/40 disabled:bg-gray-50">
            <option value="">Seleccionar…</option>
            {stockFiltrado.map(s => (
              <option key={s.loteId} value={s.loteId}>
                {s.codigoLote} — Fábrica: {s.cantidadFabrica} · Furgoneta: {s.cantidadFurgoneta}
              </option>
            ))}
          </select>
        </div>
        <div className="w-28">
          <label className="block text-xs text-gray-500 mb-1">Cantidad</label>
          <input
            type="number"
            min="0"
            step="any"
            value={form.cantidad}
            onChange={e => setForm(f => ({ ...f, cantidad: e.target.value }))}
            placeholder="0"
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 text-right focus:outline-none focus:ring-2 focus:ring-brand-500/40" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Sentido</label>
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => setForm(f => ({ ...f, sentido: 'Carga' }))}
              className={`px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
                form.sentido === 'Carga'
                  ? 'bg-brand-50 border-brand-300 text-brand-700'
                  : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'
              }`}
              title="Fábrica → Furgoneta">
              <ArrowRight className="w-4 h-4 inline mr-1" /> Cargar
            </button>
            <button
              type="button"
              onClick={() => setForm(f => ({ ...f, sentido: 'Descarga' }))}
              className={`px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
                form.sentido === 'Descarga'
                  ? 'bg-orange-50 border-orange-300 text-orange-700'
                  : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'
              }`}
              title="Furgoneta → Fábrica">
              <ArrowLeft className="w-4 h-4 inline mr-1" /> Descargar
            </button>
          </div>
        </div>
        <button
          type="submit"
          disabled={mutation.isPending}
          className="px-5 py-2 bg-brand-600 text-white rounded-lg text-sm font-semibold hover:bg-brand-700 disabled:opacity-50 flex items-center gap-2">
          {mutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
          {form.sentido === 'Carga' ? 'Cargar a furgoneta' : 'Descargar de furgoneta'}
        </button>
        {stockSeleccionado && (
          <p className="text-xs text-gray-400 w-full">
            Disponible en fábrica: <b className="text-emerald-600">{maxCarga}</b> · en furgoneta: <b className="text-sky-600">{maxDescarga}</b>
          </p>
        )}
      </form>

      {/* Stock por lote */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-3.5 border-b border-gray-100 flex items-center gap-2">
          <Package className="w-4 h-4 text-brand-600" />
          <h2 className="font-semibold text-gray-900 text-sm">Stock por lote</h2>
          {!stockLoading && (
            <span className="ml-1 text-xs text-gray-400">{(stock ?? []).length} lote(s)</span>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wider">
                <th className="px-4 py-3 text-left">Producto</th>
                <th className="px-4 py-3 text-left">Lote</th>
                <th className="px-4 py-3 text-right">Total</th>
                <th className="px-4 py-3 text-right">Fábrica</th>
                <th className="px-4 py-3 text-right">Furgoneta</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {stockLoading ? (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                  <Loader2 className="w-5 h-5 animate-spin mx-auto" />
                </td></tr>
              ) : stockFiltrado.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400 text-sm">Sin stock</td></tr>
              ) : stockFiltrado.map(s => (
                <tr key={`${s.productoId}-${s.loteId}`} className="hover:bg-gray-50/50">
                  <td className="px-4 py-2.5 font-medium text-gray-900">{s.productoNombre}</td>
                  <td className="px-4 py-2.5 font-mono text-xs text-gray-700">{s.codigoLote}</td>
                  <td className="px-4 py-2.5 text-right font-semibold text-gray-900">{s.cantidadDisponible}</td>
                  <td className="px-4 py-2.5 text-right text-emerald-600 font-medium">{s.cantidadFabrica}</td>
                  <td className="px-4 py-2.5 text-right text-sky-600 font-medium">{s.cantidadFurgoneta}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Historial */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-3.5 border-b border-gray-100 flex items-center gap-2">
          <History className="w-4 h-4 text-brand-600" />
          <h2 className="font-semibold text-gray-900 text-sm">Últimos movimientos de furgoneta</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wider">
                <th className="px-4 py-3 text-left">Fecha</th>
                <th className="px-4 py-3 text-left">Tipo</th>
                <th className="px-4 py-3 text-left">Producto</th>
                <th className="px-4 py-3 text-left">Lote</th>
                <th className="px-4 py-3 text-right">Cantidad</th>
                <th className="px-4 py-3 text-right">Furgoneta</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {historialLoading ? (
                <tr><td colSpan={6} className="px-4 py-6 text-center text-gray-500">
                  <Loader2 className="w-5 h-5 animate-spin mx-auto" />
                </td></tr>
              ) : !historial || historial.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-6 text-center text-gray-400 text-sm">
                  Aún no hay cargas ni descargas
                </td></tr>
              ) : historial.map((m: any) => (
                <tr key={m.id} className="hover:bg-gray-50/50">
                  <td className="px-4 py-2.5 text-gray-500 text-xs">{fmtDate(m.fecha)}</td>
                  <td className="px-4 py-2.5">
                    <EstadoBadge estado={m.tipo === 'CargaFurgoneta' ? 'Carga' : 'Descarga'} />
                  </td>
                  <td className="px-4 py-2.5 font-medium text-gray-900">{m.productoNombre}</td>
                  <td className="px-4 py-2.5 font-mono text-xs text-gray-700">{m.codigoLote}</td>
                  <td className="px-4 py-2.5 text-right font-semibold">{m.cantidad}</td>
                  <td className="px-4 py-2.5 text-right text-sky-600">
                    {m.furgonetaAntes} → {m.furgonetaDespues}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
