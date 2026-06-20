import { NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, AlertTriangle, Package,
  ArrowLeftRight, Tag,
  LogOut, ShieldCheck, Upload,
  UserCircle, Users, ScrollText,
  BookOpen, GraduationCap,
  Calendar, CalendarDays, BarChart2,
  ChevronLeft, ChevronRight, Sun, Moon,
  Sofa, FlaskConical, ClipboardCheck, Wrench,
  Building2, MapPin, CalendarRange, ShoppingCart, AlertOctagon,
} from 'lucide-react'
import { useAuthStore } from '../../store/auth'
import { useThemeStore } from '../../store/theme'
import { Logo } from '../ui/Logo'
import { useState, useEffect, useCallback } from 'react'

type NavSection = {
  label: string
  roles: string[]
  items: NavItem[]
}

type NavItem = {
  to:    string
  icon:  React.ElementType
  label: string
  roles: string[]
}

const TODOS       = ['admin', 'operador_coordinador', 'operador', 'visor']
const NO_VISOR    = ['admin', 'operador_coordinador', 'operador']
const COORD_ADMIN = ['admin', 'operador_coordinador']
const SOLO_ADMIN  = ['admin']

const NAV_SECTIONS: NavSection[] = [
  {
    label: 'General',
    roles: TODOS,
    items: [
      { to: '/dashboard',    icon: LayoutDashboard, label: 'Dashboard',             roles: TODOS },
      { to: '/alertas',      icon: AlertTriangle,   label: 'Alertas',               roles: TODOS },
      { to: '/insumos',      icon: Package,         label: 'Insumos e Implementos', roles: TODOS },
      { to: '/activos-fijos', icon: Sofa,           label: 'Activos Fijos',         roles: TODOS },
      { to: '/incidencias',   icon: AlertOctagon,   label: 'Incidencias',           roles: TODOS },
      { to: '/mantenimiento', icon: Wrench,         label: 'Mantenimiento',         roles: NO_VISOR },
      { to: '/movimientos',  icon: ArrowLeftRight,  label: 'Movimientos',           roles: TODOS },
      { to: '/categorias',   icon: Tag,             label: 'Categorias',            roles: TODOS },
    ],
  },
  {
    label: 'Planificacion',
    roles: TODOS,
    items: [
      { to: '/vista-salas',     icon: MapPin,         label: 'Vista de Salas',      roles: TODOS },
      { to: '/preparar-taller', icon: ClipboardCheck, label: 'Preparar taller',     roles: NO_VISOR },
      { to: '/paquetes',        icon: FlaskConical,   label: 'Paquetes de insumos', roles: NO_VISOR },
      { to: '/reportes',        icon: BarChart2,      label: 'Reportes',
        roles: ['admin', 'operador_coordinador', 'visor'] },
    ],
  },
  {
    label: 'Administracion',
    roles: COORD_ADMIN,
    items: [
      { to: '/ordenes-entrada',       icon: ShoppingCart,  label: 'Ordenes de Entrada',    roles: COORD_ADMIN },
      { to: '/proveedores',           icon: Building2,     label: 'Proveedores',            roles: COORD_ADMIN },
      { to: '/clases-docente',        icon: GraduationCap, label: 'Docentes y Clases',      roles: COORD_ADMIN },
      { to: '/asignaturas',           icon: BookOpen,      label: 'Asignaturas',            roles: COORD_ADMIN },
      { to: '/horario',               icon: CalendarDays,  label: 'Ver Horario',            roles: COORD_ADMIN },
      { to: '/importar-programacion', icon: CalendarRange, label: 'Importar Programacion',  roles: COORD_ADMIN },
      { to: '/importar-horario',      icon: Calendar,      label: 'Importar Horario',       roles: SOLO_ADMIN },
      { to: '/importar',              icon: Upload,        label: 'Importar Insumos',       roles: SOLO_ADMIN },
      { to: '/usuarios',              icon: Users,         label: 'Usuarios',               roles: SOLO_ADMIN },
      { to: '/audit-log',             icon: ScrollText,    label: 'Audit Log',              roles: SOLO_ADMIN },
    ],
  },
]

const ROL_LABELS: Record<string, string> = {
  admin:                'Administrador',
  operador_coordinador: 'Op. Coordinador',
  operador:             'Operador',
  visor:                'Visor',
}

const SIDEBAR_KEY  = 'hestia-sidebar-collapsed'
const LABEL_OUT_MS = 110
const WIDTH_MS     = 260
const LABEL_IN_MS  = 140

function Tooltip({ label }: { label: string }) {
  return (
    <span className="
      absolute left-full ml-2.5 px-2.5 py-1.5
      bg-h-elevated border border-h-visible
      text-h-primary text-xs font-medium
      rounded-md pointer-events-none whitespace-nowrap
      opacity-0 group-hover:opacity-100
      transition-opacity duration-150
      top-1/2 -translate-y-1/2 z-50
    ">
      {label}
    </span>
  )
}

