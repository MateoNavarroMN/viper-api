import { pool } from '../../config/conexion.bd.js'
import { obtenerCuadro } from './modelo.cuadro.torneos.js'
import { bloquearTorneo, buscarTorneoPorId, cambiarEstadoTorneo } from './modelo.torneos.js'

// Resumen y archivo de un torneo finalizado (CU 3.8).

// GET resumen. Sirve para revisar el torneo antes de archivarlo y para consultarlo después, ya archivado.
// Devuelve { resultado: 'NO_ENCONTRADO' | 'NO_FINALIZADO' (estado) | 'OK', ... }. Con 'OK':
//   torneo, campeon y finalista (participantes, null si el torneo terminó sin final jugada), estadisticas, cuadro
//   ({ zonas, rondas }, el mismo de GET cuadro), resultados (los partidos que se jugaron o terminaron por W.O.) y
//   puntos (los que quedaron vigentes por partidos de este torneo, por jugador).
export const obtenerResumen = async (torneoId) => {
  const torneo = await buscarTorneoPorId(torneoId)
  if (!torneo) return { resultado: 'NO_ENCONTRADO' }
  if (torneo.estado !== 'FINALIZADO' && torneo.estado !== 'ARCHIVADO') return { resultado: 'NO_FINALIZADO', estado: torneo.estado }

  const cuadro = await obtenerCuadro(torneoId)
  const zonas = cuadro.resultado === 'OK' ? cuadro.zonas : []
  const rondas = cuadro.resultado === 'OK' ? cuadro.rondas : []

  const final = rondas.flatMap((r) => r.partidos).find((p) => p.instancia === 'FINAL' && !p.siguiente)
  const idDe = (participante) => participante?.inscripcionId
  const campeon = final?.ganadorInscripcionId
    ? [final.local, final.visitante].find((p) => idDe(p) === final.ganadorInscripcionId) ?? null
    : null
  const finalista = campeon ? [final.local, final.visitante].find((p) => p && idDe(p) !== idDe(campeon)) ?? null : null

  // Los partidos que se resolvieron (los byes no se juegan), zonas primero y después la eliminatoria
  const resueltos = (partidos, zona) => partidos
    .filter((p) => !p.esBye && (p.estado === 'FINALIZADO' || p.estado === 'WO'))
    .map((p) => ({
      partidoId: p.id,
      fase: zona ? 'ZONA' : 'ELIMINATORIA',
      zona: zona?.nombre ?? null,
      ronda: p.ronda,
      instancia: p.instancia,
      estado: p.estado,
      local: p.local,
      visitante: p.visitante,
      ganadorInscripcionId: p.ganadorInscripcionId,
      sets: p.sets,
      wo: p.wo,
    }))
  const resultados = [
    ...zonas.flatMap((z) => resueltos(z.partidos, z)),
    ...rondas.flatMap((r) => resueltos(r.partidos, null)),
  ]

  const { rows: movimientos } = await pool.query(
    `select j.id as "jugadorId", u.nombre, u.apellido, g.instancia, m.puntos
       from movimiento_puntos m
       join partido p on p.id = m.partido_id
       join regla_puntuacion g on g.id = m.regla_id
       join ranking_disciplina rd on rd.id = m.ranking_id
       join jugador j on j.id = rd.jugador_id
       join usuario u on u.id = j.usuario_id
      where p.torneo_id = $1 and not m.revertido`,
    [torneoId]
  )
  const porJugador = new Map()
  for (const m of movimientos) {
    if (!porJugador.has(m.jugadorId)) {
      porJugador.set(m.jugadorId, { jugador: { id: m.jugadorId, nombre: m.nombre, apellido: m.apellido }, puntos: 0, detalle: [] })
    }
    const fila = porJugador.get(m.jugadorId)
    fila.puntos += m.puntos
    fila.detalle.push({ instancia: m.instancia, puntos: m.puntos })
  }
  const jugadores = [...porJugador.values()].sort((a, b) => b.puntos - a.puntos || a.jugador.apellido.localeCompare(b.jugador.apellido))

  return {
    resultado: 'OK',
    torneo,
    campeon,
    finalista,
    estadisticas: {
      partidosJugados: resultados.filter((r) => r.estado === 'FINALIZADO').length,
      partidosPorWO: resultados.filter((r) => r.estado === 'WO').length,
    },
    cuadro: { zonas, rondas },
    resultados,
    puntos: { total: jugadores.reduce((suma, j) => suma + j.puntos, 0), jugadores },
  }
}

// POST archivar. Solo un torneo FINALIZADO pasa a ARCHIVADO, y no hay vuelta atrás.
// Devuelve { resultado: 'NO_ENCONTRADO' | 'YA_ARCHIVADO' (5b) | 'NO_FINALIZADO' (5a, estado) | 'OK', torneo? }.
export const archivarTorneo = async (torneoId) => {
  const cliente = await pool.connect()
  try {
    await cliente.query('begin')
    const terminar = async (datos) => {
      await cliente.query('rollback')
      return datos
    }
    const bloqueado = await bloquearTorneo(torneoId, cliente)
    if (!bloqueado) return await terminar({ resultado: 'NO_ENCONTRADO' })
    if (bloqueado.estado === 'ARCHIVADO') return await terminar({ resultado: 'YA_ARCHIVADO' })
    if (bloqueado.estado !== 'FINALIZADO') return await terminar({ resultado: 'NO_FINALIZADO', estado: bloqueado.estado })

    await cambiarEstadoTorneo(torneoId, 'ARCHIVADO', undefined, cliente)
    const torneo = await buscarTorneoPorId(torneoId, cliente)
    await cliente.query('commit')
    return { resultado: 'OK', torneo }
  } catch (error) {
    await cliente.query('rollback')
    throw error
  } finally {
    cliente.release()
  }
}
