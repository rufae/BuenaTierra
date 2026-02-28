import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import TextAlign from '@tiptap/extension-text-align'
import { Table } from '@tiptap/extension-table'
import TableRow from '@tiptap/extension-table-row'
import TableCell from '@tiptap/extension-table-cell'
import TableHeader from '@tiptap/extension-table-header'
import { TextStyle } from '@tiptap/extension-text-style'
import Color from '@tiptap/extension-color'
import FontFamily from '@tiptap/extension-font-family'
import Highlight from '@tiptap/extension-highlight'
import Placeholder from '@tiptap/extension-placeholder'
import Image from '@tiptap/extension-image'
import { useCallback, useState } from 'react'
import {
  Bold, Italic, Underline as UnderlineIcon, Strikethrough,
  AlignLeft, AlignCenter, AlignRight, AlignJustify,
  List, ListOrdered, Undo2, Redo2,
  Table as TableIcon, Type, Heading1, Heading2, Heading3,
  Paintbrush, Minus, Image as ImageIcon, Tag, ChevronDown,
  Plus, Trash2, MoveHorizontal, MoveVertical, Merge, Split,
  Barcode, FileText,
} from 'lucide-react'

// ── Template Variables ────────────────────────────────────────────────────────
const TEMPLATE_FIELDS = [
  { group: 'Producto', items: [
    { key: '{{producto.nombre}}', label: 'Nombre del producto' },
    { key: '{{producto.codigo}}', label: 'Código' },
    { key: '{{producto.codigoBarras}}', label: 'Código de barras' },
    { key: '{{producto.precioVenta}}', label: 'Precio' },
    { key: '{{producto.pesoUnitarioGr}}', label: 'Peso (g)' },
    { key: '{{producto.unidadMedida}}', label: 'Unidad medida' },
    { key: '{{producto.ingredientesTexto}}', label: 'Ingredientes' },
    { key: '{{producto.trazas}}', label: 'Trazas / Alérgenos' },
    { key: '{{producto.conservacion}}', label: 'Conservación' },
  ]},
  { group: 'Nutricional', items: [
    { key: '{{producto.valorEnergeticoKj}}', label: 'Valor energético kJ' },
    { key: '{{producto.valorEnergeticoKcal}}', label: 'Valor energético kcal' },
    { key: '{{producto.grasas}}', label: 'Grasas' },
    { key: '{{producto.grasasSaturadas}}', label: 'Grasas saturadas' },
    { key: '{{producto.hidratosCarbono}}', label: 'Hidratos de carbono' },
    { key: '{{producto.azucares}}', label: 'Azúcares' },
    { key: '{{producto.proteinas}}', label: 'Proteínas' },
    { key: '{{producto.sal}}', label: 'Sal' },
  ]},
  { group: 'Lote', items: [
    { key: '{{lote.codigoLote}}', label: 'Código de lote' },
    { key: '{{lote.fechaFabricacion}}', label: 'Fecha fabricación' },
    { key: '{{lote.fechaCaducidad}}', label: 'Fecha caducidad' },
  ]},
  { group: 'Empresa', items: [
    { key: '{{empresa.nombre}}', label: 'Nombre empresa' },
    { key: '{{empresa.cif}}', label: 'CIF' },
    { key: '{{empresa.direccion}}', label: 'Dirección' },
    { key: '{{empresa.nrgs}}', label: 'Nº RGSEAA' },
  ]},
]

const FONT_SIZES = ['8', '9', '10', '11', '12', '14', '16', '18', '20', '24', '28', '32', '36', '48', '72']

