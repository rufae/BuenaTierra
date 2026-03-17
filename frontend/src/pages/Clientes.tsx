import { useState, useMemo, useEffect, useRef, FormEvent } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../store/authStore'
import api from '../lib/api'
import type {
  Cliente, ClienteCondicionEspecial, UpsertCondicionEspecialDto,
  TipoCliente, FormaPago, TipoImpuesto, EstadoCliente, EstadoSincronizacion,
  TipoCondicionEspecial, TipoArticuloFamilia,
} from '../types'
import { Plus, Pencil, X, Loader2, Trash2, AlertCircle, Search, ChevronUp, ChevronDown, ChevronsUpDown, FilterX, History, Download, Info } from 'lucide-react'
import toast from 'react-hot-toast'
import Swal from 'sweetalert2'
import { DateInput } from '../components/DateInput'

// ── Constants ────────────────────────────────────────────────────────────────

// ── NIF / CIF / NIE validation ─────────────────────────────────────────────

function validateNif(nif: string): string | null {
  const LETRAS = 'TRWAGMYFPDXBNJZSQVHLCKE'
  const LETRAS_CIF = 'JABCDEFGHI'
  const v = nif.trim().toUpperCase()
  if (v.length < 2) return 'Demasiado corto'

  if ('XYZ'.includes(v[0])) {
    if (v.length !== 9) return 'NIE: debe tener 9 caracteres'
    if (!/^\d{7}$/.test(v.slice(1, 8))) return 'NIE: posiciones 2–8 deben ser dígitos'
    const prefix = v[0] === 'X' ? '0' : v[0] === 'Y' ? '1' : '2'
    const num = parseInt(prefix + v.slice(1, 8))
    if (v[8] !== LETRAS[num % 23]) return 'Letra de control NIE incorrecta'
    return null
  }

  if (/^\d/.test(v)) {
    if (v.length !== 9) return 'NIF: 8 dígitos + 1 letra (ej: 12345678Z)'
    if (!/^\d{8}/.test(v)) return 'NIF: primeros 8 caracteres deben ser dígitos'
    if (v[8] !== LETRAS[parseInt(v.slice(0, 8)) % 23]) return 'Letra de control NIF incorrecta'
    return null
  }

  if (/^[A-Z]/.test(v)) {
    if (v.length !== 9) return 'CIF: debe tener 9 caracteres'
    if (!/^\d{7}$/.test(v.slice(1, 8))) return 'CIF: posiciones 2–8 deben ser dígitos'
    let sumPar = 0
    for (let i = 2; i <= 6; i += 2) sumPar += parseInt(v[i])
    let sumImpar = 0
    for (let i = 1; i <= 7; i += 2) { const d = parseInt(v[i]) * 2; sumImpar += d > 9 ? d - 9 : d }
    const total = sumPar + sumImpar
    const dig = (10 - (total % 10)) % 10
    const soloLetra = 'KPQS'; const soloDigito = 'ABCDEFGHIJUV'
    if (soloLetra.includes(v[0])) {
      if (v[8] !== LETRAS_CIF[dig]) return 'Carácter de control CIF incorrecto'
    } else if (soloDigito.includes(v[0])) {
      if (v[8] !== String(dig)) return 'Dígito de control CIF incorrecto'
    } else {
      if (v[8] !== String(dig) && v[8] !== LETRAS_CIF[dig]) return 'Carácter de control CIF incorrecto'
    }
    return null
  }

  return 'Formato no reconocido (NIF: 8d+L, NIE: X/Y/Z+7d+L, CIF: L+7d+C)'
}

const TIPOS: TipoCliente[] = ['Empresa', 'Autonomo', 'Particular', 'Repartidor']
const FORMAS_PAGO: FormaPago[] = ['Contado', 'Transfer30', 'Transfer60', 'Transfer90', 'Domiciliacion', 'Cheque', 'Efectivo', 'Otro']
const TIPOS_IMPUESTO: TipoImpuesto[] = ['IVA', 'RecargoEquivalencia', 'Exento', 'IGIC']
const ESTADOS_CLIENTE: EstadoCliente[] = ['Activo', 'Inactivo', 'Suspendido', 'Bloqueado']
const ESTADOS_SYNC: EstadoSincronizacion[] = ['Sincronizado', 'Pendiente', 'Error', 'NoAplicable']
const TIPO_CONDICION: TipoCondicionEspecial[] = ['Precio', 'Descuento', 'PrecioEspecial']
const TIPO_ARTICULO_FAM: TipoArticuloFamilia[] = ['Articulo', 'Familia']

const TIPO_BADGE: Record<TipoCliente, string> = {
  Empresa: 'bg-blue-50 text-blue-700',
  Autonomo: 'bg-purple-50 text-purple-700',
  Particular: 'bg-gray-100 text-gray-600',
  Repartidor: 'bg-brand-50 text-brand-700',
}

const ESTADO_BADGE: Record<EstadoCliente, string> = {
  Activo: 'bg-green-50 text-green-700',
  Inactivo: 'bg-gray-100 text-gray-500',
  Suspendido: 'bg-yellow-50 text-yellow-700',
  Bloqueado: 'bg-red-50 text-red-700',
}

type FormState = Omit<Cliente, 'id' | 'condicionesEspeciales'>

