import { pool } from '../../config/conexion.bd.js'
import { HORA_APERTURA, HORA_CIERRE, MESES_ALQUILER_FIJO, calcularPrecio, expirarVencidas, obtenerCancha } from './modelo.reservas.js'

// Código con el que Postgres informa que se violó una restricción EXCLUDE (dos reservas vigentes que se pisan)
const SOLAPAMIENTO = '23P01'

// Las fechas semanales de un contrato: desde `fechaInicio` hasta `fechaInicio + 3 meses` (incluida si cae en ese día de la semana).
// Se calcula en la base para que el mes y el día de la semana sean los de un calendario real. Devuelve 13 o 14 fechas según el día.
const FECHAS_DEL_CONTRATO = `
  select d::date as fecha
    from generate_series($1::date, $1::date + make_interval(months => $2), interval '7 days') as d`

// Las fechas del contrato en las que la cancha ya tiene una reserva vigente (PENDIENTE o CONFIRMADA) que pisa el horario.
// Es la misma regla que verificarDisponibilidad(), aplicada a todas las fechas de una sola vez.
const fechasEnConflicto = async (canchaId, fechaInicio, horaInicio, horaFin, db) => {
  const { rows } = await db.query(
    `with fechas as (${FECHAS_DEL_CONTRATO})
     select to_char(f.fecha, 'YYYY-MM-DD') as fecha
       from fechas f
      where exists (
        select 1 from reserva r
         where r.cancha_id = $3
           and r.estado in ('PENDIENTE', 'CONFIRMADA')
           and tsrange(r.fecha + r.hora_inicio, r.fecha + r.hora_fin) && tsrange(f.fecha + $4::time, f.fecha + $5::time)
      )
      order by f.fecha`,
    [fechaInicio, MESES_ALQUILER_FIJO, canchaId, horaInicio, horaFin],
  )
  return rows.map((fila) => fila.fecha)
}

