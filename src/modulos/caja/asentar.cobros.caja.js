import { pool } from '../../config/conexion.bd.js'
import { confirmarReserva } from '../reservas/modelo.reservas.js'
import { confirmarPagoInscripcion } from '../torneos/modelo.inscripciones.js'
import { cobrarOrigen } from './cobros.caja.js'
import { asegurarCajaAbierta, esCajaCerrada, registrarTransaccion } from './modelo.caja.js'

// Cobra una reserva, una inscripción o una cuota y asienta el ingreso en la caja de hoy, todo en UNA transacción: o queda el cobro
// con su movimiento, o no queda nada. Es lo que usan los endpoints de cobro que ya existían (reserva, inscripción y cuota) y el
// turno cargado y cobrado en el momento.
//
// datos: { concepto: 'RESERVA' | 'INSCRIPCION' | 'CUOTA', origenId, metodoPago, operadorId, fechaPago? (solo cuotas),
//          crearOrigen? (async (cliente) => { resultado: 'OK', origenId } | otro resultado: crea el origen en esta misma transacción) }
// Si el origen no tiene importe (un torneo gratuito, una cancha sin precio) el cobro se confirma igual, sin movimiento: no entró plata.
// Con la caja cerrada no se cobra nada y el origen sigue pendiente.
// Devuelve { resultado: 'OK', origenId, movimientoId (null si no hubo importe), situacionCuotas? } | { resultado: 'CAJA_CERRADA' }
// | { resultado: 'NO_ENCONTRADO' | 'NO_COBRABLE' | 'YA_PAGADO' | 'VENCIDO' | 'CANCELADO', estadoOrigen? } | lo que devuelva `crearOrigen` si no fue 'OK'.
export const cobrarYAsentar = async ({ concepto, origenId, metodoPago, operadorId, fechaPago, crearOrigen }) => {
  const cliente = await pool.connect()
  try {
    await cliente.query('begin')
    // Con la caja cerrada no se hace nada. Además toma el candado que ordena este cobro contra el cierre de caja.
    await asegurarCajaAbierta(cliente)

    let id = origenId
    if (crearOrigen) {
      const creado = await crearOrigen(cliente)
      if (creado.resultado !== 'OK') {
        await cliente.query('rollback')
        return creado
      }
      id = creado.origenId
    }

    const cobro = await cobrarOrigen(concepto, id, metodoPago, operadorId, cliente, { fechaPago })
    if (cobro.resultado !== 'OK' && cobro.resultado !== 'SIN_MONTO') {
      // Se confirma igual: una reserva o inscripción vencida queda marcada como tal. Si se creó el origen acá, se deshace.
      await cliente.query(crearOrigen ? 'rollback' : 'commit')
      return cobro
    }

    let movimientoId = null
    if (cobro.resultado === 'SIN_MONTO') {
      // Sin importe no hay nada que asentar: se confirma el pago como antes
      if (concepto === 'RESERVA') {
        // El plazo se revisa recién acá: una reserva gratuita vencida ya no se puede confirmar
        const { resultado } = await confirmarReserva(id, operadorId, metodoPago, cliente)
        if (resultado !== 'OK') {
          await cliente.query(crearOrigen ? 'rollback' : 'commit')
          return { resultado: { EXPIRADA: 'VENCIDO', YA_PAGADA: 'YA_PAGADO', CANCELADA: 'CANCELADO' }[resultado] ?? resultado }
        }
      } else await confirmarPagoInscripcion(id, operadorId, cliente)
    } else {
      const asiento = await registrarTransaccion(
        { tipoMovimiento: 'INGRESO', concepto, descripcion: cobro.descripcion, monto: cobro.monto, metodoPago, operadorId, clienteId: cobro.clienteId, ...cobro.ids },
        cliente
      )
      movimientoId = asiento.id
    }
    await cliente.query('commit')
    return { resultado: 'OK', origenId: id, movimientoId, situacionCuotas: cobro.situacionCuotas }
  } catch (error) {
    await cliente.query('rollback').catch(() => {})
    if (esCajaCerrada(error)) return { resultado: 'CAJA_CERRADA' }
    throw error
  } finally {
    cliente.release()
  }
}