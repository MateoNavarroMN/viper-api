import { pool } from '../../config/conexion.bd.js'
import { obtenerOrden } from './cliente.mercadopago.js'
import { aplicarOrden } from './modelo.webhook.pagos.js'

// Estado de un pago en línea (CU 5.4): lo que consulta la pantalla de resultado, la cancelación cuando la persona vuelve sin pagar
// y el vencimiento de los pendientes viejos, para que no bloqueen el cierre de caja.

export const MINUTOS_SIN_ACTIVIDAD = 60
export const MOTIVO_CANCELADO = 'Cancelado por el cliente'
export const MOTIVO_VENCIDO = 'Pago en línea sin completar'
const MOTIVO_REEMPLAZADO = 'Reemplazado por un nuevo intento de pago'
export const MOTIVO_OTRO_INTENTO = 'El pago se acreditó con otro intento'
const COLUMNA_ORIGEN = { RESERVA: 'reserva_id', INSCRIPCION: 'inscripcion_id', CUOTA: 'cuota_id' }

// Estados que ve la pantalla: PAGADO, PENDIENTE, RECHAZADO, CANCELADO, VENCIDO
const estadoParaPantalla = (t) => {
  if (t.estado === 'APROBADO') return 'PAGADO'
  if (t.estado === 'PENDIENTE') return 'PENDIENTE'
  if (t.estado === 'RECHAZADO') return 'RECHAZADO'
  return t.motivo === MOTIVO_VENCIDO ? 'VENCIDO' : 'CANCELADO'
}

const MENSAJES = {
  PAGADO: 'El pago se acreditó',
  PENDIENTE: 'Estamos esperando que Mercado Pago confirme el pago',
  RECHAZADO: 'Mercado Pago rechazó el pago',
  CANCELADO: 'El pago fue cancelado',
  VENCIDO: 'El pago venció sin completarse',
}

// Traduce el detalle que informa Mercado Pago a una frase para la persona (si no lo reconoce, usa una genérica)
const MOTIVOS_RECHAZO = [
  ['insufficient', 'La tarjeta no tiene fondos suficientes'],
  ['security_code', 'El código de seguridad no es correcto'],
  ['bad_filled', 'Revisá los datos de la tarjeta'],
  ['call_for_authorize', 'Tenés que autorizar el pago con tu banco'],
  ['expired', 'La tarjeta está vencida'],
]
const motivoDeRechazo = (detalle) => {
  const texto = String(detalle ?? '').toLowerCase()
  return MOTIVOS_RECHAZO.find(([clave]) => texto.includes(clave))?.[1] ?? 'Mercado Pago no aprobó el pago. Probá con otro medio de pago'
}

// Lee el movimiento de pago en línea con el estado de su origen. Devuelve null si no existe o no es un pago de Mercado Pago.
export const leerPago = async (id, db = pool) => {
  const { rows } = await db.query(
    `select t.id, t.estado, t.concepto, t.monto, t.fecha_hora as "fecha", t.id_pago_externo as "numeroOperacion", t.mp_preference_id as "ordenId",
            t.requiere_devolucion as "requiereDevolucion", t.motivo_anulacion as motivo, t.cliente_usuario_id as "clienteId",
            t.descripcion, t.reserva_id, t.inscripcion_id, t.cuota_id,
            (t.estado = 'PENDIENTE' and t.fecha_hora < now() - make_interval(mins => $2)) as "esViejo",
            case t.concepto
              when 'RESERVA' then r.estado::text
              when 'INSCRIPCION' then case when i.estado_pago = 'PAGADO' then 'PAGADA' else i.estado::text end
              when 'CUOTA' then q.estado_pago::text
            end as "estadoOrigen",
            case t.concepto
              when 'RESERVA' then r.estado = 'CONFIRMADA'
              when 'INSCRIPCION' then i.estado_pago = 'PAGADO'
              when 'CUOTA' then q.estado_pago = 'PAGADO'
            end as "origenPagado",
            case t.concepto
              when 'RESERVA' then r.estado = 'PENDIENTE' and (r.expiracion_pago is null or r.expiracion_pago > now())
              when 'INSCRIPCION' then i.estado = 'ACTIVA' and i.estado_pago <> 'PAGADO' and (i.vence_en is null or i.vence_en > now())
              when 'CUOTA' then q.estado_pago <> 'PAGADO'
            end as "origenVigente"
       from transaccion_caja t
       left join reserva r on r.id = t.reserva_id
       left join inscripcion i on i.id = t.inscripcion_id
       left join cuota_mensual q on q.id = t.cuota_id
      where t.id = $1 and t.metodo_pago = 'MERCADO_PAGO'`,
    [id, MINUTOS_SIN_ACTIVIDAD]
  )
  return rows[0] ?? null
}