// Da de alta un alquiler fijo (CU 2.4): un contrato de 3 meses con un turno semanal, siempre el mismo día y a la misma hora.
// Todo en una transacción (todo o nada):
//   1. Vence las pendientes con el plazo pasado, para que su franja cuente como libre.
//   2. Valida la cancha, el horario del club, que la fecha de inicio no haya pasado y que caiga en el día de la semana pedido.
//   3. Comprueba cada fecha del contrato; si alguna está ocupada, no crea nada y devuelve la lista exacta.
//   4. Inserta el contrato (VIGENTE) y una reserva FIJA CONFIRMADA por fecha, con el precio de la cancha y sin plazo de pago.
// Si otra reserva ocupa una fecha justo entre la comprobación y la inserción, la restricción de la base lo detecta, se deshace todo
// y se devuelve la lista actualizada.
// Devuelve { resultado: 'OK', contratoId, turnos } | { resultado: 'FECHAS_OCUPADAS', fechas } | 'CANCHA_NO_ENCONTRADA' | 'CANCHA_INACTIVA'
// | 'HORARIO_INVALIDO' | 'FUERA_DE_HORARIO' | 'FECHA_PASADA' | 'DIA_NO_COINCIDE'.
export const crearReservaFija = async ({ canchaId, clienteUsuarioId, diaSemana, horaInicio, horaFin, fechaInicio }) => {
  const cliente = await pool.connect()
  try {
    await cliente.query('begin')
    await expirarVencidas(cliente)

    const cancha = await obtenerCancha(canchaId, cliente)
    if (!cancha) return await deshacer(cliente, { resultado: 'CANCHA_NO_ENCONTRADA' })
    if (!cancha.activa) return await deshacer(cliente, { resultado: 'CANCHA_INACTIVA' })
    if (horaFin <= horaInicio) return await deshacer(cliente, { resultado: 'HORARIO_INVALIDO' })
    if (horaInicio < HORA_APERTURA || horaFin > HORA_CIERRE) return await deshacer(cliente, { resultado: 'FUERA_DE_HORARIO' })

    // El primer turno no puede haber empezado ya (la hora se toma en Córdoba); y la fecha de inicio tiene que caer en el día pedido
    const { rows: fecha } = await cliente.query(
      `select (($1::date + $2::time) at time zone 'America/Argentina/Cordoba') <= now() as pasada,
              extract(isodow from $1::date)::int as dia`,
      [fechaInicio, horaInicio],
    )
    if (fecha[0].pasada) return await deshacer(cliente, { resultado: 'FECHA_PASADA' })
    if (fecha[0].dia !== diaSemana) return await deshacer(cliente, { resultado: 'DIA_NO_COINCIDE' })

    const ocupadas = await fechasEnConflicto(canchaId, fechaInicio, horaInicio, horaFin, cliente)
    if (ocupadas.length > 0) return await deshacer(cliente, { resultado: 'FECHAS_OCUPADAS', fechas: ocupadas })

    const { rows: contrato } = await cliente.query(
      `insert into reserva_fija (cancha_id, cliente_usuario_id, dia_semana, hora_inicio, hora_fin, fecha_inicio, fecha_fin_contrato, estado)
       values ($1, $2, $3, $4, $5, $6, $6::date + make_interval(months => $7), 'VIGENTE')
       returning id`,
      [canchaId, clienteUsuarioId, diaSemana, horaInicio, horaFin, fechaInicio, MESES_ALQUILER_FIJO],
    )
    const { rowCount } = await cliente.query(
      `with fechas as (${FECHAS_DEL_CONTRATO})
       insert into reserva (cancha_id, cliente_usuario_id, reserva_fija_id, fecha, hora_inicio, hora_fin, estado, tipo, precio_aplicado)
       select $3, $4, $5, f.fecha, $6, $7, 'CONFIRMADA', 'FIJA', $8 from fechas f`,
      [fechaInicio, MESES_ALQUILER_FIJO, canchaId, clienteUsuarioId, contrato[0].id, horaInicio, horaFin, calcularPrecio(cancha.precioHora, horaInicio, horaFin)],
    )
    await cliente.query('commit')
    return { resultado: 'OK', contratoId: contrato[0].id, turnos: rowCount }
  } catch (error) {
    await cliente.query('rollback').catch(() => {})
    if (error.code !== SOLAPAMIENTO) throw error
    // Alguien tomó una de las fechas mientras se generaban: no quedó nada a medias y se informa la lista al día
    return { resultado: 'FECHAS_OCUPADAS', fechas: await fechasEnConflicto(canchaId, fechaInicio, horaInicio, horaFin, pool) }
  } finally {
    cliente.release()
  }
}

// Cierra la transacción sin guardar nada y devuelve el resultado
const deshacer = async (cliente, resultado) => {
  await cliente.query('rollback')
  return resultado
}

export const CONTRATOS_POR_PAGINA = 10

// Los contratos con la cancha, el cliente y los datos que muestran el listado y el detalle.
// - `turnos`: cuántas reservas generó el contrato (todas, también las canceladas).
// - `ultimoTurno`: la fecha del último turno que sigue en pie (Confirmada); null si no queda ninguno (contrato cancelado entero).
// - `respuestaCliente`: lo que contestó el cliente al aviso de fin de contrato: null (todavía no), CONTINUAR o FINALIZAR.
const SELECT_CONTRATOS = `
  select rf.id, rf.dia_semana as "diaSemana", to_char(rf.hora_inicio, 'HH24:MI') as "horaInicio", to_char(rf.hora_fin, 'HH24:MI') as "horaFin",
         to_char(rf.fecha_inicio, 'YYYY-MM-DD') as "fechaInicio", to_char(rf.fecha_fin_contrato, 'YYYY-MM-DD') as "fechaFinContrato",
         rf.estado, rf.renovar, rf.cancelado_en as "canceladoEn",
         c.id as "canchaId", c.nombre as "canchaNombre", c.deporte,
         u.id as "clienteId", u.nombre as "clienteNombre", u.apellido as "clienteApellido", u.email as "clienteEmail", j.dni as "clienteDni",
         (select count(*)::int from reserva r where r.reserva_fija_id = rf.id) as turnos,
         (select to_char(max(r.fecha), 'YYYY-MM-DD') from reserva r where r.reserva_fija_id = rf.id and r.estado = 'CONFIRMADA') as "ultimoTurno",
         (select r.precio_aplicado from reserva r where r.reserva_fija_id = rf.id order by r.fecha limit 1) as "precioPorTurno"
    from reserva_fija rf
    join cancha c on c.id = rf.cancha_id
    left join usuario u on u.id = rf.cliente_usuario_id
    left join jugador j on j.usuario_id = u.id`

