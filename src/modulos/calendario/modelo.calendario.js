import { pool } from '../../config/conexion.bd.js'

// Calendario del club (Recepcionista, Organizador y Administrador): los torneos que se juegan en un período y los partidos
// que ya tienen cancha y horario en esas fechas.

// Torneos que se pisan con [desde, hasta]. `estados` son los que el rol puede ver.
export const torneosDelPeriodo = async (desde, hasta, estados, db = pool) => {
  const { rows } = await db.query(
    `select t.id, t.nombre, t.disciplina, c.nombre_categoria as categoria, t.estado,
            to_char(t.fecha_inicio, 'YYYY-MM-DD') as "fechaInicio", to_char(t.fecha_fin, 'YYYY-MM-DD') as "fechaFin"
       from torneo t
       join categoria_tecnica c on c.id = t.categoria_id
      where t.estado = any($3::estado_torneo[]) and t.fecha_inicio <= $2 and t.fecha_fin >= $1
      order by t.fecha_inicio, t.nombre`,
    [desde, hasta, estados]
  )
  return rows
}

const pareja = (nombre, apellido, companeroNombre, companeroApellido) =>
  companeroNombre ? `${apellido} / ${companeroApellido}` : `${nombre} ${apellido}`

// Partidos con reserva vigente de la cancha dentro del período, por fecha y hora
export const partidosDelPeriodo = async (desde, hasta, estados, db = pool) => {
  const { rows } = await db.query(
    `select p.id, p.estado, t.id as "torneoId", t.nombre as torneo, ca.nombre as cancha,
            to_char(r.fecha, 'YYYY-MM-DD') as fecha, to_char(r.hora_inicio, 'HH24:MI') as "horaInicio", to_char(r.hora_fin, 'HH24:MI') as "horaFin",
            ul.nombre as "localNombre", ul.apellido as "localApellido", ulc.nombre as "localCompaneroNombre", ulc.apellido as "localCompaneroApellido",
            uv.nombre as "visitanteNombre", uv.apellido as "visitanteApellido", uvc.nombre as "visitanteCompaneroNombre", uvc.apellido as "visitanteCompaneroApellido"
       from partido p
       join torneo t on t.id = p.torneo_id
       join reserva r on r.id = p.reserva_id and r.estado in ('PENDIENTE', 'CONFIRMADA')
       join cancha ca on ca.id = r.cancha_id
       left join inscripcion il on il.id = p.local_inscripcion_id
       left join jugador jl on jl.id = il.titular_jugador_id
       left join usuario ul on ul.id = jl.usuario_id
       left join jugador jlc on jlc.id = il.companero_jugador_id
       left join usuario ulc on ulc.id = jlc.usuario_id
       left join inscripcion iv on iv.id = p.visitante_inscripcion_id
       left join jugador jv on jv.id = iv.titular_jugador_id
       left join usuario uv on uv.id = jv.usuario_id
       left join jugador jvc on jvc.id = iv.companero_jugador_id
       left join usuario uvc on uvc.id = jvc.usuario_id
      where t.estado = any($3::estado_torneo[]) and r.fecha between $1 and $2
      order by r.fecha, r.hora_inicio, ca.nombre`,
    [desde, hasta, estados]
  )
  return rows.map((f) => ({
    id: f.id,
    estado: f.estado,
    torneoId: f.torneoId,
    torneo: f.torneo,
    cancha: f.cancha,
    fecha: f.fecha,
    horaInicio: f.horaInicio,
    horaFin: f.horaFin,
    local: f.localApellido ? pareja(f.localNombre, f.localApellido, f.localCompaneroNombre, f.localCompaneroApellido) : null,
    visitante: f.visitanteApellido ? pareja(f.visitanteNombre, f.visitanteApellido, f.visitanteCompaneroNombre, f.visitanteCompaneroApellido) : null,
  }))
}