import { buscarEnCartelera, cuotasDelJugador, listarCartelera, proximosPartidos, rankingDelJugador, torneosEnCurso } from './modelo.portal.js'

const LIMITE_POR_DEFECTO = 10
const LIMITE_MAXIMO = 50
const REGEX_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Cada bloque del portal es un endpoint propio: si uno falla, el resto sigue funcionando. Siempre se usa el jugador de la
// sesión (req.usuario.jugador_id), nunca un id recibido por URL.
const bloque = (leer, mensajeDeError) => async (req, res) => {
  try {
    return res.status(200).json(await leer(req.usuario.jugador_id))
  } catch (error) {
    console.error(error)
    return res.status(500).json({ mensaje: mensajeDeError })
  }
}

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

// GET /api/portal/ranking  → { ranking: [{ disciplina, participa, posicion, puntos, categoria, sinPuntos }] }
export const ranking = bloque(async (jugadorId) => ({ ranking: await rankingDelJugador(jugadorId) }), 'No se pudo obtener el ranking')

// GET /api/portal/partidos  → { partidos: [...] } (lista vacía si no tiene)
export const partidos = bloque(async (jugadorId) => ({ partidos: await proximosPartidos(jugadorId) }), 'No se pudieron obtener los próximos partidos')

// GET /api/portal/torneos  → { torneos: [...] } (lista vacía si no juega ninguno)
export const torneos = bloque(async (jugadorId) => ({ torneos: await torneosEnCurso(jugadorId) }), 'No se pudieron obtener los torneos en curso')

// GET /api/portal/cuotas  → { esSocio: false } o { esSocio: true, situacion, montoAdeudado, pendientes, historial, pagoEnLinea }
export const cuotas = bloque(cuotasDelJugador, 'No se pudieron obtener las cuotas')