import { buscarEnCartelera, listarCartelera } from './modelo.portal.js'

const LIMITE_POR_DEFECTO = 10
const LIMITE_MAXIMO = 50
const REGEX_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// GET /api/portal/comunicados?limite=  → { comunicados: [{ id, titulo, alcance, fechaPublicacion, extracto, hayMas }], total }
export const cartelera = async (req, res) => {
  const { limite } = req.query
  if (limite !== undefined && !(typeof limite === 'string' && /^\d{1,3}$/.test(limite) && Number(limite) >= 1 && Number(limite) <= LIMITE_MAXIMO)) {
    return res.status(400).json({ mensaje: `Parámetro inválido: el límite debe estar entre 1 y ${LIMITE_MAXIMO}`, campo: 'limite' })
  }
  try {
    return res.status(200).json(await listarCartelera(req.usuario.jugador_id, limite === undefined ? LIMITE_POR_DEFECTO : Number(limite)))
  } catch (error) {
    console.error(error)
    return res.status(500).json({ mensaje: 'No se pudieron obtener los comunicados' })
  }
}

// GET /api/portal/comunicados/:id  → { comunicado } con el texto completo; 404 si no existe, está retirado o no es para él
export const comunicado = async (req, res) => {
  const { id } = req.params
  if (!REGEX_UUID.test(id)) return res.status(404).json({ mensaje: 'Comunicado no encontrado' })
  try {
    const encontrado = await buscarEnCartelera(req.usuario.jugador_id, id)
    return encontrado ? res.status(200).json({ comunicado: encontrado }) : res.status(404).json({ mensaje: 'Comunicado no encontrado' })
  } catch (error) {
    console.error(error)
    return res.status(500).json({ mensaje: 'No se pudo obtener el comunicado' })
  }
}