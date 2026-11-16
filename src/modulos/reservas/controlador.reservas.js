import { accionesPermitidas } from './acciones.reservas.js'
import { ANTICIPACION_CANCELACION_HORAS, MENSAJE_FRANJA_OCUPADA, cancelarPorDecision, confirmarReserva, crearReserva, expirarVencidas, modificarHorario, obtenerClienteReserva, obtenerReservaDetalle } from './modelo.reservas.js'

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
  HORARIO_INVALIDO: [400, 'La hora de fin tiene que ser posterior a la de inicio'],
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


const METODOS_DE_COBRO = ['EFECTIVO', 'TRANSFERENCIA']
const REGEX_HORA = /^([01]\d|2[0-3]):(00|30)$/

// POST /api/reservas/directa  { clienteJugadorId, canchaId, fecha, horaInicio, horaFin, cobro: { registrar, metodoPago? } }
// Recepción carga un turno para un cliente con cuenta (CU 2.3), con cualquier horario del día en punto o y media.
// Con cobro registrado queda CONFIRMADA (método, fecha de pago y operador); sin cobro, PENDIENTE con su plazo de 24 horas.
export const crearDirecta = async (req, res) => {
  const { clienteJugadorId, canchaId, fecha, horaInicio, horaFin, cobro } = req.body ?? {}
  if (typeof clienteJugadorId !== 'string' || !REGEX_UUID.test(clienteJugadorId)) {
    return res.status(400).json({ mensaje: 'Elegí el cliente del turno', campo: 'clienteJugadorId' })
  }
  if (typeof canchaId !== 'string' || !REGEX_UUID.test(canchaId)) {
    return res.status(400).json({ mensaje: 'Elegí una cancha', campo: 'canchaId' })
  }
  if (!esFecha(fecha)) return res.status(400).json({ mensaje: 'La fecha debe tener el formato AAAA-MM-DD', campo: 'fecha' })
  if (typeof horaInicio !== 'string' || !REGEX_HORA.test(horaInicio)) {
    return res.status(400).json({ mensaje: 'La hora de inicio tiene que ser en punto o y media, por ejemplo 19:30', campo: 'horaInicio' })
  }
  if (typeof horaFin !== 'string' || !REGEX_HORA.test(horaFin)) {
    return res.status(400).json({ mensaje: 'La hora de fin tiene que ser en punto o y media, por ejemplo 20:30', campo: 'horaFin' })
  }
  if (typeof cobro?.registrar !== 'boolean') {
    return res.status(400).json({ mensaje: 'Indicá si se cobra ahora o queda pendiente', campo: 'cobro' })
  }
  if (cobro.registrar && !METODOS_DE_COBRO.includes(cobro.metodoPago)) {
    return res.status(400).json({ mensaje: 'Elegí el medio de pago: efectivo o transferencia', campo: 'metodoPago' })
  }

  try {
    const clienteUsuarioId = await obtenerClienteReserva(clienteJugadorId)
    if (!clienteUsuarioId) return res.status(404).json({ mensaje: 'El cliente debe tener una cuenta para reservar', campo: 'clienteJugadorId' })

    const resultado = await crearReserva({
      canchaId,
      clienteUsuarioId,
      fecha,
      horaInicio,
      horaFin,
      cobro: cobro.registrar ? { metodoPago: cobro.metodoPago, operadorUsuarioId: req.usuario.id } : null,
    })
    if (resultado.resultado !== 'OK') {
      const [estado, mensaje] = RECHAZOS[resultado.resultado]
      return res.status(estado).json({ mensaje })
    }

    const reserva = await obtenerReservaDetalle(resultado.reservaId)
    const { segundosParaInicio, ...datos } = reserva
    const mensaje = cobro.registrar
      ? 'Turno registrado y cobrado. La reserva queda confirmada.'
      : 'Turno registrado. Queda pendiente hasta que se registre el pago.'
    return res.status(201).json({ mensaje, reserva: { ...datos, acciones: accionesPermitidas(reserva, req.usuario.rol) } })
  } catch (error) {
    console.error(error)
    return res.status(500).json({ mensaje: 'No se pudo registrar el turno' })
  }
}

// Por qué no se pudo cobrar, según el resultado de confirmarReserva
const RECHAZOS_COBRO = {
  NO_ENCONTRADA: [404, 'Reserva no encontrada'],
  NO_COBRABLE: [409, 'Esta reserva no se cobra desde acá'],
  EXPIRADA: [409, 'El plazo de pago venció y la franja fue liberada'],
  YA_PAGADA: [409, 'La reserva ya está pagada'],
  CANCELADA: [409, 'La reserva está cancelada'],
}