const RESPUESTAS = { true: 'CONTINUAR', false: 'FINALIZAR' }

const aContrato = (f) => ({
  id: f.id,
  cancha: { id: f.canchaId, nombre: f.canchaNombre, deporte: f.deporte },
  cliente: f.clienteId ? { id: f.clienteId, nombre: f.clienteNombre, apellido: f.clienteApellido, email: f.clienteEmail, dni: f.clienteDni } : null,
  diaSemana: f.diaSemana,
  horaInicio: f.horaInicio,
  horaFin: f.horaFin,
  fechaInicio: f.fechaInicio,
  fechaFinContrato: f.fechaFinContrato,
  estado: f.estado,
  canceladoEn: f.canceladoEn,
  ultimoTurno: f.ultimoTurno,
  respuestaCliente: f.renovar === null ? null : RESPUESTAS[f.renovar],
  turnos: f.turnos,
  precioPorTurno: f.precioPorTurno,
})

// Pasa a FINALIZADO los contratos VIGENTES cuya fecha de fin ya pasó (CU 2.4 · A3b), con la fecha de hoy en Córdoba. No hace falta tocar
// las reservas: el contrato no genera turnos nuevos, así que las franjas quedan libres solas. Es perezosa (sin cron): se llama antes de
// listar y de leer un contrato. Devuelve cuántos finalizó. La reutiliza M2-BE-15.
export const finalizarVencidos = async (db = pool) => {
  const { rowCount } = await db.query(
    `update reserva_fija set estado = 'FINALIZADO'
      where estado = 'VIGENTE' and fecha_fin_contrato < (now() at time zone 'America/Argentina/Cordoba')::date`,
  )
  return rowCount
}

// El contrato con la cancha y el cliente, listo para mostrar. Devuelve null si no existe.
export const obtenerReservaFija = async (contratoId, db = pool) => {
  const { rows } = await db.query(`${SELECT_CONTRATOS} where rf.id = $1`, [contratoId])
  return rows[0] ? aContrato(rows[0]) : null
}

// El detalle de un contrato: sus datos y cada una de sus reservas FIJA con su estado (A1), de la primera a la última fecha.
// Devuelve null si no existe.
export const obtenerDetalleReservaFija = async (contratoId, db = pool) => {
  const contrato = await obtenerReservaFija(contratoId, db)
  if (!contrato) return null
  const { rows } = await db.query(
    `select id, to_char(fecha, 'YYYY-MM-DD') as fecha, to_char(hora_inicio, 'HH24:MI') as "horaInicio", to_char(hora_fin, 'HH24:MI') as "horaFin",
            estado, precio_aplicado as "precioAplicado"
       from reserva where reserva_fija_id = $1 order by fecha`,
    [contratoId],
  )
  return { ...contrato, reservas: rows }
}

