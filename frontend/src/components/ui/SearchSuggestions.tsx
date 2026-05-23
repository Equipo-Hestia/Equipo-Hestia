import { useState, useEffect, useRef } from 'react'
import { Search } from 'lucide-react'
import { api } from '../../api/client'

interface Props {
  value: string
  onChange: (val: string) => void
  onSearch: (val: string) => void
  placeholder?: string
  sugerenciasUrl?: string
}

/**
 * Campo de búsqueda con dropdown de sugerencias.
 *
 * - Debounce de 250 ms para no saturar el backend.
 * - Mínimo 2 caracteres para activar las sugerencias.
 * - Navegación con teclado: ArrowUp/Down selecciona, Enter confirma, Escape cierra.
 * - onMouseDown en cada sugerencia usa preventDefault() para que el blur del
 *   input no cierre el dropdown antes de que el click se procese.
 * - Limpia las sugerencias y cierra el dropdown al seleccionar o al hacer
 *   click fuera del componente.
 */
export function SearchWithSuggestions({
  value,
  onChange,
  onSearch,
  placeholder = 'Buscar...',
  sugerenciasUrl = '/insumos/sugerencias',
}: Props) {
  const [sugerencias, setSugerencias] = useState<string[]>([])
  const [open, setOpen]               = useState(false)
  const [activo, setActivo]           = useState(-1)
  const containerRef                  = useRef<HTMLDivElement>(null)
  const debounceRef                   = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Fetch con debounce cada vez que cambia el valor
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (value.trim().length < 2) {
      setSugerencias([]); setOpen(false); return
    }
    debounceRef.current = setTimeout(async () => {
      try {
        const { data } = await api.get<string[]>(sugerenciasUrl, {
          params: { q: value.trim(), limit: 8 },
        })
        setSugerencias(data)
        setOpen(data.length > 0)
        setActivo(-1)
      } catch {
        setSugerencias([])
      }
    }, 250)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [value, sugerenciasUrl])

  // Cerrar al hacer click fuera
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  function seleccionar(nombre: string) {
    onChange(nombre)
    onSearch(nombre)
    setSugerencias([])
    setOpen(false)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActivo(a => Math.min(a + 1, sugerencias.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActivo(a => Math.max(a - 1, -1))
    } else if (e.key === 'Enter' && activo >= 0) {
      e.preventDefault()
      seleccionar(sugerencias[activo])
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setOpen(false)
    onSearch(value)
  }

  return (
    <div ref={containerRef} className="relative flex-1">
      <form onSubmit={handleSubmit} className="flex gap-2">
        <div className="relative flex-1">
          <Search
            size={15}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
          />
          <input
            type="text"
            value={value}
            onChange={e => {
              onChange(e.target.value)
              if (!e.target.value) onSearch('')
            }}
            onKeyDown={handleKeyDown}
            onFocus={() => { if (sugerencias.length > 0) setOpen(true) }}
            placeholder={placeholder}
            autoComplete="off"
            className="
              w-full pl-9 pr-4 py-2 rounded-lg border border-slate-200 text-sm
              focus:outline-none focus:ring-2 focus:ring-teal-500
              placeholder:text-slate-400
            "
          />

          {/* Dropdown de sugerencias */}
          {open && sugerencias.length > 0 && (
            <ul
              className="
                absolute left-0 right-0 top-full mt-1.5
                bg-white border border-slate-200 rounded-xl shadow-lg z-40 overflow-hidden
              "
            >
              {sugerencias.map((s, idx) => (
                <li key={s}>
                  <button
                    type="button"
                    /* preventDefault evita que el blur cierre el dropdown
                       antes de que se procese el click */
                    onMouseDown={e => { e.preventDefault(); seleccionar(s) }}
                    className={`
                      w-full text-left px-4 py-2.5 text-sm flex items-center
                      gap-2.5 transition-colors
                      ${ idx === activo
                        ? 'bg-teal-50 text-teal-700 font-semibold'
                        : 'text-slate-700 hover:bg-slate-50'
                      }
                    `}
                  >
                    <Search size={11} className="text-slate-300 flex-shrink-0" />
                    {/* Resaltar la parte que coincide con el valor buscado */}
                    <HighlightMatch text={s} query={value} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* bg-slate-900 en light mode, slate-700 en dark (evita invisible sobre fondo oscuro) */}
        <button
          type="submit"
          className="
            px-4 py-2 text-white text-sm font-bold rounded-lg transition-colors
            bg-slate-900 hover:bg-slate-700
            dark:bg-slate-700 dark:hover:bg-slate-600
          "
        >
          Buscar
        </button>
      </form>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Subcomponente: resalta la parte del texto que coincide con la búsqueda
// ---------------------------------------------------------------------------
function HighlightMatch({ text, query }: { text: string; query: string }) {
  if (!query.trim()) return <span>{text}</span>
  const idx = text.toLowerCase().indexOf(query.toLowerCase().trim())
  if (idx === -1) return <span>{text}</span>
  return (
    <span>
      {text.slice(0, idx)}
      <mark className="bg-teal-100 text-teal-800 rounded px-0.5 font-semibold not-italic">
        {text.slice(idx, idx + query.trim().length)}
      </mark>
      {text.slice(idx + query.trim().length)}
    </span>
  )
}
