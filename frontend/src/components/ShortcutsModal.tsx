import { useEffect } from 'react'
import { X, Keyboard } from 'lucide-react'
import { SHORTCUTS } from '../hooks/useKeyboardShortcuts'

interface ShortcutsModalProps {
  open: boolean
  onClose: () => void
}

export default function ShortcutsModal({ open, onClose }: ShortcutsModalProps) {
  // Esc to close
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-md mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2.5">
            <Keyboard className="w-5 h-5 text-brand-600" />
            <h2 className="text-base font-semibold text-gray-900">Atajos de teclado</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-4 space-y-1.5 max-h-96 overflow-y-auto">
          {SHORTCUTS.map(s => (
            <div
              key={s.key}
              className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0"
            >
              <span className="text-sm text-gray-700">{s.description}</span>
              <kbd className="inline-flex items-center gap-0.5 px-2 py-1 text-xs font-semibold text-gray-600 bg-gray-100 border border-gray-200 rounded-md font-mono">
                {s.key}
              </kbd>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-gray-50 border-t border-gray-100 text-xs text-gray-400 text-center">
          Pulsa <kbd className="inline-flex items-center px-1.5 py-0.5 text-xs font-mono bg-white border border-gray-200 rounded">Esc</kbd> para cerrar
        </div>
      </div>
    </div>
  )
}
