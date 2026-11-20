import { pool } from '../../config/conexion.bd.js'
import { sinTildes } from '../usuarios/modelo.consulta.usuarios.js'
import { columnaNormalizada, escaparLike } from '../productos/modelo.productos.js'

// Catálogo de la tienda para el Jugador (CU 5.6): solo lectura y solo productos activos.
// No expone el stock exacto (solo si hay o no), ni el estado, ni nada que se pueda modificar.

// numeric llega de pg como texto: se devuelve como número
const aProducto = (fila) => ({
  id: fila.id,
  nombre: fila.nombre,
  categoria: fila.categoria,
  precio: Number(fila.precio),
  imagenUrl: fila.imagenUrl,
  disponible: fila.disponible,
  alquilable: fila.alquilable,
})

const COLUMNAS = `id, nombre, categoria, precio, imagen_url as "imagenUrl", stock_actual > 0 as disponible,
  disponible_para_alquiler as alquilable`

const ORDEN = {
  nombre: 'lower(nombre)',
  precio: 'precio',
}

// Listado con paginación tipo «cargar más»: devuelve una página, el total que coincide y si quedan más.
// filtros: { q, categoria, precioMin, precioMax }; orden: 'nombre' | 'precio'; direccion: 'asc' | 'desc'.
// La búsqueda es por nombre, sin distinguir mayúsculas ni acentos (cada palabra tiene que aparecer en el nombre).
export const listarCatalogo = async ({ q, categoria, precioMin, precioMax, orden, direccion, pagina, tamanio }, db = pool) => {
  const condiciones = ['activo']
  const valores = []
  const agregar = (valor) => {
    valores.push(valor)
    return `$${valores.length}`
  }

  for (const palabra of sinTildes(q ?? '').split(/\s+/).filter(Boolean)) {
    condiciones.push(`${columnaNormalizada('nombre')} like ${agregar(`%${escaparLike(palabra)}%`)}`)
  }
  if (categoria) condiciones.push(`categoria = ${agregar(categoria)}`)
  if (precioMin !== undefined) condiciones.push(`precio >= ${agregar(precioMin)}`)
  if (precioMax !== undefined) condiciones.push(`precio <= ${agregar(precioMax)}`)
  const donde = condiciones.join(' and ')

  const { rows: conteo } = await db.query(`select count(*)::int as total from producto where ${donde}`, valores)
  // Se pide uno de más para saber si quedan productos sin traerlos todos. El desempate por nombre e id mantiene el orden estable
  // entre una página y la siguiente.
  const { rows } = await db.query(
    `select ${COLUMNAS} from producto
      where ${donde}
      order by ${ORDEN[orden]} ${direccion === 'desc' ? 'desc' : 'asc'}, lower(nombre), id
      limit ${agregar(tamanio + 1)} offset ${agregar((pagina - 1) * tamanio)}`,
    valores
  )
  return { productos: rows.slice(0, tamanio).map(aProducto), total: conteo[0].total, hayMas: rows.length > tamanio }
}

// Detalle de un producto activo; suma el precio de alquiler por turno solo si se puede alquilar. null si no existe o está dado de baja.
export const obtenerProductoActivo = async (id, db = pool) => {
  const { rows } = await db.query(`select ${COLUMNAS}, precio_alquiler as "precioAlquiler" from producto where id = $1 and activo`, [id])
  if (!rows[0]) return null
  const producto = aProducto(rows[0])
  return producto.alquilable ? { ...producto, precioAlquiler: Number(rows[0].precioAlquiler) } : producto
}