// POST /api/reservas/:id/cobro  { metodoPago: 'EFECTIVO' | 'TRANSFERENCIA' }
// Recepción registra el pago de una reserva PENDIENTE: pasa a CONFIRMADA con el medio, la fecha y quién la cobró.
export const cobrar = async (req, res) => {
  const { id } = req.params
  if (!REGEX_UUID.test(id)) return res.status(404).json(NO_ENCONTRADA)
  const { metodoPago } = req.body ?? {}
  if (!METODOS_DE_COBRO.includes(metodoPago)) {
    return res.status(400).json({ mensaje: 'Elegí el medio de pago: efectivo o transferencia', campo: 'metodoPago' })
  }

  try {
    const { resultado } = await confirmarReserva(id, req.usuario.id, metodoPago)
    if (resultado !== 'OK') {
      const [estado, mensaje] = RECHAZOS_COBRO[resultado]
      return res.status(estado).json({ mensaje })
    }
    const reserva = await obtenerReservaDetalle(id)
    const { segundosParaInicio, ...datos } = reserva
    return res.status(200).json({ mensaje: 'Cobro registrado. La reserva queda confirmada.', reserva: { ...datos, acciones: accionesPermitidas(reserva, req.usuario.rol) } })
  } catch (error) {
    console.error(error)
    return res.status(500).json({ mensaje: 'No se pudo registrar el cobro' })
  }
}

// POST /api/reservas/:id/cancelar  { confirmarFueraDePlazo? }
// Cancela una reserva y libera su franja. El Jugador, solo las suyas y hasta 3 horas antes; Recepción y Administrador, cualquiera
// mientras el turno no haya empezado. Si al personal le faltan menos de 3 horas, la primera llamada responde 409 con
// `requiereConfirmacion` y recién con `confirmarFueraDePlazo: true` se cancela. Una fecha de un alquiler fijo se cancela sola.
export const cancelar = async (req, res) => {
  const { id } = req.params
  if (!REGEX_UUID.test(id)) return res.status(404).json(NO_ENCONTRADA)
  const { confirmarFueraDePlazo } = req.body ?? {}
  if (confirmarFueraDePlazo !== undefined && typeof confirmarFueraDePlazo !== 'boolean') {
    return res.status(400).json({ mensaje: 'confirmarFueraDePlazo tiene que ser verdadero o falso', campo: 'confirmarFueraDePlazo' })
  }

  try {
    // Antes de decidir: una pendiente con el plazo vencido figura expirada
    await expirarVencidas()
    const reserva = await obtenerReservaDetalle(id)
    if (!reserva) return res.status(404).json(NO_ENCONTRADA)
    // La reserva de otro Jugador responde como si no existiera
    if (req.usuario.rol === 'JUGADOR' && reserva.cliente?.id !== req.usuario.id) return res.status(404).json(NO_ENCONTRADA)

    const { permitido, motivo } = accionesPermitidas(reserva, req.usuario.rol).cancelar
    if (!permitido) return res.status(409).json({ mensaje: motivo })

    const fueraDePlazo = req.usuario.rol !== 'JUGADOR' && reserva.segundosParaInicio < ANTICIPACION_CANCELACION_HORAS * 3600
    if (fueraDePlazo && confirmarFueraDePlazo !== true) {
      return res.status(409).json({
        mensaje: `Faltan menos de ${ANTICIPACION_CANCELACION_HORAS} horas para el turno: es una cancelación fuera de plazo. Confirmá para cancelarla igual.`,
        requiereConfirmacion: true,
      })
    }

    const cancelada = await cancelarPorDecision(id)
    if (cancelada.resultado !== 'OK') {
      // La ganó otra operación simultánea (otra cancelación, o venció): se informa cómo quedó
      return res.status(409).json({ mensaje: cancelada.estado === 'EXPIRADA' ? 'La reserva expiró por falta de pago' : 'La reserva está cancelada' })
    }

    const actual = await obtenerReservaDetalle(id)
    const { segundosParaInicio, ...datos } = actual
    const respuesta = { mensaje: 'Reserva cancelada. La franja quedó libre.', reserva: { ...datos, acciones: accionesPermitidas(actual, req.usuario.rol) } }
    // Los reembolsos se gestionan fuera del sistema
    if (cancelada.estadoPrevio === 'CONFIRMADA' && cancelada.precioAplicado > 0) respuesta.reembolsoFueraDelSistema = true
    return res.status(200).json(respuesta)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ mensaje: 'No se pudo cancelar la reserva' })
  }
}

