import { pool } from '../../config/conexion.bd.js'
import { generarCuota } from './modelo.cuotas.js'

// Generación de las cuotas del mes (CU 4.2 · pasos 4 a 10). SQL crudo; las validaciones las hace el controlador.

export const contarSociosActivos = async (db = pool) => {
  const { rows } = await db.query(`select count(*)::int as total from socio where estado = 'ACTIVO'`)
  return rows[0].total
}

// Socios activos que ya tienen la cuota de ese mes y año
export const contarConCuota = async (mes, anio, db = pool) => {
  const { rows } = await db.query(
    `select count(*)::int as total
       from socio s
       join cuota_mensual c on c.socio_id = s.id
      where s.estado = 'ACTIVO' and c.mes = $1 and c.anio = $2`,
    [mes, anio]
  )
  return rows[0].total
}

// Crea la cuota PENDIENTE del período para cada socio ACTIVO que todavía no la tiene (los dados de baja no entran).
// Todo en una transacción. Resultados:
//   SIN_SOCIOS (4a)    no hay socios activos
//   YA_GENERADAS (8a)  todos los socios activos ya tenían la cuota
//   OK                 { sociosActivos, generadas, yaExistentes }
// Si dos personas generan a la vez, `cuota_unica_por_mes` evita duplicados: a quien llega segundo le toca YA_GENERADAS
// (o solo las que faltaban).
export const generarCuotasDelMes = async ({ mes, anio, monto, fechaVencimiento }) => {
  const cliente = await pool.connect()
  try {
    await cliente.query('begin')

    const { rows: socios } = await cliente.query(`select id from socio where estado = 'ACTIVO' order by id`)
    if (socios.length === 0) {
      await cliente.query('rollback')
      return { resultado: 'SIN_SOCIOS' }
    }

    let generadas = 0
    for (const { id } of socios) {
      if (await generarCuota(id, mes, anio, monto, fechaVencimiento, cliente)) generadas += 1
    }
    if (generadas === 0) {
      await cliente.query('rollback')
      return { resultado: 'YA_GENERADAS' }
    }

    await cliente.query('commit')
    return { resultado: 'OK', sociosActivos: socios.length, generadas, yaExistentes: socios.length - generadas }
  } catch (error) {
    await cliente.query('rollback')
    throw error
  } finally {
    cliente.release()
  }
}