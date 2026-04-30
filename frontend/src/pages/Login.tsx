import { useState, useEffect, FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../store/authStore'
import { Loader2, Eye, EyeOff, Building2 } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../lib/api'

// Insignias flotantes del panel de marca
const BADGES = [
  { emoji: '🥐', label: 'Palmeras',    cls: 'top-[12%] right-[10%] animate-float-slow' },
  { emoji: '🧁', label: 'Magdalenas',  cls: 'top-[28%] left-[7%]  animate-float-medium' },
  { emoji: '🥧', label: 'Milhojas',    cls: 'bottom-[30%] right-[8%] animate-float-fast' },
  { emoji: '🍫', label: '',            cls: 'bottom-[46%] left-[9%] animate-float-medium' },
  { emoji: '🎂', label: 'Bizcochadas', cls: 'top-[52%] right-[14%] animate-float-slow' },
]

export default function Login() {
  const { login }   = useAuth()
  const navigate    = useNavigate()
  const [email, setEmail]               = useState('admin@buenatierra.com')
  const [password, setPassword]         = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [empresaId, setEmpresaId]       = useState<number>(1)
  const [empresas, setEmpresas]         = useState<{ id: number; nombre: string }[]>([])
  const [loading, setLoading]           = useState(false)

  // Cargar lista de empresas activas para el selector
  useEffect(() => {
    api.get('/empresa/lista')
      .then(res => {
        const lista = res.data.data as { id: number; nombre: string }[]
        setEmpresas(lista)
        if (lista.length === 1) setEmpresaId(lista[0].id)
      })
      .catch(() => {
        // Si falla, se usa el valor por defecto (1)
      })
  }, [])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      await login(email, password, empresaId)
      navigate('/dashboard', { replace: true })
    } catch {
      toast.error('Email o contraseña incorrectos')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col lg:flex-row">

      {/* ══════════════════════════════════════════════
           PANEL IZQUIERDO — identidad de marca
          ══════════════════════════════════════════════ */}
      <div className="
        relative overflow-hidden
        lg:w-[52%] lg:min-h-screen
        flex flex-col items-center justify-center
        py-14 lg:py-0 px-8
        bg-brand-gradient
      ">
        {/* Ruido de textura */}
        <div className="absolute inset-0 noise-overlay" />

        {/* Círculos difuminados de profundidad */}
        <div className="absolute -top-20 -right-20 w-80 h-80 rounded-full bg-brand-400/20 blur-3xl pointer-events-none" />
        <div className="absolute top-1/3 -left-24  w-72 h-72 rounded-full bg-wheat-400/10  blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 right-0  w-96 h-96 rounded-full bg-earth-900/40  blur-3xl pointer-events-none" />

        {/* Ola decorativa inferior */}
        <svg
          className="absolute bottom-0 left-0 right-0 w-full"
          viewBox="0 0 1440 60" fill="none" preserveAspectRatio="none"
        >
          <path d="M0,30 C480,65 960,0 1440,35 L1440,60 L0,60 Z" fill="rgba(253,248,238,0.07)" />
        </svg>

        {/* Líneas decorativas de fondo estilo etiqueta */}
        <div className="absolute inset-x-6 top-6 h-px bg-white/10" />
        <div className="absolute inset-x-6 bottom-6 h-px bg-white/10" />

        {/* Insignias flotantes — solo en pantallas lg+ */}
        {BADGES.map((b) => (
          <div key={b.label + b.emoji} className={`absolute hidden lg:block ${b.cls}`}>
            <div className="
              bg-white/10 backdrop-blur-md
              border border-white/20
              rounded-2xl px-3 py-2
              flex items-center gap-2
              shadow-warm
            ">
              <span className="text-xl drop-shadow">{b.emoji}</span>
              {b.label && (
                <span className="text-white/85 text-xs font-semibold tracking-wide">{b.label}</span>
              )}
            </div>
          </div>
        ))}

        {/* Contenido central */}
        <div className="relative z-10 text-center max-w-xs">

          {/* Logo */}
          <div className="
            w-20 h-20 mx-auto mb-7
            bg-white/12 backdrop-blur-sm
            border border-white/25
            rounded-3xl shadow-warm-lg
            flex items-center justify-center
          ">
            <span className="text-4xl drop-shadow-md">🌾</span>
          </div>

          {/* Nombre de marca */}
          <h1 className="font-display text-5xl sm:text-6xl font-bold text-white text-shadow-warm leading-none mb-2">
            Buena<span className="text-wheat-300 italic">Tierra</span>
          </h1>

          {/* Tagline */}
          <p className="text-cream-200/75 text-sm font-light tracking-wide leading-relaxed mt-3 mb-7">
            Calidad artesana en cada elaboración
          </p>

          {/* Separador estilo etiqueta */}
          <div className="flex items-center justify-center gap-3 mb-6">
            <div className="flex-1 h-px bg-white/15" />
            <span className="text-white/35 text-xs font-semibold tracking-[0.2em] uppercase">Sevilla · España</span>
            <div className="flex-1 h-px bg-white/15" />
          </div>

          {/* Píldoras de características */}
          <div className="flex flex-wrap justify-center gap-2">
            {[
              { dot: 'bg-sage-400',  text: 'Trazabilidad CE 1169/2011' },
              { dot: 'bg-wheat-400', text: 'Lotes FIFO automáticos' },
              { dot: 'bg-brand-300', text: 'Multi-usuario · Multi-rol' },
            ].map((p) => (
              <div
                key={p.text}
                className="bg-white/10 border border-white/15 rounded-full px-3 py-1.5 flex items-center gap-1.5"
              >
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${p.dot}`} />
                <span className="text-white/65 text-xs">{p.text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════
           PANEL DERECHO — formulario de acceso
          ══════════════════════════════════════════════ */}
      <div className="
        flex-1 flex items-center justify-center
        bg-cream-100
        px-6 py-10 sm:px-10 lg:px-16 xl:px-20
      ">
        <div className="w-full max-w-md">

          {/* Logo compacto — solo mobile (no se ve el panel izq) */}
          <div className="flex items-center gap-3 mb-8 lg:hidden">
            <div className="w-10 h-10 bg-brand-gradient rounded-2xl flex items-center justify-center shadow-warm">
              <span className="text-lg">🌾</span>
            </div>
            <div>
              <p className="text-sm font-bold text-earth-900">BuenaTierra</p>
              <p className="text-xs text-earth-400">Gestión del Obrador</p>
            </div>
          </div>

          {/* Encabezado */}
          <div className="mb-8">
            <h2 className="font-display text-3xl sm:text-4xl font-bold text-earth-900 mb-2">
              Bienvenido
            </h2>
            <p className="text-earth-500 text-sm leading-relaxed">
              Accede al sistema de gestión del obrador artesano.
            </p>
          </div>

          {/* Formulario */}
          <form onSubmit={handleSubmit} className="space-y-5">

            {/* Email */}
            <div>
              <label className="block text-sm font-semibold text-earth-700 mb-1.5">
                Correo electrónico
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
                placeholder="tu@correo.es"
                className="
                  w-full border border-cream-300 rounded-xl
                  px-4 py-3 text-sm text-earth-800
                  bg-white placeholder-earth-300
                  focus:outline-none focus:ring-2 focus:ring-brand-400/50 focus:border-brand-400
                  transition-all duration-150 shadow-warm-sm
                "
              />
            </div>

            {/* Contraseña */}
            <div>
              <label className="block text-sm font-semibold text-earth-700 mb-1.5">
                Contraseña
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  placeholder="••••••••"
                  className="
                    w-full border border-cream-300 rounded-xl
                    px-4 py-3 pr-11 text-sm text-earth-800
                    bg-white placeholder-earth-300
                    focus:outline-none focus:ring-2 focus:ring-brand-400/50 focus:border-brand-400
                    transition-all duration-150 shadow-warm-sm
                  "
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-earth-300 hover:text-earth-600 transition-colors"
                  aria-label="Mostrar u ocultar contraseña"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Empresa — solo visible si hay más de una */}
            {empresas.length > 1 && (
              <div>
                <label className="block text-sm font-semibold text-earth-700 mb-1.5">
                  <Building2 className="inline w-3.5 h-3.5 mr-1 text-earth-400" />
                  Empresa
                </label>
                <select
                  value={empresaId}
                  onChange={e => setEmpresaId(Number(e.target.value))}
                  required
                  className="
                    w-full border border-cream-300 rounded-xl
                    px-4 py-3 text-sm text-earth-800
                    bg-white
                    focus:outline-none focus:ring-2 focus:ring-brand-400/50 focus:border-brand-400
                    transition-all duration-150 shadow-warm-sm
                  "
                >
                  {empresas.map(emp => (
                    <option key={emp.id} value={emp.id}>{emp.nombre}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Botón de acceso */}
            <button
              type="submit"
              disabled={loading}
              className="
                w-full flex items-center justify-center gap-2.5 mt-2
                bg-brand-gradient
                hover:opacity-90 active:opacity-100 active:scale-[0.99]
                disabled:opacity-50 disabled:cursor-not-allowed
                text-white font-bold text-sm tracking-wide
                py-3.5 rounded-xl shadow-warm hover:shadow-warm-lg
                transition-all duration-200
              "
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {loading ? 'Comprobando acceso...' : 'Iniciar sesión'}
            </button>
          </form>

          {/* Pie de página */}
          <p className="mt-10 text-center text-xs text-earth-300 leading-relaxed">
            BuenaTierra · Sistema de Gestión Artesanal<br />
            <span className="text-earth-200">© {new Date().getFullYear()} · Todos los derechos reservados</span>
          </p>
        </div>
      </div>
    </div>
  )
}
