import { pool } from '../../config/conexion.bd.js'
import { otorgarPuntos, revertirMovimientosPorInstancia } from '../ranking/modelo.ranking.js'
import { calcularPosiciones } from './algoritmo.posiciones.torneos.js'
import { jugadoresDeInscripciones } from './modelo.inscripciones.js'
import { bloquearTorneo, buscarTorneoPorId } from './modelo.torneos.js'

// Tablas de posiciones de las zonas (CU 3.6 · paso 8) y desempate a mano (CU 3.9 · 3a).
// Lo usan el resultado de un partido (M3-BE-18), el W.O. (M3-BE-20) y la fase eliminatoria (M3-BE-22).

// Datos de las inscripciones que juegan: quiénes son (titular y compañero) para mostrarlos y darles los puntos
export const cargarParticipantes = async (inscripcionIds, db) => {
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

// Los partidos de la zona, sus inscriptos y el orden que eligió el Organizador (null si no eligió ninguno)
export const leerZona = async (zonaId, db) => {
  const { rows: partidos } = await db.query(
    `select p.id, p.local_inscripcion_id as "localId", p.visitante_inscripcion_id as "visitanteId",
            p.ganador_inscripcion_id as "ganadorId", p.estado,
            coalesce((select jsonb_agg(jsonb_build_object('local', s.games_local, 'visitante', s.games_visitante) order by s.numero)
                        from set_partido s where s.partido_id = p.id), '[]'::jsonb) as sets
       from partido p
      where p.zona_id = $1`,
    [zonaId]
  )
  const { rows: inscritos } = await db.query(
    'select inscripcion_id as id, orden_manual as "ordenManual" from posicion_zona where zona_id = $1',
    [zonaId]
  )
  const ordenados = inscritos.filter((i) => i.ordenManual !== null).sort((a, b) => a.ordenManual - b.ordenManual)
  return {
    partidos,
    participantes: inscritos.map((i) => i.id),
    ordenManual: ordenados.length > 0 ? ordenados.map((i) => i.id) : null,
  }
}

// Recalcula la tabla de la zona con todos sus partidos (y el desempate a mano, si hay) y la guarda en `posicion_zona`.
// Devuelve la tabla de calcularPosiciones.
export const actualizarTablaDeZona = async (zonaId, clasifican, db) => {
  const { partidos, participantes, ordenManual } = await leerZona(zonaId, db)
  const tabla = calcularPosiciones(partidos, { clasifican, participantes, ordenManual })

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

// Cuándo termina el último partido de zonas que tiene franja ({ fecha, hora }), o null. La eliminatoria arranca después.
export const finDeLaFaseDeZonas = async (torneoId, db) => {
  const { rows } = await db.query(
    `select to_char(r.fecha, 'YYYY-MM-DD') as fecha, to_char(r.hora_fin, 'HH24:MI') as hora
       from partido p
       join reserva r on r.id = p.reserva_id and r.estado in ('PENDIENTE', 'CONFIRMADA')
      where p.torneo_id = $1 and p.fase = 'ZONA'
      order by r.fecha desc, r.hora_fin desc
      limit 1`,
    [torneoId]
  )
  return rows[0] ?? null
}

// Los grupos empatados de una tabla con las personas, para mostrarlos: [{ posicion, clasificatorio, participantes }]
export const detalleDeEmpates = async (empates, db) => {
  const personas = await cargarParticipantes(empates.flatMap((e) => e.inscripcionIds), db)
  return empates.map((e) => ({
    posicion: e.posicion,
    clasificatorio: e.clasificatorio,
    participantes: e.inscripcionIds.map((id) => personas.get(id)),
  }))
}

// PUT orden-manual (CU 3.9 · 3a). `orden` son ids de inscripción, del mejor al peor, de los que siguen empatados después de
// todos los criterios. Guarda el orden, vuelve a calcular la tabla y, si la zona queda sin empates, la cierra y da los
// puntos de clasificación (CLASIFICADO_DE_ZONA). Se puede volver a ordenar mientras no se genere la eliminatoria.
// Devuelve { resultado, ... }:
//   'NO_ENCONTRADO' · 'ESTADO_INVALIDO' (estado) · 'FASE_INVALIDA' (faseActual) · 'ZONA_INCOMPLETA' (partidosPendientes)
//   'SIN_EMPATES' · 'NO_SON_DE_LA_ZONA' · 'NO_ESTAN_EMPATADOS' · 'GRUPO_INCOMPLETO' (empates)
//   'OK' (zona, puntosOtorgados, todasLasZonasCerradas)
export const guardarOrdenManual = async (zonaId, orden) => {
  const cliente = await pool.connect()
  try {
    await cliente.query('begin')
    const terminar = async (datos) => {
      await cliente.query('rollback')
      return datos
    }

    const { rows: zonas } = await cliente.query('select id, nombre, torneo_id as "torneoId" from zona where id = $1', [zonaId])
    if (!zonas[0]) return await terminar({ resultado: 'NO_ENCONTRADO' })
    const zona = zonas[0]

    await bloquearTorneo(zona.torneoId, cliente)
    const torneo = await buscarTorneoPorId(zona.torneoId, cliente)
    if (torneo.estado !== 'EN_CURSO') return await terminar({ resultado: 'ESTADO_INVALIDO', estado: torneo.estado })
    if (torneo.faseActual !== 'ZONAS') return await terminar({ resultado: 'FASE_INVALIDA', faseActual: torneo.faseActual })

    const { partidos, participantes } = await leerZona(zonaId, cliente)
    const clasifican = torneo.clasificanPorZona ?? 2
    if (orden.some((id) => !participantes.includes(id))) return await terminar({ resultado: 'NO_SON_DE_LA_ZONA' })

    // Los empates se miran sin el orden que ya hubiera: así se puede corregir lo que se eligió antes
    const tabla = calcularPosiciones(partidos, { clasifican, participantes })
    if (!tabla.completa) {
      return await terminar({ resultado: 'ZONA_INCOMPLETA', partidosPendientes: partidos.filter((p) => p.estado !== 'FINALIZADO' && p.estado !== 'WO').length })
    }
    if (tabla.empates.length === 0) return await terminar({ resultado: 'SIN_EMPATES' })

    const empatados = tabla.empates.flatMap((e) => e.inscripcionIds)
    if (orden.some((id) => !empatados.includes(id))) return await terminar({ resultado: 'NO_ESTAN_EMPATADOS' })
    // Cada grupo se ordena entero (el que decide quién clasifica es obligatorio; los otros, opcionales)
    const incompleto = tabla.empates.filter((e) => {
      const incluidos = e.inscripcionIds.filter((id) => orden.includes(id)).length
      return incluidos !== e.inscripcionIds.length && (e.clasificatorio || incluidos > 0)
    })
    if (incompleto.length > 0) return await terminar({ resultado: 'GRUPO_INCOMPLETO', empates: await detalleDeEmpates(incompleto, cliente) })

    await cliente.query('update posicion_zona set orden_manual = null where zona_id = $1', [zonaId])
    await cliente.query(
      `update posicion_zona pz set orden_manual = x.lugar
         from unnest($2::uuid[]) with ordinality as x(id, lugar)
        where pz.zona_id = $1 and pz.inscripcion_id = x.id`,
      [zonaId, orden]
    )
    const nueva = await actualizarTablaDeZona(zonaId, clasifican, cliente)
    const cerrada = nueva.completa && !nueva.empateSinResolver
    await cliente.query('update zona set cerrada = $2 where id = $1', [zonaId, cerrada])

    // Los puntos de clasificación dependen de quién pasó: se anulan los anteriores y se dan los de ahora
    const { rows: delaZona } = await cliente.query('select id from partido where zona_id = $1 order by ronda desc, posicion desc', [zonaId])
    await revertirMovimientosPorInstancia(delaZona.map((p) => p.id), ['CLASIFICADO_DE_ZONA'], cliente)
    let puntosOtorgados = []
    if (cerrada) {
      const jugadorIds = await jugadoresDeInscripciones(nueva.posiciones.filter((p) => p.clasificado).map((p) => p.inscripcionId), cliente)
      const otorgados = await otorgarPuntos(
        { partidoId: delaZona[0].id, disciplina: torneo.disciplina, instancia: 'CLASIFICADO_DE_ZONA', jugadorIds },
        cliente
      )
      const { rows: nombres } = otorgados.length === 0 ? { rows: [] } : await cliente.query(
        'select j.id, u.nombre, u.apellido from jugador j join usuario u on u.id = j.usuario_id where j.id = any($1)',
        [otorgados.map((o) => o.jugadorId)]
      )
      const personas = new Map(nombres.map((n) => [n.id, n]))
      puntosOtorgados = otorgados.map((o) => ({
        jugador: { id: o.jugadorId, nombre: personas.get(o.jugadorId).nombre, apellido: personas.get(o.jugadorId).apellido },
        instancia: 'CLASIFICADO_DE_ZONA',
        puntos: o.puntos,
        puntosTotales: o.puntosTotales,
        cambioCategoria: o.cambioCategoria,
      }))
    }

    const { rows: estadoZonas } = await cliente.query(
      'select count(*)::int as total, count(*) filter (where cerrada)::int as cerradas from zona where torneo_id = $1',
      [zona.torneoId]
    )
    const deLaZona = await cargarParticipantes(nueva.posiciones.map((p) => p.inscripcionId), cliente)
    await cliente.query('commit')
    return {
      resultado: 'OK',
      zona: {
        id: zonaId,
        nombre: zona.nombre,
        cerrada,
        completa: nueva.completa,
        empateSinResolver: nueva.empateSinResolver,
        empates: nueva.empates,
        posiciones: nueva.posiciones.map(({ inscripcionId, ...datos }) => ({ ...datos, participante: deLaZona.get(inscripcionId) })),
      },
      puntosOtorgados,
      todasLasZonasCerradas: estadoZonas[0].total === estadoZonas[0].cerradas,
    }
  } catch (error) {
    await cliente.query('rollback')
    throw error
  } finally {
    cliente.release()
  }
}