import { pool } from '../../config/conexion.bd.js'
import { DURACION_MIN, HORARIO, programar } from '../torneos/scheduler.torneos.js'
import { listarCanchas, listarOcupadas, reservarParaPartido, verificarDisponibilidad } from '../reservas/modelo.reservas.js'

const aMinutos = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5))
const aHora = (minutos) => `${String(Math.floor(minutos / 60)).padStart(2, '0')}:${String(minutos % 60).padStart(2, '0')}`
const sumarDias = (fecha, dias) => new Date(Date.parse(`${fecha}T00:00:00Z`) + dias * 86400000).toISOString().slice(0, 10)

const DIAS_DE_BUSQUEDA = 14

// Datos del partido, su torneo y los jugadores que lo juegan (titular y compañero de cada inscripción).
const buscarPartido = async (partidoId, db) => {
  const { rows } = await db.query(
    `select p.id, p.estado, p.es_bye as "esBye", p.reserva_id as "reservaId",
            t.id as "torneoId", t.disciplina, t.estado as "estadoTorneo",
            to_char(t.fecha_inicio, 'YYYY-MM-DD') as "fechaInicio", to_char(t.fecha_fin, 'YYYY-MM-DD') as "fechaFin",
            coalesce((
              select array_agg(distinct j.jugador_id)
                from inscripcion i
                cross join lateral (values (i.titular_jugador_id), (i.companero_jugador_id)) j(jugador_id)
               where i.id in (p.local_inscripcion_id, p.visitante_inscripcion_id) and j.jugador_id is not null
            ), '{}') as jugadores
       from partido p
       join torneo t on t.id = p.torneo_id
      where p.id = $1
      for update of p`,
    [partidoId],
  )
  return rows[0] ?? null
}

// Partidos programados de esos jugadores en otros partidos (de cualquier torneo), desde `desde` en adelante
export const agendaDeJugadores = async (jugadores, partidoId, desde, hasta, db) => {
  if (jugadores.length === 0) return []
  const { rows } = await db.query(
    `select j.jugador_id as "jugadorId", to_char(r.fecha, 'YYYY-MM-DD') as fecha,
            to_char(r.hora_inicio, 'HH24:MI') as "horaInicio", to_char(r.hora_fin, 'HH24:MI') as "horaFin"
       from partido p
       join reserva r on r.id = p.reserva_id and r.estado in ('PENDIENTE', 'CONFIRMADA')
       join inscripcion i on i.id in (p.local_inscripcion_id, p.visitante_inscripcion_id)
       cross join lateral (values (i.titular_jugador_id), (i.companero_jugador_id)) j(jugador_id)
      where p.id is distinct from $2 and p.estado in ('PENDIENTE', 'PROGRAMADO')
        and j.jugador_id = any($1) and r.fecha between $3 and $4`,
    [jugadores, partidoId, desde, hasta],
  )
  return rows
}

// Primera franja libre desde `desde` (fecha y hora) que sirva para este partido, o null. Usa el scheduler
// con las reservas vigentes y los partidos de sus jugadores. Sólo evita superposiciones: sin descanso mínimo.
const sugerirFranja = async (partido, { fecha, horaInicio }, db) => {
  const canchas = await listarCanchas(partido.disciplina, db)
  const desde = partido.fechaInicio && partido.fechaInicio > fecha ? partido.fechaInicio : fecha
  const hasta = partido.fechaFin ?? sumarDias(desde, DIAS_DE_BUSQUEDA)
  if (hasta < desde || canchas.length === 0) return null

  const ocupadas = await listarOcupadas(canchas.map((c) => c.id), desde, hasta, db, partido.reservaId)
  const agenda = await agendaDeJugadores(partido.jugadores, partido.id, desde, hasta, db)
  const agendaPrevia = {}
  for (const { jugadorId, ...franja } of agenda) (agendaPrevia[jugadorId] ??= []).push(franja)

  const { asignados } = programar(
    [{ id: partido.id, ronda: 1, participantes: partido.jugadores, noAntesDe: { fecha, hora: horaInicio } }],
    { canchas, ocupadas, agendaPrevia, desde, hasta, descansoMin: 0 },
  )
  if (asignados.length === 0) return null
  const { canchaId, fecha: fechaSugerida, horaInicio: horaSugerida, horaFin } = asignados[0]
  return { canchaId, fecha: fechaSugerida, horaInicio: horaSugerida, horaFin }
}

