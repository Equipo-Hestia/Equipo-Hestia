import { NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, AlertTriangle, Package,
  ArrowLeftRight, DoorOpen, Tag,
  LogOut, ShieldCheck, Upload,
  UserCircle, Users, ScrollText, ClipboardList,
  RotateCcw, BookOpen, GraduationCap
} from 'lucide-react'
import { useAuthStore } from '../../store/auth'
import { Logo } from '../ui/Logo'

const NAV_ITEMS = [
  // Inventario
  { to: '/dashboard',      icon: LayoutDashboard, label: 'Dashboard',      roles: ['admin', 'operador', 'visor'] },
  { to: '/alertas',        icon: AlertTriangle,   label: 'Alertas',        roles: ['admin', 'operador', 'visor'] },
  { to: '/insumos',        icon: Package,         label: 'Insumos',        roles: ['admin', 'operador', 'visor'] },
  { to: '/movimientos',    icon: ArrowLeftRight,  label: 'Movimientos',    roles: ['admin', 'operador', 'visor'] },
  // Configuracion general
  { to: '/salas',          icon: DoorOpen,        label: 'Salas',          roles: ['admin', 'operador', 'visor'], divider: true },
  { to: '/categorias',     icon: Tag,             label: 'Categorias',     roles: ['admin', 'operador', 'visor'] },
  // Flujo operativo: solicitudes y retornos
  { to: '/solicitudes',    icon: ClipboardList,   label: 'Solicitudes',    roles: ['admin', 'operador'], divider: true },
  { to: '/retornos',       icon: RotateCcw,       label: 'Retornos',       roles: ['admin', 'operador'] },
  // Academico (solo admin): asignaturas y clases docentes
  { to: '/asignaturas',    icon: BookOpen,        label: 'Asignaturas',    roles: ['admin'], divider: true },
  { to: '/clases-docente', icon: GraduationCap,   label: 'Clases Docentes', roles: ['admin'] },
  // Administracion
  { to: '/importar',       icon: Upload,          label: 'Importar',       roles: ['admin'], divider: true },
  { to: '/usuarios',       icon: Users,           label: 'Usuarios',       roles: ['admin'] },
  { to: '/audit-log',      icon: ScrollText,      label: 'Audit Log',      roles: ['admin'] },
  // Flujo docente
  { to: '/solicitudes',    icon: ClipboardList,   label: 'Retiro de insumos', roles: ['docente'] },
  { to: '/insumos',        icon: Package,         label: 'Insumos',           roles: ['docente'] },
]

const ROL_LABELS: Record<string, string> = {
  admin: 'Administrador', operador: 'Operador',
  visor: 'Visor',         docente: 'Docente',
}

export function Sidebar() {
  const { logout, user } = useAuthStore()
  const navigate = useNavigate()

  function handleLogout() { logout(); navigate('/login') }

  const navLinkCls = ({ isActive }: { isActive: boolean }) => `
    flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold
    transition-colors duration-150
    ${isActive
      ? 'bg-teal-600 text-white'
      : 'text-slate-400 hover:bg-slate-800 hover:text-white'
    }
  `

  const itemsVisibles = NAV_ITEMS.filter(
    item => user?.rol && item.roles.includes(user.rol)
  )
  const rolLabel = user?.rol ? (ROL_LABELS[user.rol] ?? user.rol) : 'Escuela de Salud'

  return (
    <aside className="w-60 h-full bg-slate-900 flex flex-col border-r border-slate-800 flex-shrink-0">
      <div className="px-5 pt-7 pb-6 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <Logo className="w-12 h-12" />
          <div>
            <p className="text-white font-bold text-base leading-tight">Hestia</p>
            <p className="text-slate-400 text-xs">{rolLabel}</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 px-3 py-5 space-y-1 overflow-y-auto">
        {itemsVisibles.map(({ to, icon: Icon, label, divider }, idx) => (
          <div key={`${to}-${idx}`}>
            {divider && <div className="border-t border-slate-800 my-2" />}
            <NavLink to={to} className={navLinkCls}>
              <Icon size={17} />
              {label}
            </NavLink>
          </div>
        ))}
      </nav>

      <div className="px-3 pb-5 border-t border-slate-800 pt-4 space-y-1">
        <NavLink to="/perfil" className={navLinkCls}>
          <UserCircle size={17} /> Mi perfil
        </NavLink>
        <NavLink to="/seguridad" className={navLinkCls}>
          <ShieldCheck size={17} /> Seguridad
        </NavLink>
        <button onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-slate-400
                     hover:bg-slate-800 hover:text-rose-400 text-sm font-semibold
                     transition-colors duration-150">
          <LogOut size={17} /> Cerrar sesión
        </button>
      </div>
    </aside>
  )
}
