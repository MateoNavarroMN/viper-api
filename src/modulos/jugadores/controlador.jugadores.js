import { buscarJugadorPorDni } from './modelo.jugadores.js'

// GET /api/jugadores/buscar?dni=
// Devuelve id, nombre, apellido y categoría por disciplina. Nunca el correo ni el teléfono.
export const buscar = async (req, res) => {
  const dni = typeof req.query.dni === 'string' ? req.query.dni.trim() : ''
  if (!/^[0-9]{7,9}$/.test(dni)) return res.status(400).json({ mensaje: 'Ingresá un DNI de 7 a 9 números', campo: 'dni' })

  // Buscarse a sí mismo no sirve como compañero
  if (dni === req.usuario.dni) return res.status(400).json({ mensaje: 'Compañero no válido', campo: 'dni' })

  try {
    const jugador = await buscarJugadorPorDni(dni)
    if (!jugador) return res.status(404).json({ mensaje: 'Jugador no encontrado', campo: 'dni' })
    return res.status(200).json({ jugador })
  } catch (error) {
    console.error(error)
    return res.status(500).json({ mensaje: 'No se pudo buscar al jugador' })
  }
}