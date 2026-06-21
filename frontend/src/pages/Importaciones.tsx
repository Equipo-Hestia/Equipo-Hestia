import { Link } from 'react-router-dom'
import { CalendarRange, Calendar, Upload, ChevronRight } from 'lucide-react'
import { useAuthStore } from '../store/auth'

type Opcion = {
  to:          string
  icon:        React.ElementType
  titulo:      string
  descripcion: string
  roles:       string[]
}

const COORD_ADMIN = ['admin', 'operador_coordinador']
const SOLO_ADMIN  = ['admin']

const OPCIONES: Opcion[] = [
  {
    to:          '/importar-programacion',
    icon:        CalendarRange,
    titulo:      'Programacion de talleres',
    descripcion: 'Carga el Excel de planificacion semestral para '
      + 'alimentar la Vista de Salas.',
    roles:       COORD_ADMIN,
  },
  {
    to:          '/importar-horario',
    icon:        Calendar,
    titulo:      'Horario academico',
    descripcion: 'Carga el CSV de horario exportado de DuocUC, con '
      + 'mapeo de columnas interactivo.',
    roles:       SOLO_ADMIN,
  },
  {
    to:          '/importar',
    icon:        Upload,
    titulo:      'Insumos',
    descripcion: 'Carga masiva de insumos desde CSV o XLSX, con '
      + 'verificacion TOTP.',
    roles:       SOLO_ADMIN,
  },
]

export function Importaciones() {
  const { user } = useAuthStore()
  const opciones = OPCIONES.filter(
    o => user?.rol && o.roles.includes(user.rol)
  )

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-h-primary flex items-center gap-2">
          <Upload size={22} className="text-h-accent" />
          Importaciones</h1>
        <p className="text-sm text-h-secondary mt-0.5">
          Elige que vas a importar.
        </p>
      </div>

      <div className="space-y-3">
        {opciones.map(({ to, icon: Icon, titulo, descripcion }) => (
          <Link key={to} to={to}
            className="flex items-center gap-4 rounded-2xl border
                       border-h-subtle p-5 transition-colors group"
            style={{ background: 'var(--h-bg-surface)' }}
            onMouseEnter={e =>
              (e.currentTarget.style.background = 'var(--h-bg-elevated)')}
            onMouseLeave={e =>
              (e.currentTarget.style.background = 'var(--h-bg-surface)')}
          >
            <div className="w-11 h-11 rounded-xl flex items-center
                             justify-center flex-shrink-0"
              style={{ background: 'rgba(29,158,117,0.1)' }}
            >
              <Icon size={20} style={{ color: 'var(--h-teal-hover)' }} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-h-primary text-sm">
                {titulo}
              </p>
              <p className="text-xs text-h-tertiary mt-0.5">
                {descripcion}
              </p>
            </div>
            <ChevronRight size={16} className="text-h-tertiary
              flex-shrink-0 transition-transform group-hover:translate-x-0.5" />
          </Link>
        ))}

        {opciones.length === 0 && (
          <p className="text-sm text-h-tertiary text-center py-10">
            No tienes acceso a ninguna opcion de importacion.
          </p>
        )}
      </div>
    </div>
  )
}
