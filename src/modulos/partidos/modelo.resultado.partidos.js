import { pool } from '../../config/conexion.bd.js'
import { otorgarPuntos, revertirMovimientos, revertirMovimientosPorInstancia } from '../ranking/modelo.ranking.js'
import { cancelarReserva, listarCanchas, listarOcupadas, reservarParaPartido } from '../reservas/modelo.reservas.js'
import { calcularPosiciones } from '../torneos/algoritmo.posiciones.torneos.js'
import { programar } from '../torneos/scheduler.torneos.js'
import { jugadoresDeInscripciones } from '../torneos/modelo.inscripciones.js'
import { bloquearTorneo, cambiarEstadoTorneo } from '../torneos/modelo.torneos.js'
import { agendaDeJugadores } from './modelo.partidos.js'

// Registrar (CU 3.6 · pasos 5 a 9) y corregir (flujo alternativo 6a) el resultado de un partido. Todo corre en una
// transacción con el torneo bloqueado: los sets, el ganador, la tabla de la zona o el avance en el cuadro, los puntos
// y el cierre del torneo se guardan juntos o no se guarda nada. Lo que no depende de la base (que el marcador sea válido) lo valida antes el controller.
//
// Puntos (reglas de `regla_puntuacion`, valores de ejemplo hasta confirmarlos con el club):
// Los puntos se dan partido a partido, según se gane o se pierda, sin esperar a que el jugador quede eliminado:
//   - Zona: el que gana recibe VICTORIA_EN_ZONA y el que pierde, PARTICIPACION. Al cerrarse la zona, los que clasifican
//     reciben además CLASIFICADO_DE_ZONA.
//   - Eliminatoria: el que gana recibe los puntos de la instancia que acaba de ganar (CUARTOS, SEMIFINAL…) y el que
//     pierde, PARTICIPACION. Quien gana la final recibe además CAMPEON.
// Todos los movimientos quedan atados al partido (`movimiento_puntos.partido_id`), así se pueden revertir cuando se
// corrige el resultado (CU 3.6 · 6a).

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

// Carga el partido con su torneo y el estado del partido siguiente, bloqueando la fila del partido
const cargarPartido = async (cliente, partidoId) => {
  const { rows } = await cliente.query(
    `select p.id, p.estado, p.fase, p.zona_id as "zonaId", p.instancia, p.es_bye as "esBye",
            p.local_inscripcion_id as "localId", p.visitante_inscripcion_id as "visitanteId",
            p.ganador_inscripcion_id as "ganadorId",
            p.partido_siguiente_id as "siguienteId", p.ranura_en_siguiente as ranura, p.reserva_id as "reservaId",
            s.estado as "estadoSiguiente",
            t.id as "torneoId", t.disciplina, t.estado as "estadoTorneo", t.clasifican_por_zona as "clasificanPorZona",
            to_char(t.fecha_inicio, 'YYYY-MM-DD') as "fechaInicio", to_char(t.fecha_fin, 'YYYY-MM-DD') as "fechaFin"
       from partido p
       join torneo t on t.id = p.torneo_id
       left join partido s on s.id = p.partido_siguiente_id
      where p.id = $1
      for update of p`,
    [partidoId]
  )
  return rows[0]
}

// Abre la transacción, bloquea el torneo (antes que el partido: dos resultados de una misma zona se calculan uno
// detrás del otro) y corre `trabajo(cliente, partido)`. Si devuelve algo distinto de 'OK' deshace todo.
const enTransaccion = async (partidoId, trabajo) => {
  const cliente = await pool.connect()
  try {
    await cliente.query('begin')
    const terminar = async (datos) => {
      await cliente.query('rollback')
      return datos
    }

    const { rows: referencia } = await cliente.query('select torneo_id as "torneoId" from partido where id = $1', [partidoId])
    if (!referencia[0]) return await terminar({ resultado: 'NO_ENCONTRADO' })
    await bloquearTorneo(referencia[0].torneoId, cliente)

    const datos = await trabajo(cliente, await cargarPartido(cliente, partidoId))
    if (datos.resultado !== 'OK') return await terminar(datos)
    await cliente.query('commit')
    return datos
  } catch (error) {
    await cliente.query('rollback').catch(() => {})
    throw error
  } finally {
    cliente.release()
  }
}

