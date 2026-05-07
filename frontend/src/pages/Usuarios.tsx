import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../lib/api'
import type { Empresa, Usuario } from '../types'
import {
  Shield, Plus, Pencil, KeyRound, Trash2, Loader2,
  CheckCircle2, XCircle, UserCircle2, Link2, Building2,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { useAuth } from '../store/authStore'

// ── Helpers ───────────────────────────────────────────────────────────────────

type Rol = 'Admin' | 'Obrador' | 'Repartidor'

interface ClienteSimple { id: number; nombre: string; tipo: string }
interface EmpresaRelaciones {
  puedeEliminar: boolean
  totalRelaciones: number
}

const ROL_BADGE: Record<string, string> = {
  Admin:      'bg-purple-100 text-purple-800 border-purple-200',
  Obrador:    'bg-blue-100 text-blue-800 border-blue-200',
  Repartidor: 'bg-green-100 text-green-800 border-green-200',
}

function RolBadge({ rol }: { rol: string }) {
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${ROL_BADGE[rol] ?? 'bg-gray-100 text-gray-700 border-gray-200'}`}>
      {rol}
    </span>
  )
}

import { fmtDateTime as fmtDate } from '../lib/dates'

// ── Main page ─────────────────────────────────────────────────────────────────

export default function Usuarios() {
  const qc = useQueryClient()
  const { user } = useAuth()

  const [showCreate, setShowCreate]       = useState(false)
  const [editUsuario, setEditUsuario]     = useState<Usuario | null>(null)
  const [pwdUsuario, setPwdUsuario]       = useState<Usuario | null>(null)
  const [deleteId, setDeleteId]           = useState<number | null>(null)
  const [showCreateEmpresa, setShowCreateEmpresa] = useState(false)
  const [editEmpresa, setEditEmpresa] = useState<Empresa | null>(null)
  const [deleteEmpresaId, setDeleteEmpresaId] = useState<number | null>(null)

  const { data: usuarios, isLoading } = useQuery<Usuario[]>({
    queryKey: ['usuarios'],
    queryFn: () => api.get('/usuarios').then(r => r.data.data),
  })

  const { data: empresas } = useQuery<Empresa[]>({
    queryKey: ['empresas-admin'],
    queryFn: () => api.get('/empresa/admin/lista').then(r => r.data.data),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/usuarios/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['usuarios'] })
      toast.success('Usuario desactivado')
      setDeleteId(null)
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message ?? 'Error al eliminar')
      setDeleteId(null)
    },
  })

  const deleteEmpresaMutation = useMutation({
    mutationFn: async (id: number) => {
      const rel = await api.get(`/empresa/${id}/relaciones`)
      const data = rel.data.data as EmpresaRelaciones
      if (!data.puedeEliminar) {
        throw new Error(`La empresa tiene ${data.totalRelaciones} registros relacionados`)
      }
      return api.delete(`/empresa/${id}`)
    },
    onSuccess: () => {
      toast.success('Empresa eliminada')
      qc.invalidateQueries({ queryKey: ['empresas-admin'] })
      qc.invalidateQueries({ queryKey: ['usuarios'] })
      setDeleteEmpresaId(null)
    },
    onError: (err: any) => {
      toast.error(err?.message || err.response?.data?.message || 'No se pudo eliminar la empresa')
      setDeleteEmpresaId(null)
    },
  })

  return (
    <div className="page-shell space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Shield className="w-5 h-5 text-purple-600" /> Administración multiempresa
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">Gestiona usuarios, empresas y asignaciones entre ambos</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowCreateEmpresa(true)}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 transition-colors"
          >
            <Building2 className="w-4 h-4" /> Nueva empresa
          </button>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-4 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-700 transition-colors"
          >
            <Plus className="w-4 h-4" /> Nuevo usuario
          </button>
        </div>
      </div>

      <div>
        {isLoading ? (
          <div className="flex justify-center py-14 text-gray-400 gap-2">
            <Loader2 className="w-5 h-5 animate-spin" /> Cargando usuarios…
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            {!usuarios || usuarios.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-gray-400 gap-2">
                <UserCircle2 className="w-10 h-10" />
                <p className="text-sm">No hay usuarios registrados</p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    {['Usuario', 'Empresa', 'Email', 'Rol', 'Estado', 'Último acceso', 'Acciones'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {usuarios.map(u => (
                    <tr key={u.id} className="hover:bg-gray-50/60">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 bg-brand-100 text-brand-700 rounded-full flex items-center justify-center text-xs font-bold shrink-0">
                            {u.nombre.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="font-medium text-gray-900">{u.nombreCompleto || u.nombre}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-700 text-xs whitespace-nowrap">{u.empresaNombre || `Empresa #${u.empresaId}`}</td>
                      <td className="px-4 py-3 text-gray-600">{u.email}</td>
                      <td className="px-4 py-3"><RolBadge rol={u.rol} /></td>
                      <td className="px-4 py-3">
                        {u.activo
                          ? <span className="flex items-center gap-1 text-green-600 text-xs font-medium"><CheckCircle2 className="w-3.5 h-3.5" /> Activo</span>
                          : <span className="flex items-center gap-1 text-red-500 text-xs font-medium"><XCircle className="w-3.5 h-3.5" /> Inactivo</span>}
                      </td>
                      <td className="px-4 py-3 text-gray-500 whitespace-nowrap text-xs">{fmtDate(u.ultimoAcceso)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => setEditUsuario(u)}
                            title="Editar"
                            className="p-1.5 text-gray-400 hover:text-brand-600 hover:bg-brand-50 rounded-lg transition-colors"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setPwdUsuario(u)}
                            title="Cambiar contraseña"
                            className="p-1.5 text-gray-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                          >
                            <KeyRound className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setDeleteId(u.id)}
                            title="Desactivar"
                            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-800">Empresas</h2>
        </div>
        {!empresas || empresas.length === 0 ? (
          <div className="py-8 text-center text-sm text-gray-400">No hay empresas registradas</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {['Empresa', 'NIF', 'Estado', 'Tipo', 'Acciones'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {empresas.map(e => (
                <tr key={e.id} className="hover:bg-gray-50/60">
                  <td className="px-4 py-3 font-medium text-gray-900">{e.nombre}</td>
                  <td className="px-4 py-3 text-gray-600">{e.nif}</td>
                  <td className="px-4 py-3">
                    {e.activa
                      ? <span className="text-xs text-green-700 bg-green-50 border border-green-200 rounded-full px-2 py-0.5">Activa</span>
                      : <span className="text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded-full px-2 py-0.5">Inactiva</span>}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{e.esObrador ? 'Obrador' : 'Distribuidor'}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setEditEmpresa(e)}
                        title="Editar empresa"
                        className="p-1.5 text-gray-400 hover:text-brand-600 hover:bg-brand-50 rounded-lg transition-colors"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setDeleteEmpresaId(e.id)}
                        title="Eliminar empresa"
                        disabled={e.id === user?.empresaId}
                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-40"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Modals */}
      {showCreate && (
        <ModalCrear onClose={() => setShowCreate(false)} onSaved={() => {
          qc.invalidateQueries({ queryKey: ['usuarios'] })
          setShowCreate(false)
        }} empresas={empresas ?? []} currentEmpresaId={user?.empresaId ?? 1} />
      )}
      {editUsuario && (
        <ModalEditar usuario={editUsuario} onClose={() => setEditUsuario(null)} onSaved={() => {
          qc.invalidateQueries({ queryKey: ['usuarios'] })
          setEditUsuario(null)
        }} empresas={empresas ?? []} currentEmpresaId={user?.empresaId ?? 1} />
      )}
      {pwdUsuario && (
        <ModalCambiarPassword usuario={pwdUsuario} onClose={() => setPwdUsuario(null)} />
      )}
      {showCreateEmpresa && (
        <ModalEmpresa
          onClose={() => setShowCreateEmpresa(false)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ['empresas-admin'] })
            setShowCreateEmpresa(false)
          }}
        />
      )}
      {editEmpresa && (
        <ModalEmpresa
          empresa={editEmpresa}
          onClose={() => setEditEmpresa(null)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ['empresas-admin'] })
            setEditEmpresa(null)
          }}
        />
      )}
      {deleteId !== null && (
        <ConfirmDialog
          message="¿Desactivar este usuario? Perderá acceso al sistema."
          onConfirm={() => deleteMutation.mutate(deleteId)}
          onCancel={() => setDeleteId(null)}
          loading={deleteMutation.isPending}
        />
      )}
      {deleteEmpresaId !== null && (
        <ConfirmDialog
          message="¿Eliminar empresa? Solo se eliminará si no tiene datos relacionados."
          onConfirm={() => deleteEmpresaMutation.mutate(deleteEmpresaId)}
          onCancel={() => setDeleteEmpresaId(null)}
          loading={deleteEmpresaMutation.isPending}
          confirmLabel="Eliminar"
        />
      )}
    </div>
  )
}