// ── Plantilla de etiqueta alimentaria completa (estilo BARCOS DE CIDRA) ────────
const PLANTILLA_ALIMENTO_HTML = `
<div style="font-family: Arial, Helvetica, sans-serif; font-size: 8pt; line-height: 1.3; color: #000; padding: 8px 10px;">
  <!-- NOMBRE DEL PRODUCTO -->
  <p style="text-align: center; font-size: 22pt; font-weight: bold; margin: 0 0 12px 0; letter-spacing: 1px;">
    {{producto.nombre}}
  </p>

  <!-- BLOQUE CENTRAL: Tabla nutricional + Óvalo sanitario -->
  <table style="width: 100%; border: none; border-collapse: collapse; margin-bottom: 6px;">
    <tr>
      <td style="vertical-align: top; width: 58%; padding-right: 8px; border: none;">
        <!-- TABLA NUTRICIONAL -->
        <table style="width: 100%; border-collapse: collapse; border: 1.5px solid #000; font-size: 7.5pt;">
          <tr>
            <td style="border: 1px solid #000; padding: 2px 4px; font-weight: bold; font-size: 7.5pt;">INFORMACIÓN<br/>NUTRICIONAL</td>
            <td style="border: 1px solid #000; padding: 2px 4px; font-weight: bold; text-align: center; font-size: 7.5pt;">Por<br/>100g</td>
          </tr>
          <tr>
            <td style="border: 1px solid #000; padding: 1px 4px;">Valor energético</td>
            <td style="border: 1px solid #000; padding: 1px 4px; text-align: right; white-space: nowrap;">{{producto.valorEnergeticoKj}}kJ {{producto.valorEnergeticoKcal}}kcal</td>
          </tr>
          <tr>
            <td style="border: 1px solid #000; padding: 1px 4px;">Grasas</td>
            <td style="border: 1px solid #000; padding: 1px 4px; text-align: right;">{{producto.grasas}}g</td>
          </tr>
          <tr>
            <td style="border: 1px solid #000; padding: 1px 4px; padding-left: 10px; font-size: 7pt;">de las cuales saturadas</td>
            <td style="border: 1px solid #000; padding: 1px 4px; text-align: right;">{{producto.grasasSaturadas}}g</td>
          </tr>
          <tr>
            <td style="border: 1px solid #000; padding: 1px 4px;">Hidratos de carbono</td>
            <td style="border: 1px solid #000; padding: 1px 4px; text-align: right;">{{producto.hidratosCarbono}}g</td>
          </tr>
          <tr>
            <td style="border: 1px solid #000; padding: 1px 4px; padding-left: 10px; font-size: 7pt;">de los cuales azúcares</td>
            <td style="border: 1px solid #000; padding: 1px 4px; text-align: right;">{{producto.azucares}}g</td>
          </tr>
          <tr>
            <td style="border: 1px solid #000; padding: 1px 4px;">Proteínas</td>
            <td style="border: 1px solid #000; padding: 1px 4px; text-align: right;">{{producto.proteinas}}g</td>
          </tr>
          <tr>
            <td style="border: 1px solid #000; padding: 1px 4px;">Sal</td>
            <td style="border: 1px solid #000; padding: 1px 4px; text-align: right;">{{producto.sal}}g</td>
          </tr>
        </table>
      </td>
      <td style="vertical-align: middle; text-align: center; width: 42%; border: none;">
        <!-- ÓVALO REGISTRO SANITARIO -->
        <div style="display: inline-block; border: 2px solid #000; border-radius: 50%; width: 90px; height: 60px; text-align: center; line-height: 1.2; padding-top: 10px; font-size: 8pt; font-weight: bold;">
          ES<br/>{{empresa.nrgs}}<br/>CE
        </div>
      </td>
    </tr>
  </table>

  <!-- INGREDIENTES -->
  <p style="font-size: 7.5pt; margin: 4px 0 2px 0; text-align: justify;">
    <strong>INGREDIENTES:</strong> {{producto.ingredientesTexto}}
  </p>

  <!-- TRAZAS / ALÉRGENOS -->
  <p style="font-size: 7pt; margin: 2px 0; text-align: justify; color: #333;">
    Puede contener trazas de: {{producto.trazas}}
  </p>

  <!-- CONSERVACIÓN -->
  <p style="font-size: 7.5pt; margin: 6px 0 2px 0;">
    <strong>Conservar en lugar fresco y seco.</strong>
  </p>

  <!-- LOTE + FECHA CADUCIDAD -->
  <table style="width: 100%; border: none; border-collapse: collapse; margin: 4px 0;">
    <tr>
      <td style="border: none; font-size: 7.5pt; vertical-align: bottom; width: 50%;">
        <p style="margin: 0;"><strong>Lote:</strong> {{lote.codigoLote}}</p>
        <p style="margin: 2px 0 0 0; font-size: 8pt; font-weight: bold;">CONSUMIR PREFERENTEMENTE<br/>ANTES DE: {{lote.fechaCaducidad}}</p>
      </td>
      <td style="border: none; text-align: right; vertical-align: bottom; width: 50%;">
        <p style="margin: 0; font-size: 7.5pt;">{{empresa.nombre}}</p>
        <p style="margin: 0; font-size: 7pt; color: #333;">{{empresa.direccion}}</p>
      </td>
    </tr>
  </table>

  <!-- CÓDIGO DE BARRAS + PESO NETO -->
  <table style="width: 100%; border: none; border-collapse: collapse; margin-top: 4px;">
    <tr>
      <td style="border: none; vertical-align: bottom; width: 55%;">
        <img src="{{producto.barcode_img}}" alt="Código de barras" style="height: 40px; max-width: 180px;" /><br/>
        <span style="font-size: 7pt; letter-spacing: 2px;">{{producto.codigoBarras}}</span>
      </td>
      <td style="border: none; text-align: right; vertical-align: bottom; width: 45%; font-size: 9pt;">
        <strong>Peso neto: {{producto.pesoUnitarioGr}}g</strong>
      </td>
    </tr>
  </table>
</div>
`
const FONT_FAMILIES = [
  { value: 'Arial, sans-serif', label: 'Arial' },
  { value: 'Times New Roman, serif', label: 'Times New Roman' },
  { value: 'Courier New, monospace', label: 'Courier New' },
  { value: 'Georgia, serif', label: 'Georgia' },
  { value: 'Verdana, sans-serif', label: 'Verdana' },
  { value: 'Trebuchet MS, sans-serif', label: 'Trebuchet' },
  { value: 'Calibri, sans-serif', label: 'Calibri' },
]

