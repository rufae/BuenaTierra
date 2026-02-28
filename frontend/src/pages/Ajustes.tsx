import { useState, useEffect, FormEvent } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { User, Lock, Loader2, Eye, EyeOff, Phone, Mail, Shield, Building2, CheckCircle2, KeyRound } from 'lucide-react'
import api from '../lib/api'
import { useAuth } from '../store/authStore'

// ── types ──────────────────────────────────────────────────────────────────────
interface UpdateMeRequest { nombre: string; apellidos: string; telefono: string; email: string }
interface CambiarPasswordRequest { passwordActual: string; nuevaPassword: string }
interface MeData { id: number; nombre: string; apellidos: string; email: string; telefono: string | null; rol: string }

type Tab = 'perfil' | 'password'

const ROL_CONFIG: Record<string, { label: string; color: string }> = {
  Admin:              { label: 'Administrador', color: 'bg-purple-100 text-purple-700 border-purple-200' },
  UsuarioObrador:     { label: 'Obrador',       color: 'bg-brand-100 text-brand-700 border-brand-200'   },
  UsuarioRepartidor:  { label: 'Repartidor',    color: 'bg-blue-100 text-blue-700 border-blue-200'      },
}

// ── helpers ────────────────────────────────────────────────────────────────────
function Field({ label, value, onChange, type = 'text', icon }: {
  label: string; value: string; onChange: (v: string) => void; type?: string; icon?: React.ReactNode
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-600 mb-1.5">{label}</label>
      <div className="relative">
        {icon && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">{icon}</span>}
        <input
          type={type}
          value={value}
          onChange={e => onChange(e.target.value)}
          className={`w-full border border-gray-200 rounded-xl py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-400/50 focus:border-brand-400 transition-colors ${icon ? 'pl-9 pr-3' : 'px-3'}`}
        />
      </div>
    </div>
  )
}

function pwStrength(pw: string): { score: number; label: string; color: string } {
  let score = 0
  if (pw.length >= 8)  score++
  if (pw.length >= 12) score++
  if (/[A-Z]/.test(pw)) score++
  if (/[0-9]/.test(pw)) score++
  if (/[^A-Za-z0-9]/.test(pw)) score++
  if (score <= 1) return { score, label: 'Muy débil',  color: 'bg-red-400' }
  if (score === 2) return { score, label: 'Débil',      color: 'bg-orange-400' }
  if (score === 3) return { score, label: 'Aceptable',  color: 'bg-yellow-400' }
  if (score === 4) return { score, label: 'Fuerte',     color: 'bg-emerald-400' }
  return               { score, label: 'Muy fuerte',  color: 'bg-emerald-600' }
}

// ── component ─────────────────────────────────────────────────────────────────
export default function Ajustes() {
  const { user, updateUser } = useAuth()
  const [tab, setTab] = useState<Tab>('perfil')

  const initials = [user?.nombre, user?.apellidos]
    .filter(Boolean).map(s => s![0].toUpperCase()).join('')

  const rolConfig = ROL_CONFIG[user?.rol ?? ''] ?? { label: user?.rol ?? '', color: 'bg-gray-100 text-gray-600 border-gray-200' }

  // ── GET /me para obtener teléfono (no está en el token) ───────────────────
  const { data: meData } = useQuery<MeData>({
    queryKey: ['me', user?.usuarioId],
    enabled: !!user,
    queryFn: async () => (await api.get('/usuarios/me')).data.data,
  })

  // ── Perfil form ────────────────────────────────────────────────────────────
  const [perfil, setPerfil] = useState({
    nombre:    user?.nombre    ?? '',
    apellidos: user?.apellidos ?? '',
    telefono:  '',
    email:     user?.email     ?? '',
  })

  useEffect(() => {
    if (meData) {
      setPerfil(p => ({
        ...p,
        nombre:    meData.nombre    || p.nombre,
        apellidos: meData.apellidos || p.apellidos,
        email:     meData.email     || p.email,
        telefono:  meData.telefono  ?? '',
      }))
    }
  }, [meData?.id])

  const perfilMutation = useMutation({
    mutationFn: (data: UpdateMeRequest) =>
      api.put<{ data: MeData; message: string }>('/usuarios/me', data),
    onSuccess: (res, vars) => {
      toast.success(res.data.message ?? 'Perfil actualizado')
      updateUser({ nombre: vars.nombre, apellidos: vars.apellidos, email: vars.email })
    },
    onError: () => toast.error('Error al actualizar el perfil'),
  })

  function handlePerfilSubmit(e: FormEvent) {
    e.preventDefault()
    if (!perfil.nombre.trim()) { toast.error('El nombre es obligatorio'); return }
    perfilMutation.mutate(perfil)
  }

  // ── Password form ──────────────────────────────────────────────────────────
  const [pwForm, setPwForm] = useState({ passwordActual: '', nuevaPassword: '', confirmar: '' })
  const [showActual, setShowActual] = useState(false)
  const [showNueva,  setShowNueva]  = useState(false)

  const strength = pwStrength(pwForm.nuevaPassword)
  const pwMatch  = pwForm.confirmar && pwForm.confirmar === pwForm.nuevaPassword

  const pwMutation = useMutation({
    mutationFn: (data: CambiarPasswordRequest) =>
      api.put<{ data: string; message: string }>('/usuarios/me/cambiar-password', data),
    onSuccess: res => {
      toast.success(res.data.message ?? 'Contraseña actualizada')
      setPwForm({ passwordActual: '', nuevaPassword: '', confirmar: '' })
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Error al cambiar la contraseña'
      toast.error(msg)
    },
  })

  function handlePwSubmit(e: FormEvent) {
    e.preventDefault()
    if (pwForm.nuevaPassword !== pwForm.confirmar) { toast.error('Las contraseñas nuevas no coinciden'); return }
    if (pwForm.nuevaPassword.length < 8)           { toast.error('Mínimo 8 caracteres'); return }
    pwMutation.mutate({ passwordActual: pwForm.passwordActual, nuevaPassword: pwForm.nuevaPassword })
  }

  // ── render ─────────────────────────────────────────────────────────────────
  return (
    <div className="p-6 max-w-2xl mx-auto space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Ajustes de cuenta</h1>
        <p className="text-gray-500 text-sm mt-0.5">Actualiza tu información personal y seguridad</p>
      </div>

      {/* Tarjeta de perfil ─────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {/* Banda de color superior */}
        <div className="h-16 bg-brand-gradient" />
        <div className="px-6 pb-5 -mt-8">
          {/* Avatar */}
          <div className="flex items-end justify-between mb-3">
            <div className="w-16 h-16 rounded-2xl bg-white border-4 border-white shadow-md flex items-center justify-center text-xl font-bold text-brand-700 bg-brand-50 shrink-0">
              {initials || <User className="w-7 h-7 text-brand-400" />}
            </div>
            <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${rolConfig.color}`}>
              {rolConfig.label}
            </span>
          </div>

          {/* Nombre + chips de info */}
          <h2 className="text-lg font-bold text-gray-900 leading-tight">
            {[user?.nombre, user?.apellidos].filter(Boolean).join(' ') || '—'}
          </h2>

          <div className="flex flex-wrap gap-3 mt-3">
            <span className="flex items-center gap-1.5 text-xs text-gray-500">
              <Mail className="w-3.5 h-3.5 text-brand-400" />
              {user?.email ?? '—'}
            </span>
            {meData?.telefono && (
              <span className="flex items-center gap-1.5 text-xs text-gray-500">
                <Phone className="w-3.5 h-3.5 text-brand-400" />
                {meData.telefono}
              </span>
            )}
            <span className="flex items-center gap-1.5 text-xs text-gray-500">
              <Building2 className="w-3.5 h-3.5 text-brand-400" />
              Empresa #{user?.empresaId}
            </span>
            <span className="flex items-center gap-1.5 text-xs text-gray-500">
              <Shield className="w-3.5 h-3.5 text-brand-400" />
              ID #{user?.usuarioId}
            </span>
          </div>
        </div>
      </div>

      {/* Tabs + formularios ─────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {/* Tabs */}
        <div className="flex gap-1 px-5 pt-4 border-b border-gray-100 mb-[-1px]">
          {([
            { id: 'perfil'   as Tab, icon: <User   className="w-4 h-4" />, label: 'Mi perfil'  },
            { id: 'password' as Tab, icon: <KeyRound className="w-4 h-4" />, label: 'Contraseña' },
          ]).map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm rounded-t-lg font-medium transition-colors ${
                tab === t.id
                  ? 'bg-brand-50 text-brand-700 border-b-2 border-brand-500'
                  : 'text-gray-500 hover:text-gray-700 border-b-2 border-transparent'
              }`}
            >
              {t.icon}{t.label}
            </button>
          ))}
        </div>

        {/* ── Perfil panel ── */}
        {tab === 'perfil' && (
          <form onSubmit={handlePerfilSubmit} className="p-6 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Nombre *"   value={perfil.nombre}    onChange={v => setPerfil(p => ({ ...p, nombre: v }))}    icon={<User className="w-3.5 h-3.5" />} />
              <Field label="Apellidos"  value={perfil.apellidos} onChange={v => setPerfil(p => ({ ...p, apellidos: v }))} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Teléfono"   value={perfil.telefono}  onChange={v => setPerfil(p => ({ ...p, telefono: v }))}  type="tel"   icon={<Phone className="w-3.5 h-3.5" />} />
              <Field label="Email"      value={perfil.email}     onChange={v => setPerfil(p => ({ ...p, email: v }))}     type="email" icon={<Mail  className="w-3.5 h-3.5" />} />
            </div>
            <p className="text-xs text-gray-400 flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-brand-400 shrink-0" />
              Los cambios se aplicarán inmediatamente en toda la aplicación
            </p>
            <div className="flex justify-end pt-1">
              <button
                type="submit"
                disabled={perfilMutation.isPending}
                className="flex items-center gap-2 bg-brand-500 hover:bg-brand-600 disabled:opacity-60 text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition-colors"
              >
                {perfilMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                Guardar cambios
              </button>
            </div>
          </form>
        )}

        {/* ── Contraseña panel ── */}
        {tab === 'password' && (
          <form onSubmit={handlePwSubmit} className="p-6 space-y-4">
            {/* Actual */}
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">Contraseña actual *</label>
              <div className="relative">
                <input
                  type={showActual ? 'text' : 'password'}
                  value={pwForm.passwordActual}
                  onChange={e => setPwForm(p => ({ ...p, passwordActual: e.target.value }))}
                  required
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400/50 focus:border-brand-400 transition-colors"
                />
                <button type="button" onClick={() => setShowActual(s => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  {showActual ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Nueva */}
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                Nueva contraseña * <span className="text-gray-400 font-normal">(mín. 8 caracteres)</span>
              </label>
              <div className="relative">
                <input
                  type={showNueva ? 'text' : 'password'}
                  value={pwForm.nuevaPassword}
                  onChange={e => setPwForm(p => ({ ...p, nuevaPassword: e.target.value }))}
                  required
                  minLength={8}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400/50 focus:border-brand-400 transition-colors"
                />
                <button type="button" onClick={() => setShowNueva(s => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  {showNueva ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {/* Barra de fortaleza */}
              {pwForm.nuevaPassword.length > 0 && (
                <div className="mt-2 space-y-1">
                  <div className="flex gap-1">
                    {[1,2,3,4,5].map(i => (
                      <div key={i} className={`h-1 flex-1 rounded-full transition-all ${i <= strength.score ? strength.color : 'bg-gray-200'}`} />
                    ))}
                  </div>
                  <p className="text-xs text-gray-500">{strength.label}</p>
                </div>
              )}
            </div>

            {/* Confirmar */}
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">Confirmar nueva contraseña *</label>
              <div className="relative">
                <input
                  type="password"
                  value={pwForm.confirmar}
                  onChange={e => setPwForm(p => ({ ...p, confirmar: e.target.value }))}
                  required
                  className={`w-full border rounded-xl px-3 py-2.5 pr-10 text-sm focus:outline-none focus:ring-2 transition-colors ${
                    pwForm.confirmar
                      ? pwMatch
                        ? 'border-emerald-400 focus:ring-emerald-400/50'
                        : 'border-red-400 bg-red-50 focus:ring-red-400/50'
                      : 'border-gray-200 focus:ring-brand-400/50 focus:border-brand-400'
                  }`}
                />
                {pwForm.confirmar && (
                  <span className="absolute right-3 top-1/2 -translate-y-1/2">
                    {pwMatch
                      ? <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                      : <EyeOff className="w-4 h-4 text-red-400" />
                    }
                  </span>
                )}
              </div>
              {pwForm.confirmar && !pwMatch && (
                <p className="text-xs text-red-500 mt-1">Las contraseñas no coinciden</p>
              )}
            </div>

            <div className="flex justify-end pt-1">
              <button
                type="submit"
                disabled={pwMutation.isPending}
                className="flex items-center gap-2 bg-brand-500 hover:bg-brand-600 disabled:opacity-60 text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition-colors"
              >
                {pwMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                Cambiar contraseña
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

