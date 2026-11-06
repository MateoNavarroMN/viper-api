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

// Búsqueda del personal (CU 4.1 · pasos 4 a 6; también la usan el turno directo y el alquiler fijo): por DNI exacto o por
// correo que empiece con lo escrito, sin distinguir mayúsculas. Solo cuentas con rol JUGADOR. Nunca devuelve el hash de
// la contraseña. `socio` es null si no es socio, o { id, estado } si lo es (ACTIVO o BAJA).
export const buscarJugadoresParaPersonal = async (texto, db = pool) => {
  // Los comodines de LIKE escritos por el usuario se toman como texto literal
  const prefijoCorreo = texto.toLowerCase().replace(/[\\%_]/g, '\\$&') + '%'
  const { rows } = await db.query(
    `select j.id, u.nombre, u.apellido, j.dni, u.email, u.telefono,
            case when s.id is null then null else json_build_object('id', s.id, 'estado', s.estado) end as socio
       from jugador j
       join usuario u on u.id = j.usuario_id
       left join socio s on s.jugador_id = j.id
      where u.rol = 'JUGADOR' and (j.dni = $1 or u.email like $2)
      order by u.apellido, u.nombre
      limit 20`,
    [texto, prefijoCorreo]
  )
  return rows
}