import { useState, useMemo, useEffect } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import api from '../lib/api'
import type { Producto, Cliente, SerieFacturacion } from '../types'
import {
  Search, ShoppingCart, X, Plus, Minus, Loader2,
  Printer, CheckCircle, Zap, Trash2, ChevronDown,
} from 'lucide-react'
import toast from 'react-hot-toast'

// ─── Types ──────────────────────────────────────────────────────────────────

interface CartItem {
  producto: Producto
  cantidad: number
}

interface FacturaCreada {
  id: number
  numeroFactura: string
  total: number
  subtotal: number
  ivaTotal: number
  clienteNombre: string
  lineas: Array<{ descripcion: string; cantidad: number; precioUnitario: number; subtotal: number }>
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function calcSubtotal(item: CartItem) {
  return item.producto.precioVenta * item.cantidad
}

function calcIva(item: CartItem) {
  const base = calcSubtotal(item)
  return base * (item.producto.ivaPorcentaje ?? 10) / 100
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function FacturacionRapida() {
  const [search, setSearch] = useState('')
  const [cart, setCart] = useState<CartItem[]>([])
  const [clienteId, setClienteId] = useState('')
  const [serieId, setSerieId] = useState('')
  const [facturaCreada, setFacturaCreada] = useState<FacturaCreada | null>(null)
  const [clienteDropdown, setClienteDropdown] = useState(false)

  // ── Data ────────────────────────────────────────────────────────────────
  const { data: productos } = useQuery({
    queryKey: ['productos-activos'],
    queryFn: async () => (await api.get<{ data: Producto[] }>('/productos?soloActivos=true')).data.data,
    staleTime: 120_000,
  })

  const { data: clientes } = useQuery({
    queryKey: ['clientes'],
    queryFn: async () => (await api.get<{ data: Cliente[] }>('/clientes')).data.data,
    staleTime: 120_000,
  })

  const { data: series } = useQuery({
    queryKey: ['series'],
    queryFn: async () => (await api.get<{ data: SerieFacturacion[] }>('/series')).data.data,
    staleTime: 300_000,
  })

  // Auto-select first serie on load
  useEffect(() => {
    if (series && series.length > 0 && !serieId) setSerieId(String(series[0].id))
  }, [series])

  // ── Mutations ───────────────────────────────────────────────────────────
  const crearFactura = useMutation({
    mutationFn: async () => {
      const payload = {
        clienteId: +clienteId,
        serieId: +serieId,
        items: cart.map(c => ({ productoId: c.producto.id, cantidad: c.cantidad })),
      }
      const res = await api.post<{ data: any }>('/facturas/crear', payload)
      return res.data.data
    },
    onSuccess: (data) => {
      setFacturaCreada(data)
      setCart([])
    },
    onError: (e: any) => toast.error(e.response?.data?.errors?.[0] ?? 'Error al generar factura'),
  })

  // ── Cart helpers ────────────────────────────────────────────────────────
  function addToCart(producto: Producto) {
    setCart(prev => {
      const existing = prev.find(c => c.producto.id === producto.id)
      if (existing) return prev.map(c => c.producto.id === producto.id ? { ...c, cantidad: c.cantidad + 1 } : c)
      return [...prev, { producto, cantidad: 1 }]
    })
  }

  function updateQty(productoId: number, delta: number) {
    setCart(prev =>
      prev
        .map(c => c.producto.id === productoId ? { ...c, cantidad: Math.max(0, c.cantidad + delta) } : c)
        .filter(c => c.cantidad > 0)
    )
  }

  function setQty(productoId: number, val: number) {
    const next = Math.trunc(val)
    if (next <= 0) { setCart(prev => prev.filter(c => c.producto.id !== productoId)); return }
    setCart(prev => prev.map(c => c.producto.id === productoId ? { ...c, cantidad: next } : c))
  }

  function removeFromCart(productoId: number) {
    setCart(prev => prev.filter(c => c.producto.id !== productoId))
  }

  function clearAll() { setCart([]); setClienteId(''); setFacturaCreada(null) }

  // ── Totals ──────────────────────────────────────────────────────────────
  const subtotal = cart.reduce((s, c) => s + calcSubtotal(c), 0)
  const ivaTotal = cart.reduce((s, c) => s + calcIva(c), 0)
  const total = subtotal + ivaTotal

  const clienteSeleccionado = clientes?.find(c => c.id === +clienteId)

  // ── Filtered products ───────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    if (!q) return productos ?? []
    return (productos ?? []).filter(p =>
      p.nombre.toLowerCase().includes(q) || p.codigo?.toLowerCase().includes(q)
    )
  }, [productos, search])

