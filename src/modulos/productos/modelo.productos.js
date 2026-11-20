import { pool } from '../../config/conexion.bd.js'
import { sinTildes } from '../usuarios/modelo.consulta.usuarios.js'

// Catálogo de productos del Pro-Shop y el buffet (CU 5.1). SQL crudo; las reglas las decide el controlador.

const CON_TILDES = 'áàäâéèëêíìïîóòöôúùüûñ'
const SIN_TILDES = 'aaaaeeeeiiiioooouuuun'
export const columnaNormalizada = (expresion) => `translate(lower(${expresion}), '${CON_TILDES}', '${SIN_TILDES}')`
export const escaparLike = (texto) => texto.replace(/[\\%_]/g, '\\$&')

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
      `insert into producto (nombre, precio, categoria, stock_actual, disponible_para_alquiler, precio_alquiler, imagen_url)
       values ($1, $2, $3, $4, $5, $6, $7)
       returning ${COLUMNAS}`,
      [datos.nombre, datos.precio, datos.categoria, datos.stockActual, datos.disponibleParaAlquiler, datos.precioAlquiler, datos.imagenUrl ?? null]
    )
    return { resultado: 'CREADO', producto: aProducto(rows[0]) }
  } catch (error) {
    if (error.code === '23505' && error.constraint === 'producto_nombre_categoria_activo_uidx') return { resultado: 'DUPLICADO' }
    throw error
  }
}

// Un producto por id, o null si no existe.
export const obtenerProducto = async (id, db = pool) => {
  const { rows } = await db.query(`select ${COLUMNAS} from producto where id = $1`, [id])
  return rows[0] ? aProducto(rows[0]) : null
}

const COLUMNA_DE = {
  nombre: 'nombre',
  precio: 'precio',
  categoria: 'categoria',
  disponibleParaAlquiler: 'disponible_para_alquiler',
  precioAlquiler: 'precio_alquiler',
  imagenUrl: 'imagen_url',
}

// Edición: actualiza solo los campos que vienen en `cambios` (imagenUrl: null quita la imagen). Las ventas ya registradas no se
// tocan: conservan el precio de su momento en detalle_venta. Devuelve el producto nuevo, el precio anterior y la imagen anterior
// (para borrarla del bucket una vez guardado el cambio).
export const editarProducto = async (id, cambios, db = pool) => {
  const campos = Object.keys(COLUMNA_DE).filter((campo) => cambios[campo] !== undefined)
  const asignaciones = campos.map((campo, i) => `${COLUMNA_DE[campo]} = $${i + 2}`)
  try {
    const { rows } = await db.query(
      `with anterior as (select precio, imagen_url from producto where id = $1 for update)
       update producto p set ${asignaciones.join(', ')}
         from anterior
        where p.id = $1
       returning p.id, p.nombre, p.categoria, p.precio, p.stock_actual as "stockActual", p.activo,
                 p.imagen_url as "imagenUrl", p.disponible_para_alquiler as "disponibleParaAlquiler",
                 p.precio_alquiler as "precioAlquiler",
                 anterior.precio as "precioAnterior", anterior.imagen_url as "imagenAnterior"`,
      [id, ...campos.map((campo) => cambios[campo])]
    )
    if (!rows[0]) return { resultado: 'NO_ENCONTRADO' }
    const { precioAnterior, imagenAnterior, ...resto } = rows[0]
    return { resultado: 'EDITADO', producto: aProducto(resto), precioAnterior: Number(precioAnterior), imagenAnterior }
  } catch (error) {
    if (error.code === '23505' && error.constraint === 'producto_nombre_categoria_activo_uidx') return { resultado: 'DUPLICADO' }
    if (error.code === '23514' && error.constraint === 'producto_alquiler_con_precio') return { resultado: 'ALQUILER_SIN_PRECIO' }
    throw error
  }
}

// Baja (activo = false) o reactivación (activo = true). Nunca se borra el producto: el historial de ventas lo sigue necesitando.
// Al reactivar se vuelve a controlar que no haya otro activo con el mismo nombre y categoría.
export const cambiarEstadoProducto = async (id, activo, db = pool) => {
  try {
    const { rows } = await db.query(
      `update producto set activo = $2 where id = $1 and activo <> $2 returning ${COLUMNAS}`,
      [id, activo]
    )
    if (rows[0]) return { resultado: 'CAMBIADO', producto: aProducto(rows[0]) }
    const existe = await obtenerProducto(id, db)
    return { resultado: existe ? 'YA_ESTA' : 'NO_ENCONTRADO' }
  } catch (error) {
    if (error.code === '23505' && error.constraint === 'producto_nombre_categoria_activo_uidx') return { resultado: 'DUPLICADO' }
    throw error
  }
}

// Suma (cantidad positiva) o resta (negativa) stock con UN solo UPDATE condicional: la base controla que nunca quede por debajo
// de cero, aunque dos operaciones lleguen al mismo tiempo (la segunda espera a la primera y se evalúa con el stock ya descontado).
// Devuelve el stock nuevo, o null si no existe el producto o el stock quedaría negativo.
// La reutilizan el ajuste manual (acá), la venta del punto de venta y la anulación de una venta: `db` es el cliente de la transacción.
export const actualizarStock = async (productoId, cantidad, db = pool) => {
  const { rows } = await db.query(
    `update producto
        set stock_actual = stock_actual + $1
      where id = $2 and stock_actual + $1 >= 0
      returning stock_actual as "stockActual"`,
    [cantidad, productoId]
  )
  return rows[0] ? rows[0].stockActual : null
}

// Ajuste manual: cambia el stock y deja el registro con motivo, usuario y stock resultante, todo en una transacción.
export const ajustarStockManual = async ({ productoId, cantidad, motivo, usuarioId }) => {
  const cliente = await pool.connect()
  try {
    await cliente.query('begin')
    const stockActual = await actualizarStock(productoId, cantidad, cliente)
    if (stockActual === null) {
      await cliente.query('rollback')
      const producto = await obtenerProducto(productoId, cliente)
      return producto ? { resultado: 'STOCK_NEGATIVO', stockActual: producto.stockActual } : { resultado: 'NO_ENCONTRADO' }
    }
    const { rows } = await cliente.query(
      `insert into ajuste_stock (producto_id, cantidad, motivo, stock_resultante, usuario_id)
       values ($1, $2, $3, $4, $5)
       returning id, cantidad, motivo, stock_resultante as "stockResultante", fecha_hora as "fechaHora"`,
      [productoId, cantidad, motivo, stockActual, usuarioId]
    )
    await cliente.query('commit')
    return { resultado: 'AJUSTADO', stockActual, stockAnterior: stockActual - cantidad, ajuste: rows[0] }
  } catch (error) {
    await cliente.query('rollback').catch(() => {})
    throw error
  } finally {
    cliente.release()
  }
}