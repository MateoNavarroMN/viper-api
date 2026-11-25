// Validación de las líneas de una venta de tienda: la comparten el punto de venta (efectivo y transferencia) y el pago en línea.
const LINEAS_MAXIMAS = 50
const CANTIDAD_MAXIMA = 100000
const REGEX_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Devuelve { lineas: [{ productoId, cantidad }] } con los productos repetidos juntos (se suman las cantidades),
// o { error: { mensaje, linea? } } con lo primero que está mal.
export const leerLineas = (lineas) => {
  if (!Array.isArray(lineas) || lineas.length === 0) return { error: { mensaje: 'Agregá al menos un producto' } }
  if (lineas.length > LINEAS_MAXIMAS) return { error: { mensaje: `Una venta admite hasta ${LINEAS_MAXIMAS} productos distintos` } }

  const juntas = new Map()
  for (const [indice, linea] of lineas.entries()) {
    const malo = (mensaje) => ({ error: { mensaje, linea: indice } })
    if (!linea || typeof linea !== 'object') return malo('La línea de la venta no es válida')
    const { productoId, cantidad } = linea
    if (typeof productoId !== 'string' || !REGEX_UUID.test(productoId)) return malo('El producto de la línea no es válido')
    if (!Number.isInteger(cantidad) || cantidad < 1) return malo('La cantidad tiene que ser un número entero mayor a cero')
    if (cantidad > CANTIDAD_MAXIMA) return malo(`La cantidad no puede superar ${CANTIDAD_MAXIMA}`)
    juntas.set(productoId.toLowerCase(), (juntas.get(productoId.toLowerCase()) ?? 0) + cantidad)
  }
  return { lineas: [...juntas].map(([productoId, cantidad]) => ({ productoId, cantidad })) }
}