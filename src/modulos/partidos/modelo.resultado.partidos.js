import { pool } from '../../config/conexion.bd.js'
import { otorgarPuntos } from '../ranking/modelo.ranking.js'
import { listarCanchas, listarOcupadas, reservarParaPartido } from '../reservas/modelo.reservas.js'
import { calcularPosiciones } from '../torneos/algoritmo.posiciones.torneos.js'
import { programar } from '../torneos/scheduler.torneos.js'
import { bloquearTorneo, cambiarEstadoTorneo } from '../torneos/modelo.torneos.js'
import { agendaDeJugadores } from './modelo.partidos.js'

// Registrar el resultado de un partido (CU 3.6 · pasos 5 a 9). Todo corre en una transacción con el torneo bloqueado:
// los sets, el ganador, la tabla de la zona o el avance en el cuadro, los puntos y el cierre del torneo se guardan
// juntos o no se guarda nada. Lo que no depende de la base (que el marcador sea válido) lo valida antes el controller.
//
// Puntos (reglas de `regla_puntuacion`, valores de ejemplo hasta confirmarlos con el club):
//   - Zona: el ganador de cada partido recibe VICTORIA_EN_ZONA. Al cerrarse la zona, los que clasifican reciben
//     CLASIFICADO_DE_ZONA y el resto PARTICIPACION.
//   - Eliminatoria: el que pierde recibe los puntos de la instancia en la que quedó (CUARTOS, SEMIFINAL…); el que gana
//     no suma todavía, porque va a recibir los de la instancia en la que quede. En la final, el que pierde recibe
//     FINAL y el que gana, CAMPEON.
// Todos los movimientos quedan atados al partido (`movimiento_puntos.partido_id`), así BE-19 puede revertirlos
// cuando se corrija el resultado.

// Datos de las inscripciones que juegan: quiénes son (titular y compañero) para mostrarlos y darles los puntos
const cargarParticipantes = async (inscripcionIds, db) => {
  if (inscripcionIds.length === 0) return new Map()
  const { rows } = await db.query(
    `select i.id, i.cabeza_de_serie as "cabezaDeSerie",
            i.titular_jugador_id as "titularId", ut.nombre as "titularNombre", ut.apellido as "titularApellido",
            i.companero_jugador_id as "companeroId", uc.nombre as "companeroNombre", uc.apellido as "companeroApellido"
       from inscripcion i
       join jugador jt on jt.id = i.titular_jugador_id
       join usuario ut on ut.id = jt.usuario_id
       left join jugador jc on jc.id = i.companero_jugador_id
       left join usuario uc on uc.id = jc.usuario_id
      where i.id = any($1)`,
    [inscripcionIds]
  )
  return new Map(rows.map((r) => [r.id, {
    inscripcionId: r.id,
    cabezaDeSerie: r.cabezaDeSerie,
    titular: { id: r.titularId, nombre: r.titularNombre, apellido: r.titularApellido },
    companero: r.companeroId ? { id: r.companeroId, nombre: r.companeroNombre, apellido: r.companeroApellido } : null,
  }]))
}

const jugadoresDe = (participante) => [participante.titular.id, participante.companero?.id].filter(Boolean)

// Programa el partido siguiente cuando ya tiene a los dos rivales y todavía no tiene cancha ni horario (CU 3.5).
// Busca la primera franja libre desde que terminó el partido que lo alimenta. Si no hay lugar no es un error: el
// partido queda sin programar y se resuelve a mano. Devuelve la programación o null.
const programarSiguiente = async (siguiente, desdeFranja, torneo, jugadores, db) => {
  const canchas = await listarCanchas(torneo.disciplina, db)
  if (canchas.length === 0) return null
  const desde = desdeFranja.fecha > torneo.fechaInicio ? desdeFranja.fecha : torneo.fechaInicio
  if (desde > torneo.fechaFin) return null

  const ocupadas = await listarOcupadas(canchas.map((c) => c.id), desde, torneo.fechaFin, db)
  const agenda = await agendaDeJugadores(jugadores, siguiente.id, desde, torneo.fechaFin, db)
  const agendaPrevia = {}
  for (const { jugadorId, ...franja } of agenda) (agendaPrevia[jugadorId] ??= []).push(franja)

  const { asignados } = programar(
    [{ id: siguiente.id, ronda: 1, participantes: jugadores, noAntesDe: { fecha: desdeFranja.fecha, hora: desdeFranja.hora } }],
    { canchas, ocupadas, agendaPrevia, desde, hasta: torneo.fechaFin },
  )
  if (asignados.length === 0) return null
  const franja = asignados[0]
  const { resultado } = await reservarParaPartido(siguiente.id, franja, db)
  if (resultado !== 'OK') return null
  return { fecha: franja.fecha, horaInicio: franja.horaInicio, horaFin: franja.horaFin, canchaId: franja.canchaId }
}

