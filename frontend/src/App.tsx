import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { ReactNode } from 'react'
import { Login }             from './pages/Login'
import { ResetPassword }     from './pages/ResetPassword'
import { Dashboard }         from './pages/Dashboard'
import { Alertas }           from './pages/Alertas'
import { Insumos }           from './pages/Insumos'
import { Movimientos }       from './pages/Movimientos'
import { Salas }             from './pages/Salas'
import { Categorias }        from './pages/Categorias'
import { Configuracion2FA }  from './pages/Configuracion2FA'
import { ImportarInsumos }   from './pages/ImportarInsumos'
import { ImportarHorario }   from './pages/ImportarHorario'
import { VerHorario }        from './pages/VerHorario'
import { Perfil }            from './pages/Perfil'
import { Usuarios }          from './pages/Usuarios'
import { AuditLog }          from './pages/AuditLog'
import { SolicitudDocente }  from './pages/SolicitudDocente'
import { SolicitudOperador } from './pages/SolicitudOperador'
import { RetornosOperador }  from './pages/RetornosOperador'
import { Asignaturas }       from './pages/Asignaturas'
import { ClasesDocente }     from './pages/ClasesDocente'
import { Reportes }          from './pages/Reportes'
import { Layout }            from './components/layout/Layout'
import { useAuthStore }      from './store/auth'

function getHomeByRol(rol?: string): string {
  return rol === 'docente' ? '/solicitudes' : '/dashboard'
}

const TODOS             = ['admin', 'operador_coordinador', 'operador', 'visor', 'docente']
const NO_DOCENTE        = ['admin', 'operador_coordinador', 'operador', 'visor']
const OPERADOR_PLUS     = ['admin', 'operador_coordinador', 'operador']
const SOLO_ADMIN        = ['admin']
const ROLES_REPORTES    = ['admin', 'operador_coordinador', 'visor']
const ROLES_SOLICITUDES = ['admin', 'operador_coordinador', 'operador', 'docente']

function ProtectedRoute({ roles, children }: { roles: string[]; children: ReactNode }) {
  const { user } = useAuthStore()
  if (user?.rol && roles.includes(user.rol)) return <>{children}</>
  return <Navigate to={getHomeByRol(user?.rol)} replace />
}

function IndexRedirect() {
  const { user } = useAuthStore()
  return <Navigate to={getHomeByRol(user?.rol)} replace />
}

function SolicitudesPage() {
  const { user } = useAuthStore()
  if (user?.rol === 'docente') return <SolicitudDocente />
  if (
    user?.rol === 'operador' ||
    user?.rol === 'operador_coordinador' ||
    user?.rol === 'admin'
  ) return <SolicitudOperador />
  return <Navigate to="/dashboard" replace />
}

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login"          element={<Login />} />
        <Route path="/reset-password" element={<ResetPassword />} />

        <Route path="/" element={<Layout />}>
          <Route index element={<IndexRedirect />} />

          <Route path="perfil"
            element={<ProtectedRoute roles={TODOS}><Perfil /></ProtectedRoute>} />
          <Route path="seguridad"
            element={<ProtectedRoute roles={TODOS}><Configuracion2FA /></ProtectedRoute>} />
          <Route path="insumos"
            element={<ProtectedRoute roles={TODOS}><Insumos /></ProtectedRoute>} />

          <Route path="dashboard"
            element={<ProtectedRoute roles={NO_DOCENTE}><Dashboard /></ProtectedRoute>} />
          <Route path="alertas"
            element={<ProtectedRoute roles={NO_DOCENTE}><Alertas /></ProtectedRoute>} />
          <Route path="movimientos"
            element={<ProtectedRoute roles={NO_DOCENTE}><Movimientos /></ProtectedRoute>} />
          <Route path="salas"
            element={<ProtectedRoute roles={NO_DOCENTE}><Salas /></ProtectedRoute>} />
          <Route path="categorias"
            element={<ProtectedRoute roles={NO_DOCENTE}><Categorias /></ProtectedRoute>} />

          <Route path="reportes"
            element={<ProtectedRoute roles={ROLES_REPORTES}><Reportes /></ProtectedRoute>} />

          <Route path="solicitudes"
            element={
              <ProtectedRoute roles={ROLES_SOLICITUDES}>
                <SolicitudesPage />
              </ProtectedRoute>
            } />
          <Route path="retornos"
            element={<ProtectedRoute roles={OPERADOR_PLUS}><RetornosOperador /></ProtectedRoute>} />

          <Route path="asignaturas"
            element={<ProtectedRoute roles={SOLO_ADMIN}><Asignaturas /></ProtectedRoute>} />
          <Route path="clases-docente"
            element={<ProtectedRoute roles={SOLO_ADMIN}><ClasesDocente /></ProtectedRoute>} />
          <Route path="horario"
            element={<ProtectedRoute roles={SOLO_ADMIN}><VerHorario /></ProtectedRoute>} />
          <Route path="importar-horario"
            element={<ProtectedRoute roles={SOLO_ADMIN}><ImportarHorario /></ProtectedRoute>} />
          <Route path="importar"
            element={<ProtectedRoute roles={SOLO_ADMIN}><ImportarInsumos /></ProtectedRoute>} />
          <Route path="usuarios"
            element={<ProtectedRoute roles={SOLO_ADMIN}><Usuarios /></ProtectedRoute>} />
          <Route path="audit-log"
            element={<ProtectedRoute roles={SOLO_ADMIN}><AuditLog /></ProtectedRoute>} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
