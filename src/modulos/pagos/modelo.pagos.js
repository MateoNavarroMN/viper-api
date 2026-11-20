import { pool } from '../../config/conexion.bd.js'

// Cobro en línea (CU 5.4): lo que hace falta para empezar a pagar una reserva, inscripción o cuota con Mercado Pago.
// Acá todavía no se cobra nada: se deja un movimiento PENDIENTE en caja que se acredita (o se rechaza) cuando Mercado Pago avisa.

const NUMERO_CANDADO = 'hashtext($1)'

// Columna de transaccion_caja que apunta a cada tipo de origen
const COLUMNA_ORIGEN = { RESERVA: 'reserva_id', INSCRIPCION: 'inscripcion_id', CUOTA: 'cuota_id' }

// Mira el origen y dice si se puede pagar en línea. Devuelve:
//  { resultado: 'OK', monto, clienteId, descripcion, titulo, minutosDeVigencia }
//  { resultado: 'NO_ENCONTRADO' }                       (no existe, o es de otra persona y quien consulta es Jugador)
//  { resultado: 'RECHAZADO', mensaje }                  (ya pagado, vencido, cancelado o no se paga en línea)
// `solo` (opcional): id de usuario; si viene, el origen tiene que ser de esa persona.
const leerOrigen = async (concepto, origenId, solo, db) => {
  if (concepto === 'RESERVA') {
    const { rows } = await db.query(
      `select r.cliente_usuario_id as "clienteId", r.estado, r.tipo, r.precio_aplicado as monto,
              r.expiracion_pago is not null and r.expiracion_pago <= now() as vencida,
              greatest(1, ceil(extract(epoch from (r.expiracion_pago - now())) / 60))::int as "minutosRestantes",
              c.nombre as cancha, to_char(r.fecha, 'DD/MM/YYYY') as fecha,
              to_char(r.hora_inicio, 'HH24:MI') as inicio, to_char(r.hora_fin, 'HH24:MI') as fin
         from reserva r join cancha c on c.id = r.cancha_id where r.id = $1`,
      [origenId]
    )
    const r = rows[0]
    if (!r || (solo && r.clienteId !== solo)) return { resultado: 'NO_ENCONTRADO' }
    if (r.estado === 'CONFIRMADA') return { resultado: 'RECHAZADO', mensaje: 'La reserva ya fue pagada' }
    if (r.estado === 'CANCELADA') return { resultado: 'RECHAZADO', mensaje: 'La reserva está cancelada' }
    if (r.estado === 'EXPIRADA' || r.vencida) return { resultado: 'RECHAZADO', mensaje: 'El plazo de pago venció' }
    if (r.estado !== 'PENDIENTE' || r.tipo !== 'OCASIONAL' || !(Number(r.monto) > 0)) {
      return { resultado: 'RECHAZADO', mensaje: 'Esta reserva no se paga en línea' }
    }
    const detalle = `${r.cancha} · ${r.fecha} de ${r.inicio} a ${r.fin}`
    return {
      resultado: 'OK',
      monto: Number(r.monto),
      clienteId: r.clienteId,
      descripcion: `Pago en línea de reserva · ${detalle}`,
      titulo: `Reserva · ${detalle}`,
      // Si la reserva tiene un plazo de pago más corto que una hora, la orden vence con ella
      minutosDeVigencia: r.minutosRestantes ? Math.min(60, r.minutosRestantes) : 60,
    }
  }

  if (concepto === 'INSCRIPCION') {
    const { rows } = await db.query(
      `select jt.usuario_id as "clienteId", i.estado, i.estado_pago as "estadoPago", tor.nombre as torneo, tor.precio_inscripcion as monto,
              i.vence_en is not null and i.vence_en <= now() as vencida,
              greatest(1, ceil(extract(epoch from (i.vence_en - now())) / 60))::int as "minutosRestantes"
         from inscripcion i join torneo tor on tor.id = i.torneo_id join jugador jt on jt.id = i.titular_jugador_id
        where i.id = $1`,
      [origenId]
    )
    const i = rows[0]
    if (!i || (solo && i.clienteId !== solo)) return { resultado: 'NO_ENCONTRADO' }
    if (i.estadoPago === 'PAGADO') return { resultado: 'RECHAZADO', mensaje: 'La inscripción ya fue pagada' }
    if (i.estado !== 'ACTIVA' || i.vencida) return { resultado: 'RECHAZADO', mensaje: 'El plazo de pago venció' }
    if (!(Number(i.monto) > 0)) return { resultado: 'RECHAZADO', mensaje: 'Esta inscripción no tiene importe para pagar' }
    return {
      resultado: 'OK',
      monto: Number(i.monto),
      clienteId: i.clienteId,
      descripcion: `Pago en línea de inscripción · ${i.torneo}`,
      titulo: `Inscripción · ${i.torneo}`,
      minutosDeVigencia: i.minutosRestantes ? Math.min(60, i.minutosRestantes) : 60,
    }
  }

  const { rows } = await db.query(
    `select j.usuario_id as "clienteId", q.estado_pago as "estadoPago", q.monto, q.mes, q.anio
       from cuota_mensual q join socio s on s.id = q.socio_id join jugador j on j.id = s.jugador_id where q.id = $1`,
    [origenId]
  )
  const q = rows[0]
  if (!q || (solo && q.clienteId !== solo)) return { resultado: 'NO_ENCONTRADO' }
  if (q.estadoPago === 'PAGADO') return { resultado: 'RECHAZADO', mensaje: 'La cuota ya fue pagada' }
  const periodo = `${String(q.mes).padStart(2, '0')}/${q.anio}`
  return {
    resultado: 'OK',
    monto: Number(q.monto),
    clienteId: q.clienteId,
    descripcion: `Pago en línea de cuota · ${periodo}`,
    titulo: `Cuota · ${periodo}`,
    minutosDeVigencia: 60,
  }
}

