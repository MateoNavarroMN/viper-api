import { pool } from '../../config/conexion.bd.js'

// Base del ranking (CU 3.6 · RF-17 y RF-18). No depende de Torneos: recibe el partido ya resuelto y los jugadores
// por parámetro. Los puntos de un jugador en una disciplina (`ranking_disciplina.puntos_totales`) son siempre la
// suma de sus movimientos no revertidos (`movimiento_puntos`), y su categoría técnica sale de esos puntos.
// Todas las funciones reciben como último parámetro opcional `db`: el pool o un cliente con una transacción abierta
// (el resultado de un partido tiene que guardarse todo junto: BE-18 y BE-19 las llaman dentro de la suya).

// Categoría que corresponde a un puntaje: la de mayor puntaje mínimo que no lo supere; si hay un hueco entre rangos
// o el puntaje es menor a todos, la inicial (la de menor puntaje).
const SQL_CATEGORIA = `
  coalesce(
    (select c.id from categoria_tecnica c where c.disciplina = r.disciplina and c.puntos_minimos <= r.puntos_totales
      order by c.puntos_minimos desc limit 1),
    (select c.id from categoria_tecnica c where c.disciplina = r.disciplina order by c.puntos_minimos limit 1))`

// Regla vigente de una instancia: la más reciente cuya fecha de vigencia ya llegó (null si no hay ninguna).
// La instancia se compara como texto: si la base todavía no tiene ese valor (por ejemplo DIECISEISAVOS), no hay
// regla y no se otorgan puntos, en lugar de fallar por un valor de enum que no existe.
export const buscarRegla = async (disciplina, instancia, db = pool) => {
  const { rows } = await db.query(
    `select id, disciplina, instancia, puntos_otorgados as puntos
       from regla_puntuacion
      where disciplina = $1 and instancia::text = $2 and vigente_desde <= current_date
      order by vigente_desde desc
      limit 1`,
    [disciplina, instancia]
  )
  return rows[0] ?? null
}

// Fila de ranking del jugador en la disciplina. Si todavía no jugó, se crea con 0 puntos y la categoría inicial.
const obtenerOCrearRanking = async (jugadorId, disciplina, db) => {
  await db.query(
    `insert into ranking_disciplina (jugador_id, disciplina, categoria_id)
     select $1, $2::disciplina,
            (select id from categoria_tecnica where disciplina = $2::disciplina order by puntos_minimos limit 1)
     on conflict (jugador_id, disciplina) do nothing`,
    [jugadorId, disciplina]
  )
  const { rows } = await db.query('select id, categoria_id as "categoriaId" from ranking_disciplina where jugador_id = $1 and disciplina = $2', [jugadorId, disciplina])
  return rows[0]
}

// Los puntos que un ranking ya tenía y no vienen de ningún movimiento (los de partida de un jugador, cargados a mano o de
// una carga inicial) se registran como un movimiento más, con la regla PARTICIPACION como etiqueta. Se hace justo antes de
// cambiar los movimientos de ese ranking: así el total, que siempre se recalcula como la suma de sus movimientos, no los
// pierde. Si el total es menor o igual a la suma no hay nada que registrar.
const conciliar = async (rankingIds, db) => {
  if (rankingIds.length === 0) return
  await db.query(
    `insert into movimiento_puntos (ranking_id, regla_id, puntos)
     select r.id, g.id, r.puntos_totales - s.suma
       from ranking_disciplina r
       cross join lateral (select coalesce(sum(m.puntos), 0)::int as suma from movimiento_puntos m where m.ranking_id = r.id and not m.revertido) s
       join lateral (select id from regla_puntuacion where disciplina = r.disciplina and instancia::text = 'PARTICIPACION' order by vigente_desde desc limit 1) g on true
      where r.id = any($1) and r.puntos_totales > s.suma`,
    [rankingIds]
  )
}

