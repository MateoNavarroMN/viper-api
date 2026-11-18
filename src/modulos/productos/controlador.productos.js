import { crearProducto, listarProductos } from './modelo.productos.js'
import { CATEGORIAS, validarProducto } from './validaciones.productos.js'
import { ERROR_TIPO_IMAGEN, tipoDeImagen } from './imagen.productos.js'
import { borrarImagenProducto, subirImagenProducto } from '../../config/almacenamiento.supabase.js'

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

// POST /api/productos  (CU 5.1 · pasos 6 a 9). JSON, o multipart/form-data con los mismos campos y el archivo opcional «imagen».
// { nombre, precio, categoria, stockActual, disponibleParaAlquiler?, precioAlquiler? }
export const crear = async (req, res) => {
  const { error, datos } = validarProducto(req.body)
  if (error) return res.status(400).json(error) // 7a

  let imagenUrl = null
  try {
    if (req.file) {
      const tipo = tipoDeImagen(req.file.buffer)
      if (!tipo) return res.status(400).json(ERROR_TIPO_IMAGEN) // 7b: se puede reenviar sin imagen
      imagenUrl = await subirImagenProducto(req.file.buffer, tipo)
    }

    const r = await crearProducto({ ...datos, imagenUrl })
    if (r.resultado === 'DUPLICADO') { // 8a
      await borrarImagenProducto(imagenUrl) // no deja un archivo huérfano
      return res.status(409).json({ mensaje: 'Ya existe un producto activo con ese nombre en la categoría', campo: 'nombre' })
    }
    return res.status(201).json({ mensaje: 'Producto registrado correctamente', producto: r.producto })
  } catch (e) {
    console.error(e)
    await borrarImagenProducto(imagenUrl) // si la base falló después de subir la imagen, se elimina
    return res.status(500).json({ mensaje: 'No se pudo registrar el producto' })
  }
}