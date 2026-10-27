import { pool } from '../../config/conexion.bd.js'
import { calcularPosiciones } from './algoritmo.posiciones.torneos.js'
import { armarEliminatoriaDesdeZonas } from './algoritmo.eliminatoria.torneos.js'
import { filasDeRondas, insertarFilas, programarPartidos } from './modelo.cuadro.torneos.js'
import { bloquearTorneo, buscarTorneoPorId, cambiarEstadoTorneo } from './modelo.torneos.js'
import { cargarParticipantes, detalleDeEmpates, finDeLaFaseDeZonas, leerZona } from './modelo.zonas.torneos.js'
import { despuesDelDescanso } from './scheduler.torneos.js'

// Generar y regenerar la fase eliminatoria de un torneo con zonas (CU 3.9). Une las piezas de M3-BE-21 (armado de la llave),
// M3-BE-22 (empates a mano) y el cuadro de M3-BE-14. Corre en una transacción con el torneo bloqueado.

// Para generar el torneo tiene que ser de zonas, estar en curso y seguir en la fase de zonas
const motivoDeEstado = (torneo) => {
  if (torneo.formato !== 'ZONAS_Y_ELIMINACION') return { resultado: 'FORMATO_INVALIDO', formato: torneo.formato }
  if (torneo.estado !== 'EN_CURSO') return { resultado: 'ESTADO_INVALIDO', estado: torneo.estado }
  if (torneo.faseActual !== 'ZONAS') return { resultado: 'FASE_INVALIDA', faseActual: torneo.faseActual }
  return null
}

// POST fase-eliminatoria (CU 3.9 · pasos 2 a 6). Persiste los partidos, programa la primera ronda y pasa la fase a ELIMINATORIA.
// Devuelve { resultado, ... }:
//   'NO_ENCONTRADO' · 'FORMATO_INVALIDO' · 'ESTADO_INVALIDO' · 'FASE_INVALIDA'
//   'ZONAS_PENDIENTES' (zonas: [{ id, nombre, partidosPendientes }])            · flujo 2a
//   'EMPATE_SIN_RESOLVER' (zonas: [{ id, nombre, empates: [{ posicion, participantes }] }]) · flujo 3a
//   'INSUFICIENTES' (clasificados) · 'OK' (torneo, tamano, byes, partidos, clasificados, conflictos, partidosSinProgramar)
export const generarFaseEliminatoria = async (torneoId) => {
  const cliente = await pool.connect()
  try {
    await cliente.query('begin')
    const terminar = async (datos) => {
      await cliente.query('rollback')
      return datos
    }
    if (!(await bloquearTorneo(torneoId, cliente))) return await terminar({ resultado: 'NO_ENCONTRADO' })
    const torneo = await buscarTorneoPorId(torneoId, cliente)
    const invalido = motivoDeEstado(torneo)
    if (invalido) return await terminar(invalido)

    // La tabla de cada zona, calculada con todos sus partidos y el orden a mano que haya
    const { rows: zonasDelTorneo } = await cliente.query('select id, nombre from zona where torneo_id = $1 order by nombre', [torneoId])
    const zonas = []
    for (const z of zonasDelTorneo) {
      const { partidos, participantes, ordenManual } = await leerZona(z.id, cliente)
      const tabla = calcularPosiciones(partidos, { clasifican: torneo.clasificanPorZona, participantes, ordenManual })
      zonas.push({
        ...z,
        tabla,
        partidosPendientes: partidos.filter((p) => p.estado !== 'FINALIZADO' && p.estado !== 'WO').length,
      })
    }

    // 2a: hay zonas que todavía no terminaron
    const pendientes = zonas.filter((z) => !z.tabla.completa)
    if (pendientes.length > 0) {
      return await terminar({
        resultado: 'ZONAS_PENDIENTES',
        zonas: pendientes.map((z) => ({ id: z.id, nombre: z.nombre, partidosPendientes: z.partidosPendientes })),
      })
    }

    // 3a: hay empates que los criterios no resuelven y el Organizador todavía no ordenó
    const empatadas = zonas.filter((z) => z.tabla.empateSinResolver)
    if (empatadas.length > 0) {
      const detalle = []
      for (const z of empatadas) {
        detalle.push({ id: z.id, nombre: z.nombre, empates: await detalleDeEmpates(z.tabla.empates.filter((e) => e.clasificatorio), cliente) })
      }
      return await terminar({ resultado: 'EMPATE_SIN_RESOLVER', zonas: detalle })
    }

    const armado = armarEliminatoriaDesdeZonas(zonas.map((z) => ({ id: z.id, posiciones: z.tabla.posiciones })), torneo.clasificanPorZona)
    if (armado.participantes < 2) return await terminar({ resultado: 'INSUFICIENTES', clasificados: armado.participantes })

    const filas = filasDeRondas(armado.rondas)
    await insertarFilas(filas, torneoId, cliente)

    const { rows: inscripciones } = await cliente.query(
      `select id, titular_jugador_id as "titular", companero_jugador_id as "companero" from inscripcion where id = any($1)`,
      [armado.clasificados.map((c) => c.inscripcionId)]
    )
    const jugadoresDe = new Map(inscripciones.map((i) => [i.id, [i.titular, i.companero].filter(Boolean)]))

    // La primera ronda arranca después de que termine el último partido de las zonas (más el descanso)
    const finDeZonas = await finDeLaFaseDeZonas(torneoId, cliente)
    const partidosSinProgramar = await programarPartidos(torneo, filas.filasPartidos, jugadoresDe, cliente, {
      noAntesDe: finDeZonas ? despuesDelDescanso(finDeZonas) : null,
    })

    await cambiarEstadoTorneo(torneoId, 'EN_CURSO', 'ELIMINATORIA', cliente)
    const actualizado = await buscarTorneoPorId(torneoId, cliente)

    const personas = await cargarParticipantes(armado.clasificados.map((c) => c.inscripcionId), cliente)
    const nombreDeZona = new Map(zonas.map((z) => [z.id, z.nombre]))
    await cliente.query('commit')
    return {
      resultado: 'OK',
      torneo: actualizado,
      tamano: armado.tamano,
      byes: armado.byes,
      partidos: filas.filasPartidos.filter((f) => !f.esBye).length,
      clasificados: armado.clasificados.map((c) => ({ ...c, zona: nombreDeZona.get(c.zonaId), participante: personas.get(c.inscripcionId) })),
      conflictos: armado.conflictos,
      partidosSinProgramar,
    }
  } catch (error) {
    await cliente.query('rollback')
    throw error
  } finally {
    cliente.release()
  }
}

