import { pool } from '../../config/conexion.bd.js'
import { DURACION_TURNO_MINUTOS, expirarVencidas, listarCanchas } from '../reservas/modelo.reservas.js'
import { HORARIO } from '../torneos/scheduler.torneos.js'

const aMinutos = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5))
const aHora = (minutos) => `${String(Math.floor(minutos / 60)).padStart(2, '0')}:${String(minutos % 60).padStart(2, '0')}`

// Franjas libres de un día: lo que queda del horario del club (08:00 a 23:00) fuera de las reservas vigentes.
// `ocupadas` viene ordenada por hora de inicio.
const franjasLibres = (ocupadas) => {
  const libres = []
  const cierre = aMinutos(HORARIO.hasta)
  let cursor = aMinutos(HORARIO.desde)
  for (const o of ocupadas) {
    if (aMinutos(o.horaInicio) > cursor) libres.push({ horaInicio: aHora(cursor), horaFin: o.horaInicio })
    cursor = Math.max(cursor, aMinutos(o.horaFin))
  }
  if (cursor < cierre) libres.push({ horaInicio: aHora(cursor), horaFin: HORARIO.hasta })
  return libres
}

// Fecha y hora de este momento en Córdoba: es la hora del club, sin importar dónde corra el servidor.
const ahoraEnCordoba = async (db) => {
  const { rows } = await db.query(
    `select to_char(now() at time zone 'America/Argentina/Cordoba', 'YYYY-MM-DD') as fecha,
            to_char(now() at time zone 'America/Argentina/Cordoba', 'HH24:MI') as hora`,
  )
  return rows[0]
}

// La grilla del día resuelta en turnos de 60 minutos. Un turno está OCUPADO si pisa alguna reserva vigente (un partido
// de torneo de 90 minutos ocupa dos turnos), PASADO si ya terminó (o si el día ya pasó) y LIBRE en cualquier otro caso.
// Un turno en curso sigue como OCUPADO si tiene una reserva vigente.
// A los turnos ocupados se les suma la lista de `ocupaciones` solo cuando la respuesta trae detalle (no para el Jugador).
const armarFranjas = (ocupadas, fecha, ahora, conDetalle) => {
  const fechaPasada = fecha < ahora.fecha
  const franjas = []
  const cierre = aMinutos(HORARIO.hasta)
  for (let inicio = aMinutos(HORARIO.desde); inicio + DURACION_TURNO_MINUTOS <= cierre; inicio += DURACION_TURNO_MINUTOS) {
    const fin = inicio + DURACION_TURNO_MINUTOS
    const pisadas = ocupadas.filter((o) => aMinutos(o.horaInicio) < fin && aMinutos(o.horaFin) > inicio)
    const pasada = fechaPasada || (fecha === ahora.fecha && fin <= aMinutos(ahora.hora))
    const franja = { horaInicio: aHora(inicio), horaFin: aHora(fin), estado: pasada ? 'PASADA' : pisadas.length ? 'OCUPADA' : 'LIBRE' }
    if (conDetalle && pisadas.length) franja.ocupaciones = pisadas
    franjas.push(franja)
  }
  return franjas
}

// Disponibilidad de las canchas de una disciplina en una fecha: por cancha, los datos y el precio, las franjas ocupadas
// (`ocupadas`), las libres (`libres`) y la grilla en turnos (`franjas`). Lo que se ve de cada ocupación depende del rol:
//   JUGADOR                  → solo el horario
//   ORGANIZADOR              → además reserva, tipo, estado y, si es de un torneo, cuál (sin datos del cliente)
//   RECEPCIONISTA / ADMIN.   → además el cliente y el precio aplicado
// `ahora` ({ fecha, hora }) solo se pasa en las pruebas; normalmente se toma de la base, en hora de Córdoba.
export const disponibilidadDelDia = async (disciplina, fecha, rol = 'ORGANIZADOR', db = pool, ahora = null) => {
  // Antes de leer: las pendientes con el plazo vencido dejan la franja libre
  await expirarVencidas(db)
  const momento = ahora ?? (await ahoraEnCordoba(db))
  const canchas = await listarCanchas(disciplina, db)
  const { rows } = await db.query(
    `select r.cancha_id as "canchaId", r.id as "reservaId", r.tipo, r.estado,
            to_char(r.hora_inicio, 'HH24:MI') as "horaInicio", to_char(r.hora_fin, 'HH24:MI') as "horaFin",
            r.precio_aplicado as "precioAplicado",
            p.id as "partidoId", t.nombre as torneo,
            u.id as "clienteId", u.nombre as "clienteNombre", u.apellido as "clienteApellido", u.email as "clienteEmail",
            r.nombre_contacto as "nombreContacto"
       from reserva r
       left join partido p on p.reserva_id = r.id
       left join torneo t on t.id = p.torneo_id
       left join usuario u on u.id = r.cliente_usuario_id
      where r.cancha_id = any($1) and r.fecha = $2 and r.estado in ('PENDIENTE', 'CONFIRMADA')
      order by r.hora_inicio`,
    [canchas.map((c) => c.id), fecha],
  )

  const esPersonal = rol === 'RECEPCIONISTA' || rol === 'ADMINISTRADOR'
  const verOcupacion = (r) => {
    if (rol === 'JUGADOR') return { horaInicio: r.horaInicio, horaFin: r.horaFin }
    const base = {
      reservaId: r.reservaId, tipo: r.tipo, estado: r.estado, horaInicio: r.horaInicio, horaFin: r.horaFin,
      partidoId: r.partidoId, torneo: r.torneo,
    }
    if (!esPersonal) return base
    const cliente = r.clienteId
      ? { id: r.clienteId, nombre: r.clienteNombre, apellido: r.clienteApellido, email: r.clienteEmail }
      : r.nombreContacto ? { id: null, nombre: r.nombreContacto, apellido: '', email: null } : null
    return { ...base, cliente, precioAplicado: r.precioAplicado === null ? null : Number(r.precioAplicado) }
  }

  return {
    fecha,
    fechaPasada: fecha < momento.fecha,
    horario: HORARIO,
    canchas: canchas.map((cancha) => {
      const ocupadas = rows.filter((r) => r.canchaId === cancha.id).map(verOcupacion)
      return {
        id: cancha.id,
        nombre: cancha.nombre,
        deporte: cancha.deporte,
        tipoSuperficie: cancha.tipoSuperficie,
        precioHora: cancha.precioHora,
        ocupadas,
        libres: franjasLibres(ocupadas),
        franjas: armarFranjas(ocupadas, fecha, momento, rol !== 'JUGADOR'),
      }
    }),
  }
}