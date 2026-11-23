import PDFDocument from 'pdfkit'
import { ETIQUETA_MEDIO, ETIQUETA_RUBRO, fechaEscrita, rubroEscrito } from './etiquetas.reportes.js'
import { generarBalance } from './modelo.reportes.js'

// Informe financiero en PDF (CU 6.2): el balance del período y su desglose por rubro y por medio de pago, en una o dos páginas.
// No incluye el detalle de cada movimiento (eso va en el Excel). Usa `generarBalance`, igual que el Excel y la vista previa.

const FORMATO = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
// Con la fuente estándar del PDF no existe el signo «−» tipográfico: se usa el guion común
const pesos = (valor) => (valor < 0 ? `-$ ${FORMATO.format(-valor)}` : `$ ${FORMATO.format(valor)}`)

const VERDE = '#059669'
const GRIS = '#6B7280'
const OSCURO = '#111827'
const MARGEN = 50

export const nombreDelPDF = (desde, hasta) => `viper-informe-${desde}-${hasta}.pdf`

// Dibuja una tabla simple: columnas = [{ titulo, ancho, alinear }], filas = arreglos de texto
const tabla = (doc, columnas, filas) => {
  const ancho = columnas.reduce((suma, c) => suma + c.ancho, 0)
  const fila = (celdas, { negrita = false, fondo = null, color = OSCURO } = {}) => {
    if (doc.y > doc.page.height - 90) doc.addPage()
    const y = doc.y
    if (fondo) doc.rect(MARGEN, y - 3, ancho, 20).fill(fondo)
    doc.fillColor(color).font(negrita ? 'Helvetica-Bold' : 'Helvetica').fontSize(10)
    let x = MARGEN
    columnas.forEach((c, i) => {
      doc.text(celdas[i], x + 6, y + 2, { width: c.ancho - 12, align: c.alinear ?? 'left', lineBreak: false })
      x += c.ancho
    })
    doc.y = y + 20
  }
  fila(columnas.map((c) => c.titulo), { negrita: true, fondo: OSCURO, color: '#FFFFFF' })
  filas.forEach((celdas, i) => fila(celdas, { fondo: i % 2 ? '#F3F4F6' : null }))
  doc.moveDown(0.8)
}

const titulo = (doc, texto) => {
  if (doc.y > doc.page.height - 140) doc.addPage()
  doc.moveDown(0.6).fillColor(VERDE).font('Helvetica-Bold').fontSize(13).text(texto, MARGEN)
  doc.moveDown(0.4)
}

// Devuelve { buffer, nombre, balance }. Quien llama ya controló las fechas y que haya movimientos.
export const exportarPDF = async (desde, hasta, rubro = null) => {
  const balance = await generarBalance(desde, hasta, rubro)

  const doc = new PDFDocument({ size: 'A4', margin: MARGEN, info: { Title: 'Viper · Informe financiero', Author: 'Viper' } })
  const partes = []
  doc.on('data', (parte) => partes.push(parte))
  const terminado = new Promise((resolver, rechazar) => {
    doc.on('end', resolver)
    doc.on('error', rechazar)
  })

  // Encabezado con el período
  doc.fillColor(VERDE).font('Helvetica-Bold').fontSize(20).text('Viper · Informe financiero', MARGEN)
  doc.moveDown(0.3).fillColor(OSCURO).font('Helvetica').fontSize(12).text(`Período: ${fechaEscrita(desde)} a ${fechaEscrita(hasta)}`)
  doc.text(`Rubro: ${rubroEscrito(rubro)}`)
  doc.fillColor(GRIS).fontSize(9).text('Solo movimientos aprobados.')

  titulo(doc, 'Balance del período')
  tabla(
    doc,
    [{ titulo: 'Concepto', ancho: 300 }, { titulo: 'Importe', ancho: 195, alinear: 'right' }],
    [
      ['Total de ingresos', pesos(balance.totalIngresos)],
      ['Total de egresos', pesos(balance.totalEgresos)],
      ['Saldo (ingresos menos egresos)', pesos(balance.saldo)],
      ['Movimientos incluidos', String(balance.cantidadMovimientos)],
    ]
  )

  titulo(doc, 'Desglose por rubro')
  tabla(
    doc,
    [{ titulo: 'Rubro', ancho: 175 }, { titulo: 'Ingresos', ancho: 130, alinear: 'right' }, { titulo: 'Egresos', ancho: 130, alinear: 'right' }, { titulo: 'Mov.', ancho: 60, alinear: 'right' }],
    balance.porRubro.map((r) => [ETIQUETA_RUBRO[r.rubro], pesos(r.ingresos), pesos(r.egresos), String(r.cantidad)])
  )

  titulo(doc, 'Desglose por medio de pago')
  tabla(
    doc,
    [{ titulo: 'Medio de pago', ancho: 235 }, { titulo: 'Ingresos', ancho: 130, alinear: 'right' }, { titulo: 'Egresos', ancho: 130, alinear: 'right' }],
    balance.porMedio.map((m) => [ETIQUETA_MEDIO[m.medio], pesos(m.ingresos), pesos(m.egresos)])
  )

  doc.fillColor(GRIS).font('Helvetica').fontSize(8)
    .text('El informe no incluye el detalle de cada movimiento: para obtenerlo, exportá el reporte a Excel.', MARGEN, doc.y + 6, { width: 495 })
  doc.text(`Generado el ${new Date().toLocaleString('es-AR', { timeZone: 'America/Argentina/Cordoba' })}`, MARGEN, doc.y + 4)

  doc.end()
  await terminado
  return { buffer: Buffer.concat(partes), nombre: nombreDelPDF(desde, hasta), balance }
}