// ── Modal: Crear usuario ──────────────────────────────────────────────────────

function ModalCrear({
  onClose,
  onSaved,
  empresas,
  currentEmpresaId,
}: {
  onClose: () => void
  onSaved: () => void
  empresas: Empresa[]
  currentEmpresaId: number
}) {
  const [form, setForm] = useState({
    nombre: '', apellidos: '', email: '', telefono: '', rol: 'Obrador' as Rol, password: '', confirm: '',
    clienteId: '' as string, empresaId: String(currentEmpresaId),
  })
  const [loading, setLoading] = useState(false)

  function set(k: string, v: string) { setForm(prev => ({ ...prev, [k]: v })) }

  async function submit() {
    if (!form.nombre.trim() || !form.email.trim() || !form.password) {
      toast.error('Nombre, email y contraseña son obligatorios'); return
    }
    if (form.password !== form.confirm) { toast.error('Las contraseñas no coinciden'); return }
    if (form.password.length < 8) { toast.error('Mínimo 8 caracteres'); return }
    try {
      setLoading(true)
      await api.post('/usuarios', {
        nombre: form.nombre, apellidos: form.apellidos || null,
        email: form.email, telefono: form.telefono || null,
        rol: form.rol, password: form.password,
        clienteId: form.rol === 'Repartidor' && form.clienteId ? Number(form.clienteId) : null,
        empresaId: Number(form.empresaId),
      })
      toast.success('Usuario creado')
      onSaved()
    } catch (err: any) {
      toast.error(err.response?.data?.message ?? 'Error al crear usuario')
    } finally { setLoading(false) }
  }

  return (
    <ModalShell title="Nuevo usuario" onClose={onClose}>
      <FormFields form={form} set={set} showPassword empresas={empresas} currentEmpresaId={currentEmpresaId} />
      <div className="flex justify-end gap-3 mt-6">
        <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 border border-gray-200 rounded-lg">Cancelar</button>
        <button onClick={submit} disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 disabled:opacity-60">
          {loading && <Loader2 className="w-4 h-4 animate-spin" />} Crear usuario
        </button>
      </div>
    </ModalShell>
  )
}

