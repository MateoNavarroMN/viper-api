import { pool } from '../../config/conexion.bd.js'
import { bloquearTorneo } from './modelo.torneos.js'
import { anularInscripcionesVencidas, buscarInscripcionPorId, confirmarPagoInscripcion } from './modelo.inscripciones.js'

// Confirma el pago de una inscripción (CU 3.2 · 7a). Es la función que reutilizan el cobro en efectivo de
// recepción (M3-BE-07) y, más adelante, el webhook de Mercado Pago (CU 5.4) y el registro en caja (Módulo 5).
// `operadorUsuarioId` es quien registra el cobro; el webhook puede pasar null.
//
// Corre en una transacción con la fila del torneo bloqueada, igual que inscribirse: antes de decidir se anulan
// las pendientes vencidas, así una inscripción cuyo plazo ya pasó no se puede cobrar.
// Devuelve { resultado: 'NO_ENCONTRADA' | 'ANULADA' | 'YA_PAGADA' | 'OK', inscripcion }.
export const confirmarPago = async (inscripcionId, operadorUsuarioId = null) => {
  const previa = await buscarInscripcionPorId(inscripcionId)
  if (!previa) return { resultado: 'NO_ENCONTRADA', inscripcion: null }

  const cliente = await pool.connect()
  try {
    await cliente.query('begin')
    await bloquearTorneo(previa.torneoId, cliente)
    await anularInscripcionesVencidas(previa.torneoId, cliente)

    const actual = await buscarInscripcionPorId(inscripcionId, cliente)
    let resultado = 'OK'
    if (actual.estado !== 'ACTIVA') resultado = 'ANULADA'
    else if (actual.estadoPago === 'PAGADO') resultado = 'YA_PAGADA'
    else await confirmarPagoInscripcion(inscripcionId, operadorUsuarioId, cliente)

    // Se confirma siempre: si se anuló una vencida, esa anulación tiene que quedar guardada
    await cliente.query('commit')
    return { resultado, inscripcion: resultado === 'OK' ? await buscarInscripcionPorId(inscripcionId) : actual }
  } catch (error) {
    await cliente.query('rollback')
    throw error
  } finally {
    cliente.release()
  }
}