// Recalcula la tabla de la zona con todos sus partidos y la guarda en `posicion_zona`.
// Devuelve la tabla de calcularPosiciones.
const actualizarTablaDeZona = async (zonaId, clasifican, db) => {
  const { rows: partidos } = await db.query(
    `select p.id, p.local_inscripcion_id as "localId", p.visitante_inscripcion_id as "visitanteId",
            p.ganador_inscripcion_id as "ganadorId", p.estado,
            coalesce((select jsonb_agg(jsonb_build_object('local', s.games_local, 'visitante', s.games_visitante) order by s.numero)
                        from set_partido s where s.partido_id = p.id), '[]'::jsonb) as sets
       from partido p
      where p.zona_id = $1`,
    [zonaId]
  )
  const { rows: inscritos } = await db.query('select inscripcion_id as id from posicion_zona where zona_id = $1', [zonaId])
  const tabla = calcularPosiciones(partidos, { clasifican, participantes: inscritos.map((i) => i.id) })

  await db.query(
    `update posicion_zona pz
        set posicion = x.posicion, partidos_ganados = x."partidosGanados", partidos_perdidos = x."partidosPerdidos",
            sets_ganados = x."setsGanados", sets_perdidos = x."setsPerdidos",
            games_ganados = x."gamesGanados", games_perdidos = x."gamesPerdidos", clasificado = x.clasificado
       from jsonb_to_recordset($2::jsonb) as x("inscripcionId" uuid, posicion int, "partidosGanados" int, "partidosPerdidos" int,
            "setsGanados" int, "setsPerdidos" int, "gamesGanados" int, "gamesPerdidos" int, clasificado boolean)
      where pz.zona_id = $1 and pz.inscripcion_id = x."inscripcionId"`,
    [zonaId, JSON.stringify(tabla.posiciones)]
  )
  return tabla
}

