// Tabla de posiciones de una zona (CU 3.6 · paso 8, CU 3.9 · 3a). Función pura: no toca la base; recibe los partidos
// de la zona ya leídos y devuelve la tabla, así M3-BE-18 (al cargar un resultado), M3-BE-20 (W.O.) y M3-BE-21
// (armar la eliminatoria) la calculan siempre igual y después guardan el resultado en `posicion_zona`.
//
// partidosDeZona: [{ localId, visitanteId, ganadorId, estado, sets }]
//   - ids de inscripción. `estado`: 'PENDIENTE' | 'PROGRAMADO' | 'FINALIZADO' | 'WO'.
//   - sets: [{ local, visitante }] con los games de cada set (un super tie-break, 10-7, cuenta como 1 game).
//   - Un partido 'WO' con ganador cuenta como 6-0 6-0 para el ganador; un 'WO' sin ganador (doble baja) no suma a nadie.
//   - Los partidos que no están FINALIZADOS ni en WO no suman; sirven para saber si la zona está completa.
// opciones:
//   - participantes: ids de la zona. Si no vienen, salen de los partidos.
//   - clasifican: cuántos pasan a la eliminatoria (por defecto 2).
//   - criterios: orden de los desempates (por defecto CRITERIOS_POR_DEFECTO).
//   - ordenManual: ids de inscripción en el orden que eligió el Organizador. Solo se usa para desempatar a quienes
//     seguían empatados después de todos los criterios, y solo si el grupo empatado está completo en la lista.
//
// Devuelve:
//   { posiciones: [{ inscripcionId, posicion, partidosJugados, partidosGanados, partidosPerdidos,
//                    setsGanados, setsPerdidos, gamesGanados, gamesPerdidos, empatado, clasificado }],
//     completa, empates: [{ posicion, inscripcionIds, clasificatorio }], empateSinResolver }
//   - Los que siguen empatados comparten posición (1, 2, 2, 4) y vienen con `empatado: true`.
//   - `completa`: todos los partidos de la zona terminaron (jugados o W.O.).
//   - `clasificado`: la zona está completa y toda su posición (o el grupo empatado entero) cae entre los que clasifican.
//   - `empates`: grupos sin resolver; `clasificatorio` si el empate toca una posición de las que clasifican.
//   - `empateSinResolver`: la zona está completa y queda un empate clasificatorio: hay que resolverlo a mano (3a).

export const CRITERIOS_POR_DEFECTO = ['PARTIDOS_GANADOS', 'ENTRE_SI', 'DIFERENCIA_SETS', 'DIFERENCIA_GAMES']

// Ningún set común pasa de 7 games: con 10 o más es un super tie-break
const esSuperTiebreak = (s) => Math.max(s.local, s.visitante) >= 10

// Resultado de un partido desde el punto de vista del local, o null si no suma a la tabla
const resultadoDe = (partido) => {
  if (partido.estado === 'WO') {
    if (!partido.ganadorId) return null
    return { ganadorId: partido.ganadorId, setsGanador: 2, setsPerdedor: 0, gamesGanador: 12, gamesPerdedor: 0 }
  }
  if (partido.estado !== 'FINALIZADO') return null

  const sets = partido.sets ?? []
  let setsLocal = 0
  let setsVisitante = 0
  let gamesLocal = 0
  let gamesVisitante = 0
  for (const s of sets) {
    const [l, v] = esSuperTiebreak(s) ? [Number(s.local > s.visitante), Number(s.visitante > s.local)] : [s.local, s.visitante]
    if (s.local > s.visitante) setsLocal++
    else if (s.visitante > s.local) setsVisitante++
    gamesLocal += l
    gamesVisitante += v
  }
  const ganadorId = partido.ganadorId ?? (setsLocal > setsVisitante ? partido.localId : setsVisitante > setsLocal ? partido.visitanteId : null)
  if (!ganadorId) throw new Error('Un partido finalizado necesita ganador o sets')

  const ganaLocal = ganadorId === partido.localId
  return {
    ganadorId,
    setsGanador: ganaLocal ? setsLocal : setsVisitante,
    setsPerdedor: ganaLocal ? setsVisitante : setsLocal,
    gamesGanador: ganaLocal ? gamesLocal : gamesVisitante,
    gamesPerdedor: ganaLocal ? gamesVisitante : gamesLocal,
  }
}

