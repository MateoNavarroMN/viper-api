import { pool } from '../../config/conexion.bd.js'

// Detalle de los movimientos de un período para el archivo de Excel (CU 6.2). Son los mismos que suma `generarBalance`:
// solo los APROBADOS del rango y del rubro elegido, así el detalle siempre coincide con el resumen.

const ZONA = "'America/Argentina/Cordoba'"

// Devuelve [{ fechaHora, tipo, concepto, descripcion, monto, metodoPago, cliente, operador }], del más viejo al más nuevo.
// `fechaHora` es un Date que lleva la hora del club (Córdoba) escrita como si fuera UTC: así el Excel, que no guarda zona
// horaria, muestra la hora que se vivió en el club sin depender de la zona del servidor.
export const movimientosDelPeriodo = async (desde, hasta, rubro = null, db = pool) => {
  const { rows } = await db.query(
    `select to_char(t.fecha_hora at time zone ${ZONA}, 'YYYY-MM-DD"T"HH24:MI:SS') as "fechaHora",
            t.tipo_movimiento as tipo, t.concepto, t.descripcion, t.monto, t.metodo_pago as "metodoPago",
            cl.nombre || ' ' || cl.apellido as cliente, op.nombre || ' ' || op.apellido as operador
       from transaccion_caja t
       left join usuario cl on cl.id = t.cliente_usuario_id
       left join usuario op on op.id = t.operador_usuario_id
      where t.estado = 'APROBADO'
        and t.fecha_hora >= $1::date::timestamp at time zone ${ZONA}
        and t.fecha_hora < ($2::date + 1)::timestamp at time zone ${ZONA}
        and ($3::text is null or t.concepto::text = $3)
      order by t.fecha_hora, t.id`,
    [desde, hasta, rubro]
  )
  return rows.map((f) => ({ ...f, fechaHora: new Date(`${f.fechaHora}Z`), monto: Number(f.monto) }))
}