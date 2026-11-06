import { pool } from '../../config/conexion.bd.js'

// Cuotas mensuales de los socios (CU 4.2 · RF-15). Cada función recibe como último parámetro opcional `db`: el pool o
// un cliente con una transacción abierta. Las fechas se comparan con `current_date` de la base, que está en la zona
// horaria America/Argentina/Cordoba.

const COLUMNAS = `id, socio_id as "socioId", mes, anio, monto, estado_pago as "estadoPago",
  fecha_vencimiento as "fechaVencimiento", fecha_pago as "fechaPago", metodo_pago as "metodoPago"`

export const buscarCuotaPorId = async (id, db = pool) => {
  const { rows } = await db.query(`select ${COLUMNAS} from cuota_mensual where id = $1`, [id])
  return rows[0] ?? null
}

// Genera la cuota PENDIENTE de un socio para el período. Si ya la tenía (cuota_unica_por_mes) no hace nada y devuelve null.
export const generarCuota = async (socioId, mes, anio, monto, fechaVencimiento, db = pool) => {
  const { rows } = await db.query(
    `insert into cuota_mensual (socio_id, mes, anio, monto, fecha_vencimiento)
     values ($1, $2, $3, $4, $5)
     on conflict (socio_id, anio, mes) do nothing
     returning ${COLUMNAS}`,
    [socioId, mes, anio, monto, fechaVencimiento]
  )
  return rows[0] ?? null
}

// Una cuota está vencida si sigue PENDIENTE y su vencimiento es anterior a hoy (estaVencida()).
export const SQL_CUOTA_VENCIDA = `(estado_pago = 'PENDIENTE' and fecha_vencimiento < current_date)`

// Registra el pago (registrarPago()). Solo prospera si la cuota seguía PENDIENTE: ante dos pagos simultáneos
// gana uno y el otro recibe null. Si no se manda fecha, se usa la de ahora.
export const registrarPagoCuota = async (id, metodoPago, fechaPago, operadorId, db = pool) => {
  const { rows } = await db.query(
    `update cuota_mensual
        set estado_pago = 'PAGADO', metodo_pago = $2, fecha_pago = $3, pago_registrado_por = $4
      where id = $1 and estado_pago = 'PENDIENTE'
      returning ${COLUMNAS}`,
    [id, metodoPago, fechaPago ?? new Date(), operadorId]
  )
  return rows[0] ?? null
}