// POST resultado. `sets` ya es un marcador válido y `ganador` es 'LOCAL' o 'VISITANTE' (lo dijo validarMarcador).
// Devuelve { resultado: 'NO_ENCONTRADO' | 'NO_ADMITE' | 'OK', ... }. Con 'OK': partido, puntosOtorgados, zona
// (la tabla actualizada, solo en un partido de zona), todasLasZonasCerradas (null si el torneo no tiene zonas),
// siguiente (adónde avanzó el ganador, en la eliminatoria) y torneoFinalizado.
export const registrarResultado = async (partidoId, sets, ganador) => {
  const cliente = await pool.connect()
  try {
    await cliente.query('begin')
    const terminar = async (datos) => {
      await cliente.query('rollback')
      return datos
    }

    // Se bloquea el torneo antes que el partido: dos resultados de una misma zona se calculan uno detrás del otro
    const { rows: referencia } = await cliente.query('select torneo_id as "torneoId" from partido where id = $1', [partidoId])
    if (!referencia[0]) return await terminar({ resultado: 'NO_ENCONTRADO' })
    await bloquearTorneo(referencia[0].torneoId, cliente)

    const { rows } = await cliente.query(
      `select p.id, p.estado, p.fase, p.zona_id as "zonaId", p.instancia, p.es_bye as "esBye",
              p.local_inscripcion_id as "localId", p.visitante_inscripcion_id as "visitanteId",
              p.partido_siguiente_id as "siguienteId", p.ranura_en_siguiente as ranura, p.reserva_id as "reservaId",
              t.id as "torneoId", t.disciplina, t.estado as "estadoTorneo", t.clasifican_por_zona as "clasificanPorZona",
              to_char(t.fecha_inicio, 'YYYY-MM-DD') as "fechaInicio", to_char(t.fecha_fin, 'YYYY-MM-DD') as "fechaFin"
         from partido p join torneo t on t.id = p.torneo_id
        where p.id = $1
        for update of p`,
      [partidoId]
    )
    const partido = rows[0]
    if (partido.estadoTorneo !== 'EN_CURSO' || partido.esBye || partido.estado !== 'PROGRAMADO' || !partido.localId || !partido.visitanteId) {
      return await terminar({ resultado: 'NO_ADMITE' })
    }

    const ganadorId = ganador === 'LOCAL' ? partido.localId : partido.visitanteId
    const perdedorId = ganador === 'LOCAL' ? partido.visitanteId : partido.localId

    // Sets y ganador
    await cliente.query('delete from set_partido where partido_id = $1', [partidoId])
    await cliente.query(
      `insert into set_partido (partido_id, numero, games_local, games_visitante)
       select $1, x.numero, x.local, x.visitante from jsonb_to_recordset($2::jsonb) as x(numero int, local int, visitante int)`,
      [partidoId, JSON.stringify(sets.map((s, i) => ({ numero: i + 1, local: s.local, visitante: s.visitante })))]
    )
    await cliente.query("update partido set estado = 'FINALIZADO', ganador_inscripcion_id = $2 where id = $1", [partidoId, ganadorId])

    const participantes = await cargarParticipantes([partido.localId, partido.visitanteId], cliente)
    const puntosOtorgados = []
    const dar = async (instancia, inscripcionIds) => {
      const jugadorIds = inscripcionIds.flatMap((id) => jugadoresDe(participantes.get(id)))
      const otorgados = await otorgarPuntos({ partidoId, disciplina: partido.disciplina, instancia, jugadorIds }, cliente)
      puntosOtorgados.push(...otorgados.map((o) => ({ ...o, instancia })))
    }

    let zona = null
    let siguiente = null
    let torneoFinalizado = false

    if (partido.fase === 'ZONA') {
      await dar('VICTORIA_EN_ZONA', [ganadorId])

      const tabla = await actualizarTablaDeZona(partido.zonaId, partido.clasificanPorZona ?? 2, cliente)
      const deLaZona = await cargarParticipantes(tabla.posiciones.map((p) => p.inscripcionId), cliente)
      for (const [id, participante] of deLaZona) participantes.set(id, participante)

      // La zona se cierra cuando terminaron todos sus partidos y no queda un empate por resolver a mano
      const cerrada = tabla.completa && !tabla.empateSinResolver
      if (cerrada) {
        await cliente.query('update zona set cerrada = true where id = $1', [partido.zonaId])
        await dar('CLASIFICADO_DE_ZONA', tabla.posiciones.filter((p) => p.clasificado).map((p) => p.inscripcionId))
        await dar('PARTICIPACION', tabla.posiciones.filter((p) => !p.clasificado).map((p) => p.inscripcionId))
      }

      const { rows: nombre } = await cliente.query('select nombre from zona where id = $1', [partido.zonaId])
      zona = {
        id: partido.zonaId,
        nombre: nombre[0].nombre,
        cerrada,
        completa: tabla.completa,
        empateSinResolver: tabla.empateSinResolver,
        empates: tabla.empates,
        posiciones: tabla.posiciones.map(({ inscripcionId, ...datos }) => ({ ...datos, participante: deLaZona.get(inscripcionId) })),
      }
    } else {
      const esFinal = partido.instancia === 'FINAL'
      await dar(partido.instancia, [perdedorId])
      if (esFinal) await dar('CAMPEON', [ganadorId])

      if (partido.siguienteId) {
        const columna = partido.ranura === 'LOCAL' ? 'local_inscripcion_id' : 'visitante_inscripcion_id'
        const { rows: proximo } = await cliente.query(
          `update partido set ${columna} = $2 where id = $1
           returning id, instancia, local_inscripcion_id as "localId", visitante_inscripcion_id as "visitanteId", reserva_id as "reservaId"`,
          [partido.siguienteId, ganadorId]
        )
        const s = proximo[0]
        siguiente = { partidoId: s.id, instancia: s.instancia, ranura: partido.ranura, rivalesDefinidos: Boolean(s.localId && s.visitanteId), programacion: null }
        if (siguiente.rivalesDefinidos && !s.reservaId) {
          // Desde que terminó el partido que acaba de resolverse (su franja), o desde el inicio del torneo si no tenía
          const { rows: franja } = await cliente.query(
            `select to_char(fecha, 'YYYY-MM-DD') as fecha, to_char(hora_fin, 'HH24:MI') as hora from reserva where id = $1`,
            [partido.reservaId]
          )
          const desdeFranja = franja[0] ?? { fecha: partido.fechaInicio, hora: '08:00' }
          const rivales = await cargarParticipantes([s.localId, s.visitanteId], cliente)
          const jugadores = [...rivales.values()].flatMap(jugadoresDe)
          siguiente.programacion = await programarSiguiente(s, desdeFranja, partido, jugadores, cliente)
        }
      }

      if (esFinal && !partido.siguienteId) {
        await cambiarEstadoTorneo(partido.torneoId, 'FINALIZADO', undefined, cliente)
        torneoFinalizado = true
      }
    }

    const { rows: estadoZonas } = await cliente.query(
      'select count(*)::int as total, count(*) filter (where cerrada)::int as cerradas from zona where torneo_id = $1',
      [partido.torneoId]
    )
    const todasLasZonasCerradas = estadoZonas[0].total === 0 ? null : estadoZonas[0].total === estadoZonas[0].cerradas

    // Los nombres de quienes recibieron puntos, para mostrarlos en el resumen
    const idsConPuntos = [...new Set(puntosOtorgados.map((p) => p.jugadorId))]
    const { rows: nombres } = idsConPuntos.length === 0 ? { rows: [] } : await cliente.query(
      `select j.id, u.nombre, u.apellido from jugador j join usuario u on u.id = j.usuario_id where j.id = any($1)`,
      [idsConPuntos]
    )
    const personas = new Map(nombres.map((n) => [n.id, n]))

    await cliente.query('commit')
    return {
      resultado: 'OK',
      partido: {
        id: partidoId,
        estado: 'FINALIZADO',
        ganadorInscripcionId: ganadorId,
        ganador,
        sets,
      },
      puntosOtorgados: puntosOtorgados.map((p) => ({
        jugador: { id: p.jugadorId, nombre: personas.get(p.jugadorId).nombre, apellido: personas.get(p.jugadorId).apellido },
        instancia: p.instancia,
        puntos: p.puntos,
        puntosTotales: p.puntosTotales,
        cambioCategoria: p.cambioCategoria,
      })),
      zona,
      todasLasZonasCerradas,
      siguiente,
      torneoFinalizado,
    }
  } catch (error) {
    await cliente.query('rollback').catch(() => {})
    throw error
  } finally {
    cliente.release()
  }
}