export function calcularPosiciones(partidosDeZona, opciones = {}) {
  const { clasifican = 2, criterios = CRITERIOS_POR_DEFECTO, ordenManual = null } = opciones
  const desconocido = criterios.find((c) => !CRITERIOS_POR_DEFECTO.includes(c))
  if (desconocido) throw new Error(`Criterio de desempate desconocido: ${desconocido}`)

  const participantes = opciones.participantes ?? [...new Set(partidosDeZona.flatMap((p) => [p.localId, p.visitanteId]))]
  const tabla = new Map(participantes.map((id) => [id, {
    inscripcionId: id,
    partidosJugados: 0,
    partidosGanados: 0,
    partidosPerdidos: 0,
    setsGanados: 0,
    setsPerdidos: 0,
    gamesGanados: 0,
    gamesPerdidos: 0,
  }]))

  // Partidos que cuentan, para el desempate «resultado entre sí»
  const jugados = []
  for (const partido of partidosDeZona) {
    const local = tabla.get(partido.localId)
    const visitante = tabla.get(partido.visitanteId)
    if (!local || !visitante) throw new Error('Un partido es de alguien que no está en la zona')
    const r = resultadoDe(partido)
    if (!r) continue

    const ganador = r.ganadorId === partido.localId ? local : visitante
    const perdedor = ganador === local ? visitante : local
    ganador.partidosJugados++
    perdedor.partidosJugados++
    ganador.partidosGanados++
    perdedor.partidosPerdidos++
    ganador.setsGanados += r.setsGanador
    ganador.setsPerdidos += r.setsPerdedor
    perdedor.setsGanados += r.setsPerdedor
    perdedor.setsPerdidos += r.setsGanador
    ganador.gamesGanados += r.gamesGanador
    ganador.gamesPerdidos += r.gamesPerdedor
    perdedor.gamesGanados += r.gamesPerdedor
    perdedor.gamesPerdidos += r.gamesGanador
    jugados.push({ ganadorId: ganador.inscripcionId, perdedorId: perdedor.inscripcionId })
  }

  // Valor de cada criterio: más es mejor
  const valorDe = {
    PARTIDOS_GANADOS: (id) => tabla.get(id).partidosGanados,
    DIFERENCIA_SETS: (id) => tabla.get(id).setsGanados - tabla.get(id).setsPerdidos,
    DIFERENCIA_GAMES: (id) => tabla.get(id).gamesGanados - tabla.get(id).gamesPerdidos,
    // Solo se aplica a un empate de dos: 1 para el que ganó el partido entre ellos, 0 para el otro
    ENTRE_SI: (id, grupo) => (jugados.some((j) => j.ganadorId === id && grupo.includes(j.perdedorId)) ? 1 : 0),
  }

  // Ordena un grupo de empatados y devuelve la lista de grupos que siguen empatados, del mejor al peor.
  // Cuando un criterio separa al grupo, cada parte vuelve a empezar con todos los criterios (un empate de tres
  // que se reduce a dos puede resolverse por el resultado entre sí).
  const ordenar = (grupo) => {
    if (grupo.length < 2) return [grupo]
    for (const criterio of criterios) {
      if (criterio === 'ENTRE_SI' && grupo.length !== 2) continue
      const valores = grupo.map((id) => valorDe[criterio](id, grupo))
      if (valores.every((v) => v === valores[0])) continue
      const distintos = [...new Set(valores)].sort((a, b) => b - a)
      return distintos.flatMap((v) => ordenar(grupo.filter((_, i) => valores[i] === v)))
    }
    if (ordenManual && grupo.every((id) => ordenManual.includes(id))) {
      return [...grupo].sort((a, b) => ordenManual.indexOf(a) - ordenManual.indexOf(b)).map((id) => [id])
    }
    return [grupo]
  }

  const completa = partidosDeZona.length > 0 && partidosDeZona.every((p) => p.estado === 'FINALIZADO' || p.estado === 'WO')

  const posiciones = []
  const empates = []
  for (const grupo of ordenar([...participantes])) {
    const desde = posiciones.length
    if (grupo.length > 1) empates.push({ posicion: desde + 1, inscripcionIds: grupo, clasificatorio: desde < clasifican })
    for (const id of grupo) {
      posiciones.push({
        ...tabla.get(id),
        posicion: desde + 1,
        empatado: grupo.length > 1,
        clasificado: completa && desde + grupo.length <= clasifican,
      })
    }
  }

  return { posiciones, completa, empates, empateSinResolver: completa && empates.some((e) => e.clasificatorio) }
}