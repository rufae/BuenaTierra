import { useState, FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../store/authStore'
import { Loader2, Eye, EyeOff, ArrowRight, ShieldCheck, Layers, BarChart3, LayoutGrid } from 'lucide-react'
import toast from 'react-hot-toast'

const FEATURES = [
  { icon: ShieldCheck, label: 'Trazabilidad legal' },
  { icon: Layers,      label: 'Gestión de lotes' },
  { icon: BarChart3,   label: 'Facturación ágil' },
]

export default function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [email,        setEmail]        = useState('')
  const [password,     setPassword]     = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading,      setLoading]      = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      await login(email, password)
      navigate('/dashboard', { replace: true })
    } catch (err: any) {
      const backendMsg = err?.response?.data?.errors?.[0]
      toast.error(backendMsg || 'Credenciales incorrectas')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 relative overflow-hidden"
         style={{ background: 'linear-gradient(145deg, #f0f6ff 0%, #e8f0fb 35%, #edf4ff 65%, #f5f8ff 100%)' }}>

      <div className="animate-blob delay-0s pointer-events-none absolute -top-40 -left-32 w-[650px] h-[650px] rounded-full opacity-30"
           style={{ background: 'radial-gradient(circle, #3b82f6 0%, transparent 70%)', filter: 'blur(90px)' }} />
      <div className="animate-blob delay-2s pointer-events-none absolute -bottom-48 -right-40 w-[600px] h-[600px] rounded-full opacity-25"
           style={{ background: 'radial-gradient(circle, #6366f1 0%, transparent 70%)', filter: 'blur(100px)' }} />
      <div className="animate-blob delay-4s pointer-events-none absolute top-1/2 -translate-y-1/2 right-0 w-[450px] h-[450px] rounded-full opacity-20"
           style={{ background: 'radial-gradient(circle, #1d4ed8 0%, transparent 70%)', filter: 'blur(80px)' }} />
      <div className="animate-blob delay-3s pointer-events-none absolute bottom-10 left-1/4 w-[350px] h-[350px] rounded-full opacity-15"
           style={{ background: 'radial-gradient(circle, #60a5fa 0%, transparent 70%)', filter: 'blur(70px)' }} />

      <div className="pointer-events-none absolute inset-0 opacity-[0.03]"
           style={{ backgroundImage: 'linear-gradient(rgba(30,60,120,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(30,60,120,0.6) 1px, transparent 1px)', backgroundSize: '52px 52px' }} />
      <div className="noise-overlay pointer-events-none absolute inset-0 opacity-20" />

      <div className="relative z-10 w-full max-w-[460px]">
        <div className="absolute -inset-[1px] rounded-[32px] opacity-60"
             style={{ background: 'linear-gradient(135deg, #3b82f655, #6366f140, #1d4ed840, #3b82f644)', filter: 'blur(0.5px)' }} />

        <div className="relative rounded-[31px] overflow-hidden border border-black/[0.05]"
             style={{ background: 'rgba(248, 252, 255, 0.85)', backdropFilter: 'blur(32px)', WebkitBackdropFilter: 'blur(32px)', boxShadow: '0 24px 64px rgba(59,130,246,0.10), 0 4px 16px rgba(30,60,120,0.05)' }}>

          <div className="px-10 pt-10 pb-8 text-center">
            <div className="relative inline-flex items-center justify-center mb-6">
              <div className="absolute inset-0 rounded-2xl animate-pulse opacity-50"
                   style={{ background: 'radial-gradient(circle, rgba(59,130,246,0.5) 0%, transparent 70%)', filter: 'blur(14px)' }} />
              <div className="relative w-16 h-16 rounded-2xl flex items-center justify-center border border-white/20"
                   style={{ background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)', boxShadow: '0 8px 24px rgba(59,130,246,0.40), inset 0 1px 0 rgba(255,255,255,0.15)' }}>
                <LayoutGrid strokeWidth={1.5} className="w-8 h-8 text-cream-100" />
              </div>
            </div>

            <h1 className="font-display text-[2rem] font-bold leading-tight tracking-tight"
                style={{ background: 'linear-gradient(135deg, #1e3a8a 0%, #2563eb 50%, #1d4ed8 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
              Plataforma de Gestión
            </h1>
            <p className="mt-2 text-sm tracking-wide" style={{ color: '#475569' }}>
              Introduce tus credenciales para continuar
            </p>

            <div className="flex items-center justify-center gap-2 mt-6 flex-wrap">
              {FEATURES.map(({ icon: Icon, label }) => (
                <span key={label}
                      className="inline-flex items-center gap-1.5 text-[11px] font-medium rounded-full px-3 py-1.5 border"
                      style={{ color: '#1d4ed8', background: 'rgba(59,130,246,0.07)', borderColor: 'rgba(59,130,246,0.22)' }}>
                  <Icon className="w-3 h-3" />
                  {label}
                </span>
              ))}
            </div>
          </div>

          <div className="mx-10 h-px" style={{ background: 'linear-gradient(90deg, transparent, rgba(59,130,246,0.12), transparent)' }} />

          <div className="px-10 py-8">
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <label className="block text-[11px] font-semibold uppercase tracking-[0.12em]"
                       style={{ color: '#334155' }}>
                  Correo electrónico
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoFocus
                  placeholder="usuario@empresa.com"
                  className="w-full rounded-xl px-4 py-3.5 text-sm outline-none transition-all duration-200"
                  style={{ background: 'rgba(255,255,255,0.85)', border: '1px solid rgba(59,130,246,0.20)', color: '#0f172a' }}
                  onFocus={e => { e.currentTarget.style.border = '1px solid rgba(59,130,246,0.55)'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(59,130,246,0.10)' }}
                  onBlur={e  => { e.currentTarget.style.border = '1px solid rgba(59,130,246,0.20)'; e.currentTarget.style.boxShadow = 'none' }}
                />
              </div>

              <div className="space-y-2">
                <label className="block text-[11px] font-semibold uppercase tracking-[0.12em]"
                       style={{ color: '#334155' }}>
                  Contraseña
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    placeholder="••••••••"
                    className="w-full rounded-xl px-4 py-3.5 pr-12 text-sm outline-none transition-all duration-200 tracking-widest"
                    style={{ background: 'rgba(255,255,255,0.85)', border: '1px solid rgba(59,130,246,0.20)', color: '#0f172a' }}
                    onFocus={e => { e.currentTarget.style.border = '1px solid rgba(59,130,246,0.55)'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(59,130,246,0.10)' }}
                    onBlur={e  => { e.currentTarget.style.border = '1px solid rgba(59,130,246,0.20)'; e.currentTarget.style.boxShadow = 'none' }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(v => !v)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 transition-colors"
                    style={{ color: '#94a3b8' }}
                    onMouseEnter={e => (e.currentTarget.style.color = '#2563eb')}
                    onMouseLeave={e => (e.currentTarget.style.color = '#94a3b8')}
                    aria-label="Mostrar u ocultar contraseña"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="pt-1">
                <div className="relative group">
                  <div className="absolute -inset-[2px] rounded-xl opacity-40 group-hover:opacity-70 transition-opacity duration-300 blur-sm"
                       style={{ background: 'linear-gradient(135deg, #3b82f6, #6366f1, #3b82f6)' }} />
                  <button
                    type="submit"
                    disabled={loading}
                    className="relative w-full flex items-center justify-center gap-2.5 rounded-xl py-3.5 font-semibold text-sm tracking-wide transition-all duration-300 disabled:opacity-60 disabled:cursor-not-allowed"
                    style={{ background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 50%, #1e40af 100%)', color: '#ffffff', boxShadow: '0 4px 20px rgba(59,130,246,0.35), inset 0 1px 0 rgba(255,255,255,0.15)' }}
                  >
                    {loading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        <span>Acceder al sistema</span>
                        <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform duration-200" />
                      </>
                    )}
                  </button>
                </div>
              </div>
            </form>
          </div>

          <div className="h-px mx-10" style={{ background: 'linear-gradient(90deg, transparent, rgba(59,130,246,0.10), transparent)' }} />
          <div className="px-10 py-5 flex items-center justify-between text-[11px]" style={{ color: '#94a3b8' }}>
            <span>© {new Date().getFullYear()} · Plataforma de gestión</span>
            <div className="flex items-center gap-1.5">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
              <span>Sistema activo</span>
            </div>
          </div>

          <div className="h-px w-full"
               style={{ background: 'linear-gradient(90deg, transparent 0%, rgba(59,130,246,0.30) 50%, transparent 100%)' }} />
        </div>
      </div>
    </div>
  )
}
