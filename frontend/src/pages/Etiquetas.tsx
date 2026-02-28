import { useState, useMemo, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Plus, Edit2, Trash2, Search, X, Save, Loader2,
  Printer, Upload, Eye, Tag,
  Settings2, Download, FileText, Wand2,
} from 'lucide-react'
import toast from 'react-hot-toast'
import Swal from 'sweetalert2'
import api from '../lib/api'
import LabelEditor from '../components/LabelEditor'
import CollaboraViewer from '../components/CollaboraViewer'
import '../styles/label-editor.css'
import type {
  PlantillaEtiqueta, EtiquetaImportada, TrabajoImpresion,
  TipoIvaRe, Producto, Lote, EtiquetaPreview,
  CreatePlantillaDto, ImprimirEtiquetaDto,
} from '../types'

// ── Types ─────────────────────────────────────────────────────────────────────
type Tab = 'plantillas' | 'importadas' | 'generar' | 'impresion' | 'iva-re'

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`
}

function formatDate(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function formatDateShort(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

const IMPRESORA_LABELS: Record<string, string> = {
  A4: 'A4 (hoja)',
  TermicaDirecta: 'Térmica directa',
  TermicaTransferencia: 'Térmica transferencia',
}

const FORMAT_COLORS: Record<string, string> = {
  Pdf: 'bg-red-100 text-red-700',
  Png: 'bg-blue-100 text-blue-700',
  Jpg: 'bg-amber-100 text-amber-700',
  Odt: 'bg-cyan-100 text-cyan-700',
  Docx: 'bg-indigo-100 text-indigo-700',
}

function getAuthToken(): string {
  try { return JSON.parse(localStorage.getItem('bt_auth') ?? '{}').token ?? '' }
  catch { return '' }
}

/**
 * Replace {{template.fields}} in HTML content with actual data from preview API.
 */
function replaceTemplateFields(html: string, preview: EtiquetaPreview): string {
  if (!html) return ''

  const fields: Record<string, string> = {}

  if (preview.producto) {
    const p = preview.producto
    fields['producto.nombre'] = p.nombre ?? ''
    fields['producto.codigo'] = p.codigo ?? ''
    fields['producto.codigoBarras'] = p.codigoBarras ?? ''
    fields['producto.precioVenta'] = p.precioVenta != null ? `${Number(p.precioVenta).toFixed(2)} €` : ''
    fields['producto.pesoUnitarioGr'] = p.pesoUnitarioGr != null ? `${p.pesoUnitarioGr}` : ''
    fields['producto.unidadMedida'] = p.unidadMedida ?? ''
    fields['producto.ingredientesTexto'] = p.ingredientesTexto ?? ''
    fields['producto.trazas'] = p.trazas ?? ''
    fields['producto.conservacion'] = p.conservacion ?? ''
    fields['producto.valorEnergeticoKj'] = p.valorEnergeticoKj?.toString() ?? ''
    fields['producto.valorEnergeticoKcal'] = p.valorEnergeticoKcal?.toString() ?? ''
    fields['producto.grasas'] = p.grasas?.toString() ?? ''
    fields['producto.grasasSaturadas'] = p.grasasSaturadas?.toString() ?? ''
    fields['producto.hidratosCarbono'] = p.hidratosCarbono?.toString() ?? ''
    fields['producto.azucares'] = p.azucares?.toString() ?? ''
    fields['producto.proteinas'] = p.proteinas?.toString() ?? ''
    fields['producto.sal'] = p.sal?.toString() ?? ''
  }

  if (preview.lote) {
    const l = preview.lote
    fields['lote.codigoLote'] = l.codigoLote ?? ''
    fields['lote.fechaFabricacion'] = l.fechaFabricacion ? formatDateShort(l.fechaFabricacion) : ''
    fields['lote.fechaCaducidad'] = l.fechaCaducidad ? formatDateShort(l.fechaCaducidad) : ''
  }

  // Barcode image placeholder
  if (preview.producto?.codigoBarras) {
    fields['producto.barcode_img'] = `/api/etiquetas/barcode/${preview.producto.id}`
  }

  // Empresa data from API (or fallback)
  if (preview.empresa) {
    fields['empresa.nombre'] = preview.empresa.nombre ?? ''
    fields['empresa.cif'] = preview.empresa.cif ?? ''
    fields['empresa.direccion'] = preview.empresa.direccion ?? ''
    fields['empresa.nrgs'] = preview.empresa.nrgs ?? ''
  } else {
    fields['empresa.nombre'] = ''
    fields['empresa.cif'] = ''
    fields['empresa.direccion'] = ''
    fields['empresa.nrgs'] = ''
  }

  let result = html
  for (const [field, value] of Object.entries(fields)) {
    const escaped = field.replace(/\./g, '\\.')
    // Special handling: barcode_img is used in <img src="{{producto.barcode_img}}">
    if (field === 'producto.barcode_img' && value) {
      result = result.replace(new RegExp(`\\{\\{${escaped}\\}\\}`, 'g'), value)
    } else {
      result = result.replace(new RegExp(`\\{\\{${escaped}\\}\\}`, 'g'), value || `[${field}]`)
    }
  }

  return result
}

/**
 * Open a print window with rendered label HTML.
 */
function printLabel(html: string, widthMm: number, heightMm: number) {
  const printWindow = window.open('', '_blank', 'width=800,height=600')
  if (!printWindow) { toast.error('No se pudo abrir ventana de impresión'); return }

  printWindow.document.write(`<!DOCTYPE html>