// Valida el origen y deja registrado el intento: un movimiento INGRESO / MERCADO_PAGO / PENDIENTE con su cliente y su origen.
// Todo en una transacción: dos pedidos a la vez sobre el mismo origen se ordenan con un candado, y los intentos anteriores que
// seguían pendientes se anulan (solo vale el último). No pide que la caja esté abierta: el movimiento queda pendiente y recién
// se asienta cuando el pago se acredita.
// Devuelve { resultado: 'OK', transaccionId, titulo, monto, minutosDeVigencia } o el rechazo de leerOrigen.
export const registrarIntentoDePago = async ({ concepto, origenId, usuarioId }) => {
  const cliente = await pool.connect()
  try {
    await cliente.query('begin')
    await cliente.query(`select pg_advisory_xact_lock(${NUMERO_CANDADO})`, [`pago_en_linea_${origenId}`])

    const origen = await leerOrigen(concepto, origenId, usuarioId, cliente)
    if (origen.resultado !== 'OK') {
      await cliente.query('rollback')
      return origen
    }

    const columna = COLUMNA_ORIGEN[concepto]
    await cliente.query(
      `update transaccion_caja set estado = 'ANULADO', motivo_anulacion = 'Reemplazado por un nuevo intento de pago', fecha_anulacion = now()
        where ${columna} = $1 and metodo_pago = 'MERCADO_PAGO' and estado = 'PENDIENTE'`,
      [origenId]
    )
    const { rows } = await cliente.query(
      `insert into transaccion_caja (tipo_movimiento, concepto, descripcion, monto, metodo_pago, estado, cliente_usuario_id, ${columna})
       values ('INGRESO', $1, $2, $3, 'MERCADO_PAGO', 'PENDIENTE', $4, $5) returning id`,
      [concepto, origen.descripcion, origen.monto, origen.clienteId, origenId]
    )
    await cliente.query('commit')
    return { resultado: 'OK', transaccionId: rows[0].id, titulo: origen.titulo, monto: origen.monto, minutosDeVigencia: origen.minutosDeVigencia }
  } catch (error) {
    await cliente.query('rollback').catch(() => {})
    throw error
  } finally {
    cliente.release()
  }
}

// Guarda el identificador de la orden de Mercado Pago en el movimiento (columna mp_preference_id).
export const guardarOrden = (transaccionId, ordenId, db = pool) =>
  db.query(`update transaccion_caja set mp_preference_id = $2 where id = $1 and estado = 'PENDIENTE'`, [transaccionId, ordenId])

// Mercado Pago no pudo crear la orden: el intento se anula para que no quede un pendiente que bloquee el cierre de caja.
export const anularIntento = (transaccionId, db = pool) =>
  db.query(
    `update transaccion_caja set estado = 'ANULADO', motivo_anulacion = 'No se pudo iniciar el pago en línea', fecha_anulacion = now()
      where id = $1 and estado = 'PENDIENTE'`,
    [transaccionId]
  )