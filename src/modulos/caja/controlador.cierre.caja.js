import { fechaDeHoy } from './modelo.caja.js'
import { fechasAbiertas, resumenDeLaJornada } from './modelo.cierre.caja.js'
import { esFechaValida } from './validaciones.caja.js'

// GET /api/caja/cierre/resumen?fecha=AAAA-MM-DD  (Recepcionista y Administrador; sin fecha, la de hoy)
// La cuenta de la jornada con los movimientos aprobados: efectivo calculado, total digital, desglose por concepto y los cobros en
// línea todavía pendientes (impiden cerrar). Responde { hoy, ...resumen }:
//  · jornada ya cerrada: `cerrada: true` y `cierre` con lo registrado, para verla en solo lectura
//  · sin movimientos aprobados: `sinMovimientos: true` (y `puedeCerrar: false`)
export const resumen = async (req, res) => {
  const { fecha } = req.query
  if (fecha !== undefined && !esFechaValida(fecha)) {
    return res.status(400).json({ mensaje: 'Parámetro inválido: la fecha debe tener el formato AAAA-MM-DD', campo: 'fecha' })
  }

  try {
    const hoy = await fechaDeHoy()
    const dia = fecha ?? hoy
    if (dia > hoy) return res.status(400).json({ mensaje: 'La fecha de la jornada no puede ser futura', campo: 'fecha' })
    return res.status(200).json({ hoy, ...(await resumenDeLaJornada(dia)) })
  } catch (error) {
    console.error(error)
    return res.status(500).json({ mensaje: 'No se pudo obtener el resumen de la jornada' })
  }
}

// GET /api/caja/cierre/fechas-abiertas  (Recepcionista y Administrador)
// Las jornadas anteriores a hoy con movimientos aprobados que quedaron sin cerrar: { hoy, fechas: [{ fecha, movimientos, efectivoCalculado }] }
export const jornadasAbiertas = async (req, res) => {
  try {
    return res.status(200).json({ hoy: await fechaDeHoy(), fechas: await fechasAbiertas() })
  } catch (error) {
    console.error(error)
    return res.status(500).json({ mensaje: 'No se pudieron obtener las jornadas sin cerrar' })
  }
}