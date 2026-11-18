import { pool } from '../../config/conexion.bd.js'
import { DURACION_TURNO_MINUTOS, expirarVencidas, listarCanchas } from '../reservas/modelo.reservas.js'
import { HORARIO } from '../torneos/scheduler.torneos.js'
import { pareja } from '../calendario/modelo.calendario.js'
import { estadosVisibles } from '../torneos/acciones.torneos.js'

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
// de torneo de 90 minutos ocupa dos turnos), PASADO si ya terminó (o si el día ya pasó) y no tuvo reserva, y LIBRE en cualquier
// otro caso. Un turno ocupado sigue figurando OCUPADO aunque ya haya pasado: así en un día pasado se ve qué se reservó.
const armarFranjas = (ocupadas, fecha, ahora, conDetalle) => {
  const fechaPasada = fecha < ahora.fecha
  const franjas = []
  const cierre = aMinutos(HORARIO.hasta)
  for (let inicio = aMinutos(HORARIO.desde); inicio + DURACION_TURNO_MINUTOS <= cierre; inicio += DURACION_TURNO_MINUTOS) {
    const fin = inicio + DURACION_TURNO_MINUTOS
    const pisadas = ocupadas.filter((o) => aMinutos(o.horaInicio) < fin && aMinutos(o.horaFin) > inicio)
    const pasada = fechaPasada || (fecha === ahora.fecha && fin <= aMinutos(ahora.hora))
    const franja = { horaInicio: aHora(inicio), horaFin: aHora(fin), estado: pisadas.length ? 'OCUPADA' : pasada ? 'PASADA' : 'LIBRE' }
    if (conDetalle && pisadas.length) franja.ocupaciones = pisadas
    franjas.push(franja)
  }
  return franjas
}

//   JUGADOR                  → solo el horario
//   ORGANIZADOR              → además reserva, tipo (OCASIONAL = alquiler, FIJA, TORNEO), estado y, si es de un torneo, cuál y
//                              entre quiénes juegan (sin datos del cliente)
//   RECEPCIONISTA / ADMIN.   → además el cliente, el precio aplicado y, si es de un alquiler fijo, el contrato
// Un torneo que todavía se está armando (PLANIFICADO) no lo ve el Recepcionista: su franja figura ocupada, sin decir de qué torneo es.
export const disponibilidadDelDia = async (disciplina, fecha, rol = 'ORGANIZADOR', db = pool, ahora = null) => {
  // Antes de leer: las pendientes con el plazo vencido dejan la franja libre
  await expirarVencidas(db)
  const momento = ahora ?? (await ahoraEnCordoba(db))
  const canchas = await listarCanchas(disciplina, db)
 const { rows } = await db.query(
    `select r.cancha_id as "canchaId", r.id as "reservaId", r.tipo, r.estado,
            to_char(r.hora_inicio, 'HH24:MI') as "horaInicio", to_char(r.hora_fin, 'HH24:MI') as "horaFin",
            r.precio_aplicado as "precioAplicado",
            p.id as "partidoId", t.id as "torneoId", t.nombre as torneo, t.estado as "torneoEstado", r.reserva_fija_id as "contratoId",
            ul.nombre as "localNombre", ul.apellido as "localApellido", ulc.nombre as "localCompaneroNombre", ulc.apellido as "localCompaneroApellido",
            uv.nombre as "visitanteNombre", uv.apellido as "visitanteApellido", uvc.nombre as "visitanteCompaneroNombre", uvc.apellido as "visitanteCompaneroApellido",
            u.id as "clienteId", u.nombre as "clienteNombre", u.apellido as "clienteApellido", u.email as "clienteEmail",
            r.nombre_contacto as "nombreContacto"
       from reserva r
       left join partido p on p.reserva_id = r.id
       left join torneo t on t.id = p.torneo_id
       left join inscripcion il on il.id = p.local_inscripcion_id
       left join jugador jl on jl.id = il.titular_jugador_id
       left join usuario ul on ul.id = jl.usuario_id
       left join jugador jlc on jlc.id = il.companero_jugador_id
       left join usuario ulc on ulc.id = jlc.usuario_id
       left join inscripcion iv on iv.id = p.visitante_inscripcion_id
       left join jugador jv on jv.id = iv.titular_jugador_id
       left join usuario uv on uv.id = jv.usuario_id
       left join jugador jvc on jvc.id = iv.companero_jugador_id
       left join usuario uvc on uvc.id = jvc.usuario_id
       left join usuario u on u.id = r.cliente_usuario_id
      where r.cancha_id = any($1) and r.fecha = $2 and r.estado in ('PENDIENTE', 'CONFIRMADA')
      order by r.hora_inicio`,
    [canchas.map((c) => c.id), fecha],
  )

  const esPersonal = rol === 'RECEPCIONISTA' || rol === 'ADMINISTRADOR'
  const verOcupacion = (r) => {
    if (rol === 'JUGADOR') return { horaInicio: r.horaInicio, horaFin: r.horaFin }
    // Del torneo y sus rivales solo se informa lo que el rol puede ver (A1): el resto de la franja igual figura ocupada
    const verTorneo = r.torneoEstado && estadosVisibles(rol).includes(r.torneoEstado)
    const rival = (lado) => (verTorneo && r[`${lado}Apellido`]
      ? pareja(r[`${lado}Nombre`], r[`${lado}Apellido`], r[`${lado}CompaneroNombre`], r[`${lado}CompaneroApellido`])
      : null)
    const base = {
      reservaId: r.reservaId, tipo: r.tipo, estado: r.estado, horaInicio: r.horaInicio, horaFin: r.horaFin,
      partidoId: verTorneo ? r.partidoId : null, torneoId: verTorneo ? r.torneoId : null, torneo: verTorneo ? r.torneo : null,
      local: rival('local'), visitante: rival('visitante'),
    }
    if (!esPersonal) return base
    const cliente = r.clienteId
      ? { id: r.clienteId, nombre: r.clienteNombre, apellido: r.clienteApellido, email: r.clienteEmail }
      : r.nombreContacto ? { id: null, nombre: r.nombreContacto, apellido: '', email: null } : null
    return { ...base, contratoId: r.contratoId, cliente, precioAplicado: r.precioAplicado === null ? null : Number(r.precioAplicado) }
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

// ── Canchas y tarifas (solo Administrador) ────────────────────────────────────────────────────────────────────────

export const SELECT_CANCHAS = `
  select c.id, c.nombre, c.deporte, c.tipo_superficie as "tipoSuperficie", c.precio_hora as "precioHora", c.activa,
         (select count(*)::int from reserva r
           where r.cancha_id = c.id and r.estado in ('PENDIENTE', 'CONFIRMADA')
             and (r.fecha + r.hora_inicio) at time zone 'America/Argentina/Cordoba' > now()) as "reservasFuturas"
    from cancha c`

const aCancha = (fila) => ({ ...fila, precioHora: Number(fila.precioHora) })

// Todas las canchas, activas e inactivas, con las reservas pendientes o confirmadas que todavía no empezaron (alquileres fijos y
// partidos de torneo incluidos). Tenis antes que Pádel y, dentro de cada deporte, por nombre. Primero se vencen las pendientes
// sin pago para que no cuenten como futuras.
export const listarTodasLasCanchas = async (db = pool) => {
  await expirarVencidas(db)
  const { rows } = await db.query(`${SELECT_CANCHAS} order by c.deporte, c.nombre`)
  return rows.map(aCancha)
}