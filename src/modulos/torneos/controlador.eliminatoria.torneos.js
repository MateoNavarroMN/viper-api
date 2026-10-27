import { generarFaseEliminatoria, regenerarFaseEliminatoria } from './modelo.eliminatoria.torneos.js'

const REGEX_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const noEncontrado = (res) => res.status(404).json({ mensaje: 'Torneo no encontrado' })

const conTorneo = (accion, mensajeError) => async (req, res) => {
  if (!REGEX_UUID.test(req.params.id)) return noEncontrado(res)
  try {
    return await accion(req, res)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ mensaje: mensajeError })
  }
}

// POST /api/torneos/:id/fase-eliminatoria  (CU 3.9 · pasos 2 a 6, Organizador y Administrador)
// Arma la llave con los que clasificaron de cada zona, la guarda, programa la primera ronda y pasa el torneo a la fase ELIMINATORIA.
export const generar = conTorneo(async (req, res) => {
  const { resultado, ...datos } = await generarFaseEliminatoria(req.params.id)
  if (resultado === 'NO_ENCONTRADO') return noEncontrado(res)
  if (resultado === 'FORMATO_INVALIDO') {
    return res.status(409).json({ mensaje: 'La fase eliminatoria solo existe en los torneos con zonas', formato: datos.formato })
  }
  if (resultado === 'ESTADO_INVALIDO') return res.status(409).json({ mensaje: 'El torneo no está en curso', estado: datos.estado })
  if (resultado === 'FASE_INVALIDA') {
    return res.status(409).json({ mensaje: 'La fase eliminatoria ya fue generada', faseActual: datos.faseActual })
  }
  if (resultado === 'ZONAS_PENDIENTES') {
    return res.status(409).json({ mensaje: 'Hay zonas con partidos pendientes', zonasPendientes: datos.zonas })
  }
  if (resultado === 'EMPATE_SIN_RESOLVER') {
    return res.status(409).json({ mensaje: 'Empate sin resolver', zonasConEmpate: datos.zonas })
  }
  if (resultado === 'INSUFICIENTES') {
    return res.status(409).json({ mensaje: 'Hacen falta al menos 2 clasificados', clasificados: datos.clasificados })
  }
  return res.status(200).json({
    mensaje: datos.partidosSinProgramar.length > 0
      ? 'Fase eliminatoria generada: hay partidos sin programar para reprogramar a mano'
      : 'Fase eliminatoria generada',
    torneo: datos.torneo,
    tamano: datos.tamano,
    byes: datos.byes,
    partidos: datos.partidos,
    clasificados: datos.clasificados,
    conflictos: datos.conflictos,
    partidosSinProgramar: datos.partidosSinProgramar,
  })
}, 'No se pudo generar la fase eliminatoria')

// POST /api/torneos/:id/fase-eliminatoria/regenerar  (CU 3.9 · 8a)
// Deshace la fase eliminatoria si todavía no tiene resultados y vuelve a la fase de zonas.
export const regenerar = conTorneo(async (req, res) => {
  const { resultado, ...datos } = await regenerarFaseEliminatoria(req.params.id)
  if (resultado === 'NO_ENCONTRADO') return noEncontrado(res)
  if (resultado === 'ESTADO_INVALIDO') return res.status(409).json({ mensaje: 'El torneo no está en curso', estado: datos.estado })
  if (resultado === 'SIN_ELIMINATORIA') {
    return res.status(409).json({ mensaje: 'El torneo no tiene una fase eliminatoria para regenerar', faseActual: datos.faseActual })
  }
  if (resultado === 'CON_RESULTADOS') return res.status(409).json({ mensaje: 'La fase eliminatoria ya tiene resultados' })
  return res.status(200).json({
    mensaje: 'Fase eliminatoria eliminada: el torneo vuelve a la fase de zonas',
    torneo: datos.torneo,
    partidosEliminados: datos.partidosEliminados,
    reservasCanceladas: datos.reservasCanceladas,
  })
}, 'No se pudo regenerar la fase eliminatoria')