// Pone al ganador en su lugar del partido siguiente y, si ya tiene a los dos rivales, lo programa en la primera franja
// libre (CU 3.5). Devuelve `siguiente` ({ partidoId, instancia, ranura, rivalesDefinidos, programacion }).
// `partido` trae el partido que se resolvió (su franja marca desde cuándo programar) y los datos del torneo.
const avanzarGanador = async (cliente, partido, ganadorId, efectos) => {
  // Si es una corrección y cambió el ganador, el nuevo ocupa el lugar del anterior (con la misma cancha y horario)
  const columna = partido.ranura === 'LOCAL' ? 'local_inscripcion_id' : 'visitante_inscripcion_id'
  const { rows: proximo } = await cliente.query(
    `update partido set ${columna} = $2 where id = $1
     returning id, instancia, local_inscripcion_id as "localId", visitante_inscripcion_id as "visitanteId", reserva_id as "reservaId"`,
    [partido.siguienteId, ganadorId]
  )
  const s = proximo[0]
  const siguiente = { partidoId: s.id, instancia: s.instancia, ranura: partido.ranura, rivalesDefinidos: Boolean(s.localId && s.visitanteId), programacion: null }
  if (siguiente.rivalesDefinidos && !s.reservaId) {
    // Desde que terminó el partido que acaba de resolverse (su franja), o desde el inicio del torneo si no tenía
    const { rows: franja } = partido.reservaId
      ? await cliente.query(`select to_char(fecha, 'YYYY-MM-DD') as fecha, to_char(hora_fin, 'HH24:MI') as hora from reserva where id = $1`, [partido.reservaId])
      : { rows: [] }
    const desdeFranja = franja[0] ?? { fecha: partido.fechaInicio, hora: '08:00' }
    const rivales = await cargarParticipantes([s.localId, s.visitanteId], cliente)
    const jugadores = [...rivales.values()].flatMap(jugadoresDe)
    siguiente.programacion = await programarSiguiente(s, desdeFranja, partido, jugadores, cliente)
  }
  // Si el otro lado del partido siguiente nunca va a tener rival (doble baja), el ganador sigue de largo
  await resolverSinRival(cliente, partido.siguienteId, partido, efectos)
  return siguiente
}

// Un partido cuyo rival de un lado terminó en doble baja nunca va a tener a ese rival. Cuando ya no puede llegar nadie más
// por ese lado, el partido se da por W.O. («Avanza por baja»): el único rival que quedó sigue de largo, y si no quedó
// ninguno el partido también queda sin ganador y el vacío pasa al siguiente. Sin puntos, porque no se jugó. Si era la final,
// el torneo termina. `torneo` trae los datos del torneo (disciplina, fechas, estado) para programar lo que siga.
const resolverSinRival = async (cliente, partidoId, torneo, efectos) => {
  const { rows: alimentan } = await cliente.query(
    'select estado, ganador_inscripcion_id as "ganadorId" from partido where partido_siguiente_id = $1',
    [partidoId]
  )
  const muertos = alimentan.filter((a) => a.estado === 'WO' && !a.ganadorId).length
  if (muertos === 0) return

  const { rows } = await cliente.query(
    `select id, estado, instancia, local_inscripcion_id as "localId", visitante_inscripcion_id as "visitanteId",
            partido_siguiente_id as "siguienteId", ranura_en_siguiente as ranura, reserva_id as "reservaId"
       from partido where id = $1 for update`,
    [partidoId]
  )
  const s = rows[0]
  if (s.estado === 'FINALIZADO' || s.estado === 'WO') return
  const rivales = [s.localId, s.visitanteId].filter(Boolean)
  if (rivales.length + muertos < alimentan.length) return // todavía puede llegar alguien por el otro lado

  const ganadorId = rivales[0] ?? null
  if (s.reservaId) await cancelarReserva(s.reservaId, cliente)
  await cliente.query("update partido set estado = 'WO', ganador_inscripcion_id = $2, motivo_wo = 'AVANCE_POR_BAJA' where id = $1", [s.id, ganadorId])
  efectos.encadenados.push({ partidoId: s.id, instancia: s.instancia, ganadorInscripcionId: ganadorId })

  const actual = { ...torneo, id: s.id, instancia: s.instancia, siguienteId: s.siguienteId, ranura: s.ranura, reservaId: s.reservaId }
  if (s.siguienteId) {
    if (ganadorId) await avanzarGanador(cliente, actual, ganadorId, efectos)
    else await resolverSinRival(cliente, s.siguienteId, actual, efectos)
  } else if (torneo.estadoTorneo === 'EN_CURSO') {
    await cambiarEstadoTorneo(torneo.torneoId, 'FINALIZADO', undefined, cliente)
    efectos.torneoFinalizado = true
  }
}