interface NavItemRowProps {
  item:          NavItem
  collapsed:     boolean
  labelsVisible: boolean
}

function NavItemRow({ item, collapsed, labelsVisible }: NavItemRowProps) {
  const { icon: Icon, to, label } = item
  const baseCls = `
    relative group flex items-center gap-2.5
    rounded-md transition-colors duration-150 cursor-pointer
    ${ collapsed ? 'justify-center px-0 py-2.5 w-full' : 'px-2.5 py-2 w-full' }
  `
  const activeCls   = 'bg-h-elevated text-h-primary'
  const inactiveCls = 'text-h-secondary hover:bg-h-elevated hover:text-h-primary'

  return (
    <NavLink to={to}
      className={({ isActive }) =>
        `${baseCls} ${isActive ? activeCls : inactiveCls}`}
    >
      {({ isActive }) => (
        <>
          {!collapsed && (
            <span
              className="absolute left-0 top-1/2 -translate-y-1/2
                         w-[2.5px] rounded-r-full transition-all duration-200"
              style={{
                height:     isActive ? '16px' : '0px',
                background: isActive ? 'var(--h-teal-hover)' : 'transparent',
              }}
            />
          )}
          <Icon size={16} className="flex-shrink-0 transition-colors duration-150"
            style={{ color: isActive ? 'var(--h-teal-hover)' : 'inherit' }} />
          {!collapsed && (
            <span
              className="text-[13px] font-medium truncate min-w-0 flex-1"
              style={{
                opacity:    labelsVisible ? 1 : 0,
                transform:  labelsVisible ? 'translateX(0)' : 'translateX(-6px)',
                transition: `opacity ${LABEL_IN_MS}ms ease, transform ${LABEL_IN_MS}ms ease`,
              }}
            >
              {label}
            </span>
          )}
          {collapsed && <Tooltip label={label} />}
        </>
      )}
    </NavLink>
  )
}

