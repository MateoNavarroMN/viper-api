import { pool } from '../config/conexion.bd.js'

const REGEX_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Cómo llegar al torneo desde el id que trae la ruta (`:id`). Cada consulta devuelve el estado del torneo.
const ESTADO_SEGUN_ORIGEN = {
  torneo: 'select estado from torneo where id = $1',
  partido: 'select t.estado from partido p join torneo t on t.id = p.torneo_id where p.id = $1',
  zona: 'select t.estado from zona z join torneo t on t.id = z.torneo_id where z.id = $1',
  inscripcion: 'select t.estado from inscripcion i join torneo t on t.id = i.torneo_id where i.id = $1',
}

// Guard de las rutas que escriben sobre un torneo (CU 3.8): un torneo ARCHIVADO es de solo lectura.
export const torneoModificable = (origen) => {
  const consulta = ESTADO_SEGUN_ORIGEN[origen]
  if (!consulta) throw new Error(`Origen de torneo desconocido: ${origen}`)

  return async (req, res, next) => {
    try {
      if (!REGEX_UUID.test(req.params.id)) return next()
      const { rows } = await pool.query(consulta, [req.params.id])
      if (rows[0]?.estado === 'ARCHIVADO') {
        return res.status(409).json({ mensaje: 'El torneo está archivado', estado: 'ARCHIVADO' })
      }
      return next()
    } catch (error) {
      console.error(error)
      return res.status(500).json({ mensaje: 'No se pudo verificar el estado del torneo' })
    }
  }
}