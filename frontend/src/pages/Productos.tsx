import { useState, useEffect, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../store/authStore'
import api from '../lib/api'
import type {
  Producto, CreateProductoDto, FichaAlergenoItem, Alergeno,
  Categoria, Ingrediente, ProductoIngredienteItem,
} from '../types'
import {
  Plus, Pencil, X, Loader2, Check, Leaf,
  Search, Trash2, Package, Tag, Info, Save,
} from 'lucide-react'
import toast from 'react-hot-toast'

const ALERGENO_EMOJI: Record<string, string> = {
  GLUTEN: '🌾', CRUSTACEOS: '🦐', HUEVOS: '🥚', PESCADO: '🐟',
  CACAHUETES: '🥜', SOJA: '🫘', LACTEOS: '🥛', FRUTOS_SECOS: '🌰',
  APIO: '🌿', MOSTAZA: '🟡', SESAMO: '🌱', SO2: '💨',
  ALTRAMUCES: '🟠', MOLUSCOS: '🦑',
}

const IVA_OPTIONS = [0, 4, 10, 21]
const UNIDADES = ['ud', 'kg', 'g', 'l', 'ml', 'caja', 'bandeja', 'docena']

const INP = 'w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500'

function Field({ label, children, span2 = false }: { label: string; children: React.ReactNode; span2?: boolean }) {
  return (
    <div className={span2 ? 'col-span-2' : ''}>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      {children}
    </div>
  )
}

type FTab = 'ficha' | 'ingredientes' | 'alergenos'

interface FormState {
  codigo: string; codigoBarras: string; nombre: string; descripcion: string
  categoriaId: string; ivaPorcentaje: number; unidadMedida: string
  pesoUnitarioGr: string; vidaUtilDias: string
  precioVenta: string; precioCoste: string; descuentoPorDefecto: string
  proveedorHabitual: string; referencia: string; fabricante: string
  stockMinimo: string; stockMaximo: string
  conservacion: string; temperaturaMin: string; temperaturaMax: string
  activo: boolean; requiereLote: boolean; compartidoRepartidores: boolean
}

const EMPTY_FORM: FormState = {
  codigo: '', codigoBarras: '', nombre: '', descripcion: '',
  categoriaId: '', ivaPorcentaje: 10, unidadMedida: 'ud',
  pesoUnitarioGr: '', vidaUtilDias: '',
  precioVenta: '', precioCoste: '', descuentoPorDefecto: '',
  proveedorHabitual: '', referencia: '', fabricante: '',
  stockMinimo: '', stockMaximo: '',
  conservacion: '', temperaturaMin: '', temperaturaMax: '',
  activo: true, requiereLote: true, compartidoRepartidores: true,
}

interface FormIngrediente {
  ingredienteId: number
  nombre: string
  cantidadGr: string
  esPrincipal: boolean
  alergenosIds: number[]
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════════════════════════════════════════

export default function Productos() {
  const { user } = useAuth()
  const qc = useQueryClient()

  // ── List filters ────────────────────────────────────────────────────────────
  const [search, setSearch] = useState('')
  const [filtroActivo, setFiltroActivo] = useState<'todos' | 'activos' | 'inactivos'>('activos')
  const [filtroCategoria, setFiltroCategoria] = useState<number | null>(null)
  const [fichaId, setFichaId] = useState<number | null>(null)
  const [fichaNombre, setFichaNombre] = useState('')

  // ── Form state ──────────────────────────────────────────────────────────────
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Producto | null>(null)
  const [formTab, setFormTab] = useState<FTab>('ficha')
  const [form, setForm] = useState<FormState>({ ...EMPTY_FORM })
  const [formIngredientes, setFormIngredientes] = useState<FormIngrediente[]>([])
  const [saving, setSaving] = useState(false)
  const [ingSearch, setIngSearch] = useState('')
  const [nuevaFamilia, setNuevaFamilia] = useState('')
  const [showNuevaFamilia, setShowNuevaFamilia] = useState(false)
  const [formErrors, setFormErrors] = useState<{ nombre?: string; precioVenta?: string; codigoBarras?: string }>({})

  // ── Queries ─────────────────────────────────────────────────────────────────
  const { data: productos = [], isLoading } = useQuery<Producto[]>({
    queryKey: ['productos', user?.empresaId, filtroActivo],
    queryFn: () =>
      api.get(`/productos?soloActivos=${filtroActivo === 'activos'}`).then(r => r.data.data),
  })

  const { data: categorias = [] } = useQuery<Categoria[]>({
    queryKey: ['categorias'],
    queryFn: () => api.get('/productos/categorias').then(r => r.data.data),
    staleTime: 30_000,
  })

  const { data: todosAlergenos = [] } = useQuery<Alergeno[]>({
    queryKey: ['alergenos'],
    queryFn: () => api.get('/alergenos').then(r => r.data),
    staleTime: Infinity,
  })

  const { data: todosIngredientes = [] } = useQuery<Ingrediente[]>({
    queryKey: ['ingredientes'],
    queryFn: () => api.get('/ingredientes').then(r => r.data),
    staleTime: 30_000,
  })

  const { data: productoIngs } = useQuery<ProductoIngredienteItem[]>({
    queryKey: ['producto-ingredientes-form', editing?.id],
    queryFn: () =>
      api.get(`/productos/${editing!.id}/ingredientes`).then(r => r.data.data),
    enabled: editing !== null,
  })

  const { data: fichaData, isLoading: fichaLoading } = useQuery<{ ficha: FichaAlergenoItem[]; totalAlergenos: number }>({
    queryKey: ['ficha-alergenos-productos', fichaId],
    queryFn: () => api.get(`/ingredientes/producto/${fichaId}/ficha-alergenos`).then(r => r.data),
    enabled: fichaId !== null,
  })

  // ── Populate form when editing loads ────────────────────────────────────────
  useEffect(() => {
    if (editing && productoIngs) {
      setFormIngredientes(
        productoIngs
          .filter(pi => !pi.esDirecto)
          .map(pi => ({
            ingredienteId: pi.ingredienteId,
            nombre: pi.nombre,
            cantidadGr: pi.cantidadGr != null ? String(pi.cantidadGr) : '',
            esPrincipal: pi.esPrincipal,
            alergenosIds: pi.alergenos.map(a => a.alergenoId),
          }))
      )
    }
  }, [productoIngs, editing])

  // ── Derived allergens from ingredients ──────────────────────────────────────
  const derivedAlergenoIds = useMemo(() => {
    const ids = new Set<number>()
    formIngredientes.forEach(fi => fi.alergenosIds.forEach(id => ids.add(id)))
    return ids
  }, [formIngredientes])

  // ── Filtered product list ───────────────────────────────────────────────────
  const listaFiltrada = useMemo(() => {
    return productos.filter(p => {
      if (filtroActivo === 'inactivos' && p.activo) return false
      if (filtroCategoria && p.categoriaId !== filtroCategoria) return false
      if (search) {
        const q = search.toLowerCase()
        return (
          p.nombre.toLowerCase().includes(q) ||
          (p.codigo ?? '').toLowerCase().includes(q) ||
          (p.codigoBarras ?? '').toLowerCase().includes(q)
        )
      }
      return true
    })
  }, [productos, filtroActivo, filtroCategoria, search])

  // ── Form helpers ────────────────────────────────────────────────────────────
  function setF<K extends keyof FormState>(k: K, v: FormState[K]) {
    setForm(prev => ({ ...prev, [k]: v }))
  }

  function openNew() {
    setEditing(null)
    setForm({ ...EMPTY_FORM })
    setFormIngredientes([])
    setFormErrors({})
    setFormTab('ficha')
    setShowForm(true)
  }

  function openEdit(p: Producto) {
    setEditing(p)
    setForm({
      codigo: p.codigo ?? '',
      codigoBarras: p.codigoBarras ?? '',
      nombre: p.nombre,
      descripcion: p.descripcion ?? '',
      categoriaId: p.categoriaId ? String(p.categoriaId) : '',
      ivaPorcentaje: p.ivaPorcentaje,
      unidadMedida: p.unidadMedida,
      pesoUnitarioGr: p.pesoUnitarioGr != null ? String(p.pesoUnitarioGr) : '',
      vidaUtilDias: p.vidaUtilDias != null ? String(p.vidaUtilDias) : '',
      precioVenta: String(p.precioVenta),
      precioCoste: p.precioCoste != null ? String(p.precioCoste) : '',
      descuentoPorDefecto: p.descuentoPorDefecto != null ? String(p.descuentoPorDefecto) : '',
      proveedorHabitual: p.proveedorHabitual ?? '',
      referencia: p.referencia ?? '',
      fabricante: p.fabricante ?? '',
      stockMinimo: p.stockMinimo != null ? String(p.stockMinimo) : '',
      stockMaximo: p.stockMaximo != null ? String(p.stockMaximo) : '',
      conservacion: (p as unknown as { conservacion?: string }).conservacion ?? '',
      temperaturaMin: (p as unknown as { temperaturaMin?: number }).temperaturaMin != null ? String((p as unknown as { temperaturaMin: number }).temperaturaMin) : '',
      temperaturaMax: (p as unknown as { temperaturaMax?: number }).temperaturaMax != null ? String((p as unknown as { temperaturaMax: number }).temperaturaMax) : '',
      activo: p.activo,
      requiereLote: p.requiereLote,
      compartidoRepartidores: p.compartidoRepartidores,
    })
    setFormIngredientes([])  // populated via query effect
    setFormErrors({})
    setFormTab('ficha')
    setShowForm(true)
  }

  function closeForm() {
    setShowForm(false)
    setEditing(null)
    setIngSearch('')
    setNuevaFamilia('')
    setShowNuevaFamilia(false)
  }

  function buildBody() {
    const n = (s: string) => (s.trim() ? parseFloat(s) : null)
    const ni = (s: string) => (s.trim() ? parseInt(s) : null)
    return {
      empresaId: user!.empresaId,
      codigo: form.codigo || null,
      codigoBarras: form.codigoBarras || null,
      nombre: form.nombre,
      descripcion: form.descripcion || null,
      categoriaId: form.categoriaId ? parseInt(form.categoriaId) : null,
      precioVenta: n(form.precioVenta) ?? 0,
      precioCoste: n(form.precioCoste),
      ivaPorcentaje: form.ivaPorcentaje,
      unidadMedida: form.unidadMedida,
      pesoUnitarioGr: n(form.pesoUnitarioGr),
      vidaUtilDias: ni(form.vidaUtilDias),
      descuentoPorDefecto: n(form.descuentoPorDefecto),
      proveedorHabitual: form.proveedorHabitual || null,
      referencia: form.referencia || null,
      fabricante: form.fabricante || null,
      stockMinimo: ni(form.stockMinimo),
      stockMaximo: ni(form.stockMaximo),
      activo: form.activo,
      requiereLote: form.requiereLote,
      compartidoRepartidores: form.compartidoRepartidores,
      conservacion: form.conservacion || null,
      temperaturaMin: n(form.temperaturaMin),
      temperaturaMax: n(form.temperaturaMax),
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    const errors: { nombre?: string; precioVenta?: string; codigoBarras?: string } = {}
    if (!form.nombre.trim()) errors.nombre = 'El nombre del producto es obligatorio'
    const pv = parseFloat(form.precioVenta)
    if (isNaN(pv) || pv < 0) errors.precioVenta = 'El precio de venta debe ser un valor válido (≥ 0)'
    if (form.codigoBarras.length > 0 && form.codigoBarras.length === 13) {
      const digits = form.codigoBarras.split('').map(Number)
      const sum = digits.slice(0, 12).reduce((acc, d, i) => acc + d * (i % 2 === 0 ? 1 : 3), 0)
      const check = (10 - (sum % 10)) % 10
      if (check !== digits[12]) errors.codigoBarras = `Dígito de control EAN-13 inválido (esperado: ${check})`
    }
    if (Object.keys(errors).length > 0) { setFormErrors(errors); return }
    setFormErrors({})
    setSaving(true)
    try {
      let productId: number
      if (editing) {
        await api.put(`/productos/${editing.id}`, buildBody())
        productId = editing.id
      } else {
        const res = await api.post<{ data: Producto }>('/productos', buildBody())
        productId = (res.data.data as unknown as Producto).id
      }
      await api.put(`/productos/${productId}/ingredientes`, {
        ingredientes: formIngredientes.map(fi => ({
          ingredienteId: fi.ingredienteId,
          cantidadGr: fi.cantidadGr ? parseFloat(fi.cantidadGr) : null,
          esPrincipal: fi.esPrincipal,
        })),
      })
      qc.invalidateQueries({ queryKey: ['productos'] })
      qc.invalidateQueries({ queryKey: ['producto-ingredientes-form', productId] })
      qc.invalidateQueries({ queryKey: ['ficha-alergenos-productos', productId] })
      toast.success(editing ? 'Producto actualizado' : 'Producto creado')
      closeForm()
    } catch {
      toast.error('Error al guardar producto')
    } finally {
      setSaving(false)
    }
  }

  async function crearFamilia() {
    if (!nuevaFamilia.trim()) return
    try {
      const res = await api.post('/productos/categorias', { nombre: nuevaFamilia.trim() })
      qc.invalidateQueries({ queryKey: ['categorias'] })
      setF('categoriaId', String(res.data.data.id))
      setNuevaFamilia('')
      setShowNuevaFamilia(false)
      toast.success('Familia creada')
    } catch {
      toast.error('Error al crear familia')
    }
  }

  function addIngrediente(ing: Ingrediente) {
    if (formIngredientes.some(fi => fi.ingredienteId === ing.id)) {
      toast.error('Ya está en la lista')
      return
    }
    setFormIngredientes(prev => [...prev, {
      ingredienteId: ing.id,
      nombre: ing.nombre,
      cantidadGr: '',
      esPrincipal: false,
      alergenosIds: ing.alergenos.map(a => a.alergenoId),
    }])
    setIngSearch('')
  }

  function removeIngrediente(ingredienteId: number) {
    setFormIngredientes(prev => prev.filter(fi => fi.ingredienteId !== ingredienteId))
  }

  function updateIngrediente(ingredienteId: number, patch: Partial<FormIngrediente>) {
    setFormIngredientes(prev => {
      // Si se marca como principal, desmarcar el resto (solo uno permitido)
      if (patch.esPrincipal === true) {
        return prev.map(fi =>
          fi.ingredienteId === ingredienteId
            ? { ...fi, ...patch }
            : { ...fi, esPrincipal: false }
        )
      }
      return prev.map(fi => fi.ingredienteId === ingredienteId ? { ...fi, ...patch } : fi)
    })
  }

  // ── Ingredient search filtered list ─────────────────────────────────────────
  const ingSugerencias = useMemo(() => {
    if (!ingSearch.trim()) return []
    const q = ingSearch.toLowerCase()
    return todosIngredientes
      .filter(i => i.activo && !formIngredientes.some(fi => fi.ingredienteId === i.id))
      .filter(i => i.nombre.toLowerCase().includes(q))
      .slice(0, 8)
  }, [ingSearch, todosIngredientes, formIngredientes])

  // ════════════════════════════════════════════════════════════════════════════
  //  RENDER
  // ════════════════════════════════════════════════════════════════════════════
  return (
    <div className="p-6 max-w-7xl mx-auto space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Productos</h1>
          <p className="text-gray-500 text-sm mt-0.5">Catálogo de artículos del obrador</p>
        </div>
        <button onClick={openNew}
          className="flex items-center gap-2 bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors">
          <Plus className="w-4 h-4" /> Nuevo producto
        </button>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Search */}
        <div className="relative min-w-[200px] flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por nombre, código…"
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500" />
        </div>

        {/* Estado filter */}
        <div className="flex gap-1 bg-gray-100 p-1 rounded-lg text-xs font-semibold">
          {(['activos', 'inactivos', 'todos'] as const).map(f => (
            <button key={f} onClick={() => setFiltroActivo(f)}
              className={`px-3 py-1.5 rounded-md capitalize transition-colors ${filtroActivo === f ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}>
              {f}
            </button>
          ))}
        </div>

        {/* Categoria filter */}
        {categorias.length > 0 && (
          <select value={filtroCategoria ?? ''}
            onChange={e => setFiltroCategoria(e.target.value ? parseInt(e.target.value) : null)}
            className="text-sm border border-gray-200 rounded-lg px-2 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500/40">
            <option value="">Todas las familias</option>
            {categorias.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
        )}

        <span className="ml-auto text-xs text-gray-400">{listaFiltrada.length} producto{listaFiltrada.length !== 1 ? 's' : ''}</span>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wider">
                <th className="px-4 py-3 text-left">Código</th>
                <th className="px-4 py-3 text-left">Nombre</th>
                <th className="px-4 py-3 text-left">Familia</th>
                <th className="px-4 py-3 text-right">P. Venta</th>
                <th className="px-4 py-3 text-right">P. Coste</th>
                <th className="px-4 py-3 text-right">IVA</th>
                <th className="px-4 py-3 text-left">Unidad</th>
                <th className="px-4 py-3 text-center">Activo</th>
                <th className="px-4 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {isLoading ? (
                <tr><td colSpan={9} className="px-5 py-8 text-center text-gray-400">
                  <Loader2 className="w-5 h-5 animate-spin mx-auto" />
                </td></tr>
              ) : !listaFiltrada.length ? (
                <tr><td colSpan={9} className="px-5 py-8 text-center text-gray-400">
                  {search || filtroCategoria ? 'Sin resultados para este filtro.' : 'No hay productos. Crea el primero.'}
                </td></tr>
              ) : listaFiltrada.map(p => (
                <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 font-mono text-xs text-gray-500">
                    {p.codigo || '—'}
                    {p.codigoBarras && <div className="text-gray-400 text-[10px]">{p.codigoBarras}</div>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900">{p.nombre}</div>
                    {p.descripcion && <div className="text-xs text-gray-400 truncate max-w-[200px]">{p.descripcion}</div>}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">
                    {p.categoriaNombre
                      ? <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-100 rounded-full">{p.categoriaNombre}</span>
                      : '—'}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold tabular-nums">{p.precioVenta.toFixed(2)} €</td>
                  <td className="px-4 py-3 text-right text-gray-500 tabular-nums">
                    {p.precioCoste != null ? `${p.precioCoste.toFixed(2)} €` : '—'}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-500">{p.ivaPorcentaje}%</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{p.unidadMedida}</td>
                  <td className="px-4 py-3 text-center">
                    {p.activo
                      ? <Check className="w-4 h-4 text-green-500 mx-auto" />
                      : <X className="w-4 h-4 text-gray-300 mx-auto" />}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => { setFichaId(p.id); setFichaNombre(p.nombre) }}
                        className="p-1.5 text-orange-400 hover:text-orange-600 hover:bg-orange-50 rounded" title="Ver alérgenos">
                        <Leaf className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => openEdit(p)}
                        className="p-1.5 text-gray-400 hover:text-brand-600 hover:bg-brand-50 rounded" title="Editar">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Modal ficha alérgenos ─────────────────────────────────────────────── */}
      {fichaId !== null && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div>
                <h2 className="font-semibold text-gray-900">Alérgenos · {fichaNombre}</h2>
                {fichaData && (
                  <p className="text-xs text-orange-600 mt-0.5">
                    {fichaData.totalAlergenos} de 14 alérgenos presentes (CE 1169/2011)
                  </p>
                )}
              </div>
              <button onClick={() => setFichaId(null)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="px-6 py-5">
              {fichaLoading ? (
                <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-gray-400" /></div>
              ) : fichaData ? (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    {fichaData.ficha.map((a: FichaAlergenoItem) => (
                      <div key={a.id}
                        className={`flex items-center gap-2 p-2.5 rounded-lg border text-xs font-medium ${a.presente ? 'bg-orange-50 border-orange-200 text-orange-800' : 'bg-gray-50 border-gray-100 text-gray-400'}`}>
                        <span className={a.presente ? '' : 'opacity-30'}>{ALERGENO_EMOJI[a.codigo] ?? '⚠️'}</span>
                        <span className="leading-tight">{a.nombre}</span>
                        {a.presente && <span className="ml-auto w-2 h-2 rounded-full bg-orange-400 shrink-0" />}
                      </div>
                    ))}
                  </div>
                  {fichaData.ficha.some((f: FichaAlergenoItem) => f.presente) && (
                    <div className="mt-4 p-3 bg-orange-50 border border-orange-100 rounded-lg">
                      <p className="text-xs font-semibold text-orange-800 mb-1">Texto para etiqueta:</p>
                      <p className="text-xs text-orange-700 leading-relaxed">
                        <strong>Contiene:</strong>{' '}
                        {fichaData.ficha.filter((f: FichaAlergenoItem) => f.presente).map((f: FichaAlergenoItem) => f.nombre).join(', ')}
                      </p>
                    </div>
                  )}
                  {fichaData.totalAlergenos === 0 && (
                    <p className="text-sm text-gray-400 text-center py-2">Sin alérgenos declarados.</p>
                  )}
                </>
              ) : null}
            </div>
          </div>
        </div>
      )}

      {/* ── Modal formulario producto ─────────────────────────────────────────── */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-start justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl my-8">

            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="font-semibold text-gray-900 flex items-center gap-2">
                <Package className="w-4 h-4 text-brand-600" />
                {editing ? `Editar · ${editing.nombre}` : 'Nuevo producto'}
              </h2>
              <button onClick={closeForm} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 mx-6 mt-4 bg-gray-100 p-1 rounded-lg">
              {(['ficha', 'ingredientes', 'alergenos'] as FTab[]).map(t => (
                <button key={t} type="button" onClick={() => setFormTab(t)}
                  className={`flex-1 text-xs font-semibold py-2 rounded-md transition-colors flex items-center justify-center gap-1.5 ${formTab === t ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}>
                  {t === 'ficha' && <Info className="w-3.5 h-3.5" />}
                  {t === 'ingredientes' && <Tag className="w-3.5 h-3.5" />}
                  {t === 'alergenos' && <Leaf className="w-3.5 h-3.5" />}
                  {t === 'ficha' ? 'Ficha' : t === 'ingredientes' ? `Ingredientes${formIngredientes.length ? ` (${formIngredientes.length})` : ''}` : 'Alérgenos'}
                  {t === 'alergenos' && derivedAlergenoIds.size > 0 && (
                    <span className="bg-orange-500 text-white text-[10px] px-1.5 rounded-full">
                      {derivedAlergenoIds.size}
                    </span>
                  )}
                </button>
              ))}
            </div>

            <form onSubmit={handleSave}>
              {/* ── TAB FICHA ─────────────────────────────────────────────────── */}
              {formTab === 'ficha' && (
                <div className="px-6 py-5 grid grid-cols-2 gap-4">

                  {/* Sección: Identificación */}
                  <div className="col-span-2 text-xs font-semibold uppercase text-gray-400 tracking-wide border-b border-gray-100 pb-1">
                    Identificación
                  </div>
                  <Field label="Código">
                    <input value={form.codigo} onChange={e => setF('codigo', e.target.value)}
                      placeholder="P-001" className={INP} />
                  </Field>
                  <Field label="Código de barras (EAN-13)">
                    <input value={form.codigoBarras} onChange={e => {
                      const v = e.target.value.replace(/\D/g, '').slice(0, 13)
                      setF('codigoBarras', v)
                    }}
                      placeholder="8400000000000" className={INP} maxLength={13} />
                    {form.codigoBarras.length > 0 && form.codigoBarras.length !== 13 && (
                      <p className="text-xs text-amber-600 mt-0.5">EAN-13 requiere exactamente 13 dígitos</p>
                    )}
                    {formErrors.codigoBarras && <p className="text-xs text-red-600 mt-0.5">{formErrors.codigoBarras}</p>}
                  </Field>
                  <Field label="Nombre / Descripción *" span2>
                    <input value={form.nombre}
                      onChange={e => { setF('nombre', e.target.value); if (e.target.value.trim()) setFormErrors(prev => { const n = { ...prev }; delete n.nombre; return n }) }}
                      required placeholder="Ej: Palmeras de hojaldre"
                      className={INP + (formErrors.nombre ? ' border-red-400 focus:ring-red-400/40 focus:border-red-400' : '')} />
                    {formErrors.nombre && <p className="text-xs text-red-600 mt-1">{formErrors.nombre}</p>}
                  </Field>
                  <Field label="Descripción ampliada" span2>
                    <textarea value={form.descripcion} onChange={e => setF('descripcion', e.target.value)}
                      rows={2} placeholder="Información adicional del producto…" className={INP} />
                  </Field>

                  {/* Sección: Clasificación */}
                  <div className="col-span-2 text-xs font-semibold uppercase text-gray-400 tracking-wide border-b border-gray-100 pb-1 mt-2">
                    Clasificación
                  </div>
                  <Field label="Familia / Categoría">
                    <div className="flex gap-2">
                      <select value={form.categoriaId} onChange={e => setF('categoriaId', e.target.value)}
                        className={INP + ' flex-1'}>
                        <option value="">Sin familia</option>
                        {categorias.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                      </select>
                      <button type="button" onClick={() => setShowNuevaFamilia(v => !v)}
                        className="px-2 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-500" title="Nueva familia">
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                    {showNuevaFamilia && (
                      <div className="mt-1 flex gap-2">
                        <input value={nuevaFamilia} onChange={e => setNuevaFamilia(e.target.value)}
                          placeholder="Nombre de la familia" className={INP + ' flex-1'} />
                        <button type="button" onClick={crearFamilia}
                          className="px-3 py-2 text-sm bg-brand-600 text-white rounded-lg hover:bg-brand-700">OK</button>
                      </div>
                    )}
                  </Field>
                  <Field label="IVA (%)">
                    <select value={form.ivaPorcentaje} onChange={e => setF('ivaPorcentaje', parseInt(e.target.value))}
                      className={INP}>
                      {IVA_OPTIONS.map(v => <option key={v} value={v}>{v}% {v === 0 ? '(Exento)' : v === 4 ? '(Superreducido)' : v === 10 ? '(Reducido)' : '(General)'}</option>)}
                    </select>
                  </Field>
                  <Field label="Unidad de medida">
                    <select value={form.unidadMedida} onChange={e => setF('unidadMedida', e.target.value)}
                      className={INP}>
                      {UNIDADES.map(u => <option key={u} value={u}>{u}</option>)}
                    </select>
                  </Field>
                  <Field label="Peso unitario (gr)">
                    <input type="number" min="0" step="0.001" value={form.pesoUnitarioGr}
                      onChange={e => setF('pesoUnitarioGr', e.target.value)}
                      placeholder="0" className={INP} />
                  </Field>
                  <Field label="Vida útil (días)">
                    <input type="number" min="0" step="1" value={form.vidaUtilDias}
                      onChange={e => setF('vidaUtilDias', e.target.value)}
                      placeholder="0" className={INP} />
                  </Field>

                  {/* Sección: Precios */}
                  <div className="col-span-2 text-xs font-semibold uppercase text-gray-400 tracking-wide border-b border-gray-100 pb-1 mt-2">
                    Precios
                  </div>
                  <Field label="Precio de venta *">
                    <div className="relative">
                      <input type="number" min="0" step="0.01" value={form.precioVenta}
                        onChange={e => { setF('precioVenta', e.target.value); setFormErrors(prev => { const n = { ...prev }; delete n.precioVenta; return n }) }}
                        required placeholder="0.00"
                        className={INP + ' pr-6' + (formErrors.precioVenta ? ' border-red-400 focus:ring-red-400/40 focus:border-red-400' : '')} />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">€</span>
                    </div>
                    {formErrors.precioVenta && <p className="text-xs text-red-600 mt-1">{formErrors.precioVenta}</p>}
                  </Field>
                  <Field label="Precio de coste">
                    <div className="relative">
                      <input type="number" min="0" step="0.01" value={form.precioCoste}
                        onChange={e => setF('precioCoste', e.target.value)}
                        placeholder="0.00" className={INP + ' pr-6'} />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">€</span>
                    </div>
                  </Field>
                  <Field label="Descuento por defecto (%)">
                    <input type="number" min="0" max="100" step="0.01" value={form.descuentoPorDefecto}
                      onChange={e => setF('descuentoPorDefecto', e.target.value)}
                      placeholder="0" className={INP} />
                  </Field>

                  {/* Sección: Proveedor */}
                  <div className="col-span-2 text-xs font-semibold uppercase text-gray-400 tracking-wide border-b border-gray-100 pb-1 mt-2">
                    Proveedor habitual
                  </div>
                  <Field label="Proveedor habitual">
                    <input value={form.proveedorHabitual} onChange={e => setF('proveedorHabitual', e.target.value)}
                      placeholder="Nombre del proveedor" className={INP} />
                  </Field>
                  <Field label="Referencia proveedor">
                    <input value={form.referencia} onChange={e => setF('referencia', e.target.value)}
                      placeholder="REF-0001" className={INP} />
                  </Field>
                  <Field label="Fabricante">
                    <input value={form.fabricante} onChange={e => setF('fabricante', e.target.value)}
                      placeholder="Nombre del fabricante" className={INP} />
                  </Field>

                  {/* Sección: Stock */}
                  <div className="col-span-2 text-xs font-semibold uppercase text-gray-400 tracking-wide border-b border-gray-100 pb-1 mt-2">
                    Control de stock
                  </div>
                  <Field label="Stock mínimo">
                    <input type="number" min="0" step="1" value={form.stockMinimo}
                      onChange={e => setF('stockMinimo', e.target.value)}
                      placeholder="0" className={INP} />
                  </Field>
                  <Field label="Stock máximo">
                    <input type="number" min="0" step="1" value={form.stockMaximo}
                      onChange={e => setF('stockMaximo', e.target.value)}
                      placeholder="0" className={INP} />
                  </Field>

                  {/* Sección: Conservación */}
                  <div className="col-span-2 text-xs font-semibold uppercase text-gray-400 tracking-wide border-b border-gray-100 pb-1 mt-2">
                    Conservación
                  </div>
                  <Field label="Modo de conservación">
                    <select value={form.conservacion} onChange={e => setF('conservacion', e.target.value)} className={INP}>
                      <option value="">Sin especificar</option>
                      <option value="Ambiente">Ambiente</option>
                      <option value="Refrigerado">Refrigerado</option>
                      <option value="Congelado">Congelado</option>
                    </select>
                  </Field>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Temp. mín (°C)">
                      <input type="number" step="0.1" value={form.temperaturaMin}
                        onChange={e => setF('temperaturaMin', e.target.value)}
                        placeholder="ej: 2" className={INP} />
                    </Field>
                    <Field label="Temp. máx (°C)">
                      <input type="number" step="0.1" value={form.temperaturaMax}
                        onChange={e => setF('temperaturaMax', e.target.value)}
                        placeholder="ej: 8" className={INP} />
                    </Field>
                  </div>

                  {/* Opciones */}
                  <div className="col-span-2 flex flex-wrap gap-4 pt-2">
                    {([
                      ['activo', 'Activo'],
                      ['requiereLote', 'Requiere lote'],
                      ['compartidoRepartidores', 'Visible para repartidores'],
                    ] as [keyof FormState, string][]).map(([k, lbl]) => (
                      <label key={k} className="flex items-center gap-2 cursor-pointer text-sm text-gray-700">
                        <input type="checkbox" checked={form[k] as boolean}
                          onChange={e => setF(k, e.target.checked as FormState[typeof k])}
                          className="w-4 h-4 accent-brand-600 rounded" />
                        {lbl}
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {/* ── TAB INGREDIENTES ──────────────────────────────────────────── */}
              {formTab === 'ingredientes' && (
                <div className="px-6 py-5 space-y-4">
                  <div className="flex items-center gap-2 p-3 bg-blue-50 border border-blue-100 rounded-lg text-xs text-blue-700">
                    <Tag className="w-4 h-4 shrink-0" />
                    Los ingredientes asignados determinan automáticamente los alérgenos del producto.
                  </div>

                  {/* Search */}
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input value={ingSearch} onChange={e => setIngSearch(e.target.value)}
                      placeholder="Buscar y añadir ingrediente…"
                      className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/40" />
                  </div>

                  {/* Autocomplete */}
                  {ingSugerencias.length > 0 && (
                    <div className="border border-gray-200 rounded-lg divide-y divide-gray-50 shadow-sm">
                      {ingSugerencias.map(ing => (
                        <button key={ing.id} type="button"
                          onClick={() => addIngrediente(ing)}
                          className="w-full text-left px-3 py-2 hover:bg-brand-50 transition-colors">
                          <div className="text-sm font-medium text-gray-900">{ing.nombre}</div>
                          {ing.alergenos.length > 0 && (
                            <div className="text-xs text-orange-600 flex flex-wrap gap-1 mt-0.5">
                              {ing.alergenos.map(a => (
                                <span key={a.alergenoId}>{ALERGENO_EMOJI[a.codigo] ?? '⚠️'} {a.nombre}</span>
                              ))}
                            </div>
                          )}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Current ingredient list */}
                  {formIngredientes.length === 0 ? (
                    <div className="text-center py-8 text-gray-400 text-sm border-2 border-dashed border-gray-200 rounded-xl">
                      Sin ingredientes asignados. Busca y añade arriba.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {formIngredientes.map(fi => (
                        <div key={fi.ingredienteId}
                          className="flex items-center gap-3 px-3 py-2.5 bg-gray-50 rounded-lg border border-gray-100">
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-gray-900 truncate">{fi.nombre}</div>
                            {fi.alergenosIds.length > 0 && (
                              <div className="text-xs text-orange-600 flex flex-wrap gap-1 mt-0.5">
                                {fi.alergenosIds.map(id => {
                                  const a = todosAlergenos.find(al => al.id === id)
                                  return a ? <span key={id}>{ALERGENO_EMOJI[a.codigo] ?? '⚠️'} {a.nombre}</span> : null
                                })}
                              </div>
                            )}
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <input type="number" min="0" step="0.001"
                              value={fi.cantidadGr}
                              onChange={e => updateIngrediente(fi.ingredienteId, { cantidadGr: e.target.value })}
                              placeholder="gr"
                              className="w-20 px-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-500/40 text-right"
                              title="Cantidad en gramos (opcional)" />
                            <label
                              title="Ingrediente principal de la receta (solo uno). Se usa para trazabilidad y etiquetado."
                              className="flex items-center gap-1 text-xs cursor-pointer whitespace-nowrap select-none"
                            >
                              <input type="checkbox" checked={fi.esPrincipal}
                                onChange={e => updateIngrediente(fi.ingredienteId, { esPrincipal: e.target.checked })}
                                className="accent-brand-600" />
                              <span className={fi.esPrincipal ? 'text-brand-700 font-semibold' : 'text-gray-600'}>
                                Principal
                              </span>
                            </label>
                            <button type="button" onClick={() => removeIngrediente(fi.ingredienteId)}
                              className="p-1 text-gray-400 hover:text-red-500 transition-colors">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* ── TAB ALÉRGENOS ─────────────────────────────────────────────── */}
              {formTab === 'alergenos' && (
                <div className="px-6 py-5 space-y-4">
                  <div className="flex items-center gap-2 p-3 bg-blue-50 border border-blue-100 rounded-lg">
                    <Info className="w-4 h-4 text-blue-500 shrink-0" />
                    <p className="text-xs text-blue-700">
                      Los alérgenos se calculan automáticamente a partir de los ingredientes asignados al producto.
                      Asigna ingredientes en la pestaña <strong>Ingredientes</strong>.
                    </p>
                  </div>

                  {formIngredientes.length === 0 ? (
                    <div className="text-center py-8 text-gray-400 text-sm border-2 border-dashed border-gray-200 rounded-xl">
                      Sin ingredientes asignados — no hay alérgenos declarados.
                    </div>
                  ) : (
                    <>
                      <div className="grid grid-cols-2 gap-2">
                        {todosAlergenos.map(a => {
                          const presente = derivedAlergenoIds.has(a.id)
                          return (
                            <div key={a.id}
                              className={`flex items-center gap-2 p-2.5 rounded-lg border text-xs font-medium ${
                                presente
                                  ? 'bg-orange-50 border-orange-200 text-orange-800'
                                  : 'bg-gray-50 border-gray-100 text-gray-400'
                              }`}>
                              <span className={presente ? '' : 'opacity-30'}>{ALERGENO_EMOJI[a.codigo] ?? '⚠️'}</span>
                              <span className="flex-1">{a.nombre}</span>
                              {presente && <span className="w-2 h-2 rounded-full bg-orange-400 shrink-0" />}
                            </div>
                          )
                        })}
                      </div>

                      {derivedAlergenoIds.size > 0 && (
                        <div className="bg-orange-50 border border-orange-100 rounded-lg px-3 py-3">
                          <p className="text-xs font-semibold text-orange-800 mb-1">Texto para etiqueta (CE 1169/2011):</p>
                          <p className="text-xs text-orange-700 leading-relaxed">
                            <strong>Contiene:</strong>{' '}
                            {todosAlergenos
                              .filter(a => derivedAlergenoIds.has(a.id))
                              .map(a => a.nombre)
                              .join(', ')}
                          </p>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* Footer */}
              <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100">
                <button type="button" onClick={closeForm}
                  className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50">
                  Cancelar
                </button>
                <button type="submit" disabled={saving}
                  className="flex items-center gap-2 px-4 py-2 text-sm bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50 font-medium">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  {saving ? 'Guardando…' : editing ? 'Guardar cambios' : 'Crear producto'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
