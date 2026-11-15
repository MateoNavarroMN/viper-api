import { pool } from '../../config/conexion.bd.js'
import { accionesPermitidas } from './acciones.reservas.js'
import { expirarVencidas } from './modelo.reservas.js'

export const RESERVAS_POR_PAGINA = 10

// Las reservas de un cliente (las ocasionales que pidió y las de sus alquileres fijos) con lo que muestra «Mis reservas».
// Las de torneo no aparecen: no tienen cliente. `segundosParaInicio` lo calcula la base en hora de Córdoba y decide las acciones.
const SELECT_RESERVAS = `
  select r.id, to_char(r.fecha, 'YYYY-MM-DD') as fecha,
         to_char(r.hora_inicio, 'HH24:MI') as "horaInicio", to_char(r.hora_fin, 'HH24:MI') as "horaFin",
         r.tipo, r.estado, r.precio_aplicado as "precioAplicado", r.expiracion_pago as "expiracionPago",
         extract(epoch from ((r.fecha + r.hora_inicio) at time zone 'America/Argentina/Cordoba' - now())) as "segundosParaInicio",
         c.id as "canchaId", c.nombre as "canchaNombre", c.deporte, c.tipo_superficie as "tipoSuperficie",
         rf.id as "contratoId", to_char(rf.fecha_fin_contrato, 'YYYY-MM-DD') as "contratoFin",
         count(*) over () as total
    from reserva r
    join cancha c on c.id = r.cancha_id
    left join reserva_fija rf on rf.id = r.reserva_fija_id`

// «Próximas»: Pendiente o Confirmada y que todavía no terminó. «Historial»: todo lo demás (canceladas, expiradas y pasadas).
const ES_PROXIMA = `r.estado in ('PENDIENTE', 'CONFIRMADA') and (r.fecha + r.hora_fin) at time zone 'America/Argentina/Cordoba' > now()`

const aReserva = (fila) => {
  const { segundosParaInicio, tipo, estado } = fila
  return {
    id: fila.id,
    cancha: { id: fila.canchaId, nombre: fila.canchaNombre, deporte: fila.deporte, tipoSuperficie: fila.tipoSuperficie },
    fecha: fila.fecha,
    horaInicio: fila.horaInicio,
    horaFin: fila.horaFin,
    tipo,
    estado,
    precioAplicado: fila.precioAplicado === null ? null : Number(fila.precioAplicado),
    expiracionPago: fila.expiracionPago,
    contrato: fila.contratoId ? { id: fila.contratoId, fechaFin: fila.contratoFin } : null,
    // Lo que puede hacer el propio Jugador con ella (cancelar, modificar…), con el motivo cuando no puede
    acciones: accionesPermitidas({ tipo, estado, segundosParaInicio: Number(segundosParaInicio) }, 'JUGADOR'),
  }
}

// Una página de las reservas del cliente. vista: 'proximas' (la más cercana primero) | 'historial' (la más reciente primero).
// Antes de leer se vencen las pendientes con el plazo pasado, así una sin pagar figura Expirada y va al historial.
export const listarReservasDeCliente = async (usuarioId, { vista, pagina = 1, porPagina = RESERVAS_POR_PAGINA }, db = pool) => {
  await expirarVencidas(db)
  const proximas = vista === 'proximas'
  const { rows } = await db.query(
    `${SELECT_RESERVAS}
   where r.cliente_usuario_id = $1 and ${proximas ? '' : 'not '}(${ES_PROXIMA})
   order by r.fecha ${proximas ? 'asc' : 'desc'}, r.hora_inicio ${proximas ? 'asc' : 'desc'}, r.id
   limit $2 offset $3`,
    [usuarioId, porPagina, (pagina - 1) * porPagina],
  )
  const total = rows.length ? Number(rows[0].total) : 0
  return { total, reservas: rows.map(aReserva) }
}

// Las reservas más cercanas a hoy (las que vienen y las que acaban de pasar), para «Mi actividad». Mantienen la forma que ya
// espera esa pantalla (`cancha` es el nombre, en texto) y suman el horario de fin, el tipo y el precio.
export const listarReservasRecientes = async (usuarioId, limite = 10, db = pool) => {
  await expirarVencidas(db)
  const { rows } = await db.query(
    `${SELECT_RESERVAS}
   where r.cliente_usuario_id = $1
   order by abs(extract(epoch from ((r.fecha + r.hora_inicio) at time zone 'America/Argentina/Cordoba' - now()))), r.id
   limit $2`,
    [usuarioId, limite],
  )
  return rows.map((fila) => ({
    id: fila.id,
    cancha: fila.canchaNombre,
    fecha: fila.fecha,
    horaInicio: fila.horaInicio,
    horaFin: fila.horaFin,
    tipo: fila.tipo,
    estado: fila.estado,
    precioAplicado: fila.precioAplicado === null ? null : Number(fila.precioAplicado),
  }))
}