const EMPTY: FormState = {
  empresaId: 0,
  tipo: 'Empresa',
  codigoClienteInterno: null,
  nombre: '',
  apellidos: null,
  razonSocial: null,
  nombreComercial: null,
  nombreFiscal: null,
  nif: null,
  aliasCliente: null,
  direccion: null,
  codigoPostal: null,
  ciudad: null,
  provincia: null,
  pais: null,
  telefono: null,
  telefono2: null,
  email: null,
  personaContacto: null,
  observacionesContacto: null,
  ccc: null,
  iban: null,
  banco: null,
  bic: null,
  formaPago: 'Contado',
  diasPago: 0,
  tipoImpuesto: 'IVA',
  aplicarImpuesto: true,
  recargoEquivalencia: false,
  noAplicarRetenciones: false,
  porcentajeRetencion: 0,
  descuentoGeneral: 0,
  tarifaId: null,
  estadoCliente: 'Activo',
  activo: true,
  fechaAlta: new Date().toISOString().split('T')[0],  // se establece en backend al crear
  estadoSincronizacion: 'NoAplicable',
  noRealizarFacturas: false,
  notas: null,
  repartidorEmpresaId: null,
}

const EMPTY_CONDICION: UpsertCondicionEspecialDto = {
  articuloFamilia: 'Articulo',
  codigo: '',
  descripcion: '',
  tipo: 'Precio',
  precio: 0,
  descuento: 0,
}

type Tab = 'general' | 'domicilio' | 'contacto' | 'comercial' | 'otros' | 'condiciones' | 'historial'

// ── Validación de formulario ─────────────────────────────────────────────────

type FormErrors = Partial<Record<string, string>>

function validateForm(form: FormState, clientesList: Cliente[], editingId?: number): FormErrors {
  const errs: FormErrors = {}

  if (!form.nombre.trim())
    errs.nombre = 'El nombre / razón social es obligatorio'

  if (form.nif?.trim()) {
    const nifNorm = form.nif.trim().toUpperCase()
    const dup = clientesList.find(
      c => c.nif?.toUpperCase() === nifNorm && c.id !== editingId
    )
    if (dup)
      errs.nif = `NIF/CIF ya registrado en: ${dup.razonSocial || dup.nombreComercial || dup.nombre}`
  }

  return errs
}

// ── Helpers ────────────────────────────────────────────────────────────────

