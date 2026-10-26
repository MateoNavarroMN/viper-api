import { randomUUID } from 'node:crypto'
import { pool } from '../../config/conexion.bd.js'
import { agendaDeJugadores } from '../partidos/modelo.partidos.js'
import { cancelarReservasDelTorneo, listarCanchas, listarOcupadas, reservarParaPartido } from '../reservas/modelo.reservas.js'
import { generarEliminacion } from './algoritmo.eliminacion.torneos.js'
import { generarZonas } from './algoritmo.zonas.torneos.js'
import { limitesCabezasDeSerie, listarPagadas } from './modelo.cabezas.torneos.js'
import { anularInscripcionesVencidas } from './modelo.inscripciones.js'
import { bloquearTorneo, buscarTorneoPorId, cambiarEstadoTorneo } from './modelo.torneos.js'
import { programar } from './scheduler.torneos.js'

// Generar, consultar y regenerar el cuadro de un torneo (CU 3.4). Une las piezas de M3-BE-08 a M3-BE-13:
// cabezas de serie, algoritmos de eliminación y de zonas, scheduler y reservas de cancha.
// Las funciones que escriben corren en una transacción con el torneo bloqueado: si algo falla no queda nada a medias.

// La tabla `partido` solo tiene instancias hasta DIECISEISAVOS: un cuadro de eliminación directa llega a 32 lugares
const MAXIMO_ELIMINACION = 128

// Pagadas y pendientes de un torneo (las pendientes quedan fuera del cuadro)
const contarPendientes = async (torneoId, db) => {
  const { rows } = await db.query(
    "select count(*)::int as n from inscripcion where torneo_id = $1 and estado = 'ACTIVA' and estado_pago = 'PENDIENTE'",
    [torneoId]
  )
  return rows[0].n
}

// Motivo por el que todavía no se puede generar, o null. `pagadas` y `cabezas` salen de listarPagadas.
const motivoDeBloqueo = (torneo, pagadas, cabezas) => {
  const { minimoInscriptos, maximoPermitido } = limitesCabezasDeSerie(torneo.formato, pagadas)
  if (pagadas < minimoInscriptos) return { resultado: 'INSUFICIENTES', pagadas, minimoInscriptos }
  if (torneo.formato === 'ELIMINACION_DIRECTA' && pagadas > MAXIMO_ELIMINACION) {
    return { resultado: 'CUADRO_MUY_GRANDE', pagadas, maximoParticipantes: MAXIMO_ELIMINACION }
  }
  if (cabezas > maximoPermitido) return { resultado: 'DEMASIADAS_CABEZAS', cabezas, maximoPermitido }
  return null
}

