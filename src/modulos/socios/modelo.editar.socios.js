import { pool } from '../../config/conexion.bd.js'
import { asignarCategoria } from '../ranking/modelo.ranking.js'

const DISCIPLINAS = ['TENIS', 'PADEL']

// Edición de un socio (CU 4.1 · A1). Todo en una transacción: si una categoría no se puede aplicar no se modifica
// ninguno de los otros datos. Solo se cambia lo que viene en el pedido: `nombre`, `apellido` y `telefono` (el teléfono
// puede ser null para borrarlo) son datos de la cuenta del jugador; `categorias` es { TENIS?, PADEL? } con ids de categoría.
// Devuelve { resultado }: 'NO_ENCONTRADO', 'CATEGORIA' (con `codigo` y `disciplina`, ver `asignarCategoria`) u 'OK'.
export const editarSocio = async (id, { nombre, apellido, telefono, categorias = {} }) => {
  const cliente = await pool.connect()
  try {
    await cliente.query('begin')

    const { rows } = await cliente.query(
      'select s.jugador_id, j.usuario_id from socio s join jugador j on j.id = s.jugador_id where s.id = $1',
      [id]
    )
    if (rows.length === 0) {
      await cliente.query('rollback')
      return { resultado: 'NO_ENCONTRADO' }
    }
    const { jugador_id: jugadorId, usuario_id: usuarioId } = rows[0]

    await cliente.query(
      `update usuario
          set nombre = coalesce($2, nombre),
              apellido = coalesce($3, apellido),
              telefono = case when $5 then $4 else telefono end
        where id = $1`,
      [usuarioId, nombre ?? null, apellido ?? null, telefono ?? null, telefono !== undefined]
    )

    for (const disciplina of DISCIPLINAS) {
      if (!categorias[disciplina]) continue
      try {
        await asignarCategoria(jugadorId, disciplina, categorias[disciplina], cliente)
      } catch (error) {
        if (!error.codigo) throw error
        await cliente.query('rollback')
        return { resultado: 'CATEGORIA', codigo: error.codigo, disciplina }
      }
    }

    await cliente.query('commit')
    return { resultado: 'OK' }
  } catch (error) {
    await cliente.query('rollback')
    throw error
  } finally {
    cliente.release()
  }
}