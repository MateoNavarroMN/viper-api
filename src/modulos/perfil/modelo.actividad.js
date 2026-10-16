import { pool } from '../../../config/conexion.bd.js'

// Últimas inscripciones a torneos de un jugador, ya sea como titular o como compañero (Pádel).
// Las más recientes primero; incluye las ANULADAS para que se vea el historial.
// Las fechas se piden como texto ('2026-10-14') para evitar corrimientos por zona horaria.
export const listarInscripcionesDeJugador = async (jugadorId, limite = 10, db = pool) => {
  const { rows } = await db.query(
    `select i.id, i.fecha_inscripcion::text as "fechaInscripcion", i.estado,
            i.estado_pago as "estadoPago", i.vence_en as "venceEn",
            (i.titular_jugador_id = $1) as "esTitular",
            t.id as "torneoId", t.nombre as "torneoNombre", t.disciplina,
            t.estado as "torneoEstado", t.fecha_inicio::text as "fechaInicio", t.fecha_fin::text as "fechaFin",
            ct.nombre_categoria as categoria,
            pu.nombre as "parejaNombre", pu.apellido as "parejaApellido"
       from inscripcion i
       join torneo t on t.id = i.torneo_id
       join categoria_tecnica ct on ct.id = t.categoria_id
       left join jugador pj on pj.id = case when i.titular_jugador_id = $1
                                            then i.companero_jugador_id
                                            else i.titular_jugador_id end
       left join usuario pu on pu.id = pj.usuario_id
      where i.titular_jugador_id = $1 or i.companero_jugador_id = $1
      order by i.fecha_inscripcion desc, t.fecha_inicio desc, i.id
      limit $2`,
    [jugadorId, limite]
  )

  return rows.map((fila) => ({
    id: fila.id,
    fechaInscripcion: fila.fechaInscripcion,
    estado: fila.estado,
    estadoPago: fila.estadoPago,
    venceEn: fila.venceEn,
    esTitular: fila.esTitular,
    torneo: {
      id: fila.torneoId,
      nombre: fila.torneoNombre,
      disciplina: fila.disciplina,
      estado: fila.torneoEstado,
      categoria: fila.categoria,
      fechaInicio: fila.fechaInicio,
      fechaFin: fila.fechaFin,
    },
    // La otra persona de la pareja (Pádel); null en Tenis o si se inscribió sin compañero
    pareja: fila.parejaNombre ? { nombre: fila.parejaNombre, apellido: fila.parejaApellido } : null,
  }))
}