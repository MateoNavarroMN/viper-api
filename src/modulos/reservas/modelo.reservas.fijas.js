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

// El contrato con la cancha y el cliente, listo para mostrar. Devuelve null si no existe.
export const obtenerReservaFija = async (contratoId, db = pool) => {
  const { rows } = await db.query(
    `select rf.id, rf.dia_semana as "diaSemana", to_char(rf.hora_inicio, 'HH24:MI') as "horaInicio", to_char(rf.hora_fin, 'HH24:MI') as "horaFin",
            to_char(rf.fecha_inicio, 'YYYY-MM-DD') as "fechaInicio", to_char(rf.fecha_fin_contrato, 'YYYY-MM-DD') as "fechaFinContrato",
            rf.estado, rf.renovar,
            c.id as "canchaId", c.nombre as "canchaNombre", c.deporte,
            u.id as "clienteId", u.nombre as "clienteNombre", u.apellido as "clienteApellido", u.email as "clienteEmail",
            (select count(*)::int from reserva r where r.reserva_fija_id = rf.id) as turnos,
            (select r.precio_aplicado from reserva r where r.reserva_fija_id = rf.id order by r.fecha limit 1) as "precioPorTurno"
       from reserva_fija rf
       join cancha c on c.id = rf.cancha_id
       left join usuario u on u.id = rf.cliente_usuario_id
      where rf.id = $1`,
    [contratoId],
  )
  const f = rows[0]
  if (!f) return null
  return {
    id: f.id,
    cancha: { id: f.canchaId, nombre: f.canchaNombre, deporte: f.deporte },
    cliente: f.clienteId ? { id: f.clienteId, nombre: f.clienteNombre, apellido: f.clienteApellido, email: f.clienteEmail } : null,
    diaSemana: f.diaSemana,
    horaInicio: f.horaInicio,
    horaFin: f.horaFin,
    fechaInicio: f.fechaInicio,
    fechaFinContrato: f.fechaFinContrato,
    estado: f.estado,
    turnos: f.turnos,
    precioPorTurno: f.precioPorTurno,
  }
}