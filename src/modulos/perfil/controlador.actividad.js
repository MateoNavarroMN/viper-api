import { listarInscripcionesDeJugador } from './modelo.actividad.js'
import { anularInscripcionesVencidas } from '../torneos/modelo.inscripciones.js'
import { obtenerMisCuotas } from '../cuotas/modelo.mis.cuotas.js'

// GET /api/perfil/actividad  (CU 1.3 · A2, solo JUGADOR)
// La forma de la respuesta ya queda fija para cuando existan los demás módulos:
//   { inscripciones, reservas, pagos, cuotas }
// Hoy se llenan las inscripciones (Módulo 3) y las cuotas (Módulo 4): `cuotas` es el mismo objeto que devuelve
// GET /api/mis-cuotas, o null si el jugador no es socio. Reservas y pagos salen como listas vacías hasta que existan los módulos 2 y 5.
export const obtenerActividad = async (req, res) => {
  try {
    await anularInscripcionesVencidas()
    const inscripciones = await listarInscripcionesDeJugador(req.usuario.jugador_id)
    const cuotas = await obtenerMisCuotas(req.usuario.jugador_id)
    return res.status(200).json({ inscripciones, reservas: [], pagos: [], cuotas })
  } catch (error) {
    console.error(error)
    return res.status(500).json({ mensaje: 'No se pudo obtener la actividad' })
  }
}