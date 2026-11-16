import { crearReservaFija, obtenerReservaFija } from './modelo.reservas.fijas.js'
import { obtenerClienteReserva } from './modelo.reservas.js'

const REGEX_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
// El club agenda de a media hora, como Recepción en el turno directo
const REGEX_HORA = /^([01]\d|2[0-3]):(00|30)$/

const esFecha = (valor) => {
  if (typeof valor !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false
  const fecha = new Date(`${valor}T00:00:00Z`)
  return !Number.isNaN(fecha.getTime()) && fecha.toISOString().slice(0, 10) === valor
}

// Qué responde cada resultado de crearReservaFija cuando no salió bien
const RECHAZOS = {
  CANCHA_NO_ENCONTRADA: [404, 'Cancha no encontrada', 'canchaId'],
  CANCHA_INACTIVA: [409, 'La cancha no está disponible', 'canchaId'],
  HORARIO_INVALIDO: [400, 'Datos inválidos: la hora de fin tiene que ser posterior a la de inicio', 'horaFin'],
  FUERA_DE_HORARIO: [400, 'Datos inválidos: el horario tiene que estar dentro del horario del club (08:00 a 23:00)', 'horaInicio'],
  FECHA_PASADA: [400, 'Datos inválidos: la fecha de inicio ya pasó', 'fechaInicio'],
  DIA_NO_COINCIDE: [400, 'Datos inválidos: la fecha de inicio no cae en el día de la semana elegido', 'fechaInicio'],
}

// POST /api/reservas-fijas  { clienteJugadorId, canchaId, diaSemana (1 = lunes ... 7 = domingo), horaInicio, horaFin, fechaInicio }
// Recepción da de alta un contrato de 3 meses para un cliente con cuenta (CU 2.4). Responde 201 con el contrato y los turnos generados.
export const crear = async (req, res) => {
  const { clienteJugadorId, canchaId, diaSemana, horaInicio, horaFin, fechaInicio } = req.body ?? {}
  const invalido = (mensaje, campo) => res.status(400).json({ mensaje: `Datos inválidos: ${mensaje}`, campo })
  if (typeof clienteJugadorId !== 'string' || !REGEX_UUID.test(clienteJugadorId)) return invalido('elegí el cliente del contrato', 'clienteJugadorId')
  if (typeof canchaId !== 'string' || !REGEX_UUID.test(canchaId)) return invalido('elegí una cancha', 'canchaId')
  if (!Number.isInteger(diaSemana) || diaSemana < 1 || diaSemana > 7) return invalido('elegí el día de la semana (1 = lunes a 7 = domingo)', 'diaSemana')
  if (typeof horaInicio !== 'string' || !REGEX_HORA.test(horaInicio)) return invalido('la hora de inicio tiene que ser en punto o y media, por ejemplo 19:30', 'horaInicio')
  if (typeof horaFin !== 'string' || !REGEX_HORA.test(horaFin)) return invalido('la hora de fin tiene que ser en punto o y media, por ejemplo 20:30', 'horaFin')
  if (!esFecha(fechaInicio)) return invalido('la fecha de inicio debe tener el formato AAAA-MM-DD', 'fechaInicio')

  try {
    // 5a · el cliente tiene que tener una cuenta de jugador
    const clienteUsuarioId = await obtenerClienteReserva(clienteJugadorId)
    if (!clienteUsuarioId) return res.status(404).json({ mensaje: 'El cliente debe tener una cuenta para alquilar una cancha fija', campo: 'clienteJugadorId' })

    const resultado = await crearReservaFija({ canchaId, clienteUsuarioId, diaSemana, horaInicio, horaFin, fechaInicio })
    if (resultado.resultado === 'FECHAS_OCUPADAS') {
      // 8a · no se creó nada; la lista permite ajustar el horario o la cancha, o gestionar esas fechas
      return res.status(409).json({ mensaje: 'Hay fechas ocupadas en ese horario', fechasEnConflicto: resultado.fechas })
    }
    if (resultado.resultado !== 'OK') {
      const [estado, mensaje, campo] = RECHAZOS[resultado.resultado]
      return res.status(estado).json({ mensaje, campo })
    }

    const contrato = await obtenerReservaFija(resultado.contratoId)
    return res.status(201).json({
      mensaje: `Alquiler fijo registrado: ${resultado.turnos} turnos hasta el ${contrato.fechaFinContrato.split('-').reverse().join('/')}.`,
      contrato,
      turnosGenerados: resultado.turnos,
    })
  } catch (error) {
    console.error(error)
    return res.status(500).json({ mensaje: 'No se pudo registrar el alquiler fijo' })
  }
}