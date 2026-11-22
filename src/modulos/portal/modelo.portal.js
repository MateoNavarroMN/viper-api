import { pool } from '../../config/conexion.bd.js'
import { pareja } from '../calendario/modelo.calendario.js'
import { buscarSocioDeJugador } from '../socios/modelo.socios.js'
import { obtenerCuadro } from '../torneos/modelo.cuadro.torneos.js'

// Portal del Jugador (CU 6.4, solo lectura). Cada bloque del panel tiene su propia consulta para que el error de uno
// no tire abajo a los demás. Todas reciben el jugador de la sesión: nunca un id que venga por URL.

const EXTRACTO = 160

// Es socio mientras su socio esté ACTIVO (con la baja deja de ver lo que es solo para socios)
const esSocioActivo = async (jugadorId, db = pool) => (await buscarSocioDeJugador(jugadorId, db))?.estado === 'ACTIVO'

// ── Cartelera ─────────────────────────────────────────────────────────────────────────────────────────────────

const COLUMNAS_COMUNICADO = `id, titulo, alcance, fecha_publicacion as "fechaPublicacion"`
// Un comunicado SOLO_SOCIOS solo lo ve un socio activo
const VISIBLE = `estado = 'PUBLICADO' and (alcance = 'TODOS' or ($1::boolean and alcance = 'SOLO_SOCIOS'))`

// Los comunicados publicados que le corresponden, del más reciente al más viejo. En la lista va un extracto; el
// texto completo se pide aparte. Devuelve { comunicados, total }.
export const listarCartelera = async (jugadorId, limite, db = pool) => {
  const socio = await esSocioActivo(jugadorId, db)
  const { rows } = await db.query(
    `select ${COLUMNAS_COMUNICADO}, left(mensaje, ${EXTRACTO}) as extracto, char_length(mensaje) > ${EXTRACTO} as "hayMas"
       from comunicado where ${VISIBLE}
      order by fecha_publicacion desc, id
      limit $2`,
    [socio, limite]
  )
  const { rows: conteo } = await db.query(`select count(*)::int as total from comunicado where ${VISIBLE}`, [socio])
  return { comunicados: rows, total: conteo[0].total }
}

// Un comunicado con su texto completo, o null si no existe, no está publicado o no es para este jugador.
export const buscarEnCartelera = async (jugadorId, id, db = pool) => {
  const socio = await esSocioActivo(jugadorId, db)
  const { rows } = await db.query(
    `select ${COLUMNAS_COMUNICADO}, mensaje from comunicado where id = $2 and ${VISIBLE}`,
    [socio, id]
  )
  return rows[0] ?? null
}

// ── Próximos partidos ─────────────────────────────────────────────────────────────────────────────────────────

// Partidos programados del jugador (o de su pareja, en Pádel) que todavía no terminaron, del más próximo al más lejano.
// Un partido ya jugado o dado por W.O. no figura. `rival` es la persona o la pareja contraria.
export const proximosPartidos = async (jugadorId, db = pool) => {
  const { rows } = await db.query(
    `select p.id, t.id as "torneoId", t.nombre as torneo, t.disciplina, p.fase, p.instancia::text as instancia, z.nombre as zona,
            to_char(r.fecha, 'YYYY-MM-DD') as fecha, to_char(r.hora_inicio, 'HH24:MI') as "horaInicio", to_char(r.hora_fin, 'HH24:MI') as "horaFin",
            ca.nombre as cancha,
            ur.nombre as "rivalNombre", ur.apellido as "rivalApellido", urc.nombre as "rivalCompaneroNombre", urc.apellido as "rivalCompaneroApellido"
       from partido p
       join torneo t on t.id = p.torneo_id and t.estado = 'EN_CURSO'
       join inscripcion mi on mi.id in (p.local_inscripcion_id, p.visitante_inscripcion_id)
                          and mi.estado = 'ACTIVA' and $1 in (mi.titular_jugador_id, mi.companero_jugador_id)
       join reserva r on r.id = p.reserva_id and r.estado in ('PENDIENTE', 'CONFIRMADA')
       join cancha ca on ca.id = r.cancha_id
       left join zona z on z.id = p.zona_id
       left join inscripcion ri on ri.id = case when mi.id = p.local_inscripcion_id then p.visitante_inscripcion_id else p.local_inscripcion_id end
       left join jugador jr on jr.id = ri.titular_jugador_id
       left join usuario ur on ur.id = jr.usuario_id
       left join jugador jrc on jrc.id = ri.companero_jugador_id
       left join usuario urc on urc.id = jrc.usuario_id
      where p.estado = 'PROGRAMADO' and not p.es_bye
        and (r.fecha + r.hora_fin) at time zone 'America/Argentina/Cordoba' > now()
      order by r.fecha, r.hora_inicio, p.id
      limit 20`,
    [jugadorId]
  )
  return rows.map((p) => ({
    id: p.id,
    torneo: { id: p.torneoId, nombre: p.torneo, disciplina: p.disciplina },
    fase: p.fase,
    instancia: p.instancia,
    zona: p.zona,
    fecha: p.fecha,
    horaInicio: p.horaInicio,
    horaFin: p.horaFin,
    cancha: p.cancha,
    rival: p.rivalApellido ? pareja(p.rivalNombre, p.rivalApellido, p.rivalCompaneroNombre, p.rivalCompaneroApellido) : null,
  }))
}

// ── Torneos en curso ──────────────────────────────────────────────────────────────────────────────────────────

// Los torneos en curso en los que el jugador tiene una inscripción activa, cada uno con sus propios partidos (de zona y de
// eliminatoria) y la tabla de posiciones de SU zona. Reutiliza obtenerCuadro (M3) para no repetir el cálculo; de las demás
// zonas no devuelve nada.
export const torneosEnCurso = async (jugadorId, db = pool) => {
  const { rows } = await db.query(
    `select t.id as "torneoId", i.id as "inscripcionId"
       from inscripcion i join torneo t on t.id = i.torneo_id
      where i.estado = 'ACTIVA' and t.estado = 'EN_CURSO' and $1 in (i.titular_jugador_id, i.companero_jugador_id)
      order by t.nombre, t.id`,
    [jugadorId]
  )
  const torneos = []
  for (const { torneoId, inscripcionId } of rows) {
    const cuadro = await obtenerCuadro(torneoId)
    if (cuadro.resultado !== 'OK') continue
    const mio = (p) => p.local?.inscripcionId === inscripcionId || p.visitante?.inscripcionId === inscripcionId
    const deZona = cuadro.zonas.flatMap((z) => z.partidos.map((p) => ({ ...p, zona: z.nombre })))
    const deRonda = cuadro.rondas.flatMap((r) => r.partidos.map((p) => ({ ...p, zona: null })))
    const zona = cuadro.zonas.find((z) => z.posiciones.some((x) => x.participante?.inscripcionId === inscripcionId)) ?? null
    torneos.push({
      id: cuadro.torneo.id,
      nombre: cuadro.torneo.nombre,
      disciplina: cuadro.torneo.disciplina,
      formato: cuadro.torneo.formato,
      faseActual: cuadro.torneo.faseActual,
      miInscripcionId: inscripcionId,
      miZona: zona && { id: zona.id, nombre: zona.nombre, cerrada: zona.cerrada, posiciones: zona.posiciones },
      misPartidos: [...deZona, ...deRonda].filter((p) => mio(p) && !p.esBye),
    })
  }
  return torneos
}