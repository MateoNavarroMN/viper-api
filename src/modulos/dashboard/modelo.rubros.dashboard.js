import { listarMovimientos } from '../caja/modelo.movimientos.caja.js'

// Detalle de un rubro del balance (CU 6.1 · 13): los movimientos que lo componen. Son los mismos que suma el balance
// (los APROBADOS), así que el total del detalle coincide con el del rubro en el panel. Solo lectura.
// Devuelve { movimientos, total, totales: { ingresos, egresos, saldo } }; sin movimientos, lista vacía y ceros.
export const movimientosDeUnRubro = (rubro, desde, hasta, pagina, tamanio) =>
  listarMovimientos({ desde, hasta, concepto: rubro, estado: 'APROBADO', pagina, tamanio })