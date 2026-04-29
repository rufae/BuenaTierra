import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Plus, Trash2, Wallet, ArrowUpRight, ArrowDownRight,
  Landmark, Repeat, CalendarDays, Package, Wheat, TrendingUp,
} from 'lucide-react'
import api from '../lib/api'
import type { Factura, Producto, StockItem } from '../types'

type EntryKind = 'ingreso' | 'gasto'
type Recurrence = 'none' | 'monthly' | 'yearly'
type Category = 'ventas' | 'salarios' | 'ingredientes' | 'fabrica' | 'luz' | 'alquiler' | 'otros'

interface ManualEntry {
  id: string
  kind: EntryKind
  category: Category
  concept: string
  amount: number
  date: string
  recurrence: Recurrence
  active: boolean
  notes?: string
}

interface IngredientStockRow {
  id: number
  producto: string
  unidades: number
  estado: 'activo' | 'por_caducar' | 'caducado' | 'agotado'
}

const STORAGE_KEY = 'bt_balance_entries_v1'

const CATEGORIES: { value: Category; label: string }[] = [
  { value: 'ventas', label: 'Ventas' },
  { value: 'salarios', label: 'Salarios' },
  { value: 'ingredientes', label: 'Ingredientes (coste)' },
  { value: 'fabrica', label: 'Fabrica / Produccion' },
  { value: 'luz', label: 'Luz / Suministros' },
  { value: 'alquiler', label: 'Alquiler / Local' },
  { value: 'otros', label: 'Otros' },
]

function formatCurrency(value: number) {
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(value || 0)
}

function monthToRange(month: string) {
  const [year, mon] = month.split('-').map(Number)
  const start = new Date(year, mon - 1, 1)
  const end = new Date(year, mon, 0)
  return { start, end }
}

function inSelectedMonth(dateStr: string, month: string) {
  if (!dateStr) return false
  const d = new Date(dateStr)
  const { start, end } = monthToRange(month)
  return d >= start && d <= end
}

function isEntryApplicable(entry: ManualEntry, month: string) {
  if (!entry.active) return false
  if (entry.recurrence === 'none') return inSelectedMonth(entry.date, month)

  const [targetYear, targetMonth] = month.split('-').map(Number)
  const entryDate = new Date(entry.date)

  if (entry.recurrence === 'monthly') {
    return entryDate <= new Date(targetYear, targetMonth - 1, 31)
  }

  if (entry.recurrence === 'yearly') {
    return entryDate.getMonth() + 1 === targetMonth && entryDate.getFullYear() <= targetYear
  }

  return false
}

function getCurrentMonthISO() {
  const now = new Date()
  const m = `${now.getMonth() + 1}`.padStart(2, '0')
  return `${now.getFullYear()}-${m}`
}

function loadEntries(): ManualEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as ManualEntry[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function saveEntries(entries: ManualEntry[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries))
}

