import { pool } from '../../config/conexion.bd.js'

// Socios del club (CU 4.1 · RF-14). Cada función recibe como último parámetro opcional `db`: el pool o un cliente
// con una transacción abierta (el alta de un socio y sus categorías tienen que guardarse todo junto).

const COLUMNAS = 'id, jugador_id as "jugadorId", fecha_alta::text as "fechaAlta", estado'

export const buscarSocioPorId = async (id, db = pool) => {
  const { rows } = await db.query(`select ${COLUMNAS} from socio where id = $1`, [id])
  return rows[0] ?? null
}

// Un jugador tiene como máximo un socio (ACTIVO o BAJA).
export const buscarSocioDeJugador = async (jugadorId, db = pool) => {
  const { rows } = await db.query(`select ${COLUMNAS} from socio where jugador_id = $1`, [jugadorId])
  return rows[0] ?? null
}

// Alta: queda ACTIVO con la fecha de hoy en la zona horaria de la base (Córdoba).
export const crearSocio = async (jugadorId, db = pool) => {
  const { rows } = await db.query(
    `insert into socio (jugador_id) values ($1) returning ${COLUMNAS}`,
    [jugadorId]
  )
  return rows[0]
}

// Reactivación de un socio dado de baja: conserva su historial de cuotas.
// Devuelve null si el socio no existía o no estaba en BAJA.
export const reactivarSocio = async (id, db = pool) => {
  const { rows } = await db.query(
    `update socio set estado = 'ACTIVO' where id = $1 and estado = 'BAJA' returning ${COLUMNAS}`,
    [id]
  )
  return rows[0] ?? null
}

// Baja: devuelve null si el socio no existía o ya estaba dado de baja.
export const darDeBajaSocio = async (id, db = pool) => {
  const { rows } = await db.query(
    `update socio set estado = 'BAJA' where id = $1 and estado = 'ACTIVO' returning ${COLUMNAS}`,
    [id]
  )
  return rows[0] ?? null
}