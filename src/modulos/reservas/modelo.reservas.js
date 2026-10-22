import { pool } from '../../config/conexion.bd.js'

// Reservas de cancha. Las usa el Módulo 3 para bloquear la cancha de cada partido (reserva de tipo TORNEO) y las
// va a usar el Módulo 2 para los alquileres. El anti-solapamiento lo garantiza la base: la restricción
// `reserva_sin_superposicion` (EXCLUDE USING gist) rechaza dos reservas PENDIENTE o CONFIRMADA de la misma cancha
// que se pisen, así que ni dos pedidos simultáneos pueden quedarse con la misma franja.

export const MENSAJE_FRANJA_OCUPADA = 'Franja ocupada, elegí otro horario'

// Código con el que Postgres informa que se violó una restricción EXCLUDE
const SOLAPAMIENTO = '23P01'

// Las funciones reciben `db`: el pool, o un cliente cuando se llaman dentro de una transacción de quien las usa
// (generar el cuadro de un torneo tiene que ser todo o nada).
const enTransaccion = async (db, trabajo) => {
  if (db !== pool) {
    // Ya hay una transacción abierta: el savepoint permite deshacer solo este intento sin abortar la de afuera
    await db.query('savepoint reservas')
    try {
      const resultado = await trabajo(db)
      await db.query('release savepoint reservas')
      return resultado
    } catch (error) {
      await db.query('rollback to savepoint reservas')
      throw error
    }
  }
  const cliente = await pool.connect()
  try {
    await cliente.query('begin')
    const resultado = await trabajo(cliente)
    await cliente.query('commit')
    return resultado
  } catch (error) {
    await cliente.query('rollback')
    throw error
  } finally {
    cliente.release()
  }
}

// Canchas activas de una disciplina ('TENIS' | 'PADEL'), en el orden en que las usa el scheduler
export const listarCanchas = async (disciplina, db = pool) => {
  const { rows } = await db.query(
    `select id, nombre, deporte, tipo_superficie as "tipoSuperficie"
       from cancha
      where activa and deporte = $1
      order by nombre`,
    [disciplina],
  )
  return rows
}

// true si la cancha existe, está activa y no tiene ninguna reserva vigente que pise la franja.
// `ignorarReservaId` sirve al reprogramar: la reserva actual del partido no cuenta como ocupación.
export const verificarDisponibilidad = async (canchaId, fecha, horaInicio, horaFin, db = pool, ignorarReservaId = null) => {
  const { rows } = await db.query(
    `select
        exists (select 1 from cancha where id = $1 and activa)
        and not exists (
          select 1 from reserva
           where cancha_id = $1
             and estado in ('PENDIENTE', 'CONFIRMADA')
             and id is distinct from $5
             and tsrange(fecha + hora_inicio, fecha + hora_fin) && tsrange($2::date + $3::time, $2::date + $4::time)
        ) as disponible`,
    [canchaId, fecha, horaInicio, horaFin, ignorarReservaId],
  )
  return rows[0].disponible
}

// Reservas vigentes de las canchas dadas dentro de un período: es la lista `ocupadas` que recibe el scheduler
export const listarOcupadas = async (canchaIds, desde, hasta, db = pool, ignorarReservaId = null) => {
  const { rows } = await db.query(
    `select cancha_id as "canchaId", to_char(fecha, 'YYYY-MM-DD') as fecha,
            to_char(hora_inicio, 'HH24:MI') as "horaInicio", to_char(hora_fin, 'HH24:MI') as "horaFin"
       from reserva
      where cancha_id = any($1) and estado in ('PENDIENTE', 'CONFIRMADA') and fecha between $2 and $3
        and id is distinct from $4`,
    [canchaIds, desde, hasta, ignorarReservaId],
  )
  return rows
}

