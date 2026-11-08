import { obtenerMisCuotas } from './modelo.mis.cuotas.js'

// GET /api/mis-cuotas  (CU 4.2 · A3, solo JUGADOR que es socio)
// Siempre se usa el jugador de la sesión, nunca un id recibido por URL: cada jugador ve solo sus cuotas.
export const misCuotas = async (req, res) => {
  try {
    const datos = await obtenerMisCuotas(req.usuario.jugador_id)
    if (!datos) return res.status(403).json({ mensaje: 'Solo los socios tienen cuotas' })
    return res.status(200).json(datos)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ mensaje: 'No se pudieron obtener las cuotas' })
  }
}