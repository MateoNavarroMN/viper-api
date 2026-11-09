import { pool } from '../../config/conexion.bd.js'

// Reglas de puntuación (CU 4.3 · RF-17): cuántos puntos da cada instancia de un torneo, por disciplina.
// Nunca se pisa una regla de un día anterior: cada cambio agrega una regla nueva con `vigente_desde` = hoy y la anterior
// queda como historial. Los movimientos de puntos ya otorgados siguen atados a la regla con la que se calcularon
// (`movimiento_puntos.regla_id`), así que un cambio solo afecta a los resultados que se carguen después.
// «Hoy» es `current_date` de la base, que está en la zona horaria America/Argentina/Cordoba.

// Las instancias salen del enum de la base, en su orden (participación, victoria en zona, … campeón), así que si el club
// agrega una instancia nueva aparece sin tocar el código.
export const listarInstancias = async (db = pool) => {
  const { rows } = await db.query(
    `select e.enumlabel as instancia
       from pg_enum e join pg_type t on t.oid = e.enumtypid
      where t.typname = 'instancia_puntos'
      order by e.enumsortorder`
  )
  return rows.map((r) => r.instancia)
}

// La regla de cada instancia que rige hoy (la más reciente cuya fecha ya llegó), en el orden del enum.
// Una instancia sin ninguna regla sale con puntos y vigenteDesde en null.
export const listarReglasVigentes = async (disciplina, db = pool) => {
  const { rows } = await db.query(
    `select e.enumlabel as instancia, r.puntos_otorgados as puntos, r.vigente_desde::text as "vigenteDesde"
       from pg_enum e
       join pg_type t on t.oid = e.enumtypid and t.typname = 'instancia_puntos'
       left join lateral (
         select puntos_otorgados, vigente_desde
           from regla_puntuacion
          where disciplina = $1 and instancia::text = e.enumlabel and vigente_desde <= current_date
          order by vigente_desde desc
          limit 1
       ) r on true
      order by e.enumsortorder`,
    [disciplina]
  )
  return rows
}

// Todas las reglas que tuvo una instancia, de la más nueva a la más vieja (CU 4.3 · A1, solo lectura).
// `vigente` es true en la que rige hoy: la más reciente cuya fecha de vigencia ya llegó.
// Una instancia que nunca tuvo una regla devuelve una lista vacía.
export const listarHistorialRegla = async (disciplina, instancia, db = pool) => {
  const { rows } = await db.query(
    `select puntos_otorgados as puntos, vigente_desde::text as "vigenteDesde",
            coalesce(vigente_desde = (select max(vigente_desde) from regla_puntuacion
                                       where disciplina = $1 and instancia::text = $2 and vigente_desde <= current_date), false) as vigente
       from regla_puntuacion
      where disciplina = $1 and instancia::text = $2
      order by vigente_desde desc`,
    [disciplina, instancia]
  )
  return rows
}

// Cambia los puntos de una instancia. Devuelve:
//   { resultado: 'SIN_CAMBIOS', puntos }                           si ya vale eso (7b)
//   { resultado: 'OK', regla, anterior, reemplazada }             regla es la nueva; reemplazada es true si ya había una de hoy (8a)
// Si ya hay una regla con fecha de hoy se reemplaza su valor en lugar de agregar otra (unique disciplina + instancia + fecha).
// Una transacción con un candado por instancia evita que dos pedidos simultáneos se pisen.
export const modificarPuntosOtorgados = async (disciplina, instancia, puntos) => {
  const cliente = await pool.connect()
  try {
    await cliente.query('begin')
    await cliente.query('select pg_advisory_xact_lock(hashtext($1))', [`regla_puntuacion:${disciplina}:${instancia}`])

    const { rows: vigentes } = await cliente.query(
      `select puntos_otorgados as puntos, vigente_desde = current_date as "esDeHoy"
         from regla_puntuacion
        where disciplina = $1 and instancia::text = $2 and vigente_desde <= current_date
        order by vigente_desde desc
        limit 1`,
      [disciplina, instancia]
    )
    const actual = vigentes[0] ?? null
    if (actual && actual.puntos === puntos) {
      await cliente.query('rollback')
      return { resultado: 'SIN_CAMBIOS', puntos }
    }

    const { rows } = await cliente.query(
      `insert into regla_puntuacion (disciplina, instancia, puntos_otorgados, vigente_desde)
       values ($1, $2::instancia_puntos, $3, current_date)
       on conflict (disciplina, instancia, vigente_desde) do update set puntos_otorgados = excluded.puntos_otorgados
       returning instancia, puntos_otorgados as puntos, vigente_desde::text as "vigenteDesde"`,
      [disciplina, instancia, puntos]
    )
    await cliente.query('commit')
    return { resultado: 'OK', regla: rows[0], anterior: actual?.puntos ?? null, reemplazada: Boolean(actual?.esDeHoy) }
  } catch (error) {
    await cliente.query('rollback').catch(() => {})
    throw error
  } finally {
    cliente.release()
  }
}