// POST fase-eliminatoria/regenerar (CU 3.9 · 8a). Solo si ningún partido de la eliminatoria tiene resultado ni W.O.: borra los
// partidos, cancela sus reservas y vuelve a la fase de zonas, con las zonas como estaban (así se puede resolver o cambiar un
// desempate a mano y generar de nuevo). Un bye no cuenta como resultado.
// Devuelve { resultado: 'NO_ENCONTRADO' | 'ESTADO_INVALIDO' | 'SIN_ELIMINATORIA' | 'CON_RESULTADOS' | 'OK', ... }.
export const regenerarFaseEliminatoria = async (torneoId) => {
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
    if (torneo.formato !== 'ZONAS_Y_ELIMINACION' || torneo.faseActual !== 'ELIMINATORIA') {
      return await terminar({ resultado: 'SIN_ELIMINATORIA', faseActual: torneo.faseActual })
    }

    const { rows } = await cliente.query(
      `select count(*)::int as n from partido
        where torneo_id = $1 and fase = 'ELIMINATORIA' and not es_bye and estado in ('FINALIZADO', 'WO')`,
      [torneoId]
    )
    if (rows[0].n > 0) return await terminar({ resultado: 'CON_RESULTADOS' })

    const { rows: canceladas } = await cliente.query(
      `update reserva set estado = 'CANCELADA'
        where id in (select reserva_id from partido where torneo_id = $1 and fase = 'ELIMINATORIA' and reserva_id is not null)
          and estado in ('PENDIENTE', 'CONFIRMADA')
        returning id`,
      [torneoId]
    )
    const { rowCount: partidosEliminados } = await cliente.query("delete from partido where torneo_id = $1 and fase = 'ELIMINATORIA'", [torneoId])
    await cambiarEstadoTorneo(torneoId, 'EN_CURSO', 'ZONAS', cliente)
    const actualizado = await buscarTorneoPorId(torneoId, cliente)
    await cliente.query('commit')
    return { resultado: 'OK', torneo: actualizado, partidosEliminados, reservasCanceladas: canceladas.length }
  } catch (error) {
    await cliente.query('rollback')
    throw error
  } finally {
    cliente.release()
  }
}