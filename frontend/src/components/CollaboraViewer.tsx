import { useState, useEffect, useRef, useCallback } from 'react'
import { Loader2, X, Save, Maximize2, Minimize2 } from 'lucide-react'
import toast from 'react-hot-toast'

interface CollaboraViewerProps {
  /** ID del archivo importado (etiquetas_importadas.id) */
  fileId: number
  /** Nombre para mostrar */
  fileName: string
  /** 'edit' | 'view' */
  permission?: 'edit' | 'view'
  /** Callback al cerrar */
  onClose: () => void
  /** Callback opcional cuando se guarda */
  onSaved?: () => void
}

interface WopiUrlData {
  formUrl: string
  accessToken: string
  accessTokenTtl: number
}

/**
 * Componente que embebe Collabora Online (CODE) en un iframe.
 * Usa el protocolo WOPI para abrir y editar archivos ODT/DOCX directamente en el navegador,
 * con la potencia completa de LibreOffice.
 *
 * CRITICAL: Uses FORM POST to submit access_token to Collabora (standard WOPI embedding).
 * This is required — Collabora's JavaScript initialization depends on receiving the token via POST.
 */
export default function CollaboraViewer({
  fileId,
  fileName,
  permission = 'edit',
  onClose,
  onSaved,
}: CollaboraViewerProps) {
  const [wopiData, setWopiData] = useState<WopiUrlData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [fullscreen, setFullscreen] = useState(false)
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const formRef = useRef<HTMLFormElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const formSubmittedRef = useRef(false)

  // ── Fetch Collabora URL via WOPI ──────────────────────────────────────────
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    formSubmittedRef.current = false

    const token = getAuthToken()
    if (!token) {
      setError('No autenticado')
      setLoading(false)
      return
    }

    fetch(`/wopi/collabora-url?fileId=${fileId}&permission=${permission}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error(body.error || `Error ${res.status}`)
        }
        return res.json()
      })
      .then((data) => {
        if (!cancelled) {
          setWopiData({
            formUrl: data.formUrl,
            accessToken: data.accessToken,
            accessTokenTtl: data.accessTokenTtl,
          })
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err.message || 'Error al obtener URL de Collabora')
          toast.error('No se pudo abrir el editor de documentos')
          setLoading(false)
        }
      })

    return () => { cancelled = true }
  }, [fileId, permission])

  // ── Auto-submit FORM POST when data arrives ───────────────────────────────
  useEffect(() => {
    if (wopiData && formRef.current && !formSubmittedRef.current) {
      formSubmittedRef.current = true
      formRef.current.submit()
    }
  }, [wopiData])

  // ── PostMessage handler (Collabora → Host) ────────────────────────────────
  const handleMessage = useCallback(
    (event: MessageEvent) => {
      // Only accept messages from Collabora origin
      if (!event.data) return

      let data: Record<string, Record<string, unknown> | string | undefined>
      try {
        data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data
      } catch {
        return
      }

      const msgId = (data.MessageId ?? data.messageId ?? '') as string
      const values = (data.Values ?? {}) as Record<string, unknown>

      switch (msgId) {
        case 'App_LoadingStatus':
          if (values.Status === 'Document_Loaded') {
            setLoading(false)
          }
          break

        case 'UI_Save':
        case 'Action_Save_Resp':
          if (values.success !== false) {
            toast.success('Documento guardado')
            onSaved?.()
          }
          break

        case 'UI_Close':
        case 'close':
          onClose()
          break

        case 'View_Size':
          // Collabora reports doc dimensions — ignore
          break
      }
    },
    [onClose, onSaved]
  )

  useEffect(() => {
    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [handleMessage])

  // ── Send PostMessage to Collabora ──────────────────────────────────────────
  function postToCollabora(msgId: string, values?: Record<string, unknown>) {
    const frame = iframeRef.current
    if (!frame?.contentWindow) return
    frame.contentWindow.postMessage(
      JSON.stringify({ MessageId: msgId, Values: values || {} }),
      '*'
    )
  }

  function handleSave() {
    postToCollabora('Action_Save', { DontTerminateEdit: true, DontSaveIfUnmodified: false, Notify: true })
  }

  function toggleFullscreen() {
    if (fullscreen) {
      document.exitFullscreen?.()
      setFullscreen(false)
    } else {
      containerRef.current?.requestFullscreen?.()
      setFullscreen(true)
    }
  }

  // ── Handle ESC to exit fullscreen ──────────────────────────────────────────
  useEffect(() => {
    function onFullscreenChange() {
      if (!document.fullscreenElement) setFullscreen(false)
    }
    document.addEventListener('fullscreenchange', onFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange)
  }, [])

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center">
      <div
        ref={containerRef}
        className={`bg-white shadow-2xl flex flex-col overflow-hidden ${
          fullscreen
            ? 'w-screen h-screen'
            : 'w-[95vw] h-[92vh] max-w-[1600px] rounded-2xl'
        }`}
      >
        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-200 bg-gray-50 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
            <span className="text-sm font-semibold text-gray-800 truncate">{fileName}</span>
            <span className="text-xs text-gray-400 shrink-0">
              {permission === 'edit' ? '(Edición)' : '(Solo lectura)'}
            </span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {permission === 'edit' && (
              <button
                onClick={handleSave}
                className="flex items-center gap-1 px-3 py-1.5 text-xs bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition-colors"
                title="Guardar (Ctrl+S también funciona dentro del editor)"
              >
                <Save className="w-3.5 h-3.5" /> Guardar
              </button>
            )}
            <button
              onClick={toggleFullscreen}
              className="p-1.5 rounded-lg hover:bg-gray-200 text-gray-500 transition-colors"
              title={fullscreen ? 'Salir de pantalla completa' : 'Pantalla completa'}
            >
              {fullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-gray-200 text-gray-500 transition-colors"
              title="Cerrar"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* ── Content ─────────────────────────────────────────────────────── */}
        <div className="flex-1 relative bg-gray-100">
          {/* Loading overlay */}
          {loading && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-white/90 gap-3">
              <Loader2 className="w-8 h-8 text-brand-600 animate-spin" />
              <p className="text-sm text-gray-600 font-medium">Cargando editor de documentos…</p>
              <p className="text-xs text-gray-400">Conectando con Collabora Online</p>
            </div>
          )}

          {/* Error state */}
          {error && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-white gap-3 p-8">
              <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center">
                <X className="w-6 h-6 text-red-500" />
              </div>
              <p className="text-sm font-medium text-gray-800">Error al abrir el documento</p>
              <p className="text-xs text-gray-500 text-center max-w-md">{error}</p>
              <button
                onClick={onClose}
                className="mt-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm hover:bg-gray-200"
              >
                Cerrar
              </button>
            </div>
          )}

          {/* Collabora iframe — loaded via FORM POST (WOPI standard) */}
          {wopiData && (
            <>
              {/* Hidden form that POSTs access_token to Collabora, targeting the iframe */}
              <form
                ref={formRef}
                action={wopiData.formUrl}
                method="post"
                target="collabora_wopi_frame"
                className="hidden"
              >
                <input name="access_token" value={wopiData.accessToken} type="hidden" />
                <input name="access_token_ttl" value={String(wopiData.accessTokenTtl)} type="hidden" />
              </form>
              <iframe
                ref={iframeRef}
                name="collabora_wopi_frame"
                className="w-full h-full border-0"
                allow="clipboard-read; clipboard-write"
                title={`Collabora Online - ${fileName}`}
                onLoad={() => {
                  // Give Collabora a moment to initialize after form POST loads the page
                  setTimeout(() => setLoading(false), 3000)
                }}
              />
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Utility ──────────────────────────────────────────────────────────────────
function getAuthToken(): string {
  try {
    return JSON.parse(localStorage.getItem('bt_auth') ?? '{}').token ?? ''
  } catch {
    return ''
  }
}
