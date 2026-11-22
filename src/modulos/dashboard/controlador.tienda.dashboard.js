import { esFechaValida } from '../caja/validaciones.caja.js'
import { validarFiltros } from '../reportes/modelo.reportes.js'
import { resumenDeTienda } from './modelo.tienda.dashboard.js'

// GET /api/dashboard/tienda?desde=AAAA-MM-DD&hasta=AAAA-MM-DD  (Administrador)
// Ventas del período (cantidad y monto), los 5 productos más vendidos y los productos activos con stock agotado o bajo (5 unidades o menos).
// Sin fechas: el mes actual. Un período sin ventas devuelve ceros (`ventas.sinVentas: true`).
//  400 fecha inválida, «La fecha desde no puede ser posterior a la fecha hasta» o período de más de 366 días
export const tienda = async (req, res) => {
  try {
    const filtros = await validarFiltros({ desde: req.query.desde, hasta: req.query.hasta }, esFechaValida)
    if (filtros.error) return res.status(400).json(filtros.error)
    return res.status(200).json(await resumenDeTienda(filtros.desde, filtros.hasta))
  } catch (error) {
    console.error(error)
    return res.status(500).json({ mensaje: 'No se pudo obtener la información de la tienda' })
  }
}