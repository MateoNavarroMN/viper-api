import { pool } from '../../config/conexion.bd.js'
import { cajaCerrada } from './modelo.caja.js'

// Consulta de movimientos de caja (CU 5.3): solo lectura. Las fechas son las del club (America/Argentina/Cordoba).
const ZONA = "'America/Argentina/Cordoba'"

// numeric llega de pg como texto: se devuelve como número
const aMovimiento = (f) => ({
  id: f.id,
  fechaHora: f.fechaHora,
  tipo: f.tipo,
  concepto: f.concepto,
  descripcion: f.descripcion,
  monto: Number(f.monto),
  metodoPago: f.metodoPago,
  estado: f.estado,
  operador: f.operador,
  cliente: f.cliente,
})

const COLUMNAS = `t.id, t.fecha_hora as "fechaHora", t.tipo_movimiento as tipo, t.concepto, t.descripcion, t.monto,
  t.metodo_pago as "metodoPago", t.estado, op.nombre || ' ' || op.apellido as operador, cl.nombre || ' ' || cl.apellido as cliente`

const UNIONES = `from transaccion_caja t
  left join usuario op on op.id = t.operador_usuario_id
  left join usuario cl on cl.id = t.cliente_usuario_id`

// Listado paginado con sus totales. filtros: { desde, hasta (AAAA-MM-DD, inclusivos), tipo, concepto, metodo, estado }.
// Los totales (ingresos, egresos y saldo) cubren TODOS los movimientos que coinciden con los filtros, no solo la página, y
// suman únicamente los APROBADOS: los anulados, rechazados y pendientes se listan pero no cuentan.
export const listarMovimientos = async ({ desde, hasta, tipo, concepto, metodo, estado, pagina, tamanio }, db = pool) => {
  const valores = []
  const agregar = (valor) => {
    valores.push(valor)
    return `$${valores.length}`
  }
  const condiciones = [
    `t.fecha_hora >= ${agregar(desde)}::date::timestamp at time zone ${ZONA}`,
    `t.fecha_hora < (${agregar(hasta)}::date + 1)::timestamp at time zone ${ZONA}`,
  ]
  if (tipo) condiciones.push(`t.tipo_movimiento = ${agregar(tipo)}`)
  if (concepto) condiciones.push(`t.concepto = ${agregar(concepto)}`)
  if (metodo) condiciones.push(`t.metodo_pago = ${agregar(metodo)}`)
  if (estado) condiciones.push(`t.estado = ${agregar(estado)}`)
  const donde = condiciones.join(' and ')

  const { rows: resumen } = await db.query(
    `select count(*)::int as total,
            coalesce(sum(t.monto) filter (where t.estado = 'APROBADO' and t.tipo_movimiento = 'INGRESO'), 0) as ingresos,
            coalesce(sum(t.monto) filter (where t.estado = 'APROBADO' and t.tipo_movimiento = 'EGRESO'), 0) as egresos
       from transaccion_caja t where ${donde}`,
    valores
  )
  const { rows } = await db.query(
    `select ${COLUMNAS} ${UNIONES}
      where ${donde}
      order by t.fecha_hora desc, t.id
      limit ${agregar(tamanio)} offset ${agregar((pagina - 1) * tamanio)}`,
    valores
  )
  const ingresos = Number(resumen[0].ingresos)
  const egresos = Number(resumen[0].egresos)
  return {
    movimientos: rows.map(aMovimiento),
    total: resumen[0].total,
    // Se redondea a centavos para que la resta de decimales no arrastre errores de coma flotante
    totales: { ingresos, egresos, saldo: Math.round((ingresos - egresos) * 100) / 100 },
  }
}

