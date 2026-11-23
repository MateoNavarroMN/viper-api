import ExcelJS from 'exceljs'
import { ETIQUETA_MEDIO, ETIQUETA_RUBRO, ETIQUETA_TIPO, fechaEscrita, rubroEscrito } from './etiquetas.reportes.js'
import { movimientosDelPeriodo } from './modelo.detalle.reportes.js'
import { generarBalance } from './modelo.reportes.js'

// Informe financiero en Excel (CU 6.2): una hoja «Resumen» (balance del período y desglose por rubro y por medio de pago) y una
// hoja «Detalle» con cada movimiento. El resumen sale de `generarBalance`, la misma función de la vista previa y del panel,
// así que los números nunca difieren.

const FORMATO_PESOS = '"$" #,##0.00;[Red]-"$" #,##0.00'
const FORMATO_FECHA_HORA = 'dd/mm/yyyy hh:mm'
const COLOR_ENCABEZADO = 'FF1F2937'
const COLOR_TITULO = 'FF10B981'

export const nombreDelExcel = (desde, hasta) => `viper-reporte-${desde}-${hasta}.xlsx`

const encabezado = (fila) => {
  fila.font = { bold: true, color: { argb: 'FFFFFFFF' } }
  fila.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_ENCABEZADO } }
  fila.alignment = { vertical: 'middle' }
}

// Devuelve { buffer, nombre, balance }. Quien llama ya controló las fechas y que haya movimientos.
export const exportarExcel = async (desde, hasta, rubro = null) => {
  const balance = await generarBalance(desde, hasta, rubro)
  const movimientos = await movimientosDelPeriodo(desde, hasta, rubro)

  const libro = new ExcelJS.Workbook()
  libro.creator = 'Viper'
  libro.created = new Date()

  // ---- Hoja Resumen ----
  const resumen = libro.addWorksheet('Resumen')
  resumen.columns = [{ width: 28 }, { width: 18 }, { width: 18 }, { width: 14 }]

  resumen.addRow(['Viper · Informe financiero']).font = { bold: true, size: 16, color: { argb: COLOR_TITULO } }
  resumen.addRow(['Período', `${fechaEscrita(desde)} a ${fechaEscrita(hasta)}`])
  resumen.addRow(['Rubro', rubroEscrito(rubro)])
  resumen.addRow(['Solo movimientos aprobados'])
  resumen.addRow([])

  encabezado(resumen.addRow(['Balance del período', 'Importe']))
  const filaIngresos = resumen.addRow(['Total de ingresos', balance.totalIngresos])
  const filaEgresos = resumen.addRow(['Total de egresos', balance.totalEgresos])
  const filaSaldo = resumen.addRow(['Saldo (ingresos menos egresos)', balance.saldo])
  filaSaldo.font = { bold: true }
  for (const f of [filaIngresos, filaEgresos, filaSaldo]) f.getCell(2).numFmt = FORMATO_PESOS
  const filaCantidad = resumen.addRow(['Movimientos incluidos', balance.cantidadMovimientos])
  filaCantidad.getCell(2).numFmt = '0'
  resumen.addRow([])

  encabezado(resumen.addRow(['Por rubro', 'Ingresos', 'Egresos', 'Movimientos']))
  for (const r of balance.porRubro) {
    const fila = resumen.addRow([ETIQUETA_RUBRO[r.rubro], r.ingresos, r.egresos, r.cantidad])
    fila.getCell(2).numFmt = FORMATO_PESOS
    fila.getCell(3).numFmt = FORMATO_PESOS
  }
  resumen.addRow([])

  encabezado(resumen.addRow(['Por medio de pago', 'Ingresos', 'Egresos']))
  for (const m of balance.porMedio) {
    const fila = resumen.addRow([ETIQUETA_MEDIO[m.medio], m.ingresos, m.egresos])
    fila.getCell(2).numFmt = FORMATO_PESOS
    fila.getCell(3).numFmt = FORMATO_PESOS
  }

  // ---- Hoja Detalle ----
  const detalle = libro.addWorksheet('Detalle', { views: [{ state: 'frozen', ySplit: 1 }] })
  detalle.columns = [
    { header: 'Fecha y hora', key: 'fechaHora', width: 18, style: { numFmt: FORMATO_FECHA_HORA } },
    { header: 'Tipo', key: 'tipo', width: 10 },
    { header: 'Concepto', key: 'concepto', width: 14 },
    { header: 'Descripción', key: 'descripcion', width: 40 },
    { header: 'Monto', key: 'monto', width: 16, style: { numFmt: FORMATO_PESOS } },
    { header: 'Medio de pago', key: 'medio', width: 16 },
    { header: 'Cliente', key: 'cliente', width: 24 },
    { header: 'Operador', key: 'operador', width: 24 },
  ]
  encabezado(detalle.getRow(1))
  for (const m of movimientos) {
    detalle.addRow({
      fechaHora: m.fechaHora,
      tipo: ETIQUETA_TIPO[m.tipo],
      concepto: ETIQUETA_RUBRO[m.concepto],
      descripcion: m.descripcion ?? '',
      monto: m.monto,
      medio: ETIQUETA_MEDIO[m.metodoPago],
      cliente: m.cliente ?? '',
      operador: m.operador ?? '',
    })
  }
  detalle.autoFilter = { from: 'A1', to: 'H1' }

  return { buffer: Buffer.from(await libro.xlsx.writeBuffer()), nombre: nombreDelExcel(desde, hasta), balance }
}