// Deja los puntos totales y la categoría de esos rankings al día. Devuelve, por ranking, el antes y el después.
// Son dos pasos porque una fila no puede actualizarse dos veces en la misma sentencia: primero los puntos y después
// la categoría, que sale de los puntos ya actualizados.
const recalcularRankings = async (filtroSql, parametros, db) => {
  const { rows: previos } = await db.query(
    `update ranking_disciplina r
        set puntos_totales = coalesce((select sum(m.puntos) from movimiento_puntos m where m.ranking_id = r.id and not m.revertido), 0)
       from (select id, puntos_totales, categoria_id from ranking_disciplina r where ${filtroSql} for update) a
      where r.id = a.id
      returning r.id, a.categoria_id as "categoriaAntes"`,
    parametros
  )
  if (previos.length === 0) return []

  const { rows } = await db.query(
    `update ranking_disciplina r set categoria_id = ${SQL_CATEGORIA}
      where r.id = any($1)
      returning r.id, r.jugador_id as "jugadorId", r.disciplina, r.puntos_totales as "puntosTotales", r.categoria_id as "categoriaId"`,
    [previos.map((p) => p.id)]
  )
  const antes = new Map(previos.map((p) => [p.id, p.categoriaAntes]))
  return rows.map((r) => ({ ...r, categoriaAntes: antes.get(r.id) }))
}

const resumir = (r) => ({
  jugadorId: r.jugadorId,
  disciplina: r.disciplina,
  puntosTotales: r.puntosTotales,
  categoriaId: r.categoriaId,
  cambioCategoria: r.categoriaId !== r.categoriaAntes,
})

// Otorga a cada jugador los puntos que la regla vigente da a esa instancia y recalcula su ranking y su categoría.
// `jugadorIds` son todos los que reciben los puntos: en Pádel, los dos integrantes de la pareja.
// `partidoId` puede ser null (por ejemplo, puntos por participar). Si ya hay un movimiento vigente de ese partido,
// jugador e instancia, no se repite, así volver a llamar con lo mismo no duplica puntos.
// Devuelve [{ jugadorId, disciplina, puntos, puntosTotales, categoriaId, cambioCategoria }] (vacío si no hay regla vigente).
export const otorgarPuntos = async ({ partidoId = null, disciplina, instancia, jugadorIds }, db = pool) => {
  const regla = await buscarRegla(disciplina, instancia, db)
  if (!regla) return []

  const otorgados = []
  for (const jugadorId of [...new Set(jugadorIds)]) {
    const ranking = await obtenerOCrearRanking(jugadorId, disciplina, db)
    await conciliar([ranking.id], db)
    const { rowCount } = await db.query(
      `insert into movimiento_puntos (ranking_id, regla_id, partido_id, puntos)
       select $1, $2, $3, $4
        where not exists (select 1 from movimiento_puntos m
                           where m.ranking_id = $1 and m.regla_id = $2 and m.partido_id is not distinct from $3 and not m.revertido)`,
      [ranking.id, regla.id, partidoId, regla.puntos]
    )
    if (rowCount > 0) otorgados.push({ jugadorId, rankingId: ranking.id })
  }
  if (otorgados.length === 0) return []

  const recalculados = await recalcularRankings('r.id = any($1)', [otorgados.map((o) => o.rankingId)], db)
  return recalculados.map((r) => ({ ...resumir(r), puntos: regla.puntos }))
}

// Anula los movimientos vigentes de un partido (al corregir su resultado, CU 3.6 · BE-19) y deja los rankings de esos
// jugadores como si no se hubieran otorgado. Los movimientos no se borran: quedan con `revertido = true`.
// Devuelve [{ jugadorId, disciplina, puntosTotales, categoriaId, cambioCategoria }].
export const revertirMovimientos = async (partidoId, db = pool) => {
  const { rows: afectados } = await db.query('select distinct ranking_id from movimiento_puntos where partido_id = $1 and not revertido', [partidoId])
  await conciliar(afectados.map((a) => a.ranking_id), db)
  const { rows } = await db.query(
    'update movimiento_puntos set revertido = true where partido_id = $1 and not revertido returning ranking_id',
    [partidoId]
  )
  if (rows.length === 0) return []
  const recalculados = await recalcularRankings('r.id = any($1)', [[...new Set(rows.map((r) => r.ranking_id))]], db)
  return recalculados.map(resumir)
}

