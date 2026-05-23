import { NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, AlertTriangle, Package,
  ArrowLeftRight, DoorOpen, Tag,
  LogOut, ShieldCheck, Upload,
  UserCircle, Users, ScrollText,
  ClipboardList, RotateCcw, BookOpen, GraduationCap, Calendar,
  ChevronLeft, ChevronRight, Sun, Moon,
} from 'lucide-react'
import { useAuthStore } from '../../store/auth'
import { useThemeStore } from '../../store/theme'
import { Logo } from '../ui/Logo'
import { useState, useEffect } from 'react'

const NAV_ITEMS = [
  // Inventario
  { to: '/dashboard',
    icon: LayoutDashboard, label: 'Dashboard',
    roles: ['admin', 'operador_coordinador', 'operador', 'visor'] },
  { to: '/alertas',
    icon: AlertTriangle, label: 'Alertas',
    roles: ['admin', 'operador_coordinador', 'operador', 'visor'] },
  { to: '/insumos',
    icon: Package, label: 'Insumos',
    roles: ['admin', 'operador_coordinador', 'operador', 'visor'] },
  { to: '/movimientos',
    icon: ArrowLeftRight, label: 'Movimientos',
    roles: ['admin', 'operador_coordinador', 'operador', 'visor'] },
  // Configuración general
  { to: '/salas',
    icon: DoorOpen, label: 'Salas',
    roles: ['admin', 'operador_coordinador', 'operador', 'visor'], divider: true },
  { to: '/categorias',
    icon: Tag, label: 'Categorías',
    roles: ['admin', 'operador_coordinador', 'operador', 'visor'] },
  // Flujo operativo
  { to: '/solicitudes',
    icon: ClipboardList, label: 'Solicitudes',
    roles: ['admin', 'operador_coordinador', 'operador'], divider: true },
  { to: '/retornos',
    icon: RotateCcw, label: 'Retornos',
    roles: ['admin', 'operador_coordinador', 'operador'] },
  // Académico (admin)
  { to: '/asignaturas',
    icon: BookOpen, label: 'Asignaturas',
    roles: ['admin'], divider: true },
  { to: '/clases-docente',
    icon: GraduationCap, label: 'Clases Docentes',
    roles: ['admin'] },
  { to: '/importar-horario',
    icon: Calendar, label: 'Importar Horario',
    roles: ['admin'] },
  // Administración
  { to: '/importar',
    icon: Upload, label: 'Importar Insumos',
    roles: ['admin'], divider: true },
  { to: '/usuarios',
    icon: Users, label: 'Usuarios',
    roles: ['admin'] },
  { to: '/audit-log',
    icon: ScrollText, label: 'Audit Log',
    roles: ['admin'] },
  // Flujo docente
  { to: '/solicitudes',
    icon: ClipboardList, label: 'Retiro de Insumos',
    roles: ['docente'] },
  { to: '/insumos',
    icon: Package, label: 'Insumos',
    roles: ['docente'] },
]

const ROL_LABELS: Record<string, string> = {
  admin: 'Administrador',
  operador_coordinador: 'Op. Coordinador',
  operador: 'Operador',
  visor: 'Visor',
  docente: 'Docente',
}

const SIDEBAR_KEY = 'hestia-sidebar-collapsed'

/** Tooltip flotante que aparece al costado derecho cuando el sidebar está colapsado */
function CollapseTooltip({ label }: { label: string }) {
  return (
    <span
      className="
        absolute left-full ml-2 px-2.5 py-1 bg-slate-700 text-white
        text-xs font-semibold rounded-md pointer-events-none whitespace-nowrap
        opacity-0 group-hover:opacity-100 transition-opacity duration-150
        top-1/2 -translate-y-1/2 z-50 shadow-lg
      "
    >
      {label}
    </span>
  )
}

