import { anularEnRecepcion, obtenerDetalle } from './modelo.detalle.inscripciones.js'

const REGEX_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const noEncontrada = (res) => res.status(404).json({ mensaje: 'Inscripción no encontrada' })

// GET /api/inscripciones/:id  (Organizador, Recepcionista y Administrador)
// Detalle de una inscripción para la pantalla «Inscripciones»: integrantes con su contacto, pago y si se puede anular.
export const detalle = async (req, res) => {
  if (!REGEX_UUID.test(req.params.id)) return noEncontrada(res)
  try {
    const { resultado, ...datos } = await obtenerDetalle(req.params.id)
    if (resultado === 'NO_ENCONTRADA') return noEncontrada(res)
    return res.status(200).json(datos)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ mensaje: 'No se pudo obtener la inscripción' })
  }
}

// POST /api/inscripciones/:id/anular  (Recepcionista y Administrador)
// Anula una inscripción con el pago pendiente y libera el cupo. Con el pago confirmado, el reembolso se gestiona fuera del sistema.
export const anular = async (req, res) => {
  if (!REGEX_UUID.test(req.params.id)) return noEncontrada(res)
  try {
    const { resultado, ...datos } = await anularEnRecepcion(req.params.id)
    if (resultado === 'NO_ENCONTRADA') return noEncontrada(res)
    if (resultado === 'NO_SE_PUEDE') return res.status(409).json({ mensaje: datos.motivo })
    return res.status(200).json({ mensaje: 'Inscripción anulada correctamente', inscripcion: datos.inscripcion })
  } catch (error) {
    console.error(error)
    return res.status(500).json({ mensaje: 'No se pudo anular la inscripción' })
  }
}