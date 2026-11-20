import { confirmarReserva } from '../reservas/modelo.reservas.js'
import { anularInscripcionesVencidas, buscarInscripcionPorId, confirmarPagoInscripcion } from '../torneos/modelo.inscripciones.js'
import { bloquearTorneo } from '../torneos/modelo.torneos.js'
import { registrarPagoCuota, situacionCuotasDelSocio } from '../cuotas/modelo.cuotas.js'

// Cobro de un origen: marca como pagada la reserva, la inscripción o la cuota y devuelve lo que la caja necesita para asentar
// el movimiento (monto, cliente, descripción). Es la función que comparten el registro manual de Recepción (M5-BE-12), los
// endpoints de cobro que ya existían (M5-BE-13) y el webhook de Mercado Pago (M5-BE-18).
//
// IMPORTANTE: tiene que llamarse DENTRO de una transacción abierta por quien la usa (`db` es un cliente con `begin` hecho), junto con
// el asiento en caja, para que el cobro y el movimiento sean todo o nada. Un cobro que no prospera NO lanza error: devuelve el motivo
// en `resultado` y el que llama decide (lo normal es confirmar la transacción igual, porque una reserva o inscripción vencida
// queda marcada como tal). Dos cobros simultáneos del mismo origen no se pisan: el segundo espera al primero y ve el origen ya pagado.
//
// Devuelve { resultado: 'OK', monto, clienteId, descripcion, ids: { reservaId | inscripcionId | cuotaId }, situacionCuotas? }
// o { resultado: 'NO_ENCONTRADO' | 'NO_COBRABLE' | 'SIN_MONTO' | 'YA_PAGADO' | 'VENCIDO' | 'CANCELADO', estadoOrigen? }.

const cobrarReserva = async (reservaId, metodoPago, operadorId, db) => {
  // Una reserva pendiente sin precio no se puede asentar en caja (el monto tiene que ser mayor a cero): se revisa antes de cobrarla
  const { rows: previa } = await db.query('select estado, precio_aplicado as monto from reserva where id = $1 for update', [reservaId])
  if (previa[0]?.estado === 'PENDIENTE' && !(Number(previa[0].monto) > 0)) return { resultado: 'SIN_MONTO' }

  const { resultado } = await confirmarReserva(reservaId, operadorId, metodoPago, db)
  if (resultado === 'NO_ENCONTRADA') return { resultado: 'NO_ENCONTRADO' }
  if (resultado === 'NO_COBRABLE') return { resultado: 'NO_COBRABLE' }
  if (resultado === 'YA_PAGADA') return { resultado: 'YA_PAGADO', estadoOrigen: 'CONFIRMADA' }
  if (resultado === 'EXPIRADA') return { resultado: 'VENCIDO', estadoOrigen: 'EXPIRADA' }
  if (resultado === 'CANCELADA') return { resultado: 'CANCELADO', estadoOrigen: 'CANCELADA' }

  const { rows } = await db.query(
    `select r.cliente_usuario_id as "clienteId", r.precio_aplicado as monto, c.nombre as cancha,
            to_char(r.fecha, 'DD/MM/YYYY') as fecha, to_char(r.hora_inicio, 'HH24:MI') as inicio, to_char(r.hora_fin, 'HH24:MI') as fin
       from reserva r join cancha c on c.id = r.cancha_id where r.id = $1`,
    [reservaId]
  )
  const r = rows[0]
  return {
    resultado: 'OK',
    monto: Number(r.monto),
    clienteId: r.clienteId,
    descripcion: `Cobro de reserva · ${r.cancha} · ${r.fecha} de ${r.inicio} a ${r.fin}`,
    ids: { reservaId },
  }
}

const cobrarInscripcion = async (inscripcionId, operadorId, db) => {
  const previa = await buscarInscripcionPorId(inscripcionId, db)
  if (!previa) return { resultado: 'NO_ENCONTRADO' }
  // Igual que inscribirse: con el torneo bloqueado, y vencidas las pendientes con el plazo pasado (una inscripción vencida no se cobra)
  await bloquearTorneo(previa.torneoId, db)
  await anularInscripcionesVencidas(previa.torneoId, db)

  const actual = await buscarInscripcionPorId(inscripcionId, db)
  if (actual.estado !== 'ACTIVA') return { resultado: 'VENCIDO', estadoOrigen: 'ANULADA' }
  if (actual.estadoPago === 'PAGADO') return { resultado: 'YA_PAGADO', estadoOrigen: 'PAGADO' }

  const { rows } = await db.query(
    `select t.nombre, t.precio_inscripcion as monto, j.usuario_id as "clienteId"
       from torneo t, jugador j where t.id = $1 and j.id = $2`,
    [actual.torneoId, actual.titularJugadorId]
  )
  const t = rows[0]
  if (!(Number(t.monto) > 0)) return { resultado: 'SIN_MONTO' }
  if (!(await confirmarPagoInscripcion(inscripcionId, operadorId, db))) return { resultado: 'YA_PAGADO', estadoOrigen: 'PAGADO' }

  const pareja = actual.companeroNombre ? ` · con ${actual.companeroNombre} ${actual.companeroApellido}` : ''
  return {
    resultado: 'OK',
    monto: Number(t.monto),
    clienteId: t.clienteId,
    descripcion: `Cobro de inscripción · ${t.nombre} · ${actual.titularNombre} ${actual.titularApellido}${pareja}`,
    ids: { inscripcionId },
  }
}

const cobrarCuota = async (cuotaId, metodoPago, operadorId, db) => {
  // La fila queda bloqueada hasta el final de la transacción: un segundo cobro de la misma cuota espera y la ve pagada
  const { rows } = await db.query(
    `select q.estado_pago as "estadoPago", q.monto, q.mes, q.anio, q.socio_id as "socioId", j.usuario_id as "clienteId",
            u.nombre || ' ' || u.apellido as socio
       from cuota_mensual q join socio s on s.id = q.socio_id join jugador j on j.id = s.jugador_id join usuario u on u.id = j.usuario_id
      where q.id = $1 for update of q`,
    [cuotaId]
  )
  const q = rows[0]
  if (!q) return { resultado: 'NO_ENCONTRADO' }
  if (q.estadoPago === 'PAGADO') return { resultado: 'YA_PAGADO', estadoOrigen: 'PAGADO' }
  // Sin fecha de pago: se toma el momento actual
  if (!(await registrarPagoCuota(cuotaId, metodoPago, null, operadorId, db))) return { resultado: 'YA_PAGADO', estadoOrigen: 'PAGADO' }

  return {
    resultado: 'OK',
    monto: Number(q.monto),
    clienteId: q.clienteId,
    descripcion: `Cobro de cuota · ${String(q.mes).padStart(2, '0')}/${q.anio} · ${q.socio}`,
    ids: { cuotaId },
    // El socio vuelve a «Al día» si ya no le quedan cuotas vencidas
    situacionCuotas: await situacionCuotasDelSocio(q.socioId, db),
  }
}

export const cobrarOrigen = (concepto, origenId, metodoPago, operadorId, db) => {
  if (concepto === 'RESERVA') return cobrarReserva(origenId, metodoPago, operadorId, db)
  if (concepto === 'INSCRIPCION') return cobrarInscripcion(origenId, operadorId, db)
  if (concepto === 'CUOTA') return cobrarCuota(origenId, metodoPago, operadorId, db)
  throw new Error(`Concepto sin origen de cobro: ${concepto}`)
}