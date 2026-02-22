import { useState, useEffect, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Plus, Edit2, Trash2, Search, X, Save,
  AlertTriangle, ChevronDown, ChevronRight, Package, Info,
} from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../lib/api'
import type {
  Alergeno, Ingrediente, Producto,
  FichaAlergenoItem, ProductoIngredienteLinea,
} from '../types'

// ── Types locales ─────────────────────────────────────────────────────────────

interface IngredienteProductoReq {
  ingredienteId: number
  cantidadGr: number | null
  esPrincipal: boolean
}

type Tab = 'ingredientes' | 'fichas'

const ALERGENO_EMOJI: Record<string, string> = {
  GLUTEN: '🌾',
  CRUSTACEOS: '🦐',
  HUEVOS: '🥚',
  PESCADO: '🐟',
  CACAHUETES: '🥜',
  SOJA: '🫘',
  LACTEOS: '🥛',
  FRUTOS_SECOS: '🌰',
  APIO: '🌿',
  MOSTAZA: '🟡',
  SESAMO: '🌱',
  SO2: '💨',
  ALTRAMUCES: '🟠',
  MOLUSCOS: '🦑',
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function AlergenoBadge({ codigo, nombre }: { codigo: string; nombre: string }) {
  return (
    <span
      title={nombre}
      className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs font-medium bg-orange-100 text-orange-800 border border-orange-200"
    >
      {ALERGENO_EMOJI[codigo] ?? '⚠️'} {codigo.length > 8 ? codigo.slice(0, 7) : codigo}
    </span>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function Ingredientes() {
  const [tab, setTab] = useState<Tab>('ingredientes')

  return (
    <div className="flex flex-col flex-1 overflow-y-auto bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 shrink-0">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Ingredientes y Alérgenos</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Catálogo de ingredientes · Declaración de alérgenos (CE 1169/2011) · Fichas por producto
          </p>
        </div>
        <div className="flex gap-0 mt-4 -mb-px">
          {([
            { id: 'ingredientes', label: 'Ingredientes' },
            { id: 'fichas', label: 'Fichas de alérgenos por producto' },
          ] as const).map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-5 py-2 text-sm font-medium border-b-2 transition-colors ${
                tab === t.id
                  ? 'border-brand-600 text-brand-700'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 p-6">
        {tab === 'ingredientes' && <TabIngredientes />}
        {tab === 'fichas' && <TabFichas />}
      </div>
    </div>
  )
}

// ── TAB: Ingredientes ─────────────────────────────────────────────────────────

function TabIngredientes() {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [editando, setEditando] = useState<Ingrediente | null | 'nuevo'>(null)
  const [confirmarEliminar, setConfirmarEliminar] = useState<Ingrediente | null>(null)

  const { data: ingredientes, isLoading } = useQuery<Ingrediente[]>({
    queryKey: ['ingredientes'],
    queryFn: () => api.get('/ingredientes').then(r => r.data),
  })

  const { data: alergenos } = useQuery<Alergeno[]>({
    queryKey: ['alergenos'],
    queryFn: () => api.get('/alergenos').then(r => r.data),
  })

  const filtered = useMemo(() => {
    if (!ingredientes) return []
    const q = search.toLowerCase()
    if (!q) return ingredientes
    return ingredientes.filter(
      i =>
        i.nombre.toLowerCase().includes(q) ||
        i.proveedor?.toLowerCase().includes(q) ||
        i.codigoProveedor?.toLowerCase().includes(q)
    )
  }, [ingredientes, search])

  const deleteMut = useMutation({
    mutationFn: (id: number) => api.delete(`/ingredientes/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ingredientes'] })
      setConfirmarEliminar(null)
      toast.success('Ingrediente eliminado')
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
      toast.error(msg ?? 'No se pudo eliminar')
      setConfirmarEliminar(null)
    },
  })

  return (
    <div className="flex gap-6">
      {/* List */}
      <div className="flex-1 min-w-0">
        {/* Toolbar */}
        <div className="flex items-center gap-3 mb-4">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar ingrediente..."
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500"
            />
          </div>
          <button
            onClick={() => setEditando('nuevo')}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition-colors"
          >
            <Plus className="w-4 h-4" /> Nuevo ingrediente
          </button>
        </div>

        {/* Table */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {isLoading ? (
            <div className="p-8 text-center text-gray-400 text-sm">Cargando...</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  {['Ingrediente', 'Proveedor', 'Alérgenos', 'Estado', ''].map(h => (
                    <th
                      key={h}
                      className={`px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide ${
                        h === 'Ingrediente' || h === 'Proveedor' ? 'text-left' : h === '' ? 'text-right' : 'text-left'
                      }`}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map(ing => (
                  <tr key={ing.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900">{ing.nombre}</p>
                      {ing.descripcion && (
                        <p className="text-xs text-gray-400 mt-0.5 truncate max-w-[220px]">
                          {ing.descripcion}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {ing.proveedor ?? '—'}
                      {ing.codigoProveedor && (
                        <span className="ml-1.5 text-xs text-gray-400">
                          ({ing.codigoProveedor})
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {ing.alergenos.length === 0 ? (
                        <span className="text-xs text-gray-400">Sin alérgenos</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {ing.alergenos.map(a => (
                            <AlergenoBadge key={a.alergenoId} codigo={a.codigo} nombre={a.nombre} />
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                          ing.activo
                            ? 'bg-green-100 text-green-700'
                            : 'bg-gray-100 text-gray-500'
                        }`}
                      >
                        {ing.activo ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => setEditando(ing)}
                          className="p-1.5 text-gray-400 hover:text-brand-600 hover:bg-brand-50 rounded"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setConfirmarEliminar(ing)}
                          className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-gray-400 text-sm">
                      {ingredientes?.length === 0
                        ? 'No hay ingredientes registrados. Crea el primero.'
                        : 'Sin resultados para la búsqueda'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>

        {/* Info box */}
        <div className="mt-4 p-3 bg-blue-50 border border-blue-100 rounded-lg flex gap-2">
          <Info className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
          <p className="text-xs text-blue-700">
            Los{' '}
            <strong>14 alérgenos reglamentarios</strong> (Reglamento CE 1169/2011 y RD 126/2015)
            están precargados. Asocia los que contenga cada ingrediente y el sistema calculará
            automáticamente la ficha de alérgenos de cada producto.
          </p>
        </div>
      </div>

      {/* Panel lateral crear/editar */}
      {editando !== null && (
        <FormPanel
          ingrediente={editando === 'nuevo' ? null : editando}
          alergenos={alergenos ?? []}
          onClose={() => setEditando(null)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ['ingredientes'] })
            setEditando(null)
          }}
        />
      )}

      {/* Confirmación eliminar */}
      {confirmarEliminar && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 max-w-sm w-full mx-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
              <div>
                <h3 className="font-semibold text-gray-900 text-sm">Eliminar ingrediente</h3>
                <p className="text-sm text-gray-600 mt-1">
                  ¿Eliminar <strong>{confirmarEliminar.nombre}</strong>? Si está asignado a algún
                  producto no se podrá eliminar.
                </p>
              </div>
            </div>
            <div className="flex gap-3 mt-4 justify-end">
              <button
                onClick={() => setConfirmarEliminar(null)}
                className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                onClick={() => deleteMut.mutate(confirmarEliminar.id)}
                disabled={deleteMut.isPending}
                className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── FormPanel: crear / editar ingrediente ─────────────────────────────────────

function FormPanel({
  ingrediente,
  alergenos,
  onClose,
  onSaved,
}: {
  ingrediente: Ingrediente | null
  alergenos: Alergeno[]
  onClose: () => void
  onSaved: () => void
}) {
  const [nombre, setNombre] = useState(ingrediente?.nombre ?? '')
  const [descripcion, setDescripcion] = useState(ingrediente?.descripcion ?? '')
  const [proveedor, setProveedor] = useState(ingrediente?.proveedor ?? '')
  const [codigoProveedor, setCodigoProveedor] = useState(ingrediente?.codigoProveedor ?? '')
  const [activo, setActivo] = useState(ingrediente?.activo ?? true)
  const [selectedAlergenos, setSelectedAlergenos] = useState<Set<number>>(
    new Set(ingrediente?.alergenos.map(a => a.alergenoId) ?? [])
  )
  const [saving, setSaving] = useState(false)

  function toggleAlergeno(id: number) {
    setSelectedAlergenos(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  async function handleSave() {
    if (!nombre.trim()) { toast.error('El nombre es obligatorio'); return }
    setSaving(true)
    try {
      const body = {
        nombre: nombre.trim(),
        descripcion: descripcion.trim() || null,
        proveedor: proveedor.trim() || null,
        codigoProveedor: codigoProveedor.trim() || null,
        activo,
        alergenoIds: [...selectedAlergenos],
      }
      if (ingrediente) {
        await api.put(`/ingredientes/${ingrediente.id}`, body)
        toast.success('Ingrediente actualizado')
      } else {
        await api.post('/ingredientes', body)
        toast.success('Ingrediente creado')
      }
      onSaved()
    } catch {
      toast.error('Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="w-80 shrink-0 bg-white rounded-xl border border-gray-200 flex flex-col h-fit sticky top-0">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <h3 className="text-sm font-semibold text-gray-900">
          {ingrediente ? 'Editar ingrediente' : 'Nuevo ingrediente'}
        </h3>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Form */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <Field label="Nombre *">
          <input
            value={nombre}
            onChange={e => setNombre(e.target.value)}
            placeholder="Ej: Harina de trigo"
            className={INPUT}
          />
        </Field>

        <Field label="Descripción">
          <textarea
            value={descripcion}
            onChange={e => setDescripcion(e.target.value)}
            rows={2}
            className={INPUT}
            placeholder="Descripción opcional"
          />
        </Field>

        <div className="grid grid-cols-2 gap-2">
          <Field label="Proveedor">
            <input
              value={proveedor}
              onChange={e => setProveedor(e.target.value)}
              className={INPUT}
              placeholder="Nombre"
            />
          </Field>
          <Field label="Código prov.">
            <input
              value={codigoProveedor}
              onChange={e => setCodigoProveedor(e.target.value)}
              className={INPUT}
              placeholder="REF-001"
            />
          </Field>
        </div>

        {ingrediente && (
          <Field label="Estado">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={activo}
                onChange={e => setActivo(e.target.checked)}
                className="w-4 h-4 rounded accent-brand-600"
              />
              <span className="text-sm text-gray-700">Activo</span>
            </label>
          </Field>
        )}

        {/* Alérgenos */}
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Alérgenos que contiene
          </p>
          <div className="grid grid-cols-1 gap-1.5 max-h-64 overflow-y-auto">
            {alergenos.map(a => (
              <label
                key={a.id}
                className={`flex items-center gap-2 cursor-pointer px-3 py-2 rounded-lg border text-xs transition-colors ${
                  selectedAlergenos.has(a.id)
                    ? 'bg-orange-50 border-orange-300 text-orange-800'
                    : 'border-gray-100 hover:bg-gray-50 text-gray-700'
                }`}
              >
                <input
                  type="checkbox"
                  checked={selectedAlergenos.has(a.id)}
                  onChange={() => toggleAlergeno(a.id)}
                  className="w-3.5 h-3.5 accent-orange-500"
                />
                <span>{ALERGENO_EMOJI[a.codigo] ?? '⚠️'}</span>
                <span className="font-medium">{a.nombre}</span>
              </label>
            ))}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-gray-100 flex gap-2">
        <button
          onClick={onClose}
          className="flex-1 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50"
        >
          Cancelar
        </button>
        <button
          onClick={handleSave}
          disabled={saving || !nombre.trim()}
          className="flex-1 flex items-center justify-center gap-2 py-2 text-sm bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50"
        >
          <Save className="w-3.5 h-3.5" />
          {saving ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
    </div>
  )
}

const INPUT =
  'w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      {children}
    </div>
  )
}

// ── TAB: Fichas de alérgenos por producto ─────────────────────────────────────

function TabFichas() {
  const qc = useQueryClient()
  const [productoId, setProductoId] = useState<number | null>(null)
  const [asignando, setAsignando] = useState(false)

  const { data: productos } = useQuery<Producto[]>({
    queryKey: ['productos-activos'],
    queryFn: () => api.get('/productos?soloActivos=true').then(r => r.data),
  })

  const { data: ingredientesTodos } = useQuery<Ingrediente[]>({
    queryKey: ['ingredientes'],
    queryFn: () => api.get('/ingredientes').then(r => r.data),
  })

  const { data: fichaData, isLoading: fichaLoading } = useQuery<{
    ingredientes: ProductoIngredienteLinea[]
    alergenosProducto: { alergenoId: number; codigo: string; nombre: string }[]
  }>({
    queryKey: ['producto-ingredientes', productoId],
    queryFn: () => api.get(`/ingredientes/producto/${productoId}`).then(r => r.data),
    enabled: productoId !== null,
  })

  const { data: fichaCompleta } = useQuery<{
    ficha: FichaAlergenoItem[]
    totalAlergenos: number
    producto: { nombre: string } | null
  }>({
    queryKey: ['ficha-alergenos', productoId],
    queryFn: () =>
      api.get(`/ingredientes/producto/${productoId}/ficha-alergenos`).then(r => r.data),
    enabled: productoId !== null,
  })

  // Estado local de asignación de ingredientes
  const [asignaciones, setAsignaciones] = useState<
    Map<number, { ingredienteId: number; cantidadGr: number | null; esPrincipal: boolean }>
  >(new Map())

  // Al cargar fichaData, inicializar asignaciones
  useEffect(() => {
    if (fichaData) {
      const m = new Map<
        number,
        { ingredienteId: number; cantidadGr: number | null; esPrincipal: boolean }
      >()
      fichaData.ingredientes.forEach(i => {
        m.set(i.ingredienteId, {
          ingredienteId: i.ingredienteId,
          cantidadGr: i.cantidadGr,
          esPrincipal: i.esPrincipal,
        })
      })
      setAsignaciones(m)
    }
  }, [fichaData])

  const saveMut = useMutation({
    mutationFn: (payload: { productoId: number; ingredientes: IngredienteProductoReq[] }) =>
      api.put(`/ingredientes/producto/${payload.productoId}`, {
        ingredientes: payload.ingredientes,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['producto-ingredientes', productoId] })
      qc.invalidateQueries({ queryKey: ['ficha-alergenos', productoId] })
      toast.success('Ingredientes del producto actualizados')
      setAsignando(false)
    },
    onError: () => toast.error('Error al guardar'),
  })

  function toggleIngrediente(id: number) {
    setAsignaciones(prev => {
      const next = new Map(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.set(id, { ingredienteId: id, cantidadGr: null, esPrincipal: false })
      }
      return next
    })
  }

  function handleSaveAsignacion() {
    if (!productoId) return
    const ingredientes: IngredienteProductoReq[] = [...asignaciones.values()]
    saveMut.mutate({ productoId, ingredientes })
  }

  const productoSeleccionado = productos?.find(p => p.id === productoId)

  return (
    <div className="space-y-6">
      {/* Selector de producto */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
          <Package className="w-4 h-4 text-brand-600" />
          Seleccionar producto
        </h2>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative">
            <select
              value={productoId ?? ''}
              onChange={e => {
                setProductoId(e.target.value ? parseInt(e.target.value) : null)
                setAsignando(false)
              }}
              className="pl-3 pr-8 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500 appearance-none min-w-[260px] bg-white"
            >
              <option value="">— Elige un producto —</option>
              {productos?.map(p => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                  {p.codigo ? ` (${p.codigo})` : ''}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          </div>

          {productoId && !asignando && (
            <button
              onClick={() => setAsignando(true)}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition-colors"
            >
              <Edit2 className="w-3.5 h-3.5" /> Gestionar ingredientes
            </button>
          )}
        </div>
      </div>

      {productoId && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          {/* ── Matriz de alérgenos ─────────────────────────────────────── */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-gray-700">
                Declaración de alérgenos
              </h2>
              {fichaCompleta && (
                <span className="text-xs font-medium text-orange-700 bg-orange-100 px-2 py-0.5 rounded-full">
                  {fichaCompleta.totalAlergenos} / 14 presentes
                </span>
              )}
            </div>

            {fichaLoading ? (
              <p className="text-sm text-gray-400 text-center py-6">Cargando...</p>
            ) : fichaCompleta ? (
              <div className="grid grid-cols-2 gap-2">
                {fichaCompleta.ficha.map(a => (
                  <div
                    key={a.id}
                    className={`flex items-center gap-2 p-2.5 rounded-lg border text-xs font-medium ${
                      a.presente
                        ? 'bg-orange-50 border-orange-200 text-orange-800'
                        : 'bg-gray-50 border-gray-100 text-gray-400'
                    }`}
                  >
                    <span className={a.presente ? '' : 'opacity-30'}>
                      {ALERGENO_EMOJI[a.codigo] ?? '⚠️'}
                    </span>
                    <span className="leading-tight">{a.nombre}</span>
                    {a.presente && (
                      <span className="ml-auto w-2 h-2 rounded-full bg-orange-400 shrink-0" />
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-400 text-center py-6">
                No hay ingredientes asignados. Usa "Gestionar ingredientes" para asignarlos.
              </p>
            )}

            {fichaCompleta && fichaCompleta.ficha.some(f => f.presente) && (
              <div className="mt-4 p-3 bg-orange-50 border border-orange-100 rounded-lg">
                <p className="text-xs font-semibold text-orange-800 mb-1">
                  Declaración para etiqueta:
                </p>
                <p className="text-xs text-orange-700 leading-relaxed">
                  <strong>Contiene:</strong>{' '}
                  {fichaCompleta.ficha
                    .filter(f => f.presente)
                    .map(f => f.nombre)
                    .join(', ')}
                </p>
              </div>
            )}
          </div>

          {/* ── Lista de ingredientes asignados ────────────────────────── */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="text-sm font-semibold text-gray-700 mb-4">
              Ingredientes de{' '}
              <span className="text-brand-700">{productoSeleccionado?.nombre}</span>
            </h2>

            {!asignando ? (
              /* Vista de solo lectura */
              fichaData?.ingredientes.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-sm text-gray-400">Sin ingredientes asignados</p>
                  <button
                    onClick={() => setAsignando(true)}
                    className="mt-3 text-sm text-brand-600 hover:text-brand-700 font-medium"
                  >
                    + Asignar ingredientes
                  </button>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {fichaData?.ingredientes.map(ing => (
                    <div
                      key={ing.id}
                      className="flex items-center gap-3 p-2.5 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors"
                    >
                      <ChevronRight className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900">
                          {ing.ingredienteNombre}
                          {ing.esPrincipal && (
                            <span className="ml-2 text-xs text-brand-600 font-medium">
                              principal
                            </span>
                          )}
                        </p>
                        {ing.cantidadGr != null && (
                          <p className="text-xs text-gray-400">{ing.cantidadGr} g</p>
                        )}
                      </div>
                      {ing.alergenos.length > 0 && (
                        <div className="flex gap-1 flex-wrap justify-end">
                          {ing.alergenos.slice(0, 3).map(a => (
                            <span key={a.alergenoId} title={a.nombre} className="text-base leading-none">
                              {ALERGENO_EMOJI[a.codigo] ?? '⚠️'}
                            </span>
                          ))}
                          {ing.alergenos.length > 3 && (
                            <span className="text-xs text-gray-400">
                              +{ing.alergenos.length - 3}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )
            ) : (
              /* Modo edición */
              <div>
                <p className="text-xs text-gray-500 mb-3">
                  Marca los ingredientes que forman parte de este producto:
                </p>
                <div className="max-h-72 overflow-y-auto space-y-1.5 mb-4">
                  {(ingredientesTodos ?? [])
                    .filter(i => i.activo)
                    .map(ing => (
                      <label
                        key={ing.id}
                        className={`flex items-center gap-3 cursor-pointer px-3 py-2.5 rounded-lg border text-sm transition-colors ${
                          asignaciones.has(ing.id)
                            ? 'bg-brand-50 border-brand-200 text-brand-900'
                            : 'border-gray-100 hover:bg-gray-50 text-gray-700'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={asignaciones.has(ing.id)}
                          onChange={() => toggleIngrediente(ing.id)}
                          className="w-4 h-4 accent-brand-600"
                        />
                        <span className="flex-1 font-medium">{ing.nombre}</span>
                        {ing.alergenos.length > 0 && (
                          <span className="flex gap-0.5 text-base leading-none">
                            {ing.alergenos.slice(0, 3).map(a => (
                              <span key={a.alergenoId} title={a.nombre}>
                                {ALERGENO_EMOJI[a.codigo] ?? '⚠️'}
                              </span>
                            ))}
                          </span>
                        )}
                      </label>
                    ))}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setAsignando(false)
                      // Restaurar estado previo
                      if (fichaData) {
                        const m = new Map<
                          number,
                          {
                            ingredienteId: number
                            cantidadGr: number | null
                            esPrincipal: boolean
                          }
                        >()
                        fichaData.ingredientes.forEach(i => {
                          m.set(i.ingredienteId, {
                            ingredienteId: i.ingredienteId,
                            cantidadGr: i.cantidadGr,
                            esPrincipal: i.esPrincipal,
                          })
                        })
                        setAsignaciones(m)
                      }
                    }}
                    className="flex-1 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleSaveAsignacion}
                    disabled={saveMut.isPending}
                    className="flex-1 flex items-center justify-center gap-2 py-2 text-sm bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50"
                  >
                    <Save className="w-3.5 h-3.5" />
                    {saveMut.isPending ? 'Guardando…' : 'Guardar'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
