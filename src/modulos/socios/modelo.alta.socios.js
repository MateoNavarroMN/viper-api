import { pool } from '../../config/conexion.bd.js'
import { buscarSocioDeJugador, crearSocio, reactivarSocio } from './modelo.socios.js'
import { asignarCategoria } from '../ranking/modelo.ranking.js'
import { buscarCategoriaPorId } from '../torneos/modelo.categorias.js'

const DISCIPLINAS = ['TENIS', 'PADEL']

// Alta de un socio, o reactivación de uno dado de baja (CU 4.1 · pasos 8 a 11, 9a a 9c). Todo en una transacción:
// si falla la categoría de una disciplina no queda ningún socio a medias.
// `categorias` es { TENIS: <id de categoría>, PADEL: <id de categoría> }.
// Devuelve { resultado, ... }:
//  - 'JUGADOR_NO_ENCONTRADO' · 'YA_ES_SOCIO' · 'SOCIO_EN_BAJA' (con `socioId`: hay que confirmar la reactivación)
//  - 'CATEGORIA' (con `codigo` y `disciplina`): una categoría no se pudo asignar (ver `asignarCategoria`)
//  - 'CREADO' o 'REACTIVADO' (con `socio`, que incluye la categoría y los puntos de cada disciplina)
export const altaSocio = async ({ jugadorId, categorias, reactivar = false }) => {
  const cliente = await pool.connect()
  try {
    await cliente.query('begin')

    const { rows } = await cliente.query(
      `select j.id from jugador j join usuario u on u.id = j.usuario_id where j.id = $1 and u.rol = 'JUGADOR'`,
      [jugadorId]
    )
    if (rows.length === 0) {
      await cliente.query('rollback')
      return { resultado: 'JUGADOR_NO_ENCONTRADO' }
    }

    const existente = await buscarSocioDeJugador(jugadorId, cliente)
    if (existente?.estado === 'ACTIVO') {
      await cliente.query('rollback')
      return { resultado: 'YA_ES_SOCIO' }
    }
    if (existente && !reactivar) {
      await cliente.query('rollback')
      return { resultado: 'SOCIO_EN_BAJA', socioId: existente.id }
    }

    const socio = existente ? await reactivarSocio(existente.id, cliente) : await crearSocio(jugadorId, cliente)

    const detalle = {}
    for (const disciplina of DISCIPLINAS) {
      try {
        const asignada = await asignarCategoria(jugadorId, disciplina, categorias[disciplina], cliente)
        const categoria = await buscarCategoriaPorId(asignada.categoriaId, cliente)
        detalle[disciplina] = { id: categoria.id, nombre: categoria.nombre, puntos: asignada.puntosTotales }
      } catch (error) {
        if (!error.codigo) throw error
        await cliente.query('rollback')
        return { resultado: 'CATEGORIA', codigo: error.codigo, disciplina }
      }
    }

    await cliente.query('commit')
    return { resultado: existente ? 'REACTIVADO' : 'CREADO', socio: { ...socio, categorias: detalle } }
  } catch (error) {
    await cliente.query('rollback')
    throw error
  } finally {
    cliente.release()
  }
}