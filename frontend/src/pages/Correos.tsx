import { useMemo, useState, useCallback } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api from '../lib/api'
import { Mail, Send, Save, Search, RefreshCw, AlertTriangle, Trash2, Paperclip, Download, Inbox } from 'lucide-react'
import toast from 'react-hot-toast'

type Folder = 'All' | 'Inbox' | 'Sent' | 'Drafts' | 'Errors'

interface CorreoResumen {
  id: number
  folder: Folder
  estado: string
  para: string
  asunto: string
  createdAt: string
  fechaEnvio: string | null
  error: string | null
  facturaId: number | null
  adjuntoNombre: string | null
  de: string | null
}

interface CorreoDetalle extends CorreoResumen {
  cc: string | null
  cco: string | null
  cuerpo: string
  adjuntoContentType: string | null
}

interface ComposeState {
  para: string
  cc: string
  cco: string
  asunto: string
  cuerpo: string
  facturaId: string
}

function getErrorMessage(error: unknown, fallback: string) {
  return (error as { response?: { data?: { message?: string } } })?.response?.data?.message ?? fallback
}

const EMPTY_COMPOSE: ComposeState = {
  para: '',
  cc: '',
  cco: '',
  asunto: '',
  cuerpo: '<p>Hola,</p><p>Adjunto documentación.</p><p>Un saludo.</p>',
  facturaId: '',
}

function fmtDateTime(value: string | null) {
  if (!value) return '—'
  return new Date(value).toLocaleString('es-ES')
}