// Una página de contratos, con filtro por estado y búsqueda. `q` busca (sin distinguir mayúsculas) en el nombre, apellido, correo y
// DNI del cliente, y en el nombre de la cancha. Los vigentes van primero, por el fin de contrato más cercano (los que están por
// terminar arriba); los finalizados, del más reciente al más antiguo.
// Devuelve { total, contratos } (el total es de todas las páginas).
export const listarReservasFijas = async ({ estado = null, q = '', pagina = 1 }, db = pool) => {
  const patron = `%${q.replace(/[\\%_]/g, '\\$&')}%`
  const filtro = `
       where ($1::text is null or rf.estado::text = $1)
         and ($2 = '' or u.nombre ilike $3 or u.apellido ilike $3 or (u.nombre || ' ' || u.apellido) ilike $3
              or u.email ilike $3 or j.dni ilike $3 or c.nombre ilike $3)`
  const { rows } = await db.query(
    `${SELECT_CONTRATOS} ${filtro}
      order by (rf.estado = 'VIGENTE') desc,
               case when rf.estado = 'VIGENTE' then rf.fecha_fin_contrato end asc,
               rf.fecha_fin_contrato desc, rf.id
      limit $4 offset $5`,
    [estado, q, patron, CONTRATOS_POR_PAGINA, (pagina - 1) * CONTRATOS_POR_PAGINA],
  )
  const { rows: cuenta } = await db.query(
    `select count(*)::int as total
       from reserva_fija rf
       join cancha c on c.id = rf.cancha_id
       left join usuario u on u.id = rf.cliente_usuario_id
       left join jugador j on j.usuario_id = u.id ${filtro}`,
    [estado, q, patron],
  )
  return { total: cuenta[0].total, contratos: rows.map(aContrato) }
}

// Cancela un contrato de alquiler fijo (CU 2.4 · A2), en una transacción: pasa a CANCELADA las reservas del contrato que todavía no
// empezaron (sus franjas quedan libres, porque la restricción de superposición solo mira PENDIENTE y CONFIRMADA), conserva las que ya
// empezaron o pasaron, y marca el contrato FINALIZADO con `cancelado_en`. El contrato se bloquea mientras se cancela, así dos pedidos
// a la vez no lo cancelan dos veces. Los contratos cuya fecha de fin ya pasó se finalizan antes, de modo que tampoco se cancelan.
// Devuelve { resultado: 'OK', canceladas, conservadas } | 'NO_ENCONTRADO' | 'YA_FINALIZADO'.
export const cancelarContrato = async (contratoId) => {
  const cliente = await pool.connect()
  try {
    await cliente.query('begin')
    await finalizarVencidos(cliente)
    const { rows } = await cliente.query('select estado from reserva_fija where id = $1 for update', [contratoId])
    // Si no hay nada que cancelar se confirma igual la transacción: así queda guardada la finalización de los vencidos
    if (!rows[0]) {
      await cliente.query('commit')
      return { resultado: 'NO_ENCONTRADO' }
    }
    if (rows[0].estado !== 'VIGENTE') {
      await cliente.query('commit')
      return { resultado: 'YA_FINALIZADO' }
    }
    const { rowCount: canceladas } = await cliente.query(
      `update reserva set estado = 'CANCELADA'
        where reserva_fija_id = $1 and estado in ('PENDIENTE', 'CONFIRMADA')
          and (fecha + hora_inicio) at time zone 'America/Argentina/Cordoba' > now()`,
      [contratoId],
    )
    await cliente.query(`update reserva_fija set estado = 'FINALIZADO', cancelado_en = now() where id = $1`, [contratoId])
    const { rows: conservadas } = await cliente.query(
      `select count(*)::int as total from reserva where reserva_fija_id = $1 and estado = 'CONFIRMADA'`,
      [contratoId],
    )
    await cliente.query('commit')
    return { resultado: 'OK', canceladas, conservadas: conservadas[0].total }
  } catch (error) {
    await cliente.query('rollback').catch(() => {})
    throw error
  } finally {
    cliente.release()
  }
}