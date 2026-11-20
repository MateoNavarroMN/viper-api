import { pool } from '../../config/conexion.bd.js'
import { asegurarCajaAbierta, esCajaCerrada, registrarTransaccion } from './modelo.caja.js'
import { cobrarOrigen } from './cobros.caja.js'

// Registro manual de un movimiento de caja (CU 5.3), en una sola transacción: o queda todo (el cobro del origen y su asiento en
// caja) o no queda nada.
// datos: { tipo: 'INGRESO' | 'EGRESO', concepto, metodoPago, operadorId, descripcion?, monto? (egresos), origenId? (cobros) }
// Devuelve { resultado: 'OK', id, situacionCuotas? } | { resultado: 'CAJA_CERRADA' }
// | { resultado: 'NO_ENCONTRADO' | 'NO_COBRABLE' | 'SIN_MONTO' | 'YA_PAGADO' | 'VENCIDO' | 'CANCELADO', estadoOrigen? }
export const registrarMovimientoManual = async ({ tipo, concepto, metodoPago, operadorId, descripcion, monto, origenId }) => {
  const cliente = await pool.connect()
  try {
    await cliente.query('begin')
    // Con la caja cerrada no se hace nada (9c). Además toma el candado que ordena este alta contra el cierre de caja.
    await asegurarCajaAbierta(cliente)

    let asiento = { tipoMovimiento: tipo, concepto, descripcion, monto, metodoPago, operadorId }
    let situacionCuotas
    if (tipo === 'INGRESO') {
      const cobro = await cobrarOrigen(concepto, origenId, metodoPago, operadorId, cliente)
      if (cobro.resultado !== 'OK') {
        // Se confirma igual: una reserva o inscripción vencida queda marcada como tal. El cobro no hizo ningún otro cambio.
        await cliente.query('commit')
        return cobro
      }
      asiento = { ...asiento, descripcion: descripcion ?? cobro.descripcion, monto: cobro.monto, clienteId: cobro.clienteId, ...cobro.ids }
      situacionCuotas = cobro.situacionCuotas
    }

    const { id } = await registrarTransaccion(asiento, cliente)
    await cliente.query('commit')
    return { resultado: 'OK', id, situacionCuotas }
  } catch (error) {
    await cliente.query('rollback').catch(() => {})
    if (esCajaCerrada(error)) return { resultado: 'CAJA_CERRADA' }
    throw error
  } finally {
    cliente.release()
  }
}