function Input({ label, value, onChange, required, type = 'text', className = '', error }: {
  label: string; value: string; onChange: (v: string) => void; required?: boolean; type?: string; className?: string; error?: string
}) {
  return (
    <div className={className}>
      <label className="block text-xs font-medium text-gray-700 mb-1">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 ${
          error
            ? 'border-red-400 bg-red-50 focus:ring-red-400'
            : 'border-gray-300 focus:ring-brand-500'
        }`}
      />
      {error && (
        <p className="text-xs text-red-600 mt-1 flex items-center gap-1">
          <AlertCircle className="w-3 h-3 flex-shrink-0" />{error}
        </p>
      )}
    </div>
  )
}

function Select<T extends string>({ label, value, onChange, options, className = '' }: {
  label: string; value: T; onChange: (v: T) => void; options: T[]; className?: string
}) {
  return (
    <div className={className}>
      <label className="block text-xs font-medium text-gray-700 mb-1">{label}</label>
      <select
        value={value}
        onChange={e => onChange(e.target.value as T)}
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
      >
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  )
}

function CheckField({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer select-none">
      <input
        type="checkbox"
        checked={checked}
        onChange={e => onChange(e.target.checked)}
        className="w-4 h-4 rounded text-brand-600 focus:ring-brand-500"
      />
      <span className="text-sm text-gray-700">{label}</span>
    </label>
  )
}

// ── FilterDropdown ───────────────────────────────────────────────────────────

function FilterDropdown({
  value, onChange, options, placeholder,
}: {
  value: string
  onChange: (v: string) => void
  options: string[]
  placeholder: string
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onOutside)
    return () => document.removeEventListener('mousedown', onOutside)
  }, [])

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-brand-500 min-w-[155px]"
      >
        <span className="flex-1 text-left truncate">{value || placeholder}</span>
        <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 min-w-full overflow-hidden">
          <button
            type="button"
            onClick={() => { onChange(''); setOpen(false) }}
            className={`w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-brand-50 hover:text-brand-700 ${value === '' ? 'font-semibold bg-brand-50 text-brand-700' : ''}`}
          >
            {placeholder}
          </button>
          {options.map(opt => (
            <button
              key={opt}
              type="button"
              onClick={() => { onChange(opt); setOpen(false) }}
              className={`w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-brand-50 hover:text-brand-700 ${value === opt ? 'font-semibold bg-brand-50 text-brand-700' : ''}`}
            >
              {opt}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function Clientes() {
  const { user } = useAuth()
  const qc = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Cliente | null>(null)
  const [historialCliente, setHistorialCliente] = useState<Cliente | null>(null)
  const [form, setForm] = useState<FormState>({ ...EMPTY, empresaId: user!.empresaId })
  const [tab, setTab] = useState<Tab>('general')

  const [condicionForm, setCondicionForm] = useState<UpsertCondicionEspecialDto>({ ...EMPTY_CONDICION })
  const [editingCondicion, setEditingCondicion] = useState<ClienteCondicionEspecial | null>(null)
  const [showCondicionForm, setShowCondicionForm] = useState(false)
  const [errors, setErrors] = useState<FormErrors>({})

  // ── Queries ────────────────────────────────────────────────────────────────

  const { data: clientes, isLoading } = useQuery({
    queryKey: ['clientes', user?.empresaId],
    queryFn: async () => (await api.get<{ data: Cliente[] }>('/clientes')).data.data,
  })

  const { data: condiciones = [] } = useQuery({
    queryKey: ['condiciones', editing?.id],
    enabled: !!editing?.id && tab === 'condiciones',
    queryFn: async () => (await api.get<{ data: ClienteCondicionEspecial[] }>(`/clientes/${editing!.id}/condiciones`)).data.data,
  })

  const { data: histFacturas = [] } = useQuery<{
    id: number; numeroFactura: string; fechaFactura: string;
    fechaVencimiento: string | null; estado: string; total: number; esSimplificada: boolean
  }[]>({
    queryKey: ['cliente-facturas', historialCliente?.id],
    enabled: !!historialCliente?.id,
    queryFn: async () => (await api.get<{ data: unknown[] }>(`/clientes/${historialCliente!.id}/facturas`)).data.data as never,
  })

  const { data: histAlbaranes = [] } = useQuery<{
    id: number; numeroAlbaran: string; fechaAlbaran: string; estado: string; total: number
  }[]>({
    queryKey: ['cliente-albaranes', historialCliente?.id],
    enabled: !!historialCliente?.id,
    queryFn: async () => (await api.get<{ data: unknown[] }>(`/clientes/${historialCliente!.id}/albaranes`)).data.data as never,
  })

  const { data: histPedidos = [] } = useQuery<{
    id: number; numeroPedido: string; fecha: string; fechaEntrega: string | null; estado: string; total: number
  }[]>({
    queryKey: ['cliente-pedidos', historialCliente?.id],
    enabled: !!historialCliente?.id,
    queryFn: async () => (await api.get<{ data: unknown[] }>(`/clientes/${historialCliente!.id}/pedidos`)).data.data as never,
  })

  const { data: saldosPendientes = {} } = useQuery<Record<number, number>>({
    queryKey: ['clientes-saldos', user?.empresaId],
    queryFn: async () => (await api.get<{ data: Record<number, number> }>('/clientes/saldos-pendientes')).data.data,
    refetchInterval: 60_000,
  })

  // ── Filtros / paginación ──────────────────────────────────────────────────
  const [search, setSearch] = useState('')
  const [filterTipo, setFilterTipo] = useState<TipoCliente | ''>('')
  const [filterEstado, setFilterEstado] = useState<EstadoCliente | ''>('')
  const [sortField, setSortField] = useState<'nombre' | 'nif' | 'ciudad' | 'tipo' | 'estadoCliente'>('nombre')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [page, setPage] = useState(1)
  const PAGE_SIZE = 15

  const filtered = useMemo(() => {
    let list = clientes ?? []
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter(c =>
        [c.nombre, c.razonSocial, c.nombreComercial, c.nif, c.ciudad].some(
          v => v?.toLowerCase().includes(q)
        )
      )
    }
    if (filterTipo) list = list.filter(c => c.tipo === filterTipo)
    if (filterEstado) list = list.filter(c => c.estadoCliente === filterEstado)
    list = [...list].sort((a, b) => {
      const av = ((a as Record<string, unknown>)[sortField] ?? '') as string
      const bv = ((b as Record<string, unknown>)[sortField] ?? '') as string
      return sortDir === 'asc' ? av.localeCompare(bv, 'es') : bv.localeCompare(av, 'es')
    })
    return list
  }, [clientes, search, filterTipo, filterEstado, sortField, sortDir])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  useEffect(() => setPage(1), [search, filterTipo, filterEstado, sortField, sortDir])

  const hasFilters = search.trim() !== '' || filterTipo !== '' || filterEstado !== ''

  function SortIcon({ field }: { field: typeof sortField }) {
    if (sortField !== field) return <ChevronsUpDown className="w-3 h-3 ml-1 opacity-40" />
    return sortDir === 'asc'
      ? <ChevronUp className="w-3 h-3 ml-1 text-brand-600" />
      : <ChevronDown className="w-3 h-3 ml-1 text-brand-600" />
  }

  function toggleSort(field: typeof sortField) {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortField(field); setSortDir('asc') }
  }

  // ── Mutations ──────────────────────────────────────────────────────────────

  const createMutation = useMutation({
    mutationFn: (dto: FormState) => api.post('/clientes', dto),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['clientes'] }); toast.success('Cliente creado'); closeForm() },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: string; title?: string } } })?.response?.data?.error
        ?? (err as { response?: { data?: { title?: string } } })?.response?.data?.title
        ?? 'Error al crear cliente'
      toast.error(msg)
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, dto }: { id: number; dto: Omit<FormState, 'empresaId'> }) =>
      api.put(`/clientes/${id}`, dto),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['clientes'] }); toast.success('Cliente actualizado'); closeForm() },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: string; title?: string } } })?.response?.data?.error
        ?? (err as { response?: { data?: { title?: string } } })?.response?.data?.title
        ?? 'Error al actualizar cliente'
      toast.error(msg)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/clientes/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['clientes'] }); toast.success('Cliente desactivado') },
    onError: () => toast.error('Error al desactivar cliente'),
  })

  const addCondicionMutation = useMutation({
    mutationFn: (dto: UpsertCondicionEspecialDto) => api.post(`/clientes/${editing!.id}/condiciones`, dto),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['condiciones'] }); toast.success('Condición añadida'); setShowCondicionForm(false) },
    onError: () => toast.error('Error al añadir condición'),
  })

  const updateCondicionMutation = useMutation({
    mutationFn: ({ cid, dto }: { cid: number; dto: UpsertCondicionEspecialDto }) =>
      api.put(`/clientes/${editing!.id}/condiciones/${cid}`, dto),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['condiciones'] }); toast.success('Condición actualizada'); setShowCondicionForm(false) },
    onError: () => toast.error('Error al actualizar condición'),
  })

  const deleteCondicionMutation = useMutation({
    mutationFn: (cid: number) => api.delete(`/clientes/${editing!.id}/condiciones/${cid}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['condiciones'] }); toast.success('Condición eliminada') },
    onError: () => toast.error('Error al eliminar condición'),
  })

  // ── Helpers ────────────────────────────────────────────────────────────────

  function openNew() {
    setForm({ ...EMPTY, empresaId: user!.empresaId })
    setEditing(null); setErrors({}); setTab('general'); setShowForm(true)
  }

  function openEdit(c: Cliente) {
    const { condicionesEspeciales: _, ...rest } = { condicionesEspeciales: undefined, ...c }
    setForm({ ...EMPTY, ...rest })
    setEditing(c); setErrors({}); setTab('general'); setShowForm(true)
  }

  function closeForm() { setShowForm(false); setEditing(null); setErrors({}) }

  function s<K extends keyof FormState>(key: K, val: FormState[K]) {
    setForm(prev => ({ ...prev, [key]: val }))
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const errs = validateForm(form, clientes ?? [], editing?.id)
    if (Object.keys(errs).length > 0) {
      setErrors(errs)
      if (errs.nombre) setTab('general')
      else if (errs.nif) setTab('general')
      return
    }
    setErrors({})
    if (editing) {
      const { empresaId: _, ...dto } = form
      updateMutation.mutate({ id: editing.id, dto })
    } else {
      createMutation.mutate(form)
    }
  }

  function handleCondicionSubmit(e: FormEvent) {
    e.preventDefault()
    if (editingCondicion) updateCondicionMutation.mutate({ cid: editingCondicion.id, dto: condicionForm })
    else addCondicionMutation.mutate(condicionForm)
  }

  const busy = createMutation.isPending || updateMutation.isPending

  const TABS: { id: Tab; label: string }[] = [
    { id: 'general', label: 'General' },
    { id: 'domicilio', label: 'Domicilio' },
    { id: 'contacto', label: 'Contacto' },
    { id: 'comercial', label: 'Comercial' },
    { id: 'otros', label: 'Otros datos' },
    ...(editing ? [{ id: 'condiciones' as Tab, label: 'Condiciones' }] : []),
  ]

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Clientes</h1>
          <p className="text-gray-500 text-sm mt-0.5">Empresas, autónomos, particulares y repartidores</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={async () => {
              try {
                const res = await api.get('/clientes/exportar-excel', { responseType: 'blob' })
                const url = window.URL.createObjectURL(new Blob([res.data]))
                const link = document.createElement('a')
                link.href = url
                link.setAttribute('download', 'clientes.xlsx')
                document.body.appendChild(link)
                link.click()
                link.remove()
                window.URL.revokeObjectURL(url)
              } catch { toast.error('Error al exportar') }
            }}
            className="flex items-center gap-2 border border-green-300 text-green-700 hover:bg-green-50 text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            <Download className="w-4 h-4" />Exportar Excel
          </button>
          <button onClick={openNew} className="flex items-center gap-2 bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors">
            <Plus className="w-4 h-4" />Nuevo cliente
          </button>
        </div>
      </div>

      {/* Filter toolbar */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-3">
        <div className="flex flex-wrap items-center gap-2">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            <input
              type="text"
              placeholder="Buscar por nombre, NIF, ciudad..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          {/* Tipo filter */}
          <FilterDropdown
            value={filterTipo}
            onChange={v => setFilterTipo(v as TipoCliente | '')}
            options={[...TIPOS] as string[]}
            placeholder="Todos los tipos"
          />
          {/* Estado filter */}
          <FilterDropdown
            value={filterEstado}
            onChange={v => setFilterEstado(v as EstadoCliente | '')}
            options={[...ESTADOS_CLIENTE] as string[]}
            placeholder="Todos los estados"
          />
          {/* Clear filters */}
          {hasFilters && (
            <button
              onClick={() => { setSearch(''); setFilterTipo(''); setFilterEstado('') }}
              className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-500 hover:text-red-600 border border-gray-200 hover:border-red-300 rounded-lg transition-colors"
              title="Limpiar filtros"
            >
              <FilterX className="w-4 h-4" />
              Limpiar
            </button>
          )}
          {/* Results count */}
          <span className="ml-auto text-xs text-gray-400">
            {filtered.length} cliente{filtered.length !== 1 ? 's' : ''}
            {hasFilters && ` (de ${clientes?.length ?? 0} total)`}
          </span>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wider">
                <th className="px-5 py-3 text-left">
                  <button onClick={() => toggleSort('nombre')} className="flex items-center hover:text-gray-700 font-semibold">
                    Nombre / Razón Social<SortIcon field="nombre" />
                  </button>
                </th>
                <th className="px-5 py-3 text-left">
                  <button onClick={() => toggleSort('nif')} className="flex items-center hover:text-gray-700 font-semibold">
                    NIF<SortIcon field="nif" />
                  </button>
                </th>
                <th className="px-5 py-3 text-left">
                  <button onClick={() => toggleSort('tipo')} className="flex items-center hover:text-gray-700 font-semibold">
                    Tipo<SortIcon field="tipo" />
                  </button>
                </th>
                <th className="px-5 py-3 text-left">Email</th>
                <th className="px-5 py-3 text-left">Teléfono</th>
                <th className="px-5 py-3 text-left">
                  <button onClick={() => toggleSort('estadoCliente')} className="flex items-center hover:text-gray-700 font-semibold">
                    Estado<SortIcon field="estadoCliente" />
                  </button>
                </th>
                <th className="px-5 py-3 text-right">Saldo pend.</th>
                <th className="px-5 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {isLoading ? (
                <tr><td colSpan={8} className="px-5 py-8 text-center text-gray-400"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></td></tr>
              ) : !filtered.length ? (
                <tr><td colSpan={8} className="px-5 py-8 text-center text-gray-400">{hasFilters ? 'No hay clientes que coincidan con los filtros.' : 'Sin clientes. Crea el primero.'}</td></tr>
              ) : paginated.map((c) => (
                <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-3 font-medium text-gray-900">{c.razonSocial || c.nombreComercial || c.nombre}</td>
                  <td className="px-5 py-3 text-gray-500 font-mono text-xs">{c.nif ?? '—'}</td>
                  <td className="px-5 py-3">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${TIPO_BADGE[c.tipo]}`}>{c.tipo}</span>
                  </td>
                  <td className="px-5 py-3 text-gray-500">{c.email ?? '—'}</td>
                  <td className="px-5 py-3 text-gray-500">{c.telefono ?? '—'}</td>
                  <td className="px-5 py-3">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${ESTADO_BADGE[c.estadoCliente]}`}>{c.estadoCliente}</span>
                  </td>
                  <td className="px-5 py-3 text-right">
                    {(saldosPendientes[c.id] ?? 0) > 0 ? (
                      <span className="text-xs font-semibold text-red-600">{(saldosPendientes[c.id]).toFixed(2)} €</span>
                    ) : (
                      <span className="text-xs text-gray-400">0,00 €</span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-right flex justify-end gap-2">
                    <button onClick={() => setHistorialCliente(c)} className="text-gray-400 hover:text-brand-700 transition-colors" title="Ver historial">
                      <History className="w-4 h-4" />
                    </button>
                    <button onClick={() => openEdit(c)} className="text-gray-400 hover:text-brand-600 transition-colors" title="Editar">
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={async () => {
                        const result = await Swal.fire({
                          title: '¿Desactivar cliente?',
                          text: `"${c.razonSocial || c.nombreComercial || c.nombre}" pasará a inactivo.`,
                          icon: 'warning',
                          showCancelButton: true,
                          confirmButtonColor: '#ef4444',
                          cancelButtonColor: '#6b7280',
                          confirmButtonText: 'Sí, desactivar',
                          cancelButtonText: 'Cancelar',
                          reverseButtons: true,
                          focusCancel: true,
                        })
                        if (result.isConfirmed) deleteMutation.mutate(c.id)
                      }}
                      className="text-gray-400 hover:text-red-600 transition-colors" title="Desactivar"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100 bg-gray-50/50">
            <span className="text-xs text-gray-400">
              Mostrando {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} de {filtered.length}
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-2.5 py-1.5 text-xs font-medium border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-white transition-colors"
              >
                ← Anterior
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter(p => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
                .reduce<(number | '...')[]>((acc, p, idx, arr) => {
                  if (idx > 0 && typeof arr[idx - 1] === 'number' && (p as number) - (arr[idx - 1] as number) > 1) acc.push('...')
                  acc.push(p)
                  return acc
                }, [])
                .map((p, idx) =>
                  p === '...' ? (
                    <span key={`ellipsis-${idx}`} className="px-2 text-xs text-gray-400">…</span>
                  ) : (
                    <button
                      key={p}
                      onClick={() => setPage(p as number)}
                      className={`px-2.5 py-1.5 text-xs font-medium border rounded-lg transition-colors ${
                        page === p
                          ? 'bg-brand-500 text-white border-brand-500'
                          : 'border-gray-200 hover:bg-white'
                      }`}
                    >
                      {p}
                    </button>
                  )
                )
              }
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-2.5 py-1.5 text-xs font-medium border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-white transition-colors"
              >
                Siguiente →
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-start justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl my-8">
            {/* Modal header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="font-semibold text-gray-900">{editing ? 'Editar cliente' : 'Nuevo cliente'}</h2>
              <button onClick={closeForm} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 px-6 pt-4 border-b border-gray-100">
              {TABS.map(t => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`px-4 py-2 text-sm rounded-t-lg font-medium transition-colors ${tab === t.id ? 'bg-brand-50 text-brand-700 border-b-2 border-brand-500' : 'text-gray-500 hover:text-gray-700'}`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {tab === 'condiciones' ? null : (
              <form onSubmit={handleSubmit}>
                {/* ── Error summary ── */}
                {Object.keys(errors).length > 0 && (
                  <div className="mx-6 mt-4 rounded-lg border border-red-200 bg-red-50 p-3 flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-red-700">Corrige los siguientes errores:</p>
                      <ul className="mt-1 list-disc list-inside space-y-0.5">
                        {Object.values(errors).map((msg, i) => (
                          <li key={i} className="text-xs text-red-600">{msg}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}
                <div className="px-6 py-5">
                  {/* ── GENERAL ── */}
                  {tab === 'general' && (
                    <div className="grid grid-cols-2 gap-4">
                      <Select label="Tipo de cliente" value={form.tipo} onChange={v => s('tipo', v)} options={TIPOS} />

                      {/* Código interno: autogenerado en backend */}
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Código interno</label>
                        {editing
                          ? <div className="w-full border border-gray-200 bg-gray-50 rounded-lg px-3 py-2 text-sm font-mono text-gray-500">{editing.codigoClienteInterno ?? '—'}</div>
                          : <div className="w-full border border-dashed border-gray-300 bg-gray-50 rounded-lg px-3 py-2 text-sm text-gray-400 italic">Auto-generado al guardar</div>
                        }
                      </div>

                      <Input label="Nombre / Razón social" value={form.nombre} onChange={v => { s('nombre', v); if (v.trim()) setErrors(prev => { const e = { ...prev }; delete e.nombre; return e }) }} required className="col-span-2" error={errors.nombre} />
                      <Input label="Apellidos" value={form.apellidos ?? ''} onChange={v => s('apellidos', v || null)} />
                      <Input label="Razón social" value={form.razonSocial ?? ''} onChange={v => s('razonSocial', v || null)} />
                      <Input label="Nombre comercial" value={form.nombreComercial ?? ''} onChange={v => s('nombreComercial', v || null)} />
                      <Input label="Nombre fiscal" value={form.nombreFiscal ?? ''} onChange={v => s('nombreFiscal', v || null)} />

                      {/* NIF / CIF / DNI con validación + duplicado */}
                      <div>
                        {(() => {
                          const nifVal = form.nif ?? ''
                          const nifFormatError = nifVal.trim() ? validateNif(nifVal) : null
                          const dupError = errors.nif
                          const activeError = dupError || (nifFormatError ?? undefined)
                          const isValid = nifVal.trim() && !nifFormatError && !dupError
                          return (
                            <>
                              <label className="block text-xs font-medium text-gray-700 mb-1">NIF / CIF / DNI</label>
                              <input
                                value={nifVal}
                                onChange={e => {
                                  s('nif', e.target.value || null)
                                  // clear dup error on change
                                  if (errors.nif) setErrors(prev => { const x = { ...prev }; delete x.nif; return x })
                                }}
                                className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 ${
                                  isValid ? 'border-green-400 bg-green-50 focus:ring-green-400'
                                  : activeError ? 'border-red-400 bg-red-50 focus:ring-red-400'
                                  : 'border-gray-300 focus:ring-brand-500'
                                }`}
                              />
                              {activeError && (
                                <p className="text-xs text-red-600 mt-1 flex items-center gap-1">
                                  <AlertCircle className="w-3 h-3 flex-shrink-0" />{activeError}
                                </p>
                              )}
                              {isValid && <p className="text-xs text-green-600 mt-1">✓ Válido</p>}
                            </>
                          )
                        })()}
                      </div>

                      <Input label="Alias" value={form.aliasCliente ?? ''} onChange={v => s('aliasCliente', v || null)} />
                    </div>
                  )}

                  {/* ── DOMICILIO ── */}
                  {tab === 'domicilio' && (
                    <div className="grid grid-cols-2 gap-4">
                      <Input label="Dirección" value={form.direccion ?? ''} onChange={v => s('direccion', v || null)} className="col-span-2" />
                      <Input label="Código postal" value={form.codigoPostal ?? ''} onChange={v => s('codigoPostal', v || null)} />
                      <Input label="Ciudad / Población" value={form.ciudad ?? ''} onChange={v => s('ciudad', v || null)} />
                      <Input label="Provincia" value={form.provincia ?? ''} onChange={v => s('provincia', v || null)} />
                      <Input label="País" value={form.pais ?? ''} onChange={v => s('pais', v || null)} />
                    </div>
                  )}

                  {/* ── CONTACTO + BANCARIO ── */}
                  {tab === 'contacto' && (
                    <div className="space-y-6">
                      <div>
                        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Contacto</h3>
                        <div className="grid grid-cols-2 gap-4">
                          <Input label="Móvil / Teléfono" value={form.telefono ?? ''} onChange={v => s('telefono', v || null)} />
                          <Input label="Teléfono 2" value={form.telefono2 ?? ''} onChange={v => s('telefono2', v || null)} />
                          <Input label="Email" type="email" value={form.email ?? ''} onChange={v => s('email', v || null)} className="col-span-2" />
                          <Input label="Persona de contacto" value={form.personaContacto ?? ''} onChange={v => s('personaContacto', v || null)} className="col-span-2" />
                          <div className="col-span-2">
                            <label className="block text-xs font-medium text-gray-700 mb-1">Observaciones contacto</label>
                            <textarea
                              value={form.observacionesContacto ?? ''}
                              onChange={e => s('observacionesContacto', e.target.value || null)}
                              rows={2}
                              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                            />
                          </div>
                        </div>
                      </div>
                      <div>
                        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Datos Bancarios</h3>
                        <div className="grid grid-cols-2 gap-4">
                          <Input label="CCC" value={form.ccc ?? ''} onChange={v => s('ccc', v || null)} />
                          <Input label="IBAN" value={form.iban ?? ''} onChange={v => s('iban', v || null)} />
                          <Input label="Banco" value={form.banco ?? ''} onChange={v => s('banco', v || null)} />
                          <Input label="BIC / SWIFT" value={form.bic ?? ''} onChange={v => s('bic', v || null)} />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* ── COMERCIAL ── */}
                  {tab === 'comercial' && (
                    <div className="space-y-5">
                      <div className="grid grid-cols-2 gap-4">
                        <Select label="Forma de pago" value={form.formaPago} onChange={v => s('formaPago', v)} options={FORMAS_PAGO} />
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">Días de pago</label>
                          <input
                            type="number" min="0" step="1"
                            value={form.diasPago}
                            onChange={e => s('diasPago', parseInt(e.target.value) || 0)}
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                          />
                        </div>
                        <Select label="Tipo de impuesto" value={form.tipoImpuesto} onChange={v => s('tipoImpuesto', v)} options={TIPOS_IMPUESTO} />
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">Descuento general (%)</label>
                          <input
                            type="number" min="0" max="100" step="0.01"
                            value={form.descuentoGeneral}
                            onChange={e => s('descuentoGeneral', parseFloat(e.target.value) || 0)}
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">% Retención</label>
                          <input
                            type="number" min="0" max="100" step="0.01"
                            value={form.porcentajeRetencion}
                            onChange={e => s('porcentajeRetencion', parseFloat(e.target.value) || 0)}
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                          />
                        </div>
                      </div>
                      <div className="flex flex-col gap-3 pt-1">
                        <CheckField label="Aplicar impuesto al cliente" checked={form.aplicarImpuesto} onChange={v => s('aplicarImpuesto', v)} />
                        <CheckField label="Aplicar recargo de equivalencia" checked={form.recargoEquivalencia} onChange={v => s('recargoEquivalencia', v)} />
                        {form.recargoEquivalencia && (
                          <div className="flex items-start gap-1.5 mt-1 px-1 py-1 bg-amber-50 border border-amber-200 rounded text-xs text-amber-700">
                            <Info className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                            <span>El Recargo de Equivalencia se añadirá automáticamente a las facturas de este cliente según el % de IVA de cada producto (ej: IVA 21% → RE 5,2%, IVA 10% → RE 1,4%).</span>
                          </div>
                        )}
                        <CheckField label="No aplicar retenciones" checked={form.noAplicarRetenciones} onChange={v => s('noAplicarRetenciones', v)} />
                      </div>
                    </div>
                  )}

                  {/* ── OTROS ── */}
                  {tab === 'otros' && (
                    <div className="space-y-5">
                      <div className="grid grid-cols-2 gap-4">
                        <Select label="Estado del cliente" value={form.estadoCliente} onChange={v => s('estadoCliente', v)} options={ESTADOS_CLIENTE} />
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">Fecha de alta</label>
                          {editing ? (
                            <DateInput
                              value={form.fechaAlta ?? ''}
                              onChange={v => s('fechaAlta', v || null)}
                              className="w-full"
                            />
                          ) : (
                            <div className="w-full border border-dashed border-gray-300 bg-gray-50 rounded-lg px-3 py-2 text-sm text-gray-500">
                              {new Date().toLocaleDateString('es-ES')} <span className="text-xs text-gray-400 ml-1">(asignada automáticamente)</span>
                            </div>
                          )}
                        </div>
                        <Select label="Estado sincronización" value={form.estadoSincronizacion} onChange={v => s('estadoSincronizacion', v)} options={ESTADOS_SYNC} />
                      </div>
                      <div className="flex flex-col gap-3">
                        <CheckField label="Activo" checked={form.activo} onChange={v => s('activo', v)} />
                        <CheckField label="No realizar facturas a este cliente" checked={form.noRealizarFacturas} onChange={v => s('noRealizarFacturas', v)} />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Notas</label>
                        <textarea
                          value={form.notas ?? ''}
                          onChange={e => s('notas', e.target.value || null)}
                          rows={4}
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                        />
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100">
                  <button type="button" onClick={closeForm} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 border border-gray-200 rounded-lg transition-colors">
                    Cancelar
                  </button>
                  <button type="submit" disabled={busy} className="flex items-center gap-2 bg-brand-500 hover:bg-brand-600 disabled:opacity-60 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors">
                    {busy && <Loader2 className="w-4 h-4 animate-spin" />}
                    {editing ? 'Guardar cambios' : 'Crear cliente'}
                  </button>
                </div>
              </form>
            )}
            {tab === 'condiciones' && (
              /* ── CONDICIONES ESPECIALES TAB ── */
              <div className="px-6 py-5 space-y-4">
                <div className="flex justify-end">
                  <button
                    onClick={() => { setCondicionForm({ ...EMPTY_CONDICION }); setEditingCondicion(null); setShowCondicionForm(true) }}
                    className="flex items-center gap-2 bg-brand-500 hover:bg-brand-600 text-white text-xs font-semibold px-3 py-1.5 rounded-lg"
                  >
                    <Plus className="w-3.5 h-3.5" />Añadir condición
                  </button>
                </div>

                {showCondicionForm && (
                  <form onSubmit={handleCondicionSubmit} className="bg-gray-50 rounded-xl p-4 space-y-3 border border-gray-200">
                    <div className="grid grid-cols-3 gap-3">
                      <Select label="Art./Familia" value={condicionForm.articuloFamilia} onChange={v => setCondicionForm(p => ({ ...p, articuloFamilia: v }))} options={TIPO_ARTICULO_FAM} />
                      <Input label="Código *" value={condicionForm.codigo} onChange={v => setCondicionForm(p => ({ ...p, codigo: v }))} required />
                      <Input label="Descripción" value={condicionForm.descripcion ?? ''} onChange={v => setCondicionForm(p => ({ ...p, descripcion: v }))} />
                      <Select label="Tipo" value={condicionForm.tipo} onChange={v => setCondicionForm(p => ({ ...p, tipo: v }))} options={TIPO_CONDICION} />
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Precio</label>
                        <input type="number" step="0.01" min="0" value={condicionForm.precio}
                          onChange={e => {
                            const v = parseFloat(e.target.value) || 0
                            setCondicionForm(p => ({ ...p, precio: parseFloat(v.toFixed(2)) }))
                          }}
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Descuento (%)</label>
                        <input type="number" step="0.01" min="0" max="100" value={condicionForm.descuento}
                          onChange={e => setCondicionForm(p => ({ ...p, descuento: parseFloat(e.target.value) || 0 }))}
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
                      </div>
                    </div>
                    <div className="flex justify-end gap-2">
                      <button type="button" onClick={() => setShowCondicionForm(false)} className="text-sm text-gray-500 hover:text-gray-700 px-3 py-1.5 border border-gray-200 rounded-lg">
                        Cancelar
                      </button>
                      <button type="submit" className="bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold px-3 py-1.5 rounded-lg">
                        {editingCondicion ? 'Guardar' : 'Añadir'}
                      </button>
                    </div>
                  </form>
                )}

                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wider">
                      <th className="px-3 py-2 text-left">Art/Fam</th>
                      <th className="px-3 py-2 text-left">Código</th>
                      <th className="px-3 py-2 text-left">Descripción</th>
                      <th className="px-3 py-2 text-left">Tipo</th>
                      <th className="px-3 py-2 text-right">Precio</th>
                      <th className="px-3 py-2 text-right">Dto%</th>
                      <th className="px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {!condiciones.length ? (
                      <tr><td colSpan={7} className="px-3 py-4 text-center text-gray-400 text-xs">Sin condiciones especiales</td></tr>
                    ) : condiciones.map(c => (
                      <tr key={c.id} className="hover:bg-gray-50">
                        <td className="px-3 py-2 text-gray-600">{c.articuloFamilia}</td>
                        <td className="px-3 py-2 font-mono text-xs">{c.codigo}</td>
                        <td className="px-3 py-2 text-gray-500">{c.descripcion ?? '—'}</td>
                        <td className="px-3 py-2">{c.tipo}</td>
                        <td className="px-3 py-2 text-right">{c.precio.toFixed(2)} €</td>
                        <td className="px-3 py-2 text-right">{c.descuento.toFixed(2)}</td>
                        <td className="px-3 py-2 text-right flex justify-end gap-1">
                          <button onClick={() => {
                            setCondicionForm({ articuloFamilia: c.articuloFamilia, codigo: c.codigo, descripcion: c.descripcion ?? '', tipo: c.tipo, precio: c.precio, descuento: c.descuento })
                            setEditingCondicion(c); setShowCondicionForm(true)
                          }} className="text-gray-400 hover:text-brand-600"><Pencil className="w-3.5 h-3.5" /></button>
                          <button onClick={() => { if (confirm('¿Eliminar condición?')) deleteCondicionMutation.mutate(c.id) }}
                            className="text-gray-400 hover:text-red-600"><Trash2 className="w-3.5 h-3.5" /></button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
                  <button type="button" onClick={closeForm} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 border border-gray-200 rounded-lg transition-colors">
                    Cerrar
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Modal Historial ─────────────────────────────────────────────── */}
      {historialCliente && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-start justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl my-8">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div>
                <h2 className="font-semibold text-gray-900 flex items-center gap-2">
                  <History className="w-4 h-4 text-brand-600" />
                  Historial — {historialCliente.razonSocial || historialCliente.nombreComercial || historialCliente.nombre}
                </h2>
                {historialCliente.nif && <p className="text-xs text-gray-500 mt-0.5">NIF: {historialCliente.nif}</p>}
              </div>
              <button onClick={() => setHistorialCliente(null)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            <div className="px-6 py-5 space-y-6">
              <section>
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Facturas ({histFacturas.length})</h3>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wider">
                      <th className="px-3 py-2 text-left">Número</th>
                      <th className="px-3 py-2 text-left">Fecha</th>
                      <th className="px-3 py-2 text-left">Vto.</th>
                      <th className="px-3 py-2 text-left">Estado</th>
                      <th className="px-3 py-2 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {!histFacturas.length ? (
                      <tr><td colSpan={5} className="px-3 py-4 text-center text-gray-400 text-xs">No hay facturas</td></tr>
                    ) : histFacturas.map(f => (
                      <tr key={f.id} className="hover:bg-gray-50">
                        <td className="px-3 py-2 font-mono text-xs text-brand-700">{f.numeroFactura}</td>
                        <td className="px-3 py-2 text-gray-600">{new Date(f.fechaFactura).toLocaleDateString('es-ES')}</td>
                        <td className="px-3 py-2 text-gray-500">{f.fechaVencimiento ? new Date(f.fechaVencimiento).toLocaleDateString('es-ES') : '—'}</td>
                        <td className="px-3 py-2">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                            f.estado === 'Pagada' ? 'bg-green-100 text-green-700' :
                            f.estado === 'Pendiente' ? 'bg-amber-100 text-amber-700' :
                            'bg-gray-100 text-gray-600'
                          }`}>{f.estado}</span>
                        </td>
                        <td className="px-3 py-2 text-right font-semibold">{f.total.toFixed(2)} €</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>

              <section>
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Pedidos ({histPedidos.length})</h3>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wider">
                      <th className="px-3 py-2 text-left">Número</th>
                      <th className="px-3 py-2 text-left">Fecha</th>
                      <th className="px-3 py-2 text-left">Entrega</th>
                      <th className="px-3 py-2 text-left">Estado</th>
                      <th className="px-3 py-2 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {!histPedidos.length ? (
                      <tr><td colSpan={5} className="px-3 py-4 text-center text-gray-400 text-xs">No hay pedidos</td></tr>
                    ) : histPedidos.map(p => (
                      <tr key={p.id} className="hover:bg-gray-50">
                        <td className="px-3 py-2 font-mono text-xs text-brand-700">{p.numeroPedido}</td>
                        <td className="px-3 py-2 text-gray-600">{new Date(p.fecha).toLocaleDateString('es-ES')}</td>
                        <td className="px-3 py-2 text-gray-500">{p.fechaEntrega ? new Date(p.fechaEntrega).toLocaleDateString('es-ES') : '—'}</td>
                        <td className="px-3 py-2">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                            p.estado === 'Completado' ? 'bg-green-100 text-green-700' :
                            p.estado === 'Pendiente'  ? 'bg-amber-100 text-amber-700' :
                            p.estado === 'Cancelado'  ? 'bg-red-100 text-red-700' :
                            'bg-gray-100 text-gray-600'
                          }`}>{p.estado}</span>
                        </td>
                        <td className="px-3 py-2 text-right font-semibold">{p.total.toFixed(2)} €</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>

              <section>
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Albaranes ({histAlbaranes.length})</h3>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wider">
                      <th className="px-3 py-2 text-left">Número</th>
                      <th className="px-3 py-2 text-left">Fecha</th>
                      <th className="px-3 py-2 text-left">Estado</th>
                      <th className="px-3 py-2 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {!histAlbaranes.length ? (
                      <tr><td colSpan={4} className="px-3 py-4 text-center text-gray-400 text-xs">No hay albaranes</td></tr>
                    ) : histAlbaranes.map(a => (
                      <tr key={a.id} className="hover:bg-gray-50">
                        <td className="px-3 py-2 font-mono text-xs text-brand-700">{a.numeroAlbaran}</td>
                        <td className="px-3 py-2 text-gray-600">{new Date(a.fechaAlbaran).toLocaleDateString('es-ES')}</td>
                        <td className="px-3 py-2">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                            a.estado === 'Facturado' ? 'bg-green-100 text-green-700' :
                            a.estado === 'Pendiente' ? 'bg-amber-100 text-amber-700' :
                            'bg-gray-100 text-gray-600'
                          }`}>{a.estado}</span>
                        </td>
                        <td className="px-3 py-2 text-right font-semibold">{a.total.toFixed(2)} €</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>

              <div className="flex justify-end pt-2 border-t border-gray-100">
                <button type="button" onClick={() => setHistorialCliente(null)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 border border-gray-200 rounded-lg transition-colors">
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
