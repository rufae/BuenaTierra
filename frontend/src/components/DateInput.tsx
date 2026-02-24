/**
 * DateInput – Campo de fecha DD/MM/AAAA con calendario propio en español.
 * No usa <input type="date"> nativo → el popup nunca muestra MM/DD/YYYY del SO.
 *
 * Uso:
 *   <DateInput value={fechaISO} onChange={setFechaISO} />
 *   <DateInput value={fecha} onChange={v => f('fecha', v)} className="w-full" required />
 */

import { useEffect, useRef, useState } from 'react'
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react'

// ── constantes ────────────────────────────────────────────────────────────────

const MESES = [
  'Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre',
]
const DIAS_SEMANA = ['Lu','Ma','Mi','Ju','Vi','Sá','Do']

// ── helpers ───────────────────────────────────────────────────────────────────

/** YYYY-MM-DD → DD/MM/YYYY */
function isoToDisplay(iso: string): string {
  if (!iso) return ''
  const parts = iso.split('T')[0].split('-')
  if (parts.length !== 3) return ''
  const [y, m, d] = parts
  return `${d.padStart(2,'0')}/${m.padStart(2,'0')}/${y}`
}

/** DD/MM/YYYY (o variantes con -) → YYYY-MM-DD, '' si inválido */
function displayToIso(raw: string): string {
  const r = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/)
  if (!r) return ''
  const [, d, m, y] = r
  return `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`
}

/** YYYY-MM-DD → Date a medianoche local (evita desfase UTC) */
function isoToDate(iso: string): Date | null {
  if (!iso) return null
  const p = iso.split('T')[0].split('-').map(Number)
  if (p.length !== 3 || p.some(isNaN)) return null
  return new Date(p[0], p[1] - 1, p[2])
}

/** Date → YYYY-MM-DD */
function dateToIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

/** Construye la cuadrícula mensual alineada en lunes */
function buildCalendar(view: Date): (Date | null)[] {
  const { getFullYear: y, getMonth: m } = view
  const year = y.call(view); const month = m.call(view)
  const first = new Date(year, month, 1)
  let startDow = first.getDay() - 1          // 0=lu … 6=do
  if (startDow < 0) startDow = 6
  const days: (Date | null)[] = Array(startDow).fill(null)
  const total = new Date(year, month + 1, 0).getDate()
  for (let n = 1; n <= total; n++) days.push(new Date(year, month, n))
  return days
}

// ── tipos ─────────────────────────────────────────────────────────────────────

export interface DateInputProps {
  /** Fecha en formato ISO YYYY-MM-DD o cadena vacía */
  value: string
  /** Devuelve YYYY-MM-DD o '' */
  onChange: (v: string) => void
  min?: string
  max?: string
  required?: boolean
  disabled?: boolean
  /** Clases Tailwind extra aplicadas al contenedor */
  className?: string
  placeholder?: string
  id?: string
}

// ── componente ────────────────────────────────────────────────────────────────

export function DateInput({
  value,
  onChange,
  min,
  max,
  required,
  disabled,
  className = '',
  placeholder = 'DD/MM/AAAA',
  id,
}: DateInputProps) {
  const [text, setText] = useState(isoToDisplay(value))
  const [open, setOpen] = useState(false)
  const [view, setView] = useState<Date>(() => isoToDate(value) ?? new Date())
  const wrapRef = useRef<HTMLDivElement>(null)

  // Sincroniza cuando el valor externo cambia
  useEffect(() => {
    setText(isoToDisplay(value))
    const d = isoToDate(value)
    if (d) setView(d)
  }, [value])

  // Cierra el picker al hacer clic fuera
  useEffect(() => {
    if (!open) return
    const fn = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', fn)
    return () => document.removeEventListener('mousedown', fn)
  }, [open])

  function handleText(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value
    setText(raw)
    const iso = displayToIso(raw)
    if (iso) { onChange(iso); const d = isoToDate(iso); if (d) setView(d) }
    else if (raw === '') onChange('')
  }

  function selectDay(d: Date) {
    const iso = dateToIso(d)
    onChange(iso)
    setText(isoToDisplay(iso))
    setOpen(false)
  }

  const selected  = isoToDate(value)
  const minDate   = min ? isoToDate(min) : null
  const maxDate   = max ? isoToDate(max) : null
  const todayIso  = dateToIso(new Date())
  const calDays   = buildCalendar(view)

  const BOX =
    'inline-flex items-center w-full border border-gray-200 rounded-lg overflow-hidden bg-white ' +
    'focus-within:ring-2 focus-within:ring-brand-500/40 focus-within:border-brand-500'

  return (
    <div ref={wrapRef} className={`relative ${className}`}>
      {/* ── Caja de texto ────────────────────────────────────────────── */}
      <div className={BOX}>
        <input
          id={id}
          type="text"
          value={text}
          onChange={handleText}
          placeholder={placeholder}
          required={required}
          disabled={disabled}
          maxLength={10}
          autoComplete="off"
          onKeyDown={e => e.key === 'Escape' && setOpen(false)}
          className="flex-1 px-3 py-1.5 text-sm outline-none bg-transparent min-w-0 disabled:text-gray-400"
        />
        <button
          type="button"
          tabIndex={-1}
          disabled={disabled}
          onClick={() => !disabled && setOpen(o => !o)}
          className="flex items-center justify-center w-8 h-[34px] border-l border-gray-100
                     text-gray-400 hover:text-brand-600 hover:bg-gray-50 transition-colors shrink-0"
        >
          <Calendar className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* ── Calendario desplegable ───────────────────────────────────── */}
      {open && (
        <div
          className="absolute z-50 mt-1 left-0 bg-white border border-gray-200
                     rounded-xl shadow-xl p-3 w-64 select-none"
        >
          {/* Cabecera mes/año */}
          <div className="flex items-center justify-between mb-2">
            <button type="button" onClick={() => setView(v => new Date(v.getFullYear(), v.getMonth()-1, 1))}
              className="p-1 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-sm font-semibold text-gray-800 capitalize">
              {MESES[view.getMonth()]} {view.getFullYear()}
            </span>
            <button type="button" onClick={() => setView(v => new Date(v.getFullYear(), v.getMonth()+1, 1))}
              className="p-1 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Nombres de días */}
          <div className="grid grid-cols-7 mb-1">
            {DIAS_SEMANA.map(d => (
              <div key={d} className="text-center text-[10px] font-medium text-gray-400 py-0.5">{d}</div>
            ))}
          </div>

          {/* Cuadrícula días */}
          <div className="grid grid-cols-7 gap-px">
            {calDays.map((d, i) => {
              if (!d) return <div key={i} />
              const iso        = dateToIso(d)
              const isSelected = selected ? dateToIso(selected) === iso : false
              const isToday    = todayIso === iso
              const disabled_  = (minDate && d < minDate) || (maxDate && d > maxDate)
              return (
                <button
                  key={i}
                  type="button"
                  disabled={!!disabled_}
                  onClick={() => selectDay(d)}
                  className={[
                    'w-full aspect-square text-xs rounded-lg transition-colors',
                    disabled_
                      ? 'text-gray-300 cursor-not-allowed'
                      : 'hover:bg-brand-50 hover:text-brand-700 cursor-pointer',
                    isSelected
                      ? '!bg-brand-600 !text-white font-semibold hover:!bg-brand-700'
                      : '',
                    isToday && !isSelected
                      ? 'font-bold text-brand-600 ring-1 ring-inset ring-brand-300'
                      : '',
                  ].filter(Boolean).join(' ')}
                >
                  {d.getDate()}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

export default DateInput
