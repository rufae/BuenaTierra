import { useState, useEffect, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Plus, Edit2, Trash2, Search, X, Save, Loader2,
  AlertTriangle, ChevronDown, ChevronRight, Package, Info, ClipboardList,
  FileDown, FileSpreadsheet, Boxes,
} from 'lucide-react'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import * as XLSX from 'xlsx'
import toast from 'react-hot-toast'
import api from '../lib/api'
import { DateInput } from '../components/DateInput'
import type {
  Alergeno, Ingrediente, Producto,
  FichaAlergenoItem, ProductoIngredienteLinea,
  ControlMateriaPrima, UpsertControlMateriaPrimaDto,
} from '../types'

// ── Types locales ─────────────────────────────────────────────────────────────

interface IngredienteProductoReq {
  ingredienteId: number
  cantidadGr: number | null
  esPrincipal: boolean
}

type Tab = 'ingredientes' | 'fichas' | 'control' | 'stock'

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
    <div className="p-6 space-y-5">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Ingredientes y Alérgenos</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Catálogo de ingredientes · Declaración de alérgenos (CE 1169/2011) · Fichas por producto
        </p>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white px-2 pt-2">
        <div className="flex gap-1 border-b border-gray-100 px-1">
          {([
            { id: 'ingredientes', label: 'Ingredientes' },
            { id: 'fichas', label: 'Fichas de alérgenos por producto' },
            { id: 'control', label: 'Control de ingredientes' },
            { id: 'stock', label: 'Stock de materias primas' },
          ] as const).map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-2 text-sm rounded-t-lg font-medium transition-colors ${
                tab === t.id
                  ? 'bg-brand-50 text-brand-700 border-b-2 border-brand-500'
                  : 'text-gray-500 hover:text-gray-700 border-b-2 border-transparent'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="p-4 md:p-6">
        {tab === 'ingredientes' && <TabIngredientes />}
        {tab === 'fichas' && <TabFichas />}
        {tab === 'control' && <TabControlMaterias />}
        {tab === 'stock' && <TabStockMP />}
        </div>
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

// ── TAB: Control de Ingredientes (Control Mat. Primas) ──────────────────────

const EMPTY_CTRL: UpsertControlMateriaPrimaDto = {
  fechaEntrada: new Date().toISOString().split('T')[0],
  producto: '',
  unidades: 1,
  ingredienteId: null,
  fechaCaducidad: null,
  proveedor: null,
  lote: null,
  fechaAperturaLote: null,
  condicionesTransporte: true,
  mercanciaAceptada: true,
  responsable: null,
  fechaFinExistencia: null,
  observaciones: null,
}

function TabControlMaterias() {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<ControlMateriaPrima | null>(null)
  const [form, setForm] = useState<UpsertControlMateriaPrimaDto>({ ...EMPTY_CTRL })

  const { data: ingredientes } = useQuery<Ingrediente[]>({
    queryKey: ['ingredientes'],
    queryFn: () => api.get('/ingredientes').then(r => r.data),
  })

  const { data: lista = [], isLoading } = useQuery<ControlMateriaPrima[]>({
    queryKey: ['control-mat', search, desde, hasta],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (search) params.set('q', search)
      if (desde) params.set('desde', desde)
      if (hasta) params.set('hasta', hasta)
      const r = await api.get(`/control-materias-primas?${params.toString()}`)
      return r.data.data
    },
  })

  const createMut = useMutation({
    mutationFn: (dto: UpsertControlMateriaPrimaDto) =>
      api.post('/control-materias-primas', dto),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['control-mat'] })
      toast.success('Registro añadido')
      closeModal()
    },
    onError: () => toast.error('Error al guardar'),
  })

  const updateMut = useMutation({
    mutationFn: ({ id, dto }: { id: number; dto: UpsertControlMateriaPrimaDto }) =>
      api.put(`/control-materias-primas/${id}`, dto),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['control-mat'] })
      toast.success('Registro actualizado')
      closeModal()
    },
    onError: () => toast.error('Error al actualizar'),
  })

  const deleteMut = useMutation({
    mutationFn: (id: number) => api.delete(`/control-materias-primas/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['control-mat'] })
      toast.success('Registro eliminado')
    },
    onError: () => toast.error('Error al eliminar'),
  })

  function openNew() {
    setEditing(null)
    setForm({ ...EMPTY_CTRL, fechaEntrada: new Date().toISOString().split('T')[0] })
    setModalOpen(true)
  }

  function openEdit(row: ControlMateriaPrima) {
    setEditing(row)
    setForm({
      fechaEntrada: row.fechaEntrada,
      producto: row.producto,
      unidades: row.unidades,
      ingredienteId: row.ingredienteId,
      fechaCaducidad: row.fechaCaducidad,
      proveedor: row.proveedor,
      lote: row.lote,
      fechaAperturaLote: row.fechaAperturaLote,
      condicionesTransporte: row.condicionesTransporte,
      mercanciaAceptada: row.mercanciaAceptada,
      responsable: row.responsable,
      fechaFinExistencia: row.fechaFinExistencia,
      observaciones: row.observaciones,
    })
    setModalOpen(true)
  }

  function closeModal() { setModalOpen(false); setEditing(null) }

  function f<K extends keyof UpsertControlMateriaPrimaDto>(k: K, v: UpsertControlMateriaPrimaDto[K]) {
    setForm(prev => ({ ...prev, [k]: v }))
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.ingredienteId) { toast.error('Selecciona un ingrediente'); return }
    if (editing) updateMut.mutate({ id: editing.id, dto: form })
    else createMut.mutate(form)
  }

  const busy = createMut.isPending || updateMut.isPending

  const fmt = (d: string | null) => {
    if (!d) return '—'
    const [y, m, day] = d.split('T')[0].split('-')
    return `${day}/${m}/${y}`
  }

  function exportPdf(rows: ControlMateriaPrima[]) {
    const doc = new jsPDF({ orientation: 'landscape' })
    doc.setFontSize(13)
    doc.text('Control de Ingredientes / Materias Primas', 14, 14)
    autoTable(doc, {
      startY: 20,
      head: [['F. entrada', 'Producto', 'Uds.', 'Caducidad', 'Proveedor', 'Lote', 'Apertura lote', 'Transp.', 'Mercancía', 'Responsable', 'Fin existencia']],
      body: rows.map(r => [
        fmt(r.fechaEntrada),
        r.producto,
        r.unidades,
        fmt(r.fechaCaducidad),
        r.proveedor ?? '',
        r.lote ?? '',
        fmt(r.fechaAperturaLote),
        r.condicionesTransporte ? 'C' : 'I',
        r.mercanciaAceptada ? 'Aceptada' : 'Rechazada',
        r.responsable ?? '',
        fmt(r.fechaFinExistencia),
      ]),
      styles: { fontSize: 7 },
      headStyles: { fillColor: [22, 163, 74] },
    })
    doc.save('control-ingredientes.pdf')
  }

  function exportExcel(rows: ControlMateriaPrima[]) {
    const data = rows.map(r => ({
      'Fecha entrada': fmt(r.fechaEntrada),
      'Producto': r.producto,
      'Unidades': r.unidades,
      'Caducidad': fmt(r.fechaCaducidad),
      'Proveedor': r.proveedor ?? '',
      'Lote': r.lote ?? '',
      'Apertura lote': fmt(r.fechaAperturaLote),
      'Transporte': r.condicionesTransporte ? 'Correcto' : 'Incorrecto',
      'Mercancía': r.mercanciaAceptada ? 'Aceptada' : 'Rechazada',
      'Responsable': r.responsable ?? '',
      'Fin existencia': fmt(r.fechaFinExistencia),
      'Observaciones': r.observaciones ?? '',
    }))
    const ws = XLSX.utils.json_to_sheet(data)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Control ingredientes')
    XLSX.writeFile(wb, 'control-ingredientes.xlsx')
  }

  const boolBadge = (val: boolean, trueLabel: string, falseLabel: string) => (
    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${val ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
      {val ? trueLabel : falseLabel}
    </span>
  )

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Buscar producto, proveedor, lote…"
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500" />
        </div>
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <span className="text-xs">Desde</span>
          <DateInput value={desde} onChange={setDesde} />
          <span className="text-xs">Hasta</span>
          <DateInput value={hasta} onChange={setHasta} />
          {(desde || hasta) && (
            <button onClick={() => { setDesde(''); setHasta('') }} className="text-xs text-gray-400 hover:text-gray-700">✕ limpiar</button>
          )}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => exportExcel(lista)}
            disabled={!lista.length}
            className="flex items-center gap-2 px-3 py-2 text-sm font-medium bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-40 transition-colors"
            title="Exportar a Excel">
            <FileSpreadsheet className="w-4 h-4" /> Excel
          </button>
          <button
            onClick={() => exportPdf(lista)}
            disabled={!lista.length}
            className="flex items-center gap-2 px-3 py-2 text-sm font-medium bg-rose-600 text-white rounded-lg hover:bg-rose-700 disabled:opacity-40 transition-colors"
            title="Exportar a PDF">
            <FileDown className="w-4 h-4" /> PDF
          </button>
          <button onClick={openNew}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition-colors">
            <Plus className="w-4 h-4" /> Nuevo registro
          </button>
        </div>
      </div>

      {/* Info banner */}
      <div className="flex gap-2 p-3 bg-blue-50 border border-blue-100 rounded-lg">
        <ClipboardList className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
        <p className="text-xs text-blue-700">
          Registro de recepción de materias primas exigido por sanidad.
          Equivale al documento <strong>CONTROL MAT PRIMAS</strong>.
        </p>
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
        {isLoading ? (
          <div className="p-8 text-center text-gray-400 text-sm">Cargando…</div>
        ) : (
          <table className="w-full text-xs min-w-[1200px]">
            <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
              <tr>
                <th className="px-3 py-3 text-left">Fecha entrada</th>
                <th className="px-3 py-3 text-left">Producto</th>
                <th className="px-3 py-3 text-right">Uds.</th>
                <th className="px-3 py-3 text-left">Caducidad</th>
                <th className="px-3 py-3 text-left">Proveedor</th>
                <th className="px-3 py-3 text-left">Lote</th>
                <th className="px-3 py-3 text-left">Apertura lote</th>
                <th className="px-3 py-3 text-center">Transp.</th>
                <th className="px-3 py-3 text-center">Mercancía</th>
                <th className="px-3 py-3 text-left">Responsable</th>
                <th className="px-3 py-3 text-left">Fin existencia</th>
                <th className="px-3 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {!lista.length ? (
                <tr>
                  <td colSpan={12} className="px-4 py-8 text-center text-gray-400">
                    Sin registros. Añade el primero con "Nuevo registro".
                  </td>
                </tr>
              ) : lista.map(row => (
                <tr key={row.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-3 py-2 font-medium text-gray-700">{fmt(row.fechaEntrada)}</td>
                  <td className="px-3 py-2 font-semibold text-gray-900">{row.producto}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{row.unidades}</td>
                  <td className="px-3 py-2 text-gray-600">{fmt(row.fechaCaducidad)}</td>
                  <td className="px-3 py-2 text-gray-600">{row.proveedor ?? '—'}</td>
                  <td className="px-3 py-2 font-mono text-gray-600">{row.lote ?? '—'}</td>
                  <td className="px-3 py-2 text-gray-600">{fmt(row.fechaAperturaLote)}</td>
                  <td className="px-3 py-2 text-center">{boolBadge(row.condicionesTransporte, 'C', 'I')}</td>
                  <td className="px-3 py-2 text-center">{boolBadge(row.mercanciaAceptada, 'Aceptada', 'Rechazada')}</td>
                  <td className="px-3 py-2 text-gray-600">{row.responsable ?? '—'}</td>
                  <td className="px-3 py-2 text-gray-600">{fmt(row.fechaFinExistencia)}</td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => openEdit(row)}
                        className="p-1.5 text-gray-400 hover:text-brand-600 hover:bg-brand-50 rounded">
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => { if (confirm('¿Eliminar este registro?')) deleteMut.mutate(row.id) }}
                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-start justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl my-8">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="font-semibold text-gray-900 flex items-center gap-2">
                <ClipboardList className="w-4 h-4 text-brand-600" />
                {editing ? 'Editar registro' : 'Nuevo registro de recepción'}
              </h2>
              <button onClick={closeModal} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="px-6 py-5 grid grid-cols-2 gap-4">

                {/* Fila 1 */}
                <CField label="Fecha de entrada *">
                  <DateInput value={form.fechaEntrada} onChange={v => f('fechaEntrada', v)} required className="w-full" />
                </CField>

                <CField label="Producto / Ingrediente *">
                  <select
                    value={form.ingredienteId ?? ''}
                    onChange={e => {
                      const id = parseInt(e.target.value)
                      const ing = ingredientes?.find(i => i.id === id)
                      f('ingredienteId', id || null)
                      f('producto', ing?.nombre ?? '')
                    }}
                    className={INPUT2}
                    required
                  >
                    <option value="">— Selecciona un ingrediente —</option>
                    {ingredientes?.filter(i => i.activo).map(i => (
                      <option key={i.id} value={i.id}>{i.nombre}</option>
                    ))}
                  </select>
                </CField>

                {/* Fila 2 */}
                <CField label="Unidades">
                  <input type="number" min="0" step="1" value={form.unidades}
                    onFocus={e => e.currentTarget.select()}
                    onChange={e => f('unidades', parseInt(e.target.value || '0', 10) || 0)}
                    className={INPUT2} />
                </CField>

                <CField label="Fecha caducidad">
                  <DateInput value={form.fechaCaducidad ?? ''} onChange={v => f('fechaCaducidad', v || null)} className="w-full" />
                </CField>

                {/* Fila 3 */}
                <CField label="Proveedor">
                  <input value={form.proveedor ?? ''} onChange={e => f('proveedor', e.target.value || null)}
                    placeholder="Nombre del proveedor" className={INPUT2} />
                </CField>

                <CField label="Lote">
                  <input value={form.lote ?? ''} onChange={e => f('lote', e.target.value || null)}
                    placeholder="Código de lote" className={INPUT2} />
                </CField>

                {/* Fila 4 */}
                <CField label="Fecha apertura lote">
                  <DateInput value={form.fechaAperturaLote ?? ''} onChange={v => f('fechaAperturaLote', v || null)} className="w-full" />
                </CField>

                <CField label="Responsable">
                  <input value={form.responsable ?? ''} onChange={e => f('responsable', e.target.value || null)}
                    placeholder="Nombre del responsable" className={INPUT2} />
                </CField>

                {/* Fila 5 */}
                <CField label="Condiciones de transporte">
                  <select value={form.condicionesTransporte ? 'true' : 'false'}
                    onChange={e => f('condicionesTransporte', e.target.value === 'true')}
                    className={INPUT2}>
                    <option value="true">C — Correcto</option>
                    <option value="false">I — Incorrecto</option>
                  </select>
                </CField>

                <CField label="Mercancía">
                  <select value={form.mercanciaAceptada ? 'true' : 'false'}
                    onChange={e => f('mercanciaAceptada', e.target.value === 'true')}
                    className={INPUT2}>
                    <option value="true">Aceptada</option>
                    <option value="false">Rechazada</option>
                  </select>
                </CField>

                {/* Fila 6 */}
                <CField label="Fecha fin de existencia">
                  <DateInput value={form.fechaFinExistencia ?? ''} onChange={v => f('fechaFinExistencia', v || null)} className="w-full" />
                </CField>

                <CField label="Observaciones" className="col-span-2">
                  <textarea rows={2} value={form.observaciones ?? ''}
                    onChange={e => f('observaciones', e.target.value || null)}
                    className={INPUT2} placeholder="Observaciones adicionales" />
                </CField>
              </div>

              <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100">
                <button type="button" onClick={closeModal}
                  className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50">
                  Cancelar
                </button>
                <button type="submit" disabled={busy}
                  className="flex items-center gap-2 px-4 py-2 text-sm bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50 font-medium">
                  <Save className="w-4 h-4" />
                  {busy ? 'Guardando…' : editing ? 'Guardar cambios' : 'Añadir registro'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

const INPUT2 =
  'w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500'

function CField({ label, children, className = '' }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
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
    queryFn: () => api.get('/productos?soloActivos=true').then(r => r.data.data),
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

// ── TAB: Stock de materias primas ─────────────────────────────────────────────

interface StockMpRow {
  id: number
  producto: string
  ingredienteId: number | null
  unidades: number
  fechaEntrada: string
  fechaCaducidad: string | null
  proveedor: string | null
  lote: string | null
  fechaAperturaLote: string | null
  fechaFinExistencia: string | null
  responsable: string | null
  observaciones: string | null
  estado: 'activo' | 'por_caducar' | 'caducado' | 'agotado'
}

function TabStockMP() {
  const [search, setSearch] = useState('')
  const [filtroEstado, setFiltroEstado] = useState<'todos' | StockMpRow['estado']>('todos')
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set())

  const { data, isLoading } = useQuery({
    queryKey: ['stock-mp'],
    queryFn: async () => {
      const r = await api.get<{ data: StockMpRow[] }>('/control-materias-primas/stock-mp')
      return r.data.data
    },
    refetchInterval: 60_000,
  })

  const estadoStats = useMemo(() => {
    const rows = data ?? []
    return {
      totalProductos: new Set(rows.filter(r => r.estado !== 'agotado').map(r => r.producto)).size,
      activos: rows.filter(r => r.estado === 'activo').length,
      porCaducar: rows.filter(r => r.estado === 'por_caducar').length,
      caducados: rows.filter(r => r.estado === 'caducado').length,
    }
  }, [data])

  const grupos = useMemo(() => {
    const rows = (data ?? []).filter(r => {
      if (filtroEstado !== 'todos' && r.estado !== filtroEstado) return false
      const q = search.toLowerCase()
      if (q && !r.producto.toLowerCase().includes(q)
            && !(r.lote?.toLowerCase().includes(q))
            && !(r.proveedor?.toLowerCase().includes(q))) return false
      return true
    })
    const map = new Map<string, StockMpRow[]>()
    for (const r of rows) {
      if (!map.has(r.producto)) map.set(r.producto, [])
      map.get(r.producto)!.push(r)
    }
    return Array.from(map.entries()).map(([producto, lotes]) => ({
      producto,
      lotes,
      unidadesActivas: lotes.filter(l => l.estado !== 'agotado').reduce((s, l) => s + l.unidades, 0),
      tieneAlerta: lotes.some(l => l.estado === 'caducado' || l.estado === 'por_caducar'),
    })).sort((a, b) => a.producto.localeCompare(b.producto))
  }, [data, search, filtroEstado])

  function toggle(producto: string) {
    setExpandidos(prev => {
      const next = new Set(prev)
      next.has(producto) ? next.delete(producto) : next.add(producto)
      return next
    })
  }

  const estadoBadge = (estado: StockMpRow['estado']) => {
    const cfg: Record<StockMpRow['estado'], { cls: string; label: string }> = {
      activo:      { cls: 'bg-green-100 text-green-700', label: 'Activo' },
      por_caducar: { cls: 'bg-amber-100 text-amber-700', label: 'Por caducar' },
      caducado:    { cls: 'bg-red-100 text-red-700',     label: 'Caducado' },
      agotado:     { cls: 'bg-gray-100 text-gray-500',   label: 'Agotado' },
    }
    const { cls, label } = cfg[estado] ?? { cls: 'bg-gray-100 text-gray-500', label: estado }
    return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${cls}`}>{label}</span>
  }

  const fmt = (d: string | null | undefined) => {
    if (!d) return '—'
    const [y, m, day] = d.split('T')[0].split('-')
    return `${day}/${m}/${y}`
  }

  if (isLoading) return (
    <div className="flex items-center justify-center py-20 text-gray-400">
      <Loader2 className="w-6 h-6 animate-spin mr-2" /> Cargando stock…
    </div>
  )

  return (
    <div className="space-y-4">
      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Productos en almacén',  value: estadoStats.totalProductos, color: 'text-brand-700',  bg: 'bg-brand-50'  },
          { label: 'Lotes activos',          value: estadoStats.activos,         color: 'text-green-700', bg: 'bg-green-50'  },
          { label: 'Por caducar (7 días)',   value: estadoStats.porCaducar,      color: 'text-amber-700', bg: 'bg-amber-50'  },
          { label: 'Lotes caducados',        value: estadoStats.caducados,       color: 'text-red-700',   bg: 'bg-red-50'    },
        ].map(c => (
          <div key={c.label} className={`${c.bg} rounded-xl px-4 py-3 flex flex-col gap-0.5`}>
            <span className="text-xs text-gray-500">{c.label}</span>
            <span className={`text-2xl font-bold ${c.color}`}>{c.value}</span>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar producto, lote, proveedor…"
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500"
          />
        </div>
        <div className="flex gap-1 flex-wrap">
          {(['todos', 'activo', 'por_caducar', 'caducado', 'agotado'] as const).map(e => (
            <button
              key={e}
              onClick={() => setFiltroEstado(e)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                filtroEstado === e
                  ? 'bg-brand-600 text-white border-brand-600'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
              }`}
            >
              {e === 'todos' ? 'Todos' : e === 'activo' ? 'Activos' : e === 'por_caducar' ? 'Por caducar' : e === 'caducado' ? 'Caducados' : 'Agotados'}
            </button>
          ))}
        </div>
      </div>

      {/* Aviso de solo aceptados */}
      <div className="flex gap-2 p-3 bg-blue-50 border border-blue-100 rounded-lg text-xs text-blue-700">
        <Info className="w-4 h-4 shrink-0 mt-0.5" />
        Solo se muestran registros con <b>&nbsp;Mercancía aceptada = Sí</b>. El estado se calcula automáticamente según la fecha de caducidad.
      </div>

      {/* Lista agrupada por producto */}
      {grupos.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <Boxes className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Sin registros para los filtros actuales</p>
        </div>
      ) : (
        <div className="space-y-2">
          {grupos.map(({ producto, lotes, unidadesActivas, tieneAlerta }) => (
            <div key={producto} className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
              {/* Cabecera del grupo — clic para expandir */}
              <button
                onClick={() => toggle(producto)}
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors text-left"
              >
                <div className="flex items-center gap-3">
                  {expandidos.has(producto)
                    ? <ChevronDown className="w-4 h-4 text-gray-400" />
                    : <ChevronRight className="w-4 h-4 text-gray-400" />}
                  <Package className="w-4 h-4 text-brand-500" />
                  <span className="font-semibold text-sm text-gray-900">{producto}</span>
                  {tieneAlerta && (
                    <span title="Tiene lotes próximos a caducar o caducados">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-4 text-xs text-gray-500 shrink-0">
                  <span><b className="text-gray-800">{lotes.length}</b> lote{lotes.length !== 1 ? 's' : ''}</span>
                  <span className="font-bold text-brand-700">{unidadesActivas % 1 === 0 ? unidadesActivas : unidadesActivas.toFixed(2)} uds activas</span>
                </div>
              </button>

              {/* Tabla de lotes expandida */}
              {expandidos.has(producto) && (
                <div className="border-t border-gray-100 overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50">
                      <tr className="text-gray-500 text-left">
                        <th className="px-4 py-2 font-medium">Lote</th>
                        <th className="px-4 py-2 font-medium">F. Entrada</th>
                        <th className="px-4 py-2 font-medium">F. Caducidad</th>
                        <th className="px-4 py-2 font-medium">Proveedor</th>
                        <th className="px-4 py-2 font-medium">Responsable</th>
                        <th className="px-4 py-2 font-medium text-right">Unidades</th>
                        <th className="px-4 py-2 font-medium">Estado</th>
                        <th className="px-4 py-2 font-medium">Fin existencia</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lotes.map(l => (
                        <tr
                          key={l.id}
                          className={`border-t border-gray-100 hover:bg-gray-50 ${
                            l.estado === 'caducado'    ? 'bg-red-50/50' :
                            l.estado === 'por_caducar' ? 'bg-amber-50/40' :
                            l.estado === 'agotado'     ? 'opacity-50' : ''
                          }`}
                        >
                          <td className="px-4 py-2 font-mono font-semibold text-gray-700">{l.lote ?? '—'}</td>
                          <td className="px-4 py-2 text-gray-600">{fmt(l.fechaEntrada)}</td>
                          <td className={`px-4 py-2 font-medium ${
                            l.estado === 'caducado'    ? 'text-red-600' :
                            l.estado === 'por_caducar' ? 'text-amber-600' : 'text-gray-600'
                          }`}>{fmt(l.fechaCaducidad)}</td>
                          <td className="px-4 py-2 text-gray-600">{l.proveedor ?? '—'}</td>
                          <td className="px-4 py-2 text-gray-600">{l.responsable ?? '—'}</td>
                          <td className="px-4 py-2 text-right font-bold text-gray-900">
                            {l.unidades % 1 === 0 ? l.unidades : l.unidades.toFixed(2)}
                          </td>
                          <td className="px-4 py-2">{estadoBadge(l.estado)}</td>
                          <td className="px-4 py-2 text-gray-500 italic">{fmt(l.fechaFinExistencia)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
