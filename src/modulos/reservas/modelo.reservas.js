import { pool } from '../../config/conexion.bd.js'

// Reservas de cancha. Las usa el Módulo 3 para bloquear la cancha de cada partido (reserva de tipo TORNEO) y las
// va a usar el Módulo 2 para los alquileres. El anti-solapamiento lo garantiza la base: la restricción
// `reserva_sin_superposicion` (EXCLUDE USING gist) rechaza dos reservas PENDIENTE o CONFIRMADA de la misma cancha
// que se pisen, así que ni dos pedidos simultáneos pueden quedarse con la misma franja.

export const MENSAJE_FRANJA_OCUPADA = 'Franja ocupada, elegí otro horario'
// Reglas de negocio del Módulo 2 (decisiones del club y supuestos del plan). Están acá, y no repetidas en cada tarea,
// para que las usen igual la grilla, las reservas del jugador, el turno directo y los alquileres fijos.
export const HORA_APERTURA = '08:00'            // primer turno de la grilla
export const HORA_CIERRE = '23:00'              // el último turno termina a esta hora
export const DURACION_TURNO_MINUTOS = 60        // turno que pide el jugador (recepción puede cargar otra duración)
export const PLAZO_PAGO_HORAS = 24              // una reserva Pendiente vence a las 24 h, o al inicio del turno si es antes
export const ANTICIPACION_CANCELACION_HORAS = 3 // el Jugador cancela hasta 3 h antes; Recepción y Administrador, hasta que empiece
export const MESES_ALQUILER_FIJO = 3            // duración de un contrato de alquiler fijo (y de cada renovación)

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
    `select id, nombre, deporte, tipo_superficie as "tipoSuperficie", precio_hora as "precioHora"
       from cancha
      where activa and deporte = $1
      order by nombre`,
    [disciplina],
  )
  return rows.map((cancha) => ({ ...cancha, precioHora: Number(cancha.precioHora) }))
}

// Una cancha con su precio por hora, o null si no existe. `precioHora` sale como número (la base lo devuelve como texto).
export const obtenerCancha = async (canchaId, db = pool) => {
  const { rows } = await db.query(
    `select id, nombre, deporte, tipo_superficie as "tipoSuperficie", precio_hora as "precioHora", activa
       from cancha
      where id = $1`,
    [canchaId],
  )
  return rows[0] ? { ...rows[0], precioHora: Number(rows[0].precioHora) } : null
}

// Precio de un turno: el precio por hora proporcional a la duración, con dos decimales.
//   calcularPrecio(10000, '19:00', '20:30') → 15000
export const calcularPrecio = (precioHora, horaInicio, horaFin) => {
  const minutos = (hora) => Number(hora.slice(0, 2)) * 60 + Number(hora.slice(3, 5))
  const duracion = minutos(horaFin) - minutos(horaInicio)
  return Math.round(Number(precioHora) * duracion / 60 * 100) / 100
}

