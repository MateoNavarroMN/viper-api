import { pool } from '../../config/conexion.bd.js'
import { sinTildes } from '../usuarios/modelo.consulta.usuarios.js'
import { columnaNormalizada, escaparLike } from '../productos/modelo.productos.js'
import { expirarVencidas } from '../reservas/modelo.reservas.js'
import { anularInscripcionesVencidas } from '../torneos/modelo.inscripciones.js'

// Orígenes pendientes de cobro de un cliente (CU 5.3, paso 6): las reservas, inscripciones y cuotas que todavía se pueden
// cobrar en recepción. Solo lectura sobre los datos, pero antes de consultar se vencen las reservas y las inscripciones cuyo
// plazo de pago ya pasó (enfoque «perezoso» del plan, sin cron): lo vencido no aparece como cobrable.

export const MAXIMO_CLIENTES = 10

// Clientes que coinciden con lo escrito: cada palabra tiene que aparecer en el nombre, el apellido o el DNI (sin
// mayúsculas, tildes ni puntos). Se piden uno más que el máximo para saber si hay más.
const buscarClientes = async (q, db) => {
  const condiciones = []
  const valores = []
  const agregar = (valor) => {
    valores.push(valor)
    return `$${valores.length}`
  }
  for (const palabra of sinTildes(q).split(/\s+/).filter(Boolean)) {
    const patron = agregar(`%${escaparLike(palabra)}%`)
    const soloDigitos = palabra.replace(/\./g, '')
    const porDni = soloDigitos ? ` or j.dni like ${agregar(`%${escaparLike(soloDigitos)}%`)}` : ''
    condiciones.push(`(${columnaNormalizada('u.nombre')} like ${patron} or ${columnaNormalizada('u.apellido')} like ${patron}${porDni})`)
  }
  const { rows } = await db.query(
    `select u.id, u.nombre, u.apellido, j.dni
       from usuario u left join jugador j on j.usuario_id = u.id
      where ${condiciones.join(' and ')}
      order by u.apellido, u.nombre, u.id
      limit ${agregar(MAXIMO_CLIENTES + 1)}`,
    valores
  )
  return rows
}

// Cada origen sale con la misma forma: { tipo, id, descripcion, monto, venceEn, vencida }. `venceEn` es el momento límite de
// pago (reservas e inscripciones) o el día de vencimiento de la cuota; `vencida` solo puede ser true en una cuota (las
// reservas y las inscripciones vencidas ya se descartaron).
const reservasPendientes = async (ids, db) => {
  const { rows } = await db.query(
    `select r.cliente_usuario_id as "clienteId", r.id, c.nombre as cancha, to_char(r.fecha, 'DD/MM/YYYY') as fecha,
            to_char(r.hora_inicio, 'HH24:MI') as inicio, to_char(r.hora_fin, 'HH24:MI') as fin,
            r.precio_aplicado as monto, r.expiracion_pago as "venceEn"
       from reserva r join cancha c on c.id = r.cancha_id
      where r.cliente_usuario_id = any($1) and r.estado = 'PENDIENTE' and r.tipo = 'OCASIONAL' and r.precio_aplicado > 0
      order by r.fecha, r.hora_inicio, r.id`,
    [ids]
  )
  return rows.map((r) => ({
    clienteId: r.clienteId,
    tipo: 'RESERVA',
    id: r.id,
    descripcion: `${r.cancha} · ${r.fecha} de ${r.inicio} a ${r.fin}`,
    monto: Number(r.monto),
    venceEn: r.venceEn,
    vencida: false,
  }))
}

// La inscripción se cobra al titular (quien se inscribió): en Pádel, la pareja figura en la descripción
const inscripcionesPendientes = async (ids, db) => {
  const { rows } = await db.query(
    `select jt.usuario_id as "clienteId", i.id, tor.nombre as torneo, uc.nombre || ' ' || uc.apellido as companero,
            tor.precio_inscripcion as monto, i.vence_en as "venceEn"
       from inscripcion i
       join torneo tor on tor.id = i.torneo_id
       join jugador jt on jt.id = i.titular_jugador_id
       left join jugador jc on jc.id = i.companero_jugador_id
       left join usuario uc on uc.id = jc.usuario_id
      where jt.usuario_id = any($1) and i.estado = 'ACTIVA' and i.estado_pago = 'PENDIENTE' and tor.precio_inscripcion > 0
      order by tor.fecha_inicio, i.id`,
    [ids]
  )
  return rows.map((r) => ({
    clienteId: r.clienteId,
    tipo: 'INSCRIPCION',
    id: r.id,
    descripcion: `${r.torneo}${r.companero ? ` · con ${r.companero}` : ''}`,
    monto: Number(r.monto),
    venceEn: r.venceEn,
    vencida: false,
  }))
}

// Las cuotas pendientes se cobran aunque estén vencidas (el socio adeudado viene justamente a ponerse al día)
const cuotasPendientes = async (ids, db) => {
  const { rows } = await db.query(
    `select j.usuario_id as "clienteId", q.id, q.mes, q.anio, q.monto, q.fecha_vencimiento::text as "venceEn",
            q.fecha_vencimiento < current_date as vencida
       from cuota_mensual q join socio s on s.id = q.socio_id join jugador j on j.id = s.jugador_id
      where j.usuario_id = any($1) and q.estado_pago = 'PENDIENTE'
      order by q.anio, q.mes, q.id`,
    [ids]
  )
  return rows.map((r) => ({
    clienteId: r.clienteId,
    tipo: 'CUOTA',
    id: r.id,
    descripcion: `Cuota ${String(r.mes).padStart(2, '0')}/${r.anio}`,
    monto: Number(r.monto),
    venceEn: r.venceEn,
    vencida: r.vencida,
  }))
}

// Devuelve { clientes: [{ id, nombre, apellido, dni, origenes: [...] }], hayMas }. Los clientes que tienen algo para cobrar van
// primero. `concepto` ('RESERVA' | 'INSCRIPCION' | 'CUOTA') limita los orígenes a ese tipo. Un cliente sin pendientes se
// devuelve igual, con `origenes: []`: así la pantalla puede decir «no tiene nada pendiente» en vez de «no existe».
export const buscarOrigenesPendientes = async ({ q, concepto }, db = pool) => {
  await expirarVencidas(db)
  await anularInscripcionesVencidas(null, db)

  const encontrados = await buscarClientes(q, db)
  const hayMas = encontrados.length > MAXIMO_CLIENTES
  const clientes = encontrados.slice(0, MAXIMO_CLIENTES)
  if (clientes.length === 0) return { clientes: [], hayMas: false }

  const ids = clientes.map((c) => c.id)
  const consultas = []
  if (!concepto || concepto === 'RESERVA') consultas.push(reservasPendientes(ids, db))
  if (!concepto || concepto === 'INSCRIPCION') consultas.push(inscripcionesPendientes(ids, db))
  if (!concepto || concepto === 'CUOTA') consultas.push(cuotasPendientes(ids, db))
  const origenes = (await Promise.all(consultas)).flat()

  const resultado = clientes.map((c) => ({
    id: c.id,
    nombre: c.nombre,
    apellido: c.apellido,
    dni: c.dni,
    origenes: origenes.filter((o) => o.clienteId === c.id).map(({ clienteId, ...origen }) => origen),
  }))
  // Primero quienes tienen algo para cobrar; el resto conserva su orden alfabético
  resultado.sort((a, b) => Number(b.origenes.length > 0) - Number(a.origenes.length > 0))
  return { clientes: resultado, hayMas }
}