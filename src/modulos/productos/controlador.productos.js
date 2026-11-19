import { cambiarEstadoProducto, crearProducto, editarProducto, listarProductos, obtenerProducto } from './modelo.productos.js'
import { CATEGORIAS, validarCambiosProducto, validarProducto } from './validaciones.productos.js'
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

const REGEX_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const NO_ENCONTRADO = { mensaje: 'Producto no encontrado' }
const DUPLICADO = { mensaje: 'Ya existe un producto activo con ese nombre en la categoría', campo: 'nombre' }

// PATCH /api/productos/:id  — JSON, o multipart/form-data con el archivo opcional «imagen».
// Campos opcionales: nombre, precio, categoria, disponibleParaAlquiler, precioAlquiler, quitarImagen.
// El stock no se edita acá. El precio nuevo rige solo hacia adelante: las ventas ya registradas conservan el suyo.
// Con un archivo nuevo se reemplaza la imagen; con quitarImagen=true se quita. Si vienen las dos, gana el archivo.
export const editar = async (req, res) => {
  const { id } = req.params
  if (!REGEX_UUID.test(id)) return res.status(404).json(NO_ENCONTRADO)

  const quitarCrudo = req.body?.quitarImagen
  if (quitarCrudo !== undefined && !['true', 'false', true, false].includes(quitarCrudo)) {
    return res.status(400).json({ mensaje: 'quitarImagen tiene que ser verdadero o falso', campo: 'quitarImagen' })
  }
  const quitarImagen = quitarCrudo === true || quitarCrudo === 'true'

  let imagenNueva = null
  try {
    const actual = await obtenerProducto(id)
    if (!actual) return res.status(404).json(NO_ENCONTRADO)

    const { error, datos } = validarCambiosProducto(req.body, actual)
    if (error) return res.status(400).json(error)

    if (req.file) {
      const tipo = tipoDeImagen(req.file.buffer)
      if (!tipo) return res.status(400).json(ERROR_TIPO_IMAGEN)
      imagenNueva = await subirImagenProducto(req.file.buffer, tipo)
      datos.imagenUrl = imagenNueva
    } else if (quitarImagen) {
      datos.imagenUrl = null
    }
    if (Object.keys(datos).length === 0) {
      return res.status(200).json({ mensaje: 'No hay cambios para guardar', producto: actual })
    }

    const r = await editarProducto(id, datos)
    if (r.resultado !== 'EDITADO') {
      await borrarImagenProducto(imagenNueva) // no deja un archivo huérfano
      if (r.resultado === 'NO_ENCONTRADO') return res.status(404).json(NO_ENCONTRADO)
      if (r.resultado === 'DUPLICADO') return res.status(409).json(DUPLICADO)
      return res.status(400).json({ mensaje: 'El precio de alquiler tiene que ser mayor a cero', campo: 'precioAlquiler' })
    }

    // Ya guardado el cambio: el archivo viejo deja de hacer falta
    if (datos.imagenUrl !== undefined && r.imagenAnterior && r.imagenAnterior !== r.producto.imagenUrl) {
      await borrarImagenProducto(r.imagenAnterior)
    }
    const precioCambio = datos.precio !== undefined && datos.precio !== r.precioAnterior
    return res.status(200).json({
      mensaje: precioCambio
        ? 'Producto actualizado. El nuevo precio rige para las ventas que se registren desde ahora'
        : 'Producto actualizado correctamente',
      producto: r.producto,
      precioAnterior: r.precioAnterior,
    })
  } catch (e) {
    console.error(e)
    await borrarImagenProducto(imagenNueva)
    return res.status(500).json({ mensaje: 'No se pudo actualizar el producto' })
  }
}

const cambiarEstado = (activo) => async (req, res) => {
  const { id } = req.params
  if (!REGEX_UUID.test(id)) return res.status(404).json(NO_ENCONTRADO)
  try {
    const r = await cambiarEstadoProducto(id, activo)
    if (r.resultado === 'NO_ENCONTRADO') return res.status(404).json(NO_ENCONTRADO)
    if (r.resultado === 'YA_ESTA') return res.status(409).json({ mensaje: activo ? 'El producto ya está activo' : 'El producto ya está dado de baja' })
    if (r.resultado === 'DUPLICADO') {
      return res.status(409).json({ mensaje: 'No se puede reactivar: ya existe otro producto activo con ese nombre en la categoría', campo: 'nombre' })
    }
    return res.status(200).json({
      mensaje: activo ? 'Producto reactivado' : 'Producto dado de baja. Deja de mostrarse en la tienda y el punto de venta, y su historial de ventas se conserva',
      producto: r.producto,
    })
  } catch (e) {
    console.error(e)
    return res.status(500).json({ mensaje: activo ? 'No se pudo reactivar el producto' : 'No se pudo dar de baja el producto' })
  }
}

// POST /api/productos/:id/baja  ·  POST /api/productos/:id/reactivar
export const darDeBaja = cambiarEstado(false)
export const reactivar = cambiarEstado(true)