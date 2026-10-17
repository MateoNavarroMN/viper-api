import { listarInscripcionesDeJugador } from './modelo.actividad.js'

// GET /api/perfil/actividad  (CU 1.3 · A2, solo JUGADOR)
// La forma de la respuesta ya queda fija para cuando existan los demás módulos:
//   { inscripciones, reservas, pagos, cuotas }
// Hoy solo se llenan las inscripciones (Módulo 3). Reservas y pagos salen como listas vacías
// y cuotas en null (no es socio / todavía no existe el módulo) hasta que se construyan los módulos 2, 4 y 5.
export const obtenerActividad = async (req, res) => {
  try {
    const inscripciones = await listarInscripcionesDeJugador(req.usuario.jugador_id)
    return res.status(200).json({ inscripciones, reservas: [], pagos: [], cuotas: null })
  } catch (error) {
    console.error(error)
    return res.status(500).json({ mensaje: 'No se pudo obtener la actividad' })
  }
}