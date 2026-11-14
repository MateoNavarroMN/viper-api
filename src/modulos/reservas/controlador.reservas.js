import { accionesPermitidas } from './acciones.reservas.js'
import { MENSAJE_FRANJA_OCUPADA, crearReserva, expirarVencidas, obtenerReservaDetalle } from './modelo.reservas.js'

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

const esFecha = (valor) => {
  if (typeof valor !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false
  const fecha = new Date(`${valor}T00:00:00Z`)
  return !Number.isNaN(fecha.getTime()) && fecha.toISOString().slice(0, 10) === valor
}

const MEDIOS_DE_PAGO = ['EN_LINEA', 'RECEPCION']

// Qué responde cada resultado de crearReserva cuando no salió bien
const RECHAZOS = {
  CANCHA_NO_ENCONTRADA: [404, 'Cancha no encontrada'],
  CANCHA_INACTIVA: [409, 'La cancha no está disponible'],
  FUERA_DE_HORARIO: [400, 'El turno tiene que estar dentro del horario del club (08:00 a 23:00)'],
  FECHA_PASADA: [400, 'La fecha y la hora ya pasaron'],
  FRANJA_OCUPADA: [409, MENSAJE_FRANJA_OCUPADA],
}

// POST /api/reservas  { canchaId, fecha, horaInicio, medioPago }
// El Jugador pide un turno de 60 minutos: queda PENDIENTE hasta que se pague (en recepción) o venza su plazo.
export const crear = async (req, res) => {
  const { canchaId, fecha, horaInicio, medioPago } = req.body ?? {}
  if (typeof canchaId !== 'string' || !REGEX_UUID.test(canchaId)) {
    return res.status(400).json({ mensaje: 'Elegí una cancha', campo: 'canchaId' })
  }
  if (!esFecha(fecha)) return res.status(400).json({ mensaje: 'La fecha debe tener el formato AAAA-MM-DD', campo: 'fecha' })
  if (typeof horaInicio !== 'string' || !/^([01]\d|2[0-3]):00$/.test(horaInicio)) {
    return res.status(400).json({ mensaje: 'La hora de inicio tiene que ser en punto, por ejemplo 19:00', campo: 'horaInicio' })
  }
  if (!MEDIOS_DE_PAGO.includes(medioPago)) {
    return res.status(400).json({ mensaje: 'Elegí cómo vas a pagar: en línea o en recepción', campo: 'medioPago' })
  }

  try {
    const resultado = await crearReserva({ canchaId, clienteUsuarioId: req.usuario.id, fecha, horaInicio })
    if (resultado.resultado !== 'OK') {
      const [estado, mensaje] = RECHAZOS[resultado.resultado]
      return res.status(estado).json({ mensaje })
    }

    const reserva = await obtenerReservaDetalle(resultado.reservaId)
    const { segundosParaInicio, ...datos } = reserva
    const respuesta = { mensaje: 'Reserva solicitada. Queda pendiente hasta que se registre el pago.', reserva: { ...datos, acciones: accionesPermitidas(reserva, req.usuario.rol) } }
    // El cobro en línea todavía no existe: la reserva queda pendiente y se paga en recepción dentro del plazo
    if (medioPago === 'EN_LINEA') {
      respuesta.pagoEnLinea = { disponible: false, mensaje: 'El pago en línea estará disponible próximamente. Podés pagar en recepción dentro del plazo.' }
    }
    return res.status(201).json(respuesta)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ mensaje: 'No se pudo solicitar la reserva' })
  }
}
