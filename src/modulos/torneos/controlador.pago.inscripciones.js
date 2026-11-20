import { cobrarYAsentar } from '../caja/asentar.cobros.caja.js'
import { MENSAJE_CAJA_CERRADA } from '../caja/modelo.caja.js'
import { buscarInscripcionPorId } from './modelo.inscripciones.js'

const REGEX_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const METODOS = ['EFECTIVO', 'TRANSFERENCIA']

// POST /api/inscripciones/:id/confirmar-pago  { metodoPago?: 'EFECTIVO' | 'TRANSFERENCIA' }  (Recepcionista y Administrador)
// Registra el cobro en recepción: pasa a PAGADO, guarda la fecha y quién lo registró, y el ingreso queda asentado en la caja de hoy.
// Sin `metodoPago` se toma efectivo (así lo mandaba la pantalla hasta ahora). Con la caja cerrada responde 409 y sigue pendiente.
export const confirmar = async (req, res) => {
  const { id } = req.params
  if (!REGEX_UUID.test(id)) return res.status(404).json({ mensaje: 'Inscripción no encontrada' })
  const { metodoPago = 'EFECTIVO' } = req.body ?? {}
  if (!METODOS.includes(metodoPago)) return res.status(400).json({ mensaje: 'Elegí el medio de pago: efectivo o transferencia', campo: 'metodoPago' })

  try {
    const { resultado } = await cobrarYAsentar({ concepto: 'INSCRIPCION', origenId: id, metodoPago, operadorId: req.usuario.id })
    if (resultado === 'CAJA_CERRADA') return res.status(409).json({ mensaje: MENSAJE_CAJA_CERRADA })
    if (resultado === 'NO_ENCONTRADO') return res.status(404).json({ mensaje: 'Inscripción no encontrada' })
    if (resultado === 'VENCIDO') {
      return res.status(409).json({ mensaje: 'La inscripción está anulada: venció el plazo de pago o el torneo se canceló' })
    }
    if (resultado === 'YA_PAGADO') return res.status(409).json({ mensaje: 'La inscripción ya está pagada' })
    return res.status(200).json({ mensaje: 'Pago registrado', inscripcion: await buscarInscripcionPorId(id) })
  } catch (error) {
    console.error(error)
    return res.status(500).json({ mensaje: 'No se pudo registrar el pago' })
  }
}