import { useState, FormEvent, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../store/authStore'
import api from '../lib/api'
import type { Producto, CreateProductoDto, FichaAlergenoItem, Alergeno } from '../types'
import { Plus, Pencil, X, Loader2, Check, Leaf, AlertCircle } from 'lucide-react'
import toast from 'react-hot-toast'

const ALERGENO_EMOJI: Record<string, string> = {
  GLUTEN: '🌾', CRUSTACEOS: '🦐', HUEVOS: '🥚', PESCADO: '🐟',
  CACAHUETES: '🥜', SOJA: '🫘', LACTEOS: '🥛', FRUTOS_SECOS: '🌰',
  APIO: '🌿', MOSTAZA: '🟡', SESAMO: '🌱', SO2: '💨',
  ALTRAMUCES: '🟠', MOLUSCOS: '🦑',
}

const IVA_OPTIONS = [0, 4, 10, 21]
const UNIDADES = ['ud', 'kg', 'g', 'l', 'ml', 'caja', 'bandeja', 'docena']

const EMPTY: CreateProductoDto = {
  empresaId: 0,
  codigo: '',
  nombre: '',
  descripcion: '',
  precioVenta: 0,
  precioCoste: undefined,
  ivaPorcentaje: 10,
  unidadMedida: 'ud',
}

export default function Productos() {
  const { user } = useAuth()
  const qc = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Producto | null>(null)
  const [form, setForm] = useState<CreateProductoDto>({ ...EMPTY, empresaId: user!.empresaId })
  const [fichaProductoId, setFichaProductoId] = useState<number | null>(null)
  const [fichaProductoNombre, setFichaProductoNombre] = useState('')
  // Alérgenos directos en el formulario
  const [selectedAlergenos, setSelectedAlergenos] = useState<number[]>([])
  const [formTab, setFormTab] = useState<'datos' | 'alergenos'>('datos')

  const { data: fichaData, isLoading: fichaLoading } = useQuery<{ ficha: FichaAlergenoItem[]; totalAlergenos: number }>({ 
    queryKey: ['ficha-alergenos-productos', fichaProductoId],
    queryFn: () => api.get(`/ingredientes/producto/${fichaProductoId}/ficha-alergenos`).then(r => r.data),
    enabled: fichaProductoId !== null,
  })

  const { data: todosAlergenos } = useQuery<Alergeno[]>({
    queryKey: ['alergenos'],
    queryFn: () => api.get('/alergenos').then(r => r.data as Alergeno[]),
    staleTime: Infinity,
  })

  // Cargar alergenos directos del producto editado
  const { data: alergenosDirectos } = useQuery<{ alergenoIds: number[] }>({
    queryKey: ['alergenos-directos', editing?.id],
    queryFn: () => api.get(`/productos/${editing!.id}/alergenos-directos`).then(r => r.data.data),
    enabled: editing !== null,
  })

  const { data: productos, isLoading } = useQuery({
    queryKey: ['productos', user?.empresaId],
    queryFn: async () => {
      const res = await api.get<{ data: Producto[] }>('/productos')
      return res.data.data
    },
  })

  const createMutation = useMutation({
    mutationFn: (dto: CreateProductoDto) => api.post<{ data: Producto }>('/productos', dto),
    onSuccess: async (res) => {
      const newId = (res.data.data as unknown as Producto)?.id
      if (newId && selectedAlergenos.length > 0) {
        await api.put(`/productos/${newId}/alergenos-directos`, { alergenoIds: selectedAlergenos }).catch(() => null)
      }
      qc.invalidateQueries({ queryKey: ['productos'] })
      toast.success('Producto creado')
      closeForm()
    },
    onError: () => toast.error('Error al crear producto'),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, dto }: { id: number; dto: Partial<CreateProductoDto> }) =>
      api.put(`/productos/${id}`, dto),
    onSuccess: async () => {
      if (editing && selectedAlergenos !== undefined) {
        await api.put(`/productos/${editing.id}/alergenos-directos`, { alergenoIds: selectedAlergenos }).catch(() => null)
      }
      qc.invalidateQueries({ queryKey: ['productos'] })
      qc.invalidateQueries({ queryKey: ['alergenos-directos', editing?.id] })
      qc.invalidateQueries({ queryKey: ['ficha-alergenos-productos', editing?.id] })
      toast.success('Producto actualizado')
      closeForm()
    },
    onError: () => toast.error('Error al actualizar producto'),
  })

  // Sincronizar alergenos directos cuando se carga la data de edicion
  useEffect(() => {
    if (editing && alergenosDirectos) {
      setSelectedAlergenos(alergenosDirectos.alergenoIds ?? [])
    }
  }, [alergenosDirectos, editing])

  function toggleAlergeno(id: number) {
    setSelectedAlergenos(prev =>
      prev.includes(id) ? prev.filter(a => a !== id) : [...prev, id]
    )
  }
  
  function openNew() {
    setForm({ ...EMPTY, empresaId: user!.empresaId })
    setEditing(null)
    setSelectedAlergenos([])
    setFormTab('datos')
    setShowForm(true)
  }

  function openEdit(p: Producto) {
    setForm({
      empresaId: p.empresaId,
      codigo: p.codigo,
      nombre: p.nombre,
      descripcion: p.descripcion ?? '',
      precioVenta: p.precioVenta,
      precioCoste: p.precioCoste ?? undefined,
      ivaPorcentaje: p.ivaPorcentaje,
      unidadMedida: p.unidadMedida,
    })
    setEditing(p)
    setSelectedAlergenos(alergenosDirectos?.alergenoIds ?? [])
    setFormTab('datos')
    setShowForm(true)
  }

  function closeForm() {
    setShowForm(false)
    setEditing(null)
    setSelectedAlergenos([])
    setFormTab('datos')
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (editing) {
      updateMutation.mutate({ id: editing.id, dto: form })
    } else {
      createMutation.mutate(form)
    }
  }

  const busy = createMutation.isPending || updateMutation.isPending

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Productos</h1>
          <p className="text-gray-500 text-sm mt-0.5">Catálogo de artículos del obrador</p>
        </div>
        <button
          onClick={openNew}
          className="flex items-center gap-2 bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" />
          Nuevo producto
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wider">
                <th className="px-5 py-3 text-left">Código</th>
                <th className="px-5 py-3 text-left">Nombre</th>
                <th className="px-5 py-3 text-right">Precio venta</th>
                <th className="px-5 py-3 text-right">IVA %</th>
                <th className="px-5 py-3 text-left">Unidad</th>
                <th className="px-5 py-3 text-center">Activo</th>
                <th className="px-5 py-3 text-center">Alérgenos</th>
                <th className="px-5 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="px-5 py-8 text-center text-gray-400">
                    <Loader2 className="w-5 h-5 animate-spin mx-auto" />
                  </td>
                </tr>
              ) : !productos?.length ? (
                <tr>
                  <td colSpan={8} className="px-5 py-8 text-center text-gray-400">
                    No hay productos. Crea el primero.
                  </td>
                </tr>
              ) : (
                productos.map((p) => (
                  <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-3 font-mono text-xs text-gray-600">{p.codigo}</td>
                    <td className="px-5 py-3 font-medium text-gray-900">{p.nombre}</td>
                    <td className="px-5 py-3 text-right font-semibold">{p.precioVenta.toFixed(2)} €</td>
                    <td className="px-5 py-3 text-right text-gray-600">{p.ivaPorcentaje}%</td>
                    <td className="px-5 py-3 text-gray-500">{p.unidadMedida}</td>
                    <td className="px-5 py-3 text-center">
                      {p.activo ? (
                        <Check className="w-4 h-4 text-green-500 mx-auto" />
                      ) : (
                        <X className="w-4 h-4 text-gray-300 mx-auto" />
                      )}
                    </td>
                    <td className="px-5 py-3 text-center">
                      <button
                        onClick={() => { setFichaProductoId(p.id); setFichaProductoNombre(p.nombre) }}
                        className="inline-flex items-center gap-1 text-xs text-orange-600 hover:text-orange-800 hover:bg-orange-50 px-2 py-1 rounded-lg transition-colors"
                        title="Ver ficha de alérgenos"
                      >
                        <Leaf className="w-3.5 h-3.5" /> Ficha
                      </button>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <button
                        onClick={() => openEdit(p)}
                        className="text-gray-400 hover:text-brand-600 transition-colors"
                        title="Editar"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Ficha Alérgenos */}
      {fichaProductoId !== null && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div>
                <h2 className="font-semibold text-gray-900">Alérgenos · {fichaProductoNombre}</h2>
                {fichaData && (
                  <p className="text-xs text-orange-600 mt-0.5">
                    {fichaData.totalAlergenos} de 14 alérgenos presentes (CE 1169/2011)
                  </p>
                )}
              </div>
              <button onClick={() => setFichaProductoId(null)} className="text-gray-400 hover:text-gray-600">
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
                    <p className="text-sm text-gray-400 text-center py-2">
                      Sin alérgenos declarados. Asigna ingredientes en el módulo <strong>Ingredientes</strong>.
                    </p>
                  )}
                </>
              ) : null}
            </div>
          </div>
        </div>
      )}

      {/* Form modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="font-semibold text-gray-900">{editing ? 'Editar producto' : 'Nuevo producto'}</h2>
              <button onClick={closeForm} className="text-gray-400 hover:text-gray-600 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
              {/* Tabs */}
              <div className="flex gap-1 bg-gray-100 p-1 rounded-lg">
                <button
                  type="button"
                  onClick={() => setFormTab('datos')}
                  className={`flex-1 text-xs font-semibold py-1.5 rounded-md transition-colors ${formTab === 'datos' ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
                >
                  Datos del producto
                </button>
                <button
                  type="button"
                  onClick={() => setFormTab('alergenos')}
                  className={`flex-1 text-xs font-semibold py-1.5 rounded-md transition-colors flex items-center justify-center gap-1 ${formTab === 'alergenos' ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
                >
                  <Leaf className="w-3.5 h-3.5" />
                  Alérgenos
                  {selectedAlergenos.length > 0 && (
                    <span className="ml-1 bg-orange-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center">{selectedAlergenos.length}</span>
                  )}
                </button>
              </div>

              {/* Tab: Datos */}
              {formTab === 'datos' && (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Código *</label>
                      <input
                        value={form.codigo}
                        onChange={(e) => setForm({ ...form, codigo: e.target.value })}
                        required
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Nombre *</label>
                      <input
                        value={form.nombre}
                        onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                        required
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Descripción</label>
                    <input
                      value={form.descripcion ?? ''}
                      onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Precio venta *</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={form.precioVenta}
                        onChange={(e) => setForm({ ...form, precioVenta: parseFloat(e.target.value) || 0 })}
                        required
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">IVA %</label>
                      <select
                        value={form.ivaPorcentaje}
                        onChange={(e) => setForm({ ...form, ivaPorcentaje: parseInt(e.target.value) })}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                      >
                        {IVA_OPTIONS.map((v) => (
                          <option key={v} value={v}>{v}%</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Unidad</label>
                      <select
                        value={form.unidadMedida}
                        onChange={(e) => setForm({ ...form, unidadMedida: e.target.value })}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                      >
                        {UNIDADES.map((u) => (
                          <option key={u} value={u}>{u}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </>
              )}

              {/* Tab: Alérgenos */}
              {formTab === 'alergenos' && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 bg-orange-50 border border-orange-100 rounded-lg px-3 py-2">
                    <AlertCircle className="w-4 h-4 text-orange-500 shrink-0" />
                    <p className="text-xs text-orange-700">
                      Selecciona los alérgenos que contiene este producto (Reglamento CE 1169/2011).
                      Aparecerán en la ficha técnica y en el texto de etiquetado.
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-2 max-h-64 overflow-y-auto">
                    {todosAlergenos?.map((a) => {
                      const activo = selectedAlergenos.includes(a.id)
                      return (
                        <button
                          key={a.id}
                          type="button"
                          onClick={() => toggleAlergeno(a.id)}
                          className={`flex items-center gap-2 p-2.5 rounded-lg border text-xs font-medium text-left transition-all ${
                            activo
                              ? 'bg-orange-50 border-orange-300 text-orange-800'
                              : 'bg-gray-50 border-gray-200 text-gray-500 hover:border-gray-300'
                          }`}
                        >
                          <span>{ALERGENO_EMOJI[a.codigo] ?? '⚠️'}</span>
                          <span className="flex-1">{a.nombre}</span>
                          {activo && <span className="w-2 h-2 rounded-full bg-orange-400 shrink-0" />}
                        </button>
                      )
                    })}
                  </div>
                  {selectedAlergenos.length > 0 && (
                    <div className="bg-orange-50 border border-orange-100 rounded-lg px-3 py-2">
                      <p className="text-xs font-semibold text-orange-800 mb-0.5">Texto para etiqueta:</p>
                      <p className="text-xs text-orange-700">
                        <strong>Contiene:</strong>{' '}
                        {todosAlergenos?.filter(a => selectedAlergenos.includes(a.id)).map(a => a.nombre).join(', ')}
                      </p>
                    </div>
                  )}
                </div>
              )}

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeForm}
                  className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 border border-gray-200 rounded-lg transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="flex items-center gap-2 bg-brand-500 hover:bg-brand-600 disabled:opacity-60 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
                >
                  {busy && <Loader2 className="w-4 h-4 animate-spin" />}
                  {editing ? 'Guardar cambios' : 'Crear producto'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