// ── Modal: Editar usuario ─────────────────────────────────────────────────────

function ModalEditar({
  usuario,
  onClose,
  onSaved,
  empresas,
  currentEmpresaId,
}: {
  usuario: Usuario
  onClose: () => void
  onSaved: () => void
  empresas: Empresa[]
  currentEmpresaId: number
}) {
  const [form, setForm] = useState({
    nombre: usuario.nombre, apellidos: usuario.apellidos ?? '', email: usuario.email,
    telefono: usuario.telefono ?? '', rol: usuario.rol as Rol, activo: usuario.activo,
    clienteId: usuario.clienteId ? String(usuario.clienteId) : '', empresaId: String(usuario.empresaId),
  })
  const [loading, setLoading] = useState(false)

  function set(k: string, v: string | boolean) { setForm(prev => ({ ...prev, [k]: v })) }

  async function submit() {
    if (!form.nombre.trim() || !form.email.trim()) { toast.error('Nombre y email obligatorios'); return }
    try {
      setLoading(true)
      await api.put(`/usuarios/${usuario.id}`, {
        nombre: form.nombre, apellidos: form.apellidos || null,
        email: form.email, telefono: form.telefono || null,
        rol: form.rol, activo: form.activo,
        clienteId: form.rol === 'Repartidor' && form.clienteId ? Number(form.clienteId) : null,
        empresaId: Number(form.empresaId),
      })
      toast.success('Usuario actualizado')
      onSaved()
    } catch (err: any) {
      toast.error(err.response?.data?.message ?? 'Error al actualizar')
    } finally { setLoading(false) }
  }

  return (
    <ModalShell title="Editar usuario" onClose={onClose}>
      <FormFields form={form} set={(k, v) => set(k, v)} empresas={empresas} currentEmpresaId={currentEmpresaId} />
      <div className="mt-4">
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input type="checkbox" checked={form.activo} onChange={e => set('activo', e.target.checked)}
            className="rounded border-gray-300 text-brand-600" />
          <span className="text-gray-700">Usuario activo</span>
        </label>
      </div>
      <div className="flex justify-end gap-3 mt-6">
        <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 border border-gray-200 rounded-lg">Cancelar</button>
        <button onClick={submit} disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 disabled:opacity-60">
          {loading && <Loader2 className="w-4 h-4 animate-spin" />} Guardar cambios
        </button>
      </div>
    </ModalShell>
  )
}