// Programa o reprograma un partido a mano. Todo en una transacción: si la franja nueva no sirve, la
// reserva anterior queda como estaba; si sirve, la anterior se cancela (su franja queda libre) y se crea la nueva.
// Devuelve { resultado, ... }:
//   'OK' (reserva y partido) · 'NO_ENCONTRADO' · 'NO_PROGRAMABLE' (motivo) · 'CANCHA_INVALIDA'
//   'FRANJA_NO_DISPONIBLE' (con sugerencia) · 'PARTICIPANTE_OCUPADO' (con sugerencia)
//   'FRANJA_OCUPADA' (alguien la tomó en el mismo instante)
export const programarPartido = async (partidoId, { canchaId, fecha, horaInicio }) => {
  const cliente = await pool.connect()
  try {
    await cliente.query('begin')
    const partido = await buscarPartido(partidoId, cliente)
    if (!partido) {
      await cliente.query('rollback')
      return { resultado: 'NO_ENCONTRADO' }
    }

    const descartar = async (resultado) => {
      await cliente.query('rollback')
      return resultado
    }

    if (partido.esBye) return descartar({ resultado: 'NO_PROGRAMABLE', motivo: 'Un partido con bye no se programa' })
    if (partido.estadoTorneo !== 'EN_CURSO') {
      return descartar({ resultado: 'NO_PROGRAMABLE', motivo: 'El torneo no está en curso' })
    }
    if (!['PENDIENTE', 'PROGRAMADO'].includes(partido.estado)) {
      return descartar({ resultado: 'NO_PROGRAMABLE', motivo: 'El partido ya se jugó' })
    }

    const canchas = await listarCanchas(partido.disciplina, cliente)
    if (!canchas.some((c) => c.id === canchaId)) return descartar({ resultado: 'CANCHA_INVALIDA' })

    const inicio = aMinutos(horaInicio)
    const horaFin = aHora(inicio + DURACION_MIN)
    const dentroDelHorario = inicio >= aMinutos(HORARIO.desde) && inicio + DURACION_MIN <= aMinutos(HORARIO.hasta)
    const dentroDelPeriodo = (!partido.fechaInicio || fecha >= partido.fechaInicio) && (!partido.fechaFin || fecha <= partido.fechaFin)

    // Fuera del horario o del período del torneo, o la cancha ya está tomada (sin contar la reserva actual)
    const libre = dentroDelHorario && dentroDelPeriodo
      && (await verificarDisponibilidad(canchaId, fecha, horaInicio, horaFin, cliente, partido.reservaId))
    if (!libre) {
      return descartar({ resultado: 'FRANJA_NO_DISPONIBLE', sugerencia: await sugerirFranja(partido, { fecha, horaInicio }, cliente) })
    }

    // Alguno de los jugadores ya tiene otro partido que se superpone
    const agenda = await agendaDeJugadores(partido.jugadores, partido.id, fecha, fecha, cliente)
    const pisa = agenda.some((o) => inicio < aMinutos(o.horaFin) && aMinutos(o.horaInicio) < inicio + DURACION_MIN)
    if (pisa) {
      return descartar({ resultado: 'PARTICIPANTE_OCUPADO', sugerencia: await sugerirFranja(partido, { fecha, horaInicio }, cliente) })
    }

    // Si entre la verificación y el alta otro se quedó con la franja, la base la rechaza
    const reservado = await reservarParaPartido(partidoId, { canchaId, fecha, horaInicio, horaFin }, cliente)
    if (reservado.resultado !== 'OK') return descartar({ resultado: reservado.resultado })

    await cliente.query('commit')
    return {
      resultado: 'OK',
      partido: {
        id: partidoId,
        estado: 'PROGRAMADO',
        cancha: canchas.find((c) => c.id === canchaId),
        fecha,
        horaInicio,
        horaFin,
      },
    }
  } catch (error) {
    await cliente.query('rollback').catch(() => {})
    throw error
  } finally {
    cliente.release()
  }
}

// Amplía la fecha de fin de un torneo en curso y, con el período nuevo, intenta programar los partidos que habían
// quedado sin cancha ni horario. Todo en una transacción. Devuelve { resultado, ... }:
//   'NO_ENCONTRADO' · 'ESTADO_INVALIDO' (estado) · 'FECHA_NO_POSTERIOR' (fechaFinActual)
//   'OK' (fechaFin, programados, sinProgramar: cuántos quedaron sin lugar)
export const ampliarFechaFin = async (torneoId, fechaFin) => {
  const cliente = await pool.connect()
  try {
    await cliente.query('begin')
    const descartar = async (resultado) => {
      await cliente.query('rollback')
      return resultado
    }

    const { rows } = await cliente.query(
      `select estado, to_char(fecha_fin, 'YYYY-MM-DD') as "fechaFin" from torneo where id = $1 for update`,
      [torneoId],
    )
    if (!rows[0]) return await descartar({ resultado: 'NO_ENCONTRADO' })
    if (rows[0].estado !== 'EN_CURSO') return await descartar({ resultado: 'ESTADO_INVALIDO', estado: rows[0].estado })
    if (fechaFin <= rows[0].fechaFin) return await descartar({ resultado: 'FECHA_NO_POSTERIOR', fechaFinActual: rows[0].fechaFin })

    await cliente.query('update torneo set fecha_fin = $2 where id = $1', [torneoId, fechaFin])

    // Los que se juegan, tienen a los dos rivales y no tienen franja, en el orden del cuadro
    const { rows: pendientes } = await cliente.query(
      `select id from partido
        where torneo_id = $1 and estado = 'PENDIENTE' and reserva_id is null and not es_bye
          and local_inscripcion_id is not null and visitante_inscripcion_id is not null
        order by ronda, posicion`,
      [torneoId],
    )

    let programados = 0
    for (const { id } of pendientes) {
      const partido = await buscarPartido(id, cliente)
      const franja = await sugerirFranja(partido, { fecha: partido.fechaInicio, horaInicio: HORARIO.desde }, cliente)
      if (!franja) continue
      const { resultado } = await reservarParaPartido(id, franja, cliente)
      if (resultado === 'OK') programados += 1
    }

    await cliente.query('commit')
    return { resultado: 'OK', fechaFin, programados, sinProgramar: pendientes.length - programados }
  } catch (error) {
    await cliente.query('rollback').catch(() => {})
    throw error
  } finally {
    cliente.release()
  }
}