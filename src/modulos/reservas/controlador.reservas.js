import { accionesPermitidas } from './acciones.reservas.js'
import { expirarVencidas, obtenerReservaDetalle } from './modelo.reservas.js'

const REGEX_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const NO_ENCONTRADA = { mensaje: 'Reserva no encontrada' }

// GET /api/reservas/:id
// El Jugador solo ve las suyas (la de otro responde como si no existiera); Recepción y Administrador ven cualquiera.
export const obtener = async (req, res) => {
  const { id } = req.params
  if (!REGEX_UUID.test(id)) return res.status(404).json(NO_ENCONTRADA)

  try {
    // Antes de leer: una pendiente con el plazo vencido figura expirada
    await expirarVencidas()
    const reserva = await obtenerReservaDetalle(id)
    if (!reserva) return res.status(404).json(NO_ENCONTRADA)
    if (req.usuario.rol === 'JUGADOR' && reserva.cliente?.id !== req.usuario.id) return res.status(404).json(NO_ENCONTRADA)

    const { segundosParaInicio, ...datos } = reserva
    return res.status(200).json({ ...datos, acciones: accionesPermitidas(reserva, req.usuario.rol) })
  } catch (error) {
    console.error(error)
    return res.status(500).json({ mensaje: 'No se pudo obtener la reserva' })
  }
}
