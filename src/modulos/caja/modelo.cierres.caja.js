import { pool } from '../../config/conexion.bd.js'
import { bloquearCajaParaCierre, buscarCierrePorFecha, cajaCerrada } from './modelo.caja.js'
import { resumenDeLaJornada } from './modelo.cierre.caja.js'
import { listarMovimientos } from './modelo.movimientos.caja.js'

const centavos = (monto) => Math.round(Number(monto) * 100)

// Rechazo del cierre por una regla de negocio. `codigo` dice cuál es; `datos` trae información extra para la pantalla.
export class CierreRechazadoError extends Error {
  constructor(codigo, mensaje, datos = {}) {
    super(mensaje)
    this.name = 'CierreRechazadoError'
    this.codigo = codigo
    this.datos = datos
  }
}
export const esCierreRechazado = (error) => error instanceof CierreRechazadoError

// Cierra la caja de una jornada, todo en una misma transacción:
//  1. toma el candado exclusivo de la caja (espera a los movimientos en curso y frena a los nuevos)
//  2. rechaza si ya hay cierre de esa fecha, si no hay movimientos o si quedan cobros en línea pendientes
//  3. RECALCULA el resumen en la base (nunca confía en lo que mostró la pantalla)
//  4. guarda el cierre (CUADRADO si lo declarado es igual a lo calculado, DESCUADRADO si no) y vincula los movimientos aprobados
// La diferencia (declarado − calculado) la calcula la base: negativa = falta efectivo, positiva = sobra.
// Devuelve { cierre, resumen, movimientosCerrados }.
export const ejecutarCierre = async ({ fecha, efectivoDeclarado, responsableId }) => {
  const cliente = await pool.connect()
  try {
    await cliente.query('begin')
    await bloquearCajaParaCierre(cliente)

    if (await cajaCerrada(fecha, cliente)) {
      throw new CierreRechazadoError('YA_CERRADA', 'La caja de esa jornada ya fue cerrada')
    }
    const resumen = await resumenDeLaJornada(fecha, cliente)
    if (resumen.sinMovimientos) {
      throw new CierreRechazadoError('SIN_MOVIMIENTOS', 'No hay movimientos aprobados para cerrar en esa jornada')
    }
    if (resumen.pendientesEnLinea.length > 0) {
      throw new CierreRechazadoError('COBROS_PENDIENTES', 'Hay cobros en línea pendientes de acreditar: esperá a que se acrediten o cancelalos antes de cerrar', {
        pendientes: resumen.pendientesEnLinea,
      })
    }

    const estado = centavos(efectivoDeclarado) === centavos(resumen.efectivoCalculado) ? 'CUADRADO' : 'DESCUADRADO'
    const { rows } = await cliente.query(
      `insert into cierre_caja (responsable_usuario_id, fecha, efectivo_calculado, efectivo_declarado, total_digital, estado)
       values ($1, $2::date, $3, $4, $5, $6) returning id`,
      [responsableId, fecha, resumen.efectivoCalculado, efectivoDeclarado, resumen.totalDigital, estado]
    )
    const id = rows[0].id
    // Desde acá el disparador de la base impide modificar o borrar estos movimientos
    const vinculados = await cliente.query(
      `update transaccion_caja set cierre_caja_id = $1
        where estado = 'APROBADO' and cierre_caja_id is null
          and fecha_hora >= $2::date::timestamp at time zone 'America/Argentina/Cordoba'
          and fecha_hora < ($2::date + 1)::timestamp at time zone 'America/Argentina/Cordoba'`,
      [id, fecha]
    )
    const cierre = await buscarCierrePorFecha(fecha, cliente)
    await cliente.query('commit')
    return { cierre, resumen: { ...resumen, cerrada: true, cierre, puedeCerrar: false }, movimientosCerrados: vinculados.rowCount }
  } catch (error) {
    await cliente.query('rollback').catch(() => {})
    // Dos cierres de la misma fecha a la vez: el candado los ordena, pero por si acaso se traduce la unicidad
    if (error.code === '23505') throw new CierreRechazadoError('YA_CERRADA', 'La caja de esa jornada ya fue cerrada')
    throw error
  } finally {
    cliente.release()
  }
}

// Historial de cierres, del más reciente al más antiguo. filtros: { desde, hasta (AAAA-MM-DD, inclusivos), estado, pagina, tamanio }
export const listarCierres = async ({ desde, hasta, estado, pagina, tamanio }, db = pool) => {
  const valores = []
  const agregar = (valor) => {
    valores.push(valor)
    return `$${valores.length}`
  }
  const condiciones = ['true']
  if (desde) condiciones.push(`c.fecha >= ${agregar(desde)}::date`)
  if (hasta) condiciones.push(`c.fecha <= ${agregar(hasta)}::date`)
  if (estado) condiciones.push(`c.estado = ${agregar(estado)}`)
  const donde = condiciones.join(' and ')

  const { rows: total } = await db.query(`select count(*)::int as total from cierre_caja c where ${donde}`, valores)
  const { rows } = await db.query(
    `select c.id, c.fecha::text as fecha, c.estado, c.efectivo_calculado as "efectivoCalculado", c.efectivo_declarado as "efectivoDeclarado",
            c.total_digital as "totalDigital", c.diferencia, u.nombre || ' ' || u.apellido as responsable,
            (select count(*)::int from transaccion_caja t where t.cierre_caja_id = c.id) as "cantidadMovimientos"
       from cierre_caja c join usuario u on u.id = c.responsable_usuario_id
      where ${donde}
      order by c.fecha desc
      limit ${agregar(tamanio)} offset ${agregar((pagina - 1) * tamanio)}`,
    valores
  )
  return {
    cierres: rows.map((f) => ({
      ...f,
      efectivoCalculado: Number(f.efectivoCalculado),
      efectivoDeclarado: Number(f.efectivoDeclarado),
      totalDigital: Number(f.totalDigital),
      diferencia: Number(f.diferencia),
    })),
    total: total[0].total,
  }
}

// Un cierre con el resumen de su jornada y los movimientos que quedaron cerrados con él. null si no existe.
export const obtenerCierre = async (id, db = pool) => {
  const { rows } = await db.query(`select fecha::text as fecha from cierre_caja where id = $1`, [id])
  if (!rows[0]) return null
  const fecha = rows[0].fecha
  const [resumen, movimientos] = await Promise.all([
    resumenDeLaJornada(fecha, db),
    listarMovimientos({ desde: fecha, hasta: fecha, estado: 'APROBADO', pagina: 1, tamanio: 1000 }, db),
  ])
  return { cierre: resumen.cierre, resumen, movimientos: movimientos.movimientos }
}