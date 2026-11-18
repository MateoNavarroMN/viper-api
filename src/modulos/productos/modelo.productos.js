import { pool } from '../../config/conexion.bd.js'
import { sinTildes } from '../usuarios/modelo.consulta.usuarios.js'

// Catálogo de productos del Pro-Shop y el buffet (CU 5.1). SQL crudo; las reglas las decide el controlador.

const CON_TILDES = 'áàäâéèëêíìïîóòöôúùüûñ'
const SIN_TILDES = 'aaaaeeeeiiiioooouuuun'
const columnaNormalizada = (expresion) => `translate(lower(${expresion}), '${CON_TILDES}', '${SIN_TILDES}')`
const escaparLike = (texto) => texto.replace(/[\\%_]/g, '\\$&')

const COLUMNAS = `id, nombre, categoria, precio, stock_actual as "stockActual", activo,
       imagen_url as "imagenUrl", disponible_para_alquiler as "disponibleParaAlquiler", precio_alquiler as "precioAlquiler"`

// numeric llega de pg como texto: se devuelve como número
const aProducto = (fila) => ({
  ...fila,
  precio: Number(fila.precio),
  precioAlquiler: fila.precioAlquiler === null ? null : Number(fila.precioAlquiler),
})

// Listado paginado. Búsqueda por nombre sin distinguir mayúsculas ni acentos (cada palabra tiene que aparecer en el nombre).
// `estado` es ACTIVO o INACTIVO; sin estado se listan todos.
export const listarProductos = async ({ q, categoria, estado, pagina, tamanio }, db = pool) => {
  const condiciones = []
  const valores = []
  const agregar = (valor) => {
    valores.push(valor)
    return `$${valores.length}`
  }

  for (const palabra of sinTildes(q ?? '').split(/\s+/).filter(Boolean)) {
    condiciones.push(`${columnaNormalizada('nombre')} like ${agregar(`%${escaparLike(palabra)}%`)}`)
  }
  if (categoria) condiciones.push(`categoria = ${agregar(categoria)}`)
  if (estado) condiciones.push(`activo = ${agregar(estado === 'ACTIVO')}`)

  const donde = condiciones.length > 0 ? `where ${condiciones.join(' and ')}` : ''

  const { rows: conteo } = await db.query(`select count(*)::int as total from producto ${donde}`, valores)
  const { rows } = await db.query(
    `select ${COLUMNAS} from producto ${donde}
      order by activo desc, lower(nombre), id
      limit ${agregar(tamanio)} offset ${agregar((pagina - 1) * tamanio)}`,
    valores
  )
  return { productos: rows.map(aProducto), total: conteo[0].total }
}

// Alta: el producto nace activo. Si ya hay uno activo con el mismo nombre y categoría (índice único parcial
// producto_nombre_categoria_activo_uidx) devuelve { resultado: 'DUPLICADO' }; así también se cubren dos altas simultáneas.
export const crearProducto = async (datos, db = pool) => {
  try {
    const { rows } = await db.query(
      `insert into producto (nombre, precio, categoria, stock_actual, disponible_para_alquiler, precio_alquiler)
       values ($1, $2, $3, $4, $5, $6)
       returning ${COLUMNAS}`,
      [datos.nombre, datos.precio, datos.categoria, datos.stockActual, datos.disponibleParaAlquiler, datos.precioAlquiler]
    )
    return { resultado: 'CREADO', producto: aProducto(rows[0]) }
  } catch (error) {
    if (error.code === '23505' && error.constraint === 'producto_nombre_categoria_activo_uidx') return { resultado: 'DUPLICADO' }
    throw error
  }
}