<html><head>
<title>Imprimir Etiqueta</title>
<style>
  @page { size: ${widthMm}mm ${heightMm}mm; margin: 0; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, sans-serif; }
  .label { width: ${widthMm}mm; min-height: ${heightMm}mm; padding: 2mm; }
  table { border-collapse: collapse; width: 100%; }
  td, th { border: 1px solid #000; padding: 2px 4px; font-size: 8pt; }
  .template-field { font-weight: bold; }
  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
</style>
</head><body>
<div class="label">${html}</div>
<script>
  window.onload = function() { window.print(); window.onafterprint = function() { window.close(); }; };
</' + 'script>
</body></html>`)
  printWindow.document.close()
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ══════════════════════════════════════════════════════════════════════════════

export default function Etiquetas() {
  const [tab, setTab] = useState<Tab>('plantillas')

  return (
    <div className="flex flex-col flex-1 overflow-y-auto bg-cream-100">
      {/* Header */}
      <div className="bg-cream-50 border-b border-cream-200 px-6 py-4 shrink-0">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Tag className="w-5 h-5 text-brand-600" /> Etiquetas
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Plantillas de etiquetas · Importación · Cola de impresión · IVA / RE
          </p>
        </div>
        <div className="flex gap-1 mt-4 mb-[-1px]">
          {([
            { id: 'plantillas', label: 'Plantillas' },
            { id: 'importadas', label: 'Importar' },
            { id: 'generar', label: '🖨️ Generar' },
            { id: 'impresion', label: 'Cola de impresión' },
            { id: 'iva-re', label: 'IVA / RE' },
          ] as const).map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-2 text-sm font-medium rounded-t-lg border-b-2 transition-colors ${
                tab === t.id
                  ? 'border-brand-600 text-brand-700 bg-white'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-cream-200'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 p-6">
        {tab === 'plantillas' && <PlantillasTab />}
        {tab === 'importadas' && <ImportadasTab />}
        {tab === 'generar' && <GenerarTab />}
        {tab === 'impresion' && <ImpresionTab />}
        {tab === 'iva-re' && <IvaReTab />}
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB: PLANTILLAS (includes imported files section)
// ══════════════════════════════════════════════════════════════════════════════

function PlantillasTab() {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [editando, setEditando] = useState<PlantillaEtiqueta | null>(null)
  const [creando, setCreando] = useState(false)
  const [previewId, setPreviewId] = useState<number | null>(null)

  // Imported file preview
  const [importPreviewUrl, setImportPreviewUrl] = useState<string | null>(null)
  const [importPreviewName, setImportPreviewName] = useState('')
  const [importPreviewFormat, setImportPreviewFormat] = useState('')

  const { data: plantillas = [], isLoading } = useQuery({
    queryKey: ['etiquetas', 'plantillas'],
    queryFn: async () => {
      const { data } = await api.get('/etiquetas/plantillas')
      return data.data as PlantillaEtiqueta[]
    },
  })

  const { data: importadas = [] } = useQuery({
    queryKey: ['etiquetas', 'importadas'],
    queryFn: async () => {
      const { data } = await api.get('/etiquetas/importadas')
      return data.data as EtiquetaImportada[]
    },
  })

  const deleteMut = useMutation({
    mutationFn: (id: number) => api.delete(`/etiquetas/plantillas/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['etiquetas'] }); toast.success('Plantilla eliminada') },
    onError: () => toast.error('Error al eliminar'),
  })

  const deleteImportMut = useMutation({
    mutationFn: (id: number) => api.delete(`/etiquetas/importadas/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['etiquetas'] }); toast.success('Eliminada') },
    onError: () => toast.error('Error al eliminar'),
  })

  const filtered = useMemo(() => {
    if (!search.trim()) return plantillas
    const s = search.toLowerCase()
    return plantillas.filter(p => p.nombre.toLowerCase().includes(s))
  }, [plantillas, search])

  const filteredImports = useMemo(() => {
    if (!search.trim()) return importadas
    const s = search.toLowerCase()
    return importadas.filter(e => e.nombre.toLowerCase().includes(s))
  }, [importadas, search])

  function handleImportPreview(id: number, nombre: string, formato: string) {
    const viewable = ['Pdf', 'Png', 'Jpg'].includes(formato)
    if (!viewable) {
      // ODT/DOCX: show SweetAlert with download option instead of silent toast
      Swal.fire({
        title: `Vista previa no disponible`,
        html: `<p class="text-sm text-gray-600">Los archivos <b>.${formato.toLowerCase()}</b> no se pueden visualizar en el navegador.</p>
               <p class="text-sm text-gray-500 mt-2">Descargue el archivo para abrirlo con LibreOffice o Microsoft Word.</p>`,
        icon: 'info',
        showCancelButton: true,
        confirmButtonText: '📥 Descargar archivo',
        cancelButtonText: 'Cancelar',
        confirmButtonColor: '#c2410c',
      }).then(r => {
        if (r.isConfirmed) handleImportDownload(id, `${nombre}.${formato.toLowerCase()}`)
      })
      return
    }
    fetch(`/api/etiquetas/importadas/${id}/descargar`, {
      headers: { Authorization: `Bearer ${getAuthToken()}` },
    })
      .then(r => r.blob())
      .then(blob => {
        const url = URL.createObjectURL(blob)
        setImportPreviewUrl(url)
        setImportPreviewName(nombre)
        setImportPreviewFormat(formato)
      })
      .catch(() => toast.error('Error al previsualizar'))
  }

  function handleImportDownload(id: number, filename: string) {
    fetch(`/api/etiquetas/importadas/${id}/descargar`, {
      headers: { Authorization: `Bearer ${getAuthToken()}` },
    })
      .then(r => r.blob())
      .then(blob => {
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = filename
        a.click()
        URL.revokeObjectURL(url)
      })
      .catch(() => toast.error('Error al descargar'))
  }

  function handleImportPrint(id: number, formato: string) {
    if (formato !== 'Pdf' && formato !== 'Png' && formato !== 'Jpg') {
      toast.error('Solo se pueden imprimir archivos PDF, PNG o JPG directamente')
      return
    }
    fetch(`/api/etiquetas/importadas/${id}/descargar`, {
      headers: { Authorization: `Bearer ${getAuthToken()}` },
    })
      .then(r => r.blob())
      .then(blob => {
        const url = URL.createObjectURL(blob)
        const printWindow = window.open(url, '_blank')
        if (printWindow) {
          printWindow.onload = () => printWindow.print()
        } else {
          toast.error('No se pudo abrir ventana de impresión')
          URL.revokeObjectURL(url)
        }
      })
      .catch(() => toast.error('Error al imprimir'))
  }

  if (creando || editando) {
    return (
      <PlantillaForm
        plantilla={editando}
        onClose={() => { setCreando(false); setEditando(null) }}
      />
    )
  }

  if (previewId !== null) {
    return <PlantillaPreview plantillaId={previewId} onClose={() => setPreviewId(null)} />
  }

  return (
    <div className="space-y-6">
      {/* Imported file preview modal */}
      {importPreviewUrl && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-6">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 bg-gray-50">
              <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
                <FileText className="w-4 h-4" />
                {importPreviewName}
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${FORMAT_COLORS[importPreviewFormat] ?? 'bg-gray-100 text-gray-700'}`}>
                  {importPreviewFormat}
                </span>
              </h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    const printWin = window.open(importPreviewUrl, '_blank')
                    if (printWin) printWin.onload = () => printWin.print()
                  }}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs bg-brand-600 text-white rounded-lg hover:bg-brand-700"
                >
                  <Printer className="w-3.5 h-3.5" /> Imprimir
                </button>
                <button
                  onClick={() => { URL.revokeObjectURL(importPreviewUrl); setImportPreviewUrl(null) }}
                  className="p-1.5 rounded hover:bg-gray-200 text-gray-500"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-auto p-4 bg-gray-100 flex justify-center">
              {importPreviewFormat === 'Pdf' ? (
                <object data={importPreviewUrl} type="application/pdf" className="w-full h-full min-h-[70vh] rounded shadow">
                  <div className="flex flex-col items-center justify-center h-full gap-4 p-8">
                    <FileText className="w-12 h-12 text-gray-400" />
                    <p className="text-sm text-gray-600">No se puede mostrar el PDF en el navegador.</p>
                    <a href={importPreviewUrl} target="_blank" rel="noopener noreferrer"
                       className="px-4 py-2 bg-brand-600 text-white rounded-lg text-sm hover:bg-brand-700">
                      Abrir en nueva pestaña
                    </a>
                  </div>
                </object>
              ) : (
                <img src={importPreviewUrl} alt={importPreviewName} className="max-w-full max-h-[80vh] object-contain shadow-lg rounded" />
              )}
            </div>
          </div>
        </div>
      )}

      {/* Search + actions bar */}
      <div className="flex items-center justify-between gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar etiqueta…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-8 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        <button
          onClick={() => setCreando(true)}
          className="flex items-center gap-1.5 px-4 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-700 transition-colors"
        >
          <Plus className="w-4 h-4" /> Nueva plantilla
        </button>
      </div>

      {/* ─── PLANTILLAS (creadas en el editor) ─── */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
          <Tag className="w-4 h-4 text-brand-500" />
          Plantillas creadas
          <span className="text-xs font-normal text-gray-400">({filtered.length})</span>
        </h3>

        {isLoading ? (
          <div className="flex items-center justify-center h-40 text-gray-400">
            <Loader2 className="w-5 h-5 animate-spin mr-2" /> Cargando…
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-8 text-gray-400 bg-white rounded-xl border border-cream-200">
            <Tag className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">{search ? 'Sin resultados' : 'No hay plantillas creadas'}</p>
            <p className="text-xs mt-1">Pulse «Nueva plantilla» para crear una en el editor</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filtered.map(p => (
              <div
                key={p.id}
                className="bg-white rounded-xl border border-cream-200 p-4 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="font-semibold text-gray-900 text-sm">{p.nombre}</h3>
                    {p.descripcion && <p className="text-xs text-gray-500 mt-0.5">{p.descripcion}</p>}
                  </div>
                  {p.esPlantillaBase && (
                    <span className="px-2 py-0.5 text-xs font-medium bg-blue-100 text-blue-700 rounded">Base</span>
                  )}
                </div>

                {/* Mini preview of HTML content */}
                {p.contenidoHtml && p.contenidoHtml.trim().length > 10 && (
                  <div
                    className="mb-3 border border-gray-200 rounded-lg p-2 bg-gray-50 overflow-hidden max-h-20 text-[6px] leading-tight pointer-events-none"
                    dangerouslySetInnerHTML={{ __html: p.contenidoHtml }}
                  />
                )}

                <div className="flex items-center gap-3 text-xs text-gray-500 mb-3">
                  <span>{p.anchoMm} × {p.altoMm} mm</span>
                  <span>·</span>
                  <span>{IMPRESORA_LABELS[p.tipoImpresora] ?? p.tipoImpresora}</span>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setPreviewId(p.id)}
                    className="flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
                    title="Previsualizar"
                  >
                    <Eye className="w-3.5 h-3.5" /> Ver
                  </button>
                  <button
                    onClick={() => {
                      window.open(`/api/etiquetas/plantillas/${p.id}/exportar-pdf`, '_blank')
                    }}
                    className="flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-lg bg-red-50 text-red-700 hover:bg-red-100 transition-colors"
                    title="Descargar como PDF"
                  >
                    <Download className="w-3.5 h-3.5" /> PDF
                  </button>
                  <button
                    onClick={() => setEditando(p)}
                    className="flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-lg bg-brand-50 text-brand-700 hover:bg-brand-100 transition-colors"
                  >
                    <Edit2 className="w-3.5 h-3.5" /> Editar
                  </button>
                  {!p.esPlantillaBase && (
                    <button
                      onClick={() => {
                        Swal.fire({
                          title: '¿Eliminar plantilla?',
                          text: `Se eliminará "${p.nombre}" permanentemente.`,
                          icon: 'warning',
                          showCancelButton: true,
                          confirmButtonColor: '#dc2626',
                          cancelButtonColor: '#6b7280',
                          confirmButtonText: 'Sí, eliminar',
                          cancelButtonText: 'Cancelar',
                        }).then(r => { if (r.isConfirmed) deleteMut.mutate(p.id) })
                      }}
                      className="flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-lg bg-red-50 text-red-600 hover:bg-red-100 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ─── ETIQUETAS IMPORTADAS (archivos subidos) ─── */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
          <FileText className="w-4 h-4 text-cyan-500" />
          Etiquetas importadas
          <span className="text-xs font-normal text-gray-400">({filteredImports.length})</span>
        </h3>

        {filteredImports.length === 0 ? (
          <div className="text-center py-6 text-gray-400 bg-white rounded-xl border border-cream-200">
            <Upload className="w-6 h-6 mx-auto mb-1 opacity-50" />
            <p className="text-xs">{search ? 'Sin resultados' : 'No hay archivos importados — use la pestaña «Importar» para subir archivos'}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filteredImports.map(e => (
              <div
                key={`imp-${e.id}`}
                className="bg-white rounded-xl border border-cream-200 p-4 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="min-w-0 flex-1">
                    <h3 className="font-semibold text-gray-900 text-sm truncate">{e.nombre}</h3>
                    <p className="text-xs text-gray-400 mt-0.5">{formatDate(e.createdAt)}</p>
                  </div>
                  <span className={`px-2 py-0.5 text-xs font-medium rounded shrink-0 ml-2 ${FORMAT_COLORS[e.formato] ?? 'bg-gray-100 text-gray-700'}`}>
                    {e.formato}
                  </span>
                </div>

                <div className="flex items-center gap-3 text-xs text-gray-500 mb-3">
                  <span>{formatBytes(e.tamanoBytes)}</span>
                  <span>·</span>
                  <span>Archivo importado</span>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => handleImportPreview(e.id, e.nombre, e.formato)}
                    className="flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
                    title="Previsualizar"
                  >
                    <Eye className="w-3.5 h-3.5" /> Ver
                  </button>
                  {e.formato === 'Odt' && (
                    <button
                      onClick={() => {
                        Swal.fire({
                          title: 'Generar etiqueta con datos',
                          html: '<p class="text-sm text-gray-600">Se rellenarán las variables <code>{{...}}</code> del archivo ODT con datos de producto y lote.</p><p class="text-sm text-gray-500 mt-2">Use la pestaña <b>Generar</b> para seleccionar producto y lote antes de generar.</p>',
                          icon: 'info',
                          confirmButtonText: 'Ir a Generar',
                          confirmButtonColor: '#7c3aed',
                          showCancelButton: true,
                          cancelButtonText: 'Cancelar',
                        })
                      }}
                      className="flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-lg bg-violet-50 text-violet-700 hover:bg-violet-100 transition-colors"
                      title="Generar con variables reemplazadas"
                    >
                      <Wand2 className="w-3.5 h-3.5" /> Generar
                    </button>
                  )}
                  <button
                    onClick={() => handleImportDownload(e.id, `${e.nombre}.${e.formato.toLowerCase()}`)}
                    className="flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors"
                    title="Descargar"
                  >
                    <Download className="w-3.5 h-3.5" /> Descargar
                  </button>
                  <button
                    onClick={() => handleImportPrint(e.id, e.formato)}
                    className="flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors"
                    title="Imprimir"
                  >
                    <Printer className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => {
                      Swal.fire({
                        title: '¿Eliminar archivo?',
                        text: `Se eliminará "${e.nombre}" permanentemente.`,
                        icon: 'warning',
                        showCancelButton: true,
                        confirmButtonColor: '#dc2626',
                        cancelButtonColor: '#6b7280',
                        confirmButtonText: 'Sí, eliminar',
                        cancelButtonText: 'Cancelar',
                      }).then(r => { if (r.isConfirmed) deleteImportMut.mutate(e.id) })
                    }}
                    className="flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-lg bg-red-50 text-red-600 hover:bg-red-100 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Formulario de plantilla ───────────────────────────────────────────────────

function PlantillaForm({
  plantilla,
  onClose,
}: {
  plantilla: PlantillaEtiqueta | null
  onClose: () => void
}) {
  const qc = useQueryClient()
  const isEdit = plantilla !== null

  const [nombre, setNombre] = useState(plantilla?.nombre ?? '')
  const [descripcion, setDescripcion] = useState(plantilla?.descripcion ?? '')
  const [anchoMm, setAnchoMm] = useState(plantilla?.anchoMm ?? 105)
  const [altoMm, setAltoMm] = useState(plantilla?.altoMm ?? 57)
  const [tipoImpresora, setTipoImpresora] = useState(plantilla?.tipoImpresora ?? 'A4')
  const [contenidoHtml, setContenidoHtml] = useState(plantilla?.contenidoHtml ?? '')

  const saveMut = useMutation({
    mutationFn: async (dto: CreatePlantillaDto) => {
      if (isEdit) {
        return api.put(`/etiquetas/plantillas/${plantilla!.id}`, dto)
      }
      return api.post('/etiquetas/plantillas', dto)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['etiquetas'] })
      toast.success(isEdit ? 'Plantilla actualizada' : 'Plantilla creada')
      onClose()
    },
    onError: () => toast.error('Error al guardar'),
  })

  function handleSave() {
    if (!nombre.trim()) { toast.error('El nombre es obligatorio'); return }
    saveMut.mutate({
      nombre: nombre.trim(),
      descripcion: descripcion.trim() || undefined,
      anchoMm,
      altoMm,
      tipoImpresora,
      contenidoJson: JSON.stringify({ version: 2, anchoMm, altoMm }),
      contenidoHtml: contenidoHtml || undefined,
    })
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <button onClick={onClose} className="px-3 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50">
            ← Volver
          </button>
          <h2 className="text-lg font-bold text-gray-900">
            {isEdit ? 'Editar plantilla' : 'Nueva plantilla'}
          </h2>
        </div>
        <button
          onClick={handleSave}
          disabled={saveMut.isPending}
          className="flex items-center gap-1.5 px-4 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-700 disabled:opacity-50"
        >
          {saveMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Guardar
        </button>
      </div>

      {/* Properties bar */}
      <div className="bg-white rounded-xl border border-cream-200 p-4">
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
          <div className="md:col-span-2">
            <label className="text-xs font-medium text-gray-600">Nombre *</label>
            <input value={nombre} onChange={e => setNombre(e.target.value)}
              className="w-full mt-1 px-2.5 py-1.5 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand-500" />
          </div>
          <div className="md:col-span-2">
            <label className="text-xs font-medium text-gray-600">Descripción</label>
            <input value={descripcion} onChange={e => setDescripcion(e.target.value)}
              className="w-full mt-1 px-2.5 py-1.5 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand-500" />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600">Tamaño (mm)</label>
            <div className="flex gap-1 mt-1">
              <input type="number" value={anchoMm} onChange={e => setAnchoMm(+e.target.value)}
                className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded-lg" placeholder="Ancho" />
              <span className="self-center text-gray-400 text-xs">×</span>
              <input type="number" value={altoMm} onChange={e => setAltoMm(+e.target.value)}
                className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded-lg" placeholder="Alto" />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600">Impresora</label>
            <select value={tipoImpresora} onChange={e => setTipoImpresora(e.target.value as typeof tipoImpresora)}
              className="w-full mt-1 px-2.5 py-1.5 text-sm border border-gray-200 rounded-lg">
              <option value="A4">A4 (hoja)</option>
              <option value="TermicaDirecta">Térmica directa</option>
              <option value="TermicaTransferencia">Térmica transferencia</option>
            </select>
          </div>
        </div>
      </div>

      {/* WYSIWYG Editor */}
      <LabelEditor
        content={contenidoHtml}
        onChange={setContenidoHtml}
        pageWidthMm={anchoMm}
        pageHeightMm={altoMm}
      />
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// PREVIEW DE PLANTILLA — Renders the label with real data substitution
// ══════════════════════════════════════════════════════════════════════════════

function PlantillaPreview({ plantillaId, onClose }: { plantillaId: number; onClose: () => void }) {
  const [productoId, setProductoId] = useState<number | null>(null)
  const [loteId, setLoteId] = useState<number | null>(null)

  const { data: productos = [] } = useQuery({
    queryKey: ['productos-list'],
    queryFn: async () => {
      const { data } = await api.get('/productos?soloActivos=true')
      return data.data as Producto[]
    },
  })

  const { data: lotes = [] } = useQuery({
    queryKey: ['lotes-list'],
    queryFn: async () => {
      const { data } = await api.get('/lotes')
      return data.data as Lote[]
    },
  })

  // Uses the preview API with template data
  const { data: preview, isLoading } = useQuery({
    queryKey: ['etiqueta-preview', plantillaId, productoId, loteId],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (productoId) params.set('productoId', String(productoId))
      if (loteId) params.set('loteId', String(loteId))
      const { data } = await api.get(`/etiquetas/preview/${plantillaId}?${params}`)
      return data.data as EtiquetaPreview
    },
  })

  const plantilla = preview?.plantilla
  const contenidoHtml = plantilla?.contenidoHtml
  const hasRichContent = contenidoHtml && contenidoHtml.trim().length > 10

  // Replace template fields with actual product/lot data
  const renderedHtml = useMemo(() => {
    if (!hasRichContent) return ''
    return replaceTemplateFields(contenidoHtml, (preview ?? {} as EtiquetaPreview) as EtiquetaPreview)
  }, [contenidoHtml, preview, hasRichContent])

  const handlePrint = useCallback(() => {
    if (!plantilla) return
    if (hasRichContent) {
      printLabel(renderedHtml, plantilla.anchoMm, plantilla.altoMm)
    } else {
      toast.error('No hay contenido de etiqueta para imprimir. Edite la plantilla primero.')
    }
  }, [plantilla, hasRichContent, renderedHtml])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <button onClick={onClose} className="px-3 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50">
            ← Volver
          </button>
          <h2 className="text-lg font-bold text-gray-900">Previsualización</h2>
          {plantilla && (
            <span className="text-sm text-gray-500">
              {plantilla.nombre} — {plantilla.anchoMm} × {plantilla.altoMm} mm
            </span>
          )}
        </div>
        <button
          onClick={handlePrint}
          className="flex items-center gap-1.5 px-4 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-700 transition-colors"
        >
          <Printer className="w-4 h-4" /> Imprimir
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Left panel: data selectors */}
        <div className="bg-white rounded-xl border border-cream-200 p-4 space-y-3">
          <h3 className="text-sm font-semibold text-gray-800">Datos de prueba</h3>
          <p className="text-xs text-gray-400">Seleccione un producto y/o lote para ver la etiqueta con datos reales.</p>
          <div>
            <label className="text-xs font-medium text-gray-600">Producto</label>
            <select value={productoId ?? ''} onChange={e => { setProductoId(e.target.value ? +e.target.value : null); setLoteId(null) }}
              className="w-full mt-1 px-2.5 py-1.5 text-sm border border-gray-200 rounded-lg">
              <option value="">— Sin producto —</option>
              {productos.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600">Lote</label>
            <select value={loteId ?? ''} onChange={e => setLoteId(e.target.value ? +e.target.value : null)}
              className="w-full mt-1 px-2.5 py-1.5 text-sm border border-gray-200 rounded-lg">
              <option value="">— Sin lote —</option>
              {lotes.filter(l => !productoId || l.productoId === productoId).map(l => (
                <option key={l.id} value={l.id}>{l.codigoLote}</option>
              ))}
            </select>
          </div>

          {/* Data summary */}
          {preview?.producto && (
            <div className="border-t border-gray-100 pt-3 space-y-1 text-xs text-gray-600">
              <p className="font-medium text-gray-700">Datos del producto:</p>
              <p>{preview.producto.nombre}</p>
              {preview.producto.ingredientesTexto && (
                <p className="text-gray-400 truncate" title={preview.producto.ingredientesTexto}>
                  Ingr: {preview.producto.ingredientesTexto}
                </p>
              )}
            </div>
          )}
          {preview?.lote && (
            <div className="border-t border-gray-100 pt-3 space-y-1 text-xs text-gray-600">
              <p className="font-medium text-gray-700">Datos del lote:</p>
              <p>Lote: {preview.lote.codigoLote}</p>
              {preview.lote.fechaCaducidad && <p>Cad: {formatDateShort(preview.lote.fechaCaducidad)}</p>}
            </div>
          )}
        </div>

        {/* Right panel: label preview */}
        <div className="md:col-span-3 bg-white rounded-xl border border-cream-200 p-4">
          {isLoading ? (
            <div className="flex items-center justify-center h-40 text-gray-400">
              <Loader2 className="w-5 h-5 animate-spin" />
            </div>
          ) : hasRichContent ? (
            <div>
              <div className="flex items-center gap-2 mb-3 text-xs text-gray-500">
                <Eye className="w-3.5 h-3.5" />
                <span>Vista previa de la etiqueta (los campos de plantilla se reemplazan con datos reales)</span>
              </div>
              <div className="overflow-auto bg-gray-200 p-8 rounded-lg flex justify-center">
                <div
                  className="bg-white shadow-xl border border-gray-300"
                  style={{
                    width: `${plantilla!.anchoMm}mm`,
                    minHeight: `${plantilla!.altoMm}mm`,
                    maxWidth: '100%',
                  }}
                >
                  <div
                    className="label-editor-content p-2"
                    style={{ fontSize: '10pt', lineHeight: '1.3' }}
                    dangerouslySetInnerHTML={{ __html: renderedHtml }}
                  />
                </div>
              </div>
            </div>
          ) : preview?.producto || preview?.lote ? (
            <div>
              <div className="flex items-center gap-2 mb-3 text-xs text-amber-600">
                <Tag className="w-3.5 h-3.5" />
                <span>Esta plantilla no tiene diseño visual. Edítela para crear el diseño de la etiqueta.</span>
              </div>
              <div className="space-y-3">
                {preview.producto && (
                  <div className="bg-gray-50 rounded-lg p-4 text-sm space-y-2">
                    <p className="font-bold text-gray-900">{preview.producto.nombre}</p>
                    {preview.producto.ingredientesTexto && (
                      <p className="text-gray-600"><b className="text-gray-700">Ingredientes:</b> {preview.producto.ingredientesTexto}</p>
                    )}
                    {preview.producto.trazas && (
                      <p className="text-gray-600"><b className="text-gray-700">Trazas:</b> {preview.producto.trazas}</p>
                    )}
                    {preview.producto.conservacion && (
                      <p className="text-gray-600"><b className="text-gray-700">Conservación:</b> {preview.producto.conservacion}</p>
                    )}
                    {preview.producto.valorEnergeticoKcal != null && (
                      <div className="mt-3 border border-gray-300 rounded p-3">
                        <p className="font-bold text-gray-900 mb-2 text-xs">Información nutricional (por 100 g)</p>
                        <table className="w-full text-xs">
                          <tbody className="divide-y divide-gray-200">
                            <tr><td className="py-1">Valor energético</td><td className="py-1 text-right font-mono">{preview.producto.valorEnergeticoKj} kJ / {preview.producto.valorEnergeticoKcal} kcal</td></tr>
                            <tr><td className="py-1">Grasas</td><td className="py-1 text-right font-mono">{preview.producto.grasas} g</td></tr>
                            <tr><td className="py-1 pl-3 text-gray-500">de las cuales saturadas</td><td className="py-1 text-right font-mono">{preview.producto.grasasSaturadas} g</td></tr>
                            <tr><td className="py-1">Hidratos de carbono</td><td className="py-1 text-right font-mono">{preview.producto.hidratosCarbono} g</td></tr>
                            <tr><td className="py-1 pl-3 text-gray-500">de los cuales azúcares</td><td className="py-1 text-right font-mono">{preview.producto.azucares} g</td></tr>
                            <tr><td className="py-1">Proteínas</td><td className="py-1 text-right font-mono">{preview.producto.proteinas} g</td></tr>
                            <tr><td className="py-1">Sal</td><td className="py-1 text-right font-mono">{preview.producto.sal} g</td></tr>
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
                {preview.lote && (
                  <div className="bg-gray-50 rounded-lg p-4 text-sm space-y-1">
                    <p><b className="text-gray-700">Lote:</b> {preview.lote.codigoLote}</p>
                    <p><b className="text-gray-700">Fabricación:</b> {formatDateShort(preview.lote.fechaFabricacion)}</p>
                    {preview.lote.fechaCaducidad && <p><b className="text-gray-700">Caducidad:</b> {formatDateShort(preview.lote.fechaCaducidad)}</p>}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="text-center py-12 text-gray-400">
              <Eye className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">Seleccione un producto o lote para previsualizar la etiqueta con datos reales</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB: IMPORTAR ARCHIVOS
// ══════════════════════════════════════════════════════════════════════════════

function ImportadasTab() {
  const qc = useQueryClient()
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewName, setPreviewName] = useState('')
  const [previewFormat, setPreviewFormat] = useState('')
  const [collaboraFile, setCollaboraFile] = useState<{ id: number; nombre: string; permission: 'edit' | 'view' } | null>(null)

  const { data: importadas = [], isLoading } = useQuery({
    queryKey: ['etiquetas', 'importadas'],
    queryFn: async () => {
      const { data } = await api.get('/etiquetas/importadas')
      return data.data as EtiquetaImportada[]
    },
  })

  const uploadMut = useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData()
      form.append('archivo', file)
      return api.post('/etiquetas/importar', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['etiquetas'] })
      toast.success('Etiqueta importada correctamente')
    },
    onError: () => toast.error('Error al importar'),
  })

  const deleteMut = useMutation({
    mutationFn: (id: number) => api.delete(`/etiquetas/importadas/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['etiquetas'] })
      toast.success('Eliminada')
    },
    onError: () => toast.error('Error al eliminar'),
  })

  function handleUpload() {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.docx,.odt,.pdf,.png,.jpg,.jpeg'
    input.multiple = true
    input.onchange = () => {
      const files = input.files
      if (files) {
        Array.from(files).forEach(file => uploadMut.mutate(file))
      }
    }
    input.click()
  }

  function handleDownload(id: number, nombre: string, formato: string) {
    const filename = `${nombre}.${formato.toLowerCase()}`
    fetch(`/api/etiquetas/importadas/${id}/descargar`, {
      headers: { Authorization: `Bearer ${getAuthToken()}` },
    })
      .then(r => r.blob())
      .then(blob => {
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = filename
        a.click()
        URL.revokeObjectURL(url)
      })
      .catch(() => toast.error('Error al descargar'))
  }

  function handlePreview(id: number, nombre: string, formato: string) {
    // ODT/DOCX: open in Collabora Online (LibreOffice in browser)
    const editable = ['Odt', 'Docx'].includes(formato)
    if (editable) {
      setCollaboraFile({ id, nombre: `${nombre}.${formato.toLowerCase()}`, permission: 'view' })
      return
    }

    const viewable = ['Pdf', 'Png', 'Jpg'].includes(formato)
    if (!viewable) {
      toast.error(`No se puede previsualizar .${formato.toLowerCase()}`)
      return
    }
    fetch(`/api/etiquetas/importadas/${id}/descargar`, {
      headers: { Authorization: `Bearer ${getAuthToken()}` },
    })
      .then(r => r.blob())
      .then(blob => {
        const url = URL.createObjectURL(blob)
        setPreviewUrl(url)
        setPreviewName(nombre)
        setPreviewFormat(formato)
      })
      .catch(() => toast.error('Error al previsualizar'))
  }

  function handleEditCollabora(id: number, nombre: string, formato: string) {
    setCollaboraFile({ id, nombre: `${nombre}.${formato.toLowerCase()}`, permission: 'edit' })
  }

  return (
    <div className="space-y-4">
      {/* Collabora Online editor */}
      {collaboraFile && (
        <CollaboraViewer
          fileId={collaboraFile.id}
          fileName={collaboraFile.nombre}
          permission={collaboraFile.permission}
          onClose={() => setCollaboraFile(null)}
          onSaved={() => qc.invalidateQueries({ queryKey: ['etiquetas'] })}
        />
      )}

      {/* Preview modal */}
      {previewUrl && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-6">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 bg-gray-50">
              <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
                <FileText className="w-4 h-4" />
                {previewName}
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${FORMAT_COLORS[previewFormat] ?? 'bg-gray-100 text-gray-700'}`}>
                  {previewFormat}
                </span>
              </h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    const printWin = window.open(previewUrl, '_blank')
                    if (printWin) printWin.onload = () => printWin.print()
                  }}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs bg-brand-600 text-white rounded-lg hover:bg-brand-700"
                >
                  <Printer className="w-3.5 h-3.5" /> Imprimir
                </button>
                <button
                  onClick={() => { URL.revokeObjectURL(previewUrl); setPreviewUrl(null) }}
                  className="p-1.5 rounded hover:bg-gray-200 text-gray-500"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-auto p-4 bg-gray-100 flex justify-center">
              {previewFormat === 'Pdf' ? (
                <object data={previewUrl} type="application/pdf" className="w-full h-full min-h-[70vh] rounded shadow">
                  <div className="flex flex-col items-center justify-center h-full gap-4 p-8">
                    <FileText className="w-12 h-12 text-gray-400" />
                    <p className="text-sm text-gray-600">No se puede mostrar el PDF en el navegador.</p>
                    <a href={previewUrl} target="_blank" rel="noopener noreferrer"
                       className="px-4 py-2 bg-brand-600 text-white rounded-lg text-sm hover:bg-brand-700">
                      Abrir en nueva pestaña
                    </a>
                  </div>
                </object>
              ) : (
                <img src={previewUrl} alt={previewName} className="max-w-full max-h-[80vh] object-contain shadow-lg rounded" />
              )}
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-800">Importar etiquetas</h3>
          <p className="text-xs text-gray-500 mt-0.5">Suba archivos de etiquetas existentes (.docx, .odt, .pdf, .png, .jpg)</p>
        </div>
        <button
          onClick={handleUpload}
          disabled={uploadMut.isPending}
          className="flex items-center gap-1.5 px-4 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-700 disabled:opacity-50"
        >
          {uploadMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
          Importar archivo
        </button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-40 text-gray-400">
          <Loader2 className="w-5 h-5 animate-spin" />
        </div>
      ) : importadas.length === 0 ? (
        <div className="text-center py-12 text-gray-400 bg-white rounded-xl border border-cream-200">
          <Upload className="w-10 h-10 mx-auto mb-3 opacity-50" />
          <p className="text-sm font-medium">No hay etiquetas importadas</p>
          <p className="text-xs mt-1">Soporta .docx, .odt, .pdf, .png, .jpg</p>
          <button
            onClick={handleUpload}
            className="mt-4 px-4 py-2 bg-brand-600 text-white rounded-lg text-sm hover:bg-brand-700"
          >
            Importar primer archivo
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-cream-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-cream-50 border-b border-cream-200">
              <tr>
                <th className="text-left px-4 py-2.5 font-medium text-gray-600">Nombre</th>
                <th className="text-left px-4 py-2.5 font-medium text-gray-600">Formato</th>
                <th className="text-right px-4 py-2.5 font-medium text-gray-600">Tamaño</th>
                <th className="text-left px-4 py-2.5 font-medium text-gray-600">Fecha</th>
                <th className="w-48 px-4 py-2.5 font-medium text-gray-600 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-cream-100">
              {importadas.map(e => (
                <tr key={e.id} className="hover:bg-cream-50">
                  <td className="px-4 py-2.5 font-medium text-gray-900">{e.nombre}</td>
                  <td className="px-4 py-2.5">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${FORMAT_COLORS[e.formato] ?? 'bg-gray-100 text-gray-700'}`}>
                      {e.formato}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right text-gray-500">{formatBytes(e.tamanoBytes)}</td>
                  <td className="px-4 py-2.5 text-gray-500">{formatDate(e.createdAt)}</td>
                  <td className="px-4 py-2.5 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        onClick={() => handlePreview(e.id, e.nombre, e.formato)}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-brand-600 hover:bg-brand-50 transition-colors"
                        title="Previsualizar"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      {['Odt', 'Docx'].includes(e.formato) && (
                        <button
                          onClick={() => handleEditCollabora(e.id, e.nombre, e.formato)}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-cyan-600 hover:bg-cyan-50 transition-colors"
                          title="Editar en Collabora (LibreOffice Online)"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                      )}
                      <button
                        onClick={() => handleDownload(e.id, e.nombre, e.formato)}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 transition-colors"
                        title="Descargar"
                      >
                        <Download className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => {
                          const printWin = window.open('', '_blank')
                          if (!printWin) return
                          fetch(`/api/etiquetas/importadas/${e.id}/descargar`, {
                            headers: { Authorization: `Bearer ${getAuthToken()}` },
                          })
                            .then(r => r.blob())
                            .then(blob => {
                              const url = URL.createObjectURL(blob)
                              printWin.location.href = url
                              printWin.onload = () => printWin.print()
                            })
                        }}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                        title="Imprimir"
                      >
                        <Printer className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => {
                          Swal.fire({
                            title: '¿Eliminar archivo?',
                            text: `Se eliminará "${e.nombre}" permanentemente.`,
                            icon: 'warning',
                            showCancelButton: true,
                            confirmButtonColor: '#dc2626',
                            cancelButtonColor: '#6b7280',
                            confirmButtonText: 'Sí, eliminar',
                            cancelButtonText: 'Cancelar',
                          }).then(r => { if (r.isConfirmed) deleteMut.mutate(e.id) })
                        }}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                        title="Eliminar"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB: GENERAR ETIQUETA (Seleccionar plantilla + producto + lote → PDF)
// ══════════════════════════════════════════════════════════════════════════════

function GenerarTab() {
  const [source, setSource] = useState<'plantilla' | 'importada'>('plantilla')
  const [plantillaId, setPlantillaId] = useState<number | null>(null)
  const [importadaId, setImportadaId] = useState<number | null>(null)
  const [productoId, setProductoId] = useState<number | null>(null)
  const [loteId, setLoteId] = useState<number | null>(null)
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)

  const { data: plantillas = [] } = useQuery({
    queryKey: ['etiquetas', 'plantillas'],
    queryFn: async () => {
      const { data } = await api.get('/etiquetas/plantillas')
      return data.data as PlantillaEtiqueta[]
    },
  })

  const { data: importadas = [] } = useQuery({
    queryKey: ['etiquetas', 'importadas'],
    queryFn: async () => {
      const { data } = await api.get('/etiquetas/importadas')
      return data.data as EtiquetaImportada[]
    },
  })

  const odtImportadas = useMemo(() => importadas.filter(e => e.formato === 'Odt'), [importadas])

  const { data: productos = [] } = useQuery({
    queryKey: ['productos-list'],
    queryFn: async () => {
      const { data } = await api.get('/productos?soloActivos=true')
      return data.data as Producto[]
    },
  })

  const { data: lotes = [] } = useQuery({
    queryKey: ['lotes-list'],
    queryFn: async () => {
      const { data } = await api.get('/lotes')
      return data.data as Lote[]
    },
  })

  async function handleGenerate() {
    if (source === 'plantilla') {
      if (!plantillaId) { toast.error('Seleccione una plantilla'); return }
      setGenerating(true)
      try {
        const params = new URLSearchParams()
        if (productoId) params.set('productoId', String(productoId))
        if (loteId) params.set('loteId', String(loteId))
        const response = await fetch(`/api/etiquetas/plantillas/${plantillaId}/exportar-pdf?${params}`, {
          headers: { Authorization: `Bearer ${getAuthToken()}` },
        })
        if (!response.ok) throw new Error(await response.text())
        const blob = await response.blob()
        if (pdfUrl) URL.revokeObjectURL(pdfUrl)
        setPdfUrl(URL.createObjectURL(blob))
        toast.success('PDF generado correctamente')
      } catch (err) {
        toast.error('Error al generar PDF')
      } finally {
        setGenerating(false)
      }
    } else {
      if (!importadaId) { toast.error('Seleccione un archivo ODT'); return }
      setGenerating(true)
      try {
        const response = await fetch(`/api/etiquetas/importadas/${importadaId}/generar`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${getAuthToken()}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ productoId, loteId }),
        })
        if (!response.ok) throw new Error(await response.text())
        const blob = await response.blob()
        // Download the ODT
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `etiqueta_generada.odt`
        a.click()
        URL.revokeObjectURL(url)
        toast.success('ODT generado y descargado')
      } catch (err) {
        toast.error('Error al generar etiqueta')
      } finally {
        setGenerating(false)
      }
    }
  }

  function handlePrintPdf() {
    if (!pdfUrl) return
    const printWin = window.open(pdfUrl, '_blank')
    if (printWin) printWin.onload = () => printWin.print()
  }

  function handleDownloadPdf() {
    if (!pdfUrl) return
    const a = document.createElement('a')
    a.href = pdfUrl
    a.download = 'etiqueta.pdf'
    a.click()
  }

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
          <Wand2 className="w-4 h-4 text-violet-500" />
          Generar etiqueta con datos reales
        </h3>
        <p className="text-xs text-gray-500 mt-0.5">
          Seleccione una plantilla o archivo ODT, elija producto y lote, y genere la etiqueta final en PDF.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Left: Configuration */}
        <div className="bg-white rounded-xl border border-cream-200 p-5 space-y-4">
          {/* Source selector */}
          <div>
            <label className="text-xs font-medium text-gray-600 mb-2 block">Origen de la etiqueta</label>
            <div className="flex gap-2">
              <button
                onClick={() => setSource('plantilla')}
                className={`flex-1 px-3 py-2 text-xs font-medium rounded-lg border transition-colors ${
                  source === 'plantilla'
                    ? 'bg-brand-50 border-brand-300 text-brand-700'
                    : 'bg-gray-50 border-gray-200 text-gray-500 hover:bg-gray-100'
                }`}
              >
                <Tag className="w-3.5 h-3.5 inline mr-1" />
                Plantilla HTML
              </button>
              <button
                onClick={() => setSource('importada')}
                className={`flex-1 px-3 py-2 text-xs font-medium rounded-lg border transition-colors ${
                  source === 'importada'
                    ? 'bg-cyan-50 border-cyan-300 text-cyan-700'
                    : 'bg-gray-50 border-gray-200 text-gray-500 hover:bg-gray-100'
                }`}
              >
                <FileText className="w-3.5 h-3.5 inline mr-1" />
                Archivo ODT
              </button>
            </div>
          </div>

          {/* Template/File selector */}
          {source === 'plantilla' ? (
            <div>
              <label className="text-xs font-medium text-gray-600">Plantilla</label>
              <select
                value={plantillaId ?? ''}
                onChange={e => setPlantillaId(e.target.value ? +e.target.value : null)}
                className="w-full mt-1 px-2.5 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand-500"
              >
                <option value="">— Seleccionar plantilla —</option>
                {plantillas.map(p => (
                  <option key={p.id} value={p.id}>{p.nombre} ({p.anchoMm}×{p.altoMm} mm)</option>
                ))}
              </select>
            </div>
          ) : (
            <div>
              <label className="text-xs font-medium text-gray-600">Archivo ODT</label>
              <select
                value={importadaId ?? ''}
                onChange={e => setImportadaId(e.target.value ? +e.target.value : null)}
                className="w-full mt-1 px-2.5 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand-500"
              >
                <option value="">— Seleccionar archivo ODT —</option>
                {odtImportadas.map(e => (
                  <option key={e.id} value={e.id}>{e.nombre}</option>
                ))}
              </select>
              {odtImportadas.length === 0 && (
                <p className="text-xs text-amber-600 mt-1">No hay archivos ODT importados. Use la pestaña «Importar» primero.</p>
              )}
            </div>
          )}

          <hr className="border-gray-100" />

          {/* Product */}
          <div>
            <label className="text-xs font-medium text-gray-600">Producto</label>
            <select
              value={productoId ?? ''}
              onChange={e => { setProductoId(e.target.value ? +e.target.value : null); setLoteId(null) }}
              className="w-full mt-1 px-2.5 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand-500"
            >
              <option value="">— Sin producto —</option>
              {productos.map(p => <option key={p.id} value={p.id}>{p.nombre} {p.codigo ? `(${p.codigo})` : ''}</option>)}
            </select>
          </div>

          {/* Lote */}
          <div>
            <label className="text-xs font-medium text-gray-600">Lote</label>
            <select
              value={loteId ?? ''}
              onChange={e => setLoteId(e.target.value ? +e.target.value : null)}
              className="w-full mt-1 px-2.5 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand-500"
            >
              <option value="">— Sin lote —</option>
              {lotes.filter(l => !productoId || l.productoId === productoId).map(l => (
                <option key={l.id} value={l.id}>{l.codigoLote} {l.fechaCaducidad ? `(cad: ${formatDateShort(l.fechaCaducidad)})` : ''}</option>
              ))}
            </select>
          </div>

          <hr className="border-gray-100" />

          {/* Generate button */}
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-violet-600 text-white rounded-lg text-sm font-medium hover:bg-violet-700 disabled:opacity-50 transition-colors"
          >
            {generating ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Generando…</>
            ) : (
              <><Wand2 className="w-4 h-4" /> {source === 'plantilla' ? 'Generar PDF' : 'Generar ODT'}</>
            )}
          </button>
        </div>

        {/* Right: Preview */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-cream-200 p-5">
          {pdfUrl ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-red-500" />
                  Etiqueta generada
                </h4>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handlePrintPdf}
                    className="flex items-center gap-1 px-3 py-1.5 text-xs bg-brand-600 text-white rounded-lg hover:bg-brand-700"
                  >
                    <Printer className="w-3.5 h-3.5" /> Imprimir
                  </button>
                  <button
                    onClick={handleDownloadPdf}
                    className="flex items-center gap-1 px-3 py-1.5 text-xs bg-emerald-600 text-white rounded-lg hover:bg-emerald-700"
                  >
                    <Download className="w-3.5 h-3.5" /> Descargar
                  </button>
                </div>
              </div>
              <object data={pdfUrl} type="application/pdf" className="w-full min-h-[65vh] rounded-lg border border-gray-200">
                <div className="flex flex-col items-center justify-center h-64 gap-4 p-8">
                  <FileText className="w-12 h-12 text-gray-400" />
                  <p className="text-sm text-gray-600">No se puede mostrar el PDF en el navegador.</p>
                  <a href={pdfUrl} target="_blank" rel="noopener noreferrer"
                    className="px-4 py-2 bg-brand-600 text-white rounded-lg text-sm hover:bg-brand-700">
                    Abrir en nueva pestaña
                  </a>
                </div>
              </object>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-64 text-gray-400">
              <Wand2 className="w-10 h-10 mb-3 opacity-40" />
              <p className="text-sm font-medium">Vista previa del PDF generado</p>
              <p className="text-xs mt-1">Seleccione una plantilla, producto/lote y pulse «Generar»</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB: COLA DE IMPRESIÓN
// ══════════════════════════════════════════════════════════════════════════════

function ImpresionTab() {
  const qc = useQueryClient()
  const [showForm, setShowForm] = useState(false)

  const { data: trabajos = [], isLoading } = useQuery({
    queryKey: ['etiquetas', 'trabajos'],
    queryFn: async () => {
      const { data } = await api.get('/etiquetas/trabajos')
      return data.data as TrabajoImpresion[]
    },
    refetchInterval: 10_000,
  })

  const { data: plantillas = [] } = useQuery({
    queryKey: ['etiquetas', 'plantillas'],
    queryFn: async () => {
      const { data } = await api.get('/etiquetas/plantillas')
      return data.data as PlantillaEtiqueta[]
    },
  })

  const { data: productos = [] } = useQuery({
    queryKey: ['productos-list'],
    queryFn: async () => {
      const { data } = await api.get('/productos?soloActivos=true')
      return data.data as Producto[]
    },
  })

  const { data: lotes = [] } = useQuery({
    queryKey: ['lotes-list'],
    queryFn: async () => {
      const { data } = await api.get('/lotes')
      return data.data as Lote[]
    },
  })

  const [plantillaId, setPlantillaId] = useState<number>(0)
  const [productoId, setProductoId] = useState<number | undefined>()
  const [loteId, setLoteId] = useState<number | undefined>()
  const [copias, setCopias] = useState(1)

  const printMut = useMutation({
    mutationFn: (dto: ImprimirEtiquetaDto) => api.post('/etiquetas/imprimir', dto),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['etiquetas', 'trabajos'] })
      toast.success('Trabajo de impresión creado')
      setShowForm(false)
    },
    onError: () => toast.error('Error al crear trabajo'),
  })

  function handlePrint() {
    if (!plantillaId) { toast.error('Seleccione una plantilla'); return }
    printMut.mutate({
      plantillaEtiquetaId: plantillaId,
      productoId,
      loteId,
      copias: copias > 0 ? copias : 1,
    })
  }

  const estadoColor: Record<string, string> = {
    Pendiente: 'bg-amber-100 text-amber-700',
    Impreso: 'bg-emerald-100 text-emerald-700',
    Error: 'bg-red-100 text-red-700',
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-800">Cola de impresión de etiquetas</h3>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-1.5 px-4 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-700"
        >
          <Printer className="w-4 h-4" /> Nuevo trabajo
        </button>
      </div>

      {showForm && (
        <div className="bg-white rounded-xl border border-cream-200 p-4 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-600">Plantilla *</label>
              <select value={plantillaId} onChange={e => setPlantillaId(+e.target.value)}
                className="w-full mt-1 px-2.5 py-1.5 text-sm border border-gray-200 rounded-lg">
                <option value={0}>Seleccionar…</option>
                {plantillas.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600">Producto</label>
              <select value={productoId ?? ''} onChange={e => setProductoId(e.target.value ? +e.target.value : undefined)}
                className="w-full mt-1 px-2.5 py-1.5 text-sm border border-gray-200 rounded-lg">
                <option value="">— Opcional —</option>
                {productos.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600">Lote</label>
              <select value={loteId ?? ''} onChange={e => setLoteId(e.target.value ? +e.target.value : undefined)}
                className="w-full mt-1 px-2.5 py-1.5 text-sm border border-gray-200 rounded-lg">
                <option value="">— Opcional —</option>
                {lotes.filter(l => !productoId || l.productoId === productoId).map(l => (
                  <option key={l.id} value={l.id}>{l.codigoLote}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600">Copias</label>
              <input type="number" min={1} value={copias} onChange={e => setCopias(+e.target.value)}
                className="w-full mt-1 px-2.5 py-1.5 text-sm border border-gray-200 rounded-lg" />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowForm(false)} className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg">
              Cancelar
            </button>
            <button onClick={handlePrint} disabled={printMut.isPending}
              className="flex items-center gap-1.5 px-4 py-1.5 bg-brand-600 text-white text-sm rounded-lg hover:bg-brand-700 disabled:opacity-50">
              {printMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />}
              Enviar a imprimir
            </button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center h-40 text-gray-400">
          <Loader2 className="w-5 h-5 animate-spin" />
        </div>
      ) : trabajos.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <Printer className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">No hay trabajos de impresión</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-cream-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-cream-50 border-b border-cream-200">
              <tr>
                <th className="text-left px-4 py-2.5 font-medium text-gray-600">Plantilla</th>
                <th className="text-left px-4 py-2.5 font-medium text-gray-600">Producto</th>
                <th className="text-left px-4 py-2.5 font-medium text-gray-600">Lote</th>
                <th className="text-center px-4 py-2.5 font-medium text-gray-600">Copias</th>
                <th className="text-left px-4 py-2.5 font-medium text-gray-600">Estado</th>
                <th className="text-left px-4 py-2.5 font-medium text-gray-600">Fecha</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-cream-100">
              {trabajos.map(t => (
                <tr key={t.id} className="hover:bg-cream-50">
                  <td className="px-4 py-2.5 font-medium text-gray-900">{t.plantillaNombre}</td>
                  <td className="px-4 py-2.5 text-gray-600">{t.productoNombre ?? '—'}</td>
                  <td className="px-4 py-2.5 text-gray-600 font-mono text-xs">{t.codigoLote ?? '—'}</td>
                  <td className="px-4 py-2.5 text-center">{t.copias}</td>
                  <td className="px-4 py-2.5">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${estadoColor[t.estado] ?? 'bg-gray-100 text-gray-600'}`}>
                      {t.estado}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-gray-500">{formatDate(t.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB: IVA / RE
// ══════════════════════════════════════════════════════════════════════════════

function IvaReTab() {
  const qc = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [iva, setIva] = useState(10)
  const [re, setRe] = useState(1.4)
  const [desc, setDesc] = useState('')

  const { data: tipos = [], isLoading } = useQuery({
    queryKey: ['etiquetas', 'tipos-iva-re'],
    queryFn: async () => {
      const { data } = await api.get('/etiquetas/tipos-iva-re')
      return data.data as TipoIvaRe[]
    },
  })

  const addMut = useMutation({
    mutationFn: () => api.post('/etiquetas/tipos-iva-re', {
      ivaPorcentaje: iva,
      recargoEquivalenciaPorcentaje: re,
      descripcion: desc.trim() || null,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['etiquetas', 'tipos-iva-re'] })
      toast.success('Tipo IVA/RE creado')
      setShowForm(false)
    },
    onError: () => toast.error('Error al crear'),
  })

  const deleteMut = useMutation({
    mutationFn: (id: number) => api.delete(`/etiquetas/tipos-iva-re/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['etiquetas', 'tipos-iva-re'] })
      toast.success('Eliminado')
    },
    onError: () => toast.error('Error al eliminar'),
  })

  const DEFAULTS = [
    { iva: 4, re: 0.5, desc: 'Superreducido' },
    { iva: 10, re: 1.4, desc: 'Reducido' },
    { iva: 21, re: 5.2, desc: 'General' },
  ]

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-800">Tipos de IVA ↔ Recargo de Equivalencia</h3>
          <p className="text-xs text-gray-500 mt-0.5">Configuración de los tramos legales IVA → RE para su empresa</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-1.5 px-4 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-700"
        >
          <Plus className="w-4 h-4" /> Nuevo tramo
        </button>
      </div>

      {showForm && (
        <div className="bg-white rounded-xl border border-cream-200 p-4 space-y-3">
          <div className="flex flex-wrap gap-2 mb-2">
            <span className="text-xs text-gray-500">Tramos rápidos:</span>
            {DEFAULTS.map(d => (
              <button
                key={d.iva}
                onClick={() => { setIva(d.iva); setRe(d.re); setDesc(d.desc) }}
                className="px-2 py-1 text-xs bg-gray-100 rounded hover:bg-gray-200"
              >
                IVA {d.iva}% → RE {d.re}%
              </button>
            ))}
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-600">IVA %</label>
              <input type="number" step="0.01" value={iva} onChange={e => setIva(+e.target.value)}
                className="w-full mt-1 px-2.5 py-1.5 text-sm border border-gray-200 rounded-lg" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600">RE %</label>
              <input type="number" step="0.01" value={re} onChange={e => setRe(+e.target.value)}
                className="w-full mt-1 px-2.5 py-1.5 text-sm border border-gray-200 rounded-lg" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600">Descripción</label>
              <input value={desc} onChange={e => setDesc(e.target.value)}
                className="w-full mt-1 px-2.5 py-1.5 text-sm border border-gray-200 rounded-lg" />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowForm(false)} className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg">
              Cancelar
            </button>
            <button onClick={() => addMut.mutate()} disabled={addMut.isPending}
              className="flex items-center gap-1.5 px-4 py-1.5 bg-brand-600 text-white text-sm rounded-lg hover:bg-brand-700 disabled:opacity-50">
              {addMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Guardar
            </button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center h-40 text-gray-400">
          <Loader2 className="w-5 h-5 animate-spin" />
        </div>
      ) : tipos.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <Settings2 className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">No hay tramos IVA/RE configurados</p>
          <p className="text-xs mt-1">Use «Nuevo tramo» para añadir los tramos legales de IVA ↔ RE</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-cream-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-cream-50 border-b border-cream-200">
              <tr>
                <th className="text-right px-4 py-2.5 font-medium text-gray-600">IVA %</th>
                <th className="text-right px-4 py-2.5 font-medium text-gray-600">RE %</th>
                <th className="text-left px-4 py-2.5 font-medium text-gray-600">Descripción</th>
                <th className="w-16 px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-cream-100">
              {tipos.map(t => (
                <tr key={t.id} className="hover:bg-cream-50">
                  <td className="px-4 py-2.5 text-right font-mono">{t.ivaPorcentaje}%</td>
                  <td className="px-4 py-2.5 text-right font-mono">{t.recargoEquivalenciaPorcentaje}%</td>
                  <td className="px-4 py-2.5 text-gray-600">{t.descripcion ?? '—'}</td>
                  <td className="px-4 py-2.5 text-right">
                    <button
                      onClick={() => {
                        Swal.fire({
                          title: '¿Eliminar tramo IVA/RE?',
                          text: `IVA ${t.ivaPorcentaje}% → RE ${t.recargoEquivalenciaPorcentaje}%`,
                          icon: 'warning',
                          showCancelButton: true,
                          confirmButtonColor: '#dc2626',
                          cancelButtonColor: '#6b7280',
                          confirmButtonText: 'Sí, eliminar',
                          cancelButtonText: 'Cancelar',
                        }).then(r => { if (r.isConfirmed) deleteMut.mutate(t.id) })
                      }}
                      className="text-red-400 hover:text-red-600"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
