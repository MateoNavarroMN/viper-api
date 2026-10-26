import { registrarWO } from './modelo.resultado.partidos.js'

const REGEX_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const AUSENTES = ['LOCAL', 'VISITANTE', 'AMBOS']
const MOTIVOS = ['INASISTENCIA', 'BAJA', 'RETIRO', 'DESCALIFICACION']
const MAX_DETALLE = 200

// POST /api/partidos/:id/wo  (CU 3.7, Organizador y Administrador)
// Cuerpo: { ausente: 'LOCAL' | 'VISITANTE' | 'AMBOS', motivo: 'INASISTENCIA' | 'BAJA' | 'RETIRO' | 'DESCALIFICACION', detalle?: string }
// El partido queda en W.O. sin jugarse: el que no falta gana (con AMBOS no hay ganador) y se actualizan la tabla de la
// zona o el cuadro. 409 «El partido ya está resuelto» si ya tiene resultado o W.O.
export const wo = async (req, res) => {
  const { id } = req.params
  if (!REGEX_UUID.test(id)) return res.status(404).json({ mensaje: 'Partido no encontrado' })

  const { ausente, motivo, detalle } = req.body ?? {}
  if (!AUSENTES.includes(ausente)) {
    return res.status(400).json({ mensaje: 'Indicá quién causa la baja (LOCAL, VISITANTE o AMBOS)', campo: 'ausente' })
  }
  if (!MOTIVOS.includes(motivo)) {
    return res.status(400).json({ mensaje: 'Elegí el motivo de la baja', campo: 'motivo' })
  }
  if (detalle !== undefined && detalle !== null && typeof detalle !== 'string') {
    return res.status(400).json({ mensaje: 'El detalle tiene que ser un texto', campo: 'detalle' })
  }
  const detalleLimpio = typeof detalle === 'string' ? detalle.trim() : ''
  if (detalleLimpio.length > MAX_DETALLE) {
    return res.status(400).json({ mensaje: `El detalle no puede superar los ${MAX_DETALLE} caracteres`, campo: 'detalle' })
  }

  try {
    const r = await registrarWO(id, { ausente, motivo, detalle: detalleLimpio || null })
    if (r.resultado === 'NO_ENCONTRADO') return res.status(404).json({ mensaje: 'Partido no encontrado' })
    if (r.resultado === 'YA_RESUELTO') return res.status(409).json({ mensaje: 'El partido ya está resuelto' })
    if (r.resultado === 'NO_ADMITE') return res.status(409).json({ mensaje: 'El partido no admite registrar una baja' })
    const { resultado: _, ...datos } = r
    return res.status(200).json({ mensaje: 'Baja registrada', ...datos })
  } catch (error) {
    console.error(error)
    return res.status(500).json({ mensaje: 'No se pudo registrar la baja' })
  }
}