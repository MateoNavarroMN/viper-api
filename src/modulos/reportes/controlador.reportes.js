import { esFechaValida } from '../caja/validaciones.caja.js'
import { exportarExcel } from './exportar.excel.reportes.js'
import { exportarPDF } from './exportar.pdf.reportes.js'
import { generarBalance, validarFiltros } from './modelo.reportes.js'

// Reportes financieros (CU 6.2), solo Administrador. Las tres rutas reciben ?desde=AAAA-MM-DD&hasta=AAAA-MM-DD&rubro= (rubro opcional).
// A diferencia del panel, acá las dos fechas son obligatorias: se exporta un período elegido, no «el mes actual».

// Devuelve { error } con el mensaje, o { desde, hasta, rubro } ya controlados
const controlarFiltros = async (query) => {
  for (const [campo, texto] of [['desde', 'desde'], ['hasta', 'hasta']]) {
    if (!query[campo]) return { error: { mensaje: `Falta la fecha ${texto}`, campo } }
  }
  return validarFiltros(query, esFechaValida)
}

const SIN_MOVIMIENTOS = { mensaje: 'No hay movimientos en el período' }

// GET /api/reportes/vista-previa  →  { desde, hasta, rubro, totalIngresos, totalEgresos, saldo, cantidadMovimientos, sinMovimientos }
// Los mismos números que traerá el archivo (los calcula `generarBalance`). Sin movimientos responde 200 con `sinMovimientos: true`
// para que la pantalla lo informe y no habilite la exportación.
//  400 falta una fecha, fecha inválida, desde posterior a hasta, período de más de 366 días o rubro inexistente
export const vistaPrevia = async (req, res) => {
  try {
    const filtros = await controlarFiltros(req.query)
    if (filtros.error) return res.status(400).json(filtros.error)
    const b = await generarBalance(filtros.desde, filtros.hasta, filtros.rubro)
    return res.status(200).json({
      desde: b.desde,
      hasta: b.hasta,
      rubro: b.rubro,
      totalIngresos: b.totalIngresos,
      totalEgresos: b.totalEgresos,
      saldo: b.saldo,
      cantidadMovimientos: b.cantidadMovimientos,
      sinMovimientos: b.sinMovimientos,
    })
  } catch (error) {
    console.error(error)
    return res.status(500).json({ mensaje: 'No se pudo calcular la vista previa' })
  }
}

// Arma el controlador de una exportación: controla los filtros, genera el archivo y lo devuelve como descarga
const descarga = (generar, tipo, mensajeDeError) => async (req, res) => {
  try {
    const filtros = await controlarFiltros(req.query)
    if (filtros.error) return res.status(400).json(filtros.error)
    // Sin movimientos no se genera ningún archivo
    const previo = await generarBalance(filtros.desde, filtros.hasta, filtros.rubro)
    if (previo.sinMovimientos) return res.status(409).json(SIN_MOVIMIENTOS)
    const { buffer, nombre } = await generar(filtros.desde, filtros.hasta, filtros.rubro)
    res.setHeader('Content-Type', tipo)
    res.setHeader('Content-Disposition', `attachment; filename="${nombre}"`)
    res.setHeader('Content-Length', buffer.length)
    return res.status(200).send(buffer)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ mensaje: mensajeDeError })
  }
}

// GET /api/reportes/excel  →  viper-reporte-<desde>-<hasta>.xlsx (hojas «Resumen» y «Detalle»)
//  400 igual que la vista previa · 409 «No hay movimientos en el período»
export const excel = descarga(exportarExcel, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'No se pudo generar el archivo de Excel')

// GET /api/reportes/pdf  →  viper-informe-<desde>-<hasta>.pdf (balance y desglose por rubro y medio de pago)
//  400 igual que la vista previa · 409 «No hay movimientos en el período»
export const pdf = descarga(exportarPDF, 'application/pdf', 'No se pudo generar el archivo PDF')