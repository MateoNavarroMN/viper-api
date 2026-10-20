import { confirmarPago } from './modelo.pago.inscripciones.js'

const REGEX_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// POST /api/inscripciones/:id/confirmar-pago  (CU 3.2 · 7a, Recepcionista, Organizador y Administrador)
// Registra el cobro en efectivo en recepción: pasa a PAGADO y guarda la fecha y quién lo registró.
export const confirmar = async (req, res) => {
  const { id } = req.params
  if (!REGEX_UUID.test(id)) return res.status(404).json({ mensaje: 'Inscripción no encontrada' })

  try {
    const { resultado, inscripcion } = await confirmarPago(id, req.usuario.id)
    if (resultado === 'NO_ENCONTRADA') return res.status(404).json({ mensaje: 'Inscripción no encontrada' })
    if (resultado === 'ANULADA') {
      return res.status(409).json({ mensaje: 'La inscripción está anulada: venció el plazo de pago o el torneo se canceló' })
    }
    if (resultado === 'YA_PAGADA') return res.status(409).json({ mensaje: 'La inscripción ya está pagada' })
    return res.status(200).json({ mensaje: 'Pago registrado', inscripcion })
  } catch (error) {
    console.error(error)
    return res.status(500).json({ mensaje: 'No se pudo registrar el pago' })
  }
}