// Lo que se desprende de que un partido quedó resuelto, con ganador o sin él (doble baja): los puntos, la tabla de la
// zona o el avance en el cuadro y el cierre del torneo. Lo comparten el resultado (jugado) y el W.O. (no jugado).
//   ganadorId / perdedorId: inscripciones (ganadorId null en una doble baja)
//   puntosAlPerdedor: el que perdió jugando suma PARTICIPACION; el que faltó no suma nada
const resolverPartido = async (cliente, partido, { ganadorId, perdedorId, puntosAlPerdedor, corrigiendo = false }) => {
  const partidoId = partido.id
  const participantes = await cargarParticipantes([partido.localId, partido.visitanteId], cliente)
  const puntosOtorgados = []
  const dar = async (instancia, inscripcionIds) => {
    const jugadorIds = inscripcionIds.flatMap((id) => jugadoresDe(participantes.get(id)))
    const otorgados = await otorgarPuntos({ partidoId, disciplina: partido.disciplina, instancia, jugadorIds }, cliente)
    puntosOtorgados.push(...otorgados.map((o) => ({ ...o, instancia })))
  }
  const efectos = { encadenados: [], torneoFinalizado: false }

  let zona = null
  let siguiente = null

  if (partido.fase === 'ZONA') {
    if (ganadorId) await dar('VICTORIA_EN_ZONA', [ganadorId])
    if (ganadorId && puntosAlPerdedor) await dar('PARTICIPACION', [perdedorId])

    const tabla = await actualizarTablaDeZona(partido.zonaId, partido.clasificanPorZona ?? 2, cliente)
    const deLaZona = await cargarParticipantes(tabla.posiciones.map((p) => p.inscripcionId), cliente)
    for (const [id, participante] of deLaZona) participantes.set(id, participante)

    // La zona se cierra cuando terminaron todos sus partidos y no queda un empate por resolver a mano
    const cerrada = tabla.completa && !tabla.empateSinResolver
    if (cerrada) {
      await cliente.query('update zona set cerrada = true where id = $1', [partido.zonaId])
      await dar('CLASIFICADO_DE_ZONA', tabla.posiciones.filter((p) => p.clasificado).map((p) => p.inscripcionId))
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
    if (ganadorId) {
      await dar(partido.instancia, [ganadorId])
      if (puntosAlPerdedor) await dar('PARTICIPACION', [perdedorId])
      if (esFinal) await dar('CAMPEON', [ganadorId])
    }

    if (partido.siguienteId) {
      if (ganadorId) siguiente = await avanzarGanador(cliente, partido, ganadorId, efectos)
      else await resolverSinRival(cliente, partido.siguienteId, partido, efectos)
    }

    if (esFinal && !partido.siguienteId) {
      // Al corregir la final el torneo ya estaba FINALIZADO y sigue así
      if (!corrigiendo) await cambiarEstadoTorneo(partido.torneoId, 'FINALIZADO', undefined, cliente)
      efectos.torneoFinalizado = true
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

  return {
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
    encadenados: efectos.encadenados,
    torneoFinalizado: efectos.torneoFinalizado,
  }
}

// Guarda el resultado y todo lo que se desprende de él (sets, ganador, tabla de la zona o avance en el cuadro, puntos y
// cierre del torneo). Sirve para cargarlo por primera vez y para corregirlo: en una corrección, antes se revirtió lo
// que había, así que acá se calcula todo de nuevo como si fuera la primera vez. `sets` ya es un marcador válido y
// `ganador` es 'LOCAL' o 'VISITANTE'. Devuelve el cuerpo de la respuesta (sin `resultado`).
const aplicarResultado = async (cliente, partido, sets, ganador, { corrigiendo = false } = {}) => {
  const partidoId = partido.id
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

  const resto = await resolverPartido(cliente, partido, { ganadorId, perdedorId, puntosAlPerdedor: true, corrigiendo })
  return {
    partido: { id: partidoId, estado: 'FINALIZADO', ganadorInscripcionId: ganadorId, ganador, sets },
    ...resto,
  }
}

// POST resultado. `sets` ya es un marcador válido y `ganador` es 'LOCAL' o 'VISITANTE' (lo dijo validarMarcador).
// Devuelve { resultado: 'NO_ENCONTRADO' | 'NO_ADMITE' | 'OK', ... }. Con 'OK': partido, puntosOtorgados, zona
// (la tabla actualizada, solo en un partido de zona), todasLasZonasCerradas (null si el torneo no tiene zonas),
// siguiente (adónde avanzó el ganador, en la eliminatoria) y torneoFinalizado.
export const registrarResultado = (partidoId, sets, ganador) =>
  enTransaccion(partidoId, async (cliente, partido) => {
    if (partido.estadoTorneo !== 'EN_CURSO' || partido.esBye || partido.estado !== 'PROGRAMADO' || !partido.localId || !partido.visitanteId) {
      return { resultado: 'NO_ADMITE' }
    }
    return { resultado: 'OK', ...(await aplicarResultado(cliente, partido, sets, ganador)) }
  })

// Por qué no se puede corregir el resultado de un partido (null si se puede). CU 3.6 · flujo alternativo 6a.
const motivoDeRechazo = async (partido, cliente) => {
  if (partido.esBye) return 'es un partido libre (bye)'
  if (partido.estado === 'WO') return 'el partido terminó por W.O.'
  if (partido.estado !== 'FINALIZADO') return 'el partido todavía no tiene resultado'

  // Un torneo finalizado solo admite corregir la final: el campeón puede cambiar, pero el torneo sigue finalizado
  const esFinal = partido.fase === 'ELIMINATORIA' && partido.instancia === 'FINAL' && !partido.siguienteId
  if (partido.estadoTorneo === 'FINALIZADO' && !esFinal) return 'el torneo ya finalizó y solo se puede corregir la final'
  if (partido.estadoTorneo !== 'EN_CURSO' && partido.estadoTorneo !== 'FINALIZADO') return 'el torneo no está en curso'

  if (partido.fase === 'ZONA') {
    const { rowCount } = await cliente.query("select 1 from partido where torneo_id = $1 and fase = 'ELIMINATORIA' limit 1", [partido.torneoId])
    if (rowCount > 0) return 'ya se generó la fase eliminatoria'
  } else if (partido.estadoSiguiente === 'FINALIZADO' || partido.estadoSiguiente === 'WO') {
    return 'el ganador ya jugó su partido siguiente'
  }
  return null
}

// Categoría técnica de cada jugador en la disciplina (para avisar quién cambió de categoría con la corrección)
const categoriasDe = async (jugadorIds, disciplina, cliente) => {
  const { rows } = await cliente.query(
    `select r.jugador_id as "jugadorId", c.id as "categoriaId", c.nombre_categoria as categoria, u.nombre, u.apellido
       from ranking_disciplina r
       join categoria_tecnica c on c.id = r.categoria_id
       join jugador j on j.id = r.jugador_id
       join usuario u on u.id = j.usuario_id
      where r.disciplina = $1 and r.jugador_id = any($2)`,
    [disciplina, jugadorIds]
  )
  return new Map(rows.map((r) => [r.jugadorId, r]))
}

// PUT resultado. Corrige el resultado de un partido ya jugado: revierte los puntos que dio, vuelve a calcular todo con
// el marcador nuevo y, si cambió el ganador de un partido eliminatorio, lo reemplaza en el siguiente.
// Devuelve { resultado: 'NO_ENCONTRADO' | 'NO_ADMITE' | 'OK', ... }. 'NO_ADMITE' trae `motivo`. Con 'OK' trae lo mismo
// que registrarResultado más `cambioGanador`, `anterior` ({ ganadorInscripcionId, sets }) y `cambiosDeCategoria`.
export const corregirResultado = (partidoId, sets, ganador) =>
  enTransaccion(partidoId, async (cliente, partido) => {
    const motivo = await motivoDeRechazo(partido, cliente)
    if (motivo) return { resultado: 'NO_ADMITE', motivo }

    const { rows: setsAnteriores } = await cliente.query(
      'select games_local as local, games_visitante as visitante from set_partido where partido_id = $1 order by numero',
      [partidoId]
    )
    const anterior = { ganadorInscripcionId: partido.ganadorId, sets: setsAnteriores }
    const ganadorNuevoId = ganador === 'LOCAL' ? partido.localId : partido.visitanteId

    // Jugadores que pueden cambiar de puntos: los dos rivales y, en una zona, todos los de la zona
    let inscripcionIds = [partido.localId, partido.visitanteId]
    if (partido.fase === 'ZONA') {
      const { rows } = await cliente.query('select inscripcion_id as id from posicion_zona where zona_id = $1', [partido.zonaId])
      inscripcionIds = rows.map((r) => r.id)
    }
    const jugadorIds = await jugadoresDeInscripciones(inscripcionIds, cliente)
    const categoriasAntes = await categoriasDe(jugadorIds, partido.disciplina, cliente)

    // Se deshace lo que dio el resultado anterior: los puntos de este partido y, en una zona, también los de clasificación,
    // que se otorgaron con el último partido de la zona pero dependen de todos. Los de victoria y participación de los
    // demás partidos de la zona no se tocan. Los movimientos quedan revertidos, no borrados.
    await revertirMovimientos(partidoId, cliente)
    if (partido.fase === 'ZONA') {
      const { rows: deLaZona } = await cliente.query('select id from partido where zona_id = $1', [partido.zonaId])
      await revertirMovimientosPorInstancia(deLaZona.map((p) => p.id), ['CLASIFICADO_DE_ZONA'], cliente)
      await cliente.query('update zona set cerrada = false where id = $1', [partido.zonaId])
    }

    const respuesta = await aplicarResultado(cliente, partido, sets, ganador, { corrigiendo: true })

    // Quién cambió de categoría respecto de antes de la corrección (no solo respecto de después de revertir)
    const categoriasDespues = await categoriasDe(jugadorIds, partido.disciplina, cliente)
    const cambiosDeCategoria = jugadorIds
      .filter((id) => categoriasAntes.get(id) && categoriasAntes.get(id).categoriaId !== categoriasDespues.get(id)?.categoriaId)
      .map((id) => ({
        jugador: { id, nombre: categoriasDespues.get(id).nombre, apellido: categoriasDespues.get(id).apellido },
        categoriaAnterior: categoriasAntes.get(id).categoria,
        categoriaNueva: categoriasDespues.get(id).categoria,
      }))
    const cambiaron = new Set(cambiosDeCategoria.map((c) => c.jugador.id))

    return {
      resultado: 'OK',
      ...respuesta,
      puntosOtorgados: respuesta.puntosOtorgados.map((p) => ({ ...p, cambioCategoria: cambiaron.has(p.jugador.id) })),
      cambioGanador: anterior.ganadorInscripcionId !== ganadorNuevoId,
      anterior,
      cambiosDeCategoria,
    }
  })

// POST wo. Registra la baja de una pareja o jugador (CU 3.7): el partido queda en W.O. sin jugarse.
//   ausente: 'LOCAL' | 'VISITANTE' | 'AMBOS'. El que no falta gana por W.O.; con AMBOS (doble baja) no hay ganador.
//   motivo:  texto que se guarda en `partido.motivo_wo`: 'RETIRO' o 'RETIRO: se lesionó' si hay detalle.
// Puntos: el que gana recibe los de victoria de siempre (zona: VICTORIA_EN_ZONA; eliminatoria: los de la instancia) y el
// que faltó no recibe nada. Una zona cuenta el W.O. como 6-0 6-0 en la tabla; en una doble baja no suma a nadie. En la
// eliminatoria el ganador avanza y, con doble baja, el rival del partido siguiente avanza por W.O. Se cancela la reserva
// del partido, que libera la cancha.
// Devuelve { resultado: 'NO_ENCONTRADO' | 'YA_RESUELTO' | 'NO_ADMITE' | 'OK', ... }. Con 'OK': partido (con `ausente`, `motivo`
// y `detalle`), puntosOtorgados, zona, todasLasZonasCerradas, siguiente, encadenados (los partidos siguientes que se
// resolvieron solos por la baja) y torneoFinalizado.
export const registrarWO = (partidoId, { ausente, motivo, detalle = null }) =>
  enTransaccion(partidoId, async (cliente, partido) => {
    if (partido.estado === 'FINALIZADO' || partido.estado === 'WO') return { resultado: 'YA_RESUELTO' }
    if (partido.estadoTorneo !== 'EN_CURSO' || partido.esBye || !partido.localId || !partido.visitanteId) return { resultado: 'NO_ADMITE' }

    const ganador = ausente === 'AMBOS' ? null : ausente === 'LOCAL' ? 'VISITANTE' : 'LOCAL'
    const ganadorId = ganador === 'LOCAL' ? partido.localId : ganador === 'VISITANTE' ? partido.visitanteId : null
    const perdedorId = ganador === 'LOCAL' ? partido.visitanteId : ganador === 'VISITANTE' ? partido.localId : null

    // La franja se libera antes de resolver: el partido siguiente se programa desde donde terminaba esta
    if (partido.reservaId) await cancelarReserva(partido.reservaId, cliente)
    await cliente.query("update partido set estado = 'WO', ganador_inscripcion_id = $2, motivo_wo = $3 where id = $1", [
      partidoId, ganadorId, detalle ? `${motivo}: ${detalle}` : motivo,
    ])

    const resto = await resolverPartido(cliente, partido, { ganadorId, perdedorId, puntosAlPerdedor: false })
    return {
      resultado: 'OK',
      partido: { id: partidoId, estado: 'WO', ganadorInscripcionId: ganadorId, ganador, ausente, motivo, detalle },
      ...resto,
    }
  })