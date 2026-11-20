import { MENSAJE_CAJA_CERRADA } from '../caja/modelo.caja.js'
import { listarProductosPos, registrarVenta } from './modelo.pos.js'

const CATEGORIAS = ['PRO_SHOP', 'BUFFET']
const NOMBRE_MAXIMO = 100
const METODOS_DE_PAGO = ['EFECTIVO', 'TRANSFERENCIA'] // el punto de venta no cobra con Mercado Pago
const LINEAS_MAXIMAS = 50
const CANTIDAD_MAXIMA = 100000
const REGEX_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const invalido = (res, mensaje, campo) => res.status(400).json({ mensaje: `Parámetro inválido: ${mensaje}`, campo })

// GET /api/pos/productos?q=&categoria=  (Recepcionista y Administrador)
// Productos activos para vender, con su stock. Los de stock 0 vienen con `sinStock: true`.
export const productos = async (req, res) => {
  const { q, categoria } = req.query
  // Un parámetro de query tiene que venir una sola vez y como texto (?q=a&q=b llega como arreglo)
  if (q !== undefined && (typeof q !== 'string' || q.trim().length > NOMBRE_MAXIMO)) return invalido(res, `q tiene que ser un texto de hasta ${NOMBRE_MAXIMO} caracteres`, 'q')
  if (categoria !== undefined && !CATEGORIAS.includes(categoria)) return invalido(res, 'la categoría debe ser PRO_SHOP o BUFFET', 'categoria')

  try {
    const lista = await listarProductosPos({ q: q?.trim(), categoria })
    return res.status(200).json({ productos: lista, total: lista.length })
  } catch (error) {
    console.error(error)
    return res.status(500).json({ mensaje: 'No se pudieron obtener los productos del punto de venta' })
  }
}

const lineaInvalida = (res, indice, mensaje) => res.status(400).json({ mensaje, campo: 'lineas', linea: indice })

// POST /api/pos/ventas  (Recepcionista y Administrador)
// { lineas: [{ productoId, cantidad }], metodoPago: 'EFECTIVO' | 'TRANSFERENCIA' }
// Registra la venta de mostrador: el ingreso en la caja de hoy, el detalle de cada producto y el descuento de stock, todo junto.
export const registrarVentaPos = async (req, res) => {
  const { lineas, metodoPago } = req.body ?? {}

  if (!Array.isArray(lineas) || lineas.length === 0) return res.status(400).json({ mensaje: 'Agregá al menos un producto', campo: 'lineas' })
  if (lineas.length > LINEAS_MAXIMAS) return res.status(400).json({ mensaje: `Una venta admite hasta ${LINEAS_MAXIMAS} productos distintos`, campo: 'lineas' })

  // Un mismo producto repetido se junta en una sola línea (se suman las cantidades)
  const juntas = new Map()
  for (const [indice, linea] of lineas.entries()) {
    if (!linea || typeof linea !== 'object') return lineaInvalida(res, indice, 'La línea de la venta no es válida')
    const { productoId, cantidad } = linea
    if (typeof productoId !== 'string' || !REGEX_UUID.test(productoId)) return lineaInvalida(res, indice, 'El producto de la línea no es válido')
    if (!Number.isInteger(cantidad) || cantidad < 1) return lineaInvalida(res, indice, 'La cantidad tiene que ser un número entero mayor a cero')
    if (cantidad > CANTIDAD_MAXIMA) return lineaInvalida(res, indice, `La cantidad no puede superar ${CANTIDAD_MAXIMA}`)
    juntas.set(productoId.toLowerCase(), (juntas.get(productoId.toLowerCase()) ?? 0) + cantidad)
  }
  if (!METODOS_DE_PAGO.includes(metodoPago)) return res.status(400).json({ mensaje: 'El medio de pago debe ser EFECTIVO o TRANSFERENCIA', campo: 'metodoPago' })

  try {
    const r = await registrarVenta({
      lineas: [...juntas].map(([productoId, cantidad]) => ({ productoId, cantidad })),
      metodoPago,
      operadorId: req.usuario.id,
    })
    if (r.resultado === 'CAJA_CERRADA') return res.status(409).json({ mensaje: MENSAJE_CAJA_CERRADA })
    if (r.resultado === 'RECHAZADA') {
      const sinProducto = r.lineas.some((l) => l.motivo === 'NO_DISPONIBLE')
      const mensaje = sinProducto ? 'Hay productos que ya no están disponibles' : 'No hay stock suficiente para alguno de los productos'
      return res.status(409).json({ mensaje, campo: 'lineas', lineas: r.lineas })
    }
    if (r.resultado === 'TOTAL_CERO') return res.status(400).json({ mensaje: 'El total de la venta tiene que ser mayor a cero', campo: 'lineas' })
    return res.status(201).json({ mensaje: 'Venta registrada correctamente', venta: r.venta })
  } catch (error) {
    console.error(error)
    return res.status(500).json({ mensaje: 'No se pudo registrar la venta. No se descontó stock ni se registró el cobro' })
  }
}