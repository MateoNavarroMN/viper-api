import { pool } from '../../config/conexion.bd.js'
import { categoriaDeJugador, categoriasAdmitidas } from './modelo.categorias.js'
import { bloquearTorneo, buscarTorneoPorId } from './modelo.torneos.js'
import {
  anularInscripcionesVencidas,
  buscarInscripcionActivaDeJugador,
  contarInscripcionesActivas,
  crearInscripcion,
} from './modelo.inscripciones.js'

// Plazo para pagar una inscripción (Anexo D, punto 5): 48 h, sin pasar el inicio del torneo.
export const HORAS_PARA_PAGAR = 48
// Si el torneo empieza en menos de esto, igual se da este margen para pagar en recepción.
const HORAS_MINIMAS_PARA_PAGAR = 1

// Compañero de Pádel: tiene que ser un jugador con la cuenta ACTIVA. null si no existe o está bloqueado.
const buscarCompanero = async (jugadorId, db) => {
  const { rows } = await db.query(
    `select j.id from jugador j join usuario u on u.id = j.usuario_id
      where j.id = $1 and u.estado = 'ACTIVO' and u.rol = 'JUGADOR'`,
    [jugadorId]
  )
  return rows[0] ?? null
}

// Vencimiento: ahora + 48 h, pero no después del inicio del torneo (00:00 de fecha_inicio, en la zona de la base).
const calcularVencimiento = async (torneoId, db) => {
  const { rows } = await db.query(
    `select greatest(
              least(now() + make_interval(hours => $2), t.fecha_inicio::timestamptz),
              now() + make_interval(hours => $3)
            ) as "venceEn"
       from torneo t where t.id = $1`,
    [torneoId, HORAS_PARA_PAGAR, HORAS_MINIMAS_PARA_PAGAR]
  )
  return rows[0].venceEn
}

// Todo corre en una transacción con la fila del torneo bloqueada (SELECT ... FOR UPDATE):
// si dos jugadores se inscriben a la vez por el último cupo, el segundo espera y ya ve el cupo completo.
// Devuelve { resultado, ... }:
//   NO_ENCONTRADO · NO_ABIERTO (estado) · SIN_COMPANERO · CON_COMPANERO · COMPANERO_INVALIDO · CUPO_COMPLETO · YA_INSCRIPTO (quien: 'JUGADOR' | 'COMPANERO')
//   CATEGORIA_INCOMPATIBLE (quien, categoriaRequerida, categoriaJugador, categoriasAdmitidas) · OK (inscripcion, torneo)
export const inscribirEnTorneo = async ({ torneoId, jugadorId, companeroJugadorId = null }) => {
  const cliente = await pool.connect()
  const terminar = async (respuesta) => {
    await cliente.query(respuesta.resultado === 'OK' ? 'commit' : 'rollback')
    return respuesta
  }

  try {
    await cliente.query('begin')
    const bloqueado = await bloquearTorneo(torneoId, cliente)
    if (!bloqueado) return await terminar({ resultado: 'NO_ENCONTRADO' })
    if (bloqueado.estado !== 'INSCRIPCIONES_ABIERTAS') return await terminar({ resultado: 'NO_ABIERTO', estado: bloqueado.estado })

    // Las pendientes vencidas liberan su cupo antes de contar (M3-BE-06 usa la misma función)
    await anularInscripcionesVencidas(torneoId, cliente)
    const torneo = await buscarTorneoPorId(torneoId, cliente)

    // Pádel se juega en pareja; Tenis, individual
    if (torneo.disciplina === 'PADEL' && !companeroJugadorId) return await terminar({ resultado: 'SIN_COMPANERO' })
    if (torneo.disciplina === 'TENIS' && companeroJugadorId) return await terminar({ resultado: 'CON_COMPANERO' })
    if (companeroJugadorId && !(await buscarCompanero(companeroJugadorId, cliente))) {
      return await terminar({ resultado: 'COMPANERO_INVALIDO' })
    }

    if ((await contarInscripcionesActivas(torneoId, cliente)) >= torneo.cupoMaximo) {
      return await terminar({ resultado: 'CUPO_COMPLETO' })
    }

    // El jugador y, en Pádel, su compañero
    const integrantes = [{ quien: 'JUGADOR', id: jugadorId }]
    if (companeroJugadorId) integrantes.push({ quien: 'COMPANERO', id: companeroJugadorId })
    for (const { quien, id } of integrantes) {
      if (await buscarInscripcionActivaDeJugador(torneoId, id, cliente)) return await terminar({ resultado: 'YA_INSCRIPTO', quien })
    }

    // Categoría compatible con la del torneo: la misma en Tenis; en Pádel también una menos y una más, y se mira a cada integrante
    const admitidas = await categoriasAdmitidas(torneo.disciplina, torneo.categoriaId, cliente)
    for (const { quien, id } of integrantes) {
      const categoria = await categoriaDeJugador(id, torneo.disciplina, cliente)
      if (!admitidas.some((c) => c.id === categoria?.id)) {
        return await terminar({
          resultado: 'CATEGORIA_INCOMPATIBLE',
          quien,
          categoriaRequerida: torneo.categoria,
          categoriaJugador: categoria?.nombre ?? null,
          categoriasAdmitidas: admitidas.map((c) => c.nombre),
        })
      }
    }

    // ACTIVA, PENDIENTE y con vencimiento
    const venceEn = await calcularVencimiento(torneoId, cliente)
    const inscripcion = await crearInscripcion({ torneoId, titularJugadorId: jugadorId, companeroJugadorId, venceEn }, cliente)
    const actualizado = await buscarTorneoPorId(torneoId, cliente)
    return await terminar({ resultado: 'OK', inscripcion, torneo: actualizado })
  } catch (error) {
    await cliente.query('rollback')
    throw error
  } finally {
    cliente.release()
  }
}