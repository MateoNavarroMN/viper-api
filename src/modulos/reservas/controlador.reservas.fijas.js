import { CONTRATOS_POR_PAGINA, cancelarContrato, crearReservaFija, finalizarVencidos, listarReservasFijas, obtenerDetalleReservaFija, obtenerReservaFija } from './modelo.reservas.fijas.js'
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

const ESTADOS = ['VIGENTE', 'FINALIZADO']

// GET /api/reservas-fijas?estado=VIGENTE|FINALIZADO&q=&pagina=1  (Recepción y Administrador)
// Responde { estado, q, pagina, porPagina, total, totalPaginas, contratos: [...] }. Sin `estado` trae todos; `q` busca por cliente
// (nombre, apellido, correo, DNI) o por cancha. Antes de leer, finaliza los contratos cuya fecha de fin ya pasó.
export const listar = async (req, res) => {
  const estado = req.query.estado === undefined || req.query.estado === '' ? null : req.query.estado
  if (estado !== null && !ESTADOS.includes(estado)) {
    return res.status(400).json({ mensaje: 'El estado tiene que ser VIGENTE o FINALIZADO', campo: 'estado' })
  }
  const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 100) : ''
  const pagina = req.query.pagina === undefined ? 1 : Number(req.query.pagina)
  if (!Number.isInteger(pagina) || pagina < 1) {
    return res.status(400).json({ mensaje: 'La página tiene que ser un número entero desde 1', campo: 'pagina' })
  }

  try {
    await finalizarVencidos()
    const { total, contratos } = await listarReservasFijas({ estado, q, pagina })
    return res.status(200).json({
      estado,
      q,
      pagina,
      porPagina: CONTRATOS_POR_PAGINA,
      total,
      totalPaginas: Math.max(1, Math.ceil(total / CONTRATOS_POR_PAGINA)),
      contratos,
    })
  } catch (error) {
    console.error(error)
    return res.status(500).json({ mensaje: 'No se pudieron obtener los alquileres fijos' })
  }
}

// GET /api/reservas-fijas/:id  (Recepción y Administrador)
// El contrato con cada una de sus reservas FIJA y su estado (CONFIRMADA o CANCELADA), de la primera a la última fecha.
export const obtener = async (req, res) => {
  const { id } = req.params
  if (!REGEX_UUID.test(id)) return res.status(404).json({ mensaje: 'Contrato no encontrado' })
  try {
    await finalizarVencidos()
    const contrato = await obtenerDetalleReservaFija(id)
    if (!contrato) return res.status(404).json({ mensaje: 'Contrato no encontrado' })
    return res.status(200).json(contrato)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ mensaje: 'No se pudo obtener el contrato' })
  }
}

// POST /api/reservas-fijas/:id/cancelar  (Recepción y Administrador)
// Cancela las reservas del contrato que todavía no empezaron (liberando sus franjas), conserva las que ya pasaron y deja el contrato
// FINALIZADO. Responde { mensaje, contrato, turnosCancelados, turnosConservados }.
export const cancelar = async (req, res) => {
  const { id } = req.params
  if (!REGEX_UUID.test(id)) return res.status(404).json({ mensaje: 'Contrato no encontrado' })
  try {
    const resultado = await cancelarContrato(id)
    if (resultado.resultado === 'NO_ENCONTRADO') return res.status(404).json({ mensaje: 'Contrato no encontrado' })
    if (resultado.resultado === 'YA_FINALIZADO') return res.status(409).json({ mensaje: 'El contrato ya finalizó' })

    const contrato = await obtenerReservaFija(id)
    const { canceladas, conservadas } = resultado
    return res.status(200).json({
      mensaje: canceladas === 0
        ? 'Contrato cancelado. No quedaban turnos por delante.'
        : `Contrato cancelado. Se liberaron ${canceladas} ${canceladas === 1 ? 'turno' : 'turnos'}.`,
      contrato,
      turnosCancelados: canceladas,
      turnosConservados: conservadas,
    })
  } catch (error) {
    console.error(error)
    return res.status(500).json({ mensaje: 'No se pudo cancelar el contrato' })
  }
}