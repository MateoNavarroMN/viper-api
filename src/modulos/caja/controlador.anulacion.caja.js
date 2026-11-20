import { obtenerMovimiento } from './modelo.movimientos.caja.js'
import { anularMovimiento } from './modelo.anulacion.caja.js'

const REGEX_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MOTIVO_MAXIMO = 200

const NO_ENCONTRADO = { mensaje: 'Movimiento no encontrado' }

const ESTADOS = {
  ANULADO: 'El movimiento ya está anulado',
  PENDIENTE: 'El movimiento está pendiente de acreditación y todavía no se puede anular',
  RECHAZADO: 'El movimiento fue rechazado: no hay nada para anular',
}

// Por qué no se pudo anular: estado HTTP y mensaje
const RECHAZOS = {
  CAJA_CERRADA: [409, 'La caja ya fue cerrada: un movimiento de una caja cerrada no se puede anular'],
  EN_LINEA: [409, 'Un pago en línea no se anula desde la caja: la devolución se gestiona en Mercado Pago'],
  TURNO_COMENZADO: [409, 'El turno ya comenzó: el cobro de la reserva no se puede anular'],
  TORNEO_AVANZADO: [409, 'El torneo ya tiene el cuadro armado: el cobro de la inscripción no se puede anular'],
}

// POST /api/caja/movimientos/:id/anular  { motivo }  (Recepcionista y Administrador)
// Anula un movimiento aprobado de una caja abierta: queda en el historial como anulado, con su motivo. Si era una venta devuelve el
// stock; si era el cobro de una reserva, una inscripción o una cuota, el origen vuelve a quedar pendiente de pago.
// Responde 200 con { mensaje, movimiento } (el mismo que devuelve el detalle) y, en una cuota, la situación del socio.
export const anular = async (req, res) => {
  const { id } = req.params
  if (!REGEX_UUID.test(id)) return res.status(404).json(NO_ENCONTRADO)

  const { motivo } = req.body ?? {}
  const texto = typeof motivo === 'string' ? motivo.trim() : ''
  if (!texto) return res.status(400).json({ mensaje: 'Ingresá el motivo de la anulación', campo: 'motivo' })
  if (texto.length > MOTIVO_MAXIMO) {
    return res.status(400).json({ mensaje: `El motivo no puede superar los ${MOTIVO_MAXIMO} caracteres`, campo: 'motivo' })
  }

  try {
    const r = await anularMovimiento({ id: id.toLowerCase(), motivo: texto, usuarioId: req.usuario.id })
    if (r.resultado === 'NO_ENCONTRADO') return res.status(404).json(NO_ENCONTRADO)
    if (r.resultado === 'ESTADO_INVALIDO') return res.status(409).json({ mensaje: ESTADOS[r.estado] ?? 'El movimiento no se puede anular', estado: r.estado })
    if (r.resultado !== 'OK') {
      const [estado, mensaje] = RECHAZOS[r.resultado]
      return res.status(estado).json({ mensaje })
    }
    const respuesta = { mensaje: 'Movimiento anulado', movimiento: await obtenerMovimiento(id) }
    if (r.situacionCuotas) respuesta.situacionCuotas = r.situacionCuotas
    return res.status(200).json(respuesta)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ mensaje: 'No se pudo anular el movimiento. No se guardó ningún cambio' })
  }
}