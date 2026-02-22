import { useState, FormEvent } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../store/authStore'
import api from '../lib/api'
import type { Cliente, CreateClienteDto, TipoCliente } from '../types'
import { Plus, Pencil, X, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'

const TIPOS: TipoCliente[] = ['Empresa', 'Autonomo', 'Particular', 'Repartidor']

const TIPO_BADGE: Record<TipoCliente, string> = {
  Empresa: 'bg-blue-50 text-blue-700',
  Autonomo: 'bg-purple-50 text-purple-700',
  Particular: 'bg-gray-100 text-gray-600',
  Repartidor: 'bg-brand-50 text-brand-700',
}

const EMPTY: CreateClienteDto = {
  empresaId: 0,
  nombre: '',
  nif: '',
  tipo: 'Empresa',
  email: '',
  telefono: '',
  direccion: '',
}

export default function Clientes() {
  const { user } = useAuth()
  const qc = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Cliente | null>(null)
  const [form, setForm] = useState<CreateClienteDto>({ ...EMPTY, empresaId: user!.empresaId })

  const { data: clientes, isLoading } = useQuery({
    queryKey: ['clientes', user?.empresaId],
    queryFn: async () => {
      const res = await api.get<{ data: Cliente[] }>('/clientes')
      return res.data.data
    },
  })

  const createMutation = useMutation({
    mutationFn: (dto: CreateClienteDto) => api.post('/clientes', dto),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['clientes'] }); toast.success('Cliente creado'); closeForm() },
    onError: () => toast.error('Error al crear cliente'),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, dto }: { id: number; dto: Partial<CreateClienteDto> }) =>
      api.put(`/clientes/${id}`, dto),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['clientes'] }); toast.success('Cliente actualizado'); closeForm() },
    onError: () => toast.error('Error al actualizar cliente'),
  })

  function openNew() { setForm({ ...EMPTY, empresaId: user!.empresaId }); setEditing(null); setShowForm(true) }

  function openEdit(c: Cliente) {
    setForm({
      empresaId: c.empresaId, nombre: c.nombre, nif: c.nif ?? '', tipo: c.tipo,
      email: c.email ?? '', telefono: c.telefono ?? '', direccion: c.direccion ?? '',
    })
    setEditing(c); setShowForm(true)
  }

  function closeForm() { setShowForm(false); setEditing(null) }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (editing) updateMutation.mutate({ id: editing.id, dto: form })
    else createMutation.mutate(form)
  }

  const busy = createMutation.isPending || updateMutation.isPending

  const f = (key: keyof CreateClienteDto, val: string) => setForm((prev) => ({ ...prev, [key]: val }))

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Clientes</h1>
          <p className="text-gray-500 text-sm mt-0.5">Empresas, autónomos, particulares y repartidores</p>
        </div>
        <button onClick={openNew} className="flex items-center gap-2 bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors">
          <Plus className="w-4 h-4" />Nuevo cliente
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wider">
                <th className="px-5 py-3 text-left">Nombre</th>
                <th className="px-5 py-3 text-left">NIF</th>
                <th className="px-5 py-3 text-left">Tipo</th>
                <th className="px-5 py-3 text-left">Email</th>
                <th className="px-5 py-3 text-left">Teléfono</th>
                <th className="px-5 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {isLoading ? (
                <tr><td colSpan={6} className="px-5 py-8 text-center text-gray-400"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></td></tr>
              ) : !clientes?.length ? (
                <tr><td colSpan={6} className="px-5 py-8 text-center text-gray-400">No hay clientes. Crea el primero.</td></tr>
              ) : clientes.map((c) => (
                <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-3 font-medium text-gray-900">{c.nombre}</td>
                  <td className="px-5 py-3 text-gray-500 font-mono text-xs">{c.nif ?? '—'}</td>
                  <td className="px-5 py-3">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${TIPO_BADGE[c.tipo]}`}>{c.tipo}</span>
                  </td>
                  <td className="px-5 py-3 text-gray-500">{c.email ?? '—'}</td>
                  <td className="px-5 py-3 text-gray-500">{c.telefono ?? '—'}</td>
                  <td className="px-5 py-3 text-right">
                    <button onClick={() => openEdit(c)} className="text-gray-400 hover:text-brand-600 transition-colors" title="Editar">
                      <Pencil className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="font-semibold text-gray-900">{editing ? 'Editar cliente' : 'Nuevo cliente'}</h2>
              <button onClick={closeForm} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-700 mb-1">Nombre *</label>
                  <input value={form.nombre} onChange={(e) => f('nombre', e.target.value)} required className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">NIF / CIF</label>
                  <input value={form.nif ?? ''} onChange={(e) => f('nif', e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Tipo</label>
                  <select value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value as TipoCliente })} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
                    {TIPOS.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Email</label>
                  <input type="email" value={form.email ?? ''} onChange={(e) => f('email', e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Teléfono</label>
                  <input value={form.telefono ?? ''} onChange={(e) => f('telefono', e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-700 mb-1">Dirección</label>
                  <input value={form.direccion ?? ''} onChange={(e) => f('direccion', e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={closeForm} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 border border-gray-200 rounded-lg transition-colors">Cancelar</button>
                <button type="submit" disabled={busy} className="flex items-center gap-2 bg-brand-500 hover:bg-brand-600 disabled:opacity-60 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors">
                  {busy && <Loader2 className="w-4 h-4 animate-spin" />}
                  {editing ? 'Guardar' : 'Crear cliente'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
