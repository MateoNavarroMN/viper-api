import { pool } from '../../config/conexion.bd.js'
import { cobrarOrigen } from '../caja/cobros.caja.js'
import { asegurarCajaAbierta, esCajaCerrada } from '../caja/modelo.caja.js'

// Qué hacer con un aviso de Mercado Pago (CU 5.4). El aviso solo trae el id de la orden: el estado, el monto y la referencia salen de
// la consulta a Mercado Pago. Este archivo recibe esa orden ya consultada y actualiza el movimiento pendiente que le corresponde.

const REGEX_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const COLUMNA_ORIGEN = { RESERVA: 'reserva_id', INSCRIPCION: 'inscripcion_id', CUOTA: 'cuota_id' }
const centavos = (monto) => Math.round(Number(monto) * 100)

// Cómo se lee el estado de una orden: pagada (acreditada), fallida (rechazada, cancelada o vencida) o todavía en curso
export const clasificarOrden = (orden) => {
  if (orden.status === 'processed' && orden.status_detail === 'accredited') return 'APROBADA'
  if (orden.status === 'failed' || orden.status === 'canceled') return 'RECHAZADA'
  return 'EN_CURSO'
}

// El id del pago dentro de la orden (si no lo trae, se usa el de la orden)
export const idDePago = (orden) => orden.transactions?.payments?.[0]?.id ?? orden.id

// Guarda el aviso (resumido, sin datos de pago) para poder revisar qué llegó y qué se hizo con él.
export const registrarNotificacion = async ({ paymentId, resumen, resultado }, db = pool) => {
  await db.query('insert into notificacion_mp (payment_id, payload, resultado) values ($1, $2, $3)', [paymentId ?? null, JSON.stringify(resumen), resultado])
}

// Aplica una orden consultada a su movimiento. Todo en una transacción. Devuelve el resultado como texto:
//  · 'PROCESADA'            el pago se acreditó: el movimiento pasó a Aprobado y el origen (reserva, inscripción o cuota) quedó pagado
//  · 'DEVOLUCION_PENDIENTE' se acreditó, pero el origen ya no se podía confirmar (pagado, vencido o cancelado): queda Aprobado y marcado para devolver
//  · 'RECHAZADA'            el pago falló: el movimiento pasó a Rechazado y el origen sigue pendiente
//  · 'SIN_CAMBIOS'          el pago sigue en curso: no se toca nada
//  · 'IGNORADA'             ya estaba procesado (aviso repetido) o no corresponde actuar
//  · 'NO_CORRESPONDE'       la referencia no es de ningún movimiento de Viper (o no coincide con la orden)
//  · 'MONTO_NO_COINCIDE'    el importe de la orden no es el del movimiento: no se toca nada
export const aplicarOrden = async (orden) => {
  const referencia = orden.external_reference
  if (typeof referencia !== 'string' || !REGEX_UUID.test(referencia)) return 'NO_CORRESPONDE'
  const clase = clasificarOrden(orden)

  const cliente = await pool.connect()
  try {
    await cliente.query('begin')
    const { rows } = await cliente.query(
      `select id, estado, concepto, monto, descripcion, mp_preference_id as "ordenId", reserva_id as "reservaId",
              inscripcion_id as "inscripcionId", cuota_id as "cuotaId"
         from transaccion_caja where id = $1 and metodo_pago = 'MERCADO_PAGO' for update`,
      [referencia]
    )
    const t = rows[0]
    if (!t || t.ordenId !== orden.id) {
      await cliente.query('rollback')
      return 'NO_CORRESPONDE'
    }
    if (centavos(orden.total_amount) !== centavos(t.monto)) {
      await cliente.query('rollback')
      return 'MONTO_NO_COINCIDE'
    }

    if (clase === 'EN_CURSO') {
      await cliente.query('rollback')
      return 'SIN_CAMBIOS'
    }

    if (clase === 'RECHAZADA') {
      // Solo un pendiente pasa a Rechazado: uno ya aprobado no se toca
      if (t.estado !== 'PENDIENTE') {
        await cliente.query('rollback')
        return 'IGNORADA'
      }
      await cliente.query(`update transaccion_caja set estado = 'RECHAZADO' where id = $1`, [t.id])
      await cliente.query('commit')
      return 'RECHAZADA'
    }

    // Pagada. Un aviso repetido no hace nada.
    if (t.estado === 'APROBADO') {
      await cliente.query('rollback')
      return 'IGNORADA'
    }
    if (centavos(orden.total_paid_amount ?? orden.total_amount) < centavos(t.monto)) {
      await cliente.query('rollback')
      return 'MONTO_NO_COINCIDE'
    }

    // Con la caja de hoy cerrada el dinero entró igual: el movimiento se asienta en la jornada siguiente
    let cajaCerrada = false
    try {
      await asegurarCajaAbierta(cliente)
    } catch (error) {
      if (!esCajaCerrada(error)) throw error
      cajaCerrada = true
    }

    const columna = COLUMNA_ORIGEN[t.concepto]
    const origenId = t[{ reserva_id: 'reservaId', inscripcion_id: 'inscripcionId', cuota_id: 'cuotaId' }[columna]]
    const cobro = await cobrarOrigen(t.concepto, origenId, 'MERCADO_PAGO', null, cliente)
    const confirmado = cobro.resultado === 'OK'

    let descripcion = t.descripcion ?? ''
    if (!confirmado) descripcion += ' · Pago acreditado sin poder confirmar: revisar la devolución'
    if (cajaCerrada) descripcion += ' · Acreditado con la caja cerrada: se asienta en la jornada siguiente'

    await cliente.query(
      `update transaccion_caja
          set estado = 'APROBADO', id_pago_externo = $2, requiere_devolucion = $3,
              motivo_anulacion = null, fecha_anulacion = null, anulado_por = null,
              descripcion = $4,
              fecha_hora = case when $5::boolean then (current_date + 1)::timestamp at time zone 'America/Argentina/Cordoba' else now() end
        where id = $1`,
      [t.id, idDePago(orden), !confirmado, descripcion.trim() || null, cajaCerrada]
    )
    // Si había otros intentos de pago del mismo origen todavía pendientes, ya no hacen falta
    await cliente.query(
      `update transaccion_caja set estado = 'ANULADO', motivo_anulacion = 'El pago se acreditó con otro intento', fecha_anulacion = now()
        where ${columna} = $1 and metodo_pago = 'MERCADO_PAGO' and estado = 'PENDIENTE' and id <> $2`,
      [origenId, t.id]
    )
    await cliente.query('commit')
    return confirmado ? 'PROCESADA' : 'DEVOLUCION_PENDIENTE'
  } catch (error) {
    await cliente.query('rollback').catch(() => {})
    throw error
  } finally {
    cliente.release()
  }
}