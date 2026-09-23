import { useEffect, useState } from 'react'
import api from './api'
import toast from 'react-hot-toast'

// ── Estado global de descarga (evento para no duplicar hooks por página) ─────
let downloading = false

function setDownloading(busy: boolean) {
  downloading = busy
  window.dispatchEvent(new CustomEvent('bt-download', { detail: busy }))
}

/** Suscribe el componente al estado global de descarga (spinner / disabled). */
export function useDownloading(): boolean {
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    const handler = (e: Event) => setBusy((e as CustomEvent).detail === true)
    window.addEventListener('bt-download', handler)
    return () => window.removeEventListener('bt-download', handler)
  }, [])
  return busy
}

/**
 * Descarga un blob del API (necesita token de autorización).
 * - Anti doble clic (ignora peticiones mientras hay una en curso).
 * - Si el backend devuelve error (blob JSON) muestra el mensaje real; si es 401, avisa.
 * - Revoca el objectURL de forma diferida (revocar al instante puede cortar la descarga).
 */
export async function downloadBlob(url: string, filename: string, fallbackError = 'Error al descargar el archivo'): Promise<void> {
  if (downloading) return
  setDownloading(true)
  try {
    const res = await api.get(url, { responseType: 'blob' })
    const blobUrl = window.URL.createObjectURL(new Blob([res.data]))
    const link = document.createElement('a')
    link.href = blobUrl
    link.setAttribute('download', filename)
    document.body.appendChild(link)
    link.click()
    link.remove()
    setTimeout(() => window.URL.revokeObjectURL(blobUrl), 1000)
  } catch (err: unknown) {
    const response = (err as { response?: { status?: number; data?: unknown } })?.response
    if (response?.status === 401) {
      toast.error('Sesión caducada, inicia sesión de nuevo')
      return
    }
    // El backend responde errores como blob JSON: intentar leer el mensaje real
    try {
      const data = response?.data
      if (data instanceof Blob) {
        const text = await data.text()
        const parsed = JSON.parse(text) as { errors?: string[]; message?: string }
        toast.error(parsed?.errors?.[0] ?? parsed?.message ?? fallbackError)
      } else {
        toast.error(fallbackError)
      }
    } catch {
      toast.error(fallbackError)
    }
  } finally {
    setDownloading(false)
  }
}
