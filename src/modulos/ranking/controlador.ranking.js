import { listarRanking } from './modelo.ranking.js'

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