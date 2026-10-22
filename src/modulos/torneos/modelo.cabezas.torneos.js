import { pool } from '../../config/conexion.bd.js'
import { bloquearTorneo, buscarTorneoPorId } from './modelo.torneos.js'

// Cabezas de serie de un torneo (CU 3.3). Solo cuentan las inscripciones ACTIVAS y PAGADAS: son las que
// entran al cuadro (CU 3.4). El orden sale de los puntos de ranking de la disciplina; en Pádel, la suma de los dos.
// Todavía no existe el módulo de ranking completo (M3-BE-15), así que se leen los puntos de `ranking_disciplina`
// y quien no tiene ranking cuenta como 0.

// Mínimo de inscripciones pagadas para configurar la etapa (CU 3.3 · 2a)
const MINIMO = { ELIMINACION_DIRECTA: 4, ZONAS_Y_ELIMINACION: 6 }

// Límites según el formato y la cantidad de pagadas:
// - Eliminación directa: un cuarto del cuadro (que es la siguiente potencia de 2), con mínimo 2.
// - Zonas: una por zona. Las zonas son de 3 o 4 (M3-BE-10), así que hay una cada 4 inscriptos, redondeando hacia arriba.
export const limitesCabezasDeSerie = (formato, pagadas) => {
  const minimoInscriptos = MINIMO[formato]
  let maximoPermitido
  if (formato === 'ZONAS_Y_ELIMINACION') {
    maximoPermitido = Math.ceil(pagadas / 4)
  } else {
    let cuadro = 1
    while (cuadro < pagadas) cuadro *= 2
    maximoPermitido = Math.max(2, cuadro / 4)
  }
  return { minimoInscriptos, maximoPermitido }
}

// Inscripciones ACTIVAS y PAGADAS del torneo, de más a menos puntos (CU 3.3 · paso 2).
export const listarPagadas = async (torneoId, db) => {
  const { rows } = await db.query(
    `select i.id, i.cabeza_de_serie as "cabezaDeSerie",
            coalesce(rt.puntos_totales, 0) + coalesce(rc.puntos_totales, 0) as puntos,
            i.titular_jugador_id as "titularJugadorId", ut.nombre as "titularNombre", ut.apellido as "titularApellido",
            i.companero_jugador_id as "companeroJugadorId", uc.nombre as "companeroNombre", uc.apellido as "companeroApellido"
       from inscripcion i
       join torneo t on t.id = i.torneo_id
       join jugador jt on jt.id = i.titular_jugador_id
       join usuario ut on ut.id = jt.usuario_id
       left join jugador jc on jc.id = i.companero_jugador_id
       left join usuario uc on uc.id = jc.usuario_id
       left join ranking_disciplina rt on rt.jugador_id = i.titular_jugador_id and rt.disciplina = t.disciplina
       left join ranking_disciplina rc on rc.jugador_id = i.companero_jugador_id and rc.disciplina = t.disciplina
      where i.torneo_id = $1 and i.estado = 'ACTIVA' and i.estado_pago = 'PAGADO'
      order by puntos desc, i.fecha_inscripcion, ut.apellido, ut.nombre, i.id`,
    [torneoId]
  )
  return rows
}

const persona = (id, nombre, apellido) => (id ? { id, nombre, apellido } : null)

// Arma la respuesta de lectura a partir de las filas
const armar = (torneo, filas) => ({
  torneo: { id: torneo.id, nombre: torneo.nombre, estado: torneo.estado, formato: torneo.formato, disciplina: torneo.disciplina },
  pagadas: filas.length,
  seleccionadas: filas.filter((f) => f.cabezaDeSerie).length,
  ...limitesCabezasDeSerie(torneo.formato, filas.length),
  inscripciones: filas.map((f) => ({
    id: f.id,
    cabezaDeSerie: f.cabezaDeSerie,
    puntos: f.puntos,
    titular: persona(f.titularJugadorId, f.titularNombre, f.titularApellido),
    companero: persona(f.companeroJugadorId, f.companeroNombre, f.companeroApellido),
  })),
})

const ESTADOS_QUE_ADMITEN = ['INSCRIPCIONES_ABIERTAS', 'INSCRIPCIONES_CERRADAS']

