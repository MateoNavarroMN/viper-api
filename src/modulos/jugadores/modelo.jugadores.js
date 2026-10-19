import { pool } from '../../config/conexion.bd.js'
import { categoriaDeJugador } from '../torneos/modelo.categorias.js'

const DISCIPLINAS = ['TENIS', 'PADEL']

// Jugador con la cuenta activa por DNI, con los datos mínimos para elegirlo de compañero.
// No trae correo ni teléfono. Devuelve null si no existe, está bloqueado o su cuenta no es de Jugador.
// `categorias` es la categoría en cada disciplina: la de su ranking o, si nunca jugó, la inicial.
export const buscarJugadorPorDni = async (dni, db = pool) => {
  const { rows } = await db.query(
    `select j.id, u.nombre, u.apellido
       from jugador j
       join usuario u on u.id = j.usuario_id
      where j.dni = $1 and u.estado = 'ACTIVO' and u.rol = 'JUGADOR'`,
    [dni]
  )
  const jugador = rows[0]
  if (!jugador) return null

  const categorias = {}
  for (const disciplina of DISCIPLINAS) {
    const categoria = await categoriaDeJugador(jugador.id, disciplina, db)
    categorias[disciplina] = categoria ? { id: categoria.id, nombre: categoria.nombre } : null
  }
  return { ...jugador, categorias }
}