export default function Balance() {
  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonthISO())
  const [includeIvaOnSales, setIncludeIvaOnSales] = useState(true)
  const [includeProductInventory, setIncludeProductInventory] = useState(true)
  const [includeIngredientInventory, setIncludeIngredientInventory] = useState(true)
  const [ingredientUnitValue, setIngredientUnitValue] = useState(1)
  const [entries, setEntries] = useState<ManualEntry[]>(() => loadEntries())
  const [draft, setDraft] = useState<Omit<ManualEntry, 'id'>>({
    kind: 'gasto',
    category: 'salarios',
    concept: '',
    amount: 0,
    date: new Date().toISOString().slice(0, 10),
    recurrence: 'none',
    active: true,
    notes: '',
  })

  const { data: facturas = [] } = useQuery({
    queryKey: ['balance-facturas'],
    queryFn: async () => (await api.get<{ data: Factura[] }>('/facturas')).data.data,
  })

  const { data: productos = [] } = useQuery({
    queryKey: ['balance-productos'],
    queryFn: async () => (await api.get<{ data: Producto[] }>('/productos')).data.data,
  })

  const { data: stockRows = [] } = useQuery({
    queryKey: ['balance-stock-productos'],
    queryFn: async () => (await api.get<{ data: StockItem[] }>('/stock/todos')).data.data,
  })

  const { data: ingredientStock = [] } = useQuery({
    queryKey: ['balance-stock-ingredientes'],
    queryFn: async () => (await api.get<{ data: IngredientStockRow[] }>('/control-materias-primas/stock-mp')).data.data,
  })

  const productMap = useMemo(() => {
    const map = new Map<number, Producto>()
    for (const p of productos) map.set(p.id, p)
    return map
  }, [productos])

  const sales = useMemo(() => {
    const filtered = facturas.filter(f => inSelectedMonth(f.fechaFactura, selectedMonth))
    const withVat = filtered.reduce((acc, f) => acc + (f.total || 0), 0)
    const withoutVat = filtered.reduce((acc, f) => acc + (f.baseImponible || 0), 0)
    return {
      count: filtered.length,
      withVat,
      withoutVat,
      selected: includeIvaOnSales ? withVat : withoutVat,
    }
  }, [facturas, includeIvaOnSales, selectedMonth])

  const productInventoryValue = useMemo(() => {
    return stockRows.reduce((acc, s) => {
      const product = productMap.get(s.productoId)
      if (!product) return acc
      const unitValue = product.precioCoste ?? product.precioVenta
      return acc + (s.cantidadDisponible * (unitValue || 0))
    }, 0)
  }, [productMap, stockRows])

  const ingredientInventoryValue = useMemo(() => {
    return ingredientStock
      .filter(r => r.estado !== 'agotado')
      .reduce((acc, row) => acc + (row.unidades * ingredientUnitValue), 0)
  }, [ingredientStock, ingredientUnitValue])

  const applicableEntries = useMemo(
    () => entries.filter(e => isEntryApplicable(e, selectedMonth)),
    [entries, selectedMonth]
  )

  const manualIncome = useMemo(
    () => applicableEntries.filter(e => e.kind === 'ingreso').reduce((acc, e) => acc + e.amount, 0),
    [applicableEntries]
  )

  const manualExpense = useMemo(
    () => applicableEntries.filter(e => e.kind === 'gasto').reduce((acc, e) => acc + e.amount, 0),
    [applicableEntries]
  )

  const totalIncome = sales.selected + manualIncome
    + (includeProductInventory ? productInventoryValue : 0)
    + (includeIngredientInventory ? ingredientInventoryValue : 0)

  const totalExpense = manualExpense
  const balance = totalIncome - totalExpense
  const marginPct = totalIncome > 0 ? (balance / totalIncome) * 100 : 0

  const categoryTotals = useMemo(() => {
    const map = new Map<Category, number>()
    for (const entry of applicableEntries) {
      const sign = entry.kind === 'gasto' ? -1 : 1
      map.set(entry.category, (map.get(entry.category) ?? 0) + (entry.amount * sign))
    }
    return CATEGORIES.map(c => ({
      category: c,
      value: map.get(c.value) ?? 0,
    })).filter(x => x.value !== 0)
  }, [applicableEntries])

  const addEntry = () => {
    if (!draft.concept.trim() || draft.amount <= 0) return

    const next: ManualEntry = {
      ...draft,
      id: crypto.randomUUID(),
      concept: draft.concept.trim(),
      amount: Number(draft.amount),
    }
    const updated = [next, ...entries]
    setEntries(updated)
    saveEntries(updated)
    setDraft(prev => ({ ...prev, concept: '', amount: 0, notes: '' }))
  }

  const removeEntry = (id: string) => {
    const updated = entries.filter(e => e.id !== id)
    setEntries(updated)
    saveEntries(updated)
  }

  const toggleEntryActive = (id: string) => {
    const updated = entries.map(e => e.id === id ? { ...e, active: !e.active } : e)
    setEntries(updated)
    saveEntries(updated)
  }

  return (
    <div className="px-3 py-4 sm:p-6 max-w-7xl mx-auto space-y-5">
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Balance</h1>
          <p className="text-sm text-gray-500 mt-1">
            Vista financiera dinamica con ingresos/gastos fijos y variables, mas valor de inventario.
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm">
            <span className="block text-xs text-gray-500 mb-1">Mes analizado</span>
            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="input"
            />
          </label>
          <label className="text-sm inline-flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 rounded-xl">
            <input
              type="checkbox"
              checked={includeIvaOnSales}
              onChange={(e) => setIncludeIvaOnSales(e.target.checked)}
            />
            Ventas con IVA
          </label>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <MetricCard
          title="Ingresos Totales"
          value={formatCurrency(totalIncome)}
          hint={`Ventas: ${formatCurrency(sales.selected)} | Manual: ${formatCurrency(manualIncome)}`}
          icon={<ArrowUpRight className="w-5 h-5 text-emerald-600" />}
          tone="emerald"
        />
        <MetricCard
          title="Gastos Totales"
          value={formatCurrency(totalExpense)}
          hint="Solo gastos manuales (fijos + variables)"
          icon={<ArrowDownRight className="w-5 h-5 text-red-600" />}
          tone="red"
        />
        <MetricCard
          title="Balance"
          value={formatCurrency(balance)}
          hint={`Margen: ${marginPct.toFixed(2)}%`}
          icon={<Wallet className="w-5 h-5 text-brand-600" />}
          tone={balance >= 0 ? 'brand' : 'red'}
        />
        <MetricCard
          title="Facturacion"
          value={formatCurrency(sales.withVat)}
          hint={`${sales.count} facturas | Sin IVA: ${formatCurrency(sales.withoutVat)}`}
          icon={<TrendingUp className="w-5 h-5 text-blue-600" />}
          tone="blue"
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <section className="card p-4 sm:p-5 xl:col-span-2 space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h2 className="font-semibold text-gray-900">Ingresos y gastos manuales</h2>
            <span className="text-xs text-gray-500 inline-flex items-center gap-1">
              <Repeat className="w-3.5 h-3.5" /> Puedes definir entradas fijas (mensuales)
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
            <select
              value={draft.kind}
              onChange={(e) => setDraft(prev => ({ ...prev, kind: e.target.value as EntryKind }))}
              className="input"
            >
              <option value="ingreso">Ingreso</option>
              <option value="gasto">Gasto</option>
            </select>

            <select
              value={draft.category}
              onChange={(e) => setDraft(prev => ({ ...prev, category: e.target.value as Category }))}
              className="input"
            >
              {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>

            <input
              className="input"
              placeholder="Concepto"
              value={draft.concept}
              onChange={(e) => setDraft(prev => ({ ...prev, concept: e.target.value }))}
            />

            <input
              className="input"
              type="number"
              min={0}
              step="0.01"
              placeholder="Importe"
              value={draft.amount || ''}
              onChange={(e) => setDraft(prev => ({ ...prev, amount: Number(e.target.value || 0) }))}
            />

            <input
              className="input"
              type="date"
              value={draft.date}
              onChange={(e) => setDraft(prev => ({ ...prev, date: e.target.value }))}
            />

            <select
              value={draft.recurrence}
              onChange={(e) => setDraft(prev => ({ ...prev, recurrence: e.target.value as Recurrence }))}
              className="input"
            >
              <option value="none">Solo este mes</option>
              <option value="monthly">Fijo mensual</option>
              <option value="yearly">Fijo anual</option>
            </select>

            <input
              className="input md:col-span-2"
              placeholder="Notas (opcional)"
              value={draft.notes ?? ''}
              onChange={(e) => setDraft(prev => ({ ...prev, notes: e.target.value }))}
            />

            <button
              type="button"
              onClick={addEntry}
              className="btn-primary md:col-span-2 xl:col-span-1"
            >
              <Plus className="w-4 h-4" /> Anadir
            </button>
          </div>

          <div className="rounded-xl border border-gray-100 overflow-x-auto">
            <table className="min-w-[760px] w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
                <tr>
                  <th className="text-left px-3 py-2">Tipo</th>
                  <th className="text-left px-3 py-2">Concepto</th>
                  <th className="text-left px-3 py-2">Categoria</th>
                  <th className="text-left px-3 py-2">Fecha</th>
                  <th className="text-right px-3 py-2">Importe</th>
                  <th className="text-left px-3 py-2">Recurrencia</th>
                  <th className="text-left px-3 py-2">Activo</th>
                  <th className="text-right px-3 py-2">Accion</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {entries.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-3 py-6 text-center text-gray-400">
                      Aun no hay movimientos manuales registrados.
                    </td>
                  </tr>
                )}
                {entries.map(entry => (
                  <tr key={entry.id} className="hover:bg-gray-50">
                    <td className="px-3 py-2">
                      <span className={`badge-${entry.kind === 'ingreso' ? 'sage' : 'wheat'}`}>
                        {entry.kind}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-gray-800 font-medium">{entry.concept}</td>
                    <td className="px-3 py-2 text-gray-500">{CATEGORIES.find(c => c.value === entry.category)?.label ?? entry.category}</td>
                    <td className="px-3 py-2 text-gray-500 inline-flex items-center gap-1">
                      <CalendarDays className="w-3.5 h-3.5" /> {entry.date}
                    </td>
                    <td className={`px-3 py-2 text-right font-semibold ${entry.kind === 'ingreso' ? 'text-emerald-600' : 'text-red-600'}`}>
                      {formatCurrency(entry.amount)}
                    </td>
                    <td className="px-3 py-2 text-gray-500">{entry.recurrence}</td>
                    <td className="px-3 py-2">
                      <button
                        onClick={() => toggleEntryActive(entry.id)}
                        className={`text-xs px-2 py-1 rounded-lg border ${entry.active ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-gray-100 text-gray-500 border-gray-200'}`}
                      >
                        {entry.active ? 'Si' : 'No'}
                      </button>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button onClick={() => removeEntry(entry.id)} className="btn-ghost text-red-600 hover:bg-red-50">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="card p-4 sm:p-5 space-y-4">
          <h2 className="font-semibold text-gray-900">Valor propio de inventario</h2>

          <label className="flex items-center justify-between gap-3 text-sm">
            <span className="inline-flex items-center gap-2"><Package className="w-4 h-4 text-brand-600" /> Productos</span>
            <input
              type="checkbox"
              checked={includeProductInventory}
              onChange={(e) => setIncludeProductInventory(e.target.checked)}
            />
          </label>
          <p className="text-xs text-gray-500">
            Valorado con precio coste (si existe) o precio venta.
          </p>
          <p className="text-lg font-bold text-gray-900">{formatCurrency(productInventoryValue)}</p>

          <div className="border-t border-gray-100 pt-4" />

          <label className="flex items-center justify-between gap-3 text-sm">
            <span className="inline-flex items-center gap-2"><Wheat className="w-4 h-4 text-amber-600" /> Ingredientes</span>
            <input
              type="checkbox"
              checked={includeIngredientInventory}
              onChange={(e) => setIncludeIngredientInventory(e.target.checked)}
            />
          </label>
          <div className="space-y-2">
            <label className="text-xs text-gray-500">Valor por unidad de materia prima (EUR)</label>
            <input
              type="number"
              min={0}
              step="0.01"
              className="input"
              value={ingredientUnitValue}
              onChange={(e) => setIngredientUnitValue(Number(e.target.value || 0))}
            />
          </div>
          <p className="text-lg font-bold text-gray-900">{formatCurrency(ingredientInventoryValue)}</p>

          <div className="border-t border-gray-100 pt-4 space-y-2">
            <h3 className="text-sm font-semibold text-gray-800 inline-flex items-center gap-2">
              <Landmark className="w-4 h-4 text-gray-600" /> Peso por categoria (manual)
            </h3>
            <div className="space-y-2">
              {categoryTotals.length === 0 && <p className="text-xs text-gray-400">Sin datos para el mes seleccionado.</p>}
              {categoryTotals.map(item => (
                <div key={item.category.value} className="flex items-center justify-between text-xs">
                  <span className="text-gray-600">{item.category.label}</span>
                  <span className={item.value >= 0 ? 'text-emerald-600 font-semibold' : 'text-red-600 font-semibold'}>
                    {formatCurrency(item.value)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}

function MetricCard({
  title,
  value,
  hint,
  icon,
  tone,
}: {
  title: string
  value: string
  hint: string
  icon: React.ReactNode
  tone: 'brand' | 'red' | 'emerald' | 'blue'
}) {
  const toneClass = {
    brand: 'bg-brand-50 border-brand-100',
    red: 'bg-red-50 border-red-100',
    emerald: 'bg-emerald-50 border-emerald-100',
    blue: 'bg-blue-50 border-blue-100',
  }[tone]

  return (
    <article className={`rounded-2xl border p-4 ${toneClass}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-gray-500 font-semibold">{title}</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
        </div>
        <div className="p-2 bg-white rounded-xl border border-white/70 shadow-sm">
          {icon}
        </div>
      </div>
      <p className="text-xs text-gray-500 mt-2">{hint}</p>
    </article>
  )
}
