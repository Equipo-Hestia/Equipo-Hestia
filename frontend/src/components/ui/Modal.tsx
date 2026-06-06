import { X } from 'lucide-react'

interface ModalProps {
  title:    string
  children: React.ReactNode
  onClose:  () => void
  size?:    'sm' | 'md' | 'lg'
}

const widths = { sm: 'max-w-sm', md: 'max-w-md', lg: 'max-w-lg' }

export function Modal({ title, children, onClose, size = 'md' }: ModalProps) {
  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm
                 flex items-center justify-center z-50 p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className={`
          bg-h-surface border border-h-subtle rounded-2xl shadow-2xl
          w-full ${widths[size]} max-h-[90vh] overflow-y-auto
        `}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-h-subtle">
          <h2 className="font-semibold text-h-primary text-base">{title}</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center
                       text-h-tertiary hover:bg-h-elevated hover:text-h-secondary
                       transition-colors duration-150"
          >
            <X size={15} />
          </button>
        </div>

        {/* Contenido */}
        <div className="p-6">{children}</div>
      </div>
    </div>
  )
}