  // ── PDF print ───────────────────────────────────────────────────────────
  async function handlePrint() {
    if (!facturaCreada) return
    try {
      const res = await api.get(`/facturas/${facturaCreada.id}/pdf`, { responseType: 'blob' })
      const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }))
      window.open(url, '_blank')
    } catch { toast.error('Error al obtener PDF') }
  }

  // ── Render: success modal ────────────────────────────────────────────────
  if (facturaCreada) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-8 text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-8 h-8 text-green-600" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-1">Factura generada</h2>
          <p className="text-3xl font-black text-brand-700 mb-1">{facturaCreada.numeroFactura}</p>
          <p className="text-sm text-gray-500 mb-6">{facturaCreada.clienteNombre}</p>

          <div className="bg-gray-50 rounded-xl p-4 text-left mb-6 space-y-2">
            {(facturaCreada.lineas ?? []).map((l, i) => (
              <div key={i} className="flex justify-between text-sm">
                <span className="text-gray-600 truncate flex-1 mr-2">{l.descripcion}</span>
                <span className="font-semibold text-gray-900 shrink-0">{l.subtotal.toFixed(2)} €</span>
              </div>
            ))}
            <div className="border-t border-gray-200 pt-2 mt-2 space-y-1">
              <div className="flex justify-between text-sm text-gray-500">
                <span>Base imponible</span><span>{facturaCreada.subtotal.toFixed(2)} €</span>
              </div>
              <div className="flex justify-between text-sm text-gray-500">
                <span>IVA</span><span>{facturaCreada.ivaTotal.toFixed(2)} €</span>
              </div>
              <div className="flex justify-between text-base font-bold text-gray-900">
                <span>TOTAL</span><span>{facturaCreada.total.toFixed(2)} €</span>
              </div>
            </div>
          </div>

          <div className="flex gap-3">
            <button onClick={handlePrint}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-brand-600 text-white rounded-xl font-semibold hover:bg-brand-700">
              <Printer className="w-5 h-5" /> Imprimir PDF
            </button>
            <button onClick={clearAll}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-gray-100 text-gray-700 rounded-xl font-semibold hover:bg-gray-200">
              <Zap className="w-5 h-5" /> Nueva factura
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── Render: main POS ─────────────────────────────────────────────────────
  return (
    <div className="flex flex-1 overflow-hidden bg-gray-50">
      {/* ── LEFT: Product grid ──────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Search bar */}
        <div className="p-4 bg-white border-b border-gray-200">
          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Buscar productos…"
                className="w-full pl-9 pr-4 py-2.5 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                autoFocus
              />
              {search && (
                <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2">
                  <X className="w-4 h-4 text-gray-400 hover:text-gray-600" />
                </button>
              )}
            </div>
            <span className="text-xs text-gray-500 shrink-0">{filtered.length} productos</span>
          </div>
        </div>

        {/* Grid */}
        <div className="flex-1 overflow-y-auto p-4">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-gray-400">
              <Search className="w-10 h-10 mb-2" />
              <p className="text-sm">Sin resultados para "{search}"</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
              {filtered.map(producto => {
                const inCartItem = cart.find(c => c.producto.id === producto.id)
                return (
                  <button
                    key={producto.id}
                    onClick={() => addToCart(producto)}
                    className={`relative bg-white rounded-xl border-2 p-3 text-left hover:shadow-md transition-all active:scale-95 ${
                      inCartItem ? 'border-brand-400 shadow-sm' : 'border-gray-200 hover:border-brand-200'
                    }`}
                  >
                    {inCartItem && (
                      <span className="absolute -top-2 -right-2 w-6 h-6 bg-brand-600 text-white text-xs rounded-full flex items-center justify-center font-bold shadow">
                        {inCartItem.cantidad}
                      </span>
                    )}
                    <div className="text-2xl mb-1.5">🥐</div>
                    <p className="text-xs font-semibold text-gray-800 leading-tight line-clamp-2">{producto.nombre}</p>
                    {producto.codigo && (
                      <p className="text-xs text-gray-400 mt-0.5 font-mono">{producto.codigo}</p>
                    )}
                    <p className="text-sm font-bold text-brand-700 mt-1.5">{producto.precioVenta.toFixed(2)} €</p>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── RIGHT: Cart ─────────────────────────────────────────────────── */}
      <div className="w-80 xl:w-96 bg-white border-l border-gray-200 flex flex-col">
        {/* Cart header */}
        <div className="p-4 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShoppingCart className="w-5 h-5 text-brand-600" />
            <span className="font-bold text-gray-900">Carrito</span>
            {cart.length > 0 && (
              <span className="bg-brand-600 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold">
                {cart.length}
              </span>
            )}
          </div>
          {cart.length > 0 && (
            <button onClick={() => setCart([])} className="text-xs text-red-400 hover:text-red-600 flex items-center gap-1">
              <Trash2 className="w-3.5 h-3.5" /> Vaciar
            </button>
          )}
        </div>

        {/* Cart items */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {cart.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-gray-300">
              <ShoppingCart className="w-10 h-10 mb-2" />
              <p className="text-sm">Toca un producto para añadir</p>
            </div>
          ) : (
            cart.map(item => (
              <div key={item.producto.id} className="bg-gray-50 rounded-xl p-3">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <p className="text-xs font-semibold text-gray-800 leading-tight flex-1">{item.producto.nombre}</p>
                  <button onClick={() => removeFromCart(item.producto.id)}>
                    <X className="w-4 h-4 text-gray-400 hover:text-red-500 shrink-0" />
                  </button>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1 bg-white rounded-lg border border-gray-200">
                    <button onClick={() => updateQty(item.producto.id, -1)}
                      className="w-8 h-8 flex items-center justify-center hover:bg-gray-50 rounded-l-lg text-gray-600">
                      <Minus className="w-3 h-3" />
                    </button>
                    <input
                      type="number"
                      min={1}
                      step={1}
                      value={item.cantidad}
                      onFocus={e => e.currentTarget.select()}
                      onChange={e => setQty(item.producto.id, parseInt(e.target.value || '0', 10))}
                      className="w-12 text-center text-sm font-bold text-gray-900 border-0 focus:ring-0 bg-transparent"
                    />
                    <button onClick={() => updateQty(item.producto.id, 1)}
                      className="w-8 h-8 flex items-center justify-center hover:bg-gray-50 rounded-r-lg text-gray-600">
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>
                  <span className="text-sm font-bold text-brand-700">
                    {(calcSubtotal(item) + calcIva(item)).toFixed(2)} €
                  </span>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer with totals + client + generate */}
        <div className="p-4 border-t border-gray-100 space-y-4">
          {/* Totals */}
          {cart.length > 0 && (
            <div className="bg-gray-50 rounded-xl p-3 space-y-1">
              <div className="flex justify-between text-xs text-gray-500">
                <span>Subtotal</span><span>{subtotal.toFixed(2)} €</span>
              </div>
              <div className="flex justify-between text-xs text-gray-500">
                <span>IVA</span><span>{ivaTotal.toFixed(2)} €</span>
              </div>
              <div className="flex justify-between text-base font-black text-gray-900 pt-1 border-t border-gray-200">
                <span>TOTAL</span><span className="text-brand-700">{total.toFixed(2)} €</span>
              </div>
            </div>
          )}

          {/* Client selector */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">Cliente *</label>
            <div className="relative">
              <button
                onClick={() => setClienteDropdown(!clienteDropdown)}
                className="w-full flex items-center justify-between px-3 py-2.5 border border-gray-300 rounded-xl text-sm bg-white hover:bg-gray-50"
              >
                <span className={clienteSeleccionado ? 'text-gray-900 font-medium' : 'text-gray-400'}>
                  {clienteSeleccionado ? clienteSeleccionado.nombre : 'Seleccionar cliente…'}
                </span>
                <ChevronDown className="w-4 h-4 text-gray-400" />
              </button>
              {clienteDropdown && (
                <div className="absolute bottom-full mb-2 left-0 right-0 bg-white border border-gray-200 rounded-xl shadow-lg max-h-52 overflow-y-auto z-10">
                  {(clientes ?? []).map(c => (
                    <button
                      key={c.id}
                      onClick={() => { setClienteId(String(c.id)); setClienteDropdown(false) }}
                      className={`w-full text-left px-4 py-2.5 text-sm hover:bg-brand-50 hover:text-brand-700 ${
                        clienteId === String(c.id) ? 'bg-brand-50 text-brand-700 font-semibold' : 'text-gray-700'
                      }`}
                    >
                      {c.nombre}
                      {c.nif && <span className="text-xs text-gray-400 ml-1">· {c.nif}</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Serie selector (hidden if only one) */}
          {(series ?? []).length > 1 && (
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">Serie</label>
              <select value={serieId} onChange={e => setSerieId(e.target.value)}
                className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-brand-500 focus:border-transparent">
                {(series ?? []).map(s => <option key={s.id} value={s.id}>{s.prefijo} — {s.descripcion}</option>)}
              </select>
            </div>
          )}

          {/* Generate button */}
          {(() => {
            const clienteSel = clientes?.find(c => String(c.id) === clienteId)
            const bloqueado = clienteSel?.noRealizarFacturas
            return (
              <>
                {bloqueado && clienteId && (
                  <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                    Este cliente tiene marcado &quot;No realizar facturas&quot;.
                  </div>
                )}
                <button
                  onClick={() => crearFactura.mutate()}
                  disabled={cart.length === 0 || !clienteId || !serieId || crearFactura.isPending || !!bloqueado}
                  className="w-full flex items-center justify-center gap-2 px-4 py-4 bg-brand-600 text-white rounded-xl text-base font-bold disabled:opacity-50 hover:bg-brand-700 transition-all disabled:cursor-not-allowed shadow-sm"
                >
                  {crearFactura.isPending
                    ? <><Loader2 className="w-5 h-5 animate-spin" /> Generando…</>
                    : <><Zap className="w-5 h-5" /> Generar factura · {total.toFixed(2)} €</>
                  }
                </button>
              </>
            )
          })()}
        </div>
      </div>
    </div>
  )
}
