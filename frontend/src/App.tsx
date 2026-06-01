import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { ReactNode } from 'react'
import { Login }                from './pages/Login'
import { ResetPassword }        from './pages/ResetPassword'
import { Dashboard }            from './pages/Dashboard'
import { Alertas }              from './pages/Alertas'
import { Insumos }              from './pages/Insumos'
import { Movimientos }          from './pages/Movimientos'
import { Salas }                from './pages/Salas'
import { Categorias }           from './pages/Categorias'
import { Configuracion2FA }     from './pages/Configuracion2FA'
import { ImportarInsumos }      from './pages/ImportarInsumos'
import { ImportarHorario }      from './pages/ImportarHorario'
import { VerHorario }           from './pages/VerHorario'
import { Perfil }               from './pages/Perfil'
import { Usuarios }             from './pages/Usuarios'
import { AuditLog }             from './pages/AuditLog'
import { Asignaturas }          from './pages/Asignaturas'
import { ClasesDocente }        from './pages/ClasesDocente'
import { Reportes }             from './pages/Reportes'
import { ActivosFijos }         from './pages/ActivosFijos'
import { UnidadesImplemento }   from './pages/UnidadesImplemento'
import { Paquetes }             from './pages/Paquetes'
import { PrepararTaller }       from './pages/PrepararTaller'
import { Layout }               from './components/layout/Layout'
import { useAuthStore }         from './store/auth'

const TODOS          = ['admin', 'operador_coordinador', 'operador', 'visor']
const NO_VISOR       = ['admin', 'operador_coordinador', 'operador']
const SOLO_ADMIN     = ['admin']
const ROLES_REPORTES = ['admin', 'operador_coordinador', 'visor']

function ProtectedRoute({ roles, children }: { roles: string[]; children: ReactNode }) {
  const { user } = useAuthStore()
  if (user?.rol && roles.includes(user.rol)) return <>{children}</>
  return <Navigate to="/dashboard" replace />
}

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login"          element={<Login />} />
        <Route path="/reset-password" element={<ResetPassword />} />

        <Route path="/" element={<Layout />}>
          <Route index element={<Navigate to="/dashboard" replace />} />

          <Route path="perfil"
            element={<ProtectedRoute roles={TODOS}><Perfil /></ProtectedRoute>} />
          <Route path="seguridad"
            element={<ProtectedRoute roles={TODOS}><Configuracion2FA /></ProtectedRoute>} />
          <Route path="insumos"
            element={<ProtectedRoute roles={TODOS}><Insumos /></ProtectedRoute>} />
          <Route path="insumos/:implemento_id/unidades"
            element={<ProtectedRoute roles={TODOS}><UnidadesImplemento /></ProtectedRoute>} />

          <Route path="dashboard"
            element={<ProtectedRoute roles={TODOS}><Dashboard /></ProtectedRoute>} />
          <Route path="alertas"
            element={<ProtectedRoute roles={TODOS}><Alertas /></ProtectedRoute>} />
          <Route path="movimientos"
            element={<ProtectedRoute roles={TODOS}><Movimientos /></ProtectedRoute>} />
          <Route path="salas"
            element={<ProtectedRoute roles={TODOS}><Salas /></ProtectedRoute>} />
          <Route path="categorias"
            element={<ProtectedRoute roles={TODOS}><Categorias /></ProtectedRoute>} />
          <Route path="activos-fijos"
            element={<ProtectedRoute roles={TODOS}><ActivosFijos /></ProtectedRoute>} />
          <Route path="reportes"
            element={<ProtectedRoute roles={ROLES_REPORTES}><Reportes /></ProtectedRoute>} />

          <Route path="paquetes"
            element={<ProtectedRoute roles={NO_VISOR}><Paquetes /></ProtectedRoute>} />
          <Route path="preparar-taller"
            element={<ProtectedRoute roles={NO_VISOR}><PrepararTaller /></ProtectedRoute>} />

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