// Cancela una reserva vigente y desvincula el partido (que vuelve a PENDIENTE si estaba PROGRAMADO). Devuelve false si no existía o ya estaba cancelada.
export const cancelarReserva = async (reservaId, db = pool) => {
  const { rowCount } = await db.query(
    `update reserva set estado = 'CANCELADA'
      where id = $1 and estado in ('PENDIENTE', 'CONFIRMADA')`,
    [reservaId],
  )
  await db.query(
    `update partido set reserva_id = null, estado = case when estado = 'PROGRAMADO' then 'PENDIENTE' else estado end
      where reserva_id = $1`,
    [reservaId],
  )
  return rowCount > 0
}

// Cancela todas las reservas de los partidos de un torneo (al regenerar el cuadro)
export const cancelarReservasDelTorneo = async (torneoId, db = pool) => {
  const { rows } = await db.query(
    `update reserva set estado = 'CANCELADA'
      where id in (select reserva_id from partido where torneo_id = $1 and reserva_id is not null)
        and estado in ('PENDIENTE', 'CONFIRMADA')
      returning id`,
    [torneoId],
  )
  await db.query(
    `update partido set reserva_id = null, estado = case when estado = 'PROGRAMADO' then 'PENDIENTE' else estado end
      where torneo_id = $1`,
    [torneoId],
  )
  return rows.length
}

// Bloquea la cancha para un partido con una reserva TORNEO confirmada y la vincula al partido (pasa a PROGRAMADO). Si el partido ya
// tenía una reserva, la cancela antes (reprogramar), todo en la misma transacción: si la nueva franja está
// ocupada, la anterior queda como estaba.
// Devuelve { resultado: 'OK', reserva } | 'FRANJA_OCUPADA' | 'CANCHA_INVALIDA' | 'PARTIDO_NO_ENCONTRADO'.
export const reservarParaPartido = (partidoId, { canchaId, fecha, horaInicio, horaFin }, db = pool) =>
  enTransaccion(db, async (tx) => {
    const { rows } = await tx.query(
      `select p.reserva_id as "reservaId", c.id is not null as "canchaValida"
         from partido p
         left join torneo t on t.id = p.torneo_id
         left join cancha c on c.id = $2 and c.activa and c.deporte = t.disciplina
        where p.id = $1
        for update of p`,
      [partidoId, canchaId],
    )
    if (!rows[0]) return { resultado: 'PARTIDO_NO_ENCONTRADO' }
    if (!rows[0].canchaValida) return { resultado: 'CANCHA_INVALIDA' }

    // Dentro de la transacción de afuera, el savepoint de enTransaccion vuelve atrás también esta cancelación
    if (rows[0].reservaId) await cancelarReserva(rows[0].reservaId, tx)

    try {
      const { rows: creadas } = await tx.query(
        `insert into reserva (cancha_id, fecha, hora_inicio, hora_fin, estado, tipo, precio_aplicado)
         values ($1, $2, $3, $4, 'CONFIRMADA', 'TORNEO', 0)
         returning id, cancha_id as "canchaId", to_char(fecha, 'YYYY-MM-DD') as fecha,
                   to_char(hora_inicio, 'HH24:MI') as "horaInicio", to_char(hora_fin, 'HH24:MI') as "horaFin"`,
        [canchaId, fecha, horaInicio, horaFin],
      )
      await tx.query(
        `update partido set reserva_id = $2, estado = case when estado = 'PENDIENTE' then 'PROGRAMADO' else estado end
          where id = $1`,
        [partidoId, creadas[0].id],
      )
      return { resultado: 'OK', reserva: creadas[0] }
    } catch (error) {
      if (error.code !== SOLAPAMIENTO) throw error
      // Al salir con error se deshace todo, también la cancelación de la reserva anterior
      throw Object.assign(new Error('FRANJA_OCUPADA'), { franjaOcupada: true })
    }
  }).catch((error) => {
    if (error.franjaOcupada) return { resultado: 'FRANJA_OCUPADA' }
    throw error
  })