import { pool } from '../../config/conexion.bd.js'
import { bloquearTorneo, buscarTorneoPorId } from './modelo.torneos.js'
import { anularInscripcionesVencidas, buscarInscripcionPorId } from './modelo.inscripciones.js'

// Detalle de una inscripción y anulación en recepción (CU 3.2 · 7a, pantalla «Inscripciones» de la Recepción).

// Con el cuadro generado ya no se puede anular: sacaría a alguien de un cuadro armado
const ESTADOS_QUE_ADMITEN_ANULAR = ['INSCRIPCIONES_ABIERTAS', 'INSCRIPCIONES_CERRADAS']

// Por qué no se puede anular esta inscripción, o null si se puede. `torneo` e `inscripcion` son las filas de los modelos.
export const motivoSinAnular = (inscripcion, torneo) => {
  if (inscripcion.estado !== 'ACTIVA') return 'La inscripción ya está anulada'
  if (inscripcion.estadoPago === 'PAGADO') return 'La inscripción ya tiene el pago confirmado: el reembolso se gestiona fuera del sistema'
  if (!ESTADOS_QUE_ADMITEN_ANULAR.includes(torneo.estado)) return 'Solo se puede anular con las inscripciones abiertas o cerradas'
  return null
}

const persona = (id, nombre, apellido, dni, email, telefono) => (id ? { id, nombre, apellido, dni, email, telefono } : null)

// GET detalle: la inscripción con los datos de contacto de cada integrante y quién registró el pago.
// Devuelve { resultado: 'NO_ENCONTRADA' | 'OK', inscripcion, torneo, motivoSinAnular }.
export const obtenerDetalle = async (id) => {
  const previa = await buscarInscripcionPorId(id)
  if (!previa) return { resultado: 'NO_ENCONTRADA' }
  // Una pendiente vencida figura anulada: se ajusta antes de mostrar
  await anularInscripcionesVencidas(previa.torneoId)

  const { rows } = await pool.query(
    `select i.id, i.estado, i.estado_pago as "estadoPago", i.fecha_inscripcion::text as "fechaInscripcion", i.vence_en as "venceEn",
            i.fecha_pago as "fechaPago", i.cabeza_de_serie as "cabezaDeSerie",
            op.nombre as "operadorNombre", op.apellido as "operadorApellido",
            jt.id as "titularId", ut.nombre as "titularNombre", ut.apellido as "titularApellido", jt.dni as "titularDni",
            ut.email as "titularEmail", ut.telefono as "titularTelefono",
            jc.id as "companeroId", uc.nombre as "companeroNombre", uc.apellido as "companeroApellido", jc.dni as "companeroDni",
            uc.email as "companeroEmail", uc.telefono as "companeroTelefono"
       from inscripcion i
       join jugador jt on jt.id = i.titular_jugador_id
       join usuario ut on ut.id = jt.usuario_id
       left join jugador jc on jc.id = i.companero_jugador_id
       left join usuario uc on uc.id = jc.usuario_id
       left join usuario op on op.id = i.pago_registrado_por
      where i.id = $1`,
    [id]
  )
  const f = rows[0]
  const torneo = await buscarTorneoPorId(previa.torneoId)
  const inscripcion = {
    id: f.id,
    estado: f.estado,
    estadoPago: f.estadoPago,
    fechaInscripcion: f.fechaInscripcion,
    venceEn: f.venceEn,
    fechaPago: f.fechaPago,
    cabezaDeSerie: f.cabezaDeSerie,
    pagoRegistradoPor: f.operadorNombre ? { nombre: f.operadorNombre, apellido: f.operadorApellido } : null,
    titular: persona(f.titularId, f.titularNombre, f.titularApellido, f.titularDni, f.titularEmail, f.titularTelefono),
    companero: persona(f.companeroId, f.companeroNombre, f.companeroApellido, f.companeroDni, f.companeroEmail, f.companeroTelefono),
  }
  return {
    resultado: 'OK',
    inscripcion,
    torneo: {
      id: torneo.id,
      nombre: torneo.nombre,
      estado: torneo.estado,
      disciplina: torneo.disciplina,
      formato: torneo.formato,
      precioInscripcion: torneo.precioInscripcion,
    },
    motivoSinAnular: motivoSinAnular({ estado: f.estado, estadoPago: f.estadoPago }, torneo),
  }
}

// POST anular: solo una inscripción ACTIVA con el pago PENDIENTE y con el torneo sin cuadro. Libera el cupo.
// Corre en una transacción con el torneo bloqueado, así no se pisa con un pago, un cierre o la generación del cuadro.
// Devuelve { resultado: 'NO_ENCONTRADA' | 'NO_SE_PUEDE' (motivo) | 'OK', inscripcion? }.
export const anularEnRecepcion = async (id) => {
  const previa = await buscarInscripcionPorId(id)
  if (!previa) return { resultado: 'NO_ENCONTRADA' }

  const cliente = await pool.connect()
  try {
    await cliente.query('begin')
    await bloquearTorneo(previa.torneoId, cliente)
    await anularInscripcionesVencidas(previa.torneoId, cliente)
    const actual = await buscarInscripcionPorId(id, cliente)
    const torneo = await buscarTorneoPorId(previa.torneoId, cliente)
    const motivo = motivoSinAnular(actual, torneo)
    if (!motivo) await cliente.query("update inscripcion set estado = 'ANULADA' where id = $1", [id])
    // Se confirma siempre: si se anuló una vencida, esa anulación tiene que quedar guardada
    await cliente.query('commit')
    return motivo ? { resultado: 'NO_SE_PUEDE', motivo } : { resultado: 'OK', inscripcion: await buscarInscripcionPorId(id) }
  } catch (error) {
    await cliente.query('rollback')
    throw error
  } finally {
    cliente.release()
  }
}