// Lo mismo, pero solo de ciertas instancias y para varios partidos a la vez. Sirve cuando los puntos de una instancia
// quedaron atados a otro partido que el que se corrige: al cerrarse una zona, CLASIFICADO_DE_ZONA se
// otorgan con el último partido de la zona, pero dependen de todos.
export const revertirMovimientosPorInstancia = async (partidoIds, instancias, db = pool) => {
  const { rows: afectados } = await db.query(
    `select distinct m.ranking_id from movimiento_puntos m join regla_puntuacion g on g.id = m.regla_id
      where m.partido_id = any($1) and g.instancia::text = any($2) and not m.revertido`,
    [partidoIds, instancias]
  )
  await conciliar(afectados.map((a) => a.ranking_id), db)
  const { rows } = await db.query(
    `update movimiento_puntos m set revertido = true
       from regla_puntuacion g
      where g.id = m.regla_id and m.partido_id = any($1) and g.instancia::text = any($2) and not m.revertido
      returning m.ranking_id`,
    [partidoIds, instancias]
  )
  if (rows.length === 0) return []
  const recalculados = await recalcularRankings('r.id = any($1)', [[...new Set(rows.map((r) => r.ranking_id))]], db)
  return recalculados.map(resumir)
}

// Los que recalculan por filtro registran antes los puntos previos sin movimiento (ver `conciliar`), para no perderlos
const conciliarYRecalcular = async (filtroSql, parametros, db) => {
  const { rows } = await db.query(`select r.id from ranking_disciplina r where ${filtroSql}`, parametros)
  await conciliar(rows.map((r) => r.id), db)
  return (await recalcularRankings(filtroSql, parametros, db)).map(resumir)
}

// Recalcula desde los movimientos los puntos y la categoría de todos los jugadores de una disciplina.
// Sirve para corregir el ranking si cambiaron los rangos de las categorías.
export const recalcularRanking = (disciplina, db = pool) => conciliarYRecalcular('r.disciplina = $1', [disciplina], db)

// Recalcula los puntos y la categoría de un jugador (en una disciplina, o en las dos si no se indica).
export const recalcularCategoria = (jugadorId, disciplina = null, db = pool) =>
  conciliarYRecalcular('r.jugador_id = $1 and ($2::disciplina is null or r.disciplina = $2::disciplina)', [jugadorId, disciplina], db)

// Ranking de una disciplina, de más a menos puntos. Los empatados comparten posición (1, 2, 2, 4). `categoriaId`
// filtra por categoría técnica: la posición que se muestra es la de esa categoría.
export const listarRanking = async (disciplina, { categoriaId = null } = {}, db = pool) => {
  const { rows } = await db.query(
    `select rank() over (order by r.puntos_totales desc)::int as posicion,
            j.id as "jugadorId", u.nombre, u.apellido, r.puntos_totales as puntos,
            c.id as "categoriaId", c.nombre_categoria as categoria
       from ranking_disciplina r
       join jugador j on j.id = r.jugador_id
       join usuario u on u.id = j.usuario_id
       join categoria_tecnica c on c.id = r.categoria_id
      where r.disciplina = $1 and ($2::uuid is null or r.categoria_id = $2::uuid)
      order by r.puntos_totales desc, u.apellido, u.nombre, j.id`,
    [disciplina, categoriaId]
  )
  return rows.map((f) => ({
    posicion: f.posicion,
    jugador: { id: f.jugadorId, nombre: f.nombre, apellido: f.apellido },
    puntos: f.puntos,
    categoria: { id: f.categoriaId, nombre: f.categoria },
  }))
}