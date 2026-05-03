import { useEffect, ReactNode } from 'react'
import { X } from 'lucide-react'

interface ModalProps {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  width?: string
}

export default function Modal({ open, onClose, title, children, width = 'max-w-lg' }: ModalProps) {
  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    if (open) window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Dialog */}
      <div className={`relative bg-surface border border-border rounded-2xl shadow-2xl w-full ${width} mx-4 max-h-[90vh] overflow-y-auto`}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-base font-semibold text-text1">{title}</h2>
          <button onClick={onClose} className="p-1 rounded-lg text-text2 hover:text-text1 hover:bg-surface2 transition-colors">
            <X size={16} />
          </button>
        </div>
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>
  )
}
