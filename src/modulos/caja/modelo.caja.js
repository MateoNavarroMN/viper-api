import { pool } from '../../config/conexion.bd.js'

// Servicio de caja (RF-22 y RF-24). Lo usan la venta del punto de venta, los movimientos manuales, los cobros de reservas,
// inscripciones y cuotas, y el cierre. Cada función recibe como último parámetro opcional `db`: el pool o un cliente con
// una transacción abierta. Para que el cobro, el stock y el asiento en caja sean atómicos, quien lo llama abre la
// transacción y le pasa su cliente.
// La «fecha de hoy» es la de la base de datos, que está en la zona horaria America/Argentina/Cordoba.

export const MENSAJE_CAJA_CERRADA = 'La caja de hoy ya fue cerrada: cargá el movimiento en la jornada siguiente'

// Error que lanza asegurarCajaAbierta. Los controladores lo responden como 409 con `esCajaCerrada`.
export class CajaCerradaError extends Error {
  constructor() {
    super(MENSAJE_CAJA_CERRADA)
    this.name = 'CajaCerradaError'
  }
}
export const esCajaCerrada = (error) => error instanceof CajaCerradaError

// Candado que ordena las altas de movimientos contra el cierre de caja. Las altas toman el candado compartido (pueden
// convivir entre sí) y el cierre toma el exclusivo: así, un movimiento nunca se cuela en una caja que se está cerrando.
const CANDADO_CAJA = "hashtext('caja_diaria')"

// Candado exclusivo para el cierre de caja (M5-BE-16). Tiene que llamarse dentro de la transacción del cierre y antes de
// leer el resumen: espera a que terminen los movimientos en curso y frena a los nuevos hasta que el cierre se confirme.
export const bloquearCajaParaCierre = (db) => db.query(`select pg_advisory_xact_lock(${CANDADO_CAJA})`)

const COLUMNAS_CIERRE = `c.id, c.fecha::text as fecha, c.estado, c.efectivo_calculado as "efectivoCalculado",
  c.efectivo_declarado as "efectivoDeclarado", c.total_digital as "totalDigital", c.diferencia,
  c.responsable_usuario_id as "responsableId", u.nombre || ' ' || u.apellido as responsable`

export const fechaDeHoy = async (db = pool) => {
  const { rows } = await db.query(`select current_date::text as fecha`)
  return rows[0].fecha
}

// ¿Existe el cierre de esa fecha (texto AAAA-MM-DD)? Sin fecha, se usa la de hoy.
export const cajaCerrada = async (fecha, db = pool) => {
  const { rows } = await db.query(`select exists (select 1 from cierre_caja where fecha = coalesce($1::date, current_date)) as cerrada`, [fecha ?? null])
  return rows[0].cerrada
}

// Se llama antes de asentar cualquier movimiento de hoy. Si la caja de hoy ya está cerrada lanza CajaCerradaError.
// Dentro de una transacción, además toma el candado compartido hasta que ésta termine.
export const asegurarCajaAbierta = async (db = pool) => {
  await db.query(`select pg_advisory_xact_lock_shared(${CANDADO_CAJA})`)
  if (await cajaCerrada(null, db)) throw new CajaCerradaError()
}

// Inserta un movimiento en la caja de hoy y devuelve su id y fecha. Antes comprueba que la caja siga abierta.
// datos: { tipoMovimiento: 'INGRESO'|'EGRESO', concepto, descripcion?, monto, metodoPago, estado? (APROBADO por defecto),
//   operadorId?, clienteId? (sin cliente = consumidor final), reservaId?, inscripcionId?, cuotaId?, idPagoExterno?, mpPreferenceId? }
// El origen (reserva, inscripción o cuota) lo exigen los constraints de la base según el concepto.
export const registrarTransaccion = async (datos, db = pool) => {
  await asegurarCajaAbierta(db)
  const { rows } = await db.query(
    `insert into transaccion_caja (tipo_movimiento, concepto, descripcion, monto, metodo_pago, estado, operador_usuario_id,
       cliente_usuario_id, reserva_id, inscripcion_id, cuota_id, id_pago_externo, mp_preference_id)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
     returning id, fecha_hora as "fechaHora"`,
    [
      datos.tipoMovimiento,
      datos.concepto,
      datos.descripcion ?? null,
      datos.monto,
      datos.metodoPago,
      datos.estado ?? 'APROBADO',
      datos.operadorId ?? null,
      datos.clienteId ?? null,
      datos.reservaId ?? null,
      datos.inscripcionId ?? null,
      datos.cuotaId ?? null,
      datos.idPagoExterno ?? null,
      datos.mpPreferenceId ?? null,
    ]
  )
  return rows[0]
}

// Los importes llegan de Postgres como texto («1500.00»): se pasan a número
const aCierre = (fila) =>
  fila && { ...fila, efectivoCalculado: Number(fila.efectivoCalculado), efectivoDeclarado: Number(fila.efectivoDeclarado), totalDigital: Number(fila.totalDigital), diferencia: Number(fila.diferencia) }

export const buscarCierrePorFecha = async (fecha, db = pool) => {
  const { rows } = await db.query(`select ${COLUMNAS_CIERRE} from cierre_caja c join usuario u on u.id = c.responsable_usuario_id where c.fecha = $1::date`, [fecha])
  return aCierre(rows[0]) ?? null
}

// El cierre más reciente (por fecha) o null si todavía no se cerró ninguna caja.
export const ultimoCierre = async (db = pool) => {
  const { rows } = await db.query(`select ${COLUMNAS_CIERRE} from cierre_caja c join usuario u on u.id = c.responsable_usuario_id order by c.fecha desc limit 1`)
  return aCierre(rows[0]) ?? null
}