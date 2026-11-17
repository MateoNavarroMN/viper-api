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
// - `avisoFinContrato`: true desde el día del último turno (y hasta que el contrato termine): es cuando se le avisa al cliente y cuando se
//   puede renovar. Sin cron ni notificaciones, es un dato que calcula la base cada vez que se pide.
// - `respuestaCliente`: lo que contestó el cliente al aviso de fin de contrato: null (todavía no), CONTINUAR o FINALIZAR.
const SELECT_CONTRATOS = `
  select rf.id, rf.dia_semana as "diaSemana", to_char(rf.hora_inicio, 'HH24:MI') as "horaInicio", to_char(rf.hora_fin, 'HH24:MI') as "horaFin",
         to_char(rf.fecha_inicio, 'YYYY-MM-DD') as "fechaInicio", to_char(rf.fecha_fin_contrato, 'YYYY-MM-DD') as "fechaFinContrato",
         rf.estado, rf.renovar, rf.cancelado_en as "canceladoEn",
         c.id as "canchaId", c.nombre as "canchaNombre", c.deporte, c.activa as "canchaActiva", c.precio_hora as "precioHoraActual",
         rf.cliente_usuario_id as "clienteUsuarioId",
         u.id as "clienteId", u.nombre as "clienteNombre", u.apellido as "clienteApellido", u.email as "clienteEmail", j.dni as "clienteDni",
         (rf.estado = 'VIGENTE' and coalesce((select max(r.fecha) from reserva r where r.reserva_fija_id = rf.id and r.estado = 'CONFIRMADA')
                                          <= (now() at time zone 'America/Argentina/Cordoba')::date, false)) as "avisoFinContrato",
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
  avisoFinContrato: f.avisoFinContrato,
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

// Los contratos vigentes de un cliente, con el aviso de fin de contrato y su respuesta, del que termina antes al que termina después.
// Sin los datos del cliente (es él mismo). Antes de leer, finaliza los vencidos.
export const listarContratosDeCliente = async (clienteUsuarioId, db = pool) => {
  await finalizarVencidos(db)
  const { rows } = await db.query(
    `${SELECT_CONTRATOS} where rf.cliente_usuario_id = $1 and rf.estado = 'VIGENTE' order by rf.fecha_fin_contrato, rf.id`,
    [clienteUsuarioId],
  )
  return rows.map((fila) => {
    const { cliente, respuestaCliente, ...contrato } = aContrato(fila)
    return { ...contrato, respuesta: respuestaCliente }
  })
}

// Guarda lo que decide el cliente al llegar el aviso de fin de contrato: seguir otros 3 meses o terminar (CU 2.4 · A3a y A3b).
// Solo el cliente del contrato (otro jugador recibe NO_ENCONTRADO, como si no existiera) y solo con el aviso activo; mientras siga
// activo puede cambiar de opinión. Devuelve { resultado: 'OK' } | 'NO_ENCONTRADO' | 'YA_FINALIZADO' | 'AVISO_INACTIVO'.
export const responderAviso = async (contratoId, clienteUsuarioId, continuar) => {
  const cliente = await pool.connect()
  try {
    await cliente.query('begin')
    await finalizarVencidos(cliente)

    // Primero se bloquea el contrato y recién después se lee: así lo leído (turnos, aviso) ya incluye lo que hizo quien lo tenía bloqueado
    await cliente.query('select 1 from reserva_fija where id = $1 for update', [contratoId])
    const { rows } = await cliente.query(`${SELECT_CONTRATOS} where rf.id = $1 and rf.cliente_usuario_id = $2`, [contratoId, clienteUsuarioId])

    let resultado = { resultado: 'OK' }
    if (!rows[0]) resultado = { resultado: 'NO_ENCONTRADO' }
    else if (rows[0].estado !== 'VIGENTE') resultado = { resultado: 'YA_FINALIZADO' }
    else if (!rows[0].avisoFinContrato) resultado = { resultado: 'AVISO_INACTIVO' }
    else await cliente.query('update reserva_fija set renovar = $2 where id = $1', [contratoId, continuar])
    await cliente.query('commit')
    return resultado
  } catch (error) {
    await cliente.query('rollback').catch(() => {})
    throw error
  } finally {
    cliente.release()
  }
}

// Las fechas del período nuevo de un contrato: las semanales de su misma serie que van después del fin actual, hasta el fin actual + 3 meses
const FECHAS_DE_LA_RENOVACION = `
  select d::date as fecha
    from generate_series($1::date, $2::date + make_interval(months => $3), interval '7 days') as d
   where d::date > $2::date`

// Renueva un contrato por otros 3 meses (CU 2.4 · A3a), en una transacción: comprueba que cada fecha del período nuevo esté libre y, si
// es así, extiende `fecha_fin_contrato` y crea las reservas FIJA del período (solo las nuevas: nunca repite las que ya existen).
// Se puede renovar con el aviso activo, sin importar si el cliente respondió desde el portal o avisó en el mostrador. Después de renovar,
// la respuesta del cliente vuelve a quedar sin contestar para el período que viene.
// Devuelve { resultado: 'OK', turnos, fechaFin } | 'NO_ENCONTRADO' | 'YA_FINALIZADO' | 'AVISO_INACTIVO' | 'CANCHA_INACTIVA'
// | { resultado: 'FECHAS_OCUPADAS', fechas }.
export const renovarContrato = async (contratoId) => {
  const cliente = await pool.connect()
  let datos = null
  try {
    await cliente.query('begin')
    await finalizarVencidos(cliente)
    
    // Primero se bloquea el contrato y recién después se lee: si dos renovaciones llegan juntas, la segunda ya ve los turnos de la primera
    await cliente.query('select 1 from reserva_fija where id = $1 for update', [contratoId])
    const { rows } = await cliente.query(`${SELECT_CONTRATOS} where rf.id = $1`, [contratoId])
    
    const fila = rows[0]
    if (!fila || fila.estado !== 'VIGENTE' || !fila.avisoFinContrato || !fila.canchaActiva) {
      await cliente.query('commit')
      if (!fila) return { resultado: 'NO_ENCONTRADO' }
      if (fila.estado !== 'VIGENTE') return { resultado: 'YA_FINALIZADO' }
      if (!fila.avisoFinContrato) return { resultado: 'AVISO_INACTIVO' }
      return { resultado: 'CANCHA_INACTIVA' }
    }
    datos = fila

    const base = [datos.fechaInicio, datos.fechaFinContrato, MESES_ALQUILER_FIJO]
    const { rows: ocupadas } = await cliente.query(
      `with nuevas as (${FECHAS_DE_LA_RENOVACION})
       select to_char(n.fecha, 'YYYY-MM-DD') as fecha from nuevas n
        where exists (
          select 1 from reserva r
           where r.cancha_id = $4 and r.estado in ('PENDIENTE', 'CONFIRMADA')
             and tsrange(r.fecha + r.hora_inicio, r.fecha + r.hora_fin) && tsrange(n.fecha + $5::time, n.fecha + $6::time))
        order by n.fecha`,
      [...base, datos.canchaId, datos.horaInicio, datos.horaFin],
    )
    if (ocupadas.length > 0) {
      await cliente.query('rollback')
      return { resultado: 'FECHAS_OCUPADAS', fechas: ocupadas.map((o) => o.fecha) }
    }

    const { rowCount } = await cliente.query(
      `with nuevas as (${FECHAS_DE_LA_RENOVACION})
       insert into reserva (cancha_id, cliente_usuario_id, reserva_fija_id, fecha, hora_inicio, hora_fin, estado, tipo, precio_aplicado)
       select $4, $5, $6, n.fecha, $7, $8, 'CONFIRMADA', 'FIJA', $9 from nuevas n`,
      [...base, datos.canchaId, datos.clienteUsuarioId, contratoId, datos.horaInicio, datos.horaFin, calcularPrecio(datos.precioHoraActual, datos.horaInicio, datos.horaFin)],
    )
    const { rows: fin } = await cliente.query(
      `update reserva_fija set fecha_fin_contrato = fecha_fin_contrato + make_interval(months => $2), renovar = null
        where id = $1 returning to_char(fecha_fin_contrato, 'YYYY-MM-DD') as "fechaFin"`,
      [contratoId, MESES_ALQUILER_FIJO],
    )
    await cliente.query('commit')
    return { resultado: 'OK', turnos: rowCount, fechaFin: fin[0].fechaFin }
  } catch (error) {
    await cliente.query('rollback').catch(() => {})
    if (error.code !== SOLAPAMIENTO || !datos) throw error
    // Alguien tomó una de las fechas mientras se generaban: no quedó nada a medias y se informa la lista al día
    const { rows } = await pool.query(
      `with nuevas as (${FECHAS_DE_LA_RENOVACION})
       select to_char(n.fecha, 'YYYY-MM-DD') as fecha from nuevas n
        where exists (
          select 1 from reserva r
           where r.cancha_id = $4 and r.estado in ('PENDIENTE', 'CONFIRMADA')
             and tsrange(r.fecha + r.hora_inicio, r.fecha + r.hora_fin) && tsrange(n.fecha + $5::time, n.fecha + $6::time))
        order by n.fecha`,
      [datos.fechaInicio, datos.fechaFinContrato, MESES_ALQUILER_FIJO, datos.canchaId, datos.horaInicio, datos.horaFin],
    )
    return { resultado: 'FECHAS_OCUPADAS', fechas: rows.map((o) => o.fecha) }
  } finally {
    cliente.release()
  }
}


