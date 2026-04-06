import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import api from '../lib/api'
import { useQuery } from '@tanstack/react-query'
import { Loader2, RefreshCcw, Send, ShieldCheck, Sparkles, Wand2, MessageCircleMore, Plus, Trash2, X } from 'lucide-react'
import toast from 'react-hot-toast'

const QUICK_PROMPTS_STORAGE_KEY = 'buenatierra.ai.quickPrompts'
const CONTEXT_AUTO_REFRESH_MS = 120_000

const DEFAULT_QUICK_PROMPTS = [
  'Resumen de ventas de hoy y productos con mayor salida',
  'Detecta lotes cercanos a caducar y qué acción tomar',
  'Cómo creo un nuevo cliente paso a paso',
  'Cómo hago una factura con lotes automáticos',
  'Lista de alérgenos en mis ingredientes',
  'Qué pedidos tengo pendientes y cuál es la prioridad',
  'Explícame cómo funciona la trazabilidad',
  'Qué reportes necesito para sanidad esta semana',
]

type ChatRole = 'user' | 'assistant'

interface ChatMessage {
  role: ChatRole
  content: string
  createdAt?: string
}

interface AIStatus {
  enabled: boolean
  apiKeyConfigured: boolean
  apiKeyRequired: boolean
  model: string
  providerBaseUrl: string
  configurationValid: boolean
  warnings: string[]
}

interface AIContextResponse {
  generatedAtUtc: string
  source: string
  productos: unknown[]
  categorias: unknown[]
  ingredientesConAlergenos: unknown[]
  clientes: unknown[]
  stock: unknown[]
  pedidos: unknown[]
  facturas: unknown[]
  producciones: unknown[]
  warnings: string[]
}

interface AIChatResponse {
  answer: string
  model: string
  timestampUtc: string
  warnings: string[]
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (typeof error === 'object' && error !== null) {
    const maybeResponse = (error as { response?: { data?: { errors?: string[] } } }).response
    const msg = maybeResponse?.data?.errors?.[0]
    if (msg) return msg
  }
  return fallback
}

function loadQuickPromptsFromStorage(): string[] {
  try {
    const raw = localStorage.getItem(QUICK_PROMPTS_STORAGE_KEY)
    if (!raw) return DEFAULT_QUICK_PROMPTS

    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return DEFAULT_QUICK_PROMPTS

    const normalized = parsed
      .filter((p): p is string => typeof p === 'string')
      .map((p) => p.trim())
      .filter(Boolean)

    return normalized.length ? normalized : DEFAULT_QUICK_PROMPTS
  } catch {
    return DEFAULT_QUICK_PROMPTS
  }
}

function renderInline(text: string): ReactNode[] {
  const tokens = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter(Boolean)
  return tokens.map((token, i) => {
    if (token.startsWith('**') && token.endsWith('**')) {
      return <strong key={i} className="font-semibold text-earth-900">{token.slice(2, -2)}</strong>
    }

    if (token.startsWith('`') && token.endsWith('`')) {
      return (
        <code key={i} className="rounded-md bg-earth-900/95 px-1.5 py-0.5 text-[12px] text-cream-50">
          {token.slice(1, -1)}
        </code>
      )
    }

    return <span key={i}>{token}</span>
  })
}