// Origen de un cobro: la reserva, la inscripción o la cuota a la que corresponde, con un texto para mostrarlo.
const origenDe = async (t, db) => {
  if (t.reservaId) {
    const { rows } = await db.query(
      `select c.nombre as cancha, to_char(r.fecha, 'DD/MM/YYYY') as fecha, to_char(r.hora_inicio, 'HH24:MI') as inicio,
              to_char(r.hora_fin, 'HH24:MI') as fin, r.estado
         from reserva r join cancha c on c.id = r.cancha_id where r.id = $1`,
      [t.reservaId]
    )
    const r = rows[0]
    return r && { tipo: 'RESERVA', id: t.reservaId, descripcion: `${r.cancha} · ${r.fecha} de ${r.inicio} a ${r.fin}`, estado: r.estado }
  }
  if (t.inscripcionId) {
    const { rows } = await db.query(
      `select tor.nombre as torneo, ut.nombre || ' ' || ut.apellido as titular, uc.nombre || ' ' || uc.apellido as companero, i.estado_pago as estado
         from inscripcion i
         join torneo tor on tor.id = i.torneo_id
         join jugador jt on jt.id = i.titular_jugador_id join usuario ut on ut.id = jt.usuario_id
         left join jugador jc on jc.id = i.companero_jugador_id left join usuario uc on uc.id = jc.usuario_id
        where i.id = $1`,
      [t.inscripcionId]
    )
    const i = rows[0]
    return i && { tipo: 'INSCRIPCION', id: t.inscripcionId, descripcion: `${i.torneo} · ${i.titular}${i.companero ? ` / ${i.companero}` : ''}`, estado: i.estado }
  }
  if (t.cuotaId) {
    const { rows } = await db.query(
      `select u.nombre || ' ' || u.apellido as socio, q.mes, q.anio, q.estado_pago as estado
         from cuota_mensual q join socio s on s.id = q.socio_id join jugador j on j.id = s.jugador_id join usuario u on u.id = j.usuario_id
        where q.id = $1`,
      [t.cuotaId]
    )
    const q = rows[0]
    return q && { tipo: 'CUOTA', id: t.cuotaId, descripcion: `Cuota ${String(q.mes).padStart(2, '0')}/${q.anio} · ${q.socio}`, estado: q.estado }
  }
  return null
}

// Un movimiento con su detalle: cliente, origen vinculado (cobros), productos vendidos (ventas de tienda) y, si está anulado,
// quién lo anuló y por qué. null si no existe.
export const obtenerMovimiento = async (id, db = pool) => {
  const { rows } = await db.query(
    `select ${COLUMNAS}, t.id_pago_externo as "idPagoExterno", t.reserva_id as "reservaId", t.inscripcion_id as "inscripcionId",
            t.cuota_id as "cuotaId", t.motivo_anulacion as "motivoAnulacion", t.fecha_anulacion as "fechaAnulacion",
            an.nombre || ' ' || an.apellido as "anuladoPor",
            (t.fecha_hora at time zone ${ZONA})::date::text as fecha
       ${UNIONES}
       left join usuario an on an.id = t.anulado_por
      where t.id = $1`,
    [id]
  )
  if (!rows[0]) return null
  const t = rows[0]
  const [origen, productos, cerrada] = await Promise.all([
    origenDe(t, db),
    t.concepto === 'TIENDA'
      ? db.query(
          `select d.producto_id as "productoId", p.nombre, d.cantidad, d.precio_unitario as "precioUnitario", d.subtotal
             from detalle_venta d join producto p on p.id = d.producto_id where d.transaccion_id = $1 order by p.nombre, d.id`,
          [id]
        )
      : null,
    cajaCerrada(t.fecha, db),
  ])
  const movimiento = { ...aMovimiento(t), fecha: t.fecha, idPagoExterno: t.idPagoExterno, origen, cajaCerrada: cerrada }
  if (productos) {
    movimiento.productos = productos.rows.map((p) => ({ ...p, precioUnitario: Number(p.precioUnitario), subtotal: Number(p.subtotal) }))
  }
  if (t.estado === 'ANULADO') {
    movimiento.anulacion = { motivo: t.motivoAnulacion, anuladoPor: t.anuladoPor, fecha: t.fechaAnulacion }
  }
  return movimiento
}