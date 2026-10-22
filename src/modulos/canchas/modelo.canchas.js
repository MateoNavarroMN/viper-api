import { pool } from '../../config/conexion.bd.js'
import { listarCanchas } from '../reservas/modelo.reservas.js'
import { HORARIO } from '../torneos/scheduler.torneos.js'

const aMinutos = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5))
const aHora = (minutos) => `${String(Math.floor(minutos / 60)).padStart(2, '0')}:${String(minutos % 60).padStart(2, '0')}`

// Franjas libres de un día: lo que queda del horario del club (08:00 a 23:00) fuera de las reservas vigentes.
// `ocupadas` viene ordenada por hora de inicio.
const franjasLibres = (ocupadas) => {
  const libres = []
  const cierre = aMinutos(HORARIO.hasta)
  let cursor = aMinutos(HORARIO.desde)
  for (const o of ocupadas) {
    if (aMinutos(o.horaInicio) > cursor) libres.push({ horaInicio: aHora(cursor), horaFin: o.horaInicio })
    cursor = Math.max(cursor, aMinutos(o.horaFin))
  }
  if (cursor < cierre) libres.push({ horaInicio: aHora(cursor), horaFin: HORARIO.hasta })
  return libres
}

// Disponibilidad de las canchas de una disciplina en una fecha: por cancha, las franjas ocupadas
// (con el tipo de ocupación y, si es de un torneo, cuál) y las libres dentro del horario del club.
export const disponibilidadDelDia = async (disciplina, fecha, db = pool) => {
  const canchas = await listarCanchas(disciplina, db)
  const { rows } = await db.query(
    `select r.cancha_id as "canchaId", r.id as "reservaId", r.tipo, r.estado,
            to_char(r.hora_inicio, 'HH24:MI') as "horaInicio", to_char(r.hora_fin, 'HH24:MI') as "horaFin",
            p.id as "partidoId", t.nombre as torneo
       from reserva r
       left join partido p on p.reserva_id = r.id
       left join torneo t on t.id = p.torneo_id
      where r.cancha_id = any($1) and r.fecha = $2 and r.estado in ('PENDIENTE', 'CONFIRMADA')
      order by r.hora_inicio`,
    [canchas.map((c) => c.id), fecha],
  )

  return {
    fecha,
    horario: HORARIO,
    canchas: canchas.map((cancha) => {
      const ocupadas = rows
        .filter((r) => r.canchaId === cancha.id)
        .map(({ canchaId, ...ocupacion }) => ocupacion)
      return { id: cancha.id, nombre: cancha.nombre, ocupadas, libres: franjasLibres(ocupadas) }
    }),
  }
}