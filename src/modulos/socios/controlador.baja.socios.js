import { buscarSocioPorId, darDeBajaSocio } from './modelo.socios.js'
import { buscarSocioDetalle } from './modelo.consulta.socios.js'

const REGEX_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// POST /api/socios/:id/baja  (CU 4.1 · A2, Recepcionista y Administrador)
// Pasa el socio a BAJA. No borra nada: el jugador conserva su cuenta, su ranking y todo el historial de cuotas. Las cuotas
// ya generadas siguen su curso y no se generan nuevas (la generación mensual solo toma socios ACTIVO).
export const darDeBaja = async (req, res) => {
  const { id } = req.params
  if (!REGEX_UUID.test(id)) return res.status(404).json({ mensaje: 'Socio no encontrado' })

  try {
    if (!(await buscarSocioPorId(id))) return res.status(404).json({ mensaje: 'Socio no encontrado' })

    // El update solo prospera si seguía ACTIVO: dos bajas a la vez no pasan las dos
    if (!(await darDeBajaSocio(id))) return res.status(409).json({ mensaje: 'El socio ya está dado de baja' })

    return res.status(200).json({ mensaje: 'Socio dado de baja', socio: await buscarSocioDetalle(id) })
  } catch (error) {
    console.error(error)
    return res.status(500).json({ mensaje: 'No se pudo dar de baja al socio' })
  }
}