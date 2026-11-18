export const CATEGORIAS = ['PRO_SHOP', 'BUFFET']

const NOMBRE_MAXIMO = 80
const PRECIO_MAXIMO = 9999999999.99 // numeric(12,2)
const STOCK_MAXIMO = 1000000

const invalido = (campo, mensaje) => ({ error: { mensaje, campo } })

// «  Pelota   Head » → «Pelota Head»
export const limpiarNombre = (valor) => (typeof valor === 'string' ? valor.trim().replace(/\s+/g, ' ') : '')

// Acepta un número o un texto como «1500», «1500.5» o «1500,50» (un formulario multipart manda todo como texto).
// Devuelve { valor } con dos decimales, o { error } con el motivo.
const leerMonto = (crudo, nombre) => {
  const numero = typeof crudo === 'number'
    ? crudo
    : typeof crudo === 'string' && /^-?\d+([.,]\d{1,2})?$/.test(crudo.trim()) ? Number(crudo.trim().replace(',', '.')) : NaN
  if (!Number.isFinite(numero)) return { error: `${nombre} debe ser un número` }
  if (numero < 0) return { error: `${nombre} no puede ser negativo` }
  if (numero > PRECIO_MAXIMO) return { error: `${nombre} es demasiado grande` }
  return { valor: Math.round(numero * 100) / 100 }
}

const leerBooleano = (crudo) => {
  if (crudo === true || crudo === 'true') return true
  if (crudo === false || crudo === 'false' || crudo === undefined || crudo === '') return false
  return null
}

// Valida el cuerpo de un alta (CU 5.1 · pasos 6 a 8). Devuelve { datos } o { error: { mensaje, campo } }, en el orden del formulario.
export const validarProducto = (cuerpo) => {
  const c = cuerpo ?? {}
  const datos = {}

  const nombre = limpiarNombre(c.nombre)
  if (!nombre) return invalido('nombre', 'El nombre es obligatorio')
  if (nombre.length > NOMBRE_MAXIMO) return invalido('nombre', `El nombre admite hasta ${NOMBRE_MAXIMO} caracteres`)
  datos.nombre = nombre

  if (c.precio === undefined || c.precio === '') return invalido('precio', 'El precio es obligatorio')
  const precio = leerMonto(c.precio, 'El precio')
  if (precio.error) return invalido('precio', precio.error)
  datos.precio = precio.valor

  if (!CATEGORIAS.includes(c.categoria)) return invalido('categoria', 'La categoría debe ser PRO_SHOP o BUFFET')
  datos.categoria = c.categoria

  if (c.stockActual === undefined || c.stockActual === '') return invalido('stockActual', 'El stock inicial es obligatorio')
  const stockTexto = typeof c.stockActual === 'string' ? c.stockActual.trim() : c.stockActual
  const stock = typeof stockTexto === 'string' && /^-?\d+$/.test(stockTexto) ? Number(stockTexto) : stockTexto
  if (!Number.isInteger(stock)) return invalido('stockActual', 'El stock debe ser un número entero')
  if (stock < 0) return invalido('stockActual', 'El stock no puede ser negativo')
  if (stock > STOCK_MAXIMO) return invalido('stockActual', `El stock no puede superar ${STOCK_MAXIMO}`)
  datos.stockActual = stock

  const alquilable = leerBooleano(c.disponibleParaAlquiler)
  if (alquilable === null) return invalido('disponibleParaAlquiler', 'disponibleParaAlquiler tiene que ser verdadero o falso')
  datos.disponibleParaAlquiler = alquilable

  if (alquilable) {
    if (c.precioAlquiler === undefined || c.precioAlquiler === '') return invalido('precioAlquiler', 'Ingresá el precio de alquiler por turno')
    const alquiler = leerMonto(c.precioAlquiler, 'El precio de alquiler')
    if (alquiler.error) return invalido('precioAlquiler', alquiler.error)
    if (alquiler.valor <= 0) return invalido('precioAlquiler', 'El precio de alquiler tiene que ser mayor a cero')
    datos.precioAlquiler = alquiler.valor
  } else {
    datos.precioAlquiler = null
  }
  return { datos }
}