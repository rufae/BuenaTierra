import { useState, FormEvent } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Plus, Pencil, Check, X, Loader2, BookOpen } from 'lucide-react'
import api from '../lib/api'
import type { SerieFacturacion } from '../types'

// ── form state ─────────────────────────────────────────────────────────────────
interface SerieForm {
  codigo: string
  descripcion: string
  prefijo: string
  activa: boolean
}

const EMPTY_FORM: SerieForm = { codigo: '', descripcion: '', prefijo: '', activa: true }

function toForm(s: SerieFacturacion): SerieForm {
  return {
    codigo:      s.codigo,
    descripcion: s.descripcion ?? '',
    prefijo:     s.prefijo     ?? '',
    activa:      s.activa,
  }
}

// ── ModalSerie ─────────────────────────────────────────────────────────────────
function ModalSerie({
  title,
  form,
  setForm,
  onSubmit,
  onClose,
  saving,
}: {
  title: string
  form: SerieForm
  setForm: React.Dispatch<React.SetStateAction<SerieForm>>
  onSubmit: (e: FormEvent) => void
  onClose: () => void
  saving: boolean
}) {
  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>
        <form onSubmit={onSubmit} className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Código *</label>
            <input
              value={form.codigo}
              onChange={e => setForm(p => ({ ...p, codigo: e.target.value.toUpperCase() }))}
              required maxLength={10} placeholder="Ej.: FAC, ALB…"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono uppercase focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Descripción</label>
            <input
              value={form.descripcion}
              onChange={e => setForm(p => ({ ...p, descripcion: e.target.value }))}
              placeholder="Facturas generales…"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Prefijo</label>
            <input
              value={form.prefijo}
              onChange={e => setForm(p => ({ ...p, prefijo: e.target.value }))}
              placeholder="Ej.: F-, A-…"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.activa}
              onChange={e => setForm(p => ({ ...p, activa: e.target.checked }))}
              className="w-4 h-4 rounded text-brand-500 focus:ring-brand-500"
            />
            <span className="text-sm text-gray-700">Serie activa</span>
          </label>
          <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
            <button type="button" onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
              Cancelar
            </button>
            <button type="submit" disabled={saving}
              className="flex items-center gap-2 bg-brand-500 hover:bg-brand-600 disabled:opacity-60 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              Guardar
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── page ───────────────────────────────────────────────────────────────────────
export default function SeriesFacturacion() {
  const qc = useQueryClient()

  const { data: series = [], isLoading } = useQuery<SerieFacturacion[]>({
    queryKey: ['series-todas'],
    queryFn: async () => (await api.get<{ data: SerieFacturacion[] }>('/series/todas')).data.data,
  })

  // modals
  const [showNew,  setShowNew]  = useState(false)
  const [editSerie, setEditSerie] = useState<SerieFacturacion | null>(null)
  const [newForm,  setNewForm]  = useState<SerieForm>({ ...EMPTY_FORM })
  const [editForm, setEditForm] = useState<SerieForm>({ ...EMPTY_FORM })

  // create
  const createMutation = useMutation({
    mutationFn: (data: Partial<SerieFacturacion>) =>
      api.post<{ data: SerieFacturacion }>('/series', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['series-todas'] })
      qc.invalidateQueries({ queryKey: ['series'] })
      toast.success('Serie creada')
      setShowNew(false)
      setNewForm({ ...EMPTY_FORM })
    },
    onError: () => toast.error('Error al crear la serie'),
  })

  // update
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<SerieFacturacion> }) =>
      api.put<{ data: SerieFacturacion }>(`/series/${id}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['series-todas'] })
      qc.invalidateQueries({ queryKey: ['series'] })
      toast.success('Serie actualizada')
      setEditSerie(null)
    },
    onError: () => toast.error('Error al actualizar la serie'),
  })

  // deactivate
  const deactivateMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/series/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['series-todas'] })
      qc.invalidateQueries({ queryKey: ['series'] })
      toast.success('Serie desactivada')
    },
    onError: () => toast.error('Error al desactivar la serie'),
  })

  function handleNew(e: FormEvent) {
    e.preventDefault()
    createMutation.mutate({
      codigo:      newForm.codigo,
      descripcion: newForm.descripcion || undefined,
      prefijo:     newForm.prefijo     || undefined,
      activa:      newForm.activa,
    } as SerieFacturacion)
  }

  function handleEdit(e: FormEvent) {
    e.preventDefault()
    if (!editSerie) return
    updateMutation.mutate({
      id: editSerie.id,
      data: {
        id:          editSerie.id,
        codigo:      editForm.codigo,
        descripcion: editForm.descripcion || null,
        prefijo:     editForm.prefijo     || null,
        activa:      editForm.activa,
      } as SerieFacturacion,
    })
  }

  function openEdit(s: SerieFacturacion) {
    setEditSerie(s)
    setEditForm(toForm(s))
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <BookOpen className="w-6 h-6 text-brand-600" />
            Series de facturación
          </h1>
          <p className="text-gray-500 text-sm mt-0.5">Gestión de series para facturas y albaranes</p>
        </div>
        <button
          onClick={() => { setNewForm({ ...EMPTY_FORM }); setShowNew(true) }}
          className="flex items-center gap-2 bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" />Nueva serie
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 text-brand-500 animate-spin" />
          </div>
        ) : !series.length ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400">
            <BookOpen className="w-10 h-10 mb-3 opacity-40" />
            <p className="text-sm">No hay series definidas</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wider border-b border-gray-100">
                <th className="px-4 py-3 text-left">Código</th>
                <th className="px-4 py-3 text-left">Descripción</th>
                <th className="px-4 py-3 text-left">Prefijo</th>
                <th className="px-4 py-3 text-center">Estado</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {series.map(s => (
                <tr key={s.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono font-semibold text-brand-700">{s.codigo}</td>
                  <td className="px-4 py-3 text-gray-700">{s.descripcion ?? <span className="text-gray-400">—</span>}</td>
                  <td className="px-4 py-3 font-mono text-gray-500">{s.prefijo ?? <span className="text-gray-400">—</span>}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                      s.activa ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                    }`}>
                      {s.activa ? 'Activa' : 'Inactiva'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => openEdit(s)}
                        className="text-gray-400 hover:text-brand-600 transition-colors"
                        title="Editar"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      {s.activa && (
                        <button
                          onClick={() => {
                            if (confirm(`¿Desactivar la serie "${s.codigo}"?`))
                              deactivateMutation.mutate(s.id)
                          }}
                          className="text-gray-400 hover:text-red-500 transition-colors"
                          title="Desactivar"
                          disabled={deactivateMutation.isPending}
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* New modal */}
      {showNew && (
        <ModalSerie
          title="Nueva serie"
          form={newForm}
          setForm={setNewForm}
          onSubmit={handleNew}
          onClose={() => setShowNew(false)}
          saving={createMutation.isPending}
        />
      )}

      {/* Edit modal */}
      {editSerie && (
        <ModalSerie
          title={`Editar serie: ${editSerie.codigo}`}
          form={editForm}
          setForm={setEditForm}
          onSubmit={handleEdit}
          onClose={() => setEditSerie(null)}
          saving={updateMutation.isPending}
        />
      )}
    </div>
  )
}
