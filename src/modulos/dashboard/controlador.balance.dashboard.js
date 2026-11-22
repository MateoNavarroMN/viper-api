import { esFechaValida } from '../caja/validaciones.caja.js'
import { generarBalance, validarFiltros } from '../reportes/modelo.reportes.js'

// GET /api/dashboard/balance?desde=AAAA-MM-DD&hasta=AAAA-MM-DD&rubro=TIENDA  (Administrador)
// Balance de ingresos y egresos aprobados del período, con su desglose por rubro y por medio de pago y la evolución diaria.
// Sin parámetros: el mes actual y todos los rubros. Un período sin movimientos devuelve ceros (`sinMovimientos: true`).
//  400 fecha inválida, «La fecha desde no puede ser posterior a la fecha hasta», período de más de 366 días o rubro inexistente
export const balance = async (req, res) => {
  try {
    const filtros = await validarFiltros(req.query, esFechaValida)
    if (filtros.error) return res.status(400).json(filtros.error)
    return res.status(200).json(await generarBalance(filtros.desde, filtros.hasta, filtros.rubro))
  } catch (error) {
    console.error(error)
    return res.status(500).json({ mensaje: 'No se pudo obtener el balance' })
  }
}