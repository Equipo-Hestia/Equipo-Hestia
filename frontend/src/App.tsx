import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
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
import { Perfil }            from './pages/Perfil'
import { Usuarios }          from './pages/Usuarios'
import { AuditLog }          from './pages/AuditLog'
import { SolicitudDocente }  from './pages/SolicitudDocente'
import { SolicitudOperador } from './pages/SolicitudOperador'
import { RetornosOperador }  from './pages/RetornosOperador'
import { Asignaturas }       from './pages/Asignaturas'
import { ClasesDocente }     from './pages/ClasesDocente'
import { Layout }            from './components/layout/Layout'
import { useAuthStore }      from './store/auth'

function SolicitudesPage() {
  const { user } = useAuthStore()
  if (user?.rol === 'docente') return <SolicitudDocente />
  if (user?.rol === 'operador' || user?.rol === 'admin') return <SolicitudOperador />
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
          <Route path="dashboard"         element={<Dashboard />} />
          <Route path="alertas"           element={<Alertas />} />
          <Route path="insumos"           element={<Insumos />} />
          <Route path="movimientos"       element={<Movimientos />} />
          <Route path="salas"             element={<Salas />} />
          <Route path="categorias"        element={<Categorias />} />
          <Route path="seguridad"         element={<Configuracion2FA />} />
          <Route path="importar"          element={<ImportarInsumos />} />
          <Route path="importar-horario" element={<ImportarHorario />} />
          <Route path="perfil"            element={<Perfil />} />
          <Route path="usuarios"          element={<Usuarios />} />
          <Route path="audit-log"         element={<AuditLog />} />
          <Route path="solicitudes"       element={<SolicitudesPage />} />
          <Route path="retornos"          element={<RetornosOperador />} />
          <Route path="asignaturas"       element={<Asignaturas />} />
          <Route path="clases-docente"    element={<ClasesDocente />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
