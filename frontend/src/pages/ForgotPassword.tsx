import { useState, FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Loader2, Mail, KeyRound, CheckCircle2 } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../lib/api'

export default function ForgotPassword() {
  const navigate = useNavigate()
  const [step, setStep] = useState<'email' | 'code'>('email')
  const [email, setEmail] = useState('')
  const [codigo, setCodigo] = useState('')
  const [nueva, setNueva] = useState('')
  const [confirmar, setConfirmar] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSolicitar(e: FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      await api.post('/auth/solicitar-reset', { email })
      setStep('code')
      toast.success('Código enviado. Revisa tu correo.')
    } catch (err: any) {
      const msg = err?.response?.data?.errors?.[0] ?? 'No se pudo solicitar el código'
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }

  async function handleReset(e: FormEvent) {
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
      await api.post('/auth/reset-password', { email, codigo, nuevaPassword: nueva })
      toast.success('Contraseña restablecida. Ya puedes iniciar sesión.')
      navigate('/login', { replace: true })
    } catch (err: any) {
      const msg = err?.response?.data?.errors?.[0] ?? 'No se pudo restablecer la contraseña'
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 bg-slate-50">
      <div className="w-full max-w-md bg-white rounded-2xl border border-gray-200 shadow-sm p-8">
        <button
          type="button"
          onClick={() => (step === 'code' ? setStep('email') : navigate('/login'))}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-6"
        >
          <ArrowLeft className="w-4 h-4" />
          {step === 'code' ? 'Volver' : 'Volver al inicio de sesión'}
        </button>

        {step === 'email' ? (
          <>
            <div className="flex flex-col items-center text-center mb-6">
              <div className="w-14 h-14 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mb-4">
                <Mail className="w-7 h-7" />
              </div>
              <h1 className="text-xl font-bold text-gray-900">Recuperar contraseña</h1>
              <p className="mt-2 text-sm text-gray-500">
                Introduce tu correo y te enviaremos un código para restablecerla.
              </p>
            </div>

            <form onSubmit={handleSolicitar} className="space-y-4">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
                placeholder="usuario@empresa.com"
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
              />
              <button
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white font-semibold text-sm py-2.5 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Enviar código'}
              </button>
            </form>
          </>
        ) : (
          <>
            <div className="flex flex-col items-center text-center mb-6">
              <div className="w-14 h-14 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mb-4">
                <KeyRound className="w-7 h-7" />
              </div>
              <h1 className="text-xl font-bold text-gray-900">Introduce el código</h1>
              <p className="mt-2 text-sm text-gray-500">
                Te hemos enviado un código a <span className="font-medium text-gray-700">{email}</span>.
              </p>
            </div>

            <form onSubmit={handleReset} className="space-y-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-gray-600">Código de verificación</label>
                <input
                  value={codigo}
                  onChange={(e) => setCodigo(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  required
                  inputMode="numeric"
                  autoFocus
                  placeholder="000000"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-center text-lg tracking-[0.4em] font-mono outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-gray-600">Nueva contraseña</label>
                <input
                  type="password"
                  value={nueva}
                  onChange={(e) => setNueva(e.target.value)}
                  required
                  minLength={8}
                  placeholder="Mínimo 8 caracteres, con letra y número"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-gray-600">Confirmar contraseña</label>
                <input
                  type="password"
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
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <><CheckCircle2 className="w-4 h-4" /> Restablecer contraseña</>}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  )
}
