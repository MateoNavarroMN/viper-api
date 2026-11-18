export const DEPORTES = ['TENIS', 'PADEL']

const NOMBRE_MAXIMO = 60
const SUPERFICIE_MAXIMA = 40
const PRECIO_MAXIMO = 9999999999.99 // numeric(12,2)

// Deja el nombre sin espacios de más: « Tenis   1 » → «Tenis 1»
export const limpiarNombre = (valor) => (typeof valor === 'string' ? valor.trim().replace(/\s+/g, ' ') : '')

// Acepta un número o un texto como «20000», «20000.5» o «20000,50». Devuelve el número con dos decimales, o null si no es un monto válido.
const leerPrecio = (valor) => {
  const numero = typeof valor === 'number' ? valor : typeof valor === 'string' && /^\d+([.,]\d{1,2})?$/.test(valor.trim()) ? Number(valor.trim().replace(',', '.')) : NaN
  if (!Number.isFinite(numero) || numero < 0 || numero > PRECIO_MAXIMO) return null
  return Math.round(numero * 100) / 100
}

const invalido = (campo, detalle) => ({ error: { mensaje: `Datos inválidos: ${detalle}`, campo } })

// Valida el cuerpo de un alta (`completo: true`) o de una edición (solo los campos que vienen). El deporte solo se pide en el alta:
// una cancha no cambia de deporte. Devuelve { datos } o { error: { mensaje, campo } }; se revisa en el orden del formulario.
export const validarCancha = (cuerpo, { completo }) => {
  const c = cuerpo ?? {}
  const datos = {}

  if (completo || c.nombre !== undefined) {
    const nombre = limpiarNombre(c.nombre)
    if (!nombre) return invalido('nombre', 'el nombre es obligatorio')
    if (nombre.length > NOMBRE_MAXIMO) return invalido('nombre', `el nombre admite hasta ${NOMBRE_MAXIMO} caracteres`)
    datos.nombre = nombre
  }
  if (completo) {
    if (!DEPORTES.includes(c.deporte)) return invalido('deporte', 'el deporte debe ser TENIS o PADEL')
    datos.deporte = c.deporte
  }
  if (completo || c.tipoSuperficie !== undefined) {
    const superficie = typeof c.tipoSuperficie === 'string' ? c.tipoSuperficie.trim().replace(/\s+/g, ' ') : ''
    if (!superficie) return invalido('tipoSuperficie', 'el tipo de superficie es obligatorio')
    if (superficie.length > SUPERFICIE_MAXIMA) return invalido('tipoSuperficie', `el tipo de superficie admite hasta ${SUPERFICIE_MAXIMA} caracteres`)
    datos.tipoSuperficie = superficie
  }
  if (completo || c.precioHora !== undefined) {
    const precio = leerPrecio(c.precioHora)
    if (precio === null) return invalido('precioHora', 'Ingresá un monto mayor o igual a cero')
    datos.precioHora = precio
  }
  return { datos }
}