// Por qué no se pudo modificar el horario, según el resultado de modificarHorario
const RECHAZOS_HORARIO = {
  NO_ENCONTRADA: [404, 'Reserva no encontrada'],
  NO_MODIFICABLE: [409, 'La reserva ya no se puede modificar'],
  CANCHA_INACTIVA: [409, 'La cancha no está disponible'],
  HORARIO_INVALIDO: [400, 'La hora de fin tiene que ser posterior a la de inicio'],
  FUERA_DE_HORARIO: [400, 'El turno tiene que estar dentro del horario del club (08:00 a 23:00)'],
  FECHA_PASADA: [400, 'La fecha y la hora ya pasaron'],
  FRANJA_OCUPADA: [409, MENSAJE_FRANJA_OCUPADA],
}

const minutosDe = (hora) => Number(hora.slice(0, 2)) * 60 + Number(hora.slice(3, 5))

// PATCH /api/reservas/:id/horario  { fecha, horaInicio, horaFin }
// Cambia el día y el horario de una reserva (misma cancha) y recalcula su precio. El Jugador, solo las suyas y hasta 3 horas antes del
// turno, y con turnos de 60 minutos en punto como al reservar; Recepción y Administrador, cualquiera, en punto o y media y con cualquier duración.
export const modificarHorarioReserva = async (req, res) => {
  const { id } = req.params
  if (!REGEX_UUID.test(id)) return res.status(404).json(NO_ENCONTRADA)
  const { fecha, horaInicio, horaFin } = req.body ?? {}
  const esJugador = req.usuario.rol === 'JUGADOR'

  if (!esFecha(fecha)) return res.status(400).json({ mensaje: 'La fecha debe tener el formato AAAA-MM-DD', campo: 'fecha' })
  const regexHora = esJugador ? /^([01]\d|2[0-3]):00$/ : REGEX_HORA
  if (typeof horaInicio !== 'string' || !regexHora.test(horaInicio)) {
    return res.status(400).json({ mensaje: `La hora de inicio tiene que ser en punto${esJugador ? '' : ' o y media'}, por ejemplo 19:00`, campo: 'horaInicio' })
  }
  if (typeof horaFin !== 'string' || !regexHora.test(horaFin)) {
    return res.status(400).json({ mensaje: `La hora de fin tiene que ser en punto${esJugador ? '' : ' o y media'}, por ejemplo 20:00`, campo: 'horaFin' })
  }
  if (esJugador && minutosDe(horaFin) - minutosDe(horaInicio) !== 60) {
    return res.status(400).json({ mensaje: 'Tu turno dura 1 hora: la hora de fin tiene que ser una hora después de la de inicio', campo: 'horaFin' })
  }

  try {
    await expirarVencidas()
    const reserva = await obtenerReservaDetalle(id)
    if (!reserva) return res.status(404).json(NO_ENCONTRADA)
    if (esJugador && reserva.cliente?.id !== req.usuario.id) return res.status(404).json(NO_ENCONTRADA)

    const { permitido, motivo } = accionesPermitidas(reserva, req.usuario.rol).modificarHorario
    if (!permitido) return res.status(409).json({ mensaje: motivo })

    const resultado = await modificarHorario(id, { fecha, horaInicio, horaFin })
    if (resultado.resultado !== 'OK') {
      const [estado, mensaje] = RECHAZOS_HORARIO[resultado.resultado]
      const campo = { HORARIO_INVALIDO: 'horaFin', FUERA_DE_HORARIO: 'horaInicio', FECHA_PASADA: 'horaInicio' }[resultado.resultado]
      return res.status(estado).json(campo ? { mensaje, campo } : { mensaje })
    }

    const actual = await obtenerReservaDetalle(id)
    const { segundosParaInicio, ...datos } = actual
    return res.status(200).json({
      mensaje: 'Horario modificado.',
      reserva: { ...datos, acciones: accionesPermitidas(actual, req.usuario.rol) },
      precioAnterior: resultado.precioAnterior,
    })
  } catch (error) {
    console.error(error)
    return res.status(500).json({ mensaje: 'No se pudo modificar el horario' })
  }
}