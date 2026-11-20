import { cajaCerrada, fechaDeHoy, ultimoCierre } from './modelo.caja.js'
import { esFechaValida } from './validaciones.caja.js'

// GET /api/caja/estado?fecha=AAAA-MM-DD  (Recepcionista y Administrador)
// Dice si la caja de esa fecha (por defecto, hoy) está abierta o cerrada y trae el último cierre registrado.
export const estado = async (req, res) => {
  const { fecha: pedida } = req.query
  if (pedida !== undefined && !esFechaValida(pedida)) {
    return res.status(400).json({ mensaje: 'Parámetro inválido: la fecha debe tener el formato AAAA-MM-DD', campo: 'fecha' })
  }

  try {
    const hoy = await fechaDeHoy()
    const fecha = pedida ?? hoy
    const [cerrada, cierre] = await Promise.all([cajaCerrada(fecha), ultimoCierre()])
    return res.status(200).json({ fecha, hoy, cerrada, ultimoCierre: cierre })
  } catch (error) {
    console.error(error)
    return res.status(500).json({ mensaje: 'No se pudo consultar el estado de la caja' })
  }
}