function renderAssistantText(content: string): ReactNode {
  const lines = content.replace(/\r\n/g, '\n').split('\n')
  const blocks: ReactNode[] = []
  let listMode: 'ul' | 'ol' | null = null
  let items: string[] = []

  const flushList = () => {
    if (!listMode || items.length === 0) return

    if (listMode === 'ul') {
      blocks.push(
        <ul key={`ul-${blocks.length}`} className="list-disc space-y-1 pl-5 text-sm leading-6 text-earth-800">
          {items.map((it, i) => (
            <li key={i}>{renderInline(it)}</li>
          ))}
        </ul>
      )
    } else {
      blocks.push(
        <ol key={`ol-${blocks.length}`} className="list-decimal space-y-1 pl-5 text-sm leading-6 text-earth-800">
          {items.map((it, i) => (
            <li key={i}>{renderInline(it)}</li>
          ))}
        </ol>
      )
    }

    listMode = null
    items = []
  }

  for (const raw of lines) {
    const line = raw.trim()
    if (!line) {
      flushList()
      continue
    }

    const heading = line.match(/^#{1,3}\s+(.+)$/)
    if (heading) {
      flushList()
      blocks.push(
        <h4 key={`h-${blocks.length}`} className="pt-1 text-sm font-bold uppercase tracking-wide text-earth-900">
          {heading[1]}
        </h4>
      )
      continue
    }

    const ordered = line.match(/^\d+\.\s+(.+)$/)
    if (ordered) {
      if (listMode !== 'ol') {
        flushList()
        listMode = 'ol'
      }
      items.push(ordered[1])
      continue
    }

    const bullet = line.match(/^[-*]\s+(.+)$/)
    if (bullet) {
      if (listMode !== 'ul') {
        flushList()
        listMode = 'ul'
      }
      items.push(bullet[1])
      continue
    }

    flushList()
    blocks.push(
      <p key={`p-${blocks.length}`} className="text-sm leading-6 text-earth-800">
        {renderInline(line)}
      </p>
    )
  }

  flushList()
  return <div className="space-y-2">{blocks}</div>
}

export default function BuenaTierrAI() {
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [contextRefreshing, setContextRefreshing] = useState(false)
  const [quickPromptsOpen, setQuickPromptsOpen] = useState(false)
  const [newPrompt, setNewPrompt] = useState('')
  const [quickPrompts, setQuickPrompts] = useState<string[]>(() => loadQuickPromptsFromStorage())
  const [contextLoadedAt, setContextLoadedAt] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'assistant',
      content:
        '¡Hola! Soy BuenaTierrAI, tu asistente del obrador. Puedo ayudarte con:\n\n- **Consultar datos**: ventas, stock, lotes, clientes, productos, ingredientes y alérgenos\n- **Guiarte paso a paso**: crear clientes, hacer facturas, registrar producción\n- **Analizar**: detectar lotes a caducar, alertas de stock, reportes de sanidad\n- **Explicar**: cómo funciona cada sección de la aplicación\n\nPregúntame lo que necesites en lenguaje natural.'
    }
  ])

  const [toolContextJson, setToolContextJson] = useState('')
  const contextRefreshTimerRef = useRef<number | null>(null)
  const chatEndRef = useRef<HTMLDivElement | null>(null)

  const { data: status, refetch: refetchStatus, isFetching: checkingStatus } = useQuery({
    queryKey: ['buenatierr-ai-status'],
    queryFn: async () => (await api.get<{ data: AIStatus }>('/buenatierr-ai/status')).data.data,
    staleTime: 30_000,
    refetchInterval: 60_000,
  })

  const canChat = !!status?.enabled && !!status?.configurationValid && (!status?.apiKeyRequired || !!status?.apiKeyConfigured)

  const sanitizedHistory = useMemo(
    () => messages.filter((m) => m.role === 'assistant' || m.role === 'user').slice(-8),
    [messages]
  )

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages, busy])

  useEffect(() => {
    localStorage.setItem(QUICK_PROMPTS_STORAGE_KEY, JSON.stringify(quickPrompts))
  }, [quickPrompts])

  const fetchToolContext = useCallback(async (showToast: boolean): Promise<string> => {
    const res = await api.get<{ data: AIContextResponse }>('/buenatierr-ai/context')
    const safeContext = res.data?.data
    const json = JSON.stringify(safeContext)
    setToolContextJson(json)
    setContextLoadedAt(new Date().toISOString())

    if (showToast) {
      if (safeContext?.warnings?.length) {
        toast(() => (
          <div className="text-sm">
            <div className="font-semibold">Contexto IA cargado con avisos</div>
            <div>{safeContext.warnings.join(' | ')}</div>
          </div>
        ), { duration: 6000 })
      } else {
        toast.success('Contexto actualizado correctamente')
      }
    }

    return json
  }, [])

  const loadToolContext = useCallback(async (showToast = true) => {
    try {
      setContextRefreshing(true)
      await fetchToolContext(showToast)
    } catch (e: unknown) {
      const msg = getErrorMessage(e, 'No se pudo cargar contexto API para BuenaTierrAI')
      toast.error(msg)
    } finally {
      setContextRefreshing(false)
    }
  }, [fetchToolContext])

  const scheduleAutoContextRefresh = useCallback(() => {
    if (contextRefreshTimerRef.current !== null) {
      window.clearTimeout(contextRefreshTimerRef.current)
    }

    contextRefreshTimerRef.current = window.setTimeout(() => {
      void loadToolContext(false)
    }, CONTEXT_AUTO_REFRESH_MS)
  }, [loadToolContext])

  useEffect(() => {
    void loadToolContext(false)
    scheduleAutoContextRefresh()

    return () => {
      if (contextRefreshTimerRef.current !== null) {
        window.clearTimeout(contextRefreshTimerRef.current)
      }
    }
  }, [loadToolContext, scheduleAutoContextRefresh])

  useEffect(() => {
    if (!contextLoadedAt) return
    scheduleAutoContextRefresh()
  }, [contextLoadedAt, scheduleAutoContextRefresh])

  function addQuickPrompt() {
    const prompt = newPrompt.trim()
    if (!prompt) return
    if (quickPrompts.includes(prompt)) {
      toast.error('Esa pregunta ya existe en tus rápidas')
      return
    }
    setQuickPrompts((prev) => [...prev, prompt])
    setNewPrompt('')
  }

  function removeQuickPrompt(prompt: string) {
    setQuickPrompts((prev) => prev.filter((p) => p !== prompt))
  }

  function resetQuickPrompts() {
    setQuickPrompts(DEFAULT_QUICK_PROMPTS)
  }

  async function sendMessage() {
    if (!input.trim()) return
    if (!canChat) {
      toast.error('BuenaTierrAI no está operativa. Revisa estado/API key.')
      return
    }

    const userMessage: ChatMessage = { role: 'user', content: input.trim() }
    setMessages((prev) => [...prev, userMessage])
    setInput('')

    try {
      setBusy(true)
      let contextJson = toolContextJson
      if (!contextJson) {
        contextJson = await fetchToolContext(false)
      }

      const payload = {
        message: userMessage.content,
        history: sanitizedHistory,
        toolContextJson: contextJson || undefined
      }

      const res = await api.post<{ data: AIChatResponse }>('/buenatierr-ai/chat', payload)
      const answer = res.data.data.answer || 'No se recibió respuesta del modelo.'

      setMessages((prev) => [...prev, { role: 'assistant', content: answer, createdAt: res.data.data.timestampUtc }])
    } catch (e: unknown) {
      const msg = getErrorMessage(e, 'Error al consultar BuenaTierrAI')
      toast.error(msg)
      setMessages((prev) => [...prev, { role: 'assistant', content: 'No pude responder por un error de integración IA.' }])
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="relative flex h-[calc(100vh-7.5rem)] min-h-[520px] flex-col overflow-hidden rounded-3xl border border-cream-300 bg-gradient-to-br from-cream-50 via-white to-cream-100 p-4 shadow-warm-lg md:p-5">
      <div className="pointer-events-none absolute -left-8 -top-10 h-44 w-44 rounded-full bg-brand-300/20 blur-2xl" />
      <div className="pointer-events-none absolute -right-8 top-20 h-52 w-52 rounded-full bg-sage-300/20 blur-2xl" />
      <div className="relative flex min-h-0 flex-1 flex-col gap-4">
        <div className="shrink-0 rounded-2xl border border-cream-300 bg-white/90 p-4 backdrop-blur-sm md:p-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-2xl bg-brand-gradient text-white shadow-warm flex items-center justify-center">
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-earth-900">BuenaTierrAI</h1>
                <p className="text-sm text-earth-500">Asistente operativo con respuestas limpias y orientadas a acción</p>
              </div>
            </div>

            <button
              onClick={() => refetchStatus()}
              className="inline-flex items-center gap-2 rounded-xl border border-cream-300 bg-cream-50 px-3 py-2 text-sm font-medium text-earth-700 hover:bg-cream-100"
              disabled={checkingStatus}
            >
              {checkingStatus ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
              Refrescar estado
            </button>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3 text-sm">
            <div className="rounded-xl border border-cream-200 bg-cream-50 px-3 py-2">
              <div className="text-earth-500">Estado IA</div>
              <div className={canChat ? 'font-semibold text-emerald-700' : 'font-semibold text-red-700'}>
                {canChat ? 'Operativa' : 'No operativa'}
              </div>
            </div>
            <div className="rounded-xl border border-cream-200 bg-cream-50 px-3 py-2">
              <div className="text-earth-500">Modelo</div>
              <div className="font-semibold text-earth-900">{status?.model ?? 'No configurado'}</div>
            </div>
            <div className="rounded-xl border border-cream-200 bg-cream-50 px-3 py-2">
              <div className="text-earth-500">Contexto operativo</div>
              <div className="font-semibold text-earth-900">
                {toolContextJson ? 'Cargado' : 'Pendiente'}
                {contextLoadedAt ? ` (${new Date(contextLoadedAt).toLocaleTimeString()})` : ''}
              </div>
            </div>
          </div>

          {!!status?.warnings?.length && (
            <div className="mt-3 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              <div className="font-semibold">Avisos de configuración IA</div>
              <div>{status.warnings.join(' | ')}</div>
            </div>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-earth-500">
            <ShieldCheck className="h-4 w-4 text-emerald-600" />
            <span>Respuestas enfocadas en negocio.</span>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col rounded-2xl border border-cream-300 bg-white/90 p-4 backdrop-blur-sm shadow-warm-sm md:p-5">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setQuickPromptsOpen(true)}
              className="inline-flex items-center gap-2 rounded-xl border border-cream-300 bg-cream-50 px-3 py-2 text-xs font-semibold text-earth-700 hover:bg-cream-100"
            >
              <MessageCircleMore className="h-3.5 w-3.5" />
              Preguntas rápidas ({quickPrompts.length})
            </button>
            <button
              onClick={() => loadToolContext(true)}
              disabled={contextRefreshing}
              className="ml-auto inline-flex items-center gap-2 rounded-xl bg-brand-600 px-3 py-2 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
            >
              {contextRefreshing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
              Actualizar contexto
            </button>
          </div>

          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto rounded-2xl border border-cream-200 bg-gradient-to-b from-cream-50 to-white p-3 md:p-4">
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'assistant' ? 'justify-start' : 'justify-end'}`}>
                <div
                  className={`max-w-[88%] rounded-2xl px-4 py-3 text-sm shadow-sm ${
                    m.role === 'assistant'
                      ? 'border border-cream-200 bg-white text-earth-800'
                      : 'bg-brand-gradient text-white'
                  }`}
                >
                  {m.role === 'assistant' ? renderAssistantText(m.content) : <div className="whitespace-pre-wrap leading-6">{m.content}</div>}
                  {m.createdAt && (
                    <div className={`mt-2 text-[11px] ${m.role === 'assistant' ? 'text-earth-400' : 'text-white/80'}`}>
                      {new Date(m.createdAt).toLocaleString()}
                    </div>
                  )}
                </div>
              </div>
            ))}

            {busy && (
              <div className="flex justify-start">
                <div className="inline-flex items-center gap-2 rounded-2xl border border-cream-200 bg-white px-4 py-3 text-sm text-earth-600 shadow-sm">
                  <Loader2 className="h-4 w-4 animate-spin text-brand-600" />
                  Generando respuesta...
                </div>
              </div>
            )}

            <div ref={chatEndRef} />
          </div>

          <div className="mt-3 flex flex-col gap-2 md:mt-4 md:flex-row">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  if (input.trim() && !busy) sendMessage()
                }
              }}
              placeholder="Escribe una consulta (ej. Qué lotes vencen esta semana y qué acciones recomiendas) — Enter para enviar, Shift+Enter para salto de línea"
              className="min-h-[72px] max-h-[140px] flex-1 rounded-2xl border border-cream-300 bg-cream-50 px-4 py-3 text-sm text-earth-800 outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-400/40"
            />
            <button
              onClick={sendMessage}
              disabled={busy || !input.trim()}
              className="inline-flex h-fit items-center justify-center gap-2 rounded-2xl bg-earth-900 px-5 py-3 text-sm font-semibold text-white hover:bg-earth-800 disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Enviar
            </button>
          </div>
        </div>
      </div>

      {quickPromptsOpen && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-earth-900/35 p-4">
          <div className="w-full max-w-2xl rounded-2xl border border-cream-300 bg-white shadow-warm-lg">
            <div className="flex items-center justify-between border-b border-cream-200 px-4 py-3">
              <h2 className="text-sm font-bold text-earth-900">Preguntas rápidas</h2>
              <button
                type="button"
                onClick={() => setQuickPromptsOpen(false)}
                className="rounded-lg p-1 text-earth-500 hover:bg-cream-100 hover:text-earth-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3 px-4 py-4">
              <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
                {quickPrompts.map((prompt) => (
                  <div key={prompt} className="flex items-center gap-2 rounded-xl border border-cream-200 bg-cream-50 px-3 py-2">
                    <button
                      type="button"
                      onClick={() => {
                        setInput(prompt)
                        setQuickPromptsOpen(false)
                      }}
                      className="flex-1 text-left text-sm text-earth-800 hover:text-brand-700"
                    >
                      {prompt}
                    </button>
                    <button
                      type="button"
                      onClick={() => removeQuickPrompt(prompt)}
                      className="rounded-lg p-1 text-earth-500 hover:bg-white hover:text-red-600"
                      title="Eliminar"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>

              <div className="flex flex-col gap-2 md:flex-row">
                <input
                  value={newPrompt}
                  onChange={(e) => setNewPrompt(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      addQuickPrompt()
                    }
                  }}
                  placeholder="Añadir nueva pregunta recurrente"
                  className="flex-1 rounded-xl border border-cream-300 bg-cream-50 px-3 py-2 text-sm text-earth-800 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-400/30"
                />
                <button
                  type="button"
                  onClick={addQuickPrompt}
                  className="inline-flex items-center justify-center gap-1 rounded-xl bg-earth-900 px-3 py-2 text-sm font-semibold text-white hover:bg-earth-800"
                >
                  <Plus className="h-4 w-4" />
                  Añadir
                </button>
              </div>

              <div className="flex items-center justify-between text-xs text-earth-500">
                <span>Se guardan automáticamente en este equipo (modo local).</span>
                <button
                  type="button"
                  onClick={resetQuickPrompts}
                  className="rounded-lg border border-cream-300 bg-cream-50 px-2 py-1 hover:bg-cream-100"
                >
                  Restaurar sugeridas
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
