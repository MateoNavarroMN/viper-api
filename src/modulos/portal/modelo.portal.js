import { pool } from '../../config/conexion.bd.js'
import { buscarSocioDeJugador } from '../socios/modelo.socios.js'

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