export function Sidebar() {
  const { logout, user } = useAuthStore()
  const { isDark, toggleTheme } = useThemeStore()
  const navigate = useNavigate()

  const [collapsed,     setCollapsed]     =
    useState<boolean>(() => localStorage.getItem(SIDEBAR_KEY) === 'true')
  const [labelsVisible, setLabelsVisible] = useState<boolean>(!collapsed)

  useEffect(() => {
    localStorage.setItem(SIDEBAR_KEY, String(collapsed))
  }, [collapsed])

  const handleCollapse = useCallback(() => {
    if (!collapsed) {
      setLabelsVisible(false)
      setTimeout(() => setCollapsed(true), LABEL_OUT_MS)
    } else {
      setCollapsed(false)
      setTimeout(() => setLabelsVisible(true), WIDTH_MS)
    }
  }, [collapsed])

  function handleLogout() { logout(); navigate('/login') }

  const initials = user?.nombre
    ? user.nombre.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase()
    : '?'
  const rolLabel    = user?.rol ? (ROL_LABELS[user.rol] ?? user.rol) : ''
  const displayName = user?.nombre
    ? user.nombre.split(' ').slice(0, 2).join(' ')
    : 'Usuario'
  const sidebarW = collapsed ? 'w-[60px]' : 'w-[220px]'

  return (
    <aside
      className={`${sidebarW} h-full flex flex-col flex-shrink-0
                  bg-h-surface border-r border-h-subtle overflow-hidden`}
      style={{ transition: `width ${WIDTH_MS}ms cubic-bezier(0.4,0,0.2,1)` }}
    >
      <div className="relative overflow-hidden flex items-center border-b border-h-subtle flex-shrink-0 px-3 py-3 gap-2">
        <div className="absolute inset-0 pointer-events-none sidebar-aurora" />
        <div className="relative z-10 flex items-center gap-2.5 min-w-0 flex-1">
          <Logo className="w-8 h-8 flex-shrink-0" />
          {!collapsed && (
            <div className="min-w-0" style={{
              opacity:    labelsVisible ? 1 : 0,
              transform:  labelsVisible ? 'translateX(0)' : 'translateX(-6px)',
              transition: `opacity ${LABEL_IN_MS}ms ease, transform ${LABEL_IN_MS}ms ease`,
            }}>
              <p className="text-h-primary text-sm font-semibold leading-tight truncate">Hestia</p>
              <p className="text-h-tertiary text-[11px] leading-tight truncate">Escuela de Salud</p>
            </div>
          )}
        </div>
        <button onClick={handleCollapse}
          title={collapsed ? 'Expandir menu' : 'Colapsar menu'}
          className="relative z-10 w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0
                     text-h-tertiary hover:bg-h-elevated hover:text-h-secondary
                     transition-colors duration-150">
          {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto overflow-x-hidden py-3 px-2 space-y-4">
        {NAV_SECTIONS.map(section => {
          if (!user?.rol) return null
          const visibleItems = section.items.filter(
            item => item.roles.includes(user.rol as string)
          )
          if (visibleItems.length === 0) return null
          if (!section.roles.includes(user.rol as string)) return null
          return (
            <div key={section.label}>
              {!collapsed && (
                <p className="px-2.5 mb-1 text-[10px] font-semibold uppercase
                               tracking-widest text-h-tertiary select-none"
                  style={{
                    opacity:    labelsVisible ? 1 : 0,
                    transition: `opacity ${LABEL_IN_MS}ms ease`,
                  }}>
                  {section.label}
                </p>
              )}
              <div className="space-y-0.5">
                {visibleItems.map(item => (
                  <NavItemRow key={item.to} item={item}
                    collapsed={collapsed} labelsVisible={labelsVisible} />
                ))}
              </div>
            </div>
          )
        })}
      </nav>

      <div className="border-t border-h-subtle flex-shrink-0 px-2 py-3 space-y-0.5">
        <div className={`flex items-center gap-2.5 rounded-md px-2 py-2 mb-1
                         ${ collapsed ? 'justify-center' : '' }`}>
          <div className="w-7 h-7 rounded-full flex-shrink-0 flex items-center
                          justify-center text-[11px] font-semibold
                          bg-h-elevated border border-h-visible text-h-secondary">
            {initials}
          </div>
          {!collapsed && (
            <div className="min-w-0 flex-1" style={{
              opacity:    labelsVisible ? 1 : 0,
              transform:  labelsVisible ? 'translateX(0)' : 'translateX(-6px)',
              transition: `opacity ${LABEL_IN_MS}ms ease, transform ${LABEL_IN_MS}ms ease`,
            }}>
              <p className="text-[12px] font-medium text-h-primary truncate leading-tight">{displayName}</p>
              <p className="text-[10px] text-h-tertiary truncate leading-tight">{rolLabel}</p>
            </div>
          )}
        </div>
        <div className="h-px bg-h-subtle mx-1 mb-1" />
        {[
          { to: '/perfil',    icon: UserCircle,  label: 'Mi perfil' },
          { to: '/seguridad', icon: ShieldCheck, label: 'Seguridad' },
        ].map(({ to, icon: Icon, label }) => (
          <div key={to} className="relative group">
            <NavLink to={to} className={({ isActive }) => `
              flex items-center gap-2.5 rounded-md transition-colors duration-150
              text-h-secondary hover:bg-h-elevated hover:text-h-primary
              ${ isActive ? 'bg-h-elevated text-h-primary' : '' }
              ${ collapsed ? 'justify-center px-0 py-2.5 w-full' : 'px-2.5 py-2 w-full' }
            `}>
              <Icon size={16} className="flex-shrink-0" />
              {!collapsed && (
                <span className="text-[13px] font-medium truncate" style={{
                  opacity:    labelsVisible ? 1 : 0,
                  transform:  labelsVisible ? 'translateX(0)' : 'translateX(-6px)',
                  transition: `opacity ${LABEL_IN_MS}ms ease, transform ${LABEL_IN_MS}ms ease`,
                }}>{label}</span>
              )}
            </NavLink>
            {collapsed && <Tooltip label={label} />}
          </div>
        ))}
        <div className="relative group">
          <button onClick={toggleTheme}
            title={isDark ? 'Modo claro' : 'Modo oscuro'}
            className={`flex items-center gap-2.5 rounded-md w-full transition-colors duration-150
              text-h-secondary hover:bg-h-elevated hover:text-h-primary
              ${ collapsed ? 'justify-center px-0 py-2.5' : 'px-2.5 py-2' }`}>
            {isDark ? <Sun size={16} className="flex-shrink-0" />
                    : <Moon size={16} className="flex-shrink-0" />}
            {!collapsed && (
              <span className="text-[13px] font-medium truncate" style={{
                opacity:    labelsVisible ? 1 : 0,
                transform:  labelsVisible ? 'translateX(0)' : 'translateX(-6px)',
                transition: `opacity ${LABEL_IN_MS}ms ease, transform ${LABEL_IN_MS}ms ease`,
              }}>{isDark ? 'Modo claro' : 'Modo oscuro'}</span>
            )}
          </button>
          {collapsed && <Tooltip label={isDark ? 'Modo claro' : 'Modo oscuro'} />}
        </div>
        <div className="relative group">
          <button onClick={handleLogout}
            className={`flex items-center gap-2.5 rounded-md w-full transition-colors duration-150
              text-h-secondary hover:bg-h-elevated hover:text-red-400
              ${ collapsed ? 'justify-center px-0 py-2.5' : 'px-2.5 py-2' }`}>
            <LogOut size={16} className="flex-shrink-0" />
            {!collapsed && (
              <span className="text-[13px] font-medium truncate" style={{
                opacity:    labelsVisible ? 1 : 0,
                transform:  labelsVisible ? 'translateX(0)' : 'translateX(-6px)',
                transition: `opacity ${LABEL_IN_MS}ms ease, transform ${LABEL_IN_MS}ms ease`,
              }}>Cerrar sesion</span>
            )}
          </button>
          {collapsed && <Tooltip label="Cerrar sesion" />}
        </div>
      </div>
    </aside>
  )
}
