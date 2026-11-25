import { MENSAJE_CAJA_CERRADA } from '../caja/modelo.caja.js'
import { leerLineas } from './lineas.pos.js'
import { listarProductosPos, registrarVenta } from './modelo.pos.js'

const CATEGORIAS = ['PRO_SHOP', 'BUFFET']
const NOMBRE_MAXIMO = 100
const METODOS_DE_PAGO = ['EFECTIVO', 'TRANSFERENCIA'] // el punto de venta no cobra con Mercado Pago

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

// POST /api/pos/ventas  (Recepcionista y Administrador)
// { lineas: [{ productoId, cantidad }], metodoPago: 'EFECTIVO' | 'TRANSFERENCIA' }
// Registra la venta de mostrador: el ingreso en la caja de hoy, el detalle de cada producto y el descuento de stock, todo junto.
// (El cobro con Mercado Pago no pasa por acá: se inicia en POST /api/pagos/mercadopago con concepto TIENDA.)
export const registrarVentaPos = async (req, res) => {
  const { lineas, metodoPago } = req.body ?? {}

  const leidas = leerLineas(lineas)
  if (leidas.error) return res.status(400).json({ mensaje: leidas.error.mensaje, campo: 'lineas', ...(leidas.error.linea !== undefined && { linea: leidas.error.linea }) })
  if (!METODOS_DE_PAGO.includes(metodoPago)) return res.status(400).json({ mensaje: 'El medio de pago debe ser EFECTIVO o TRANSFERENCIA', campo: 'metodoPago' })

  try {
    const r = await registrarVenta({
      lineas: leidas.lineas,
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