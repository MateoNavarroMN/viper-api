import { listarCatalogo, obtenerProductoActivo } from './modelo.tienda.js'

const CATEGORIAS = ['PRO_SHOP', 'BUFFET']
const ORDENES = ['nombre', 'precio']
const DIRECCIONES = ['asc', 'desc']
const NOMBRE_MAXIMO = 100
const TAMANIO_POR_DEFECTO = 12
const TAMANIO_MAXIMO = 50
const REGEX_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const invalido = (res, mensaje, campo) => res.status(400).json({ mensaje: `Parámetro inválido: ${mensaje}`, campo })

// Un parámetro de query tiene que venir una sola vez y como texto (?q=a&q=b llega como arreglo)
const texto = (valor) => (typeof valor === 'string' ? valor.trim() : undefined)

// Entero positivo escrito solo con dígitos; si no viene, usa el valor por defecto; si viene mal, null
const entero = (valor, porDefecto) => {
  if (valor === undefined) return porDefecto
  return typeof valor === 'string' && /^\d{1,6}$/.test(valor) && Number(valor) >= 1 ? Number(valor) : null
}

// Monto desde 0, con coma o punto decimal («1500», «1500.5», «1500,50»); si no viene, undefined; si viene mal, null
const monto = (valor) => {
  if (valor === undefined) return undefined
  if (typeof valor !== 'string' || !/^\d{1,10}([.,]\d{1,2})?$/.test(valor.trim())) return null
  return Number(valor.trim().replace(',', '.'))
}

// GET /api/tienda/catalogo?q=&categoria=&precioMin=&precioMax=&orden=nombre|precio&direccion=asc|desc&pagina=&tamanio=  (solo Jugador)
// { productos, total, pagina, tamanio, hayMas }. Sin coincidencias es una lista vacía, no un error.
export const catalogo = async (req, res) => {
  const { q, categoria, orden = 'nombre', direccion = 'asc' } = req.query
  if (q !== undefined && (texto(q) === undefined || texto(q).length > NOMBRE_MAXIMO)) return invalido(res, `q tiene que ser un texto de hasta ${NOMBRE_MAXIMO} caracteres`, 'q')
  if (categoria !== undefined && !CATEGORIAS.includes(categoria)) return invalido(res, 'la categoría debe ser PRO_SHOP o BUFFET', 'categoria')
  if (!ORDENES.includes(orden)) return invalido(res, 'el orden debe ser nombre o precio', 'orden')
  if (!DIRECCIONES.includes(direccion)) return invalido(res, 'la dirección debe ser asc o desc', 'direccion')

  const precioMin = monto(req.query.precioMin)
  if (precioMin === null) return invalido(res, 'el precio mínimo debe ser un monto desde 0', 'precioMin')
  const precioMax = monto(req.query.precioMax)
  if (precioMax === null) return invalido(res, 'el precio máximo debe ser un monto desde 0', 'precioMax')
  if (precioMin !== undefined && precioMax !== undefined && precioMin > precioMax) return invalido(res, 'el precio mínimo no puede superar al máximo', 'precioMin')

  const pagina = entero(req.query.pagina, 1)
  if (pagina === null) return invalido(res, 'la página debe ser un número desde 1', 'pagina')
  const tamanio = entero(req.query.tamanio, TAMANIO_POR_DEFECTO)
  if (tamanio === null || tamanio > TAMANIO_MAXIMO) return invalido(res, `el tamaño debe estar entre 1 y ${TAMANIO_MAXIMO}`, 'tamanio')

  try {
    const r = await listarCatalogo({ q: texto(q), categoria, precioMin, precioMax, orden, direccion, pagina, tamanio })
    return res.status(200).json({ ...r, pagina, tamanio })
  } catch (error) {
    console.error(error)
    return res.status(500).json({ mensaje: 'No se pudo obtener el catálogo de la tienda' })
  }
}

// GET /api/tienda/catalogo/:id  (solo Jugador). Un producto dado de baja (o inexistente) es 404: la pantalla vuelve al listado.
export const detalle = async (req, res) => {
  const { id } = req.params
  const NO_DISPONIBLE = { mensaje: 'El producto ya no está disponible' }
  if (!REGEX_UUID.test(id)) return res.status(404).json(NO_DISPONIBLE)
  try {
    const producto = await obtenerProductoActivo(id)
    if (!producto) return res.status(404).json(NO_DISPONIBLE)
    return res.status(200).json({ producto })
  } catch (error) {
    console.error(error)
    return res.status(500).json({ mensaje: 'No se pudo obtener el producto' })
  }
}