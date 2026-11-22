import { pool } from '../../config/conexion.bd.js'

// Bloque «Tienda» del panel de control (CU 6.1): ventas del período, productos más vendidos y productos con poco stock. Solo lectura.

const ZONA = "'America/Argentina/Cordoba'"

// Un producto activo con 5 unidades o menos tiene el stock bajo; sin unidades, está agotado.
export const STOCK_BAJO = 5
const MAS_VENDIDOS = 5

// Pesos con dos decimales sin errores de punto flotante (se suma en centavos)
const pesos = (monto) => Math.round(Number(monto) * 100) / 100

// Tienda del período [desde, hasta] (fechas AAAA-MM-DD, día del club en Córdoba).
// Solo cuentan las ventas APROBADAS: una venta anulada no figura ni en las ventas ni en los más vendidos.
//   ventas:      { cantidad, monto, sinVentas }
//   masVendidos: [{ productoId, nombre, categoria, unidades, monto }]   (los 5 con más unidades, del período)
//   stock:       { umbral, agotados: [...], bajos: [...] }              (productos ACTIVOS; cada uno { id, nombre, categoria, stockActual })
// Un período sin ventas devuelve ceros y listas vacías; el stock no depende del período.
export const resumenDeTienda = async (desde, hasta, db = pool) => {
  const periodo = `t.estado = 'APROBADO' and t.tipo_movimiento = 'INGRESO' and t.concepto = 'TIENDA'
        and t.fecha_hora >= $1::date::timestamp at time zone ${ZONA} and t.fecha_hora < ($2::date + 1)::timestamp at time zone ${ZONA}`

  const { rows: totales } = await db.query(
    `select count(*)::int as cantidad, coalesce(sum(t.monto), 0) as monto from transaccion_caja t where ${periodo}`,
    [desde, hasta]
  )
  const { rows: vendidos } = await db.query(
    `select p.id as "productoId", p.nombre, p.categoria, sum(d.cantidad)::int as unidades, sum(d.subtotal) as monto
       from detalle_venta d
       join transaccion_caja t on t.id = d.transaccion_id
       join producto p on p.id = d.producto_id
      where ${periodo}
      group by p.id
      order by unidades desc, monto desc, p.nombre
      limit ${MAS_VENDIDOS}`,
    [desde, hasta]
  )
  const { rows: poco } = await db.query(
    `select id, nombre, categoria, stock_actual as "stockActual"
       from producto where activo and stock_actual <= $1
      order by stock_actual, nombre`,
    [STOCK_BAJO]
  )

  return {
    desde,
    hasta,
    ventas: { cantidad: totales[0].cantidad, monto: pesos(totales[0].monto), sinVentas: totales[0].cantidad === 0 },
    masVendidos: vendidos.map((v) => ({ ...v, monto: pesos(v.monto) })),
    stock: {
      umbral: STOCK_BAJO,
      agotados: poco.filter((p) => p.stockActual === 0),
      bajos: poco.filter((p) => p.stockActual > 0),
    },
  }
}