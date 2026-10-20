import { Routes, Route, Navigate } from 'react-router-dom'
import PublicLayout from './features/public/components/PublicLayout'
import Landing from './features/public/views/Landing'
import ReservasInfo from './features/public/views/ReservasInfo'
import TorneosInfo from './features/public/views/TorneosInfo'
import RankingInfo from './features/public/views/RankingInfo'
import TiendaInfo from './features/public/views/TiendaInfo'

import Login from './features/privado/auth/views/Login'
import Registro from './features/privado/auth/views/Registro'
import MiPerfil from './features/privado/perfil/views/MiPerfil'
import ListadoUsuarios from './features/privado/usuarios/views/ListadoUsuarios'
import GestionTorneos from './features/privado/torneos/views/GestionTorneos'
import TorneosJugador from './features/privado/torneos/views/TorneosJugador'
import RankingJugador from './features/privado/ranking/views/RankingJugador'
import DemoUI from './features/privado/demo/views/DemoUI'

function App() {
  return (
    <Routes>
      <Route element={<PublicLayout />}>
        <Route index element={<Landing />} />
        <Route path="reservas" element={<ReservasInfo />} />
        <Route path="torneos" element={<TorneosInfo />} />
        <Route path="ranking" element={<RankingInfo />} />
        <Route path="tienda" element={<TiendaInfo />} />
      </Route>

      {/* Acceso */}
      <Route path="login" element={<Login />} />
      <Route path="registro" element={<Registro />} />

      {/* Rutas privadas. La protección por sesión y rol se agrega en M1-FE-04. */}
      <Route path="perfil" element={<MiPerfil />} />
      <Route path="admin/usuarios" element={<ListadoUsuarios />} />
      <Route path="gestion/torneos" element={<GestionTorneos />} />
      <Route path="portal/torneos" element={<TorneosJugador />} />
      <Route path="portal/ranking" element={<RankingJugador />} />

      {/* Página de prueba de componentes (se borra más adelante) */}
      <Route path="demo-ui" element={<DemoUI />} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