// Valida el torneo para la etapa. Devuelve null si está bien o { resultado, ... } con el motivo.
const validarEtapa = (torneo, pagadas) => {
  if (!ESTADOS_QUE_ADMITEN.includes(torneo.estado)) return { resultado: 'ESTADO_INVALIDO', estado: torneo.estado }
  const { minimoInscriptos } = limitesCabezasDeSerie(torneo.formato, pagadas)
  if (pagadas < minimoInscriptos) return { resultado: 'INSUFICIENTES', pagadas, minimoInscriptos }
  return null
}

// GET: pagadas con sus puntos y cuáles son cabeza de serie.
// Devuelve { resultado: 'NO_ENCONTRADO' | 'ESTADO_INVALIDO' | 'INSUFICIENTES' | 'OK', ... }
export const obtenerCabezasDeSerie = async (torneoId) => {
  const torneo = await buscarTorneoPorId(torneoId)
  if (!torneo || torneo.estado === 'PLANIFICADO') return { resultado: 'NO_ENCONTRADO' }
  const filas = await listarPagadas(torneoId, pool)
  return validarEtapa(torneo, filas.length) ?? { resultado: 'OK', ...armar(torneo, filas) }
}

// Marca o quita una cabeza de serie (solo si la inscripción está ACTIVA y PAGADA). Devuelve si cambió algo.
export const asignarCabezaDeSerie = async (inscripcionId, db = pool) => {
  const { rowCount } = await db.query(
    "update inscripcion set cabeza_de_serie = true where id = $1 and estado = 'ACTIVA' and estado_pago = 'PAGADO'",
    [inscripcionId]
  )
  return rowCount > 0
}
export const quitarCabezaDeSerie = async (inscripcionId, db = pool) => {
  const { rowCount } = await db.query('update inscripcion set cabeza_de_serie = false where id = $1', [inscripcionId])
  return rowCount > 0
}

// PUT: deja como cabezas de serie exactamente las inscripciones de `ids` (y quita a las demás).
// Corre en una transacción con el torneo bloqueado, así no se pisa con un cierre, una cancelación o un pago.
// Devuelve { resultado: 'NO_ENCONTRADO' | 'ESTADO_INVALIDO' | 'INSUFICIENTES' | 'INSCRIPCION_INVALIDA' | 'DEMASIADAS' | 'OK', ... }
export const guardarCabezasDeSerie = async (torneoId, ids) => {
  const cliente = await pool.connect()
  try {
    await cliente.query('begin')
    const bloqueado = await bloquearTorneo(torneoId, cliente)
    const torneo = bloqueado ? await buscarTorneoPorId(torneoId, cliente) : null
    const terminar = async (datos) => {
      await cliente.query('rollback')
      return datos
    }
    if (!torneo || torneo.estado === 'PLANIFICADO') return await terminar({ resultado: 'NO_ENCONTRADO' })

    const filas = await listarPagadas(torneoId, cliente)
    const invalida = validarEtapa(torneo, filas.length)
    if (invalida) return await terminar(invalida)

    const validas = new Set(filas.map((f) => f.id))
    if (ids.some((id) => !validas.has(id))) return await terminar({ resultado: 'INSCRIPCION_INVALIDA' })

    const { maximoPermitido } = limitesCabezasDeSerie(torneo.formato, filas.length)
    if (ids.length > maximoPermitido) return await terminar({ resultado: 'DEMASIADAS', maximoPermitido })

    for (const fila of filas) {
      const debeSer = ids.includes(fila.id)
      if (debeSer && !fila.cabezaDeSerie) await asignarCabezaDeSerie(fila.id, cliente)
      if (!debeSer && fila.cabezaDeSerie) await quitarCabezaDeSerie(fila.id, cliente)
    }
    // Una cabeza de serie de una inscripción que dejó de estar pagada o activa ya no corresponde
    await cliente.query(
      `update inscripcion set cabeza_de_serie = false
        where torneo_id = $1 and cabeza_de_serie and not (estado = 'ACTIVA' and estado_pago = 'PAGADO')`,
      [torneoId]
    )

    await cliente.query('commit')
    return { resultado: 'OK', ...armar(torneo, await listarPagadas(torneoId, pool)) }
  } catch (error) {
    await cliente.query('rollback')
    throw error
  } finally {
    cliente.release()
  }
}