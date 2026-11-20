import { pool } from '../../config/conexion.bd.js'
import { actualizarStock } from '../productos/modelo.productos.js'
import { PLAZO_PAGO_HORAS } from '../reservas/modelo.reservas.js'
import { HORAS_PARA_PAGAR } from '../torneos/modelo.inscribir.torneos.js'
import { bloquearTorneo } from '../torneos/modelo.torneos.js'
import { situacionCuotasDelSocio } from '../cuotas/modelo.cuotas.js'
import { asegurarCajaAbierta, cajaCerrada, esCajaCerrada } from './modelo.caja.js'

const ZONA = "'America/Argentina/Cordoba'"
// Un torneo que ya tiene cuadro no puede volver a esperar un pago de inscripción
const TORNEO_CON_INSCRIPCIONES_ABIERTAS = ['PLANIFICADO', 'INSCRIPCIONES_ABIERTAS']

// Anulación de un movimiento de caja (CU 5.3), en una sola transacción: o queda todo (el movimiento anulado y su efecto sobre el
// stock o el origen) o no queda nada. Solo se anula un movimiento APROBADO de una caja que sigue abierta. El movimiento no se borra:
// queda en el historial como ANULADO con el motivo, quién lo anuló y cuándo.
//  · Venta de tienda: devuelve al stock lo vendido.
//  · Cobro de reserva, inscripción o cuota: el origen vuelve a PENDIENTE. La reserva recupera un plazo (24 hs, o el inicio del turno
//    si es antes) y la inscripción otro de 48 hs (sin pasar el inicio del torneo). Si la reserva y la inscripción ya no estaban pagas
//    (se cancelaron o se anularon después), solo se anula el movimiento: no hay nada que devolver a pendiente.
//  · Egreso: solo se anula el movimiento.
// Devuelve { resultado: 'OK', situacionCuotas? } | { resultado: 'NO_ENCONTRADO' | 'CAJA_CERRADA' | 'EN_LINEA' | 'TURNO_COMENZADO' | 'TORNEO_AVANZADO' }
// | { resultado: 'ESTADO_INVALIDO', estado }
export const anularMovimiento = async ({ id, motivo, usuarioId }) => {
  const cliente = await pool.connect()
  const terminar = async (resultado) => {
    await cliente.query('rollback')
    return resultado
  }
  try {
    await cliente.query('begin')
    // Con la caja de hoy cerrada no se anula nada. Además toma el candado que ordena esta anulación contra el cierre de caja.
    await asegurarCajaAbierta(cliente)

    const { rows } = await cliente.query(
      `select id, estado, concepto, metodo_pago as "metodoPago", cierre_caja_id as "cierreId", reserva_id as "reservaId",
              inscripcion_id as "inscripcionId", cuota_id as "cuotaId", (fecha_hora at time zone ${ZONA})::date::text as fecha
         from transaccion_caja where id = $1 for update`,
      [id]
    )
    const t = rows[0]
    if (!t) return await terminar({ resultado: 'NO_ENCONTRADO' })
    if (t.estado !== 'APROBADO') return await terminar({ resultado: 'ESTADO_INVALIDO', estado: t.estado })
    if (t.cierreId || (await cajaCerrada(t.fecha, cliente))) return await terminar({ resultado: 'CAJA_CERRADA' })
    // Un pago de Mercado Pago ya está acreditado: la devolución se gestiona en Mercado Pago, no desde la caja
    if (t.metodoPago === 'MERCADO_PAGO') return await terminar({ resultado: 'EN_LINEA' })

    let situacionCuotas
    if (t.concepto === 'TIENDA') {
      const { rows: lineas } = await cliente.query(
        'select producto_id as "productoId", sum(cantidad)::int as cantidad from detalle_venta where transaccion_id = $1 group by producto_id order by producto_id',
        [id]
      )
      for (const { productoId, cantidad } of lineas) {
        if ((await actualizarStock(productoId, cantidad, cliente)) === null) throw new Error(`No se pudo devolver el stock del producto ${productoId}`)
      }
    } else if (t.reservaId) {
      const { rows: r } = await cliente.query(
        `select estado, tipo, (fecha + hora_inicio) at time zone ${ZONA} <= now() as comenzo from reserva where id = $1 for update`,
        [t.reservaId]
      )
      if (r[0]?.estado === 'CONFIRMADA' && r[0].tipo === 'OCASIONAL') {
        if (r[0].comenzo) return await terminar({ resultado: 'TURNO_COMENZADO' })
        await cliente.query(
          `update reserva
              set estado = 'PENDIENTE', metodo_pago = null, fecha_pago = null, pago_registrado_por = null,
                  expiracion_pago = least(now() + make_interval(hours => $2), (fecha + hora_inicio) at time zone ${ZONA})
            where id = $1`,
          [t.reservaId, PLAZO_PAGO_HORAS]
        )
      }
    } else if (t.inscripcionId) {
      // Igual que al cobrar: primero el torneo y después la inscripción
      const { rows: previa } = await cliente.query('select torneo_id as "torneoId" from inscripcion where id = $1', [t.inscripcionId])
      const torneo = await bloquearTorneo(previa[0].torneoId, cliente)
      const { rows: i } = await cliente.query('select estado, estado_pago as "estadoPago" from inscripcion where id = $1 for update', [t.inscripcionId])
      if (i[0].estado === 'ACTIVA' && i[0].estadoPago === 'PAGADO') {
        if (!TORNEO_CON_INSCRIPCIONES_ABIERTAS.includes(torneo.estado)) return await terminar({ resultado: 'TORNEO_AVANZADO' })
        await cliente.query(
          `update inscripcion i
              set estado_pago = 'PENDIENTE', fecha_pago = null, pago_registrado_por = null,
                  vence_en = greatest(least(now() + make_interval(hours => $2), t.fecha_inicio::timestamptz), now() + interval '1 hour')
             from torneo t
            where i.id = $1 and t.id = i.torneo_id`,
          [t.inscripcionId, HORAS_PARA_PAGAR]
        )
      }
    } else if (t.cuotaId) {
      const { rows: q } = await cliente.query('select socio_id as "socioId", estado_pago as "estadoPago" from cuota_mensual where id = $1 for update', [t.cuotaId])
      if (q[0].estadoPago === 'PAGADO') {
        await cliente.query(
          `update cuota_mensual set estado_pago = 'PENDIENTE', fecha_pago = null, metodo_pago = null, pago_registrado_por = null where id = $1`,
          [t.cuotaId]
        )
      }
      situacionCuotas = await situacionCuotasDelSocio(q[0].socioId, cliente)
    }

    await cliente.query(
      `update transaccion_caja set estado = 'ANULADO', motivo_anulacion = $2, anulado_por = $3, fecha_anulacion = now() where id = $1`,
      [id, motivo, usuarioId]
    )
    await cliente.query('commit')
    return { resultado: 'OK', situacionCuotas }
  } catch (error) {
    await cliente.query('rollback').catch(() => {})
    if (esCajaCerrada(error)) return { resultado: 'CAJA_CERRADA' }
    throw error
  } finally {
    cliente.release()
  }
}