export default function Correos() {
  const qc = useQueryClient()
  const [folder, setFolder] = useState<Folder>('All')
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [compose, setCompose] = useState<ComposeState>(EMPTY_COMPOSE)

  const { data: correos, isLoading, refetch } = useQuery({
    queryKey: ['correos', folder, search],
    queryFn: async () => {
      const params = new URLSearchParams()
      params.set('folder', folder)
      if (search.trim()) params.set('q', search.trim())
      const res = await api.get<{ data: CorreoResumen[] }>(`/correos?${params.toString()}`)
      return res.data.data
    },
  })

  const { data: selected } = useQuery({
    queryKey: ['correo', selectedId],
    queryFn: async () => {
      const res = await api.get<{ data: CorreoDetalle }>(`/correos/${selectedId}`)
      return res.data.data
    },
    enabled: selectedId !== null,
  })

  const guardarBorrador = useMutation({
    mutationFn: () => api.post('/correos/borrador', {
      para: compose.para,
      cc: compose.cc || null,
      cco: compose.cco || null,
      asunto: compose.asunto,
      cuerpo: compose.cuerpo,
      facturaId: compose.facturaId ? Number(compose.facturaId) : null,
    }),
    onSuccess: () => {
      toast.success('Borrador guardado')
      qc.invalidateQueries({ queryKey: ['correos'] })
      setFolder('Drafts')
    },
    onError: (e: unknown) => toast.error(getErrorMessage(e, 'Error al guardar borrador')),
  })

  const enviarCorreo = useMutation({
    mutationFn: () => api.post('/correos/enviar', {
      para: compose.para,
      cc: compose.cc || null,
      cco: compose.cco || null,
      asunto: compose.asunto,
      cuerpo: compose.cuerpo,
      facturaId: compose.facturaId ? Number(compose.facturaId) : null,
    }),
    onSuccess: () => {
      toast.success('Correo enviado')
      setCompose(EMPTY_COMPOSE)
      qc.invalidateQueries({ queryKey: ['correos'] })
      setFolder('Sent')
    },
    onError: (e: unknown) => toast.error(getErrorMessage(e, 'Error al enviar correo')),
  })

  const eliminarCorreo = useMutation({
    mutationFn: (id: number) => api.delete(`/correos/${id}`),
    onSuccess: () => {
      toast.success('Correo eliminado')
      setSelectedId(null)
      qc.invalidateQueries({ queryKey: ['correos'] })
    },
    onError: (e: unknown) => toast.error(getErrorMessage(e, 'Error al eliminar correo')),
  })

  const sincronizarMutation = useMutation({
    mutationFn: () => api.post('/correos/sincronizar'),
    onSuccess: (res) => {
      const d = (res.data as { data?: { nuevos?: number; errores?: number } }).data
      toast.success(`Sincronización: ${d?.nuevos ?? 0} nuevos${d?.errores ? `, ${d.errores} errores` : ''}`)
      qc.invalidateQueries({ queryKey: ['correos'] })
    },
    onError: (e: unknown) => toast.error(getErrorMessage(e, 'IMAP no configurado. Configúralo en Ajustes > Correo')),
  })

  const descargarAdjunto = useCallback(async (id: number, nombre: string) => {
    try {
      const res = await api.get(`/correos/${id}/adjunto`, { responseType: 'blob' })
      const url = window.URL.createObjectURL(res.data as Blob)
      const a = document.createElement('a')
      a.href = url
      a.download = nombre
      a.click()
      window.URL.revokeObjectURL(url)
    } catch {
      toast.error('Error al descargar adjunto')
    }
  }, [])

  const counts = useMemo(() => {
    const all = correos ?? []
    return {
      all: all.length,
      inbox: all.filter(c => c.folder === 'Inbox').length,
      sent: all.filter(c => c.folder === 'Sent').length,
      drafts: all.filter(c => c.folder === 'Drafts').length,
      errors: all.filter(c => c.folder === 'Errors').length,
    }
  }, [correos])

  return (
    <div className="p-6 h-[calc(100vh-64px)] flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Correo</h1>
          <p className="text-sm text-gray-500">Bandeja integrada: redactar, guardar borradores y enviar con SMTP</p>
        </div>
        <button onClick={() => refetch()} className="flex items-center gap-2 px-3 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">
          <RefreshCw className="w-4 h-4" /> Actualizar
        </button>
      </div>

      <div className="grid grid-cols-[220px_1fr_1fr] gap-4 flex-1 min-h-0">
        <div className="bg-white border border-gray-200 rounded-xl p-3 space-y-2">
          {([
            ['All', `Todos (${counts.all})`],
            ['Inbox', `Recibidos (${counts.inbox})`],
            ['Sent', `Enviados (${counts.sent})`],
            ['Drafts', `Borradores (${counts.drafts})`],
            ['Errors', `Errores (${counts.errors})`],
          ] as [Folder, string][]).map(([key, label]) => (
            <button
              key={key}
              onClick={() => { setFolder(key); setSelectedId(null) }}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium ${folder === key ? 'bg-brand-50 text-brand-700' : 'hover:bg-gray-50 text-gray-700'}`}
            >
              {label}
            </button>
          ))}
          <hr className="border-gray-100 my-1" />
          <button
            onClick={() => sincronizarMutation.mutate()}
            disabled={sincronizarMutation.isPending}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-60"
          >
            {sincronizarMutation.isPending ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Inbox className="w-3.5 h-3.5" />}
            Sincronizar IMAP
          </button>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl flex flex-col min-h-0">
          <div className="p-3 border-b border-gray-100">
            <div className="relative">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Buscar por remitente/destinatario, asunto o cuerpo"
                className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm"
              />
            </div>
          </div>
          <div className="overflow-y-auto flex-1">
            {isLoading ? (
              <div className="p-6 text-sm text-gray-400">Cargando correos...</div>
            ) : (correos ?? []).length === 0 ? (
              <div className="p-6 text-sm text-gray-400">No hay correos en esta carpeta</div>
            ) : (
              (correos ?? []).map(c => (
                <button
                  key={c.id}
                  onClick={() => setSelectedId(c.id)}
                  className={`w-full text-left px-4 py-3 border-b border-gray-100 hover:bg-gray-50 ${selectedId === c.id ? 'bg-brand-50' : ''}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs text-gray-500 truncate">
                      {c.folder === 'Inbox' ? `De: ${c.de ?? '—'}` : `Para: ${c.para}`}
                    </p>
                    <p className="text-[11px] text-gray-400 shrink-0">{fmtDateTime(c.fechaEnvio ?? c.createdAt)}</p>
                  </div>
                  <p className="text-sm font-semibold text-gray-900 truncate mt-0.5">{c.asunto}</p>
                  {c.adjuntoNombre && <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1"><Paperclip className="w-3 h-3" />{c.adjuntoNombre}</p>}
                  {c.error && <p className="text-xs text-red-600 mt-0.5 truncate">{c.error}</p>}
                </button>
              ))
            )}
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl flex flex-col min-h-0">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <p className="font-semibold text-gray-900 flex items-center gap-2"><Mail className="w-4 h-4" /> Redactar / Detalle</p>
            {selectedId && (
              <button
                onClick={() => {
                  if (!selectedId) return
                  if (!window.confirm('¿Eliminar este correo?')) return
                  eliminarCorreo.mutate(selectedId)
                }}
                className="text-xs text-red-600 hover:text-red-800 flex items-center gap-1"
              >
                <Trash2 className="w-3.5 h-3.5" /> Eliminar
              </button>
            )}
          </div>

          {selected ? (
            <div className="p-4 space-y-2 overflow-y-auto">
              {selected.folder === 'Inbox' && selected.de && (
                <p className="text-sm"><span className="text-gray-500">De:</span> {selected.de}</p>
              )}
              <p className="text-sm"><span className="text-gray-500">Para:</span> {selected.para}</p>
              <p className="text-sm"><span className="text-gray-500">Asunto:</span> {selected.asunto}</p>
              <p className="text-sm"><span className="text-gray-500">Estado:</span> {selected.estado}</p>
              <p className="text-sm"><span className="text-gray-500">Fecha:</span> {fmtDateTime(selected.fechaEnvio ?? selected.createdAt)}</p>
              {selected.adjuntoNombre && (
                <div className="flex items-center gap-2">
                  <Paperclip className="w-3.5 h-3.5 text-gray-500" />
                  <span className="text-sm text-gray-700">{selected.adjuntoNombre}</span>
                  <button
                    onClick={() => descargarAdjunto(selected.id, selected.adjuntoNombre!)}
                    className="flex items-center gap-1 text-xs text-brand-600 hover:text-brand-700 font-medium"
                  >
                    <Download className="w-3 h-3" /> Descargar
                  </button>
                </div>
              )}
              {selected.error && (
                <p className="text-sm text-red-600 flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" /> {selected.error}</p>
              )}
              <div className="mt-3 p-3 bg-gray-50 rounded-lg border border-gray-200 text-sm" dangerouslySetInnerHTML={{ __html: selected.cuerpo }} />
            </div>
          ) : (
            <div className="p-4 space-y-3 overflow-y-auto">
              <input value={compose.para} onChange={e => setCompose(v => ({ ...v, para: e.target.value }))} placeholder="Para (separa varios con coma)" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
              <div className="grid grid-cols-2 gap-2">
                <input value={compose.cc} onChange={e => setCompose(v => ({ ...v, cc: e.target.value }))} placeholder="CC" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                <input value={compose.cco} onChange={e => setCompose(v => ({ ...v, cco: e.target.value }))} placeholder="CCO" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
              </div>
              <input value={compose.asunto} onChange={e => setCompose(v => ({ ...v, asunto: e.target.value }))} placeholder="Asunto" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
              <input value={compose.facturaId} onChange={e => setCompose(v => ({ ...v, facturaId: e.target.value.replace(/\D/g, '') }))} placeholder="Factura ID (opcional, adjunta PDF)" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
              <textarea value={compose.cuerpo} onChange={e => setCompose(v => ({ ...v, cuerpo: e.target.value }))} rows={10} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono" />

              <div className="flex justify-end gap-2 pt-1">
                <button
                  onClick={() => guardarBorrador.mutate()}
                  disabled={guardarBorrador.isPending}
                  className="px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-1.5"
                >
                  <Save className="w-4 h-4" /> Guardar borrador
                </button>
                <button
                  onClick={() => enviarCorreo.mutate()}
                  disabled={enviarCorreo.isPending || !compose.para.trim() || !compose.asunto.trim()}
                  className="px-3 py-2 text-sm bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50 flex items-center gap-1.5"
                >
                  <Send className="w-4 h-4" /> Enviar
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
