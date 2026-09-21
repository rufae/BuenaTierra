import { useState, FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../store/authStore'
import { Loader2, Eye, EyeOff, KeyRound, LogOut } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../lib/api'

export default function CambiarContrasena() {
  const { user, updateUser, logout } = useAuth()
  const navigate = useNavigate()
  const [nueva, setNueva] = useState('')
  const [confirmar, setConfirmar] = useState('')
  const [show, setShow] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (nueva !== confirmar) {
      toast.error('Las contraseñas no coinciden')
      return
    }
    if (nueva.length < 8) {
      toast.error('La contraseña debe tener al menos 8 caracteres')
      return
    }
    setLoading(true)
    try {
      await api.post('/auth/establecer-password', { nuevaPassword: nueva })
      updateUser({ debeCambiarPassword: false })
      toast.success('Contraseña establecida correctamente')
      navigate('/', { replace: true })
    } catch (err: any) {
      const msg = err?.response?.data?.errors?.[0] ?? err?.response?.data?.message ?? 'No se pudo cambiar la contraseña'
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 bg-slate-50">
      <div className="w-full max-w-md bg-white rounded-2xl border border-gray-200 shadow-sm p-8">
        <div className="flex flex-col items-center text-center mb-6">
          <div className="w-14 h-14 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mb-4">
            <KeyRound className="w-7 h-7" />
          </div>
          <h1 className="text-xl font-bold text-gray-900">Establece una nueva contraseña</h1>
          <p className="mt-2 text-sm text-gray-500">
            Por seguridad, debes cambiar la contraseña inicial antes de continuar.
            {user?.email ? <span className="block mt-1 text-gray-400">{user.email}</span> : null}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-gray-600">Nueva contraseña</label>
            <div className="relative">
              <input
                type={show ? 'text' : 'password'}
                value={nueva}
                onChange={(e) => setNueva(e.target.value)}
                required
                autoFocus
                minLength={8}
                placeholder="Mínimo 8 caracteres, con letra y número"
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 pr-10 text-sm outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
              />
              <button
                type="button"
                onClick={() => setShow((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                aria-label="Mostrar u ocultar contraseña"
              >
                {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-gray-600">Confirmar contraseña</label>
            <input
              type={show ? 'text' : 'password'}
              value={confirmar}
              onChange={(e) => setConfirmar(e.target.value)}
              required
              minLength={8}
              placeholder="Repite la nueva contraseña"
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white font-semibold text-sm py-2.5 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Guardar contraseña'}
          </button>
        </form>

        <button
          type="button"
          onClick={() => { logout(); navigate('/login', { replace: true }) }}
          className="mt-4 w-full flex items-center justify-center gap-2 text-sm text-gray-500 hover:text-gray-700 py-2"
        >
          <LogOut className="w-4 h-4" />
          Cerrar sesión
        </button>
      </div>
    </div>
  )
}
