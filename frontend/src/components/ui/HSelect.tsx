import { useState, useRef, useEffect, useId } from 'react'
import { ChevronDown, Check } from 'lucide-react'

// ---------------------------------------------------------------------------
// HSelect — componente select custom con diseno del sistema Hestia.
//
// Reemplaza el <select> nativo para tener control total sobre el dropdown:
// fondo, texto y hover usan los tokens h-* y respetan dark/light mode.
//
// Uso basico:
//   <HSelect
//     value={catFiltro}
//     onChange={setCatFiltro}
//     options={[
//       { value: '', label: 'Todas las categorias' },
//       { value: '1', label: 'Enfermeria' },
//     ]}
//   />
//
// Props:
//   value      string — valor seleccionado actualmente
//   onChange   (v: string) => void
//   options    { value: string; label: string; disabled?: boolean }[]
//   placeholder string — label de la opcion vacia (shortcut para la primera option)
//   size       'sm' | 'md'  — 'sm' para filtros inline, 'md' para formularios
//   disabled   boolean
//   className  string — clases extra para el contenedor
// ---------------------------------------------------------------------------

export interface HSelectOption {
  value: string
  label: string
  disabled?: boolean
}

interface HSelectProps {
  value: string
  onChange: (value: string) => void
  options: HSelectOption[]
  placeholder?: string
  size?: 'sm' | 'md'
  disabled?: boolean
  required?: boolean
  className?: string
}

export function HSelect({
  value,
  onChange,
  options,
  placeholder,
  size = 'md',
  disabled = false,
  className = '',
}: HSelectProps) {
  const [open, setOpen]     = useState(false)
  const containerRef        = useRef<HTMLDivElement>(null)
  const listRef             = useRef<HTMLUListElement>(null)
  const id                  = useId()

  // Opcion actualmente seleccionada para mostrar en el trigger
  const allOptions: HSelectOption[] = placeholder
    ? [{ value: '', label: placeholder }, ...options]
    : options

  const selected = allOptions.find(o => o.value === value)
  const label    = selected?.label ?? placeholder ?? ''

  // Cerrar al hacer click fuera
  useEffect(() => {
    if (!open) return
    function handler(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  // Cerrar con Escape, navegar con teclado
  useEffect(() => {
    if (!open) return
    function handler(e: KeyboardEvent) {
      if (e.key === 'Escape') { setOpen(false); return }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        const items = listRef.current?.querySelectorAll<HTMLLIElement>('[role="option"]')
        if (!items) return
        const focused = document.activeElement
        const idx     = Array.from(items).indexOf(focused as HTMLLIElement)
        const next    = e.key === 'ArrowDown'
          ? Math.min(idx + 1, items.length - 1)
          : Math.max(idx - 1, 0)
        items[next]?.focus()
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open])

  function selectOption(v: string) {
    onChange(v)
    setOpen(false)
  }

  // Estilos segun size
  const triggerPy = size === 'sm' ? 'py-1.5' : 'py-2.5'
  const textSize  = size === 'sm' ? 'text-sm' : 'text-sm'

  return (
    <div
      ref={containerRef}
      className={`relative ${className}`}
      style={{ minWidth: size === 'sm' ? '144px' : undefined }}
    >
      {/* Trigger */}
      <button
        type="button"
        id={id}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => !disabled && setOpen(v => !v)}
        className={[
          'w-full flex items-center justify-between gap-2',
          'px-3 rounded-lg border transition-colors duration-150',
          'text-left cursor-pointer',
          triggerPy,
          textSize,
          disabled
            ? 'opacity-50 cursor-not-allowed'
            : 'cursor-pointer',
        ].join(' ')}
        style={{
          background:   'var(--h-bg-elevated)',
          borderColor:  open ? 'var(--h-border-visible)' : 'var(--h-border-subtle)',
          color:        value ? 'var(--h-text-primary)' : 'var(--h-text-tertiary)',
          boxShadow:    open ? '0 0 0 2px var(--h-border-subtle)' : 'none',
        }}
      >
        <span className="truncate">{label}</span>
        <ChevronDown
          size={14}
          className="flex-shrink-0 transition-transform duration-200"
          style={{
            color: 'var(--h-text-tertiary)',
            transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
          }}
        />
      </button>

      {/* Dropdown */}
      {open && (
        <ul
          ref={listRef}
          role="listbox"
          aria-labelledby={id}
          className="absolute z-[200] left-0 right-0 mt-1.5 rounded-xl
                     overflow-y-auto py-1 shadow-2xl"
          style={{
            background:   'var(--h-bg-elevated)',
            border:       '1px solid var(--h-border-visible)',
            maxHeight:    '240px',
            // Sombra con color del tema para integrarse en dark mode
            boxShadow:    '0 8px 32px rgba(0,0,0,0.35), 0 0 0 1px var(--h-border-subtle)',
          }}
        >
          {allOptions.map(opt => {
            const isSelected = opt.value === value
            const isEmpty    = opt.value === '' && placeholder
            return (
              <li
                key={opt.value}
                role="option"
                aria-selected={isSelected}
                tabIndex={opt.disabled ? -1 : 0}
                onClick={() => !opt.disabled && selectOption(opt.value)}
                onKeyDown={e => {
                  if ((e.key === 'Enter' || e.key === ' ') && !opt.disabled) {
                    e.preventDefault()
                    selectOption(opt.value)
                  }
                }}
                className={[
                  'flex items-center justify-between gap-2 px-3 py-2',
                  'text-sm transition-colors duration-100 outline-none',
                  opt.disabled
                    ? 'opacity-40 cursor-not-allowed'
                    : 'cursor-pointer',
                ].join(' ')}
                style={{
                  color: isSelected
                    ? 'var(--h-teal-hover)'
                    : isEmpty
                      ? 'var(--h-text-tertiary)'
                      : 'var(--h-text-secondary)',
                  background: isSelected
                    ? 'var(--h-teal-subtle)'
                    : 'transparent',
                  fontWeight: isSelected ? 600 : 400,
                }}
                onMouseEnter={e => {
                  if (!isSelected && !opt.disabled) {
                    (e.currentTarget as HTMLElement).style.background = 'var(--h-bg-highlight)'
                    ;(e.currentTarget as HTMLElement).style.color = 'var(--h-text-primary)'
                  }
                }}
                onMouseLeave={e => {
                  if (!isSelected) {
                    (e.currentTarget as HTMLElement).style.background = 'transparent'
                    ;(e.currentTarget as HTMLElement).style.color = isEmpty
                      ? 'var(--h-text-tertiary)'
                      : 'var(--h-text-secondary)'
                  }
                }}
              >
                <span className="truncate">{opt.label}</span>
                {isSelected && (
                  <Check size={13} className="flex-shrink-0"
                    style={{ color: 'var(--h-teal-hover)' }} />
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
