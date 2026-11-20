import { pool } from '../../config/conexion.bd.js'
import { buscarCierrePorFecha } from './modelo.caja.js'

const ZONA = "'America/Argentina/Cordoba'"

// Pesos con dos decimales sin errores de punto flotante (se suma en centavos)
const centavos = (monto) => Math.round(Number(monto) * 100)
const pesos = (cent) => cent / 100

// Cuenta de la jornada (CU 5.5). Es la misma que va a recalcular el cierre (M5-BE-16), por eso recibe `db`.
// Solo cuentan los movimientos APROBADOS del día (hora del club): los anulados, rechazados y pendientes no entran.
//  · efectivoCalculado = ingresos en efectivo − egresos en efectivo (lo que tendría que haber en la caja)
//  · totalDigital      = ingresos por transferencia y Mercado Pago
//  · los egresos por transferencia se informan aparte (egresosDigital) y no tocan el efectivo
// Devuelve { fecha, cerrada, cierre, sinMovimientos, cantidadMovimientos, ingresosEfectivo, egresosEfectivo, efectivoCalculado,
//   totalDigital, egresosDigital, totalIngresos, totalEgresos, porConcepto: [{ concepto, tipo, cantidad, total, efectivo, digital }],
//   pendientesEnLinea: [...], puedeCerrar }
// Si la fecha ya tiene cierre, `cierre` trae lo registrado (se muestra en solo lectura) y los totales principales son los del cierre.
export const resumenDeLaJornada = async (fecha, db = pool) => {
  const cierre = await buscarCierrePorFecha(fecha, db)
  const rango = `t.fecha_hora >= $1::date::timestamp at time zone ${ZONA} and t.fecha_hora < ($1::date + 1)::timestamp at time zone ${ZONA}`

  const { rows: grupos } = await db.query(
    `select t.concepto, t.tipo_movimiento as tipo, t.metodo_pago as "metodoPago", count(*)::int as cantidad, sum(t.monto) as total
       from transaccion_caja t
      where ${rango} and t.estado = 'APROBADO'
      group by t.concepto, t.tipo_movimiento, t.metodo_pago`,
    [fecha]
  )
  const { rows: pendientes } = await db.query(
    `select t.id, t.fecha_hora as "fechaHora", t.concepto, t.descripcion, t.monto, t.metodo_pago as "metodoPago",
            cl.nombre || ' ' || cl.apellido as cliente
       from transaccion_caja t left join usuario cl on cl.id = t.cliente_usuario_id
      where ${rango} and t.estado = 'PENDIENTE'
      order by t.fecha_hora, t.id`,
    [fecha]
  )

  let ingresosEfectivo = 0
  let egresosEfectivo = 0
  let ingresosDigital = 0
  let egresosDigital = 0
  let cantidad = 0
  const conceptos = new Map()
  for (const g of grupos) {
    const importe = centavos(g.total)
    const enEfectivo = g.metodoPago === 'EFECTIVO'
    cantidad += g.cantidad
    if (g.tipo === 'INGRESO') {
      if (enEfectivo) ingresosEfectivo += importe
      else ingresosDigital += importe
    } else if (enEfectivo) egresosEfectivo += importe
    else egresosDigital += importe

    const c = conceptos.get(g.concepto) ?? { concepto: g.concepto, tipo: g.tipo, cantidad: 0, total: 0, efectivo: 0, digital: 0 }
    c.cantidad += g.cantidad
    c.total += importe
    if (enEfectivo) c.efectivo += importe
    else c.digital += importe
    conceptos.set(g.concepto, c)
  }

  const porConcepto = [...conceptos.values()]
    .sort((a, b) => (a.tipo === b.tipo ? b.total - a.total : a.tipo === 'INGRESO' ? -1 : 1))
    .map((c) => ({ ...c, total: pesos(c.total), efectivo: pesos(c.efectivo), digital: pesos(c.digital) }))

  const pendientesEnLinea = pendientes.map((p) => ({ ...p, monto: Number(p.monto) }))
  const sinMovimientos = cantidad === 0
  return {
    fecha,
    cerrada: Boolean(cierre),
    cierre,
    sinMovimientos,
    cantidadMovimientos: cantidad,
    ingresosEfectivo: pesos(ingresosEfectivo),
    egresosEfectivo: pesos(egresosEfectivo),
    efectivoCalculado: cierre ? cierre.efectivoCalculado : pesos(ingresosEfectivo - egresosEfectivo),
    totalDigital: cierre ? cierre.totalDigital : pesos(ingresosDigital),
    egresosDigital: pesos(egresosDigital),
    totalIngresos: pesos(ingresosEfectivo + ingresosDigital),
    totalEgresos: pesos(egresosEfectivo + egresosDigital),
    porConcepto,
    pendientesEnLinea,
    // Se puede cerrar una jornada abierta, con movimientos y sin cobros en línea pendientes de acreditar (CU 5.5 · 8a)
    puedeCerrar: !cierre && !sinMovimientos && pendientesEnLinea.length === 0,
  }
}

// Jornadas anteriores a hoy que tienen movimientos aprobados y todavía no se cerraron, de la más reciente a la más antigua.
export const fechasAbiertas = async (db = pool) => {
  const { rows } = await db.query(
    `select (t.fecha_hora at time zone ${ZONA})::date::text as fecha, count(*)::int as movimientos,
            coalesce(sum(t.monto) filter (where t.metodo_pago = 'EFECTIVO' and t.tipo_movimiento = 'INGRESO'), 0)
- coalesce(sum(t.monto) filter (where t.metodo_pago = 'EFECTIVO' and t.tipo_movimiento = 'EGRESO'), 0) as "efectivoCalculado"
       from transaccion_caja t
      where t.estado = 'APROBADO'
        and (t.fecha_hora at time zone ${ZONA})::date < current_date
        and not exists (select 1 from cierre_caja c where c.fecha = (t.fecha_hora at time zone ${ZONA})::date)
      group by 1
      order by 1 desc
      limit 90`
  )
  return rows.map((f) => ({ ...f, efectivoCalculado: Number(f.efectivoCalculado) }))
}