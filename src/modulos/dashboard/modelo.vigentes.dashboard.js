import { pool } from '../../config/conexion.bd.js'
import { SQL_CUOTA_VENCIDA } from '../cuotas/modelo.cuotas.js'

// Bloques del panel de control sobre lo que está vigente en el club (CU 6.1): torneos, socios y comunicados. Son de solo lectura.

// Un torneo está «vigente» mientras no terminó ni se canceló: planificado, con inscripciones abiertas o cerradas, o en curso.
const ESTADOS_VIGENTES = ['EN_CURSO', 'INSCRIPCIONES_CERRADAS', 'INSCRIPCIONES_ABIERTAS', 'PLANIFICADO']
const COMUNICADOS_VISIBLES = 5

// Torneos vigentes con su cupo ocupado (inscripciones activas) y las inscripciones con el pago pendiente, los que ya están jugándose primero.
// Devuelve { sinTorneos, cantidad, inscripcionesPendientes, torneos: [{ id, nombre, disciplina, formato, estado, fechaInicio, fechaFin,
//   cupoMaximo, inscriptos, cupoDisponible, pagadas, pendientesDePago }] }
export const torneosVigentes = async (db = pool) => {
  const { rows } = await db.query(
    `select t.id, t.nombre, t.disciplina, t.formato, t.estado, t.fecha_inicio::text as "fechaInicio", t.fecha_fin::text as "fechaFin",
            t.cupo_maximo as "cupoMaximo",
            count(i.id)::int as inscriptos,
            count(i.id) filter (where i.estado_pago = 'PAGADO')::int as pagadas,
            count(i.id) filter (where i.estado_pago = 'PENDIENTE')::int as "pendientesDePago"
       from torneo t
       left join inscripcion i on i.torneo_id = t.id and i.estado = 'ACTIVA'
      where t.estado = any($1::estado_torneo[])
      group by t.id
      order by array_position($1::text[], t.estado::text), t.fecha_inicio, t.nombre`,
    [ESTADOS_VIGENTES]
  )
  const torneos = rows.map((t) => ({ ...t, cupoDisponible: Math.max(0, t.cupoMaximo - t.inscriptos) }))
  return {
    sinTorneos: torneos.length === 0,
    cantidad: torneos.length,
    inscripcionesPendientes: torneos.reduce((suma, t) => suma + t.pendientesDePago, 0),
    torneos,
  }
}

// Situación de los socios activos. Un socio está Adeudado si tiene al menos una cuota pendiente vencida: es la misma regla del listado
// de socios, así que `adeudados` coincide con ese listado filtrado por «Activo» y «Adeudado». `montoAdeudado` es la suma de esas cuotas.
// Devuelve { sinSociosActivos, activos, alDia, adeudados, cuotasVencidas, montoAdeudado }
export const situacionDeSocios = async (db = pool) => {
  const { rows } = await db.query(
    `select (select count(*)::int from socio where estado = 'ACTIVO') as activos,
            (select count(*)::int from socio s where s.estado = 'ACTIVO'
                and exists (select 1 from cuota_mensual c where c.socio_id = s.id and ${SQL_CUOTA_VENCIDA})) as adeudados,
            (select count(*)::int from cuota_mensual c join socio s on s.id = c.socio_id
              where s.estado = 'ACTIVO' and ${SQL_CUOTA_VENCIDA}) as "cuotasVencidas",
            (select coalesce(sum(c.monto), 0) from cuota_mensual c join socio s on s.id = c.socio_id
              where s.estado = 'ACTIVO' and ${SQL_CUOTA_VENCIDA}) as "montoAdeudado"`
  )
  const f = rows[0]
  return {
    sinSociosActivos: f.activos === 0,
    activos: f.activos,
    alDia: f.activos - f.adeudados,
    adeudados: f.adeudados,
    cuotasVencidas: f.cuotasVencidas,
    montoAdeudado: Math.round(Number(f.montoAdeudado) * 100) / 100,
  }
}

// Comunicados publicados (los que figuran hoy en la cartelera), del más reciente al más viejo. Devuelve { total, comunicados }
// con los más recientes; los borradores y los retirados no cuentan.
export const comunicadosVigentes = async (db = pool) => {
  const { rows } = await db.query(
    `select c.id, c.titulo, c.alcance, c.fecha_publicacion as "fechaPublicacion", u.nombre || ' ' || u.apellido as autor
       from comunicado c join usuario u on u.id = c.autor_usuario_id
      where c.estado = 'PUBLICADO'
      order by c.fecha_publicacion desc, c.id
      limit ${COMUNICADOS_VISIBLES}`
  )
  const { rows: conteo } = await db.query(`select count(*)::int as total from comunicado where estado = 'PUBLICADO'`)
  return { total: conteo[0].total, comunicados: rows }
}