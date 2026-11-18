import { crearProducto, listarProductos } from './modelo.productos.js'
import { CATEGORIAS, validarProducto } from './validaciones.productos.js'

const ESTADOS = ['ACTIVO', 'INACTIVO']
const TAMANIO_POR_DEFECTO = 10
const TAMANIO_MAXIMO = 50

// Un parámetro de query tiene que venir una sola vez y como texto (?q=a&q=b llega como arreglo)
const texto = (valor) => (typeof valor === 'string' ? valor.trim() : undefined)

// Entero positivo escrito solo con dígitos; si no viene, usa el valor por defecto; si viene mal, null
const entero = (valor, porDefecto) => {
  if (valor === undefined) return porDefecto
  return typeof valor === 'string' && /^\d{1,6}$/.test(valor) && Number(valor) >= 1 ? Number(valor) : null
}

const invalido = (res, mensaje, campo) => res.status(400).json({ mensaje: `Parámetro inválido: ${mensaje}`, campo })

// GET /api/productos?q=&categoria=&estado=&pagina=&tamanio=  (CU 5.1 · paso 2 y A5; solo Administrador)
export const listar = async (req, res) => {
  const { q, categoria, estado } = req.query
  if (q !== undefined && texto(q) === undefined) return invalido(res, 'q', 'q')
  if (categoria !== undefined && !CATEGORIAS.includes(categoria)) return invalido(res, 'la categoría debe ser PRO_SHOP o BUFFET', 'categoria')
  if (estado !== undefined && !ESTADOS.includes(estado)) return invalido(res, 'el estado debe ser ACTIVO o INACTIVO', 'estado')

  const pagina = entero(req.query.pagina, 1)
  if (pagina === null) return invalido(res, 'la página debe ser un número desde 1', 'pagina')
  const tamanio = entero(req.query.tamanio, TAMANIO_POR_DEFECTO)
  if (tamanio === null || tamanio > TAMANIO_MAXIMO) return invalido(res, `el tamaño debe estar entre 1 y ${TAMANIO_MAXIMO}`, 'tamanio')

  try {
    const { productos, total } = await listarProductos({ q: texto(q), categoria, estado, pagina, tamanio })
    // A5: sin productos o sin coincidencias es una lista vacía, no un error
    return res.status(200).json({ productos, total, pagina, tamanio, totalPaginas: Math.ceil(total / tamanio) })
  } catch (error) {
    console.error(error)
    return res.status(500).json({ mensaje: 'No se pudo obtener el catálogo de productos' })
  }
}

// POST /api/productos  { nombre, precio, categoria, stockActual, disponibleParaAlquiler?, precioAlquiler? }  (CU 5.1 · pasos 6 a 9)
// La imagen se agrega en M5-BE-03.
export const crear = async (req, res) => {
  const { error, datos } = validarProducto(req.body)
  if (error) return res.status(400).json(error) // 7a

  try {
    const r = await crearProducto(datos)
    if (r.resultado === 'DUPLICADO') { // 8a
      return res.status(409).json({ mensaje: 'Ya existe un producto activo con ese nombre en la categoría', campo: 'nombre' })
    }
    return res.status(201).json({ mensaje: 'Producto registrado correctamente', producto: r.producto })
  } catch (e) {
    console.error(e)
    return res.status(500).json({ mensaje: 'No se pudo registrar el producto' })
  }
}