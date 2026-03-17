import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../lib/api'
import type { Usuario } from '../types'
import {
  Shield, Plus, Pencil, KeyRound, Trash2, Loader2,
  CheckCircle2, XCircle, UserCircle2, Link2,
} from 'lucide-react'
import toast from 'react-hot-toast'

// ── Helpers ───────────────────────────────────────────────────────────────────

type Rol = 'Admin' | 'Obrador' | 'Repartidor'

interface ClienteSimple { id: number; nombre: string; tipo: string }

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

  const [showCreate, setShowCreate]       = useState(false)
  const [editUsuario, setEditUsuario]     = useState<Usuario | null>(null)
  const [pwdUsuario, setPwdUsuario]       = useState<Usuario | null>(null)
  const [deleteId, setDeleteId]           = useState<number | null>(null)

  const { data: usuarios, isLoading } = useQuery<Usuario[]>({
    queryKey: ['usuarios'],
    queryFn: () => api.get('/usuarios').then(r => r.data.data),
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

  return (
    <div className="flex flex-col flex-1 overflow-y-auto bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Shield className="w-5 h-5 text-purple-600" /> Gestión de usuarios
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">Administra los usuarios y sus roles de acceso</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-700 transition-colors"
        >
          <Plus className="w-4 h-4" /> Nuevo usuario
        </button>
      </div>

      <div className="p-6">
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
                    {['Usuario', 'Email', 'Rol', 'Estado', 'Último acceso', 'Acciones'].map(h => (
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

      {/* Modals */}
      {showCreate && (
        <ModalCrear onClose={() => setShowCreate(false)} onSaved={() => {
          qc.invalidateQueries({ queryKey: ['usuarios'] })
          setShowCreate(false)
        }} />
      )}
      {editUsuario && (
        <ModalEditar usuario={editUsuario} onClose={() => setEditUsuario(null)} onSaved={() => {
          qc.invalidateQueries({ queryKey: ['usuarios'] })
          setEditUsuario(null)
        }} />
      )}
      {pwdUsuario && (
        <ModalCambiarPassword usuario={pwdUsuario} onClose={() => setPwdUsuario(null)} />
      )}
      {deleteId !== null && (
        <ConfirmDialog
          message="¿Desactivar este usuario? Perderá acceso al sistema."
          onConfirm={() => deleteMutation.mutate(deleteId)}
          onCancel={() => setDeleteId(null)}
          loading={deleteMutation.isPending}
        />
      )}
    </div>
  )
}

// ── Modal: Crear usuario ──────────────────────────────────────────────────────

function ModalCrear({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    nombre: '', apellidos: '', email: '', telefono: '', rol: 'Obrador' as Rol, password: '', confirm: '',
    clienteId: '' as string,
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
      })
      toast.success('Usuario creado')
      onSaved()
    } catch (err: any) {
      toast.error(err.response?.data?.message ?? 'Error al crear usuario')
    } finally { setLoading(false) }
  }

  return (
    <ModalShell title="Nuevo usuario" onClose={onClose}>
      <FormFields form={form} set={set} showPassword />
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

function ModalEditar({ usuario, onClose, onSaved }: { usuario: Usuario; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    nombre: usuario.nombre, apellidos: usuario.apellidos ?? '', email: usuario.email,
    telefono: usuario.telefono ?? '', rol: usuario.rol as Rol, activo: usuario.activo,
    clienteId: usuario.clienteId ? String(usuario.clienteId) : '',
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
      })
      toast.success('Usuario actualizado')
      onSaved()
    } catch (err: any) {
      toast.error(err.response?.data?.message ?? 'Error al actualizar')
    } finally { setLoading(false) }
  }

  return (
    <ModalShell title="Editar usuario" onClose={onClose}>
      <FormFields form={form} set={(k, v) => set(k, v)} />
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
}: {
  form: Record<string, string | boolean>
  set: (k: string, v: string) => void
  showPassword?: boolean
}) {
  const isRepartidor = String(form.rol) === 'Repartidor'

  const { data: clientes } = useQuery<ClienteSimple[]>({
    queryKey: ['clientes-simple'],
    queryFn: () => api.get('/clientes?soloActivos=true').then(r =>
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
}: { message: string; onConfirm: () => void; onCancel: () => void; loading: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm mx-4 p-6">
        <p className="text-sm text-gray-700 mb-6">{message}</p>
        <div className="flex justify-end gap-3">
          <button onClick={onCancel} className="px-4 py-2 text-sm border border-gray-200 rounded-lg text-gray-600 hover:text-gray-900">Cancelar</button>
          <button onClick={onConfirm} disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 disabled:opacity-60">
            {loading && <Loader2 className="w-4 h-4 animate-spin" />} Desactivar
          </button>
        </div>
      </div>
    </div>
  )
}
