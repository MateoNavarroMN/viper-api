import { pool } from '../../config/conexion.bd.js'
import { sinTildes } from '../usuarios/modelo.consulta.usuarios.js'
import { columnaNormalizada, escaparLike } from '../productos/modelo.productos.js'

// Punto de venta (CU 5.2). SQL crudo; las reglas las decide el controlador.

// Tope de seguridad: el club tiene un catálogo chico, pero la grilla del POS no pagina y no puede crecer sin límite
const TOPE_PRODUCTOS = 500

// Productos que se pueden vender hoy: solo los activos, por nombre. Los de stock 0 se incluyen y vienen con `sinStock: true`
// (el punto de venta los muestra pero no deja agregarlos). No expone datos de alquiler. Búsqueda por nombre sin distinguir
// mayúsculas ni acentos (cada palabra tiene que aparecer en el nombre).
export const listarProductosPos = async ({ q, categoria }, db = pool) => {
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

  const { rows } = await db.query(
    `select id, nombre, categoria, precio, stock_actual as "stockActual", imagen_url as "imagenUrl"
       from producto
      where ${condiciones.join(' and ')}
      order by lower(nombre), id
      limit ${TOPE_PRODUCTOS}`,
    valores
  )
  return rows.map((fila) => ({ ...fila, precio: Number(fila.precio), sinStock: fila.stockActual === 0 }))
}