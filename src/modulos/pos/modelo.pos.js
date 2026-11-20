import { pool } from '../../config/conexion.bd.js'
import { sinTildes } from '../usuarios/modelo.consulta.usuarios.js'
import { actualizarStock, columnaNormalizada, escaparLike } from '../productos/modelo.productos.js'
import { asegurarCajaAbierta, esCajaCerrada, registrarTransaccion } from '../caja/modelo.caja.js'

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

// Pesos con dos decimales sin errores de punto flotante (se suma en centavos)
const aCentavos = (monto) => Math.round(monto * 100)

// Registra una venta de mostrador (CU 5.2). `lineas` = [{ productoId, cantidad }] ya validadas (sin productos repetidos).
// Todo ocurre en UNA transacción: o quedan la transacción de caja, los detalles y el stock descontado, o no queda nada.
// Devuelve:
//   { resultado: 'CAJA_CERRADA' }                        la caja de hoy ya se cerró
//   { resultado: 'RECHAZADA', lineas: [...] }            producto inexistente, dado de baja o sin stock suficiente (no se registra nada)
//   { resultado: 'TOTAL_CERO' }                          todos los productos valen 0: no hay nada que cobrar
//   { resultado: 'REGISTRADA', venta: {...} }
export const registrarVenta = async ({ lineas, metodoPago, operadorId }) => {
  const cliente = await pool.connect()
  try {
    await cliente.query('begin')
    await asegurarCajaAbierta(cliente)

    // Se bloquean los productos de la venta, siempre en el mismo orden (por id) para que dos ventas con productos en común
    // no se esperen entre sí en círculo. La segunda venta lee el stock ya descontado por la primera.
    const ids = lineas.map((l) => l.productoId)
    const { rows } = await cliente.query(
      `select id, nombre, precio, stock_actual as "stockActual", activo from producto where id = any($1::uuid[]) order by id for update`,
      [ids]
    )
    const productos = new Map(rows.map((fila) => [fila.id, fila]))

    // Se revisan TODAS las líneas, para informar de una vez cuáles hay que corregir
    const problemas = []
    for (const { productoId, cantidad } of lineas) {
      const producto = productos.get(productoId)
      if (!producto || !producto.activo) {
        problemas.push({ productoId, nombre: producto?.nombre ?? null, motivo: 'NO_DISPONIBLE', cantidad, stockDisponible: 0 })
      } else if (producto.stockActual < cantidad) {
        problemas.push({ productoId, nombre: producto.nombre, motivo: 'STOCK_INSUFICIENTE', cantidad, stockDisponible: producto.stockActual })
      }
    }
    if (problemas.length > 0) {
      await cliente.query('rollback')
      return { resultado: 'RECHAZADA', lineas: problemas }
    }

    const detalle = lineas.map(({ productoId, cantidad }) => {
      const producto = productos.get(productoId)
      const precioUnitario = Number(producto.precio) // el precio vigente en este momento
      return { productoId, nombre: producto.nombre, cantidad, precioUnitario, subtotal: aCentavos(precioUnitario) * cantidad / 100 }
    })
    const total = detalle.reduce((suma, l) => suma + aCentavos(l.subtotal), 0) / 100
    if (total <= 0) {
      await cliente.query('rollback')
      return { resultado: 'TOTAL_CERO' }
    }

    // Venta de mostrador: sin cliente (consumidor final)
    const transaccion = await registrarTransaccion({ tipoMovimiento: 'INGRESO', concepto: 'TIENDA', descripcion: 'Venta de mostrador', monto: total, metodoPago, operadorId }, cliente)

    for (const l of detalle) {
      await cliente.query(
        `insert into detalle_venta (transaccion_id, producto_id, cantidad, precio_unitario) values ($1, $2, $3, $4)`,
        [transaccion.id, l.productoId, l.cantidad, l.precioUnitario]
      )
      // Segunda defensa: el UPDATE condicional nunca deja el stock por debajo de cero
      const stockRestante = await actualizarStock(l.productoId, -l.cantidad, cliente)
      if (stockRestante === null) throw new Error(`No se pudo descontar el stock del producto ${l.productoId}`)
      l.stockRestante = stockRestante
    }

    await cliente.query('commit')
    return { resultado: 'REGISTRADA', venta: { id: transaccion.id, fechaHora: transaccion.fechaHora, metodoPago, total, lineas: detalle } }
  } catch (error) {
    await cliente.query('rollback').catch(() => {})
    if (esCajaCerrada(error)) return { resultado: 'CAJA_CERRADA' }
    throw error
  } finally {
    cliente.release()
  }
}