// Pasa a EXPIRADA toda reserva PENDIENTE cuyo plazo de pago ya venció (CU 2.2 · A2): su franja queda libre, porque la
// restricción de superposición solo mira PENDIENTE y CONFIRMADA. Devuelve cuántas expiró.
// Es el enfoque "perezoso" del plan (sin cron, porque Render puede dormir la instancia): hay que llamarla al comienzo
// de la grilla, los listados, crear una reserva, cobrar, cancelar y modificar. `expiracion_pago` es timestamptz, así que
// la comparación con now() no depende de la zona horaria. Las reservas sin plazo (torneo y fijas) no se tocan.
export const expirarVencidas = async (db = pool) => {
  const { rowCount } = await db.query(
    `update reserva set estado = 'EXPIRADA'
      where estado = 'PENDIENTE' and expiracion_pago is not null and expiracion_pago < now()`,
  )
  return rowCount
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

// El detalle de una reserva con todo lo que muestra la pantalla: cancha, cliente, contrato de origen (si es de un alquiler fijo)
// y torneo (si bloquea la cancha de un partido). `segundosParaInicio` es cuánto falta para que empiece el turno (negativo si ya
// empezó), calculado por la base en hora de Córdoba; sirve para decidir qué acciones corresponden. Devuelve null si no existe.
export const obtenerReservaDetalle = async (reservaId, db = pool) => {
  const { rows } = await db.query(
    `select r.id, to_char(r.fecha, 'YYYY-MM-DD') as fecha,
            to_char(r.hora_inicio, 'HH24:MI') as "horaInicio", to_char(r.hora_fin, 'HH24:MI') as "horaFin",
            r.tipo, r.estado, r.precio_aplicado as "precioAplicado", r.expiracion_pago as "expiracionPago",
            r.metodo_pago as "metodoPago", r.fecha_pago as "fechaPago", r.creada_en as "creadaEn",
            extract(epoch from ((r.fecha + r.hora_inicio) at time zone 'America/Argentina/Cordoba' - now())) as "segundosParaInicio",
            c.id as "canchaId", c.nombre as "canchaNombre", c.deporte, c.tipo_superficie as "tipoSuperficie", c.precio_hora as "precioHora",
            u.id as "clienteId", u.nombre as "clienteNombre", u.apellido as "clienteApellido", u.email as "clienteEmail", u.telefono as "clienteTelefono",
            r.nombre_contacto as "nombreContacto",
                        rf.id as "contratoId", rf.dia_semana as "diaSemana", to_char(rf.fecha_inicio, 'YYYY-MM-DD') as "contratoInicio", to_char(rf.fecha_fin_contrato, 'YYYY-MM-DD') as "contratoFin", rf.estado as "contratoEstado",
            t.id as "torneoId", t.nombre as "torneoNombre"
       from reserva r
       join cancha c on c.id = r.cancha_id
       left join usuario u on u.id = r.cliente_usuario_id
       left join reserva_fija rf on rf.id = r.reserva_fija_id
       left join partido p on p.reserva_id = r.id
       left join torneo t on t.id = p.torneo_id
      where r.id = $1`,
    [reservaId],
  )
  const r = rows[0]
  if (!r) return null
  const cliente = r.clienteId
    ? { id: r.clienteId, nombre: r.clienteNombre, apellido: r.clienteApellido, email: r.clienteEmail, telefono: r.clienteTelefono }
    : r.nombreContacto ? { id: null, nombre: r.nombreContacto, apellido: '', email: null, telefono: null } : null
  return {
    id: r.id,
    cancha: { id: r.canchaId, nombre: r.canchaNombre, deporte: r.deporte, tipoSuperficie: r.tipoSuperficie, precioHora: Number(r.precioHora) },
    fecha: r.fecha,
    horaInicio: r.horaInicio,
    horaFin: r.horaFin,
    tipo: r.tipo,
    estado: r.estado,
    precioAplicado: r.precioAplicado === null ? null : Number(r.precioAplicado),
    expiracionPago: r.expiracionPago,
    metodoPago: r.metodoPago,
    fechaPago: r.fechaPago,
    creadaEn: r.creadaEn,
    cliente,
    contrato: r.contratoId
      ? { id: r.contratoId, diaSemana: r.diaSemana, fechaInicio: r.contratoInicio, fechaFin: r.contratoFin, estado: r.contratoEstado }
      : null,
    torneo: r.torneoId ? { id: r.torneoId, nombre: r.torneoNombre } : null,
    segundosParaInicio: Number(r.segundosParaInicio),
  }
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
  // Hora de fin de un turno: sumarMinutos('19:00', 60) → '20:00'
const sumarMinutos = (hora, minutos) => {
  const total = Number(hora.slice(0, 2)) * 60 + Number(hora.slice(3, 5)) + minutos
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

// Registra una reserva ocasional para un cliente (CU 2.2 y CU 2.3). Todo en una transacción: expira las pendientes vencidas
// (para que su franja cuente como libre), valida la cancha, el horario del club y que el turno no haya empezado, comprueba que la
// franja esté libre y crea la reserva con el precio de la cancha.
// - Sin `horaFin`, el turno dura `minutos` (60 para el jugador). Recepción manda `horaFin` para elegir cualquier horario del día.
// - Sin `cobro`, queda PENDIENTE con su plazo de pago (24 horas, o el inicio del turno si es antes).
// - Con `cobro` ({ metodoPago, operadorUsuarioId }) queda CONFIRMADA, ya paga, sin plazo (CU 2.3, paso de cobro).
// Si dos pedidos simultáneos llegan a la vez por la misma franja, la restricción de la base deja pasar a uno y rechaza al otro.
// Devuelve { resultado: 'OK', reservaId } | 'CANCHA_NO_ENCONTRADA' | 'CANCHA_INACTIVA' | 'HORARIO_INVALIDO' | 'FUERA_DE_HORARIO'
// | 'FECHA_PASADA' | 'FRANJA_OCUPADA'.
export const crearReserva = (
  { canchaId, clienteUsuarioId, fecha, horaInicio, horaFin: horaFinElegida, minutos = DURACION_TURNO_MINUTOS, cobro = null },
  db = pool,
) =>
  enTransaccion(db, async (tx) => {
    await expirarVencidas(tx)

    const cancha = await obtenerCancha(canchaId, tx)
    if (!cancha) return { resultado: 'CANCHA_NO_ENCONTRADA' }
    if (!cancha.activa) return { resultado: 'CANCHA_INACTIVA' }

    const horaFin = horaFinElegida ?? sumarMinutos(horaInicio, minutos)
    if (horaFin <= horaInicio) return { resultado: 'HORARIO_INVALIDO' }
    if (horaInicio < HORA_APERTURA || horaFin > HORA_CIERRE) return { resultado: 'FUERA_DE_HORARIO' }

    // Un turno que ya empezó (o pasó) no se puede reservar; la hora se toma en Córdoba
    const { rows: momento } = await tx.query(
      `select (($1::date + $2::time) at time zone 'America/Argentina/Cordoba') <= now() as pasada`,
      [fecha, horaInicio],
    )
    if (momento[0].pasada) return { resultado: 'FECHA_PASADA' }

    if (!(await verificarDisponibilidad(canchaId, fecha, horaInicio, horaFin, tx))) return { resultado: 'FRANJA_OCUPADA' }

    try {
      const { rows } = await tx.query(
        `insert into reserva (cancha_id, cliente_usuario_id, fecha, hora_inicio, hora_fin, estado, tipo, precio_aplicado,
                              expiracion_pago, metodo_pago, fecha_pago, pago_registrado_por)
         values ($1, $2, $3, $4, $5,
                 case when $8::boolean then 'CONFIRMADA'::estado_reserva else 'PENDIENTE'::estado_reserva end,
                 'OCASIONAL', $6,
                 case when $8::boolean then null
                      else least(now() + make_interval(hours => $7), ($3::date + $4::time) at time zone 'America/Argentina/Cordoba') end,
                 $9::metodo_pago,
                 case when $8::boolean then now() end,
                 $10::uuid)
         returning id`,
        [
          canchaId, clienteUsuarioId, fecha, horaInicio, horaFin, calcularPrecio(cancha.precioHora, horaInicio, horaFin), PLAZO_PAGO_HORAS,
          Boolean(cobro), cobro?.metodoPago ?? null, cobro?.operadorUsuarioId ?? null,
        ],
      )
      return { resultado: 'OK', reservaId: rows[0].id }
    } catch (error) {
      if (error.code !== SOLAPAMIENTO) throw error
      throw Object.assign(new Error('FRANJA_OCUPADA'), { franjaOcupada: true })
    }
  }).catch((error) => {
    if (error.franjaOcupada) return { resultado: 'FRANJA_OCUPADA' }
    throw error
  })

// El usuario de un jugador (el id que devuelve la búsqueda de clientes), o null si no existe, no es un jugador o su cuenta no está activa.
export const obtenerClienteReserva = async (jugadorId, db = pool) => {
  const { rows } = await db.query(
    `select u.id from jugador j join usuario u on u.id = j.usuario_id
      where j.id = $1 and u.rol = 'JUGADOR' and u.estado = 'ACTIVO'`,
    [jugadorId],
  )
  return rows[0]?.id ?? null
}

// Registra el pago de una reserva PENDIENTE y la pasa a CONFIRMADA, con el medio, la fecha de pago y quién lo cobró (CU 2.3 · A1 y
// CU 2.2 · A1). Es la función que van a usar también el webhook de Mercado Pago (`operadorUsuarioId` nulo, medio 'MERCADO_PAGO') y el
// registro en caja del Módulo 5. Antes vence las pendientes con el plazo pasado: una reserva vencida ya no se puede cobrar.
// El `update ... where estado = 'PENDIENTE'` es atómico: si dos cobros llegan a la vez, solo uno encuentra la reserva pendiente.
// Devuelve { resultado: 'OK' } | 'NO_ENCONTRADA' | 'NO_COBRABLE' (torneo o alquiler fijo) | 'EXPIRADA' | 'YA_PAGADA' | 'CANCELADA'.
export const confirmarReserva = (reservaId, operadorUsuarioId, metodoPago, db = pool) =>
  enTransaccion(db, async (tx) => {
    await expirarVencidas(tx)

    const { rows: reservas } = await tx.query('select tipo, estado from reserva where id = $1', [reservaId])
    if (!reservas[0]) return { resultado: 'NO_ENCONTRADA' }
    if (reservas[0].tipo !== 'OCASIONAL') return { resultado: 'NO_COBRABLE' }

    const { rows } = await tx.query(
      `update reserva
          set estado = 'CONFIRMADA', metodo_pago = $3, fecha_pago = now(), pago_registrado_por = $2, expiracion_pago = null
        where id = $1 and estado = 'PENDIENTE'
        returning id`,
      [reservaId, operadorUsuarioId, metodoPago],
    )
    if (rows[0]) return { resultado: 'OK' }

    // No estaba pendiente (o la ganó otro cobro simultáneo): se informa en qué estado quedó
    const { rows: actual } = await tx.query('select estado from reserva where id = $1', [reservaId])
    return { resultado: { CONFIRMADA: 'YA_PAGADA', EXPIRADA: 'EXPIRADA', CANCELADA: 'CANCELADA' }[actual[0].estado] }
  })

  // Cancela una reserva por decisión de un usuario (CU 2.5): la pasa a CANCELADA y su franja queda libre. Bloquea la fila mientras decide,
// así dos cancelaciones (o una cancelación y un cobro) simultáneas no se pisan. Solo se cancela una PENDIENTE o CONFIRMADA.
// Si es de un alquiler fijo, cancela solo esa fecha: el contrato y las demás fechas no se tocan.
// Devuelve { resultado: 'OK', estadoPrevio, precioAplicado } | { resultado: 'NO_ENCONTRADA' } | { resultado: 'NO_CANCELABLE', estado }.
export const cancelarPorDecision = (reservaId, db = pool) =>
  enTransaccion(db, async (tx) => {
    const { rows } = await tx.query('select estado, precio_aplicado as "precioAplicado" from reserva where id = $1 for update', [reservaId])
    if (!rows[0]) return { resultado: 'NO_ENCONTRADA' }
    if (!['PENDIENTE', 'CONFIRMADA'].includes(rows[0].estado)) return { resultado: 'NO_CANCELABLE', estado: rows[0].estado }
    await cancelarReserva(reservaId, tx)
    return { resultado: 'OK', estadoPrevio: rows[0].estado, precioAplicado: Number(rows[0].precioAplicado) }
  })

// Cambia la fecha y el horario de una reserva PENDIENTE o CONFIRMADA en la misma cancha (CU 2.5 · A1). En una transacción: bloquea la
// reserva, valida el horario como al crearla (fin posterior al inicio, dentro del horario del club, no empezado) y comprueba la
// disponibilidad sin contar a la propia reserva, así que mover a un horario que la pisa a ella misma funciona. Recalcula el precio con la
// nueva duración. Una PENDIENTE conserva su plazo de pago; solo se acorta si el turno nuevo empieza antes de que venza.
// Si dos pedidos simultáneos van por la misma franja, la restricción de la base deja pasar a uno.
// Devuelve { resultado: 'OK', precioAnterior } | 'NO_ENCONTRADA' | 'NO_MODIFICABLE' | 'CANCHA_INACTIVA' | 'HORARIO_INVALIDO'
// | 'FUERA_DE_HORARIO' | 'FECHA_PASADA' | 'FRANJA_OCUPADA'.
export const modificarHorario = (reservaId, { fecha, horaInicio, horaFin }, db = pool) =>
  enTransaccion(db, async (tx) => {
    await expirarVencidas(tx)

    const { rows } = await tx.query(
      `select cancha_id as "canchaId", estado, precio_aplicado as "precioAplicado" from reserva where id = $1 for update`,
      [reservaId],
    )
    const reserva = rows[0]
    if (!reserva) return { resultado: 'NO_ENCONTRADA' }
    if (!['PENDIENTE', 'CONFIRMADA'].includes(reserva.estado)) return { resultado: 'NO_MODIFICABLE' }

    const cancha = await obtenerCancha(reserva.canchaId, tx)
    if (!cancha.activa) return { resultado: 'CANCHA_INACTIVA' }
    if (horaFin <= horaInicio) return { resultado: 'HORARIO_INVALIDO' }
    if (horaInicio < HORA_APERTURA || horaFin > HORA_CIERRE) return { resultado: 'FUERA_DE_HORARIO' }

    const { rows: momento } = await tx.query(
      `select (($1::date + $2::time) at time zone 'America/Argentina/Cordoba') <= now() as pasada`,
      [fecha, horaInicio],
    )
    if (momento[0].pasada) return { resultado: 'FECHA_PASADA' }

    if (!(await verificarDisponibilidad(reserva.canchaId, fecha, horaInicio, horaFin, tx, reservaId))) return { resultado: 'FRANJA_OCUPADA' }

    try {
      await tx.query(
        `update reserva
            set fecha = $2, hora_inicio = $3, hora_fin = $4, precio_aplicado = $5,
                expiracion_pago = case when estado = 'PENDIENTE'
                                       then least(expiracion_pago, ($2::date + $3::time) at time zone 'America/Argentina/Cordoba')
                                       else expiracion_pago end
          where id = $1`,
        [reservaId, fecha, horaInicio, horaFin, calcularPrecio(cancha.precioHora, horaInicio, horaFin)],
      )
      return { resultado: 'OK', precioAnterior: Number(reserva.precioAplicado) }
    } catch (error) {
      if (error.code !== SOLAPAMIENTO) throw error
      throw Object.assign(new Error('FRANJA_OCUPADA'), { franjaOcupada: true })
    }
  }).catch((error) => {
    if (error.franjaOcupada) return { resultado: 'FRANJA_OCUPADA' }
    throw error
  })

  // Las otras canchas activas del mismo deporte donde la franja de la reserva está libre, con el precio que tendría en cada una
// (CU 2.5 · A2). Devuelve null si la reserva no existe.
export const canchasParaReasignar = async (reservaId, db = pool) => {
  const { rows } = await db.query(
    `select cancha_id as "canchaId", to_char(fecha, 'YYYY-MM-DD') as fecha,
            to_char(hora_inicio, 'HH24:MI') as "horaInicio", to_char(hora_fin, 'HH24:MI') as "horaFin"
       from reserva where id = $1`,
    [reservaId],
  )
  if (!rows[0]) return null
  const { canchaId, fecha, horaInicio, horaFin } = rows[0]
  const actual = await obtenerCancha(canchaId, db)
  const { rows: candidatas } = await db.query(
    `select id from cancha where activa and deporte = $1 and id <> $2 order by nombre`,
    [actual.deporte, canchaId],
  )
  const libres = []
  for (const { id } of candidatas) {
    if (await verificarDisponibilidad(id, fecha, horaInicio, horaFin, db, reservaId)) {
      const cancha = await obtenerCancha(id, db)
      libres.push({
        id: cancha.id,
        nombre: cancha.nombre,
        deporte: cancha.deporte,
        tipoSuperficie: cancha.tipoSuperficie,
        precioHora: cancha.precioHora,
        precioNuevo: calcularPrecio(cancha.precioHora, horaInicio, horaFin),
      })
    }
  }
  return libres
}

// Mueve una reserva PENDIENTE o CONFIRMADA a otra cancha del mismo deporte, con el mismo día y horario, y recalcula el precio con el
// `precio_hora` de la cancha nueva (CU 2.5 · A2). Bloquea la reserva, comprueba la disponibilidad sin contar a la propia reserva y,
// si dos pedidos simultáneos van por la misma franja, la restricción de la base deja pasar a uno.
// Devuelve { resultado: 'OK', precioAnterior } | 'NO_ENCONTRADA' | 'NO_MODIFICABLE' | 'CANCHA_NO_ENCONTRADA' | 'CANCHA_INACTIVA'
// | 'OTRO_DEPORTE' | 'MISMA_CANCHA' | 'FRANJA_OCUPADA'.
export const reasignarCancha = (reservaId, canchaNuevaId, db = pool) =>
  enTransaccion(db, async (tx) => {
    await expirarVencidas(tx)

    const { rows } = await tx.query(
      `select cancha_id as "canchaId", estado, precio_aplicado as "precioAplicado", to_char(fecha, 'YYYY-MM-DD') as fecha,
              to_char(hora_inicio, 'HH24:MI') as "horaInicio", to_char(hora_fin, 'HH24:MI') as "horaFin"
         from reserva where id = $1 for update`,
      [reservaId],
    )
    const reserva = rows[0]
    if (!reserva) return { resultado: 'NO_ENCONTRADA' }
    if (!['PENDIENTE', 'CONFIRMADA'].includes(reserva.estado)) return { resultado: 'NO_MODIFICABLE' }

    const nueva = await obtenerCancha(canchaNuevaId, tx)
    if (!nueva) return { resultado: 'CANCHA_NO_ENCONTRADA' }
    if (reserva.canchaId === nueva.id) return { resultado: 'MISMA_CANCHA' }
    const actual = await obtenerCancha(reserva.canchaId, tx)
    if (nueva.deporte !== actual.deporte) return { resultado: 'OTRO_DEPORTE' }
    if (!nueva.activa) return { resultado: 'CANCHA_INACTIVA' }

    if (!(await verificarDisponibilidad(nueva.id, reserva.fecha, reserva.horaInicio, reserva.horaFin, tx, reservaId))) {
      return { resultado: 'FRANJA_OCUPADA' }
    }

    try {
      await tx.query('update reserva set cancha_id = $2, precio_aplicado = $3 where id = $1', [
        reservaId, nueva.id, calcularPrecio(nueva.precioHora, reserva.horaInicio, reserva.horaFin),
      ])
      return { resultado: 'OK', precioAnterior: Number(reserva.precioAplicado) }
    } catch (error) {
      if (error.code !== SOLAPAMIENTO) throw error
      throw Object.assign(new Error('FRANJA_OCUPADA'), { franjaOcupada: true })
    }
  }).catch((error) => {
    if (error.franjaOcupada) return { resultado: 'FRANJA_OCUPADA' }
    throw error
  })