// GET preview: lo que el organizador ve antes de confirmar la generación (paso 1 del CU 3.4).
// Devuelve { resultado: 'NO_ENCONTRADO' | 'ESTADO_INVALIDO' | 'OK', ... }.
export const previewCuadro = async (torneoId) => {
  const torneo = await buscarTorneoPorId(torneoId)
  if (!torneo) return { resultado: 'NO_ENCONTRADO' }
  if (torneo.estado !== 'INSCRIPCIONES_CERRADAS') return { resultado: 'ESTADO_INVALIDO', estado: torneo.estado }

  const filas = await listarPagadas(torneoId, pool)
  const cabezas = filas.filter((f) => f.cabezaDeSerie).length
  const bloqueo = motivoDeBloqueo(torneo, filas.length, cabezas)
  return {
    resultado: 'OK',
    torneo: { id: torneo.id, nombre: torneo.nombre, formato: torneo.formato, disciplina: torneo.disciplina, estado: torneo.estado },
    pagadas: filas.length,
    pendientes: await contarPendientes(torneoId, pool),
    cabezasDeSerie: cabezas,
    minimoInscriptos: limitesCabezasDeSerie(torneo.formato, filas.length).minimoInscriptos,
    puedeGenerar: !bloqueo,
    bloqueo,
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Generar

// Arma las filas de `zona`, `posicion_zona` y `partido` de un torneo con zonas (fase ZONA)
const armarZonas = (participantes) => {
  const { zonas } = generarZonas(participantes)
  const filasZonas = []
  const filasPosiciones = []
  const filasPartidos = []
  for (const zona of zonas) {
    const zonaId = randomUUID()
    filasZonas.push({ id: zonaId, nombre: zona.nombre })
    for (const inscripcionId of zona.participantes) filasPosiciones.push({ zonaId, inscripcionId })
    for (const p of zona.partidos) {
      filasPartidos.push({
        id: randomUUID(), zonaId, fase: 'ZONA', ronda: p.ronda, posicion: p.posicion, instancia: null,
        esBye: false, local: p.local, visitante: p.visitante, ganador: null, siguienteId: null, ranura: null,
        zonaNombre: zona.nombre, dependeDe: [],
      })
    }
  }
  return { filasZonas, filasPosiciones, filasPartidos }
}

// Arma las filas de `partido` de un cuadro de eliminación directa. Los partidos de la primera ronda con bye ya
// quedan FINALIZADOS con su ganador, y el ganador ya está colocado en la segunda ronda (lo hace el algoritmo).
const armarEliminacion = (participantes) => {
  const { rondas } = generarEliminacion(participantes)
  const ids = new Map(rondas.flatMap((r) => r.partidos.map((p) => [`${p.ronda}-${p.posicion}`, randomUUID()])))
  const filasPartidos = rondas.flatMap((r) => r.partidos.map((p) => ({
    id: ids.get(`${p.ronda}-${p.posicion}`), zonaId: null, fase: 'ELIMINATORIA', ronda: p.ronda, posicion: p.posicion,
    instancia: p.instancia, esBye: p.esBye, local: p.local, visitante: p.visitante, ganador: p.ganador,
    siguienteId: p.siguiente ? ids.get(`${p.siguiente.ronda}-${p.siguiente.posicion}`) : null,
    ranura: p.siguiente?.ranura ?? null, zonaNombre: null, dependeDe: [],
  })))
  // Un partido espera a los que desembocan en él (salvo los byes, que no se juegan)
  const porId = new Map(filasPartidos.map((f) => [f.id, f]))
  for (const f of filasPartidos) {
    if (f.siguienteId && !f.esBye) porId.get(f.siguienteId).dependeDe.push(f.id)
  }
  return { filasZonas: [], filasPosiciones: [], filasPartidos }
}

const insertarFilas = async ({ filasZonas, filasPosiciones, filasPartidos }, torneoId, db) => {
  if (filasZonas.length > 0) {
    await db.query(
      `insert into zona (id, torneo_id, nombre)
       select x.id, $1, x.nombre from jsonb_to_recordset($2::jsonb) as x(id uuid, nombre text)`,
      [torneoId, JSON.stringify(filasZonas)]
    )
    await db.query(
      `insert into posicion_zona (zona_id, inscripcion_id)
       select x."zonaId", x."inscripcionId" from jsonb_to_recordset($1::jsonb) as x("zonaId" uuid, "inscripcionId" uuid)`,
      [JSON.stringify(filasPosiciones)]
    )
  }
  // Una sola sentencia: las referencias entre partidos (partido_siguiente_id) se verifican al terminarla
  await db.query(
    `insert into partido (id, torneo_id, zona_id, fase, ronda, posicion, instancia, estado, es_bye,
                          local_inscripcion_id, visitante_inscripcion_id, ganador_inscripcion_id,
                          partido_siguiente_id, ranura_en_siguiente)
     select x.id, $1, x."zonaId", x.fase::fase_partido, x.ronda, x.posicion, x.instancia::instancia_partido,
            case when x."esBye" then 'FINALIZADO' else 'PENDIENTE' end::estado_partido, x."esBye",
            x.local, x.visitante, x.ganador, x."siguienteId", x.ranura::ranura_partido
       from jsonb_to_recordset($2::jsonb) as x(id uuid, "zonaId" uuid, fase text, ronda int, posicion int, instancia text,
            "esBye" boolean, local uuid, visitante uuid, ganador uuid, "siguienteId" uuid, ranura text)`,
    [torneoId, JSON.stringify(filasPartidos)]
  )
}

// Programa los partidos que se juegan con el scheduler y crea las reservas de cancha (paso 5 del CU 3.4).
// Devuelve los partidos que no tuvieron lugar dentro del período del torneo (flujo 5a).
const programarPartidos = async (torneo, filasPartidos, jugadoresDe, cliente) => {
  const jugables = filasPartidos.filter((f) => !f.esBye)
  const canchas = await listarCanchas(torneo.disciplina, cliente)
  const todosLosJugadores = [...new Set([...jugadoresDe.values()].flat())]

  const ordenados = [...jugables].sort((a, b) => a.ronda - b.ronda || (a.zonaNombre ?? '').localeCompare(b.zonaNombre ?? '') || a.posicion - b.posicion)
  const partidos = ordenados.map((f, i) => ({
    id: f.id,
    ronda: f.ronda,
    posicion: i + 1,
    participantes: [...new Set([f.local, f.visitante].filter(Boolean).flatMap((insc) => jugadoresDe.get(insc)))],
    dependeDe: f.dependeDe,
  }))

  const agenda = await agendaDeJugadores(todosLosJugadores, null, torneo.fechaInicio, torneo.fechaFin, cliente)
  const agendaPrevia = {}
  for (const { jugadorId, ...franja } of agenda) (agendaPrevia[jugadorId] ??= []).push(franja)

  const { asignados, sinAsignar } = programar(partidos, {
    canchas,
    ocupadas: await listarOcupadas(canchas.map((c) => c.id), torneo.fechaInicio, torneo.fechaFin, cliente),
    agendaPrevia,
    desde: torneo.fechaInicio,
    hasta: torneo.fechaFin,
  })

  const sinProgramar = new Set(sinAsignar.map((s) => s.partidoId))
  for (const a of asignados) {
    const { resultado } = await reservarParaPartido(a.partidoId, a, cliente)
    if (resultado !== 'OK') sinProgramar.add(a.partidoId)
  }
  return filasPartidos
    .filter((f) => sinProgramar.has(f.id))
    .map((f) => ({ id: f.id, ronda: f.ronda, posicion: f.posicion, zona: f.zonaNombre, instancia: f.instancia }))
}

// POST generar-cuadro. Solo en INSCRIPCIONES_CERRADAS y con inscriptos suficientes. Persiste zonas, posiciones y
// partidos, programa con el scheduler, crea las reservas y pasa el torneo a EN_CURSO con su fase.
// Devuelve { resultado: 'NO_ENCONTRADO' | 'ESTADO_INVALIDO' | 'INSUFICIENTES' | 'CUADRO_MUY_GRANDE' |
//   'DEMASIADAS_CABEZAS' | 'OK', ... } (con 'OK': torneo, partidos, partidosSinProgramar).
export const generarCuadro = async (torneoId) => {
  const cliente = await pool.connect()
  try {
    await cliente.query('begin')
    const terminar = async (datos) => {
      await cliente.query('rollback')
      return datos
    }
    if (!(await bloquearTorneo(torneoId, cliente))) return await terminar({ resultado: 'NO_ENCONTRADO' })
    const torneo = await buscarTorneoPorId(torneoId, cliente)
    if (torneo.estado !== 'INSCRIPCIONES_CERRADAS') return await terminar({ resultado: 'ESTADO_INVALIDO', estado: torneo.estado })

    // Una pendiente con el plazo vencido no puede quedar adentro: se anula antes de tomar las pagadas
    await anularInscripcionesVencidas(torneoId, cliente)
    const filas = await listarPagadas(torneoId, cliente)
    const bloqueo = motivoDeBloqueo(torneo, filas.length, filas.filter((f) => f.cabezaDeSerie).length)
    if (bloqueo) return await terminar(bloqueo)

    const participantes = filas.map((f) => ({ id: f.id, cabezaDeSerie: f.cabezaDeSerie }))
    const armado = torneo.formato === 'ZONAS_Y_ELIMINACION' ? armarZonas(participantes) : armarEliminacion(participantes)
    await insertarFilas(armado, torneoId, cliente)

    const jugadoresDe = new Map(filas.map((f) => [f.id, [f.titularJugadorId, f.companeroJugadorId].filter(Boolean)]))
    const partidosSinProgramar = await programarPartidos(torneo, armado.filasPartidos, jugadoresDe, cliente)

    const fase = torneo.formato === 'ZONAS_Y_ELIMINACION' ? 'ZONAS' : 'ELIMINATORIA'
    await cambiarEstadoTorneo(torneoId, 'EN_CURSO', fase, cliente)
    const actualizado = await buscarTorneoPorId(torneoId, cliente)
    await cliente.query('commit')
    return {
      resultado: 'OK',
      torneo: actualizado,
      partidos: armado.filasPartidos.filter((f) => !f.esBye).length,
      partidosSinProgramar,
    }
  } catch (error) {
    await cliente.query('rollback')
    throw error
  } finally {
    cliente.release()
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Consultar

const persona = (id, nombre, apellido) => (id ? { id, nombre, apellido } : null)

// Una inscripción como la muestra el cuadro: titular, compañero (Pádel) y si es cabeza de serie
const participante = (i) => (i.id ? {
  inscripcionId: i.id,
  cabezaDeSerie: i.cabezaDeSerie,
  titular: persona(i.titularJugadorId, i.titularNombre, i.titularApellido),
  companero: persona(i.companeroJugadorId, i.companeroNombre, i.companeroApellido),
} : null)

// Datos de un partido terminado por W.O.: quién faltó ('LOCAL' | 'VISITANTE' | 'AMBOS'), el motivo y el detalle. En un partido
// que se resolvió solo porque su rival nunca llegó (motivo AVANCE_POR_BAJA) no hay nadie que haya faltado: `ausente` es null.
const darFormaWO = (p) => {
  const [motivo, ...resto] = (p.motivoWo ?? '').split(': ')
  const detalle = resto.join(': ') || null
  if (motivo === 'AVANCE_POR_BAJA') return { ausente: null, motivo, detalle: null }
  const ausente = !p.ganadorInscripcionId ? 'AMBOS' : p.ganadorInscripcionId === p.localId ? 'VISITANTE' : 'LOCAL'
  return { ausente, motivo, detalle }
}

// GET cuadro: zonas (posiciones y partidos) y rondas (partidos encadenados). Las dos formas se piden juntas: un
// torneo con zonas tiene `zonas` y, cuando exista la fase eliminatoria (CU 3.9), también `rondas`.
// Devuelve { resultado: 'NO_ENCONTRADO' | 'SIN_CUADRO' | 'OK', ... }.
export const obtenerCuadro = async (torneoId) => {
  const torneo = await buscarTorneoPorId(torneoId)
  if (!torneo || torneo.estado === 'PLANIFICADO') return { resultado: 'NO_ENCONTRADO' }
  if (!torneo.faseActual) return { resultado: 'SIN_CUADRO', estado: torneo.estado }

  const { rows: partidos } = await pool.query(
    `select p.id, p.zona_id as "zonaId", p.fase, p.ronda, p.posicion, p.instancia, p.estado, p.es_bye as "esBye",
            p.ganador_inscripcion_id as "ganadorInscripcionId", p.partido_siguiente_id as "partidoSiguienteId",
            p.ranura_en_siguiente as "ranuraEnSiguiente", p.motivo_wo as "motivoWo",
            p.local_inscripcion_id as "localId", p.visitante_inscripcion_id as "visitanteId",
            r.cancha_id as "canchaId", ca.nombre as "canchaNombre", to_char(r.fecha, 'YYYY-MM-DD') as fecha,
            to_char(r.hora_inicio, 'HH24:MI') as "horaInicio", to_char(r.hora_fin, 'HH24:MI') as "horaFin"
       from partido p
       left join reserva r on r.id = p.reserva_id
       left join cancha ca on ca.id = r.cancha_id
      where p.torneo_id = $1
      order by p.ronda, p.posicion`,
    [torneoId]
  )
  const { rows: inscripciones } = await pool.query(
    `select i.id, i.cabeza_de_serie as "cabezaDeSerie",
            i.titular_jugador_id as "titularJugadorId", ut.nombre as "titularNombre", ut.apellido as "titularApellido",
            i.companero_jugador_id as "companeroJugadorId", uc.nombre as "companeroNombre", uc.apellido as "companeroApellido"
       from inscripcion i
       join jugador jt on jt.id = i.titular_jugador_id
       join usuario ut on ut.id = jt.usuario_id
       left join jugador jc on jc.id = i.companero_jugador_id
       left join usuario uc on uc.id = jc.usuario_id
      where i.torneo_id = $1`,
    [torneoId]
  )
  const porInscripcion = new Map(inscripciones.map((i) => [i.id, participante(i)]))

  // Los games de cada set de los partidos que ya se jugaron (el set 3 puede ser un super tie-break: 10-7)
  const { rows: filasSets } = await pool.query(
    `select s.partido_id as "partidoId", s.numero, s.games_local as local, s.games_visitante as visitante
       from set_partido s join partido p on p.id = s.partido_id
      where p.torneo_id = $1
      order by s.numero`,
    [torneoId]
  )
  const setsDe = new Map()
  for (const { partidoId, ...juego } of filasSets) setsDe.set(partidoId, [...(setsDe.get(partidoId) ?? []), juego])

  const darForma = (p) => ({
    id: p.id,
    ronda: p.ronda,
    posicion: p.posicion,
    instancia: p.instancia,
    estado: p.estado,
    esBye: p.esBye,
    local: porInscripcion.get(p.localId) ?? null,
    visitante: porInscripcion.get(p.visitanteId) ?? null,
    ganadorInscripcionId: p.ganadorInscripcionId,
    sets: setsDe.get(p.id) ?? [],
    wo: p.estado === 'WO' ? darFormaWO(p) : null,
    siguiente: p.partidoSiguienteId ? { partidoId: p.partidoSiguienteId, ranura: p.ranuraEnSiguiente } : null,
    programacion: p.fecha ? { fecha: p.fecha, horaInicio: p.horaInicio, horaFin: p.horaFin, cancha: { id: p.canchaId, nombre: p.canchaNombre } } : null,
  })

  const { rows: zonasFilas } = await pool.query(
    `select z.id, z.nombre, z.cerrada from zona z where z.torneo_id = $1 order by z.nombre`,
    [torneoId]
  )
  const { rows: posiciones } = await pool.query(
    `select pz.zona_id as "zonaId", pz.inscripcion_id as "inscripcionId", pz.posicion,
            pz.partidos_ganados as "partidosGanados", pz.partidos_perdidos as "partidosPerdidos",
            pz.sets_ganados as "setsGanados", pz.sets_perdidos as "setsPerdidos",
            pz.games_ganados as "gamesGanados", pz.games_perdidos as "gamesPerdidos", pz.clasificado
       from posicion_zona pz join zona z on z.id = pz.zona_id where z.torneo_id = $1`,
    [torneoId]
  )
  const zonas = zonasFilas.map((z) => ({
    id: z.id,
    nombre: z.nombre,
    cerrada: z.cerrada,
    posiciones: posiciones
      .filter((x) => x.zonaId === z.id)
      .sort((a, b) => (a.posicion ?? 99) - (b.posicion ?? 99))
      .map(({ zonaId, inscripcionId, ...datos }) => ({ ...datos, participante: porInscripcion.get(inscripcionId) })),
    partidos: partidos.filter((p) => p.zonaId === z.id).map(darForma),
  }))

  const porRonda = new Map()
  for (const p of partidos.filter((x) => x.fase === 'ELIMINATORIA')) {
    if (!porRonda.has(p.ronda)) porRonda.set(p.ronda, { ronda: p.ronda, instancia: p.instancia, partidos: [] })
    porRonda.get(p.ronda).partidos.push(darForma(p))
  }

  return {
    resultado: 'OK',
    torneo: { id: torneo.id, nombre: torneo.nombre, formato: torneo.formato, disciplina: torneo.disciplina, estado: torneo.estado, faseActual: torneo.faseActual },
    zonas,
    rondas: [...porRonda.values()],
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Regenerar

// POST regenerar-cuadro (CU 3.4 · 6a). Solo si ningún partido tiene resultado ni W.O.: borra zonas y partidos, cancela
// las reservas y vuelve a INSCRIPCIONES_CERRADAS, para poder ajustar las cabezas de serie y generar de nuevo.
// Un bye no cuenta como resultado.
// Devuelve { resultado: 'NO_ENCONTRADO' | 'ESTADO_INVALIDO' | 'CON_RESULTADOS' | 'OK', torneo?, ... }.
export const regenerarCuadro = async (torneoId) => {
  const cliente = await pool.connect()
  try {
    await cliente.query('begin')
    const terminar = async (datos) => {
      await cliente.query('rollback')
      return datos
    }
    if (!(await bloquearTorneo(torneoId, cliente))) return await terminar({ resultado: 'NO_ENCONTRADO' })
    const torneo = await buscarTorneoPorId(torneoId, cliente)
    if (torneo.estado !== 'EN_CURSO') return await terminar({ resultado: 'ESTADO_INVALIDO', estado: torneo.estado })

    const { rows } = await cliente.query(
      `select count(*)::int as n from partido
        where torneo_id = $1 and not es_bye and estado in ('FINALIZADO', 'WO')`,
      [torneoId]
    )
    if (rows[0].n > 0) return await terminar({ resultado: 'CON_RESULTADOS' })

    const reservasCanceladas = await cancelarReservasDelTorneo(torneoId, cliente)
    await cliente.query('delete from partido where torneo_id = $1', [torneoId])
    await cliente.query('delete from zona where torneo_id = $1', [torneoId])
    await cambiarEstadoTorneo(torneoId, 'INSCRIPCIONES_CERRADAS', null, cliente)
    const actualizado = await buscarTorneoPorId(torneoId, cliente)
    await cliente.query('commit')
    return { resultado: 'OK', torneo: actualizado, reservasCanceladas }
  } catch (error) {
    await cliente.query('rollback')
    throw error
  } finally {
    cliente.release()
  }
}