// Lo que devuelve la API: el estado de la transacción y el del origen (reserva, inscripción o cuota)
export const armarRespuesta = async (t) => {
  const estado = estadoParaPantalla(t)
  let motivo = null
  if (estado === 'RECHAZADO') {
    let detalle = null
    if (t.ordenId) {
      try {
        const orden = await obtenerOrden(t.ordenId)
        detalle = orden.status_detail ?? orden.transactions?.payments?.[0]?.status_detail
      } catch {
        // sin la consulta queda el motivo genérico
      }
    }
    motivo = motivoDeRechazo(detalle)
  } else if (estado === 'CANCELADO' && t.motivo === MOTIVO_REEMPLAZADO) {
    motivo = 'Empezaste otro pago para lo mismo'
  }
  return {
    transaccionId: t.id,
    estado,
    mensaje: MENSAJES[estado],
    motivo,
    concepto: t.concepto,
    descripcion: t.descripcion,
    monto: Number(t.monto),
    medioDePago: 'Mercado Pago',
    fecha: t.fecha,
    numeroOperacion: estado === 'PAGADO' ? t.numeroOperacion : null,
    requiereDevolucion: t.requiereDevolucion,
    origen: {
      tipo: t.concepto,
      id: t.reserva_id ?? t.inscripcion_id ?? t.cuota_id,
      estado: t.estadoOrigen,
      pagado: Boolean(t.origenPagado),
    },
    // Si no se pagó y lo que se quería pagar sigue vigente, se puede volver a intentar
    puedeReintentar: ['RECHAZADO', 'CANCELADO', 'VENCIDO'].includes(estado) && Boolean(t.origenVigente),
  }
}

// Si el pago no está resuelto, le pregunta a Mercado Pago cómo están las órdenes y las aplica como haría el webhook. Cubre el aviso
// que no llegó (retorno sin conexión, webhook caído). Revisa este pago y también los otros intentos recientes de lo mismo: si la
// persona abrió el pago dos veces, el primero queda anulado pero igual pudo haber pagado ahí. Si Mercado Pago no responde no es un
// error: el pago sigue como estaba y se vuelve a preguntar en la próxima consulta. Devuelve true si alguna orden quedó acreditada.
const MOTIVOS_REVISABLES = [MOTIVO_REEMPLAZADO, MOTIVO_CANCELADO, MOTIVO_VENCIDO]
export const conciliar = async (t, db = pool) => {
  if (t.estado === 'APROBADO' || t.estado === 'RECHAZADO') return false
  const columna = COLUMNA_ORIGEN[t.concepto]
  const { rows } = await db.query(
    `select id, mp_preference_id as "ordenId" from transaccion_caja
      where metodo_pago = 'MERCADO_PAGO' and mp_preference_id is not null
        and (estado = 'PENDIENTE' or (estado = 'ANULADO' and motivo_anulacion = any($3)))
        and (id = $1 or (${columna} = $2 and fecha_hora > now() - interval '1 day'))
      order by fecha_hora desc`,
    [t.id, t.reserva_id ?? t.inscripcion_id ?? t.cuota_id, MOTIVOS_REVISABLES]
  )
  for (const fila of rows) {
    try {
      const orden = await obtenerOrden(fila.ordenId)
      const resultado = await aplicarOrden(orden)
      if (resultado === 'PROCESADA' || resultado === 'DEVOLUCION_PENDIENTE') return true
    } catch (error) {
      console.error(`No se pudo conciliar el pago ${fila.id}: ${error.message}`)
    }
  }
  return false
}

// Si este intento quedó anulado porque lo que se quería pagar se acreditó con otro, devuelve ese otro (el que está Aprobado).
export const leerIntentoAcreditado = async (t, db = pool) => {
  if (t.estado !== 'ANULADO' || t.motivo !== MOTIVO_OTRO_INTENTO) return null
  const { rows } = await db.query(
    `select id from transaccion_caja where ${COLUMNA_ORIGEN[t.concepto]} = $1 and metodo_pago = 'MERCADO_PAGO' and estado = 'APROBADO' order by fecha_hora desc limit 1`,
    [t.reserva_id ?? t.inscripcion_id ?? t.cuota_id]
  )
  return rows[0] ? leerPago(rows[0].id, db) : null
}

// Anula los pendientes de Mercado Pago sin actividad hace más de una hora (de un pago puntual o de todos).
// Si un pago tardío llega después, el aviso lo vuelve a aprobar (ver aplicarOrden). Devuelve cuántos anuló.
export const vencerPendientes = async (id = null, db = pool) => {
  const { rowCount } = await db.query(
    `update transaccion_caja
        set estado = 'ANULADO', motivo_anulacion = $3, fecha_anulacion = now()
      where metodo_pago = 'MERCADO_PAGO' and estado = 'PENDIENTE' and cierre_caja_id is null
        and fecha_hora < now() - make_interval(mins => $1) and ($2::uuid is null or id = $2)`,
    [MINUTOS_SIN_ACTIVIDAD, id, MOTIVO_VENCIDO]
  )
  return rowCount
}

// Anula un pago pendiente porque la persona volvió sin pagar. Devuelve:
//  'CANCELADO'  lo anuló · 'YA_PAGADO' ya estaba acreditado (no se toca) · 'SIN_CAMBIOS' ya estaba anulado o rechazado
export const cancelarPendiente = async (id) => {
  const cliente = await pool.connect()
  try {
    await cliente.query('begin')
    const { rows } = await cliente.query(`select estado from transaccion_caja where id = $1 and metodo_pago = 'MERCADO_PAGO' for update`, [id])
    const estado = rows[0]?.estado
    if (estado === 'PENDIENTE') {
      await cliente.query(
        `update transaccion_caja set estado = 'ANULADO', motivo_anulacion = $2, fecha_anulacion = now() where id = $1`,
        [id, MOTIVO_CANCELADO]
      )
      await cliente.query('commit')
      return 'CANCELADO'
    }
    await cliente.query('rollback')
    return estado === 'APROBADO' ? 'YA_PAGADO' : 'SIN_CAMBIOS'
  } catch (error) {
    await cliente.query('rollback').catch(() => {})
    throw error
  } finally {
    cliente.release()
  }
}