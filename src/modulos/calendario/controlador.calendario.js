import { estadosVisibles } from '../torneos/acciones.torneos.js'
import { partidosDelPeriodo, torneosDelPeriodo } from './modelo.calendario.js'

const REGEX_FECHA = /^\d{4}-\d{2}-\d{2}$/
const MAX_DIAS = 62

const esFecha = (texto) => REGEX_FECHA.test(texto ?? '') && new Date(`${texto}T00:00:00Z`).toISOString().slice(0, 10) === texto

// GET /api/calendario?desde=YYYY-MM-DD&hasta=YYYY-MM-DD  (Recepcionista, Organizador y Administrador)
// Los torneos del período y los partidos programados. El Recepcionista no ve los torneos que todavía se están armando.
export const calendario = async (req, res) => {
  const { desde, hasta } = req.query
  if (!esFecha(desde) || !esFecha(hasta) || hasta < desde) {
    return res.status(400).json({ mensaje: 'Indicá un período válido: desde y hasta con formato AAAA-MM-DD' })
  }
  if ((Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / 86400000 > MAX_DIAS) {
    return res.status(400).json({ mensaje: `El período no puede superar los ${MAX_DIAS} días` })
  }
  try {
    const estados = estadosVisibles(req.usuario.rol)
    const [torneos, partidos] = await Promise.all([torneosDelPeriodo(desde, hasta, estados), partidosDelPeriodo(desde, hasta, estados)])
    return res.status(200).json({ desde, hasta, torneos, partidos })
  } catch (error) {
    console.error(error)
    return res.status(500).json({ mensaje: 'No se pudo obtener el calendario' })
  }
}