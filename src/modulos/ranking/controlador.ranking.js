import { listarRanking, obtenerDetalleRanking } from './modelo.ranking.js'

const DISCIPLINAS = ['TENIS', 'PADEL']
const REGEX_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// GET /api/ranking/:disciplina?categoriaId=  (CU 3.6, cualquier usuario autenticado)
// Responde { disciplina, ranking: [{ posicion, jugador, puntos, categoria }] }, de más a menos puntos.
export const listar = async (req, res) => {
  const disciplina = req.params.disciplina.toUpperCase()
  if (!DISCIPLINAS.includes(disciplina)) {
    return res.status(400).json({ mensaje: 'La disciplina debe ser TENIS o PADEL', campo: 'disciplina' })
  }
  const { categoriaId } = req.query
  if (categoriaId !== undefined && !REGEX_UUID.test(String(categoriaId))) {
    return res.status(400).json({ mensaje: 'La categoría no es válida', campo: 'categoriaId' })
  }

  try {
    return res.status(200).json({ disciplina, ranking: await listarRanking(disciplina, { categoriaId }) })
  } catch (error) {
    console.error(error)
    return res.status(500).json({ mensaje: 'No se pudo obtener el ranking' })
  }
}

// GET /api/ranking/:disciplina/jugadores/:jugadorId  (CU 4.4 · pasos 7 y 8, cualquier usuario autenticado)
// Responde { disciplina, jugador, posicion, puntosTotales, categoria: { nombre, puntosMinimos, puntosMaximos }, movimientos }.
// Los movimientos van del más nuevo al más viejo; los revertidos traen `revertido: true` y no suman a los puntos totales.
export const detalle = async (req, res) => {
  const disciplina = req.params.disciplina.toUpperCase()
  if (!DISCIPLINAS.includes(disciplina)) {
    return res.status(400).json({ mensaje: 'La disciplina debe ser TENIS o PADEL', campo: 'disciplina' })
  }
  const { jugadorId } = req.params
  if (!REGEX_UUID.test(jugadorId)) {
    return res.status(400).json({ mensaje: 'El jugador no es válido', campo: 'jugadorId' })
  }

  try {
    const datos = await obtenerDetalleRanking(disciplina, jugadorId)
    if (!datos) return res.status(404).json({ mensaje: 'El jugador no figura en este ranking' })
    return res.status(200).json(datos)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ mensaje: 'No se pudo obtener el detalle del jugador' })
  }
}