export function Sidebar() {
  const { logout, user } = useAuthStore()
  const { isDark, toggleTheme } = useThemeStore()
  const navigate = useNavigate()

  const [collapsed, setCollapsed] = useState<boolean>(
    () => localStorage.getItem(SIDEBAR_KEY) === 'true'
  )

  useEffect(() => {
    localStorage.setItem(SIDEBAR_KEY, String(collapsed))
  }, [collapsed])

  function handleLogout() { logout(); navigate('/login') }
  function handleCollapse() { setCollapsed((c) => !c) }

  const navLinkCls = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold
     transition-colors duration-150
     ${isActive
       ? 'bg-teal-600 text-white'
       : 'text-slate-400 hover:bg-slate-800 hover:text-white'
     }`

  const collapsedLinkCls = ({ isActive }: { isActive: boolean }) =>
    `flex items-center justify-center w-full p-2.5 rounded-lg
     transition-colors duration-150
     ${isActive
       ? 'bg-teal-600 text-white'
       : 'text-slate-400 hover:bg-slate-800 hover:text-white'
     }`

  const itemsVisibles = NAV_ITEMS.filter(
    (item) => user?.rol && item.roles.includes(user.rol)
  )
  const rolLabel = user?.rol
    ? (ROL_LABELS[user.rol] ?? user.rol)
    : 'Escuela de Salud'

  return (
    <aside
      className={`
        ${ collapsed ? 'w-16' : 'w-60' }
        h-full bg-slate-900 dark:bg-slate-950 flex flex-col
        border-r border-slate-800 dark:border-slate-900 flex-shrink-0
        transition-all duration-300 ease-in-out overflow-hidden
      `}
    >
      {/* Botón de colapso */}
      <div
        className={`
          flex ${ collapsed ? 'justify-center' : 'justify-end' }
          px-2 pt-3 pb-1
        `}
      >
        <button
          onClick={handleCollapse}
          title={collapsed ? 'Expandir menú' : 'Colapsar menú'}
          className="
            w-8 h-8 rounded-lg flex items-center justify-center
            text-slate-500 hover:bg-slate-800 hover:text-white
            transition-colors duration-150
          "
        >
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </div>

      {/* Logo y nombre */}
      <div
        className={`
          ${ collapsed ? 'px-2 pb-4 flex justify-center' : 'px-5 pb-6' }
          border-b border-slate-800 dark:border-slate-900
          transition-all duration-300
        `}
      >
        {collapsed ? (
          <Logo className="w-9 h-9" />
        ) : (
          <div className="flex items-center gap-3">
            <Logo className="w-12 h-12" />
            <div>
              <p className="text-white font-bold text-base leading-tight">Hestia</p>
              <p className="text-slate-400 text-xs">{rolLabel}</p>
            </div>
          </div>
        )}
      </div>

      {/* Navegación principal */}
      <nav className="flex-1 px-2 py-5 space-y-1 overflow-y-auto overflow-x-hidden">
        {itemsVisibles.map(({ to, icon: Icon, label, divider }, idx) => (
          <div key={`${to}-${idx}`}>
            {divider && (
              <div
                className={`
                  border-t border-slate-800 dark:border-slate-700
                  ${ collapsed ? 'my-1' : 'my-2' }
                `}
              />
            )}
            {collapsed ? (
              <div className="relative group">
                <NavLink to={to} className={collapsedLinkCls}>
                  <Icon size={18} />
                </NavLink>
                <CollapseTooltip label={label} />
              </div>
            ) : (
              <NavLink to={to} className={navLinkCls}>
                <Icon size={17} />
                {label}
              </NavLink>
            )}
          </div>
        ))}
      </nav>

      {/* Acciones inferiores */}
      <div
        className={`
          ${ collapsed ? 'px-2' : 'px-3' }
          pb-5 border-t border-slate-800 dark:border-slate-900 pt-4 space-y-1
        `}
      >
        {collapsed ? (
          <>
            <div className="relative group">
              <NavLink to="/perfil" className={collapsedLinkCls}>
                <UserCircle size={18} />
              </NavLink>
              <CollapseTooltip label="Mi perfil" />
            </div>

            <div className="relative group">
              <NavLink to="/seguridad" className={collapsedLinkCls}>
                <ShieldCheck size={18} />
              </NavLink>
              <CollapseTooltip label="Seguridad" />
            </div>

            <div className="relative group">
              <button
                onClick={toggleTheme}
                className="
                  flex items-center justify-center w-full p-2.5 rounded-lg
                  text-slate-400 hover:bg-slate-800 hover:text-amber-400
                  transition-colors duration-150
                "
              >
                {isDark ? <Sun size={18} /> : <Moon size={18} />}
              </button>
              <CollapseTooltip label={isDark ? 'Modo claro' : 'Modo oscuro'} />
            </div>

            <div className="relative group">
              <button
                onClick={handleLogout}
                className="
                  flex items-center justify-center w-full p-2.5 rounded-lg
                  text-slate-400 hover:bg-slate-800 hover:text-rose-400
                  transition-colors duration-150
                "
              >
                <LogOut size={18} />
              </button>
              <CollapseTooltip label="Cerrar sesión" />
            </div>
          </>
        ) : (
          <>
            <NavLink to="/perfil" className={navLinkCls}>
              <UserCircle size={17} /> Mi perfil
            </NavLink>

            <NavLink to="/seguridad" className={navLinkCls}>
              <ShieldCheck size={17} /> Seguridad
            </NavLink>

            <button
              onClick={toggleTheme}
              className="
                w-full flex items-center gap-3 px-3 py-2.5 rounded-lg
                text-slate-400 hover:bg-slate-800 hover:text-amber-400
                text-sm font-semibold transition-colors duration-150
              "
            >
              {isDark ? <Sun size={17} /> : <Moon size={17} />}
              {isDark ? 'Modo claro' : 'Modo oscuro'}
            </button>

            <button
              onClick={handleLogout}
              className="
                w-full flex items-center gap-3 px-3 py-2.5 rounded-lg
                text-slate-400 hover:bg-slate-800 hover:text-rose-400
                text-sm font-semibold transition-colors duration-150
              "
            >
              <LogOut size={17} /> Cerrar sesión
            </button>
          </>
        )}
      </div>
    </aside>
  )
}
