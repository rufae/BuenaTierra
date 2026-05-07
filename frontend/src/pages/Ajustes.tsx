import { useState, useEffect, FormEvent, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import {
  User, Lock, Loader2, Eye, EyeOff, Phone, Mail, Shield, Building2,
  CheckCircle2, KeyRound, Settings, Percent, Printer, Package, Server,
  Upload, Trash2, Plus, Pencil, Save, Bot, Inbox, RefreshCw, Palette,
} from 'lucide-react'
import api from '../lib/api'
import { useAuth } from '../store/authStore'
import { useTheme } from '../hooks/useTheme'
import { THEME_DEFAULTS, isValidHex, applyTheme, parseThemeFromConfig, resetTheme } from '../lib/theme'

// ── types ──────────────────────────────────────────────────────────────────────
interface UpdateMeRequest { nombre: string; apellidos: string; telefono: string; email: string }
interface CambiarPasswordRequest { passwordActual: string; nuevaPassword: string }
interface MeData { id: number; nombre: string; apellidos: string; email: string; telefono: string | null; rol: string }

interface EmpresaData {
  id: number; nombre: string; nif: string; razonSocial: string | null
  direccion: string | null; codigoPostal: string | null; ciudad: string | null
  provincia: string | null; pais: string; telefono: string | null
  email: string | null; web: string | null; logoUrl: string | null
  numeroRgseaa: string | null; esObrador: boolean; configuracion: string
}

interface TipoIvaRe {
  id: number; ivaPorcentaje: number; recargoEquivalenciaPorcentaje: number; descripcion: string | null
}

interface SerieFacturacion {
  id: number; codigo: string; prefijo: string | null; descripcion: string | null; activa: boolean
}

interface ConfiguracionEmpresa {
  serieFacturaDefecto?: number
  serieAlbaranDefecto?: number
  stockMinimoGlobal?: number
  diasAlertaCaducidad?: number
  smtpHost?: string
  smtpPort?: number
  smtpUser?: string
  smtpPassword?: string
  smtpFromEmail?: string
  smtpUseSsl?: boolean
  impresoras?: { nombre: string; tipo: string; ip?: string }[]
  buenatierrAI?: {
    enabled?: boolean
    providerBaseUrl?: string
    model?: string
    apiKey?: string
  }
}

interface UserConfiguracion {
  smtpHost?: string
  smtpPort?: number
  smtpUser?: string
  smtpPassword?: string
  smtpFromEmail?: string
  smtpUseSsl?: boolean
  imapHost?: string
  imapPort?: number
  imapUser?: string
  imapPassword?: string
  imapUseSsl?: boolean
}

type Tab = 'perfil' | 'password' | 'empresa' | 'series' | 'iva' | 'stock' | 'smtp' | 'ia' | 'correo' | 'tema'

const ROL_CONFIG: Record<string, { label: string; color: string }> = {
  Admin:              { label: 'Administrador', color: 'bg-purple-100 text-purple-700 border-purple-200' },
  Obrador:     { label: 'Obrador',       color: 'bg-brand-100 text-brand-700 border-brand-200'   },
  Repartidor:  { label: 'Repartidor',    color: 'bg-blue-100 text-blue-700 border-blue-200'      },
}

// ── helpers ────────────────────────────────────────────────────────────────────
function Field({ label, value, onChange, type = 'text', icon, placeholder, disabled }: {
  label: string; value: string; onChange: (v: string) => void; type?: string
  icon?: React.ReactNode; placeholder?: string; disabled?: boolean
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
          placeholder={placeholder}
          disabled={disabled}
          className={`w-full border border-gray-200 rounded-xl py-2.5 text-sm bg-white focus:outline-none focus:ring-2
            focus:ring-brand-400/50 focus:border-brand-400 transition-colors disabled:bg-gray-50 disabled:text-gray-400
            ${icon ? 'pl-9 pr-3' : 'px-3'}`}
        />
      </div>
    </div>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-2">{children}</h3>
}

function SaveBtn({ loading, label = 'Guardar' }: { loading: boolean; label?: string }) {
  return (
    <button type="submit" disabled={loading}
      className="flex items-center gap-2 bg-brand-500 hover:bg-brand-600 disabled:opacity-60 text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition-colors">
      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
      {label}
    </button>
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
  const qc = useQueryClient()
  const isAdmin = user?.rol === 'Admin'
  const canConfigureIa = user?.rol === 'Admin' || user?.rol === 'Obrador'
  const [tab, setTab] = useState<Tab>('perfil')

  const initials = [user?.nombre, user?.apellidos]
    .filter(Boolean).map(s => s![0].toUpperCase()).join('')

  const rolConfig = ROL_CONFIG[user?.rol ?? ''] ?? { label: user?.rol ?? '', color: 'bg-gray-100 text-gray-600 border-gray-200' }

  // ═══════════════════════════════════════════════════════
  // QUERIES
  // ═══════════════════════════════════════════════════════

  const { data: meData } = useQuery<MeData>({
    queryKey: ['me', user?.usuarioId],
    enabled: !!user,
    queryFn: async () => (await api.get('/usuarios/me')).data.data,
  })

  const { data: empresa } = useQuery<EmpresaData>({
    queryKey: ['empresa'],
    enabled: canConfigureIa,
    queryFn: async () => (await api.get('/empresa')).data.data,
  })

  const { data: tiposIva, refetch: refetchIva } = useQuery<TipoIvaRe[]>({
    queryKey: ['tipos-iva-re'],
    enabled: isAdmin,
    queryFn: async () => (await api.get('/etiquetas/tipos-iva-re')).data.data,
  })

  const { data: series } = useQuery<SerieFacturacion[]>({
    queryKey: ['series'],
    enabled: isAdmin,
    queryFn: async () => (await api.get('/series')).data.data,
  })

  const { data: userConfigData } = useQuery<UserConfiguracion>({
    queryKey: ['user-configuracion', user?.usuarioId],
    enabled: !!user,
    queryFn: async () => (await api.get('/usuarios/me/configuracion')).data.data ?? {},
  })

  // ═══════════════════════════════════════════════════════
  // PERFIL
  // ═══════════════════════════════════════════════════════

  const [perfil, setPerfil] = useState({
    nombre: user?.nombre ?? '', apellidos: user?.apellidos ?? '',
    telefono: '', email: user?.email ?? '',
  })

  useEffect(() => {
    if (meData) {
      setPerfil(p => ({
        ...p, nombre: meData.nombre || p.nombre, apellidos: meData.apellidos || p.apellidos,
        email: meData.email || p.email, telefono: meData.telefono ?? '',
      }))
    }
  }, [meData?.id])

  const perfilMutation = useMutation({
    mutationFn: (data: UpdateMeRequest) => api.put<{ data: MeData; message: string }>('/usuarios/me', data),
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

  // ═══════════════════════════════════════════════════════
  // PASSWORD
  // ═══════════════════════════════════════════════════════

  const [pwForm, setPwForm] = useState({ passwordActual: '', nuevaPassword: '', confirmar: '' })
  const [showActual, setShowActual] = useState(false)
  const [showNueva, setShowNueva] = useState(false)
  const strength = pwStrength(pwForm.nuevaPassword)
  const pwMatch = pwForm.confirmar && pwForm.confirmar === pwForm.nuevaPassword

  const pwMutation = useMutation({
    mutationFn: (data: CambiarPasswordRequest) => api.put<{ data: string; message: string }>('/usuarios/me/cambiar-password', data),
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
    if (pwForm.nuevaPassword.length < 8) { toast.error('Mínimo 8 caracteres'); return }
    pwMutation.mutate({ passwordActual: pwForm.passwordActual, nuevaPassword: pwForm.nuevaPassword })
  }

  // ═══════════════════════════════════════════════════════
  // EMPRESA
  // ═══════════════════════════════════════════════════════

  const [empForm, setEmpForm] = useState({
    nombre: '', nif: '', razonSocial: '', direccion: '', codigoPostal: '',
    ciudad: '', provincia: '', pais: 'España', telefono: '', email: '',
    web: '', numeroRgseaa: '',
  })

  useEffect(() => {
    if (empresa) {
      setEmpForm({
        nombre: empresa.nombre, nif: empresa.nif, razonSocial: empresa.razonSocial ?? '',
        direccion: empresa.direccion ?? '', codigoPostal: empresa.codigoPostal ?? '',
        ciudad: empresa.ciudad ?? '', provincia: empresa.provincia ?? '',
        pais: empresa.pais, telefono: empresa.telefono ?? '', email: empresa.email ?? '',
        web: empresa.web ?? '', numeroRgseaa: empresa.numeroRgseaa ?? '',
      })
    }
  }, [empresa?.id])

  const empMutation = useMutation({
    mutationFn: (data: typeof empForm) => api.put('/empresa', data),
    onSuccess: () => {
      toast.success('Datos de empresa actualizados')
      qc.invalidateQueries({ queryKey: ['empresa'] })
    },
    onError: () => toast.error('Error al actualizar la empresa'),
  })

  function handleEmpSubmit(e: FormEvent) {
    e.preventDefault()
    if (!empForm.nombre.trim() || !empForm.nif.trim()) { toast.error('Nombre y NIF son obligatorios'); return }
    empMutation.mutate(empForm)
  }

  // Logo upload
  const logoRef = useRef<HTMLInputElement>(null)
  const [uploadingLogo, setUploadingLogo] = useState(false)

  async function handleLogoUpload(file: File) {
    setUploadingLogo(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      await api.post('/empresa/logo', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      toast.success('Logo actualizado')
      qc.invalidateQueries({ queryKey: ['empresa'] })
    } catch { toast.error('Error al subir el logo') }
    finally { setUploadingLogo(false) }
  }

  // ═══════════════════════════════════════════════════════
  // IVA / RE
  // ═══════════════════════════════════════════════════════

  const [ivaForm, setIvaForm] = useState({ ivaPorcentaje: '', recargoEquivalenciaPorcentaje: '', descripcion: '' })
  const [editIvaId, setEditIvaId] = useState<number | null>(null)

  const ivaMutation = useMutation({
    mutationFn: async (data: { id?: number; ivaPorcentaje: number; recargoEquivalenciaPorcentaje: number; descripcion: string }) => {
      if (data.id) return api.put(`/etiquetas/tipos-iva-re/${data.id}`, data)
      return api.post('/etiquetas/tipos-iva-re', data)
    },
    onSuccess: () => {
      toast.success(editIvaId ? 'Tipo IVA actualizado' : 'Tipo IVA creado')
      setIvaForm({ ivaPorcentaje: '', recargoEquivalenciaPorcentaje: '', descripcion: '' })
      setEditIvaId(null)
      refetchIva()
    },
    onError: () => toast.error('Error al guardar tipo IVA'),
  })

  const deleteIvaMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/etiquetas/tipos-iva-re/${id}`),
    onSuccess: () => { toast.success('Tipo IVA eliminado'); refetchIva() },
    onError: () => toast.error('Error al eliminar'),
  })

  function handleIvaSubmit(e: FormEvent) {
    e.preventDefault()
    const iva = parseFloat(ivaForm.ivaPorcentaje)
    const re = parseFloat(ivaForm.recargoEquivalenciaPorcentaje || '0')
    if (isNaN(iva)) { toast.error('IVA % es obligatorio'); return }
    ivaMutation.mutate({ id: editIvaId ?? undefined, ivaPorcentaje: iva, recargoEquivalenciaPorcentaje: re, descripcion: ivaForm.descripcion })
  }

  function openEditIva(t: TipoIvaRe) {
    setEditIvaId(t.id)
    setIvaForm({ ivaPorcentaje: String(t.ivaPorcentaje), recargoEquivalenciaPorcentaje: String(t.recargoEquivalenciaPorcentaje), descripcion: t.descripcion ?? '' })
  }

  // ═══════════════════════════════════════════════════════
  // STOCK PARAMS + SERIES DEFAULT (from Configuracion JSON)
  // ═══════════════════════════════════════════════════════

  const [config, setConfig] = useState<ConfiguracionEmpresa>({})

  useEffect(() => {
    if (empresa?.configuracion) {
      try { setConfig(JSON.parse(empresa.configuracion)) } catch { /* ignore */ }
    }
  }, [empresa?.configuracion])

  const configMutation = useMutation({
    mutationFn: (cfg: ConfiguracionEmpresa) => api.put('/empresa/configuracion', { configuracion: JSON.stringify(cfg) }),
    onSuccess: () => {
      toast.success('Configuración actualizada')
      qc.invalidateQueries({ queryKey: ['empresa'] })
    },
    onError: () => toast.error('Error al guardar configuración'),
  })

  const iaConfigMutation = useMutation({
    mutationFn: (cfg: ConfiguracionEmpresa['buenatierrAI']) => api.put('/empresa/configuracion/ia', {
      enabled: cfg?.enabled ?? true,
      providerBaseUrl: cfg?.providerBaseUrl ?? '',
      model: cfg?.model ?? '',
      apiKey: cfg?.apiKey ?? '',
    }),
    onSuccess: () => {
      toast.success('Configuración IA actualizada')
      qc.invalidateQueries({ queryKey: ['empresa'] })
      qc.invalidateQueries({ queryKey: ['buenatierr-ai-status'] })
    },
    onError: () => toast.error('Error al guardar configuración IA'),
  })

  function handleConfigSave(e: FormEvent) {
    e.preventDefault()
    configMutation.mutate(config)
  }

  function handleIaConfigSave(e: FormEvent) {
    e.preventDefault()
    iaConfigMutation.mutate(config.buenatierrAI)
  }

  // ═══════════════════════════════════════════════════════
  // USER CORREO CONFIG (SMTP + IMAP per-user)
  // ═══════════════════════════════════════════════════════

  const [userConfig, setUserConfig] = useState<UserConfiguracion>({})

  useEffect(() => {
    if (userConfigData) setUserConfig(userConfigData)
  }, [userConfigData])

  const userConfigMutation = useMutation({
    mutationFn: (cfg: UserConfiguracion) => api.put('/usuarios/me/configuracion', cfg),
    onSuccess: () => {
      toast.success('Configuración de correo guardada')
      qc.invalidateQueries({ queryKey: ['user-configuracion'] })
    },
    onError: () => toast.error('Error al guardar configuración de correo'),
  })

  const sincronizarMutation = useMutation({
    mutationFn: () => api.post('/correos/sincronizar'),
    onSuccess: (res) => {
      const d = (res.data as { data?: { nuevos?: number; errores?: number } }).data
      toast.success(`Sincronización: ${d?.nuevos ?? 0} nuevos${d?.errores ? `, ${d.errores} errores` : ''}`)
      qc.invalidateQueries({ queryKey: ['correos'] })
    },
    onError: (e: unknown) => {
      const resp = (e as { response?: { data?: { message?: string; errors?: string[] } } })?.response?.data
      toast.error(resp?.message ?? resp?.errors?.[0] ?? 'Error al sincronizar. Revisa la configuración IMAP.')
    },
  })

  function handleUserConfigSave(e: FormEvent) {
    e.preventDefault()
    userConfigMutation.mutate(userConfig)
  }

  function applyAiPreset(preset: 'groq' | 'openai' | 'ollama' | 'custom') {    const next = { ...(config.buenatierrAI ?? {}) }
    if (preset === 'groq') {
      next.providerBaseUrl = 'https://api.groq.com/openai/v1'
      next.model = next.model || 'llama-3.3-70b-versatile'
    }
    if (preset === 'openai') {
      next.providerBaseUrl = 'https://api.openai.com/v1'
      next.model = next.model || 'gpt-4o-mini'
    }
    if (preset === 'ollama') {
      next.providerBaseUrl = 'http://localhost:11434/v1'
      next.model = next.model || 'llama3.2'
      next.apiKey = ''
    }
    setConfig(c => ({ ...c, buenatierrAI: next }))
  }

  // ═══════════════════════════════════════════════════════
  // TEMA DE EMPRESA
  // ═══════════════════════════════════════════════════════

  // Aplica el tema de la empresa cuando carga la configuración
  useTheme(empresa?.configuracion)

  const [temaForm, setTemaForm] = useState({
    colorPrimario:   THEME_DEFAULTS.colorPrimario,
    colorSecundario: THEME_DEFAULTS.colorSecundario,
  })

  useEffect(() => {
    if (empresa?.configuracion) {
      const parsed = parseThemeFromConfig(empresa.configuracion)
      setTemaForm({ colorPrimario: parsed.colorPrimario, colorSecundario: parsed.colorSecundario })
    }
  }, [empresa?.configuracion])

  const temaMutation = useMutation({
    mutationFn: (data: { colorPrimario: string; colorSecundario: string }) =>
      api.put('/empresa/configuracion/tema', data),
    onSuccess: () => {
      toast.success('Colores de empresa guardados')
      qc.invalidateQueries({ queryKey: ['empresa'] })
    },
    onError: () => toast.error('Error al guardar los colores'),
  })

  function handleTemaSubmit(e: FormEvent) {
    e.preventDefault()
    if (!isValidHex(temaForm.colorPrimario) || !isValidHex(temaForm.colorSecundario)) {
      toast.error('Introduce colores en formato hexadecimal válido (#RRGGBB)')
      return
    }
    // Aplicar inmediatamente (preview en vivo antes de guardar)
    applyTheme(temaForm)
    temaMutation.mutate(temaForm)
  }

  function handleTemaReset() {
    const defaults = { colorPrimario: THEME_DEFAULTS.colorPrimario, colorSecundario: THEME_DEFAULTS.colorSecundario }
    setTemaForm(defaults)
    resetTheme()
    temaMutation.mutate(defaults)
  }

  // ═══════════════════════════════════════════════════════
  // TABS CONFIG
  // ═══════════════════════════════════════════════════════


  const userTabs = [
    { id: 'perfil'   as Tab, icon: <User className="w-4 h-4" />,     label: 'Mi perfil' },
    { id: 'password' as Tab, icon: <KeyRound className="w-4 h-4" />, label: 'Contraseña' },
  ]

  const adminTabs = [
    { id: 'empresa' as Tab, icon: <Building2 className="w-4 h-4" />, label: 'Empresa' },
    { id: 'series'  as Tab, icon: <Settings className="w-4 h-4" />,  label: 'Series' },
    { id: 'iva'     as Tab, icon: <Percent className="w-4 h-4" />,   label: 'IVA / RE' },
    { id: 'stock'   as Tab, icon: <Package className="w-4 h-4" />,   label: 'Stock' },
    { id: 'smtp'    as Tab, icon: <Server className="w-4 h-4" />,    label: 'SMTP' },
    { id: 'ia'      as Tab, icon: <Bot className="w-4 h-4" />,       label: 'BuenaTierrAI' },
    { id: 'tema'    as Tab, icon: <Palette className="w-4 h-4" />,   label: 'Tema' },
  ]

  const correoTab = { id: 'correo' as Tab, icon: <Inbox className="w-4 h-4" />, label: 'Correo' }
  const iaTabOnly = [{ id: 'ia' as Tab, icon: <Bot className="w-4 h-4" />, label: 'BuenaTierrAI' }]
  const temaTab   = { id: 'tema' as Tab, icon: <Palette className="w-4 h-4" />, label: 'Tema' }
  const canConfigureTema = isAdmin || user?.rol === 'Obrador'

  const allTabs = isAdmin
    ? [...userTabs, ...adminTabs, correoTab]
    : canConfigureIa
      ? [...userTabs, ...iaTabOnly, temaTab, correoTab]
      : [...userTabs, correoTab]

  // ── render ─────────────────────────────────────────────────────────────────
  return (
    <div className="p-6 max-w-3xl mx-auto space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Ajustes</h1>
        <p className="text-gray-500 text-sm mt-0.5">Perfil personal{isAdmin ? ' y configuración de empresa' : ''}</p>
      </div>

      {/* Tarjeta de perfil */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="h-16 bg-brand-gradient" />
        <div className="px-6 pb-5 -mt-8">
          <div className="flex items-end justify-between mb-3">
            <div className="w-16 h-16 rounded-2xl bg-white border-4 border-white shadow-md flex items-center justify-center text-xl font-bold text-brand-700 bg-brand-50 shrink-0">
              {initials || <User className="w-7 h-7 text-brand-400" />}
            </div>
            <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${rolConfig.color}`}>
              {rolConfig.label}
            </span>
          </div>
          <h2 className="text-lg font-bold text-gray-900 leading-tight">
            {[user?.nombre, user?.apellidos].filter(Boolean).join(' ') || '—'}
          </h2>
          <div className="flex flex-wrap gap-3 mt-3">
            <span className="flex items-center gap-1.5 text-xs text-gray-500">
              <Mail className="w-3.5 h-3.5 text-brand-400" />{user?.email ?? '—'}
            </span>
            {meData?.telefono && (
              <span className="flex items-center gap-1.5 text-xs text-gray-500">
                <Phone className="w-3.5 h-3.5 text-brand-400" />{meData.telefono}
              </span>
            )}
            <span className="flex items-center gap-1.5 text-xs text-gray-500">
              <Building2 className="w-3.5 h-3.5 text-brand-400" />Empresa #{user?.empresaId}
            </span>
            <span className="flex items-center gap-1.5 text-xs text-gray-500">
              <Shield className="w-3.5 h-3.5 text-brand-400" />ID #{user?.usuarioId}
            </span>
          </div>
        </div>
      </div>

      {/* Tabs + Content */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {/* Tab bar */}
        <div className="flex flex-wrap gap-1 px-5 pt-4 border-b border-gray-100 mb-[-1px]">
          {allTabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm rounded-t-lg font-medium transition-colors ${
                tab === t.id
                  ? 'bg-brand-50 text-brand-700 border-b-2 border-brand-500'
                  : 'text-gray-500 hover:text-gray-700 border-b-2 border-transparent'
              }`}>
              {t.icon}{t.label}
            </button>
          ))}
        </div>

        {/* ── PERFIL ── */}
        {tab === 'perfil' && (
          <form onSubmit={handlePerfilSubmit} className="p-6 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Nombre *" value={perfil.nombre} onChange={v => setPerfil(p => ({ ...p, nombre: v }))} icon={<User className="w-3.5 h-3.5" />} />
              <Field label="Apellidos" value={perfil.apellidos} onChange={v => setPerfil(p => ({ ...p, apellidos: v }))} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Teléfono" value={perfil.telefono} onChange={v => setPerfil(p => ({ ...p, telefono: v }))} type="tel" icon={<Phone className="w-3.5 h-3.5" />} />
              <Field label="Email" value={perfil.email} onChange={v => setPerfil(p => ({ ...p, email: v }))} type="email" icon={<Mail className="w-3.5 h-3.5" />} />
            </div>
            <div className="flex justify-end pt-1"><SaveBtn loading={perfilMutation.isPending} label="Guardar cambios" /></div>
          </form>
        )}

        {/* ── PASSWORD ── */}
        {tab === 'password' && (
          <form onSubmit={handlePwSubmit} className="p-6 space-y-4">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">Contraseña actual *</label>
              <div className="relative">
                <input type={showActual ? 'text' : 'password'} value={pwForm.passwordActual}
                  onChange={e => setPwForm(p => ({ ...p, passwordActual: e.target.value }))} required
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400/50 focus:border-brand-400 transition-colors" />
                <button type="button" onClick={() => setShowActual(s => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  {showActual ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                Nueva contraseña * <span className="text-gray-400 font-normal">(mín. 8 caracteres)</span>
              </label>
              <div className="relative">
                <input type={showNueva ? 'text' : 'password'} value={pwForm.nuevaPassword}
                  onChange={e => setPwForm(p => ({ ...p, nuevaPassword: e.target.value }))} required minLength={8}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400/50 focus:border-brand-400 transition-colors" />
                <button type="button" onClick={() => setShowNueva(s => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  {showNueva ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
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
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">Confirmar nueva contraseña *</label>
              <div className="relative">
                <input type="password" value={pwForm.confirmar}
                  onChange={e => setPwForm(p => ({ ...p, confirmar: e.target.value }))} required
                  className={`w-full border rounded-xl px-3 py-2.5 pr-10 text-sm focus:outline-none focus:ring-2 transition-colors ${
                    pwForm.confirmar
                      ? pwMatch ? 'border-emerald-400 focus:ring-emerald-400/50'
                                : 'border-red-400 bg-red-50 focus:ring-red-400/50'
                      : 'border-gray-200 focus:ring-brand-400/50 focus:border-brand-400'
                  }`} />
                {pwForm.confirmar && (
                  <span className="absolute right-3 top-1/2 -translate-y-1/2">
                    {pwMatch ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> : <EyeOff className="w-4 h-4 text-red-400" />}
                  </span>
                )}
              </div>
              {pwForm.confirmar && !pwMatch && <p className="text-xs text-red-500 mt-1">Las contraseñas no coinciden</p>}
            </div>
            <div className="flex justify-end pt-1"><SaveBtn loading={pwMutation.isPending} label="Cambiar contraseña" /></div>
          </form>
        )}

        {/* ── EMPRESA ── */}
        {tab === 'empresa' && isAdmin && (
          <form onSubmit={handleEmpSubmit} className="p-6 space-y-5">
            {/* Logo */}
            <div>
              <SectionTitle><Upload className="w-4 h-4 text-brand-500" /> Logo de empresa</SectionTitle>
              <div className="flex items-center gap-4">
                {empresa?.logoUrl ? (
                  <img src={empresa.logoUrl} alt="Logo" className="w-20 h-20 object-contain rounded-xl border border-gray-200 bg-gray-50" />
                ) : (
                  <div className="w-20 h-20 rounded-xl border-2 border-dashed border-gray-300 flex items-center justify-center text-gray-400">
                    <Building2 className="w-8 h-8" />
                  </div>
                )}
                <div>
                  <input ref={logoRef} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="hidden"
                    onChange={e => e.target.files?.[0] && handleLogoUpload(e.target.files[0])} />
                  <button type="button" onClick={() => logoRef.current?.click()} disabled={uploadingLogo}
                    className="text-sm text-brand-600 hover:text-brand-700 font-semibold flex items-center gap-1.5">
                    {uploadingLogo ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                    {empresa?.logoUrl ? 'Cambiar logo' : 'Subir logo'}
                  </button>
                  <p className="text-xs text-gray-400 mt-1">PNG, JPG, WebP o SVG. Max 5MB</p>
                </div>
              </div>
            </div>

            <hr className="border-gray-100" />

            {/* Datos fiscales */}
            <SectionTitle><Building2 className="w-4 h-4 text-brand-500" /> Datos fiscales</SectionTitle>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Nombre / Razón social *" value={empForm.nombre} onChange={v => setEmpForm(p => ({ ...p, nombre: v }))} />
              <Field label="NIF / CIF *" value={empForm.nif} onChange={v => setEmpForm(p => ({ ...p, nif: v }))} />
            </div>
            <Field label="Razón social (si difiere)" value={empForm.razonSocial} onChange={v => setEmpForm(p => ({ ...p, razonSocial: v }))} />
            <Field label="Nº RGSEAA" value={empForm.numeroRgseaa} onChange={v => setEmpForm(p => ({ ...p, numeroRgseaa: v }))} placeholder="26.XXXXX/XX" />

            <hr className="border-gray-100" />

            {/* Dirección */}
            <SectionTitle><Mail className="w-4 h-4 text-brand-500" /> Dirección y contacto</SectionTitle>
            <Field label="Dirección" value={empForm.direccion} onChange={v => setEmpForm(p => ({ ...p, direccion: v }))} />
            <div className="grid grid-cols-3 gap-4">
              <Field label="C.P." value={empForm.codigoPostal} onChange={v => setEmpForm(p => ({ ...p, codigoPostal: v }))} />
              <Field label="Ciudad" value={empForm.ciudad} onChange={v => setEmpForm(p => ({ ...p, ciudad: v }))} />
              <Field label="Provincia" value={empForm.provincia} onChange={v => setEmpForm(p => ({ ...p, provincia: v }))} />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <Field label="Teléfono" value={empForm.telefono} onChange={v => setEmpForm(p => ({ ...p, telefono: v }))} type="tel" icon={<Phone className="w-3.5 h-3.5" />} />
              <Field label="Email" value={empForm.email} onChange={v => setEmpForm(p => ({ ...p, email: v }))} type="email" icon={<Mail className="w-3.5 h-3.5" />} />
              <Field label="Web" value={empForm.web} onChange={v => setEmpForm(p => ({ ...p, web: v }))} placeholder="https://..." />
            </div>

            <div className="flex justify-end pt-2"><SaveBtn loading={empMutation.isPending} /></div>
          </form>
        )}

        {/* ── SERIES POR DEFECTO ── */}
        {tab === 'series' && isAdmin && (
          <form onSubmit={handleConfigSave} className="p-6 space-y-5">
            <SectionTitle><Settings className="w-4 h-4 text-brand-500" /> Series por defecto</SectionTitle>
            <p className="text-xs text-gray-500 -mt-2">Selecciona qué serie de facturación se usará por defecto al crear facturas y albaranes.</p>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">Serie facturas</label>
                <select value={config.serieFacturaDefecto ?? ''} onChange={e => setConfig(c => ({ ...c, serieFacturaDefecto: e.target.value ? Number(e.target.value) : undefined }))}
                  className="w-full border border-gray-200 rounded-xl py-2.5 px-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-400/50">
                  <option value="">— Sin asignar —</option>
                  {(series ?? []).filter(s => s.activa).map(s => <option key={s.id} value={s.id}>{s.codigo} — {s.descripcion ?? s.prefijo}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">Serie albaranes</label>
                <select value={config.serieAlbaranDefecto ?? ''} onChange={e => setConfig(c => ({ ...c, serieAlbaranDefecto: e.target.value ? Number(e.target.value) : undefined }))}
                  className="w-full border border-gray-200 rounded-xl py-2.5 px-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-400/50">
                  <option value="">— Sin asignar —</option>
                  {(series ?? []).filter(s => s.activa).map(s => <option key={s.id} value={s.id}>{s.codigo} — {s.descripcion ?? s.prefijo}</option>)}
                </select>
              </div>
            </div>

            {/* Impresoras */}
            <hr className="border-gray-100" />
            <SectionTitle><Printer className="w-4 h-4 text-brand-500" /> Impresoras de etiquetas</SectionTitle>
            <p className="text-xs text-gray-500 -mt-2">Configura impresoras para la impresión directa de etiquetas.</p>

            {(config.impresoras ?? []).map((imp, idx) => (
              <div key={idx} className="flex items-end gap-3">
                <div className="flex-1">
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Nombre</label>
                  <input value={imp.nombre} onChange={e => {
                    const arr = [...(config.impresoras ?? [])]; arr[idx] = { ...arr[idx], nombre: e.target.value }
                    setConfig(c => ({ ...c, impresoras: arr }))
                  }} className="w-full border border-gray-200 rounded-xl py-2 px-3 text-sm" />
                </div>
                <div className="w-32">
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Tipo</label>
                  <select value={imp.tipo} onChange={e => {
                    const arr = [...(config.impresoras ?? [])]; arr[idx] = { ...arr[idx], tipo: e.target.value }
                    setConfig(c => ({ ...c, impresoras: arr }))
                  }} className="w-full border border-gray-200 rounded-xl py-2 px-3 text-sm">
                    <option value="sistema">Sistema</option>
                    <option value="red">Red (IP)</option>
                  </select>
                </div>
                <div className="w-40">
                  <label className="block text-xs font-semibold text-gray-600 mb-1">IP (si red)</label>
                  <input value={imp.ip ?? ''} onChange={e => {
                    const arr = [...(config.impresoras ?? [])]; arr[idx] = { ...arr[idx], ip: e.target.value }
                    setConfig(c => ({ ...c, impresoras: arr }))
                  }} placeholder="192.168.1.100" className="w-full border border-gray-200 rounded-xl py-2 px-3 text-sm" />
                </div>
                <button type="button" onClick={() => {
                  const arr = (config.impresoras ?? []).filter((_, i) => i !== idx)
                  setConfig(c => ({ ...c, impresoras: arr }))
                }} className="p-2 text-red-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
              </div>
            ))}

            <button type="button" onClick={() => setConfig(c => ({ ...c, impresoras: [...(c.impresoras ?? []), { nombre: '', tipo: 'sistema', ip: '' }] }))}
              className="text-sm text-brand-600 hover:text-brand-700 font-semibold flex items-center gap-1.5">
              <Plus className="w-4 h-4" /> Añadir impresora
            </button>

            <div className="flex justify-end pt-2"><SaveBtn loading={configMutation.isPending} /></div>
          </form>
        )}

        {/* ── IVA / RE ── */}
        {tab === 'iva' && isAdmin && (
          <div className="p-6 space-y-5">
            <SectionTitle><Percent className="w-4 h-4 text-brand-500" /> Tipos de IVA y Recargo de equivalencia</SectionTitle>

            {/* Table */}
            <div className="border border-gray-100 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left px-4 py-2.5 font-semibold text-gray-600">IVA %</th>
                    <th className="text-left px-4 py-2.5 font-semibold text-gray-600">RE %</th>
                    <th className="text-left px-4 py-2.5 font-semibold text-gray-600">Descripción</th>
                    <th className="w-20 px-4 py-2.5" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {(tiposIva ?? []).map(t => (
                    <tr key={t.id} className="hover:bg-gray-50/50">
                      <td className="px-4 py-2.5 font-medium">{t.ivaPorcentaje}%</td>
                      <td className="px-4 py-2.5">{t.recargoEquivalenciaPorcentaje}%</td>
                      <td className="px-4 py-2.5 text-gray-500">{t.descripcion ?? '—'}</td>
                      <td className="px-4 py-2.5 flex gap-1 justify-end">
                        <button onClick={() => openEditIva(t)} className="p-1 text-gray-400 hover:text-brand-600"><Pencil className="w-3.5 h-3.5" /></button>
                        <button onClick={() => deleteIvaMutation.mutate(t.id)} className="p-1 text-gray-400 hover:text-red-600"><Trash2 className="w-3.5 h-3.5" /></button>
                      </td>
                    </tr>
                  ))}
                  {(tiposIva ?? []).length === 0 && (
                    <tr><td colSpan={4} className="text-center py-6 text-gray-400">No hay tipos de IVA configurados</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Form */}
            <form onSubmit={handleIvaSubmit} className="flex items-end gap-3">
              <div className="w-28">
                <label className="block text-xs font-semibold text-gray-600 mb-1">IVA % *</label>
                <input type="number" step="0.01" value={ivaForm.ivaPorcentaje} onChange={e => setIvaForm(p => ({ ...p, ivaPorcentaje: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl py-2 px-3 text-sm" placeholder="21" />
              </div>
              <div className="w-28">
                <label className="block text-xs font-semibold text-gray-600 mb-1">RE %</label>
                <input type="number" step="0.01" value={ivaForm.recargoEquivalenciaPorcentaje} onChange={e => setIvaForm(p => ({ ...p, recargoEquivalenciaPorcentaje: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl py-2 px-3 text-sm" placeholder="5.2" />
              </div>
              <div className="flex-1">
                <label className="block text-xs font-semibold text-gray-600 mb-1">Descripción</label>
                <input value={ivaForm.descripcion} onChange={e => setIvaForm(p => ({ ...p, descripcion: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl py-2 px-3 text-sm" placeholder="IVA general" />
              </div>
              <button type="submit" disabled={ivaMutation.isPending}
                className="flex items-center gap-1.5 bg-brand-500 hover:bg-brand-600 disabled:opacity-60 text-white text-sm font-semibold px-4 py-2 rounded-xl">
                {ivaMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : editIvaId ? <Pencil className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                {editIvaId ? 'Actualizar' : 'Añadir'}
              </button>
              {editIvaId && (
                <button type="button" onClick={() => { setEditIvaId(null); setIvaForm({ ivaPorcentaje: '', recargoEquivalenciaPorcentaje: '', descripcion: '' }) }}
                  className="text-sm text-gray-500 hover:text-gray-700 px-3 py-2">Cancelar</button>
              )}
            </form>
          </div>
        )}

        {/* ── STOCK PARAMS ── */}
        {tab === 'stock' && isAdmin && (
          <form onSubmit={handleConfigSave} className="p-6 space-y-5">
            <SectionTitle><Package className="w-4 h-4 text-brand-500" /> Parámetros de stock</SectionTitle>
            <p className="text-xs text-gray-500 -mt-2">Configuración global de stock. Estos valores se usan como fallback cuando un producto no tiene configuración propia.</p>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">Stock mínimo global</label>
                <input type="number" min="0" value={config.stockMinimoGlobal ?? ''} onChange={e => setConfig(c => ({ ...c, stockMinimoGlobal: e.target.value ? Number(e.target.value) : undefined }))}
                  placeholder="10" className="w-full border border-gray-200 rounded-xl py-2.5 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400/50" />
                <p className="text-xs text-gray-400 mt-1">Si el stock de un producto baja de este valor, se mostrará una alerta</p>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">Días alerta de caducidad</label>
                <input type="number" min="0" value={config.diasAlertaCaducidad ?? ''} onChange={e => setConfig(c => ({ ...c, diasAlertaCaducidad: e.target.value ? Number(e.target.value) : undefined }))}
                  placeholder="7" className="w-full border border-gray-200 rounded-xl py-2.5 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400/50" />
                <p className="text-xs text-gray-400 mt-1">Lotes que caducan en los próximos X días se marcarán como "próximos a caducar"</p>
              </div>
            </div>

            <div className="flex justify-end pt-2"><SaveBtn loading={configMutation.isPending} /></div>
          </form>
        )}

        {/* ── SMTP ── */}
        {tab === 'smtp' && isAdmin && (
          <form onSubmit={handleConfigSave} className="p-6 space-y-5">
            <SectionTitle><Server className="w-4 h-4 text-brand-500" /> Configuración SMTP</SectionTitle>
            <p className="text-xs text-gray-500 -mt-2">Datos del servidor de correo para el envío de facturas por email.</p>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Servidor SMTP" value={config.smtpHost ?? ''} onChange={v => setConfig(c => ({ ...c, smtpHost: v }))} placeholder="smtp.gmail.com" />
              <Field label="Puerto" value={String(config.smtpPort ?? '')} onChange={v => setConfig(c => ({ ...c, smtpPort: v ? Number(v) : undefined }))} type="number" placeholder="587" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Usuario" value={config.smtpUser ?? ''} onChange={v => setConfig(c => ({ ...c, smtpUser: v }))} icon={<Mail className="w-3.5 h-3.5" />} />
              <Field label="Contraseña" value={config.smtpPassword ?? ''} onChange={v => setConfig(c => ({ ...c, smtpPassword: v }))} type="password" icon={<Lock className="w-3.5 h-3.5" />} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Email remitente" value={config.smtpFromEmail ?? ''} onChange={v => setConfig(c => ({ ...c, smtpFromEmail: v }))} type="email" placeholder="facturas@miobrador.es" />
              <div className="flex items-end">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={config.smtpUseSsl ?? true} onChange={e => setConfig(c => ({ ...c, smtpUseSsl: e.target.checked }))}
                    className="rounded border-gray-300 text-brand-500 focus:ring-brand-400" />
                  <span className="text-sm text-gray-700">Usar SSL/TLS</span>
                </label>
              </div>
            </div>

            <div className="flex justify-end pt-2"><SaveBtn loading={configMutation.isPending} /></div>
          </form>
        )}

        {/* ── CORREO (per-user SMTP + IMAP) ── */}
        {tab === 'correo' && (
          <form onSubmit={handleUserConfigSave} className="p-6 space-y-6">
            {/* SMTP */}
            <div className="space-y-4">
              <SectionTitle><Mail className="w-4 h-4 text-brand-500" /> Envío (SMTP)</SectionTitle>
              <p className="text-xs text-gray-500 -mt-2">Configuración personal para enviar emails. Si no configuras nada se usará la configuración de empresa.</p>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Servidor SMTP" value={userConfig.smtpHost ?? ''} onChange={v => setUserConfig(c => ({ ...c, smtpHost: v }))} placeholder="smtp.gmail.com" />
                <Field label="Puerto" value={String(userConfig.smtpPort ?? '')} onChange={v => setUserConfig(c => ({ ...c, smtpPort: v ? Number(v) : undefined }))} type="number" placeholder="587" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Usuario" value={userConfig.smtpUser ?? ''} onChange={v => setUserConfig(c => ({ ...c, smtpUser: v }))} icon={<Mail className="w-3.5 h-3.5" />} />
                <Field label="Contraseña" value={userConfig.smtpPassword ?? ''} onChange={v => setUserConfig(c => ({ ...c, smtpPassword: v }))} type="password" icon={<Lock className="w-3.5 h-3.5" />} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Email remitente" value={userConfig.smtpFromEmail ?? ''} onChange={v => setUserConfig(c => ({ ...c, smtpFromEmail: v }))} type="email" placeholder="yo@midominio.es" />
                <div className="flex items-end pb-0.5">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={userConfig.smtpUseSsl ?? true} onChange={e => setUserConfig(c => ({ ...c, smtpUseSsl: e.target.checked }))}
                      className="rounded border-gray-300 text-brand-500 focus:ring-brand-400" />
                    <span className="text-sm text-gray-700">Usar SSL/TLS</span>
                  </label>
                </div>
              </div>
            </div>

            <hr className="border-gray-100" />

            {/* IMAP */}
            <div className="space-y-4">
              <SectionTitle><Inbox className="w-4 h-4 text-brand-500" /> Recepción (IMAP)</SectionTitle>
              <p className="text-xs text-gray-500 -mt-2">Configura IMAP para recibir y sincronizar tu bandeja de entrada en la aplicación.</p>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Servidor IMAP" value={userConfig.imapHost ?? ''} onChange={v => setUserConfig(c => ({ ...c, imapHost: v }))} placeholder="imap.gmail.com" />
                <Field label="Puerto" value={String(userConfig.imapPort ?? '')} onChange={v => setUserConfig(c => ({ ...c, imapPort: v ? Number(v) : undefined }))} type="number" placeholder="993" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Usuario IMAP" value={userConfig.imapUser ?? ''} onChange={v => setUserConfig(c => ({ ...c, imapUser: v }))} icon={<Mail className="w-3.5 h-3.5" />} placeholder="usuario@gmail.com" />
                <Field label="Contraseña IMAP" value={userConfig.imapPassword ?? ''} onChange={v => setUserConfig(c => ({ ...c, imapPassword: v }))} type="password" icon={<Lock className="w-3.5 h-3.5" />} />
              </div>
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={userConfig.imapUseSsl ?? true} onChange={e => setUserConfig(c => ({ ...c, imapUseSsl: e.target.checked }))}
                    className="rounded border-gray-300 text-brand-500 focus:ring-brand-400" />
                  <span className="text-sm text-gray-700">Usar SSL/TLS</span>
                </label>
              </div>

              <div className="rounded-xl border border-blue-100 bg-blue-50 p-3 text-xs text-blue-700">
                Para Gmail usa App Password (no la contraseña normal). Activa IMAP en Google Account → Seguridad → Contraseñas de aplicaciones.
              </div>
            </div>

            <hr className="border-gray-100" />

            {/* Actions */}
            <div className="flex items-center justify-between pt-1">
              <button type="button" disabled={sincronizarMutation.isPending} onClick={() => sincronizarMutation.mutate()}
                className="flex items-center gap-2 border border-gray-200 hover:bg-gray-50 disabled:opacity-60 text-gray-700 text-sm font-medium px-4 py-2.5 rounded-xl transition-colors">
                {sincronizarMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                Sincronizar bandeja de entrada
              </button>
              <SaveBtn loading={userConfigMutation.isPending} label="Guardar configuración" />
            </div>
          </form>
        )}

        {tab === 'ia' && canConfigureIa && (
          <form onSubmit={handleIaConfigSave} className="p-6 space-y-5">
            <SectionTitle><Bot className="w-4 h-4 text-brand-500" /> Configuración BuenaTierrAI</SectionTitle>
            <p className="text-xs text-gray-500 -mt-2">
              Estos valores se guardan en la configuración de empresa y tienen prioridad sobre el `.env`.
              Para Ollama local no se requiere API key.
            </p>

            <div className="flex items-end gap-3 flex-wrap">
              <button type="button" onClick={() => applyAiPreset('groq')} className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50">Preset Groq</button>
              <button type="button" onClick={() => applyAiPreset('openai')} className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50">Preset OpenAI</button>
              <button type="button" onClick={() => applyAiPreset('ollama')} className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50">Preset Ollama local</button>
              <button type="button" onClick={() => applyAiPreset('custom')} className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50">Mantener actual</button>
            </div>

            <div className="flex items-center gap-2">
              <input
                id="ia-enabled"
                type="checkbox"
                checked={config.buenatierrAI?.enabled ?? true}
                onChange={e => setConfig(c => ({
                  ...c,
                  buenatierrAI: {
                    ...(c.buenatierrAI ?? {}),
                    enabled: e.target.checked,
                  }
                }))}
                className="rounded border-gray-300 text-brand-500 focus:ring-brand-400"
              />
              <label htmlFor="ia-enabled" className="text-sm text-gray-700">BuenaTierrAI habilitada</label>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field
                label="Provider Base URL"
                value={config.buenatierrAI?.providerBaseUrl ?? ''}
                onChange={v => setConfig(c => ({
                  ...c,
                  buenatierrAI: {
                    ...(c.buenatierrAI ?? {}),
                    providerBaseUrl: v,
                  }
                }))}
                placeholder="https://api.groq.com/openai/v1 o http://localhost:11434/v1"
              />
              <Field
                label="Modelo"
                value={config.buenatierrAI?.model ?? ''}
                onChange={v => setConfig(c => ({
                  ...c,
                  buenatierrAI: {
                    ...(c.buenatierrAI ?? {}),
                    model: v,
                  }
                }))}
                placeholder="llama-3.3-70b-versatile / gpt-4o-mini / llama3.2"
              />
            </div>

            <Field
              label="API Key (vacía si Ollama local)"
              value={config.buenatierrAI?.apiKey ?? ''}
              onChange={v => setConfig(c => ({
                ...c,
                buenatierrAI: {
                  ...(c.buenatierrAI ?? {}),
                  apiKey: v,
                }
              }))}
              type="password"
              placeholder="gsk_... o sk-..."
            />

            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
              Recomendación: en instalaciones de cliente usa proveedor remoto (Groq/OpenAI) con API key propia,
              o proveedor local (Ollama) si el equipo tiene suficiente potencia y el modelo instalado.
            </div>

            <div className="flex justify-end pt-2"><SaveBtn loading={iaConfigMutation.isPending} /></div>
          </form>
        )}

        {/* ── TEMA ── */}
        {tab === 'tema' && canConfigureTema && (
          <form onSubmit={handleTemaSubmit} className="p-6 space-y-6">
            <div>
              <SectionTitle><Palette className="w-4 h-4 text-brand-500" /> Colores de la empresa</SectionTitle>
              <p className="text-xs text-gray-500 -mt-2">
                Personaliza los colores primario y secundario de la interfaz. Se aplican en botones, cabeceras, badges y navegación.
              </p>
            </div>

            {/* Selectores de color */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              {/* Color primario */}
              <div className="space-y-3">
                <label className="block text-xs font-semibold text-gray-600">Color primario</label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={isValidHex(temaForm.colorPrimario) ? temaForm.colorPrimario : '#c4541a'}
                    onChange={e => {
                      setTemaForm(f => ({ ...f, colorPrimario: e.target.value }))
                      applyTheme({ ...temaForm, colorPrimario: e.target.value })
                    }}
                    className="w-14 h-14 rounded-xl border-2 border-gray-200 cursor-pointer p-1 bg-white"
                    title="Color primario"
                  />
                  <div className="flex-1">
                    <input
                      type="text"
                      value={temaForm.colorPrimario}
                      onChange={e => {
                        const val = e.target.value.startsWith('#') ? e.target.value : '#' + e.target.value
                        setTemaForm(f => ({ ...f, colorPrimario: val }))
                        if (isValidHex(val)) applyTheme({ ...temaForm, colorPrimario: val })
                      }}
                      maxLength={7}
                      placeholder="#c4541a"
                      className={`w-full border rounded-xl px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 transition-colors ${
                        isValidHex(temaForm.colorPrimario)
                          ? 'border-gray-200 focus:ring-gray-300'
                          : 'border-red-300 bg-red-50 focus:ring-red-400/50'
                      }`}
                    />
                    <p className="text-xs text-gray-400 mt-1">Botones, cabecera, navegación activa</p>
                  </div>
                </div>
              </div>

              {/* Color secundario */}
              <div className="space-y-3">
                <label className="block text-xs font-semibold text-gray-600">Color secundario</label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={isValidHex(temaForm.colorSecundario) ? temaForm.colorSecundario : '#e0b355'}
                    onChange={e => {
                      setTemaForm(f => ({ ...f, colorSecundario: e.target.value }))
                      applyTheme({ ...temaForm, colorSecundario: e.target.value })
                    }}
                    className="w-14 h-14 rounded-xl border-2 border-gray-200 cursor-pointer p-1 bg-white"
                    title="Color secundario"
                  />
                  <div className="flex-1">
                    <input
                      type="text"
                      value={temaForm.colorSecundario}
                      onChange={e => {
                        const val = e.target.value.startsWith('#') ? e.target.value : '#' + e.target.value
                        setTemaForm(f => ({ ...f, colorSecundario: val }))
                        if (isValidHex(val)) applyTheme({ ...temaForm, colorSecundario: val })
                      }}
                      maxLength={7}
                      placeholder="#e0b355"
                      className={`w-full border rounded-xl px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 transition-colors ${
                        isValidHex(temaForm.colorSecundario)
                          ? 'border-gray-200 focus:ring-gray-300'
                          : 'border-red-300 bg-red-50 focus:ring-red-400/50'
                      }`}
                    />
                    <p className="text-xs text-gray-400 mt-1">Badges, acentos, etiquetas</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Vista previa */}
            <div className="rounded-2xl border border-gray-100 overflow-hidden">
              <div
                className="h-12 flex items-center px-5 gap-3"
                style={{ background: `linear-gradient(135deg, ${isValidHex(temaForm.colorPrimario) ? temaForm.colorPrimario : '#c4541a'}cc 0%, ${isValidHex(temaForm.colorPrimario) ? temaForm.colorPrimario : '#c4541a'} 100%)` }}
              >
                <span className="text-white font-bold text-sm">Vista previa — cabecera</span>
              </div>
              <div className="p-5 bg-white space-y-3">
                <div className="flex flex-wrap gap-2 items-center">
                  <span
                    className="inline-flex items-center gap-2 text-white text-sm font-semibold px-4 py-2 rounded-xl shadow-sm"
                    style={{ backgroundColor: isValidHex(temaForm.colorPrimario) ? temaForm.colorPrimario : '#c4541a' }}
                  >
                    <Save className="w-4 h-4" />
                    Guardar
                  </span>
                  <span className="inline-flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-xl border border-gray-200 bg-white text-gray-700">
                    Cancelar
                  </span>
                  <span
                    className="inline-flex items-center text-xs font-semibold px-2.5 py-0.5 rounded-full border"
                    style={{
                      backgroundColor: (isValidHex(temaForm.colorPrimario) ? temaForm.colorPrimario : '#c4541a') + '18',
                      color: isValidHex(temaForm.colorPrimario) ? temaForm.colorPrimario : '#c4541a',
                      borderColor: (isValidHex(temaForm.colorPrimario) ? temaForm.colorPrimario : '#c4541a') + '40',
                    }}
                  >
                    Activo
                  </span>
                  <span
                    className="inline-flex items-center text-xs font-semibold px-2.5 py-0.5 rounded-full border"
                    style={{
                      backgroundColor: (isValidHex(temaForm.colorSecundario) ? temaForm.colorSecundario : '#e0b355') + '22',
                      color: isValidHex(temaForm.colorSecundario) ? temaForm.colorSecundario : '#e0b355',
                      borderColor: (isValidHex(temaForm.colorSecundario) ? temaForm.colorSecundario : '#e0b355') + '60',
                    }}
                  >
                    Lote vigente
                  </span>
                </div>
                <p className="text-xs text-gray-400">Los cambios se aplican en tiempo real mientras editas.</p>
              </div>
            </div>

            {/* Paletas predefinidas */}
            <div>
              <p className="text-xs font-semibold text-gray-600 mb-2">Paletas predefinidas</p>
              <div className="flex flex-wrap gap-2">
                {([
                  { label: 'BuenaTierra',  p: '#c4541a', s: '#e0b355' },
                  { label: 'Azul marino',  p: '#1e3a8a', s: '#3b82f6' },
                  { label: 'Esmeralda',    p: '#065f46', s: '#34d399' },
                  { label: 'Vino',         p: '#7c1d41', s: '#f472b6' },
                  { label: 'Pizarra',      p: '#1e293b', s: '#64748b' },
                  { label: 'Índigo',       p: '#4338ca', s: '#818cf8' },
                  { label: 'Ámbar',        p: '#b45309', s: '#fbbf24' },
                  { label: 'Rosa',         p: '#9d174d', s: '#ec4899' },
                ] as const).map(preset => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => {
                      setTemaForm({ colorPrimario: preset.p, colorSecundario: preset.s })
                      applyTheme({ colorPrimario: preset.p, colorSecundario: preset.s })
                    }}
                    className="flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-lg border border-gray-200 hover:border-gray-300 bg-white hover:bg-gray-50 transition-colors"
                  >
                    <span className="flex gap-0.5">
                      <span className="w-3 h-3 rounded-full inline-block border border-white/50 shadow-sm" style={{ backgroundColor: preset.p }} />
                      <span className="w-3 h-3 rounded-full inline-block border border-white/50 shadow-sm" style={{ backgroundColor: preset.s }} />
                    </span>
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Acciones */}
            <div className="flex items-center justify-between pt-1 border-t border-gray-100">
              <button
                type="button"
                onClick={handleTemaReset}
                disabled={temaMutation.isPending}
                className="text-sm text-gray-500 hover:text-gray-700 font-medium px-3 py-2 rounded-xl hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                Restablecer colores BuenaTierra
              </button>
              <SaveBtn loading={temaMutation.isPending} label="Guardar colores" />
            </div>
          </form>
        )}

      </div>
    </div>
  )
}