const COLORS = [
  '#000000', '#434343', '#666666', '#999999', '#cccccc', '#ffffff',
  '#ff0000', '#ff6600', '#ffcc00', '#00cc00', '#0066ff', '#9900ff',
  '#cc0000', '#cc6600', '#cccc00', '#009900', '#003399', '#660099',
  '#800000', '#804000', '#808000', '#006600', '#002266', '#440066',
]

interface LabelEditorProps {
  content: string
  onChange: (html: string) => void
  pageWidthMm?: number
  pageHeightMm?: number
}

export default function LabelEditor({ content, onChange, pageWidthMm = 210, pageHeightMm = 297 }: LabelEditorProps) {
  const [showFields, setShowFields] = useState(false)
  const [showColors, setShowColors] = useState(false)
  const [showBgColors, setShowBgColors] = useState(false)
  const [showTableMenu, setShowTableMenu] = useState(false)
  const [fontSize, setFontSize] = useState('12')

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3, 4] },
      }),
      Underline,
      TextAlign.configure({
        types: ['heading', 'paragraph'],
      }),
      Table.configure({
        resizable: true,
        HTMLAttributes: { class: 'label-table' },
      }),
      TableRow,
      TableCell,
      TableHeader,
      TextStyle,
      Color,
      FontFamily,
      Highlight.configure({ multicolor: true }),
      Placeholder.configure({ placeholder: 'Comience a diseñar su etiqueta aquí…' }),
      Image.configure({ inline: true, allowBase64: true }),
    ],
    content: content || '',
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML())
    },
    editorProps: {
      attributes: {
        class: 'label-editor-content',
        style: `font-family: Arial, sans-serif; font-size: 12px; outline: none; min-height: 400px; padding: 20mm; box-sizing: border-box;`,
      },
    },
  })

  const insertField = useCallback((field: string) => {
    if (!editor) return
    editor.chain().focus().insertContent(
      `<span data-type="template-field" class="template-field" style="background-color: #dbeafe; color: #1e40af; padding: 1px 4px; border-radius: 3px; font-family: monospace; font-size: 0.9em;">${field}</span>&nbsp;`
    ).run()
    setShowFields(false)
  }, [editor])

  const insertNutritionalTable = useCallback(() => {
    if (!editor) return
    editor.chain().focus().insertContent(`
      <table style="border-collapse: collapse; width: 100%; border: 2px solid #000; font-size: 11px;">
        <thead>
          <tr>
            <th colspan="2" style="border: 1px solid #000; padding: 4px 8px; text-align: center; font-weight: bold; background-color: #f3f4f6;">
              INFORMACIÓN NUTRICIONAL
            </th>
          </tr>
          <tr>
            <th style="border: 1px solid #000; padding: 3px 8px; text-align: left; font-weight: bold;">Valores medios</th>
            <th style="border: 1px solid #000; padding: 3px 8px; text-align: right; font-weight: bold;">Por 100 g</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style="border: 1px solid #000; padding: 3px 8px;">Valor energético</td>
            <td style="border: 1px solid #000; padding: 3px 8px; text-align: right;">{{producto.valorEnergeticoKj}} kJ / {{producto.valorEnergeticoKcal}} kcal</td>
          </tr>
          <tr>
            <td style="border: 1px solid #000; padding: 3px 8px;">Grasas</td>
            <td style="border: 1px solid #000; padding: 3px 8px; text-align: right;">{{producto.grasas}} g</td>
          </tr>
          <tr>
            <td style="border: 1px solid #000; padding: 3px 8px; padding-left: 20px; color: #666;">de las cuales saturadas</td>
            <td style="border: 1px solid #000; padding: 3px 8px; text-align: right;">{{producto.grasasSaturadas}} g</td>
          </tr>
          <tr>
            <td style="border: 1px solid #000; padding: 3px 8px;">Hidratos de carbono</td>
            <td style="border: 1px solid #000; padding: 3px 8px; text-align: right;">{{producto.hidratosCarbono}} g</td>
          </tr>
          <tr>
            <td style="border: 1px solid #000; padding: 3px 8px; padding-left: 20px; color: #666;">de los cuales azúcares</td>
            <td style="border: 1px solid #000; padding: 3px 8px; text-align: right;">{{producto.azucares}} g</td>
          </tr>
          <tr>
            <td style="border: 1px solid #000; padding: 3px 8px;">Proteínas</td>
            <td style="border: 1px solid #000; padding: 3px 8px; text-align: right;">{{producto.proteinas}} g</td>
          </tr>
          <tr>
            <td style="border: 1px solid #000; padding: 3px 8px;">Sal</td>
            <td style="border: 1px solid #000; padding: 3px 8px; text-align: right;">{{producto.sal}} g</td>
          </tr>
        </tbody>
      </table>
    `).run()
  }, [editor])

  const applyFontSize = useCallback((size: string) => {
    if (!editor) return
    setFontSize(size)
    editor.chain().focus().setMark('textStyle', { fontSize: `${size}px` }).run()
  }, [editor])

  const insertBarcode = useCallback(() => {
    if (!editor) return
    editor.chain().focus().insertContent(
      `<img src="{{producto.barcode_img}}" alt="Código de barras" class="barcode" style="max-width: 200px; height: auto;" />`
    ).run()
  }, [editor])

  const loadFoodLabelTemplate = useCallback(() => {
    if (!editor) return
    if (editor.getHTML().replace(/<[^>]*>/g, '').trim().length > 0) {
      if (!confirm('¿Reemplazar el contenido actual con la plantilla de etiqueta alimentaria?')) return
    }
    editor.commands.setContent(PLANTILLA_ALIMENTO_HTML)
  }, [editor])

  if (!editor) return null

  return (
    <div className="bg-white rounded-xl border border-cream-200 overflow-hidden flex flex-col" style={{ minHeight: '600px' }}>
      {/* ── Toolbar Row 1: File operations & Font ── */}
      <div className="flex items-center gap-1 px-2 py-1.5 border-b border-gray-200 bg-gray-50 flex-wrap">
        {/* Font Family */}
        <select
          value={editor.getAttributes('textStyle').fontFamily || 'Arial, sans-serif'}
          onChange={e => editor.chain().focus().setFontFamily(e.target.value).run()}
          className="h-7 px-1.5 text-xs border border-gray-300 rounded bg-white w-32"
          title="Fuente"
        >
          {FONT_FAMILIES.map(f => (
            <option key={f.value} value={f.value}>{f.label}</option>
          ))}
        </select>

        {/* Font Size */}
        <select
          value={fontSize}
          onChange={e => applyFontSize(e.target.value)}
          className="h-7 px-1.5 text-xs border border-gray-300 rounded bg-white w-14"
          title="Tamaño"
        >
          {FONT_SIZES.map(s => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>

        <div className="w-px h-5 bg-gray-300 mx-0.5" />

        {/* Bold, Italic, Underline, Strikethrough */}
        <ToolBtn
          active={editor.isActive('bold')}
          onClick={() => editor.chain().focus().toggleBold().run()}
          title="Negrita (Ctrl+B)"
        >
          <Bold className="w-3.5 h-3.5" />
        </ToolBtn>
        <ToolBtn
          active={editor.isActive('italic')}
          onClick={() => editor.chain().focus().toggleItalic().run()}
          title="Cursiva (Ctrl+I)"
        >
          <Italic className="w-3.5 h-3.5" />
        </ToolBtn>
        <ToolBtn
          active={editor.isActive('underline')}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          title="Subrayado (Ctrl+U)"
        >
          <UnderlineIcon className="w-3.5 h-3.5" />
        </ToolBtn>
        <ToolBtn
          active={editor.isActive('strike')}
          onClick={() => editor.chain().focus().toggleStrike().run()}
          title="Tachado"
        >
          <Strikethrough className="w-3.5 h-3.5" />
        </ToolBtn>

        <div className="w-px h-5 bg-gray-300 mx-0.5" />

        {/* Text color */}
        <div className="relative">
          <ToolBtn onClick={() => { setShowColors(!showColors); setShowBgColors(false) }} title="Color de texto">
            <div className="flex flex-col items-center">
              <Type className="w-3.5 h-3.5" />
              <div className="w-3.5 h-1 mt-0.5 rounded-sm" style={{ backgroundColor: editor.getAttributes('textStyle').color || '#000' }} />
            </div>
          </ToolBtn>
          {showColors && (
            <ColorPicker
              colors={COLORS}
              onSelect={c => { editor.chain().focus().setColor(c).run(); setShowColors(false) }}
              onClose={() => setShowColors(false)}
            />
          )}
        </div>

        {/* Highlight color */}
        <div className="relative">
          <ToolBtn onClick={() => { setShowBgColors(!showBgColors); setShowColors(false) }} title="Color de resaltado">
            <Paintbrush className="w-3.5 h-3.5" />
          </ToolBtn>
          {showBgColors && (
            <ColorPicker
              colors={COLORS}
              onSelect={c => { editor.chain().focus().toggleHighlight({ color: c }).run(); setShowBgColors(false) }}
              onClose={() => setShowBgColors(false)}
              includeNone
              onNone={() => { editor.chain().focus().unsetHighlight().run(); setShowBgColors(false) }}
            />
          )}
        </div>

        <div className="w-px h-5 bg-gray-300 mx-0.5" />

        {/* Alignment */}
        <ToolBtn
          active={editor.isActive({ textAlign: 'left' })}
          onClick={() => editor.chain().focus().setTextAlign('left').run()}
          title="Alinear izquierda"
        >
          <AlignLeft className="w-3.5 h-3.5" />
        </ToolBtn>
        <ToolBtn
          active={editor.isActive({ textAlign: 'center' })}
          onClick={() => editor.chain().focus().setTextAlign('center').run()}
          title="Centrar"
        >
          <AlignCenter className="w-3.5 h-3.5" />
        </ToolBtn>
        <ToolBtn
          active={editor.isActive({ textAlign: 'right' })}
          onClick={() => editor.chain().focus().setTextAlign('right').run()}
          title="Alinear derecha"
        >
          <AlignRight className="w-3.5 h-3.5" />
        </ToolBtn>
        <ToolBtn
          active={editor.isActive({ textAlign: 'justify' })}
          onClick={() => editor.chain().focus().setTextAlign('justify').run()}
          title="Justificar"
        >
          <AlignJustify className="w-3.5 h-3.5" />
        </ToolBtn>

        <div className="w-px h-5 bg-gray-300 mx-0.5" />

        {/* Headings */}
        <ToolBtn
          active={editor.isActive('heading', { level: 1 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          title="Título 1"
        >
          <Heading1 className="w-3.5 h-3.5" />
        </ToolBtn>
        <ToolBtn
          active={editor.isActive('heading', { level: 2 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          title="Título 2"
        >
          <Heading2 className="w-3.5 h-3.5" />
        </ToolBtn>
        <ToolBtn
          active={editor.isActive('heading', { level: 3 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          title="Título 3"
        >
          <Heading3 className="w-3.5 h-3.5" />
        </ToolBtn>

        <div className="w-px h-5 bg-gray-300 mx-0.5" />

        {/* Lists */}
        <ToolBtn
          active={editor.isActive('bulletList')}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          title="Lista con viñetas"
        >
          <List className="w-3.5 h-3.5" />
        </ToolBtn>
        <ToolBtn
          active={editor.isActive('orderedList')}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          title="Lista numerada"
        >
          <ListOrdered className="w-3.5 h-3.5" />
        </ToolBtn>

        {/* Horizontal rule */}
        <ToolBtn
          onClick={() => editor.chain().focus().setHorizontalRule().run()}
          title="Línea horizontal"
        >
          <Minus className="w-3.5 h-3.5" />
        </ToolBtn>

        <div className="w-px h-5 bg-gray-300 mx-0.5" />

        {/* Table */}
        <div className="relative">
          <ToolBtn
            active={editor.isActive('table')}
            onClick={() => setShowTableMenu(!showTableMenu)}
            title="Tabla"
          >
            <TableIcon className="w-3.5 h-3.5" />
            <ChevronDown className="w-2.5 h-2.5 ml-0.5" />
          </ToolBtn>
          {showTableMenu && (
            <TableMenu
              editor={editor}
              onInsertNutritional={insertNutritionalTable}
              onClose={() => setShowTableMenu(false)}
            />
          )}
        </div>

        {/* Image */}
        <ToolBtn onClick={() => {
          const url = prompt('URL de la imagen:')
          if (url) editor.chain().focus().setImage({ src: url }).run()
        }} title="Insertar imagen">
          <ImageIcon className="w-3.5 h-3.5" />
        </ToolBtn>

        <div className="w-px h-5 bg-gray-300 mx-0.5" />

        {/* Template fields */}
        <div className="relative">
          <button
            onClick={() => setShowFields(!showFields)}
            className="flex items-center gap-1 h-7 px-2 text-xs font-medium rounded bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 transition-colors"
            title="Insertar campo de plantilla"
          >
            <Tag className="w-3.5 h-3.5" />
            Campos
            <ChevronDown className="w-2.5 h-2.5" />
          </button>
          {showFields && (
            <FieldPicker fields={TEMPLATE_FIELDS} onSelect={insertField} onClose={() => setShowFields(false)} />
          )}
        </div>

        {/* Nutritional table quick insert */}
        <button
          onClick={insertNutritionalTable}
          className="flex items-center gap-1 h-7 px-2 text-xs font-medium rounded bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 transition-colors"
          title="Insertar tabla nutricional completa"
        >
          <TableIcon className="w-3.5 h-3.5" />
          Nutricional
        </button>

        {/* Barcode placeholder insert */}
        <button
          onClick={insertBarcode}
          className="flex items-center gap-1 h-7 px-2 text-xs font-medium rounded bg-violet-50 text-violet-700 border border-violet-200 hover:bg-violet-100 transition-colors"
          title="Insertar código de barras (se rellenará con el producto)"
        >
          <Barcode className="w-3.5 h-3.5" />
          Barcode
        </button>

        {/* Full food label template */}
        <button
          onClick={loadFoodLabelTemplate}
          className="flex items-center gap-1 h-7 px-2 text-xs font-medium rounded bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 transition-colors"
          title="Cargar plantilla de etiqueta alimentaria completa"
        >
          <FileText className="w-3.5 h-3.5" />
          Etiqueta
        </button>

        <div className="flex-1" />

        {/* Undo / Redo */}
        <ToolBtn
          onClick={() => editor.chain().focus().undo().run()}
          disabled={!editor.can().undo()}
          title="Deshacer (Ctrl+Z)"
        >
          <Undo2 className="w-3.5 h-3.5" />
        </ToolBtn>
        <ToolBtn
          onClick={() => editor.chain().focus().redo().run()}
          disabled={!editor.can().redo()}
          title="Rehacer (Ctrl+Y)"
        >
          <Redo2 className="w-3.5 h-3.5" />
        </ToolBtn>
      </div>

      {/* ── Ruler (visual) ── */}
      <div className="h-6 border-b border-gray-200 bg-gray-100 flex items-center px-2">
        <div className="flex-1 flex items-center justify-between text-[9px] text-gray-400 font-mono px-[20mm]">
          {Array.from({ length: Math.ceil(pageWidthMm / 10) + 1 }, (_, i) => (
            <span key={i}>{i * 10}</span>
          ))}
        </div>
        <span className="text-[9px] text-gray-400 ml-2">mm</span>
      </div>

      {/* ── Editor Area ── */}
      <div className="flex-1 overflow-auto bg-gray-200 p-6 flex justify-center">
        <div
          className="bg-white shadow-lg"
          style={{
            width: `${pageWidthMm}mm`,
            minHeight: `${pageHeightMm}mm`,
            maxWidth: '100%',
          }}
        >
          <EditorContent editor={editor} />
        </div>
      </div>

      {/* ── Status bar ── */}
      <div className="flex items-center justify-between px-3 py-1 border-t border-gray-200 bg-gray-50 text-[10px] text-gray-500">
        <span>Etiqueta: {pageWidthMm} × {pageHeightMm} mm</span>
        <span>{editor.storage.characterCount?.characters?.() ?? '—'} caracteres</span>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// SUB-COMPONENTS
// ══════════════════════════════════════════════════════════════════════════════

function ToolBtn({ children, active, disabled, onClick, title, className = '' }: {
  children: React.ReactNode
  active?: boolean
  disabled?: boolean
  onClick?: () => void
  title?: string
  className?: string
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`
        flex items-center justify-center h-7 min-w-[28px] px-1 rounded transition-colors
        ${active ? 'bg-brand-100 text-brand-700' : 'text-gray-600 hover:bg-gray-200'}
        ${disabled ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer'}
        ${className}
      `}
    >
      {children}
    </button>
  )
}

function ColorPicker({ colors, onSelect, onClose, includeNone, onNone }: {
  colors: string[]
  onSelect: (color: string) => void
  onClose: () => void
  includeNone?: boolean
  onNone?: () => void
}) {
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className="absolute top-full left-0 mt-1 z-50 bg-white rounded-lg shadow-xl border border-gray-200 p-2 w-48">
        <div className="grid grid-cols-6 gap-1">
          {colors.map(c => (
            <button
              key={c}
              onClick={() => onSelect(c)}
              className="w-6 h-6 rounded border border-gray-300 hover:scale-110 transition-transform"
              style={{ backgroundColor: c }}
              title={c}
            />
          ))}
        </div>
        {includeNone && onNone && (
          <button
            onClick={onNone}
            className="w-full mt-1.5 px-2 py-1 text-xs text-gray-600 border border-gray-200 rounded hover:bg-gray-100"
          >
            Sin resaltado
          </button>
        )}
      </div>
    </>
  )
}

function FieldPicker({ fields, onSelect, onClose }: {
  fields: typeof TEMPLATE_FIELDS
  onSelect: (field: string) => void
  onClose: () => void
}) {
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className="absolute top-full left-0 mt-1 z-50 bg-white rounded-xl shadow-xl border border-gray-200 w-72 max-h-80 overflow-y-auto">
        {fields.map(group => (
          <div key={group.group}>
            <div className="px-3 py-1.5 text-[10px] font-bold text-gray-400 uppercase tracking-wide bg-gray-50 sticky top-0">
              {group.group}
            </div>
            {group.items.map(item => (
              <button
                key={item.key}
                onClick={() => onSelect(item.key)}
                className="w-full text-left px-3 py-1.5 text-xs hover:bg-blue-50 flex items-center justify-between group"
              >
                <span className="text-gray-700">{item.label}</span>
                <code className="text-[9px] text-blue-500 opacity-0 group-hover:opacity-100 transition-opacity">{item.key}</code>
              </button>
            ))}
          </div>
        ))}
      </div>
    </>
  )
}

function TableMenu({ editor, onInsertNutritional, onClose }: {
  editor: ReturnType<typeof useEditor>
  onInsertNutritional: () => void
  onClose: () => void
}) {
  if (!editor) return null
  const isInTable = editor.isActive('table')

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className="absolute top-full left-0 mt-1 z-50 bg-white rounded-xl shadow-xl border border-gray-200 w-56 py-1">
        {!isInTable ? (
          <>
            <MenuBtn onClick={() => { editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(); onClose() }}>
              <Plus className="w-3.5 h-3.5 mr-2" /> Tabla 3×3
            </MenuBtn>
            <MenuBtn onClick={() => { editor.chain().focus().insertTable({ rows: 2, cols: 2, withHeaderRow: true }).run(); onClose() }}>
              <Plus className="w-3.5 h-3.5 mr-2" /> Tabla 2×2
            </MenuBtn>
            <MenuBtn onClick={() => { editor.chain().focus().insertTable({ rows: 8, cols: 2, withHeaderRow: true }).run(); onClose() }}>
              <Plus className="w-3.5 h-3.5 mr-2" /> Tabla nutricional (8×2)
            </MenuBtn>
            <div className="border-t border-gray-100 my-1" />
            <MenuBtn onClick={() => { onInsertNutritional(); onClose() }}>
              <TableIcon className="w-3.5 h-3.5 mr-2 text-emerald-600" /> Nutricional completa
            </MenuBtn>
          </>
        ) : (
          <>
            <MenuBtn onClick={() => { editor.chain().focus().addColumnAfter().run(); onClose() }}>
              <MoveHorizontal className="w-3.5 h-3.5 mr-2" /> Añadir columna
            </MenuBtn>
            <MenuBtn onClick={() => { editor.chain().focus().addRowAfter().run(); onClose() }}>
              <MoveVertical className="w-3.5 h-3.5 mr-2" /> Añadir fila
            </MenuBtn>
            <div className="border-t border-gray-100 my-1" />
            <MenuBtn onClick={() => { editor.chain().focus().deleteColumn().run(); onClose() }}>
              <Trash2 className="w-3.5 h-3.5 mr-2 text-red-500" /> Eliminar columna
            </MenuBtn>
            <MenuBtn onClick={() => { editor.chain().focus().deleteRow().run(); onClose() }}>
              <Trash2 className="w-3.5 h-3.5 mr-2 text-red-500" /> Eliminar fila
            </MenuBtn>
            <MenuBtn onClick={() => { editor.chain().focus().mergeCells().run(); onClose() }}>
              <Merge className="w-3.5 h-3.5 mr-2" /> Fusionar celdas
            </MenuBtn>
            <MenuBtn onClick={() => { editor.chain().focus().splitCell().run(); onClose() }}>
              <Split className="w-3.5 h-3.5 mr-2" /> Dividir celda
            </MenuBtn>
            <div className="border-t border-gray-100 my-1" />
            <MenuBtn onClick={() => { editor.chain().focus().deleteTable().run(); onClose() }}>
              <Trash2 className="w-3.5 h-3.5 mr-2 text-red-500" /> Eliminar tabla
            </MenuBtn>
          </>
        )}
      </div>
    </>
  )
}

function MenuBtn({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full px-3 py-1.5 text-xs text-left flex items-center text-gray-700 hover:bg-gray-100 transition-colors"
    >
      {children}
    </button>
  )
}
