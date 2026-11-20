import { listarProductosPos } from './modelo.pos.js'

const CATEGORIAS = ['PRO_SHOP', 'BUFFET']
const NOMBRE_MAXIMO = 100

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