// ── Modal: Cambiar contraseña ─────────────────────────────────────────────────

function ModalCambiarPassword({ usuario, onClose }: { usuario: Usuario; onClose: () => void }) {
  const [pwd, setPwd]         = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit() {
    if (pwd.length < 8) { toast.error('Mínimo 8 caracteres'); return }
    if (pwd !== confirm) { toast.error('Las contraseñas no coinciden'); return }
    try {
      setLoading(true)
      await api.put(`/usuarios/${usuario.id}/cambiar-password`, { nuevaPassword: pwd })
      toast.success('Contraseña actualizada')
      onClose()
    } catch (err: any) {
      toast.error(err.response?.data?.message ?? 'Error al cambiar contraseña')
    } finally { setLoading(false) }
  }

  return (
    <ModalShell title={`Cambiar contraseña · ${usuario.nombre}`} onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Nueva contraseña</label>
          <input type="password" value={pwd} onChange={e => setPwd(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/40"
            placeholder="Mínimo 8 caracteres" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Confirmar contraseña</label>
          <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/40"
            placeholder="Repite la contraseña" />
        </div>
      </div>
      <div className="flex justify-end gap-3 mt-6">
        <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg">Cancelar</button>
        <button onClick={submit} disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700 disabled:opacity-60">
          {loading && <Loader2 className="w-4 h-4 animate-spin" />} Cambiar contraseña
        </button>
      </div>
    </ModalShell>
  )
}

// ── Shared: FormFields ────────────────────────────────────────────────────────

function FormFields({
  form,
  set,
  showPassword = false,
  empresas,
  currentEmpresaId,
}: {
  form: Record<string, string | boolean>
  set: (k: string, v: string) => void
  showPassword?: boolean
  empresas: Empresa[]
  currentEmpresaId: number
}) {
  const isRepartidor = String(form.rol) === 'Repartidor'
  const empresaSeleccionada = Number(form.empresaId || currentEmpresaId)

  const { data: clientes } = useQuery<ClienteSimple[]>({
    queryKey: ['clientes-simple', empresaSeleccionada],
    queryFn: () => api.get(`/usuarios/admin/empresas/${empresaSeleccionada}/clientes`).then(r =>
      (r.data.data as any[]).map(c => ({ id: c.id, nombre: c.nombre, tipo: c.tipo }))
    ),
    enabled: isRepartidor,
    staleTime: 60_000,
  })

  const fields: { key: string; label: string; type?: string; required?: boolean; placeholder?: string }[] = [
    { key: 'nombre',    label: 'Nombre',    required: true,  placeholder: 'Nombre' },
    { key: 'apellidos', label: 'Apellidos', placeholder: 'Apellidos (opcional)' },
    { key: 'email',     label: 'Email',     type: 'email', required: true, placeholder: 'email@empresa.com' },
    { key: 'telefono',  label: 'Teléfono',  type: 'tel', placeholder: '+34 600 000 000' },
  ]

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        {fields.map(f => (
          <div key={f.key}>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              {f.label}{f.required && <span className="text-red-500 ml-0.5">*</span>}
            </label>
            <input
              type={f.type ?? 'text'}
              value={String(form[f.key] ?? '')}
              onChange={e => set(f.key, e.target.value)}
              placeholder={f.placeholder}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/40"
            />
          </div>
        ))}
      </div>

      <div className="flex items-end gap-4">
        <div className="flex-1">
          <label className="block text-xs font-medium text-gray-700 mb-1">Empresa</label>
          <select value={String(form.empresaId)} onChange={e => set('empresaId', e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/40">
            {empresas.map(e => (
              <option key={e.id} value={e.id}>{e.nombre}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Rol</label>
          <select value={String(form.rol)} onChange={e => set('rol', e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/40">
            <option value="Obrador">Obrador</option>
            <option value="Repartidor">Repartidor</option>
            <option value="Admin">Admin</option>
          </select>
        </div>

        {isRepartidor && (
          <div className="flex-1">
            <label className="block text-xs font-medium text-gray-700 mb-1">
              <Link2 className="inline w-3 h-3 mr-1" />Cliente vinculado
            </label>
            <select value={String(form.clienteId ?? '')} onChange={e => set('clienteId', e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/40">
              <option value="">— Sin vincular —</option>
              {(clientes ?? []).map(c => (
                <option key={c.id} value={c.id}>{c.nombre} ({c.tipo})</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {showPassword && (
        <div className="grid grid-cols-2 gap-4 pt-2 border-t border-gray-100">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Contraseña<span className="text-red-500 ml-0.5">*</span></label>
            <input type="password" value={String(form.password ?? '')} onChange={e => set('password', e.target.value)}
              placeholder="Mínimo 8 caracteres"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/40" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Confirmar<span className="text-red-500 ml-0.5">*</span></label>
            <input type="password" value={String(form.confirm ?? '')} onChange={e => set('confirm', e.target.value)}
              placeholder="Repite la contraseña"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/40" />
          </div>
        </div>
      )}
    </div>
  )
}

function ModalEmpresa({
  empresa,
  onClose,
  onSaved,
}: {
  empresa?: Empresa
  onClose: () => void
  onSaved: () => void
}) {
  const [form, setForm] = useState({
    nombre: empresa?.nombre ?? '',
    nif: empresa?.nif ?? '',
    activa: empresa?.activa ?? true,
    esObrador: empresa?.esObrador ?? true,
  })
  const [loading, setLoading] = useState(false)

  async function submit() {
    if (!form.nombre.trim() || !form.nif.trim()) {
      toast.error('Nombre y NIF son obligatorios')
      return
    }
    setLoading(true)
    try {
      const payload = {
        nombre: form.nombre,
        nif: form.nif,
        activa: form.activa,
        esObrador: form.esObrador,
      }
      if (empresa?.id) await api.put(`/empresa/admin/${empresa.id}`, payload)
      else await api.post('/empresa/admin', payload)

      toast.success(empresa?.id ? 'Empresa actualizada' : 'Empresa creada')
      onSaved()
    } catch (err: any) {
      toast.error(err.response?.data?.message ?? 'Error al guardar empresa')
    } finally {
      setLoading(false)
    }
  }

  return (
    <ModalShell title={empresa?.id ? 'Editar empresa' : 'Nueva empresa'} onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Nombre</label>
          <input
            value={form.nombre}
            onChange={e => setForm(prev => ({ ...prev, nombre: e.target.value }))}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/40"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">NIF</label>
          <input
            value={form.nif}
            onChange={e => setForm(prev => ({ ...prev, nif: e.target.value }))}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/40"
          />
        </div>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={form.activa}
            onChange={e => setForm(prev => ({ ...prev, activa: e.target.checked }))}
            className="rounded border-gray-300 text-brand-600"
          />
          <span className="text-gray-700">Empresa activa</span>
        </label>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={form.esObrador}
            onChange={e => setForm(prev => ({ ...prev, esObrador: e.target.checked }))}
            className="rounded border-gray-300 text-brand-600"
          />
          <span className="text-gray-700">Es obrador</span>
        </label>
      </div>
      <div className="flex justify-end gap-3 mt-6">
        <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 border border-gray-200 rounded-lg">Cancelar</button>
        <button onClick={submit} disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 disabled:opacity-60">
          {loading && <Loader2 className="w-4 h-4 animate-spin" />} Guardar empresa
        </button>
      </div>
    </ModalShell>
  )
}

// ── Shared: Modal shell ───────────────────────────────────────────────────────

function ModalShell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-lg leading-none">&times;</button>
        </div>
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>
  )
}

// ── Shared: Confirm dialog ────────────────────────────────────────────────────

function ConfirmDialog({
  message, onConfirm, onCancel, loading,
  confirmLabel = 'Desactivar',
}: { message: string; onConfirm: () => void; onCancel: () => void; loading: boolean; confirmLabel?: string }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm mx-4 p-6">
        <p className="text-sm text-gray-700 mb-6">{message}</p>
        <div className="flex justify-end gap-3">
          <button onClick={onCancel} className="px-4 py-2 text-sm border border-gray-200 rounded-lg text-gray-600 hover:text-gray-900">Cancelar</button>
          <button onClick={onConfirm} disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 disabled:opacity-60">
            {loading && <Loader2 className="w-4 h-4 animate-spin" />} {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
