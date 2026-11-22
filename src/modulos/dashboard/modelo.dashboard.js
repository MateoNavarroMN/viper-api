import { pool } from '../../config/conexion.bd.js'
import { fechaDeHoy, ultimoCierre } from '../caja/modelo.caja.js'
import { resumenDeLaJornada } from '../caja/modelo.cierre.caja.js'
import { disponibilidadDelDia } from '../canchas/modelo.canchas.js'
import { expirarVencidas } from '../reservas/modelo.reservas.js'

// Bloques operativos del panel de control (CU 6.1): la caja de hoy y las canchas de un día. Son de solo lectura y reutilizan lo
// que ya calculan la caja (resumen de la jornada) y las canchas (grilla de disponibilidad): así el panel nunca se contradice con esas pantallas.

const ZONA = "'America/Argentina/Cordoba'"
const MOVIMIENTOS_VISIBLES = 20
const PENDIENTES_VISIBLES = 50
const DEPORTES = ['TENIS', 'PADEL']

// Caja de hoy: totales y movimientos del día, si está abierta o cerrada y el último cierre registrado (o null si todavía no hubo ninguno).
// Devuelve { fecha, abierta, cantidadMovimientos, totalIngresos, totalEgresos, efectivoCalculado, totalDigital, pendientesEnLinea,
//   movimientos: [{ id, fechaHora, tipo, concepto, descripcion, monto, metodoPago, cliente }], hayMasMovimientos,
//   ultimoCierre: { fecha, estado, efectivoCalculado, efectivoDeclarado, diferencia, responsable } | null }
export const cajaDelDia = async (db = pool) => {
  const fecha = await fechaDeHoy(db)
  const resumen = await resumenDeLaJornada(fecha, db)
  const { rows } = await db.query(
    `select t.id, t.fecha_hora as "fechaHora", t.tipo_movimiento as tipo, t.concepto, t.descripcion, t.monto, t.metodo_pago as "metodoPago",
            cl.nombre || ' ' || cl.apellido as cliente
       from transaccion_caja t left join usuario cl on cl.id = t.cliente_usuario_id
      where t.estado = 'APROBADO'
        and t.fecha_hora >= $1::date::timestamp at time zone ${ZONA} and t.fecha_hora < ($1::date + 1)::timestamp at time zone ${ZONA}
      order by t.fecha_hora desc, t.id
      limit ${MOVIMIENTOS_VISIBLES}`,
    [fecha]
  )
  const cierre = await ultimoCierre(db)
  return {
    fecha,
    abierta: !resumen.cerrada,
    cantidadMovimientos: resumen.cantidadMovimientos,
    totalIngresos: resumen.totalIngresos,
    totalEgresos: resumen.totalEgresos,
    efectivoCalculado: resumen.efectivoCalculado,
    totalDigital: resumen.totalDigital,
    pendientesEnLinea: resumen.pendientesEnLinea.length,
    movimientos: rows.map((m) => ({ ...m, monto: Number(m.monto) })),
    hayMasMovimientos: resumen.cantidadMovimientos > MOVIMIENTOS_VISIBLES,
    ultimoCierre: cierre && {
      fecha: cierre.fecha,
      estado: cierre.estado,
      efectivoCalculado: cierre.efectivoCalculado,
      efectivoDeclarado: cierre.efectivoDeclarado,
      diferencia: cierre.diferencia,
      responsable: cierre.responsable,
    },
  }
}

const porcentaje = (ocupadas, total) => (total === 0 ? 0 : Math.round((ocupadas / total) * 100))

// Canchas de un día: ocupación por cancha y por deporte (turnos ocupados sobre los turnos del horario del club, los mismos que
// muestra la grilla de disponibilidad), las reservas del día y las reservas pendientes de pago con su plazo de vencimiento.
// Un día sin reservas devuelve todo libre y la ocupación en cero.
export const canchasDelDia = async (fecha, db = pool) => {
  // Las pendientes con el plazo vencido dejan de figurar como pendientes (y liberan su franja)
  await expirarVencidas(db)

  const canchas = []
  const reservas = []
  let horario = null
  for (const deporte of DEPORTES) {
    const grilla = await disponibilidadDelDia(deporte, fecha, 'ADMINISTRADOR', db)
    horario = grilla.horario
    for (const c of grilla.canchas) {
      const ocupadas = c.franjas.filter((f) => f.estado === 'OCUPADA').length
      canchas.push({ id: c.id, nombre: c.nombre, deporte, ocupadas, total: c.franjas.length, porcentaje: porcentaje(ocupadas, c.franjas.length) })
      for (const o of c.ocupadas) {
        reservas.push({
          id: o.reservaId,
          canchaId: c.id,
          cancha: c.nombre,
          deporte,
          horaInicio: o.horaInicio,
          horaFin: o.horaFin,
          tipo: o.tipo,
          estado: o.estado,
          cliente: o.cliente ? `${o.cliente.nombre} ${o.cliente.apellido}`.trim() : null,
          torneo: o.torneo,
          precio: o.precioAplicado,
        })
      }
    }
  }
  reservas.sort((a, b) => a.horaInicio.localeCompare(b.horaInicio) || a.cancha.localeCompare(b.cancha))

  const porDeporte = DEPORTES.map((deporte) => {
    const delDeporte = canchas.filter((c) => c.deporte === deporte)
    const ocupadas = delDeporte.reduce((suma, c) => suma + c.ocupadas, 0)
    const total = delDeporte.reduce((suma, c) => suma + c.total, 0)
    return { deporte, canchas: delDeporte.length, ocupadas, total, porcentaje: porcentaje(ocupadas, total) }
  })
  const ocupadas = porDeporte.reduce((suma, d) => suma + d.ocupadas, 0)
  const total = porDeporte.reduce((suma, d) => suma + d.total, 0)

  // Reservas pendientes de pago de cualquier día, las que vencen primero arriba
  const { rows: pendientes } = await db.query(
    `select r.id, ca.nombre as cancha, ca.deporte, to_char(r.fecha, 'YYYY-MM-DD') as fecha,
            to_char(r.hora_inicio, 'HH24:MI') as "horaInicio", to_char(r.hora_fin, 'HH24:MI') as "horaFin",
            coalesce(u.nombre || ' ' || u.apellido, r.nombre_contacto) as cliente, r.precio_aplicado as precio,
            r.expiracion_pago as "venceEn", greatest(0, floor(extract(epoch from (r.expiracion_pago - now()))))::int as "segundosRestantes"
       from reserva r join cancha ca on ca.id = r.cancha_id left join usuario u on u.id = r.cliente_usuario_id
      where r.estado = 'PENDIENTE' and r.expiracion_pago is not null
      order by r.expiracion_pago, r.id
      limit ${PENDIENTES_VISIBLES}`
  )

  return {
    fecha,
    horario,
    sinReservas: reservas.length === 0,
    ocupacion: { ocupadas, total, porcentaje: porcentaje(ocupadas, total) },
    porDeporte,
    canchas,
    reservas,
    pendientes: pendientes.map((p) => ({ ...p, precio: p.precio === null ? null : Number(p.precio) })),
  }
}